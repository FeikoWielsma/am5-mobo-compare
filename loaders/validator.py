"""
Validation gates for AM5 motherboard dataset ingestion.

Ensures that:
- Header structures match the Column Registry.
- Required columns are present on every sheet.
- Values parse successfully into declared data types.
- No duplicate motherboard IDs exist.
"""

from __future__ import annotations
from typing import Any, Optional
from loaders.column_registry import (
    ColumnDef,
    COLUMN_BY_PATH,
    get_column_def,
    get_required_columns,
)
from loaders.ids import assert_unique_ids


class ValidationError(Exception):
    """Raised when ingestion validation fails."""
    def __init__(self, message: str, sheet_name: Optional[str] = None, column: Optional[str] = None, row_idx: Optional[int] = None):
        self.sheet_name = sheet_name
        self.column = column
        self.row_idx = row_idx
        prefix = ""
        if sheet_name:
            prefix += f"[{sheet_name}"
            if row_idx is not None:
                prefix += f":row {row_idx}"
            prefix += "] "
        if column:
            prefix += f"Column '{column}': "
        super().__init__(f"{prefix}{message}")


def validate_sheet_headers(
    sheet_name: str,
    cols_info: list[dict[str, Any]],
    check_required: Optional[bool] = None,
) -> None:
    """
    Validate that all columns discovered in the sheet are registered,
    and all required columns are present.
    """
    from loaders.config import SHEETS_TO_LOAD
    if check_required is None:
        check_required = (sheet_name in SHEETS_TO_LOAD)

    discovered_keys = {c["key"] for c in cols_info}

    # 1. Check for unknown columns
    for key in discovered_keys:
        col_def = get_column_def(key)
        if col_def is None:
            raise ValidationError(
                f"Unknown header path discovered: '{key}'. Every column must be registered in Column Registry.",
                sheet_name=sheet_name,
                column=key,
            )

    # 2. Check for required columns
    if check_required:
        required_cols = get_required_columns()
        for req in required_cols:
            matched = False
            if req.header_path in discovered_keys:
                matched = True
            else:
                for alias in req.aliases:
                    if alias in discovered_keys:
                        matched = True
                        break
            if not matched:
                raise ValidationError(
                    f"Missing required column: '{req.field_name}' ({req.header_path}).",
                    sheet_name=sheet_name,
                    column=req.header_path,
                )


def parse_and_validate_record(
    raw_record: dict[str, Any],
    sheet_name: str,
    row_idx: int,
) -> dict[str, Any]:
    """
    Transform a raw flat record into a canonical typed dictionary.
    Fails loudly if required fields are missing or if unparseable values are encountered.
    """
    typed_record: dict[str, Any] = {
        "_sheet": sheet_name,
        "_row_idx": row_idx,
    }

    for key, val in raw_record.items():
        if key.startswith("_"):
            typed_record[key] = val
            continue

        # Skip formatting metadata keys like _bold, _comment, _html for type validation
        # but preserve them in typed_record under their key
        if any(key.endswith(suffix) for suffix in ("_bold", "_comment", "_html")):
            typed_record[key] = val
            continue

        col_def = get_column_def(key)
        if col_def is None:
            # Check if it was transformed or normalized
            continue

        if col_def.ignore:
            continue

        try:
            parsed_val = col_def.parser(val)
        except Exception as e:
            raise ValidationError(
                f"Failed to parse value {val!r} as {col_def.parser_type}: {e}",
                sheet_name=sheet_name,
                column=key,
                row_idx=row_idx,
            ) from e

        if col_def.required_value:
            is_empty = parsed_val is None or parsed_val == "" or parsed_val == []
            if is_empty:
                raise ValidationError(
                    f"Required column '{col_def.field_name}' has empty value {val!r}",
                    sheet_name=sheet_name,
                    column=key,
                    row_idx=row_idx,
                )

        typed_record[col_def.field_name] = parsed_val

    return typed_record


def validate_records_integrity(records: list[dict[str, Any]]) -> None:
    """Validate cross-record invariants like unique board IDs."""
    assert_unique_ids(records)
