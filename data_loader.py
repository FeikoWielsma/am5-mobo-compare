import pandas as pd
import warnings
import openpyxl
import re

# Suppress specific warnings
warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')

EXCEL_FILE = "AM5 Motherboards Sheet (X870_X670_B850_B650_B840_A620).xlsx"
SHEETS_TO_LOAD = ['X870E', 'X670(E)', 'X870', 'B850', 'B650(E)', 'B840', 'A620(A)']

def build_header_tree(columns_info):
    """
    Reconstructs the header hierarchy tree from the flat list of column info.
    columns_info = [{'path': ['General', 'Audio'], 'name': 'Codec', 'key': ...}, ...]
    Returns a nested list/dict structure:
    [
      {'name': 'General', 'children': [
         {'name': 'Audio', 'children': [
            {'name': 'Codec', 'key': 'General|Audio|Codec'}
         ]}
      ]}
    ]
    """
    tree = []
    
    def get_or_create_node(current_level, name):
        for node in current_level:
            if node['name'] == name:
                return node
        new_node = {'name': name, 'children': []}
        current_level.append(new_node)
        return new_node

    for col in columns_info:
        # col['path'] is parent stack, col['name'] is leaf
        full_path = col['path'] + [col['name']]
        
        current_level = tree
        for i, part in enumerate(full_path):
            is_leaf = (i == len(full_path) - 1)
            
            if is_leaf:
                # Key leaf node
                # Check if it already exists (unlikely given strict paths, but possible with duplicates)
                found = False
                for node in current_level:
                    if node['name'] == part:
                        node['key'] = col['key'] # Assign key to existing node if it was previously just a parent?
                        found = True
                        break
                if not found:
                    current_level.append({'name': part, 'key': col['key']})
            else:
                # Parent node
                parent = get_or_create_node(current_level, part)
                current_level = parent['children']
                
    return tree

def unflatten_record(record):
    """
    Generic unflattening of pipe-delimited keys.
    'General|Audio|Codec': 'ALC4080' -> {'General': {'Audio': {'Codec': 'ALC4080'}}}
    """
    nested = {}
    for key, value in record.items():
        if value is None: value = ""
        clean_val = str(value).strip()
        
        # We expect keys to be pipe-delimited from the loader logic below
        parts = key.split('|')
        
        current = nested
        for i, part in enumerate(parts[:-1]):
            if part not in current:
                current[part] = {}
            current = current[part]
            if not isinstance(current, dict):
                 # Collision: Key is both a leaf and a parent. 
                 # Convert leaf to dict with special value key? Or just overwrite?
                 # In this sheet, this shouldn't happen.
                 current = {}
        
        last = parts[-1]
        current[last] = clean_val
        
    return nested

