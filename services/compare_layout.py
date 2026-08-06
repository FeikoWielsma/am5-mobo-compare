"""
Declarative layout for the comparison table.

The compare table used to be 884 lines of hand-written Jinja: one
`{% for m in mobos %}` block per spec row, 85 of them. Adding a row meant
copy-pasting HTML, and the row order could silently drift from the data.

This module holds that curation as data instead. `templates/partials/
compare_table.html` walks it and renders the markup generically.

Why not drive it straight off the `structure` tree in the database? Because
the tree is the *spreadsheet's* shape, not the page's. Its labels differ
("A-MSRP (USD)" vs "Price (MSRP)", "MOS HS" vs "Heatsink"), it orders General
as Audio-then-Networking where the page shows Networking-then-Audio, and it
carries columns the page deliberately omits. The tree is still the source of
truth for *what data exists* -- tests/test_compare_layout.py checks every path
below against it, so a renamed or dropped spreadsheet column fails a test
instead of silently rendering blank cells.

Row kinds
---------
value  : plain value at `path`
cell   : value at `path` with an optional tooltip from `comment`
custom : bespoke markup, dispatched by name in partials/compare_rows.html

Paths are DotWrapper paths relative to `mobo.dot`, dot-separated. DotWrapper
normalises keys (strips case, spaces and punctuation), so the spreadsheet's
"2.0" is reached as `20` and "4-pin  RGB 12V" as `4pin_rgb_12v`.
"""

# Default CSS class on every generated <td>.
DEFAULT_TD_CLASS = "text-center"


def _value(label, path, td_class=DEFAULT_TD_CLASS):
    return {"kind": "value", "label": label, "path": path, "td_class": td_class}


def _cell(label, path, comment=None, td_class=DEFAULT_TD_CLASS):
    return {
        "kind": "cell",
        "label": label,
        "path": path,
        "comment": comment,
        "td_class": td_class,
    }


def _custom(name, label, th_class="ps-5"):
    return {"kind": "custom", "name": name, "label": label, "th_class": th_class}


def _sub(sub_id, title, rows):
    return {"kind": "subsection", "id": sub_id, "title": title, "rows": rows}


# Icon markup reused in row labels. Rendered with |safe.
def _usb(icon, speed, text):
    return f'<i class="bi {icon} usb-icon {speed}"></i> {text}'


