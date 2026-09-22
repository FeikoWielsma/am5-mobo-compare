"""
Asset optimization script to batch generate 200px WebP thumbnails.

Scans:
- static/img/io/ for Rear I/O PNGs missing .webp thumbnails
- static/img/boards/ for motherboard PCB photos missing .webp thumbnails
"""

import os
import sys
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_IO_DIR = os.environ.get("MOBO_IO_IMAGE_DIR", str(REPO_ROOT / "static" / "img" / "io"))
DEFAULT_BOARDS_DIR = os.environ.get("MOBO_BOARD_IMAGE_DIR", str(REPO_ROOT / "static" / "img" / "boards"))


def generate_thumbnail(
    src_path: str,
    dest_path: str,
    max_size: tuple[int, int] = (200, 200),
    quality: int = 85,
) -> bool:
    """Generate a WebP thumbnail preserving aspect ratio."""
    try:
        with Image.open(src_path) as img:
            thumb = img.copy()
            thumb.thumbnail(max_size, Image.Resampling.LANCZOS)
            if thumb.mode not in ("RGB", "RGBA"):
                thumb = thumb.convert("RGBA")
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            thumb.save(dest_path, "WEBP", quality=quality)
            return True
    except Exception as e:
        print(f"Error generating thumbnail for {src_path}: {e}", file=sys.stderr)
        return False


def optimize_assets(
    io_dir: str = DEFAULT_IO_DIR,
    boards_dir: str = DEFAULT_BOARDS_DIR,
    max_size: tuple[int, int] = (200, 200),
    quality: int = 85,
) -> dict[str, int]:
    """
    Scan image directories and generate missing 200px WebP thumbnails.

    Returns:
        dict with counts of generated and skipped thumbnails.
    """
    stats = {
        "io_generated": 0,
        "io_skipped": 0,
        "boards_generated": 0,
        "boards_skipped": 0,
    }

    # Ensure boards dir exists
    os.makedirs(boards_dir, exist_ok=True)
    gitkeep = os.path.join(boards_dir, ".gitkeep")
    if not os.path.exists(gitkeep):
        with open(gitkeep, "w") as f:
            pass

    # 1. Process Rear I/O images
    if os.path.exists(io_dir):
        print(f"Scanning Rear I/O directory: {io_dir}")
        for fname in sorted(os.listdir(io_dir)):
            if not fname.lower().endswith(".png"):
                continue
            stem = os.path.splitext(fname)[0]
            if stem.endswith("_thumb"):
                continue

            thumb_name = f"{stem}_thumb.webp"
            thumb_path = os.path.join(io_dir, thumb_name)
            src_path = os.path.join(io_dir, fname)

            if os.path.exists(thumb_path):
                stats["io_skipped"] += 1
            else:
                if generate_thumbnail(src_path, thumb_path, max_size, quality):
                    stats["io_generated"] += 1
                    print(f"  [IO] Generated: {thumb_name}")

    # 2. Process Motherboard photos
    if os.path.exists(boards_dir):
        print(f"Scanning Motherboard photos directory: {boards_dir}")
        for fname in sorted(os.listdir(boards_dir)):
            lower = fname.lower()
            if not (lower.endswith(".webp") or lower.endswith(".png") or lower.endswith(".jpg") or lower.endswith(".jpeg")):
                continue
            stem = os.path.splitext(fname)[0]
            if stem.endswith("_thumb"):
                continue

            thumb_name = f"{stem}_thumb.webp"
            thumb_path = os.path.join(boards_dir, thumb_name)
            src_path = os.path.join(boards_dir, fname)

            if os.path.exists(thumb_path):
                stats["boards_skipped"] += 1
            else:
                if generate_thumbnail(src_path, thumb_path, max_size, quality):
                    stats["boards_generated"] += 1
                    print(f"  [Board] Generated: {thumb_name}")

    return stats


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Batch generate 200px WebP thumbnails for AM5 Mobo images.")
    parser.add_argument("--io-dir", default=DEFAULT_IO_DIR, help="Path to Rear I/O images")
    parser.add_argument("--boards-dir", default=DEFAULT_BOARDS_DIR, help="Path to Board photos")
    parser.add_argument("--max-size", type=int, default=200, help="Max edge in pixels for thumbnail")
    parser.add_argument("--quality", type=int, default=85, help="WebP compression quality")

    args = parser.parse_args()
    print("Starting asset optimization...")
    results = optimize_assets(
        io_dir=args.io_dir,
        boards_dir=args.boards_dir,
        max_size=(args.max_size, args.max_size),
        quality=args.quality,
    )

    print()
    print("Asset optimization complete:")
    print(f"  Rear I/O: {results['io_generated']} generated, {results['io_skipped']} already up to date")
    print(f"  Board photos: {results['boards_generated']} generated, {results['boards_skipped']} already up to date")


if __name__ == "__main__":
    main()
