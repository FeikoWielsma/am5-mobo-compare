"""
Main Excel data loading orchestration for AM5 motherboards.

This module coordinates the entire data loading pipeline:
    1. Load Excel workbook
    2. For each sheet: detect headers, parse data, unflatten records
    3. Build canonical header tree structure
    4. Return (motherboards, structure) for database insertion

Functions:
    load_data: Main entry point for loading all motherboard data
"""

import pandas as pd
import openpyxl
import warnings
import re

from .config import EXCEL_FILE, SHEETS_TO_LOAD, SKIP_HEADER_PATTERNS
from .header_parser import (
    find_leaf_header_row,
    determine_header_range,
    parse_multi_level_headers
)
from .data_transformer import (
    unflatten_record,
    build_header_tree,
    clean_record_values
)

# Suppress openpyxl warnings about styles/formatting (we only read data values)
warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')


def load_data():
    """
    Load and parse AM5 motherboard data from Excel file.
    
    Reads the Excel file specified in config, parses complex multi-level headers,
    extracts data rows, and transforms everything into hierarchical JSON structures.
    
    Returns:
        tuple: (motherboards, header_tree)
            motherboards: List of dicts, each containing:
                - id: Unique identifier (sheet_idx_model)
                - brand: Manufacturer name
                - model: Motherboard model name
                - chipset: Chipset name (X870E, B650, etc.)
                - specs: Nested dict with all specifications
            
            header_tree: Nested list/dict structure representing the header hierarchy,
                        used for UI rendering and navigation
                        
    Examples:
        >>> mobos, structure = load_data()
        >>> len(mobos)
        150  # Approximate, depends on Excel file
        >>> mobos[0]['brand']
        'ASUS'
        >>> mobos[0]['specs']['General']['Audio']['Codec']
        'ALC4080'
    """
    all_mobos = []
    final_header_tree = []
    structure_built = False
    
    try:
        print(f"Loading Excel file: {EXCEL_FILE}...")
        wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
        
        # Process each sheet
        for sheet_name in SHEETS_TO_LOAD:
            if sheet_name not in wb.sheetnames:
                print(f"  Warning: Sheet '{sheet_name}' not found, skipping")
                continue
            
            print(f"Processing sheet: {sheet_name}")
            ws = wb[sheet_name]
            
            # Step 1: Find leaf header row (contains "Brand" and "Model")
            leaf_row = find_leaf_header_row(ws)
            if leaf_row == -1:
                print(f"  Warning: Could not find header row in '{sheet_name}', skipping")
                continue
            
            # Step 2: Determine full header range
            start_row, end_row = determine_header_range(ws, leaf_row)
            print(f"  Header block: Rows {start_row}-{end_row} (leaf at {leaf_row})")
            
            # Step 3: Parse headers into column info
            sheet_cols = parse_multi_level_headers(ws, start_row, end_row)
            
            # Filter out junk columns
            valid_cols = [
                col for col in sheet_cols
                if not any(skip.lower() in col['key'].lower() for skip in SKIP_HEADER_PATTERNS)
            ]
            
            # Step 4: Build header tree (once, from first sheet)
            if not structure_built:
                final_header_tree = build_header_tree(valid_cols)
                structure_built = True
            
            # Step 5: Load data rows using openpyxl (to capture comments)
            data_start_row = end_row + 1  # Start reading data after header
            records = []
            
            # Read rows directly from worksheet
            for row_idx in range(data_start_row, ws.max_row + 1):
                record = {}
                has_model = False
                
                # Read each column's value and comment
                for col_info in valid_cols:
                    col_idx = col_info['col_idx'] + 1  # openpyxl uses 1-indexed columns
                    cell = ws.cell(row=row_idx, column=col_idx)
                    
                    # Get cell value
                    value = cell.value
                    key = col_info['key']
                    record[key] = value
                    
                    # Check if this is the Model column and has a value
                    if key == 'Model' and value and str(value).strip():
                        has_model = True
                    
                    # Extract comment if present
                    if cell.comment:
                        try:
                            comment_text = cell.comment.text
                            if comment_text:
                                # Clean comment text (remove author prefix if present)
                                comment_text = comment_text.strip()
                                # Store comment with _comment suffix
                                comment_key = f"{key}_comment"
                                record[comment_key] = comment_text
                        except Exception as e:
                            # Silently skip if comment extraction fails
                            pass
                
                # Only add record if it has a Model (skip empty rows)
                if has_model:
                    records.append(record)
            
            # Step 6: Process each motherboard record
            
            for idx, record in enumerate(records):
                # Clean all values (strip, remove newlines, etc.)
                clean_record = clean_record_values(record)
                
                # Extract identity fields
                brand = clean_record.get('Brand', '')
                model = clean_record.get('Model', '')
                chipset = clean_record.get('Chipset', '')
                
                # Generate unique ID
                safe_model = model.replace(' ', '_').replace('/', '-').replace('\\', '-')
                unique_id = f"{sheet_name}_{idx}_{safe_model}"
                
                # Unflatten into hierarchical structure
                nested_specs = unflatten_record(clean_record)
                
                # Create motherboard record
                mobo_record = {
                    'id': unique_id,
                    'brand': brand,
                    'model': model,
                    'chipset': chipset,
                    'specs': nested_specs
                }
                
                all_mobos.append(mobo_record)
            
            print(f"  Loaded {len(records)} motherboards from '{sheet_name}'")
    
    except Exception as e:
        print(f"Error loading data: {e}")
        import traceback
        traceback.print_exc()
        return [], []
    
    print(f"\nTotal motherboards loaded: {len(all_mobos)}")
    return all_mobos, final_header_tree


