"""
Excel data loaders for AM5 motherboard specifications.

This package handles parsing complex Excel spreadsheets with multi-level merged headers
and transforming the data into a hierarchical JSON structure for storage and display.

Architecture:
    Excel → header_parser → data_transformer → SQLite JSON

Modules:
    config: Configuration constants
    header_parser: Excel header detection and parsing
    data_transformer: Data transformation (unflatten, tree building)
    excel_loader: Main orchestration logic
"""

from .excel_loader import load_data
from .data_transformer import unflatten_record, build_header_tree

__all__ = ['load_data', 'unflatten_record', 'build_header_tree']
