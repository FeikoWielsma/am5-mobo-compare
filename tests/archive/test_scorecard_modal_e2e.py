"""
End-to-end cover for the scorecard modal's USB badges.

This modal renders its badges in JavaScript from the USB_SPEED_BADGES spec
embedded by index.html. Nothing exercised that path before, and it is exactly
where the compare table's Jinja and main.js had previously drifted apart.
"""

import re

import pytest
from playwright.sync_api import Page, expect

# Bootstrap classes the shared spec assigns. Keep in sync with
# services/spec_display.py -- test_spec_display.py owns the spec's own rules.
EXPECTED_CLASSES = {
    "40G": "bg-warning",
    "20G": "bg-success",
    "10G": "bg-primary",
    "5G": "bg-info",
    "2.0": "bg-secondary",
}


def _open_first_scorecard(page, live_server):
    page.goto(live_server)
    page.wait_for_selector("#moboTableBody tr")
    page.locator(".model-click").first.click()
    expect(page.locator("#scorecardModal")).to_be_visible()


def test_scorecard_modal_opens(page: Page, live_server):
    _open_first_scorecard(page, live_server)
    expect(page.locator("#scorecardModalLabel")).not_to_have_text("")


def test_usb_badges_use_the_shared_spec(page: Page, live_server):
    """
    Every badge the modal renders must carry a class and tooltip from the
    shared spec. A badge with no title means main.js went back to building
    them by hand.
    """
    # Walk boards until we find one with USB badges to assert on.
    page.goto(live_server)
    page.wait_for_selector("#moboTableBody tr")

    badge_count = 0
    for i in range(8):
        page.locator(".model-click").nth(i).click()
        expect(page.locator("#scorecardModal")).to_be_visible()

        badges = page.locator("#modal-usb-badges .badge")
        badge_count = badges.count()
        if badge_count:
            for j in range(badge_count):
                badge = badges.nth(j)
                text = badge.inner_text()
                title = badge.get_attribute("title")

                assert title, f"badge {text!r} has no tooltip from the spec"

                label = text.split("x", 1)[-1].replace("(C)", "").strip()
                if label in EXPECTED_CLASSES:
                    expect(badge).to_have_class(
                        re.compile(EXPECTED_CLASSES[label])
                    )
            break

        page.locator("#scorecardModal .btn-close").click()
        expect(page.locator("#scorecardModal")).not_to_be_visible()

    assert badge_count, "no board in the first 8 rendered any USB badge"
