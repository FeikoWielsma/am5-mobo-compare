"""
Shared presentation constants.

Anything here is rendered in more than one place -- server-side by Jinja and
client-side by JavaScript -- so it lives in one module and is handed to both.
The JS side receives it as JSON embedded in the page, the same way LAN_SCORES
is already passed to compare.js.

Before this existed, the USB speed badges were written out twice: in the
compare table's Jinja and again in main.js's scorecard modal. The two had
already drifted (the modal used `bg-info` where the table used
`bg-info text-dark`, and labelled the same speeds differently), which is
exactly the failure this is meant to prevent.
"""

# USB speed tiers, fastest first -- render order follows this list.
#
# `key` matches the keys in the `_scorecard.usb_details` type_a / type_c
# dicts produced by loaders/data_transformer.py. `gbps` is used to look a
# tier up by raw speed, for values that arrive as text like "1*20g".
USB_SPEED_BADGES = [
    {
        "key": "usb4_40g",
        "gbps": 40,
        "label": "40G",
        "class": "bg-warning text-dark",
        "title": "USB4 (40Gbps)",
    },
    {
        "key": "3.2_20g",
        "gbps": 20,
        "label": "20G",
        "class": "bg-success",
        "title": "USB 3.2 Gen 2x2 (20Gbps)",
    },
    {
        "key": "3.2_10g",
        "gbps": 10,
        "label": "10G",
        "class": "bg-primary",
        "title": "USB 3.2 Gen 2 (10Gbps)",
    },
    {
        "key": "3.2_5g",
        "gbps": 5,
        "label": "5G",
        "class": "bg-info text-dark",
        "title": "USB 3.2 Gen 1 (5Gbps)",
    },
    {
        "key": "2.0",
        "gbps": 0.48,
        "label": "2.0",
        "class": "bg-secondary",
        "title": "USB 2.0 (480Mbps)",
    },
]

# Fallback for a USB-C header whose speed we can't place on the scale above.
USB_BADGE_UNKNOWN = {"label": "", "class": "bg-secondary", "title": "USB"}

# Which tiers can appear on each connector type, in render order.
USB_TYPE_A_KEYS = ["3.2_10g", "3.2_5g", "2.0"]
USB_TYPE_C_KEYS = ["usb4_40g", "3.2_20g", "3.2_10g", "3.2_5g"]


def usb_badges_for(keys):
    """The badge specs for `keys`, in canonical (fastest-first) order."""
    wanted = set(keys)
    return [b for b in USB_SPEED_BADGES if b["key"] in wanted]


def usb_badge_by_speed(speed_text):
    """
    Resolve a badge from a raw speed fragment such as "20g", "10G" or "5".

    Used by the USB-C header row, where the spreadsheet stores the speed as
    part of a string like "1*20g" rather than as a structured count.
    """
    digits = "".join(c for c in str(speed_text) if c.isdigit())
    if not digits:
        return USB_BADGE_UNKNOWN
    value = int(digits)
    for badge in USB_SPEED_BADGES:
        if badge["gbps"] == value:
            return badge
    return USB_BADGE_UNKNOWN
