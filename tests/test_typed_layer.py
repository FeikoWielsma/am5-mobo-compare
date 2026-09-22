"""
Tests for Phase 1: Typed Data Layer, Parsers, Validation Gates, and Change Reports.
"""

from __future__ import annotations
import os
import sys
import json
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loaders.parsers import (
    parse_int,
    parse_decimal,
    parse_currency,
    parse_bool,
    parse_phase_config,
    parse_link_speed,
    parse_count_with_bonus,
    parse_list,
    parse_string,
)
from loaders.column_registry import (
    REGISTRY_LIST,
    get_column_def,
    get_required_columns,
)
from loaders.validator import (
    ValidationError,
    validate_sheet_headers,
    parse_and_validate_record,
    validate_records_integrity,
)
from loaders.change_report import generate_change_report


# ============================================================================
# 1. Typed Parser Unit Tests
# ============================================================================

def test_parse_int():
    assert parse_int(4) == 4
    assert parse_int("4") == 4
    assert parse_int("4.0") == 4
    assert parse_int("-") is None
    assert parse_int("?") is None
    assert parse_int("N/A") is None
    assert parse_int(None) is None


def test_parse_decimal():
    assert parse_decimal(2.5) == 2.5
    assert parse_decimal("2.5") == 2.5
    assert parse_decimal("1,234.56") == 1234.56
    assert parse_decimal("-") is None
    assert parse_decimal(None) is None


def test_parse_currency():
    assert parse_currency("$499.99") == 499.99
    assert parse_currency("119") == 119.0
    assert parse_currency("$1,099.99") == 1099.99
    assert parse_currency("TBD") is None
    assert parse_currency("-") is None
    assert parse_currency(None) is None


def test_parse_bool():
    assert parse_bool("Yes") is True
    assert parse_bool("Y") is True
    assert parse_bool("true") is True
    assert parse_bool(True) is True
    assert parse_bool("No") is False
    assert parse_bool("N") is False
    assert parse_bool("None") is False
    assert parse_bool(False) is False
    assert parse_bool("-") is None
    assert parse_bool("?") is None
    assert parse_bool("Unknown") is None


def test_parse_phase_config():
    p1 = parse_phase_config("2x12+2+1")
    assert p1 is not None
    assert p1["multiplier"] == 2
    assert p1["vcore_phases"] == 24
    assert p1["soc_phases"] == 2
    assert p1["misc_phases"] == 1
    assert p1["total_phases"] == 27

    p2 = parse_phase_config("16+2+2")
    assert p2 is not None
    assert p2["multiplier"] == 1
    assert p2["vcore_phases"] == 16
    assert p2["soc_phases"] == 2
    assert p2["misc_phases"] == 2
    assert p2["total_phases"] == 20

    p3 = parse_phase_config("Direct 20+2+1")
    assert p3 is not None
    assert p3["vcore_phases"] == 20
    assert p3["total_phases"] == 23

    p4 = parse_phase_config("10-phase (7+2+1?)")
    assert p4 is not None
    assert p4["vcore_phases"] == 7
    assert p4["soc_phases"] == 2
    assert p4["misc_phases"] == 1

    assert parse_phase_config("-") is None


def test_parse_link_speed():
    assert parse_link_speed("2.5GbE") == 2.5
    assert parse_link_speed("10GbE") == 10.0
    assert parse_link_speed("1G") == 1.0
    assert parse_link_speed("100M") == 0.1
    assert parse_link_speed("2500") == 2.5
    assert parse_link_speed("-") is None


def test_parse_count_with_bonus():
    c1 = parse_count_with_bonus("4")
    assert c1 is not None
    assert c1["count"] == 4
    assert c1["bonus"] == 0
    assert c1["total"] == 4

    c2 = parse_count_with_bonus("4(+1)")
    assert c2 is not None
    assert c2["count"] == 4
    assert c2["bonus"] == 1
    assert c2["total"] == 5

    c3 = parse_count_with_bonus("5 (+2)")
    assert c3 is not None
    assert c3["count"] == 5
    assert c3["bonus"] == 2
    assert c3["total"] == 7

    assert parse_count_with_bonus("-") is None


def test_parse_list():
    lst = parse_list("Realtek RTL8125BG + Intel I225-V")
    assert lst == ["Realtek RTL8125BG", "Intel I225-V"]

    lst2 = parse_list("A, B; C")
    assert lst2 == ["A", "B", "C"]


# ============================================================================
# 2. Validation Gates Tests
# ============================================================================

