"""
Guards for the shared USB badge definitions.

The colours, labels and tooltips in services/spec_display.py are rendered
both server-side (compare table Jinja) and client-side (main.js scorecard
modal). They used to be written out separately in each, and had already
drifted -- the modal used `bg-info` where the table used `bg-info text-dark`,
and labelled the same speeds differently.

These tests fail if either side starts hardcoding badge appearance again.
"""

import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.spec_display import (
    USB_SPEED_BADGES,
    USB_TYPE_A_KEYS,
    USB_TYPE_C_KEYS,
    usb_badge_by_speed,
    usb_badges_for,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_JS = os.path.join(ROOT, "static", "js", "main.js")
SCORECARD = os.path.join(ROOT, "templates", "partials", "compare_scorecard.html")

# A hardcoded USB badge looks like a Bootstrap background utility sitting on
# the same line as a USB speed label. Matching the class alone would flag
# unrelated badges (main.js uses bg-secondary for filter counts), and matching
# the label alone would flag ordinary text.
BADGE_CLASS_PATTERN = re.compile(r"bg-(?:info|warning|success|primary|secondary)")
USB_LABEL_PATTERN = re.compile(r"\b(?:40G|20G|10G|5G|2\.0|USB4|Gbps)\b")


def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def _hardcoded_badge_lines(source):
    return [
        line.strip()
        for line in source.splitlines()
        if BADGE_CLASS_PATTERN.search(line) and USB_LABEL_PATTERN.search(line)
    ]


def test_badge_keys_are_unique():
    keys = [b["key"] for b in USB_SPEED_BADGES]
    assert len(keys) == len(set(keys)), f"duplicate badge keys: {keys}"


def test_badges_are_ordered_fastest_first():
    speeds = [b["gbps"] for b in USB_SPEED_BADGES]
    assert speeds == sorted(speeds, reverse=True), (
        "render order follows this list, so it must stay fastest-first"
    )


def test_every_connector_key_has_a_badge():
    known = {b["key"] for b in USB_SPEED_BADGES}
    for key in USB_TYPE_A_KEYS + USB_TYPE_C_KEYS:
        assert key in known, f"connector key {key!r} has no badge definition"


def test_usb_badges_for_preserves_canonical_order():
    got = [b["key"] for b in usb_badges_for(USB_TYPE_C_KEYS)]
    assert got == ["usb4_40g", "3.2_20g", "3.2_10g", "3.2_5g"]

    # Order comes from USB_SPEED_BADGES, not from the argument.
    shuffled = list(reversed(USB_TYPE_C_KEYS))
    assert [b["key"] for b in usb_badges_for(shuffled)] == got


@pytest.mark.parametrize(
    "text,expected",
    [
        ("20g", "3.2_20g"),
        ("10G", "3.2_10g"),
        ("5", "3.2_5g"),
        ("40g", "usb4_40g"),
    ],
)
def test_usb_badge_by_speed_resolves_known_speeds(text, expected):
    assert usb_badge_by_speed(text)["key"] == expected


@pytest.mark.parametrize("text", ["", "-", "abc", None])
def test_usb_badge_by_speed_falls_back_for_unknown(text):
    badge = usb_badge_by_speed(text)
    assert badge["class"] == "bg-secondary"
    assert "key" not in badge


def test_main_js_does_not_hardcode_usb_badges():
    """The modal must read appearance from USB_SPEED_BADGES, not inline it."""
    hits = _hardcoded_badge_lines(_read(MAIN_JS))
    assert not hits, (
        "main.js hardcodes USB badge appearance -- use the shared "
        f"USB_SPEED_BADGES spec instead:\n  " + "\n  ".join(hits)
    )


def test_scorecard_template_does_not_hardcode_usb_badges():
    """Same for the compare table's USB rows."""
    hits = _hardcoded_badge_lines(_read(SCORECARD))
    assert not hits, (
        "compare_scorecard.html hardcodes USB badge appearance -- use "
        f"usb_badges_for()/usb_badge_by_speed() instead:\n  " + "\n  ".join(hits)
    )


def test_no_javascript_vrm_parser_remains():
    """
    VRM ranking is server-side only (calculate_vrm_score). A JS parser here
    would be a second, divergent implementation -- the one this step removed.
    """
    parsers = _read(os.path.join(ROOT, "static", "js", "parsers.js"))
    compare_js = _read(os.path.join(ROOT, "static", "js", "compare.js"))
    assert "function parseVRM" not in parsers
    assert "parseVRM(" not in compare_js