def load_data():
    all_mobos = []
    final_header_tree = []
    
    try:
        print(f"Loading Excel file: {EXCEL_FILE}...")
        wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
        xl_pd = pd.ExcelFile(EXCEL_FILE, engine='openpyxl')
        
        # We need to process headers exactly once to build the canonical tree
        # Assuming all sheets share same structure (mostly true for AM5 sheet).
        # We'll use the first found sheet to build the 'Structure'.
        structure_built = False
        
        for sheet_name in SHEETS_TO_LOAD:
            if sheet_name not in wb.sheetnames: 
                continue
                
            print(f"Processing sheet: {sheet_name}")
            ws = wb[sheet_name]
            
            # --- HEADER FINDING ---
            max_col_to_read = min(ws.max_column, 250)
            data_rows = []
            for r in range(1, 25):
                row_vals = []
                for c in range(1, max_col_to_read + 1):
                    val = ws.cell(row=r, column=c).value
                    row_vals.append(str(val).strip() if val is not None else "")
                data_rows.append(row_vals)
            
            anchor_row_idx = -1
            for i, row in enumerate(data_rows):
                if "Brand" in row and "Model" in row:
                    anchor_row_idx = i
                    break
            
            if anchor_row_idx == -1: continue # Skip if no header found

            primary_header_idx = anchor_row_idx + 1 # The row below Brand/Model is usually the start of merges
            
            # --- COMPLEX HEADER PARSING ---
            def parse_complex_headers(worksheet, start_row, end_row):
                header_matrix = []
                mr_list = list(worksheet.merged_cells.ranges)
                
                # Read header block
                for r in range(start_row, end_row + 1):
                    row_cells = []
                    for c in range(1, worksheet.max_column + 1):
                        cell = worksheet.cell(row=r, column=c)
                        val = cell.value
                        
                        # Handle Merges
                        if val is None:
                            for mr in mr_list:
                                if r >= mr.min_row and r <= mr.max_row and c >= mr.min_col and c <= mr.max_col:
                                    val = worksheet.cell(row=mr.min_row, column=mr.min_col).value
                                    break
                        
                        clean_val = str(val).strip().replace('\n', ' ') if val is not None else ""
                        row_cells.append(clean_val)
                    header_matrix.append(row_cells)

                # Transpose to get columns
                leaf_row = header_matrix[-1]
                hierarchy_rows = header_matrix[:-1] # All rows above leaf
                
                cols_info = []
                seen_signatures = set()
                
                for c_idx in range(len(leaf_row)):
                    leaf_val = leaf_row[c_idx]
                    parents = [row[c_idx] for row in hierarchy_rows]
                    
                    # Filter parents
                    clean_parents = []
                    last_p = None
                    for p in parents:
                        p_norm = p.strip()
                        if not p_norm: continue
                        if "Use the tabs" in p_norm: continue
                        if p_norm != last_p:
                            clean_parents.append(p_norm)
                            last_p = p_norm
                    
                    # Heuristic: Remove leaf from parent stack if duplicated
                    if clean_parents and clean_parents[-1] == leaf_val:
                        clean_parents.pop()

                    # Handle empty leaf (auxiliary col?)
                    if not leaf_val and not clean_parents: continue
                    if not leaf_val and clean_parents: 
                         leaf_val = clean_parents.pop() # Promote parent to leaf
                    
                    # Build Key
                    full_path_list = clean_parents + [leaf_val]
                    full_key = "|".join(full_path_list)
                    
                    # Special Case: 'Brand', 'Model' should be strictly those keys
                    if full_key in ['Brand', 'Model', 'Chipset']:
                        pass 
                    elif leaf_val in ['Brand', 'Model', 'Chipset']:
                        full_key = leaf_val # Flatten specific identities
                    
                    # Dedupe columns (exact duplicate headers)
                    sig = full_key
                    if sig in seen_signatures: continue
                    seen_signatures.add(sig)

                    cols_info.append({
                        'key': full_key,
                        'name': leaf_val,
                        'path': clean_parents,
                        'col_idx': c_idx
                    })
                return cols_info

            # Assuming headers are roughly rows anchor+1 to anchor+1 (simple) 
            # OR we scan until we hit data?
            # In this sheet, there are often 2-3 header rows. 
            # Using the previous logic, we identified 'Brand' row. 
            # Rows ABOVE 'Brand' might be super-headers? 
            # Actually, standard format is: 
            # Row X: Category (Rear I/O)
            # Row X+1: SubCat (USB)
            # Row X+2: Leaf (Type A) -> Anchor Row?
            # Let's assume Anchor Row is the LEAF row (contains Brand/Model).
            # So we look UP from anchor row specifically.
            
            # Let's look 4 rows up from anchor row
            start_scan_row = max(1, anchor_row_idx - 4)
            sheet_cols = parse_complex_headers(ws, start_scan_row, anchor_row_idx + 1)
            
            # Filter cols that are practically empty or junk
            valid_cols = []
            for col in sheet_cols:
                if col['key'].lower().startswith('notes'): continue
                if 'missing' in col['key'].lower(): continue
                valid_cols.append(col)
                
            if not structure_built:
                 final_header_tree = build_header_tree(valid_cols)
                 structure_built = True

            # --- PARSE DATA ---
            # Data starts after the leaf header row (anchor_row_idx + 1 is leaf row index 1-based?)
            # Wait, `parse_complex_headers` assumed end_row is leaf.
            # So data starts at anchor_row_idx + 2
            
            data_start_row = anchor_row_idx + 2
            
            # Use Pandas to read data efficiently, but we need mapping to our keys
            # Read all relevant columns
            cols_to_read = [c['col_idx'] for c in valid_cols]
            
            # Pandas read_excel with usecols is tricky with list of ints if not contiguous?
            # Easier to just read dense and select
            df = pd.read_excel(EXCEL_FILE, sheet_name=sheet_name, header=None, skiprows=data_start_row - 1)
            # skiprows is 0-indexed. data_start_row is 1-indexed.
            # If data is at row 5 (1-based), we skip 4. 
            
            # Select columns
            # df columns are 0-indexed. valid_cols['col_idx'] are 0-indexed from matrix logic
            try:
                current_df = df.iloc[:, cols_to_read]
            except IndexError:
                continue # Sheet might be empty or diff structure
                
            current_df.columns = [c['key'] for c in valid_cols]
            
            # Filter
            if 'Model' in current_df.columns:
                current_df = current_df.dropna(subset=['Model'])
                current_df = current_df[current_df['Model'].astype(str).str.strip() != ""]
            
            records = current_df.to_dict('records')
            
            for idx, r in enumerate(records):
                # Identity
                # Aggressively clean newlines from all values, as they break layouts and URLs
                r_clean = {k: str(v).strip().replace('\n', ' ') for k,v in r.items() if pd.notna(v)}
                
                brand = r_clean.get('Brand', '')
                model = r_clean.get('Model', '')
                # Ensure ID is safe
                safe_model = model.replace(' ', '_').replace('/', '-').replace('\\', '-')
                unique_id = f"{sheet_name}_{idx}_{safe_model}"
                
                # Unflatten
                nested = unflatten_record(r_clean)
                
                payload = {
                    'id': unique_id,
                    'brand': brand,
                    'model': model,
                    'chipset': r_clean.get('Chipset', ''),
                    'specs': nested
                }
                all_mobos.append(payload)

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return [], []
        
    return all_mobos, final_header_tree

if __name__ == "__main__":
    d, s = load_data()
    print(f"Loaded {len(d)} mobos")
    import json
    if s:
        print("Header Tree Sample:")
        print(json.dumps(s[:2], indent=2))
