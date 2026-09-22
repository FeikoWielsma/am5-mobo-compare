"""
Build script to ingest Excel spreadsheet data into typed JSON artifacts:
- data/boards.json (validated, typed motherboard records)
- data/schema.json (schema definitions and column registry)
- data/build-meta.json (build metadata and change report)
"""

from __future__ import annotations
import os
import sys
import json

# Ensure repo root is on sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from loaders.config import EXCEL_FILE, SHEETS_TO_LOAD, IO_IMAGE_DIR
from loaders.excel_loader import load_data
from loaders.column_registry import REGISTRY_LIST
from loaders.validator import validate_sheet_headers, validate_records_integrity, ValidationError
from loaders.change_report import generate_change_report
from services.compare_layout import COMPARE_LAYOUT
from services.spec_display import (
    USB_SPEED_BADGES,
    USB_TYPE_A_KEYS,
    USB_TYPE_C_KEYS,
)


def sync_to_web_static(data_dir: str, web_static_dir: str = "web/static") -> None:
    """Sync data artifacts and extracted images to web/static if web directory exists."""
    if not os.path.exists("web"):
        return
    import shutil
    target_data_dir = os.path.join(web_static_dir, "data")
    os.makedirs(target_data_dir, exist_ok=True)
    for fname in os.listdir(data_dir):
        if fname.endswith(".json"):
            src = os.path.join(data_dir, fname)
            dst = os.path.join(target_data_dir, fname)
            shutil.copy2(src, dst)

    if os.path.exists(IO_IMAGE_DIR):
        for sub in [("img", "io"), ("static", "img", "io")]:
            target_img_dir = os.path.join(web_static_dir, *sub)
            os.makedirs(target_img_dir, exist_ok=True)
            for img_name in os.listdir(IO_IMAGE_DIR):
                if img_name.endswith(".webp") or img_name.endswith(".png"):
                    src = os.path.join(IO_IMAGE_DIR, img_name)
                    dst = os.path.join(target_img_dir, img_name)
                    if not os.path.exists(dst) or os.path.getmtime(src) > os.path.getmtime(dst):
                        shutil.copy2(src, dst)

    from loaders.config import BOARD_IMAGE_DIR
    if os.path.exists(BOARD_IMAGE_DIR):
        for sub in [("img", "boards"), ("static", "img", "boards")]:
            target_img_dir = os.path.join(web_static_dir, *sub)
            os.makedirs(target_img_dir, exist_ok=True)
            for img_name in os.listdir(BOARD_IMAGE_DIR):
                if img_name.endswith(".webp") or img_name.endswith(".png"):
                    src = os.path.join(BOARD_IMAGE_DIR, img_name)
                    dst = os.path.join(target_img_dir, img_name)
                    if not os.path.exists(dst) or os.path.getmtime(src) > os.path.getmtime(dst):
                        shutil.copy2(src, dst)

    icons_src = os.path.join("static", "img", "icons")
    if os.path.exists(icons_src):
        target_icons_dir = os.path.join(web_static_dir, "img", "icons")
        os.makedirs(target_icons_dir, exist_ok=True)
        for icon in os.listdir(icons_src):
            if icon.endswith(".svg"):
                shutil.copy2(os.path.join(icons_src, icon), os.path.join(target_icons_dir, icon))


def build_data(output_dir: str = "data", excel_path: str = EXCEL_FILE) -> tuple[list[dict], dict, dict]:
    """Execute ingestion pipeline and emit data artifacts."""
    os.makedirs(output_dir, exist_ok=True)
    boards_path = os.path.join(output_dir, "boards.json")
    schema_path = os.path.join(output_dir, "schema.json")
    meta_path = os.path.join(output_dir, "build-meta.json")
    layout_path = os.path.join(output_dir, "compare-layout.json")
    ui_meta_path = os.path.join(output_dir, "ui-metadata.json")

    print(f"Ingesting AM5 dataset from: {excel_path}")
    motherboards, header_tree = load_data()
    print(f"Loaded {len(motherboards)} motherboard records across {len(SHEETS_TO_LOAD)} sheets.")

    # Validate overall record integrity (e.g. unique IDs)
    validate_records_integrity(motherboards)

    # 1. Build schema.json
    schema = []
    for col in REGISTRY_LIST:
        if col.ignore:
            continue
        schema.append({
            "field_name": col.field_name,
            "header_path": col.header_path,
            "type": col.parser_type,
            "unit": col.unit,
            "required": col.required,
            "description": col.description,
            "aliases": list(col.aliases),
        })

    # 2. Build change report against previous boards.json
    change_report = generate_change_report(
        current_boards=motherboards,
        previous_boards_path=boards_path,
        excel_path=excel_path,
    )

    # 3. Build structure and features list for dynamic column picker
    from services.mobo_service import MoboService
    svc = MoboService(None)
    svc.inject_lan_speed_structure(header_tree)
    structure = svc.filter_structure_drop_standard(header_tree)
    structure_path = os.path.join(output_dir, "structure.json")

    def collect_leaves(items, path=None):
        if path is None:
            path = []
        leaves = []
        for item in items:
            p = path + [item.get("name", "")]
            if "children" in item and item["children"]:
                leaves.extend(collect_leaves(item["children"], p))
            elif "key" in item:
                leaves.append({
                    "key": item["key"],
                    "name": item.get("name", ""),
                    "category": " > ".join(path) if path else "",
                    "full_label": " > ".join(p),
                })
        return leaves

    features = collect_leaves(structure)
    features_path = os.path.join(output_dir, "features.json")

    # 4. Write artifacts to disk
    ui_metadata = {
        "usb_speed_badges": USB_SPEED_BADGES,
        "usb_type_a_keys": list(USB_TYPE_A_KEYS),
        "usb_type_c_keys": list(USB_TYPE_C_KEYS),
    }

    with open(boards_path, "w", encoding="utf-8") as f:
        json.dump(motherboards, f, indent=2)

    with open(schema_path, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2)

    with open(structure_path, "w", encoding="utf-8") as f:
        json.dump(structure, f, indent=2)

    with open(features_path, "w", encoding="utf-8") as f:
        json.dump(features, f, indent=2)

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(change_report, f, indent=2)

    with open(layout_path, "w", encoding="utf-8") as f:
        json.dump(COMPARE_LAYOUT, f, indent=2)

    with open(ui_meta_path, "w", encoding="utf-8") as f:
        json.dump(ui_metadata, f, indent=2)

    # 4b. Generate frontend build metadata
    from loaders.build_meta import write_build_meta
    write_build_meta(total_boards=len(motherboards))

    # 5. Sync to web/static if web exists
    sync_to_web_static(output_dir)

    print(f"Successfully generated:")
    print(f"  - {boards_path} ({len(motherboards)} boards)")
    print(f"  - {schema_path} ({len(schema)} fields)")
    print(f"  - {structure_path}")
    print(f"  - {features_path} ({len(features)} selectable features)")
    print(f"  - {layout_path} ({len(COMPARE_LAYOUT)} sections)")
    print(f"  - {ui_meta_path}")
    print(f"  - {meta_path} (added: {change_report['stats']['added_count']}, modified: {change_report['stats']['modified_count']}, removed: {change_report['stats']['removed_count']})")

    return motherboards, schema, change_report


if __name__ == "__main__":
    build_data()