def load_lan_lookup():
    """
    Load LAN Controller speed mapping from the 'About' sheet.
    Range F8:G20.
    Returns: dict { 'normalized_name': speed_in_mbps }
    """
    try:
        wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
        if "About" not in wb.sheetnames:
            print("Warning: 'About' sheet for LAN lookup not found.")
            return {}
        
        ws = wb["About"]
        lookup = {}
        
        # Rows 8 to 20 approx, but let's go until empty
        # F is col 6, G is col 7
        for row in range(8, 25): # Safety buffer
            name_cell = ws.cell(row=row, column=6)
            speed_cell = ws.cell(row=row, column=7)
            
            name = name_cell.value
            speed_str = speed_cell.value
            
            if not name:
                continue
                
            name = str(name).strip()
            if not speed_str:
                continue
                
            speed_str = str(speed_str).upper()
            
            # Parse speed
            # "Double 25G" -> 50000
            # "2.5G" -> 2500
            # "1G" -> 1000
            
            multiplier = 1
            if "DOUBLE" in speed_str or "DUAL" in speed_str:
                multiplier = 2
            
            base_speed = 0
            if "25G" in speed_str:
                base_speed = 25000
            elif "10G" in speed_str:
                base_speed = 10000
            elif "5G" in speed_str:
                base_speed = 5000
            elif "2.5G" in speed_str:
                base_speed = 2500
            elif "1G" in speed_str:
                base_speed = 1000
            
            total_speed = base_speed * multiplier
            
            if total_speed > 0:
                lookup[name] = total_speed
                
        return lookup
        
    except Exception as e:
        print(f"Error loading LAN lookup: {e}")
        return {}


if __name__ == "__main__":
    # Test loading
    mobos, structure = load_data()
    print(f"\nLoaded {len(mobos)} motherboards")
    
    if mobos:
        print("\nSample motherboard:")
        sample = mobos[0]
        print(f"  ID: {sample['id']}")
        print(f"  Brand: {sample['brand']}")
        print(f"  Model: {sample['model']}")
        print(f"  Chipset: {sample['chipset']}")
        print(f"  Specs keys: {list(sample['specs'].keys())[:5]}...")
    
    if structure:
        import json
        print("\nHeader tree sample (first 2 nodes):")
        print(json.dumps(structure[:2], indent=2))
