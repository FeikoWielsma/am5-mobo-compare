"""
Typed parsers for motherboard specifications.

Each parser handles isolated data conversion from messy spreadsheet strings
into structured, canonical Python primitives and dataclasses.
"""

from __future__ import annotations
import re
from typing import Any, Optional, TypedDict


class PhaseConfig(TypedDict):
    raw: str
    vcore_phases: int
    soc_phases: int
    misc_phases: int
    total_phases: int
    multiplier: int


class CountWithBonus(TypedDict):
    count: int
    bonus: int
    total: int
    raw: str


def parse_int(val: Any) -> Optional[int]:
    """Parse an integer value, handling strings, floats and empty markers."""
    if val is None:
        return None
    if isinstance(val, bool):
        return 1 if val else 0
    if isinstance(val, (int, float)):
        return int(val)
    s = str(val).strip()
    if not s or s in ("-", "?", "N/A", "n/a", "None"):
        return None
    # Match leading integer or float
    m = re.match(r"^[-+]?\d+", s)
    if m:
        try:
            return int(m.group(0))
        except ValueError:
            return None
    return None


def parse_decimal(val: Any) -> Optional[float]:
    """Parse a decimal/float value."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(",", "")
    if not s or s in ("-", "?", "N/A", "n/a", "None"):
        return None
    m = re.search(r"[-+]?\d+(?:\.\d+)?", s)
    if m:
        try:
            return float(m.group(0))
        except ValueError:
            return None
    return None


def parse_currency(val: Any) -> Optional[float]:
    """Parse currency / MSRP values into float."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return round(float(val), 2)
    s = str(val).strip().replace("$", "").replace(",", "")
    if not s or s in ("-", "?", "N/A", "n/a", "None", "TBD"):
        return None
    m = re.search(r"\d+(?:\.\d+)?", s)
    if m:
        try:
            return round(float(m.group(0)), 2)
        except ValueError:
            return None
    return None


def parse_bool(val: Any) -> Optional[bool]:
    """Parse boolean indicators like Yes/No, True/False, Y/N."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if not s or s in ("-", "?", "unknown", "n/a"):
        return None
    if s in ("yes", "y", "true", "1", "supported", "enabled"):
        return True
    if s in ("no", "n", "false", "0", "none", "disabled"):
        return False
    return None


def parse_phase_config(val: Any) -> Optional[PhaseConfig]:
    """
    Parse VRM phase configuration string.
    Examples:
        "2x12+2+1" -> multiplier=2, vcore=24, soc=2, misc=1, total=27
        "16+2+2"   -> multiplier=1, vcore=16, soc=2, misc=2, total=20
        "Direct 20+2+1" -> multiplier=1, vcore=20, soc=2, misc=1, total=23
    """
    if val is None:
        return None
    s = str(val).strip()
    if not s or s in ("-", "?", "None"):
        return None

    multiplier = 1
    vcore = 0
    soc = 0
    misc = 0

    # Check for multiplier like '2x12' or '2*12'
    mult_match = re.search(r"(\d+)\s*[x*]\s*(\d+)", s, re.IGNORECASE)
    if mult_match:
        multiplier = int(mult_match.group(1))
        base_vcore = int(mult_match.group(2))
        vcore = multiplier * base_vcore
        # Look for rest of addition: +soc+misc after multiplier
        rest_idx = mult_match.end()
        remainder = s[rest_idx:]
        pluses = [int(p) for p in re.findall(r"\+\s*(\d+)", remainder)]
        if len(pluses) >= 1:
            soc = pluses[0]
        if len(pluses) >= 2:
            misc = pluses[1]
    else:
        # Format like 16+2+1 or 10-phase (7+2+1?)
        numbers = [int(n) for n in re.findall(r"(\d+)", s)]
        # Filter if inside parentheses like (7+2+1?)
        paren_match = re.search(r"\(([^)]+)\)", s)
        if paren_match and "+" in paren_match.group(1):
            parts = [int(n) for n in re.findall(r"\d+", paren_match.group(1))]
            if parts:
                vcore = parts[0]
                soc = parts[1] if len(parts) > 1 else 0
                misc = parts[2] if len(parts) > 2 else 0
        elif "+" in s:
            plus_parts = [int(n) for n in re.findall(r"\d+", s)]
            if plus_parts:
                vcore = plus_parts[0]
                soc = plus_parts[1] if len(plus_parts) > 1 else 0
                misc = plus_parts[2] if len(plus_parts) > 2 else 0
        elif numbers:
            vcore = numbers[0]

    total = vcore + soc + misc
    return {
        "raw": s,
        "vcore_phases": vcore,
        "soc_phases": soc,
        "misc_phases": misc,
        "total_phases": total,
        "multiplier": multiplier,
    }


def parse_link_speed(val: Any) -> Optional[float]:
    """
    Parse link speeds into speed in Gbps.
    Examples:
        "2.5GbE" -> 2.5
        "10GbE"  -> 10.0
        "1G"     -> 1.0
        "100M"   -> 0.1
    """
    if val is None:
        return None
    s = str(val).strip().upper()
    if not s or s in ("-", "?", "NONE"):
        return None
    if "100M" in s:
        return 0.1
    m_gbe = re.search(r"(\d+(?:\.\d+)?)\s*(?:G|GBE|GBPS)", s)
    if m_gbe:
        return float(m_gbe.group(1))
    m_num = re.search(r"^(\d+(?:\.\d+)?)", s)
    if m_num:
        n = float(m_num.group(1))
        if n >= 100:  # Mbps like 2500 -> 2.5
            return n / 1000.0
        return n
    return None


def parse_count_with_bonus(val: Any) -> Optional[CountWithBonus]:
    """
    Parse counts that may include bonus or qualifier.
    Examples:
        "4"       -> count=4, bonus=0, total=4
        "4(+1)"   -> count=4, bonus=1, total=5
        "5 (+2)"  -> count=5, bonus=2, total=7
    """
    if val is None:
        return None
    s = str(val).strip()
    if not s or s in ("-", "?", "None"):
        return None

    m = re.match(r"^(\d+)(?:\s*\(\+(\d+)\))?", s)
    if m:
        count = int(m.group(1))
        bonus = int(m.group(2)) if m.group(2) else 0
        return {
            "count": count,
            "bonus": bonus,
            "total": count + bonus,
            "raw": s,
        }
    return None


def parse_list(val: Any, separators: tuple[str, ...] = (",", ";", "+", "&", "\n")) -> list[str]:
    """Parse a delimited string into a clean list of non-empty string items."""
    if val is None:
        return []
    s = str(val).strip()
    if not s or s in ("-", "?", "None"):
        return []
    pattern = "[" + "".join(re.escape(sep) for sep in separators) + "]"
    parts = re.split(pattern, s)
    return [p.strip() for p in parts if p.strip()]


def parse_string(val: Any) -> str:
    """Normalize string, stripping whitespace and collapsing internal newlines."""
    if val is None:
        return ""
    s = str(val).strip()
    return re.sub(r"\s+", " ", s)
