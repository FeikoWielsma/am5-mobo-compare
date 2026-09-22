"""
Unit tests for the automated motherboard PCB image fetcher and anti-ban scraper.
"""

import io
import os
import sys
import tempfile
from unittest.mock import MagicMock, patch
from PIL import Image
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.fetch_board_images import (
    DomainPacer,
    BoardImageFetcher,
    extract_meta_image,
    interleave_boards_by_domain,
)


def test_domain_pacer():
    """Verify DomainPacer delay, jitter, and backoff multiplier."""
    pacer = DomainPacer(base_delay=0.1, max_delay=1.0)
    assert pacer.current_delays["asus.com"] == 0.1

    # Pace initial request
    pacer.pace("asus.com")
    assert "asus.com" in pacer.last_hit

    # Trigger backoff
    with patch("time.sleep") as mock_sleep:
        pacer.backoff("asus.com")
        assert pacer.current_delays["asus.com"] == pytest.approx(0.2)
        mock_sleep.assert_called_with(0.2)

        # Reset backoff
        pacer.reset_backoff("asus.com")
        assert pacer.current_delays["asus.com"] == 0.1


def test_extract_meta_image():
    """Verify og:image and twitter:image extraction with negative filtering."""
    base_url = "https://example.com/product/mobo"

    # Standard og:image
    html1 = '<html><head><meta property="og:image" content="https://example.com/img/board.png"></head></html>'
    assert extract_meta_image(html1, base_url) == "https://example.com/img/board.png"

    # Reversed content/property
    html2 = '<html><head><meta content="/assets/pcb.jpg" property="og:image"></head></html>'
    assert extract_meta_image(html2, base_url) == "https://example.com/assets/pcb.jpg"

    # Filter out logo
    html_logo = '<html><head><meta property="og:image" content="https://example.com/logo.png"></head></html>'
    assert extract_meta_image(html_logo, base_url) is None

    # Twitter image fallback
    html_twitter = '<html><head><meta name="twitter:image" content="https://example.com/hero.webp"></head></html>'
    assert extract_meta_image(html_twitter, base_url) == "https://example.com/hero.webp"


def test_interleave_boards_by_domain():
    """Verify round-robin interleaving avoids consecutive hits to same domain."""
    boards = [
        {"id": "gigabyte-1", "brand": "Gigabyte"},
        {"id": "gigabyte-2", "brand": "Gigabyte"},
        {"id": "gigabyte-3", "brand": "Gigabyte"},
        {"id": "asus-1", "brand": "ASUS"},
        {"id": "asus-2", "brand": "ASUS"},
        {"id": "msi-1", "brand": "MSI"},
    ]
    interleaved = interleave_boards_by_domain(boards)
    brands = [b["brand"] for b in interleaved]

    # No two consecutive boards should have the same brand while alternatives exist
    assert brands[0] != brands[1]
    assert brands[1] != brands[2]
    # Check all boards are preserved
    assert len(interleaved) == len(boards)


def test_download_and_process_image():
    """Verify raw image download, WebP conversion, and thumbnailing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        fetcher = BoardImageFetcher(output_dir=tmpdir, base_delay=0.01)

        # Create mock raw image in memory
        raw_img = Image.new("RGBA", (1400, 1000), color=(100, 150, 200, 255))
        buf = io.BytesIO()
        raw_img.save(buf, format="PNG")
        raw_bytes = buf.getvalue()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = raw_bytes

        with patch.object(fetcher.session, "get", return_value=mock_resp):
            res = fetcher.download_and_process_image("https://example.com/test.png", "TEST_BOARD_1")

        assert res is not None
        assert res["file"] == "TEST_BOARD_1_board.webp"
        assert res["thumb_file"] == "TEST_BOARD_1_board_thumb.webp"

        # Check full image max dimension clamped to 1200
        assert res["width"] == 1200
        assert res["height"] == round(1000 * (1200 / 1400))

        # Check files on disk
        full_path = os.path.join(tmpdir, "TEST_BOARD_1_board.webp")
        thumb_path = os.path.join(tmpdir, "TEST_BOARD_1_board_thumb.webp")
        assert os.path.exists(full_path)
        assert os.path.exists(thumb_path)

        with Image.open(full_path) as full_img:
            assert full_img.format == "WEBP"
        with Image.open(thumb_path) as thumb_img:
            assert thumb_img.format == "WEBP"
            assert max(thumb_img.size) <= 240


def test_should_skip_existing():
    """Verify fetcher skips boards whose images and manifest already exist."""
    with tempfile.TemporaryDirectory() as tmpdir:
        fetcher = BoardImageFetcher(output_dir=tmpdir, base_delay=0.01)

        assert not fetcher.should_skip("BOARD_A")

        # Create files
        open(os.path.join(tmpdir, "BOARD_A_board.webp"), "w").close()
        open(os.path.join(tmpdir, "BOARD_A_board_thumb.webp"), "w").close()

        assert fetcher.should_skip("BOARD_A")
