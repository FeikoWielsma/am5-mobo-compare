"""
Build metadata generator for AM5 Mobo Compare.

Computes and emits:
- build_timestamp (ISO 8601 string)
- total_boards (count)
- version (semantic version string)

Target artifact:
- web/src/lib/data/build_meta.json
"""

import os
import sys
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BUILD_META_PATH = str(REPO_ROOT / "web" / "src" / "lib" / "data" / "build_meta.json")


def get_version() -> str:
    """Extract version from pyproject.toml or web/package.json."""
    pyproject_path = REPO_ROOT / "pyproject.toml"
    if pyproject_path.exists():
        try:
            with open(pyproject_path, "r", encoding="utf-8") as f:
                for line in f:
                    stripped = line.strip()
                    if stripped.startswith("version"):
                        parts = stripped.split("=", 1)
                        if len(parts) == 2:
                            return parts[1].strip().strip('"').strip("'")
        except Exception:
            pass

    pkg_path = REPO_ROOT / "web" / "package.json"
    if pkg_path.exists():
        try:
            with open(pkg_path, "r", encoding="utf-8") as f:
                pkg_data = json.load(f)
                if "version" in pkg_data:
                    return str(pkg_data["version"])
        except Exception:
            pass

    return "0.1.0"


def get_total_boards() -> int:
    """Determine total motherboards from existing data artifacts or database."""
    # 1. Check data/boards.json
    boards_json = REPO_ROOT / "data" / "boards.json"
    if boards_json.exists():
        try:
            with open(boards_json, "r", encoding="utf-8") as f:
                boards = json.load(f)
                if isinstance(boards, list):
                    return len(boards)
        except Exception:
            pass

    # 2. Check SQLite database mobo.db
    db_path = REPO_ROOT / "mobo.db"
    if db_path.exists() and db_path.stat().st_size > 0:
        try:
            from models import get_engine, Motherboard
            from sqlalchemy.orm import Session
            engine = get_engine()
            with Session(engine) as session:
                count = session.query(Motherboard).count()
                if count > 0:
                    return count
        except Exception:
            pass

    # 3. Fallback to parsing sheet
    try:
        from loaders.excel_loader import load_data
        mobos, _ = load_data()
        return len(mobos)
    except Exception:
        return 0


def compute_build_meta(
    total_boards: Optional[int] = None,
    version: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> dict[str, Any]:
    """Compute the build metadata dictionary."""
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)
    if version is None:
        version = get_version()
    if total_boards is None:
        total_boards = get_total_boards()

    return {
        "build_timestamp": timestamp.isoformat(),
        "total_boards": int(total_boards),
        "version": str(version),
    }


def write_build_meta(
    output_path: str = DEFAULT_BUILD_META_PATH,
    total_boards: Optional[int] = None,
    version: Optional[str] = None,
) -> dict[str, Any]:
    """Compute and write build metadata to JSON file."""
    meta = compute_build_meta(total_boards=total_boards, version=version)
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    return meta


def main():
    meta = write_build_meta()
    print(f"Generated build metadata at {DEFAULT_BUILD_META_PATH}:")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
