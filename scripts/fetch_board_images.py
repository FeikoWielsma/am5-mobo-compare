"""
Automated motherboard PCB image fetcher and asset generator.

Scrapes high-resolution motherboard PCB photos from manufacturer websites
using anti-ban measures:
  - curl_cffi browser TLS & cipher impersonation (Chrome 124)
  - Concurrent independent domain workers (ASRock, ASUS, Gigabyte, MSI, Biostar, etc. run in parallel)
  - Adaptive per-domain pacing and exponential backoff
  - Direct static CDN resolution (ASRock)
  - Full-size WebP (1200px max, quality 85) & thumbnail (240px max, quality 80) generation
  - Thread-safe caching manifest tracking

Outputs:
  - static/img/boards/{id}_board.webp
  - static/img/boards/{id}_board_thumb.webp
  - static/img/boards/manifest.json
"""

from __future__ import annotations

import argparse
import concurrent.futures
import io
import json
import logging
import os
import random
import re
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import quote, unquote, urljoin, urlparse

from PIL import Image

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("fetch_board_images")

DEFAULT_OUTPUT_DIR = os.path.join("static", "img", "boards")
MANIFEST_FILENAME = "manifest.json"

# Common negative terms to reject dummy/placeholder/icon images
IGNORED_IMAGE_PATTERNS = [
    r"logo",
    r"icon",
    r"banner",
    r"footer",
    r"header",
    r"nav",
    r"button",
    r"badge",
    r"social",
    r"facebook",
    r"twitter",
    r"instagram",
    r"youtube",
    r"avatar",
    r"flag",
    r"blank\.",
    r"placeholder",
    r"biostar_logo",
]


class DomainPacer:
    """Tracks and enforces delays between requests to the same domain."""

    def __init__(self, base_delay: float = 1.5, max_delay: float = 30.0):
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.last_hit: dict[str, float] = {}
        self.current_delays: dict[str, float] = defaultdict(lambda: base_delay)

    def pace(self, domain: str) -> None:
        """Sleep if needed to respect the domain rate limit."""
        if not domain:
            return
        last = self.last_hit.get(domain, 0.0)
        target_delay = self.current_delays[domain]
        elapsed = time.time() - last
        if elapsed < target_delay:
            jitter = random.uniform(0.1, 0.4)
            sleep_time = (target_delay - elapsed) + jitter
            time.sleep(sleep_time)
        self.last_hit[domain] = time.time()

    def backoff(self, domain: str) -> None:
        """Increase delay on 429/503 rate-limiting responses."""
        curr = self.current_delays[domain]
        new_delay = min(curr * 2.0, self.max_delay)
        self.current_delays[domain] = new_delay
        logger.warning("Backoff triggered for domain %s: delay now %.1fs", domain, new_delay)
        time.sleep(new_delay)

    def reset_backoff(self, domain: str) -> None:
        """Reset domain delay to base delay after successful response."""
        if domain in self.current_delays and self.current_delays[domain] > self.base_delay:
            self.current_delays[domain] = self.base_delay


def extract_meta_image(html_text: str, base_url: str) -> Optional[str]:
    """Extract og:image or twitter:image from HTML."""
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
    ]
    for pat in patterns:
        matches = re.findall(pat, html_text, re.IGNORECASE)
        for m in matches:
            m = m.strip()
            if not m:
                continue
            if any(re.search(neg, m, re.IGNORECASE) for neg in IGNORED_IMAGE_PATTERNS):
                continue
            return urljoin(base_url, m)
    return None