def test_validation_gate_fails_on_unknown_column():
    corrupted_cols = [
        {"key": "Brand"},
        {"key": "Model"},
        {"key": "Chipset"},
        {"key": "Motherboard|General|Form Factor"},
        {"key": "General|Market|A-MSRP (USD)"},
        {"key": "Power|VRM configuration|Phase config"},
        {"key": "Totally|Unknown|Rogue|Column"},
    ]
    with pytest.raises(ValidationError) as exc:
        validate_sheet_headers("TestSheet", corrupted_cols)
    assert "Unknown header path discovered" in str(exc.value)
    assert "Totally|Unknown|Rogue|Column" in str(exc.value)


def test_validation_gate_fails_on_missing_required_column():
    missing_required_cols = [
        {"key": "Brand"},
        # Missing Model!
        {"key": "Chipset"},
        {"key": "Motherboard|General|Form Factor"},
        {"key": "General|Market|A-MSRP (USD)"},
        {"key": "Power|VRM configuration|Phase config"},
    ]
    with pytest.raises(ValidationError) as exc:
        validate_sheet_headers("TestSheet", missing_required_cols, check_required=True)
    assert "Missing required column" in str(exc.value)
    assert "model" in str(exc.value)


def test_validation_gate_fails_on_empty_required_value():
    invalid_record = {
        "Brand": "ASUS",
        "Model": "",  # Empty model
        "Chipset": "X870E",
        "Motherboard|General|Form Factor": "ATX",
    }
    with pytest.raises(ValidationError) as exc:
        parse_and_validate_record(invalid_record, "TestSheet", 42)
    assert "Required column 'model' has empty value" in str(exc.value)


def test_validation_gate_fails_on_duplicate_ids():
    duplicate_records = [
        {"id": "asus-hero", "brand": "ASUS", "model": "ROG Hero"},
        {"id": "asus-hero", "brand": "ASUS", "model": "ROG Hero V2"},
    ]
    with pytest.raises(ValueError) as exc:
        validate_records_integrity(duplicate_records)
    assert "duplicate motherboard id(s)" in str(exc.value)


# ============================================================================
# 3. Registry Invariants
# ============================================================================

def test_all_registry_columns_have_unique_field_names():
    field_names = [c.field_name for c in REGISTRY_LIST if not c.ignore]
    duplicates = {name for name in field_names if field_names.count(name) > 1}
    assert not duplicates, f"Duplicate field names in registry: {duplicates}"


def test_required_columns_exist():
    required = get_required_columns()
    req_names = {c.field_name for c in required}
    assert "brand" in req_names
    assert "model" in req_names
    assert "chipset" in req_names
    assert "form_factor" in req_names
    assert "price_usd" in req_names
    assert "vrm_phases" in req_names


# ============================================================================
# 4. Change Report Tests
# ============================================================================

def test_change_report_diffing():
    prev = [
        {"id": "board-1", "brand": "BrandA", "model": "ModelA", "price_usd": 100},
        {"id": "board-2", "brand": "BrandB", "model": "ModelB", "price_usd": 200},
    ]
    curr = [
        # board-1 modified
        {"id": "board-1", "brand": "BrandA", "model": "ModelA", "price_usd": 120},
        # board-2 removed
        # board-3 added
        {"id": "board-3", "brand": "BrandC", "model": "ModelC", "price_usd": 300},
    ]

    import tempfile
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".json") as f:
        json.dump(prev, f)
        temp_path = f.name

    try:
        report = generate_change_report(curr, previous_boards_path=temp_path)
        assert report["stats"]["added_count"] == 1
        assert report["stats"]["removed_count"] == 1
        assert report["stats"]["modified_count"] == 1
        assert report["added"][0]["id"] == "board-3"
        assert report["removed"][0]["id"] == "board-2"
        assert report["modified"][0]["id"] == "board-1"
        assert report["modified"][0]["changes"]["price_usd"]["old"] == 100
        assert report["modified"][0]["changes"]["price_usd"]["new"] == 120
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


# ============================================================================
# 5. Data Artifacts Inspection
# ============================================================================

def test_generated_data_artifacts():
    boards_path = os.path.join("data", "boards.json")
    schema_path = os.path.join("data", "schema.json")
    meta_path = os.path.join("data", "build-meta.json")

    if not os.path.exists(boards_path):
        from scripts.build_data import build_data
        build_data()

    assert os.path.exists(boards_path), "data/boards.json must exist"
    assert os.path.exists(schema_path), "data/schema.json must exist"
    assert os.path.exists(meta_path), "data/build-meta.json must exist"

    with open(boards_path, "r", encoding="utf-8") as f:
        boards = json.load(f)
    assert len(boards) == 613, f"Expected 613 boards, got {len(boards)}"

    sample = boards[0]
    assert "id" in sample
    assert "brand" in sample
    assert "model" in sample
    assert "chipset" in sample
    assert "form_factor" in sample
    assert "typed" in sample
    assert isinstance(sample["typed"], dict)
    assert "vrm_phases" in sample["typed"]
