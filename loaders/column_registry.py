"""
Declarative column registry for the AM5 spreadsheet dataset.

Maps every raw multi-level Excel column header path to a canonical field name,
target data type, unit, and validation rules.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable, Optional
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


@dataclass(frozen=True)
class ColumnDef:
    header_path: str
    field_name: str
    parser_type: str
    parser: Callable[[Any], Any]
    unit: Optional[str] = None
    required: bool = False
    required_value: bool = False
    ignore: bool = False
    description: str = ""
    aliases: tuple[str, ...] = ()


def _def(
    header_path: str,
    field_name: str,
    parser_type: str,
    parser: Callable[[Any], Any],
    unit: Optional[str] = None,
    required: bool = False,
    required_value: bool = False,
    ignore: bool = False,
    description: str = "",
    aliases: tuple[str, ...] = (),
) -> ColumnDef:
    return ColumnDef(
        header_path=header_path,
        field_name=field_name,
        parser_type=parser_type,
        parser=parser,
        unit=unit,
        required=required,
        required_value=required_value,
        ignore=ignore,
        description=description,
        aliases=aliases,
    )


# Registry mapping sheet header path -> ColumnDef
REGISTRY_LIST: list[ColumnDef] = [
    # Identity
    _def("Brand", "brand", "string", parse_string, required=True, required_value=True, description="Motherboard manufacturer"),
    _def("Model", "model", "string", parse_string, required=True, required_value=True, description="Model name"),
    _def("Chipset", "chipset", "string", parse_string, required=True, required_value=True, description="Chipset (e.g. X870E, B650)"),
    _def("Motherboard|General|Form Factor", "form_factor", "string", parse_string, required=True, required_value=True, description="Form factor (ATX, ITX, etc.)"),

    # Market & Memory
    _def("General|Market|A-MSRP (USD)", "price_usd", "currency", parse_currency, unit="USD", required=True, description="MSRP in USD"),
    _def("General|Market|Release", "release", "string", parse_string, description="Release timeframe/quarter"),
    _def("General|Memory|RAM slots", "ram_slots", "int", parse_int, description="Number of DDR5 memory slots"),
    _def("General|Memory|ECC support", "ecc_support", "string", parse_string, description="ECC memory support status"),
    _def("General|Memory|Max. capacity", "max_ram_capacity_gb", "int", parse_int, unit="GB", description="Maximum supported RAM capacity"),

    # Audio & Networking
    _def("General|Audio|Audio Codec+DAC", "audio_codec", "string", parse_string, description="Audio codec and DAC hardware", aliases=("General|Audio|Codec",)),
    _def("General|Audio|Audio jacks", "audio_jacks", "string", parse_string, description="Analog audio jack count/configuration"),
    _def("General|Audio|S/PDIF", "spdif", "string", parse_string, description="Optical S/PDIF output"),
    _def("General|Networking|Ethernet|# RJ-45", "rj45_ports", "int", parse_int, description="Number of ethernet ports"),
    _def("General|Networking|Ethernet|LAN", "lan_controllers", "string", parse_string, description="LAN controller chips and link speeds"),
    _def("General|Networking|M.2 Wi-Fi slot  easily accessible?", "m2_wifi_accessible", "string", parse_string, description="Wi-Fi slot accessibility"),
    _def("General|Networking|Wireless", "wireless", "string", parse_string, description="Wi-Fi and Bluetooth module generation"),

    # Buttons & Physical
    _def("General|Buttons|BIOS Flash", "bios_flash_btn", "bool", parse_bool, description="BIOS Flashback button"),
    _def("General|Buttons|Clear CMOS", "clear_cmos_btn", "bool", parse_bool, description="Clear CMOS button"),
    _def("General|Buttons|Misc.", "misc_buttons", "string", parse_string, description="Miscellaneous onboard buttons"),
    _def("General|Buttons|Power", "power_btn", "bool", parse_bool, description="Onboard power button"),
    _def("General|Buttons|Reset", "reset_btn", "bool", parse_bool, description="Onboard reset button"),
    _def("General|Limits|CPU power limit", "cpu_power_limit", "string", parse_string, description="CPU power draw limit/guideline"),
    _def("General|Physical|External BCLK", "external_bclk", "bool", parse_bool, description="External base clock generator"),
    _def("General|Physical|PCB Backplate", "pcb_backplate", "bool", parse_bool, description="Integrated PCB metal backplate"),
    _def("General|Physical|PCB layers", "pcb_layers", "int", parse_int, description="Number of PCB copper layers"),

    # Color
    _def("Color|Heatsink|Primary", "heatsink_color_primary", "string", parse_string, description="Primary heatsink color"),
    _def("Color|Heatsink|Text/Accent", "heatsink_color_accent", "string", parse_string, description="Heatsink accent/text color"),
    _def("Color|PCB|Accent", "pcb_color_accent", "string", parse_string, description="PCB accent silkscreen color"),
    _def("Color|PCB|Primary", "pcb_color_primary", "string", parse_string, description="Primary PCB color"),

    # Expansion & Storage
    _def("Expansion|Legacy|PCI", "legacy_pci", "string", parse_string, description="Legacy PCI 32-bit slots"),
    _def("Expansion|PCIe Slots|Physical x1/x4|Electrical Lanes", "pcie_x1x4_lanes", "string", parse_string, description="PCIe x1/x4 electrical lane speeds"),
    _def("Expansion|PCIe Slots|Physical x1/x4|Total", "pcie_x1x4_total", "int", parse_int, description="Total physical x1/x4 slots"),
    _def("Expansion|PCIe Slots|Physical x16|Electrical Lanes", "pcie_x16_lanes", "string", parse_string, description="PCIe x16 electrical lane configurations"),
    _def("Expansion|PCIe Slots|Physical x16|Total", "pcie_x16_total", "int", parse_int, description="Total physical x16 slots"),
    _def("Expansion|PCIe Slots|Total Slot Count", "pcie_total_slots", "int", parse_int, description="Total expansion slots"),
    _def("Expansion|Storage|PCIe Storage|AIC", "aic_slots", "string", parse_string, description="Add-in card storage options"),
    _def("Expansion|Storage|PCIe Storage|M.2 (M)", "m2_m", "string", parse_string, description="M.2 M-key layout and generation"),
    _def("Expansion|Storage|PCIe Storage|SlimSAS", "slimsas", "string", parse_string, description="SlimSAS / SFF connectors"),
    _def("Expansion|Storage|PCIe Storage|Total M.2", "m2_total", "count_with_bonus", parse_count_with_bonus, description="Total M.2 socket count"),
    _def("Expansion|Storage|SATA", "sata_ports", "int", parse_int, description="SATA 6Gbps ports count"),

    # Internal headers & features
    _def("Internal headers & features|Fans and RGB|3-pin ARGB 5V", "argb_5v_headers", "int", parse_int, description="Addressable RGB 5V header count"),
    _def("Internal headers & features|Fans and RGB|4-pin  RGB 12V", "rgb_12v_headers", "int", parse_int, description="Standard RGB 12V header count"),
    _def("Internal headers & features|Fans and RGB|Fan/pump headers", "fan_headers", "string", parse_string, description="Fan and liquid pump header counts"),
    _def("Internal headers & features|Fans and RGB|Super I/O Controllers", "super_io", "string", parse_string, description="Super I/O chip model"),
    _def("Internal headers & features|Features|1st PCIe x16  release feature", "pcie_release_feature", "string", parse_string, description="Q-Release / EZ-Latch PCIe button"),
    _def("Internal headers & features|Features|BIOS chip", "bios_chip", "string", parse_string, description="BIOS ROM capacity and vendor"),
    _def("Internal headers & features|Features|Debug features", "debug_features", "string", parse_string, description="POST code 7-segment display / status LEDs"),
    _def("Internal headers & features|Features|M.2 heatsink slot #s", "m2_heatsink_slots", "string", parse_string, description="M.2 slots covered by included heatsinks"),
    _def(
        "Internal headers & features|Features|SPI TPM  header",
        "spi_tpm_header",
        "string",
        parse_string,
        description="SPI TPM header pinout",
        aliases=("Internal headers & features|Features|SPI TPM header",),
    ),
    _def("Internal headers & features|Legacy", "ignore_legacy_header", "ignore", parse_string, ignore=True, description="Blank parent header in some sheets"),
    _def(
        "Internal headers & features|Legacy|COM (Serial)",
        "com_header",
        "string",
        parse_string,
        description="Serial COM port header",
        aliases=("Internal headers & features|Legacy|COM Header",),
    ),
    _def("Internal headers & features|Legacy|LPT Header", "lpt_header", "string", parse_string, description="Parallel LPT printer port header"),
    _def("Internal headers & features|Legacy|PS/2", "ps2_internal", "string", parse_string, description="Internal PS/2 header"),
    _def("Internal headers & features|USB/Thunderbolt", "ignore_usb_tb_header", "ignore", parse_string, ignore=True, description="Blank parent header in some sheets"),
    _def("Internal headers & features|USB/Thunderbolt|TB header (appearance varies)", "thunderbolt_header", "string", parse_string, description="Thunderbolt add-in header"),
    _def("Internal headers & features|USB/Thunderbolt|USB 2.0 header", "usb2_internal_headers", "string", parse_string, description="Front USB 2.0 headers count"),
    _def("Internal headers & features|USB/Thunderbolt|USB 3.0 header", "usb3_internal_headers", "string", parse_string, description="Front USB 3.0 (5Gbps) headers count"),
    _def("Internal headers & features|USB/Thunderbolt|USB-C header", "usbc_internal_header", "string", parse_string, description="Front USB-C header count & speed"),

    # Lane sharing & Notes
    _def("Lane sharing indicators|GPU x16", "lane_sharing_gpu", "string", parse_string, description="Primary GPU slot sharing conditions"),
    _def("Lane sharing indicators|Other PCIe", "lane_sharing_other_pcie", "string", parse_string, description="Secondary PCIe slot lane sharing"),
    _def("Lane sharing indicators|SATA", "lane_sharing_sata", "string", parse_string, description="SATA port lane sharing"),
    _def("Lane sharing indicators|USB4", "lane_sharing_usb4", "string", parse_string, description="USB4 lane sharing"),
    _def(
        "Notes|Details",
        "notes_details",
        "string",
        parse_string,
        description="Detailed notes, lane sharing and bifurcation details",
        aliases=(
            'Lane-sharing, bifurcation, and  other notes  (Looking for primary x16 bifurcation info? Refer to the "General" section of the FAQ on the About page.)',
            'Lane-sharing, bifurcation, and other notes  (Looking for primary x16 bifurcation info? Refer to the "General" section of the FAQ on the About page.)',
        ),
    ),

    # Links & Media
    _def("Links|Website", "website_url", "string", parse_string, description="Official manufacturer product webpage"),
    _def("Rear I/O Image", "rear_io_image", "string", parse_string, description="Rear I/O panel photograph", aliases=("Rear I/O|Rear I/O Image",)),
    _def("Board Image", "board_image", "string", parse_string, description="Motherboard PCB photograph", aliases=("General|Board Image", "Motherboard|General|Board Image", "General|Physical|Board Image")),
    _def("Board Image Thumb", "board_image_thumb", "string", parse_string, description="Motherboard PCB photograph thumbnail", aliases=("General|Board Image Thumb", "Motherboard|General|Board Image Thumb", "General|Physical|Board Image Thumb")),

    # Power & VRM
    _def("Power|Connectors|EPS12V config", "eps12v_config", "string", parse_string, description="8-pin / 4-pin CPU EPS power connectors"),
    _def("Power|Connectors|PCIe", "power_pcie", "string", parse_string, description="Extra PCIe supplemental power connectors"),
    _def(
        "Power|Fans and RGB|Fan/pump headers",
        "fan_headers_power",
        "string",
        parse_string,
        description="Fan/pump headers (Power section variant)",
        aliases=(),
    ),
    _def("Power|VRM configuration|MOS HS", "vrm_mos_heatsink", "string", parse_string, description="VRM MOSFET heatsink construction & heatpipe"),
    _def("Power|VRM configuration|Phase config", "vrm_phases", "phase_config", parse_phase_config, required=True, description="VRM phase layout (VCore + SOC + Misc)"),
    _def("Power|VRM configuration|VRM (VCore)", "vrm_vcore", "string", parse_string, description="VCore MOSFET power stage amperage rating & type"),
    _def("Power|VRM configuration|VRM /PCH /M.2 fans", "vrm_fans", "string", parse_string, description="Active cooling fans on VRM, chipset, or M.2"),

    # Rear I/O Ports
    _def("Rear I/O|Legacy|PS/2", "rear_ps2", "string", parse_string, description="Rear panel PS/2 keyboard/mouse port"),
    _def("Rear I/O|Modern|Internal", "rear_internal", "string", parse_string, description="Internal / specialty rear I/O connectors"),
    _def("Rear I/O|USB|Total USB", "usb_total", "int", parse_int, description="Total rear USB port count"),
    _def("Rear I/O|USB|Type A|2.0", "usb_a_20", "int", parse_int, description="Rear USB 2.0 Type-A ports"),
    _def("Rear I/O|USB|Type A|3.2G1 (5Gbps)", "usb_a_32_5g", "int", parse_int, description="Rear USB 3.2 Gen 1 (5Gbps) Type-A ports"),
    _def("Rear I/O|USB|Type A|3.2G2 (10Gbps)", "usb_a_32_10g", "int", parse_int, description="Rear USB 3.2 Gen 2 (10Gbps) Type-A ports"),
    _def("Rear I/O|USB|Type C|3.2G1 (5Gbps)", "usb_c_32_5g", "int", parse_int, description="Rear USB 3.2 Gen 1 (5Gbps) Type-C ports"),
    _def("Rear I/O|USB|Type C|3.2G2 (10Gbps)", "usb_c_32_10g", "int", parse_int, description="Rear USB 3.2 Gen 2 (10Gbps) Type-C ports"),
    _def("Rear I/O|USB|Type C|3.2G2x2 (20Gbps)", "usb_c_32_20g", "int", parse_int, description="Rear USB 3.2 Gen 2x2 (20Gbps) Type-C ports"),
    _def("Rear I/O|USB|Type C|USB4 (40Gbps)", "usb_c_usb4_40g", "int", parse_int, description="Rear USB4 (40Gbps) / Thunderbolt 4 ports"),
    _def("Rear I/O|USB|USB-C Total", "usb_c_total", "int", parse_int, description="Total rear Type-C ports"),
    _def("Rear I/O|USB|USBA Total", "usb_a_total", "int", parse_int, description="Total rear Type-A ports"),

    # Video Outputs
    _def("Video Outs|Legacy|DVI-D", "video_dvi", "string", parse_string, description="DVI-D output port"),
    _def(
        "Video Outs|Legacy|VGA",
        "video_vga",
        "string",
        parse_string,
        description="VGA analog output port",
        aliases=("Video Outs|Legacy|VGA/ D-SUB",),
    ),
    _def("Video Outs|Modern|DP", "video_dp", "string", parse_string, description="DisplayPort output"),
    _def("Video Outs|Modern|HDMI", "video_hdmi", "string", parse_string, description="HDMI output"),
    _def("Video Outs|Modern|Internal", "video_internal", "string", parse_string, description="Internal display headers (e.g. eDP)"),
    _def("Video Outs|Modern|USB-C (DP Altmode)", "video_usbc_dp", "string", parse_string, description="USB-C DisplayPort Alternate Mode output"),
    _def("Video Outs|PCIe Slots|Physical x16|Electrical Lanes", "video_pcie_x16_lanes", "string", parse_string, description="PCIe electrical lanes (Video variant)"),
]


# Lookup maps
COLUMN_BY_PATH: dict[str, ColumnDef] = {}
COLUMN_BY_FIELD: dict[str, ColumnDef] = {}

for col in REGISTRY_LIST:
    COLUMN_BY_PATH[col.header_path] = col
    for alias in col.aliases:
        COLUMN_BY_PATH[alias] = col
    COLUMN_BY_FIELD[col.field_name] = col


def get_column_def(header_path: str) -> Optional[ColumnDef]:
    """Find ColumnDef by header path or alias."""
    if header_path in COLUMN_BY_PATH:
        return COLUMN_BY_PATH[header_path]
    # Clean normalized lookup
    clean = header_path.strip()
    if clean in COLUMN_BY_PATH:
        return COLUMN_BY_PATH[clean]
    return None


def get_required_columns() -> list[ColumnDef]:
    """Return all columns flagged as required."""
    return [c for c in REGISTRY_LIST if c.required]
