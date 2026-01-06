"""
Excel header parsing for multi-level merged headers.

This module handles the complex task of parsing Excel headers that span multiple rows
with merged cells, building a hierarchical structure from them.

The source Excel files have headers like:
    Row 1:  [General -------------------] [Rear I/O -------]
    Row 2:  [Audio ----] [Memory ------]  [USB -----------]
    Row 3:  Codec  Jacks  Slots  Max GB   Type A  Type C     <- LEAF ROW
    
Functions:
    find_leaf_header_row: Locate the row containing 'Brand' and 'Model' markers
    determine_header_range: Find the full span of header rows
    parse_multi_level_headers: Parse the entire header block into column info
    should_skip_header: Check if header text should be ignored
    normalize_header_key: Build canonical key from path components
"""

import re
from .config import SKIP_HEADER_PATTERNS, IDENTITY_COLUMNS


def find_leaf_header_row(worksheet, max_scan_rows=25, max_columns=250):
    """
    Find the row containing 'Brand' and 'Model' column headers.
    
    This row is the "leaf" row - the bottom of the header hierarchy
    where the actual column names live.
    
    Args:
        worksheet: openpyxl worksheet object
        max_scan_rows: How many rows from top to scan
        max_columns: How many columns to read
        
    Returns:
        int: 1-based row number of leaf header row, or -1 if not found
        
    Examples:
        >>> ws = load_workbook('data.xlsx')['Sheet1']
        >>> leaf_row = find_leaf_header_row(ws)
        >>> leaf_row
        4  # Row 4 contains 'Brand' and 'Model'
    """
    for row_num in range(1, max_scan_rows + 1):
        row_vals = []
        for col_num in range(1, max_columns + 1):
            val = worksheet.cell(row=row_num, column=col_num).value
            row_vals.append(str(val).strip() if val is not None else "")
        
        # Check if this row has both Brand and Model
        if "Brand" in row_vals and "Model" in row_vals:
            return row_num
    
    return -1


def determine_header_range(worksheet, leaf_row, max_parent_rows=12):
    """
    Determine the full range of header rows (start to leaf).
    
    Checks if the Brand cell is part of a merged range, and if so,
    uses the bottom of that range as the true leaf row.
    
    Args:
        worksheet: openpyxl worksheet
        leaf_row: Detected leaf row number
        max_parent_rows: Maximum rows above leaf to scan for parents
        
    Returns:
        tuple: (start_row, end_row) both 1-based
    """
    # Find Brand column index
    brand_col_idx = -1
    for col_num in range(1, worksheet.max_column + 1):
        val = worksheet.cell(row=leaf_row, column=col_num).value
        if str(val).strip() == "Brand":
            brand_col_idx = col_num
            break
    
    # Determine actual end row (if Brand is in merged cell, use merge bottom)
    header_end_row = leaf_row
    if brand_col_idx != -1:
        for merge_range in worksheet.merged_cells.ranges:
            if (merge_range.min_row <= leaf_row <= merge_range.max_row) and \
               (merge_range.min_col <= brand_col_idx <= merge_range.max_col):
                header_end_row = merge_range.max_row
                break
    
    # Start row is max_parent_rows above end
    header_start_row = max(1, header_end_row - max_parent_rows)
    
    return header_start_row, header_end_row


def should_skip_header(text, skip_patterns=None):
    """
    Check if header text matches skip patterns.
    
    Args:
        text: Header text to check
        skip_patterns: List of patterns to skip (uses config default if None)
        
    Returns:
        bool: True if text should be skipped
        
    Examples:
        >>> should_skip_header("Use the tabs below")
        True
        >>> should_skip_header("Audio Codec")
        False
    """
    if skip_patterns is None:
        skip_patterns = SKIP_HEADER_PATTERNS
    
    text_lower = text.lower()
    return any(pattern.lower() in text_lower for pattern in skip_patterns)


def normalize_header_key(path_parts, leaf_name):
    """
    Build canonical key from path components.
    
    Handles special cases like Brand/Model/Chipset which should remain flat.
    
    Args:
        path_parts: List of parent names
        leaf_name: Final leaf name
        
    Returns:
        str: Pipe-delimited key
        
    Examples:
        >>> normalize_header_key(['General', 'Audio'], 'Codec')
        'General|Audio|Codec'
        
        >>> normalize_header_key([], 'Brand')
        'Brand'
        
        >>> normalize_header_key(['Motherboard'], 'Brand')
        'Brand'  # Special case: Brand is always flat
    """
    full_path = path_parts + [leaf_name]
    full_key = '|'.join(full_path)
    
    # Special case: Identity columns should be flat
    if full_key in IDENTITY_COLUMNS:
        return full_key
    elif leaf_name in IDENTITY_COLUMNS:
        return leaf_name
    
    return full_key