COMPARE_LAYOUT = [
    {
        "id": "scorecard",
        "title": "Scorecard Summary",
        # The scorecard is 11 rows of bespoke markup (badge breakdowns, icon
        # sets, per-board score attributes). It lives in its own partial.
        "tr_class": "table-dark",
        "th_class": "text-uppercase bg-primary text-white",
        "partial": "partials/compare_scorecard.html",
        "children": [],
    },
    {
        "id": "general",
        "title": "General",
        "children": [
            _sub("general-market", "Market", [
                _value("Price (MSRP)", "general.market.amsrpusd"),
                _cell("Release", "general.market.release",
                      "general.market.release_comment"),
            ]),
            _sub("general-memory", "Memory", [
                _value("RAM Slots", "general.memory.ram_slots"),
                _cell("ECC Support", "general.memory.ecc_support",
                      "general.memory.ecc_support_comment"),
                _value("Max Capacity", "general.memory.max_capacity"),
            ]),
            _sub("general-networking", "Networking", [
                _custom("lan_controller", "LAN Controller"),
                _value("RJ-45 Ports", "general.networking.ethernet.rj45"),
                _cell("Wireless", "general.networking.wireless",
                      "general.networking.wireless_comment"),
                _value("M.2 Wifi Access",
                       "general.networking.m2_wifi_slot_easily_accessible",
                       td_class="text-center small"),
            ]),
            _sub("general-audio", "Audio", [
                _value("Codec + DAC", "general.audio.audio_codecdac",
                       td_class="text-center fw-bold"),
                _cell("Jacks", "general.audio.audio_jacks",
                      "general.audio.audio_jacks_comment"),
                _value("S/PDIF", "general.audio.spdif"),
            ]),
            _sub("general-buttons", "Buttons", [
                _cell("BIOS Flash", "general.buttons.bios_flash",
                      "general.buttons.bios_flash_comment"),
                _cell("Clear CMOS", "general.buttons.clear_cmos",
                      "general.buttons.clear_cmos_comment"),
                _value("Misc", "general.buttons.misc"),
                _cell("Power", "general.buttons.power",
                      "general.buttons.power_comment"),
                _cell("Reset", "general.buttons.reset",
                      "general.buttons.reset_comment"),
            ]),
            _sub("general-physical", "Physical", [
                _cell("PCB Layers", "general.physical.pcb_layers",
                      "general.physical.pcb_layers_comment"),
                _value("Backplate", "general.physical.pcb_backplate"),
                _cell("External BCLK", "general.physical.external_bclk",
                      "general.physical.external_bclk_comment"),
            ]),
        ],
    },
    {
        "id": "power",
        "title": "Power",
        "children": [
            _sub("power-vrm", "VRM Configuration", [
                _cell("Phase Config", "power.vrm_configuration.phase_config",
                      "power.vrm_configuration.phase_config_comment"),
                _cell("VRM (VCore)", "power.vrm_configuration.vrm_vcore",
                      "power.vrm_configuration.vrm_vcore_comment",
                      td_class="text-center small"),
                _value("VRM Fans", "power.vrm_configuration.vrm_pch_m2_fans"),
                _value("Heatsink", "power.vrm_configuration.mos_hs"),
            ]),
            _sub("power-connectors", "Connectors", [
                _value("EPS 12V", "power.connectors.eps12v_config"),
                _cell("PCIe Power", "power.connectors.pcie",
                      "power.connectors.pcie_comment"),
            ]),
        ],
    },
    {
        "id": "internal",
        "title": "Internal Headers & Features",
        "children": [
            _sub("internal-fans", "Fans and RGB", [
                _value("Fan/Pump Headers",
                       "internal_headers_features.fans_and_rgb.fanpump_headers"),
                _value("RGB 12V (4-pin)",
                       "internal_headers_features.fans_and_rgb.4pin_rgb_12v"),
                _value("ARGB 5V (3-pin)",
                       "internal_headers_features.fans_and_rgb.3pin_argb_5v"),
                _value("Super I/O",
                       "internal_headers_features.fans_and_rgb.super_io_controllers",
                       td_class="text-center small"),
            ]),
            _sub("internal-legacy", "Legacy", [
                _value("COM Header",
                       "internal_headers_features.legacy.com_header"),
                _value("LPT Header",
                       "internal_headers_features.legacy.lpt_header"),
            ]),
            _sub("internal-features", "Features", [
                _value("M.2 Heatsink Slots",
                       "internal_headers_features.features.m2_heatsink_slot_s"),
                _value("SPI TPM",
                       "internal_headers_features.features.spi_tpm_header"),
                _value("BIOS Chip",
                       "internal_headers_features.features.bios_chip"),
                _value("1st PCIe Release",
                       "internal_headers_features.features.1st_pcie_x16_release_feature"),
                _value("Debug LED",
                       "internal_headers_features.features.debug_features"),
            ]),
            _sub("internal-usb", "USB / Thunderbolt", [
                _value(_usb("bi-usb-symbol", "usb-20", "USB 2.0 Header"),
                       "internal_headers_features.usbthunderbolt.usb_20_header"),
                _value(_usb("bi-usb-symbol", "usb-30", "USB 3.0 Header"),
                       "internal_headers_features.usbthunderbolt.usb_30_header"),
                _value(_usb("bi-usb-c", "usb-10g", "USB-C Header"),
                       "internal_headers_features.usbthunderbolt.usbc_header"),
                _value(_usb("bi-thunderbolt", "usb-tb", "TB Header"),
                       "internal_headers_features.usbthunderbolt.tb_header_appearance_varies"),
            ]),
        ],
    },
    {
        "id": "rear-io",
        "title": "Rear I/O",
        # Rows that sit directly under the section, before any subsection.
        "rows": [_custom("io_image", "I/O Image", th_class="ps-5")],
        "row_tr_class": "table-light",
        "children": [
            _sub("rear-io-legacy", "Legacy", [
                _value("PS/2", "rear_io.legacy.ps2"),
            ]),
            _sub("rear-io-usb", "USB", [
                _value(_usb("bi-usb-symbol", "usb-20", "Type A 2.0"),
                       "rear_io.usb.type_a.20"),
                _value(_usb("bi-usb-symbol", "usb-5g", "Type A 5Gbps"),
                       "rear_io.usb.type_a.32g1_5gbps"),
                _value(_usb("bi-usb-symbol", "usb-10g", "Type A 10Gbps"),
                       "rear_io.usb.type_a.32g2_10gbps"),
                _value("Type A Total", "rear_io.usb.usba_total"),
                _value(_usb("bi-usb-c", "usb-5g", "Type C 5Gbps"),
                       "rear_io.usb.type_c.32g1_5gbps"),
                _value(_usb("bi-usb-c", "usb-10g", "Type C 10Gbps"),
                       "rear_io.usb.type_c.32g2_10gbps"),
                _value(_usb("bi-usb-c", "usb-20g", "Type C 20Gbps"),
                       "rear_io.usb.type_c.32g2x2_20gbps"),
                _value(_usb("bi-thunderbolt", "usb-40g", "USB4 40Gbps"),
                       "rear_io.usb.type_c.usb4_40gbps",
                       td_class="text-center text-primary fw-bold"),
                _value("Type C Total", "rear_io.usb.usbc_total"),
                _value("Total USB", "rear_io.usb.total_usb",
                       td_class="text-center fw-bold"),
            ]),
        ],
    },
    {
        "id": "video",
        "title": "Video Outputs",
        "children": [
            _sub("video-modern", "Modern", [
                _cell("Internal", "video_outs.modern.internal",
                      "video_outs.modern.internal_comment"),
                _value("USB-C (DP Alt)", "video_outs.modern.usbc_dp_altmode"),
                _cell("HDMI", "video_outs.modern.hdmi",
                      "video_outs.modern.hdmi_comment"),
                _cell("DisplayPort", "video_outs.modern.dp",
                      "video_outs.modern.dp_comment"),
            ]),
        ],
    },
    {
        "id": "expansion",
        "title": "Expansion",
        "children": [
            _sub("expansion-pcie", "PCIe Slots", [
                _custom("pcie_x16_electrical", "x16 Electrical"),
                _custom("pcie_x16_total", "x16 Total"),
                _custom("pcie_x1x4_electrical", "x1/x4 Electrical"),
                _value("x1/x4 Total", "expansion.pcie_slots.physical_x1x4.total"),
                _custom("pcie_total_slots", "Total Slots"),
            ]),
            _sub("expansion-storage", "Storage", [
                _value("SATA", "expansion.storage.sata"),
                _custom("m2_m", "M.2 (M)"),
                _value("Total M.2 (M)",
                       "expansion.storage.pcie_storage.total_m2",
                       td_class="text-center fw-bold"),
                _value("AIC", "expansion.storage.pcie_storage.aic"),
            ]),
        ],
    },
    {
        "id": "meta",
        "title": "Board Info",
        "children": [
            _sub("meta-links", "Links", [
                _custom("website", "Website"),
            ]),
            _sub("meta-colors", "Colors", [
                _value("Heatsink Primary", "color.heatsink.primary"),
                _value("Heatsink Accent", "color.heatsink.textaccent"),
                _value("PCB Accent", "color.pcb.accent"),
                _value("PCB Primary", "color.pcb.primary"),
            ]),
            _sub("meta-image", "Rear I/O Image", [
                _custom("io_image_link", "View"),
            ]),
        ],
    },
    {
        "id": "notes",
        "title": "Notes",
        "rows": [_custom("notes", "Lane-Sharing / Bifurcation", th_class="ps-4")],
        "children": [],
    },
]


def resolve_spec(dot, path):
    """
    Walks a dot-separated DotWrapper path, e.g. "general.market.amsrpusd".

    Returns whatever DotWrapper yields -- a scalar for leaves, or an empty
    DotWrapper for a missing key, which stringifies to "" exactly as the
    hand-written `{{ m.dot.a.b.c }}` expressions did.
    """
    node = dot
    for part in path.split("."):
        node = node[part]
    return node


def iter_row_paths():
    """Yields (row_label, path) for every non-custom row. Used by tests."""
    for section in COMPARE_LAYOUT:
        groups = [{"rows": section.get("rows", [])}] + section.get("children", [])
        for group in groups:
            for row in group.get("rows", []):
                if row["kind"] in ("value", "cell"):
                    yield row["label"], row["path"]
                    if row.get("comment"):
                        yield row["label"], row["comment"]
