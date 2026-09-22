"""
Change report generator for AM5 motherboard dataset builds.

Diffs current dataset build against the previous build and outputs build-meta.json
tracking added, removed, and modified motherboards and specifications.
"""

from __future__ import annotations
import os
import json
import hashlib
from datetime import datetime, timezone
from typing import Any, Optional


def compute_file_hash(filepath: str) -> str:
    """Compute SHA256 hex digest of a file."""
    if not os.path.exists(filepath):
        return ""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192 * 16):
            h.update(chunk)
    return h.hexdigest()


def generate_change_report(
    current_boards: list[dict[str, Any]],
    previous_boards_path: Optional[str] = None,
    excel_path: Optional[str] = None,
) -> dict[str, Any]:
    """
    Diff current boards against previous build.
    Returns a change report dictionary.
    """
    previous_boards: list[dict[str, Any]] = []
    if previous_boards_path and os.path.exists(previous_boards_path):
        try:
            with open(previous_boards_path, "r", encoding="utf-8") as f:
                previous_boards = json.load(f)
        except Exception:
            previous_boards = []

    prev_by_id = {b["id"]: b for b in previous_boards if "id" in b}
    curr_by_id = {b["id"]: b for b in current_boards if "id" in b}

    prev_ids = set(prev_by_id.keys())
    curr_ids = set(curr_by_id.keys())

    added_ids = sorted(list(curr_ids - prev_ids))
    removed_ids = sorted(list(prev_ids - curr_ids))
    common_ids = sorted(list(curr_ids & prev_ids))

    added = [
        {"id": bid, "brand": curr_by_id[bid].get("brand", ""), "model": curr_by_id[bid].get("model", "")}
        for bid in added_ids
    ]
    removed = [
        {"id": bid, "brand": prev_by_id[bid].get("brand", ""), "model": prev_by_id[bid].get("model", "")}
        for bid in removed_ids
    ]

    modified = []
    for bid in common_ids:
        curr_b = curr_by_id[bid]
        prev_b = prev_by_id[bid]
        changes: dict[str, dict[str, Any]] = {}

        # Compare keys
        all_keys = set(curr_b.keys()) | set(prev_b.keys())
        for k in all_keys:
            if k.startswith("_"):
                continue
            old_val = prev_b.get(k)
            new_val = curr_b.get(k)
            if old_val != new_val:
                changes[k] = {"old": old_val, "new": new_val}

        if changes:
            modified.append({
                "id": bid,
                "brand": curr_b.get("brand", ""),
                "model": curr_b.get("model", ""),
                "changes": changes,
            })

    report = {
        "build_timestamp": datetime.now(timezone.utc).isoformat(),
        "schema_version": "1.0",
        "sheet_checksum": compute_file_hash(excel_path) if excel_path else "",
        "total_boards": len(current_boards),
        "stats": {
            "added_count": len(added),
            "removed_count": len(removed),
            "modified_count": len(modified),
        },
        "added": added,
        "removed": removed,
        "modified": modified,
    }

    return report
