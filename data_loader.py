import pandas as pd
import warnings
import openpyxl

# Suppress specific warnings
warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')

EXCEL_FILE = "AM5 Motherboards Sheet (X870_X670_B850_B650_B840_A620).xlsx"
SHEETS_TO_LOAD = ['X870E', 'X670(E)', 'X870', 'B850', 'B650(E)', 'B840', 'A620(A)']

def load_data():
    all_mobos = []
    final_structure = []
    
    try:
        print(f"Loading Excel file: {EXCEL_FILE}...")
        # Load workbook once for structure extraction
        wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
         # Using pandas only for reading data body efficiently?
         # Or just use openpyxl for headers AND pandas for body?
         
        xl_pd = pd.ExcelFile(EXCEL_FILE, engine='openpyxl') # Keep for data body to avoid full parse manual
        
        for sheet_name in SHEETS_TO_LOAD:
            if sheet_name not in wb.sheetnames: 
                continue
                
            print(f"Processing sheet: {sheet_name}")
            ws = wb[sheet_name]
            
            # Read first 20 rows manually to find anchor etc
            # This is fast enough for 20 rows.
            
            data_rows = []
            max_col_to_read = min(ws.max_column, 200) # Limit cols scan
            
            for r in range(1, 21):
                row_vals = []
                for c in range(1, max_col_to_read + 1):
                    val = ws.cell(row=r, column=c).value
                    row_vals.append(str(val).strip() if val is not None else "")
                data_rows.append(row_vals)
            
            # 1. Anchor Row
            anchor_row_idx = -1
            for i, row in enumerate(data_rows):
                if "Brand" in row and "Model" in row:
                    anchor_row_idx = i
                    break
            
            if anchor_row_idx == -1:
                 for i, row in enumerate(data_rows):
                    if "Make" in row and "Board Name" in row:
                        anchor_row_idx = i
                        break
            
            if anchor_row_idx == -1:
                print(f"Skipping {sheet_name}: No header found.")
                continue

            # In OpenPyXL, rows are 1-based, but our data_rows is 0-based.
            # anchor_row_idx (0-based frame) corresponds to Excel Row (anchor_row_idx + 1)
            primary_header_idx = anchor_row_idx + 1 # 0-based index of leaf header
            
            def add_to_tree(tree, path, leaf_key, leaf_name):
                current_level = tree
                for node_name in path:
                    if not node_name: continue
                    found = None
                    for node in current_level:
                        if node.get('name') == node_name and 'children' in node:
                            found = node
                            break
                    if not found:
                        found = {'name': node_name, 'children': []}
                        current_level.append(found)
                    current_level = found['children']
                current_level.append({'name': leaf_name, 'key': leaf_key})

            # Helper to process headers for a sheet
            def process_headers(worksheet, anchors, hierarchy_depth_limit=20):
                # anchors: (anchor_row_idx, primary_header_idx)
                anchor_idx, primary_idx = anchors
                start_row = 0
                max_col = worksheet.max_column
                merged_ranges = list(worksheet.merged_cells.ranges)
                
                # 1. Build ID Matrix (Value, OriginID)
                # OriginID = "M_r_c" for merge, "C_r_c" for single
                header_matrix = []
                
                for r_idx in range(start_row, primary_idx + 1):
                    excel_row = r_idx + 1
                    row_data = []
                    for c_idx in range(max_col):
                         excel_col = c_idx + 1
                         cell = worksheet.cell(row=excel_row, column=excel_col)
                         val = cell.value
                         origin = f"C_{excel_row}_{excel_col}"
                         
                         if val is None:
                             for mr in merged_ranges:
                                 if excel_row >= mr.min_row and excel_row <= mr.max_row:
                                     if excel_col >= mr.min_col and excel_col <= mr.max_col:
                                         tl_cell = worksheet.cell(row=mr.min_row, column=mr.min_col)
                                         val = tl_cell.value
                                         origin = f"M_{mr.min_row}_{mr.min_col}"
                                         break
                         
                         clean_val = str(val).strip().replace('\n', ' ') if val is not None else ""
                         row_data.append({'val': clean_val, 'id': origin})
                    header_matrix.append(row_data)

                leaf_row = header_matrix[-1]
                hierarchy_rows = header_matrix[:-1]
                
                # Filter hierarchy garbage
                valid_hierarchy_rows = []
                for idx, r_data in enumerate(hierarchy_rows):
                    # Check first cell val
                    first_val = r_data[0]['val'].lower()
                    if "use the tabs" in first_val: continue
                    if "missing/incorrect" in first_val: continue
                    if "contact me" in first_val: continue
                    if all(x['val'] == "" for x in r_data): continue
                    valid_hierarchy_rows.append(r_data)
                hierarchy_rows = valid_hierarchy_rows
                
                columns_info = [] # List of {key, name, path, col_idx (original)}
                seen_signatures = set()
                seen_key_counts = {}
                last_valid_col_info = None 
                
                for col_idx in range(len(leaf_row)):
                    # Build Signature from IDs
                    col_ids = [row[col_idx]['id'] for row in hierarchy_rows]
                    col_ids.append(leaf_row[col_idx]['id'])
                    signature = tuple(col_ids)
                    
                    if signature in seen_signatures:
                        # Duplicate due to merge expansion -> Skip
                        continue
                    seen_signatures.add(signature)
                    
                    # Build Content
                    h_vals = [row[col_idx]['val'] for row in hierarchy_rows]
                    leaf_val = leaf_row[col_idx]['val'].replace('\n', ' ')
                    if leaf_val.lower() == 'nan': leaf_val = ""
                    
                    # Refine Content
                    clean_parents = [p for p in h_vals if p]
                    
                    # Dedupe consecutive parents
                    if clean_parents:
                        dedupped = [clean_parents[0]]
                        for p in clean_parents[1:]:
                            if p != dedupped[-1]: dedupped.append(p)
                        clean_parents = dedupped
                        
                        # Flatten leaf - Recursive pop
                        # If a parent chain is [A, B, B, B] and leaf is B, we want just A -> B.
                        # Logic:
                        # 1. Look at the last parent.
                        # 2. If it "matches" the leaf, pop it.
                        # 3. Repeat.

                        while clean_parents:
                            last_p = clean_parents[-1].lower()
                            l_name = leaf_val.lower()
                            
                            should_pop = False
                            
                            # Exact match logic (ignoring simple whitespace diffs)
                            if l_name.strip() == last_p.strip():
                                should_pop = True
                                
                            # Substring logic for "Header" vs "Header Name"
                            # e.g. "BIOS Flash header" vs "BIOS Flash"
                            # But be careful not to pop "USB" for "USB 2.0"
                            # We only flatten if Leaf is contained in Parent (Parent is wrapper/header)
                            # We DO NOT flatten if Parent is contained in Leaf (Parent is Category like "Audio")
                            elif len(l_name) > 4 and len(last_p) > 4:
                                if l_name in last_p:
                                    # "BIOS Flash" in "BIOS Flash header" -> True. POP parent.
                                    should_pop = True
                                # REMOVED: elif last_p in l_name:
                                # "Audio" in "Audio Codec" -> True. DO NOT POP parent.
                            
                            if should_pop:
                                clean_parents.pop()
                            else:
                                break

                    # --- AUXILIARY COLUMN DETECTION ---
                    # Logic: If this column looks like a "Picture" column for the previous one.
                    # Criteria:
                    # 1. We have a last_valid_col_info
                    # 2. Parents match exactly
                    # 3. Leaf is empty (or just "Picture"?)
                    # 4. Previous leaf was NOT empty
                    
                    is_aux = False
                    if last_valid_col_info:
                        prev_parents = last_valid_col_info['path']
                        prev_name = last_valid_col_info['name']
                        
                        # Check parents match
                        if clean_parents == prev_parents:
                            if not leaf_val and prev_name:
                                # This is likely the "Picture" column for the previous "Header"
                                is_aux = True
                    
                    if is_aux:
                        # Skip adding this column
                        # But wait, does this mean we handle the image? No, we skip for now.
                        continue

                    if not leaf_val:
                        if clean_parents: leaf_val = clean_parents.pop()
                        else: 
                            # Unnamed but NEW signature? Keep it?
                            leaf_val = f"Unnamed_{col_idx}"

                    # Override
                    # Override
                    if "Rear I/O Image" in leaf_val:
                        clean_parents = ["Rear I/O Image"]
                        leaf_val = "View"
                    elif "Total USB" in leaf_val:
                        # Force sibling status with Type A/C
                        clean_parents = ['Rear I/O', 'USB']
                    elif "Lane-sharing" in leaf_val and "bifurcation" in leaf_val:
                        # Rename and promote to Root
                        clean_parents = ["Notes"]
                        leaf_val = "Details"
                    
                    # Key Gen
                    if leaf_val in ["Brand", "Make"]: base_key = "Brand"
                    elif leaf_val in ["Model", "Board Name"]: base_key = "Model"
                    elif leaf_val in ["Chipset", "Form Factor"]: base_key = leaf_val
                    else:
                        path_str = "|".join(clean_parents + [leaf_val])
                        base_key = path_str
                    
                    # Unique Key Enforcement
                    if base_key in seen_key_counts:
                        seen_key_counts[base_key] += 1
                        final_key = f"{base_key}_{seen_key_counts[base_key]}"
                    else:
                        seen_key_counts[base_key] = 1
                        final_key = base_key
                        
                    current_col_info = {
                        'key': final_key,
                        'name': leaf_val,
                        'path': clean_parents,
                        'original_col_idx': col_idx
                    }
                    columns_info.append(current_col_info)
                    last_valid_col_info = current_col_info
                    
                return columns_info

            # 2. Capture Structure (Once)
            if not final_structure and anchor_row_idx > 0:
                 cols_info = process_headers(ws, (anchor_row_idx, primary_header_idx))
                 
                 for col in cols_info:
                     add_to_tree(final_structure, col['path'], col['key'], col['name'])

            # 3. Load Data with Synthesized Headers
            # Process headers for CURRENT sheet
            sheet_cols_info = process_headers(ws, (anchor_row_idx, primary_header_idx))
            
            # Map to all columns (we need full list for dataframe? No, we filter)
            # data_loader strategy: 
            # 1. Read ALL data (header=None)
            # 2. Filter columns matching 'original_col_idx'
            # 3. Assign keys
            
            data_start_idx = primary_header_idx + 1
            df_data = xl_pd.parse(sheet_name, header=None, skiprows=data_start_idx)
            
            # Filter and Rename
            valid_indices = [c['original_col_idx'] for c in sheet_cols_info]
            valid_keys = [c['key'] for c in sheet_cols_info]
            
            # Pandas might have fewer columns if trailing empty?
            # Ensure indices are valid
            max_pd_col = len(df_data.columns)
            safe_indices = []
            safe_keys = []
            
            for idx, k in zip(valid_indices, valid_keys):
                if idx < max_pd_col:
                   safe_indices.append(idx)
                   safe_keys.append(k)
            
            df_data = df_data.iloc[:, safe_indices]
            df_data.columns = safe_keys
            
            if "Model" in df_data.columns:
                df_data = df_data.dropna(subset=["Model"])
                df_data = df_data[df_data["Model"].astype(str).str.strip() != ""]
            if "Brand" in df_data.columns:
                df_data["Brand"] = df_data["Brand"].ffill()
                
            records = df_data.to_dict('records')
            for idx, record in enumerate(records):
                 raw_model = str(record.get('Model', ''))
                 safe_model = raw_model.replace('\n', ' ').strip().replace(' ', '_').replace('/', '-').replace('\\', '-')
                 while '__' in safe_model: safe_model = safe_model.replace('__', '_')
                 record['id'] = f"{sheet_name}_{idx}_{safe_model}"
                 record['Sheet'] = sheet_name
                 clean_record = {k: (v if pd.notna(v) else "") for k, v in record.items()}
                 all_mobos.append(clean_record)

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return [], []
        
    return all_mobos, final_structure

if __name__ == "__main__":
    d, s = load_data()
    # Debug
    for n in s:
        if n['name'] == 'Rear I/O':
             print("Rear I/O children:")
             for c in n['children']:
                 if 'children' in c:
                    print(f"  {c['name']} -> {[x.get('key', 'NODE:'+x['name']) for x in c['children']]}")
