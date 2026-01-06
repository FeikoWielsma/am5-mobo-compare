# Excel Data Loaders

This package handles parsing AM5 motherboard data from complex Excel spreadsheets with multi-level merged headers.

## Architecture

```
Excel File → Header Parser → Data Transformer → SQLite JSON
```

The pipeline:
1. **Excel File**: Multi-level merged headers with motherboard specifications
2. **Header Parser**: Detects and parses hierarchical headers
3. **Data Transformer**: Converts flat data to nested JSON
4. **SQLite JSON**: Stores in database for Flask app access

## Excel Format

The source Excel file has complex multi-level headers with merged cells:

```
Row 1:  [General -------------------------] [Rear I/O ------------]
Row 2:  [Audio -----] [Memory -----------]  [USB ----------------]
Row 3:  Codec  Jacks  Slots  Max  ECC      Type A  Type C  Total  <- LEAF ROW
Row 4:  DATA   DATA   DATA   DATA DATA     DATA    DATA    DATA
```

We detect the **leaf row** (contains "Brand" and "Model"), scan upward for parent headers,
and build hierarchical keys:

```
General|Audio|Codec
General|Memory|Slots
Rear I/O|USB|Type A
```

## Module Structure

### `config.py`
Configuration constants:
- `EXCEL_FILE`: Source file path
- `SHEETS_TO_LOAD`: Which sheets to process
- `MAX_HEADER_SCAN_ROWS`, `MAX_PARENT_ROWS`: Header detection params
- `SKIP_HEADER_PATTERNS`: Patterns to ignore
- `IDENTITY_COLUMNS`: Columns that stay flat (Brand, Model, Chipset)

### `header_parser.py`
Excel header detection and parsing:
- `find_leaf_header_row()`: Find row with "Brand" and "Model"
- `determine_header_range()`: Get full header span
- `parse_multi_level_headers()`: Parse header block → column info
- `should_skip_header()`: Filter junk headers
- `normalize_header_key()`: Build canonical keys

### `data_transformer.py`
Data transformation utilities:
- `unflatten_record()`: `{'A|B|C': 'val'}` → `{'A': {'B': {'C': 'val'}}}`
- `build_header_tree()`: Build nested tree for UI rendering
- `clean_record_values()`: Strip whitespace, remove newlines

### `excel_loader.py`
Main orchestration:
- `load_data()`: Coordinate entire pipeline
  - Load workbook
  - Process each sheet
  - Return `(motherboards, header_tree)`

## Usage

```python
from loaders import load_data

# Load all data
motherboards, header_tree = load_data()

# motherboards is a list of dicts:
# [
#   {
#     'id': 'X870E_0_ASUS_ROG_Crosshair_X870E_Hero',
#     'brand': 'ASUS',
#     'model': 'ROG Crosshair X870E Hero',
#     'chipset': 'X870E',
#     'specs': {
#       'General': {
#         'Audio': {
#           'Codec': 'ALC4080'
#         }
#       }
#     }
#   },
#   ...
# ]

# header_tree is a nested structure for UI:
# [
#   {
#     'name': 'General',
#     'children': [
#       {
#         'name': 'Audio',
#         'children': [
#           {'name': 'Codec', 'key': 'General|Audio|Codec'}
#         ]
#       }
#     ]
#   }
# ]
```

## Testing

Run the test suite:

```bash
# Fast tests only (unit tests)
pytest tests/ -m "not slow"

# All tests including integration (loads Excel)
pytest tests/ -v

# Coverage report
pytest tests/ --cov=loaders --cov-report=html
```

## Performance

- **Parsing**: ~2-3 seconds for full Excel file
- **Database load**: ~5-6 seconds total
- **Sheets processed**: 7 (X870E, X670(E), X870, B850, B650(E), B840, A620(A))
- **Typical record count**: ~150 motherboards

## Design Decisions

### Why pipe-delimited keys?
Allows flat storage in Excel → hierarchical in JSON without losing information.

### Why separate header parsing?
Excel headers are complex (merged cells, multi-level). Isolating this logic makes it testable and maintainable.

### Why unflatten?
Templates need nested access (`m.dot.general.audio.codec`), not flat (`m['General|Audio|Codec']`).

### Why build header tree?
The UI needs a hierarchical structure for navigation and rendering comparison tables.

## Future Improvements

- [ ] Parallelize sheet processing (ThreadPoolExecutor)
- [ ] Cache parsed headers (avoid re-parsing on incremental loads)
- [ ] Support incremental updates (diff against existing DB)
- [ ] Add validation schema for parsed data
- [ ] Export to other formats (CSV, JSON, YAML)
