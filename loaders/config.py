"""
Configuration constants for AM5 motherboard data loading.

This module centralizes all configuration parameters used during Excel parsing,
making it easy to adjust thresholds and patterns without touching core logic.
"""

# Excel file and sheets to process
EXCEL_FILE = "AM5 Motherboards Sheet (X870_X670_B850_B650_B840_A620).xlsx"
SHEETS_TO_LOAD = ['X870E', 'X670(E)', 'X870', 'B850', 'B650(E)', 'B840', 'A620(A)']

# Header detection parameters
MAX_HEADER_SCAN_ROWS = 25  # How many rows to scan looking for "Brand" marker row
MAX_PARENT_ROWS = 12       # How far above leaf header to look for parent headers
MAX_COLUMNS = 250          # Maximum columns to read per sheet (performance limit)

# Header filtering - patterns to ignore in header text
SKIP_HEADER_PATTERNS = [
    "Use the tabs",
    "Missing/incorrect information"
]

# Special identity columns that should remain flat (not hierarchical)
IDENTITY_COLUMNS = ['Brand', 'Model', 'Chipset']