class ThreadSafeManifest:
    """Manages thread-safe manifest persistence."""

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        self.manifest_path = os.path.join(output_dir, MANIFEST_FILENAME)
        self.lock = threading.Lock()
        self.data: dict[str, Any] = self._load()

    def _load(self) -> dict[str, Any]:
        if os.path.exists(self.manifest_path):
            try:
                with open(self.manifest_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning("Could not read manifest, starting fresh: %s", e)
        return {}

    def get(self, board_id: str) -> Optional[dict[str, Any]]:
        with self.lock:
            return self.data.get(board_id)

    def record(self, board_id: str, entry: dict[str, Any]) -> None:
        with self.lock:
            self.data[board_id] = entry
            self._save()

    def _save(self) -> None:
        os.makedirs(self.output_dir, exist_ok=True)
        tmp_path = f"{self.manifest_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, self.manifest_path)


class BoardImageFetcher:
    """Worker instance responsible for fetching and converting board photos."""

    def __init__(
        self,
        output_dir: str = DEFAULT_OUTPUT_DIR,
        manifest: Optional[ThreadSafeManifest] = None,
        base_delay: float = 1.5,
        impersonate: str = "chrome124",
        force: bool = False,
        dry_run: bool = False,
    ):
        self.output_dir = output_dir
        self.manifest = manifest or ThreadSafeManifest(output_dir)
        self.pacer = DomainPacer(base_delay=base_delay)
        self.impersonate = impersonate
        self.force = force
        self.dry_run = dry_run

        if cffi_requests is None:
            raise RuntimeError("curl_cffi is required. Install via: uv add curl-cffi")
        self.session = cffi_requests.Session(impersonate=self.impersonate)

    def should_skip(self, board_id: str) -> bool:
        """Check if board already has successfully downloaded webp assets."""
        if self.force:
            return False
        board_file = os.path.join(self.output_dir, f"{board_id}_board.webp")
        thumb_file = os.path.join(self.output_dir, f"{board_id}_board_thumb.webp")
        if os.path.exists(board_file) and os.path.exists(thumb_file):
            return True
        entry = self.manifest.get(board_id)
        if entry and entry.get("status") == "success" and os.path.exists(board_file):
            return True
        return False

    def find_asrock_image_url(self, board: dict[str, Any]) -> Optional[str]:
        """
        ASRock serves board photos directly on static CDN bypassing Incapsula HTML bot protection.
        Pattern: https://www.asrock.com/mb/photo/{model}(L1).png
        """
        url = board.get("typed", {}).get("website_url") or board.get("specs", {}).get("Links", {}).get("Website", "")
        model_name = board.get("model", "")

        model_from_url = ""
        if url:
            parts = url.split("/")
            if "AMD" in parts:
                idx = parts.index("AMD")
                if idx + 1 < len(parts):
                    model_from_url = unquote(parts[idx + 1])

        candidates = []
        if model_from_url:
            candidates.extend([
                f"https://www.asrock.com/mb/photo/{quote(model_from_url)}(L1).png",
                f"https://www.asrock.com/mb/photo/{quote(model_from_url)}(L2).png",
                f"https://www.asrock.com/mb/photo/{quote(model_from_url)}(m).png",
            ])
        if model_name:
            candidates.extend([
                f"https://www.asrock.com/mb/photo/{quote(model_name)}(L1).png",
                f"https://www.asrock.com/mb/photo/{quote(model_name)}(L2).png",
                f"https://www.asrock.com/mb/photo/{quote(model_name)}(m).png",
            ])

        domain = "asrock.com"
        for cand_url in candidates:
            try:
                self.pacer.pace(domain)
                resp = self.session.head(cand_url, timeout=8)
                if resp.status_code == 200 and "image" in resp.headers.get("Content-Type", ""):
                    content_len = int(resp.headers.get("Content-Length", "0"))
                    if content_len > 15000:
                        return cand_url
            except Exception as e:
                logger.debug("ASRock candidate check failed %s: %s", cand_url, e)
        return None

    def find_biostar_image_url(self, url: str) -> Optional[str]:
        """Extract PCB photo from Biostar product introduction page."""
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        self.pacer.pace(domain)

        try:
            resp = self.session.get(url, timeout=15)
            if resp.status_code != 200:
                return None
            imgs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', resp.text, re.I)
            # Prefer top-down view
            top_imgs = [
                urljoin(url, img) for img in imgs
                if "upload/motherboard" in img.lower() and "top" in img.lower() and "box" not in img.lower()
            ]
            if top_imgs:
                # Prefer high-res 'b' prefix
                b_imgs = [i for i in top_imgs if "/b" in i.split("/")[-1]]
                return b_imgs[0] if b_imgs else top_imgs[0]

            # Fallback to other motherboard non-box images
            other_imgs = [
                urljoin(url, img) for img in imgs
                if "upload/motherboard" in img.lower() and "box" not in img.lower()
            ]
            if other_imgs:
                b_imgs = [i for i in other_imgs if "/b" in i.split("/")[-1]]
                return b_imgs[0] if b_imgs else other_imgs[0]
        except Exception as e:
            logger.debug("Failed Biostar search for %s: %s", url, e)

        return None

    def find_html_meta_image(self, url: str) -> Optional[str]:
        """Fetch page via curl_cffi and extract og:image or high-res product image."""
        if not url or not url.startswith("http"):
            return None

        parsed = urlparse(url)
        domain = parsed.netloc.lower()

        self.pacer.pace(domain)
        try:
            resp = self.session.get(url, timeout=15)
            if resp.status_code in (429, 503):
                self.pacer.backoff(domain)
                return None
            if resp.status_code != 200:
                logger.debug("HTTP %s for %s", resp.status_code, url)
                return None

            self.pacer.reset_backoff(domain)
            img_url = extract_meta_image(resp.text, url)
            if img_url:
                return img_url

            # Fallback for pages that store images in gallery or specific CDN patterns
            if "asus.com" in domain:
                asus_matches = re.findall(r'https://dlcdnwebimgs\.asus\.com/gain/[A-Za-z0-9\-]+', resp.text)
                if asus_matches:
                    return asus_matches[0]
            elif "gigabyte.com" in domain:
                giga_matches = re.findall(
                    r'https://static\.gigabyte\.com/StaticFile/Image/Global/[a-f0-9]+/Product[a-zA-Z0-9]+/\d+',
                    resp.text,
                )
                if giga_matches:
                    return giga_matches[0]
            elif "msi.com" in domain:
                msi_matches = re.findall(
                    r'https://storage-asset\.msi\.com/global/picture/product/[^"\'\s]+\.(?:webp|png|jpg)',
                    resp.text,
                )
                if msi_matches:
                    return msi_matches[0]

        except Exception as e:
            logger.debug("Failed to fetch HTML for %s: %s", url, e)

        return None

    def resolve_image_url(self, board: dict[str, Any]) -> Optional[str]:
        """Resolve high-res motherboard PCB image URL based on manufacturer brand."""
        brand = (board.get("brand") or "").strip().lower()
        url = board.get("typed", {}).get("website_url") or board.get("specs", {}).get("Links", {}).get("Website", "")

        if brand == "asrock":
            asrock_img = self.find_asrock_image_url(board)
            if asrock_img:
                return asrock_img

        if brand == "biostar" and url:
            biostar_img = self.find_biostar_image_url(url)
            if biostar_img:
                return biostar_img

        if url:
            return self.find_html_meta_image(url)

        return None

    def download_and_process_image(
        self, img_url: str, board_id: str
    ) -> Optional[dict[str, Any]]:
        """Download raw image, convert to WebP & thumbnail, and save to output directory."""
        parsed = urlparse(img_url)
        domain = parsed.netloc.lower()

        self.pacer.pace(domain)
        try:
            resp = self.session.get(img_url, timeout=20)
            if resp.status_code != 200 or not resp.content:
                logger.warning("Failed to download image %s (HTTP %s)", img_url, resp.status_code)
                return None

            img = Image.open(io.BytesIO(resp.content))

            width, height = img.size
            if width < 250 or height < 250:
                logger.warning("Image too small (%dx%d) for %s from %s", width, height, board_id, img_url)
                return None

            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                processed_img = img.convert("RGBA")
            else:
                processed_img = img.convert("RGB")

            # 1. Full-size board image (max 1200px)
            board_img = processed_img.copy()
            if max(board_img.size) > 1200:
                board_img.thumbnail((1200, 1200), Image.Resampling.LANCZOS)

            board_rel_path = f"{board_id}_board.webp"
            board_abs_path = os.path.join(self.output_dir, board_rel_path)
            board_img.save(board_abs_path, format="WEBP", quality=85, method=6)

            # 2. Thumbnail board image (max 240px)
            thumb_img = processed_img.copy()
            thumb_img.thumbnail((240, 240), Image.Resampling.LANCZOS)
            thumb_rel_path = f"{board_id}_board_thumb.webp"
            thumb_abs_path = os.path.join(self.output_dir, thumb_rel_path)
            thumb_img.save(thumb_abs_path, format="WEBP", quality=80, method=6)

            file_size = os.path.getsize(board_abs_path)
            thumb_size = os.path.getsize(thumb_abs_path)

            return {
                "file": board_rel_path,
                "thumb_file": thumb_rel_path,
                "width": board_img.width,
                "height": board_img.height,
                "file_size": file_size,
                "thumb_size": thumb_size,
            }

        except Exception as e:
            logger.error("Failed processing image for %s (%s): %s", board_id, img_url, e)
            return None

    def process_board(self, board: dict[str, Any], tag: str = "") -> str:
        """Process a single board. Returns status: 'success', 'skipped', 'not_found', 'error'."""
        board_id = board.get("id", "")
        brand = board.get("brand", "")
        model = board.get("model", "")

        if not board_id:
            return "error"

        if self.should_skip(board_id):
            logger.debug("[%s] Skipping already present: %s", tag or brand, board_id)
            return "skipped"

        url = board.get("typed", {}).get("website_url") or board.get("specs", {}).get("Links", {}).get("Website", "")
        logger.info("[%s] Resolving %s (%s)...", tag or brand, model, board_id)

        img_url = self.resolve_image_url(board)
        if not img_url:
            logger.info("  [%s] [-] No image found for %s", tag or brand, board_id)
            self.manifest.record(board_id, {
                "status": "not_found",
                "brand": brand,
                "model": model,
                "page_url": url,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return "not_found"

        logger.info("  [%s] [+] Found candidate: %s", tag or brand, img_url)

        if self.dry_run:
            return "success"

        result = self.download_and_process_image(img_url, board_id)
        if result:
            logger.info(
                "  [%s] [OK] Saved %s (%dx%d, %d KB)",
                tag or brand,
                result["file"],
                result["width"],
                result["height"],
                result["file_size"] // 1024,
            )
            self.manifest.record(board_id, {
                "status": "success",
                "brand": brand,
                "model": model,
                "image_url": img_url,
                "page_url": url,
                "file": result["file"],
                "thumb_file": result["thumb_file"],
                "width": result["width"],
                "height": result["height"],
                "size_bytes": result["file_size"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return "success"
        else:
            self.manifest.record(board_id, {
                "status": "error",
                "brand": brand,
                "model": model,
                "image_url": img_url,
                "page_url": url,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return "error"


def run_domain_worker(
    domain_key: str,
    boards: list[dict[str, Any]],
    output_dir: str,
    manifest: ThreadSafeManifest,
    base_delay: float,
    impersonate: str,
    force: bool,
    dry_run: bool,
) -> dict[str, int]:
    """Independent worker thread for a specific manufacturer domain."""
    fetcher = BoardImageFetcher(
        output_dir=output_dir,
        manifest=manifest,
        base_delay=base_delay,
        impersonate=impersonate,
        force=force,
        dry_run=dry_run,
    )
    counts = defaultdict(int)
    total = len(boards)
    logger.info(">>> Worker started for [%s]: %d boards to process", domain_key.upper(), total)

    for idx, board in enumerate(boards, 1):
        tag = f"{domain_key.upper()} {idx}/{total}"
        status = fetcher.process_board(board, tag=tag)
        counts[status] += 1

    logger.info("<<< Worker finished for [%s]: %s", domain_key.upper(), dict(counts))
    return dict(counts)


def partition_boards_by_domain(boards: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group boards into separate queues by manufacturer brand / domain."""
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    top_brands = {"asrock", "asus", "gigabyte", "msi", "biostar"}

    for b in boards:
        brand = (b.get("brand") or "").strip().lower()
        if brand in top_brands:
            groups[brand].append(b)
        else:
            groups["other"].append(b)

    return groups


def main():
    parser = argparse.ArgumentParser(description="Fetch AM5 motherboard PCB photographs concurrently.")
    parser.add_argument("--boards-file", default="data/boards.json", help="Path to boards.json")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Destination directory for images")
    parser.add_argument("--limit", type=int, default=0, help="Maximum number of boards to process total (0 = all)")
    parser.add_argument("--brand", default="", help="Filter by manufacturer brand (e.g. ASRock, ASUS, Gigabyte, MSI)")
    parser.add_argument("--chipset", default="", help="Filter by chipset (e.g. X870E, B650)")
    parser.add_argument("--ids", default="", help="Comma-separated list of board IDs to process")
    parser.add_argument("--delay", type=float, default=1.5, help="Base delay (seconds) between hits to SAME domain")
    parser.add_argument("--workers", type=int, default=6, help="Concurrent domain workers (default: 6)")
    parser.add_argument("--dry-run", action="store_true", help="Locate images without downloading or saving WebP")
    parser.add_argument("--force", action="store_true", help="Re-fetch even if image already exists")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose debug logging")

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    if not os.path.exists(args.boards_file):
        logger.error("Boards file not found: %s", args.boards_file)
        sys.exit(1)

    with open(args.boards_file, "r", encoding="utf-8") as f:
        boards = json.load(f)

    # Filter boards
    filtered = boards
    if args.brand:
        brand_target = args.brand.strip().lower()
        filtered = [b for b in filtered if (b.get("brand") or "").lower() == brand_target]

    if args.chipset:
        chipset_target = args.chipset.strip().lower()
        filtered = [b for b in filtered if (b.get("chipset") or "").lower() == chipset_target]

    if args.ids:
        id_set = {i.strip() for i in args.ids.split(",") if i.strip()}
        filtered = [b for b in filtered if b.get("id") in id_set]

    manifest = ThreadSafeManifest(args.output_dir)

    # Filter out already satisfied boards
    if not args.force:
        pending = [
            b for b in filtered
            if not (
                os.path.exists(os.path.join(args.output_dir, f"{b.get('id')}_board.webp"))
                and os.path.exists(os.path.join(args.output_dir, f"{b.get('id')}_board_thumb.webp"))
            )
        ]
    else:
        pending = filtered

    logger.info(
        "Total matching: %d boards | Already present: %d | Pending: %d",
        len(filtered),
        len(filtered) - len(pending),
        len(pending),
    )

    if args.limit > 0:
        pending = pending[: args.limit]

    # Partition by domain
    partitions = partition_boards_by_domain(pending)
    active_partitions = {k: v for k, v in partitions.items() if len(v) > 0}

    logger.info("Active domain queues to process concurrently: %s", {k: len(v) for k, v in active_partitions.items()})

    total_counts = defaultdict(int)

    # Launch parallel workers per domain
    max_workers = min(args.workers, max(1, len(active_partitions)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_domain = {
            executor.submit(
                run_domain_worker,
                domain_key=d_key,
                boards=d_boards,
                output_dir=args.output_dir,
                manifest=manifest,
                base_delay=args.delay,
                impersonate="chrome124",
                force=args.force,
                dry_run=args.dry_run,
            ): d_key
            for d_key, d_boards in active_partitions.items()
        }

        for future in concurrent.futures.as_completed(future_to_domain):
            d_key = future_to_domain[future]
            try:
                res = future.result()
                for k, v in res.items():
                    total_counts[k] += v
            except Exception as e:
                logger.error("Domain worker [%s] raised exception: %s", d_key, e)

    logger.info("=" * 60)
    logger.info("ALL DOMAIN WORKERS FINISHED. Overall Summary: %s", dict(total_counts))
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
