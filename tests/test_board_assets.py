"""
Unit and integration tests for the board image pipeline, typed registry,
asset optimization, and build metadata.
"""

import os
import sys
import json
import tempfile
from pathlib import Path
from PIL import Image
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loaders.column_registry import get_column_def, REGISTRY_LIST
from models.typed import TypedMotherboard, TypedMotherboardDict, REGISTERED_TYPED_FIELDS, DotDict
from loaders.build_meta import compute_build_meta, write_build_meta, get_version
from scripts.optimize_assets import optimize_assets, generate_thumbnail


def test_board_image_column_registry():
    """Verify board_image and board_image_thumb are properly registered."""
    col_img = get_column_def("Board Image")
    assert col_img is not None
    assert col_img.field_name == "board_image"
    assert "General|Board Image" in col_img.aliases

    col_thumb = get_column_def("Board Image Thumb")
    assert col_thumb is not None
    assert col_thumb.field_name == "board_image_thumb"
    assert "General|Board Image Thumb" in col_thumb.aliases

    # Field names must be unique across non-ignored columns
    names = [c.field_name for c in REGISTRY_LIST if not c.ignore]
    assert names.count("board_image") == 1
    assert names.count("board_image_thumb") == 1


def test_models_typed_definitions():
    """Verify models/typed.py exports and metadata."""
    assert "board_image" in REGISTERED_TYPED_FIELDS
    assert "board_image_thumb" in REGISTERED_TYPED_FIELDS

    # DotDict behaves as both dict and object
    d = DotDict({"board_image": "/static/img/boards/test_board.webp", "price_usd": 299})
    assert isinstance(d, dict)
    assert d["board_image"] == "/static/img/boards/test_board.webp"
    assert d.board_image == "/static/img/boards/test_board.webp"
    assert d.price_usd == 299
    assert d.non_existent is None

    # Dataclass model
    mobo = TypedMotherboard(id="test-id", brand="ASUS", board_image="/static/img/boards/test.webp")
    assert mobo.id == "test-id"
    assert mobo.board_image == "/static/img/boards/test.webp"


def test_build_metadata_computation():
    """Verify build metadata generator outputs expected schema."""
    meta = compute_build_meta(total_boards=613, version="0.1.0")
    assert "build_timestamp" in meta
    assert meta["total_boards"] == 613
    assert meta["version"] == "0.1.0"

    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".json") as f:
        temp_path = f.name

    try:
        written = write_build_meta(output_path=temp_path, total_boards=500, version="0.2.0")
        assert written["total_boards"] == 500
        assert written["version"] == "0.2.0"
        with open(temp_path, "r", encoding="utf-8") as rf:
            loaded = json.load(rf)
        assert loaded["total_boards"] == 500
        assert loaded["version"] == "0.2.0"
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def test_optimize_assets_batch_thumbnailing():
    """Verify optimize_assets generates 200px WebP thumbnails."""
    with tempfile.TemporaryDirectory() as tmpdir:
        io_dir = os.path.join(tmpdir, "io")
        boards_dir = os.path.join(tmpdir, "boards")
        os.makedirs(io_dir, exist_ok=True)
        os.makedirs(boards_dir, exist_ok=True)

        # Create dummy PNG image (400x300) in io_dir
        dummy_io = Image.new("RGBA", (400, 300), color=(255, 0, 0, 255))
        dummy_io_path = os.path.join(io_dir, "ASUS_ROG_HERO_io.png")
        dummy_io.save(dummy_io_path, "PNG")

        # Create dummy PNG in boards_dir (600x600)
        dummy_board = Image.new("RGB", (600, 600), color=(0, 255, 0))
        dummy_board_path = os.path.join(boards_dir, "ASUS_ROG_HERO_board.png")
        dummy_board.save(dummy_board_path, "PNG")

        # Run optimization
        stats = optimize_assets(io_dir=io_dir, boards_dir=boards_dir)
        assert stats["io_generated"] == 1
        assert stats["boards_generated"] == 1

        # Check generated WebP thumbnails
        io_thumb_path = os.path.join(io_dir, "ASUS_ROG_HERO_io_thumb.webp")
        board_thumb_path = os.path.join(boards_dir, "ASUS_ROG_HERO_board_thumb.webp")

        assert os.path.exists(io_thumb_path)
        assert os.path.exists(board_thumb_path)

        with Image.open(io_thumb_path) as img:
            assert img.format == "WEBP"
            assert max(img.size) <= 200

        with Image.open(board_thumb_path) as img:
            assert img.format == "WEBP"
            assert max(img.size) <= 200

        # Second run should skip already existing thumbnails
        stats_rerun = optimize_assets(io_dir=io_dir, boards_dir=boards_dir)
        assert stats_rerun["io_generated"] == 0
        assert stats_rerun["io_skipped"] == 1
        assert stats_rerun["boards_generated"] == 0
        assert stats_rerun["boards_skipped"] == 1


def test_boards_dir_has_gitkeep():
    """Verify static/img/boards directory exists and contains .gitkeep."""
    boards_dir = os.path.join("static", "img", "boards")
    assert os.path.isdir(boards_dir), "static/img/boards must exist"
    gitkeep = os.path.join(boards_dir, ".gitkeep")
    assert os.path.exists(gitkeep), "static/img/boards/.gitkeep must exist"