def parse_multi_level_headers(worksheet, start_row, end_row):
    """
    Parse multi-level Excel headers into flat column info list.
    
    Reads a block of rows containing hierarchical headers (with merged cells),
    and produces a flat list of column metadata suitable for DataFrame creation.
    
    Args:
        worksheet: openpyxl worksheet object
        start_row: First row of header block (1-based)
        end_row: Last row of header block / leaf row (1-based)
        
    Returns:
        List of dicts with keys:
            - 'key': Full pipe-delimited key 'General|Audio|Codec'
            - 'name': Leaf name 'Codec'
            - 'path': Parent path ['General', 'Audio']
            - 'col_idx': 0-based column index in worksheet
            
    Examples:
        >>> ws = load_workbook('data.xlsx')['Sheet1']
        >>> cols = parse_multi_level_headers(ws, start_row=1, end_row=4)
        >>> cols[0]
        {'key': 'Brand', 'name': 'Brand', 'path': [], 'col_idx': 0}
    """
    # Read header block into matrix
    header_matrix = []
    merge_ranges = list(worksheet.merged_cells.ranges)
    
    for row_num in range(start_row, end_row + 1):
        row_cells = []
        for col_num in range(1, worksheet.max_column + 1):
            cell = worksheet.cell(row=row_num, column=col_num)
            val = cell.value
            
            # Handle merged cells: propagate value from merge origin
            if val is None:
                for merge_range in merge_ranges:
                    if (row_num >= merge_range.min_row and row_num <= merge_range.max_row and
                        col_num >= merge_range.min_col and col_num <= merge_range.max_col):
                        val = worksheet.cell(
                            row=merge_range.min_row,
                            column=merge_range.min_col
                        ).value
                        break
            
            # Clean value: remove newlines, strip whitespace
            clean_val = str(val).strip().replace('\n', ' ') if val is not None else ""
            row_cells.append(clean_val)
        
        header_matrix.append(row_cells)
    
    # Extract column info
    # Last row is leaf, all rows above are parents
    leaf_row = header_matrix[-1]
    parent_rows = header_matrix[:-1]
    
    columns_info = []
    seen_keys = set()  # Deduplicate exact duplicate columns
    
    for col_idx, leaf_val in enumerate(leaf_row):
        # Get parent values for this column
        parents = [row[col_idx] for row in parent_rows]
        
        # Filter and deduplicate parents
        clean_parents = []
        last_parent = None
        for parent in parents:
            parent_norm = parent.strip()
            
            # Skip empty, junk patterns, and duplicates
            if not parent_norm:
                continue
            if should_skip_header(parent_norm):
                continue
            if parent_norm == last_parent:
                continue
            
            clean_parents.append(parent_norm)
            last_parent = parent_norm
        
        # Remove leaf from parents if it appears there (merged cell artifact)
        if clean_parents and clean_parents[-1] == leaf_val:
            clean_parents.pop()
        
        # Handle empty leaf: promote last parent
        if not leaf_val and not clean_parents:
            continue  # Empty column, skip
        if not leaf_val and clean_parents:
            leaf_val = clean_parents.pop()
        
        # --- FIX: Clean known suffixes and normalize names ---
        
        # Specific fix for 'Total M.2 (M)' -> 'Total M.2'
        if leaf_val == 'Total M.2 (M)':
            leaf_val = 'Total M.2'

        # Standardize known field locations to match template expectation
        # Template expects: m.dot.expansion.storage.pcie_storage.aic
        if leaf_val == 'AIC':
             clean_parents = ['Expansion', 'Storage', 'PCIe Storage']
             
        # Template expects: m.dot.expansion.storage.pcie_storage.total_m2
        if leaf_val == 'Total M.2':
             clean_parents = ['Expansion', 'Storage', 'PCIe Storage']
             
        # Template expects: m.dot.expansion.storage.pcie_storage.m2_m
        if leaf_val == 'M.2 (M)':
             clean_parents = ['Expansion', 'Storage', 'PCIe Storage']

        # Normalize MOS Heatsink (Some sheets use 'Heatsink' under VRM Config)
        if leaf_val == 'Heatsink' and any('VRM' in p for p in clean_parents):
             leaf_val = 'MOS HS'

        # Normalize 'MOS Heatsink Position' to 'MOS HS' (Common in B840, B650, etc.)
        if leaf_val == 'MOS Heatsink Position':
             leaf_val = 'MOS HS'
        
        # Some sheets use 'VRM Heatsink' at root
        if leaf_val == 'VRM Heatsink':
             leaf_val = 'MOS HS'
             # Ensure it goes to right place if roots are missing
             if 'Power' not in clean_parents:
                 clean_parents = ['Power', 'VRM Configuration']

        # -----------------------------------------------------

        # Build key
        full_key = normalize_header_key(clean_parents, leaf_val)
        
        # Deduplicate exact duplicates
        if full_key in seen_keys:
            continue
        seen_keys.add(full_key)
        
        columns_info.append({
            'key': full_key,
            'name': leaf_val,
            'path': clean_parents,
            'col_idx': col_idx
        })
    
    return columns_info
