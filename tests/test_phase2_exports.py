"""
Tests for Phase 2: Serialization of layout and UI metadata for frontend consumption.
"""

from __future__ import annotations
import os
import sys
import json
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.compare_layout import COMPARE_LAYOUT
from services.spec_display import USB_SPEED_BADGES, USB_TYPE_A_KEYS, USB_TYPE_C_KEYS
from scripts.build_data import build_data


def test_compare_layout_json_export():
    layout_path = os.path.join("data", "compare-layout.json")
    if not os.path.exists(layout_path):
        build_data()

    assert os.path.exists(layout_path), "data/compare-layout.json must exist"
    with open(layout_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list)
    assert len(data) == len(COMPARE_LAYOUT)
    section_ids = [s["id"] for s in data]
    assert "scorecard" in section_ids
    assert "general" in section_ids
    assert "power" in section_ids
    assert "rear-io" in section_ids


def test_ui_metadata_json_export():
    ui_meta_path = os.path.join("data", "ui-metadata.json")
    if not os.path.exists(ui_meta_path):
        build_data()

    assert os.path.exists(ui_meta_path), "data/ui-metadata.json must exist"
    with open(ui_meta_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "usb_speed_badges" in data
    assert "usb_type_a_keys" in data
    assert "usb_type_c_keys" in data

    assert len(data["usb_speed_badges"]) == len(USB_SPEED_BADGES)
    assert set(data["usb_type_a_keys"]) == set(USB_TYPE_A_KEYS)
    assert set(data["usb_type_c_keys"]) == set(USB_TYPE_C_KEYS)


def test_structure_and_features_json_export():
    structure_path = os.path.join("data", "structure.json")
    features_path = os.path.join("data", "features.json")
    if not os.path.exists(structure_path) or not os.path.exists(features_path):
        build_data()

    assert os.path.exists(structure_path), "data/structure.json must exist"
    assert os.path.exists(features_path), "data/features.json must exist"

    with open(features_path, "r", encoding="utf-8") as f:
        features = json.load(f)

    assert isinstance(features, list)
    assert len(features) >= 70
    keys = [f["key"] for f in features]
    assert "General|Market|A-MSRP (USD)" in keys
    assert "Power|VRM configuration|Phase config" in keys
    assert "General|Audio|Audio Codec+DAC" in keys
    assert "Rear I/O|USB|Total USB" in keys

