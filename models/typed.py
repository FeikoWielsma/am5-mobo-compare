"""
Typed specifications and models for AM5 motherboards.

Provides typed definitions and metadata for canonical motherboard specifications,
ensuring strict contracts for data loaders, exporters, and the frontend.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Optional, TypedDict


REGISTERED_TYPED_FIELDS: dict[str, str] = {
    "board_image": "Motherboard PCB photograph",
    "board_image_thumb": "Motherboard PCB photograph thumbnail",
    "rear_io_image": "Rear I/O panel photograph",
}


def register_typed_field(name: str, description: str = "") -> None:
    """Register a field in the typed specifications registry."""
    REGISTERED_TYPED_FIELDS[name] = description


class TypedMotherboardDict(TypedDict, total=False):
    """Canonical typed dictionary for a motherboard record."""
    id: str
    brand: str
    model: str
    chipset: str
    form_factor: str
    board_image: Optional[str]
    board_image_thumb: Optional[str]
    rear_io_image: Optional[str]
    price_usd: Optional[float]
    release: Optional[str]
    ram_slots: Optional[int]
    ecc_support: Optional[str]
    max_ram_capacity_gb: Optional[int]
    audio_codec: Optional[str]
    audio_jacks: Optional[str]
    spdif: Optional[str]
    rj45_ports: Optional[int]
    lan_controllers: Optional[str]
    m2_wifi_accessible: Optional[str]
    wireless: Optional[str]
    bios_flash_btn: Optional[bool]
    clear_cmos_btn: Optional[bool]
    misc_buttons: Optional[str]
    power_btn: Optional[bool]
    reset_btn: Optional[bool]
    cpu_power_limit: Optional[str]
    external_bclk: Optional[bool]
    pcb_backplate: Optional[bool]
    pcb_layers: Optional[int]
    heatsink_color_primary: Optional[str]
    heatsink_color_accent: Optional[str]
    pcb_color_accent: Optional[str]
    pcb_color_primary: Optional[str]
    legacy_pci: Optional[str]
    pcie_x1x4_lanes: Optional[str]
    pcie_x1x4_total: Optional[int]
    pcie_x16_lanes: Optional[str]
    pcie_x16_total: Optional[int]
    pcie_total_slots: Optional[int]
    aic_slots: Optional[str]
    m2_m: Optional[str]
    slimsas: Optional[str]
    m2_total: Optional[dict[str, Any]]
    sata_ports: Optional[int]
    argb_5v_headers: Optional[int]
    rgb_12v_headers: Optional[int]
    fan_headers: Optional[str]
    super_io: Optional[str]
    pcie_release_feature: Optional[str]
    bios_chip: Optional[str]
    debug_features: Optional[str]
    m2_heatsink_slots: Optional[str]
    spi_tpm_header: Optional[str]
    com_header: Optional[str]
    lpt_header: Optional[str]
    ps2_internal: Optional[str]
    thunderbolt_header: Optional[str]
    usb2_internal_headers: Optional[str]
    usb3_internal_headers: Optional[str]
    usbc_internal_header: Optional[str]
    lane_sharing_gpu: Optional[str]
    lane_sharing_other_pcie: Optional[str]
    lane_sharing_sata: Optional[str]
    lane_sharing_usb4: Optional[str]
    notes_details: Optional[str]
    website_url: Optional[str]
    eps12v_config: Optional[str]
    power_pcie: Optional[str]
    fan_headers_power: Optional[str]
    vrm_mos_heatsink: Optional[str]
    vrm_phases: Optional[dict[str, Any]]
    vrm_vcore: Optional[str]
    vrm_fans: Optional[str]
    rear_ps2: Optional[str]
    rear_internal: Optional[str]
    usb_total: Optional[int]
    usb_a_20: Optional[int]
    usb_a_32_5g: Optional[int]
    usb_a_32_10g: Optional[int]
    usb_c_32_5g: Optional[int]
    usb_c_32_10g: Optional[int]
    usb_c_32_20g: Optional[int]
    usb_c_usb4_40g: Optional[int]
    usb_c_total: Optional[int]
    usb_a_total: Optional[int]
    video_dvi: Optional[str]
    video_vga: Optional[str]
    video_dp: Optional[str]
    video_hdmi: Optional[str]
    video_internal: Optional[str]
    video_usbc_dp: Optional[str]
    video_pcie_x16_lanes: Optional[str]


@dataclass
class TypedMotherboard:
    """Dataclass representation of typed motherboard specifications."""
    id: str = ""
    brand: str = ""
    model: str = ""
    chipset: str = ""
    form_factor: str = ""
    board_image: Optional[str] = None
    board_image_thumb: Optional[str] = None
    rear_io_image: Optional[str] = None
    specs: dict[str, Any] = field(default_factory=dict)
    typed: dict[str, Any] = field(default_factory=dict)

class DotDict(dict):
    """A dictionary supporting dot attribute access while remaining a standard dict."""
    def __getattr__(self, name: str) -> Any:
        try:
            val = self[name]
            return DotDict(val) if isinstance(val, dict) and not isinstance(val, DotDict) else val
        except KeyError:
            return None

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value

