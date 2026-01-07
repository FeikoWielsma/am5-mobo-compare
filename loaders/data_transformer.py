"""
Data transformation utilities for motherboard specifications.

This module handles converting flat Excel data with pipe-delimited keys
into nested hierarchical structures suitable for JSON storage and template access.

Functions:
    unflatten_record: Convert flat dict with 'A|B|C' keys → nested {'A': {'B': {'C': value}}}
    build_header_tree: Convert column list → nested tree for UI rendering
    clean_record_values: Sanitize all values in a record
"""


import re

def calculate_lan_score(lan_text, lan_lookup):
    """
    Calculate total LAN speed score based on lookup table.
    
    Args:
        lan_text (str): The raw LAN controller string (e.g. "Realtek RTL8125, Intel I225-V")
        lan_lookup (dict): Lookup table { 'NORMALIZEDNAME': speed_mbps }
        
    Returns:
        int: Total speed in Mbps
    """
    if not lan_text or not lan_lookup:
        return 0
        
    # 1. Normalize text (remove non-alphanumeric, uppercase)
    # matching logic from parsers.js
    clean_text = re.sub(r'[^A-Z0-9]', '', lan_text.upper())
    
    # Common abbreviations
    # In JS: norm.replace(/Rltk/ig, 'Realtek').replace(/AQC113CS/ig, 'AQC113C')
    # Since we stripped non-alphanumeric, "Rltk" -> "RLTK"
    clean_text = clean_text.replace("RLTK", "REALTEK")
    clean_text = clean_text.replace("AQC113CS", "AQC113C")
    
    matches = []
    
    # 2. Find all potential matches
    for name, speed in lan_lookup.items():
        # key in lookup is likely clean (from excel_loader), but let's ensure
        clean_name = re.sub(r'[^A-Z0-9]', '', name.upper())
        
        if clean_name in clean_text:
            matches.append({
                'name': name,
                'clean': clean_name,
                'speed': speed
            })
            
    # 3. Filter out substrings (e.g. ignore "RTL8111" if "RTL8111H" is present)
    # 3. Filter out substrings (e.g. ignore "RTL8111" if "RTL8111H" is present)
    distinct_matches = []
    for m in matches:
        is_substring = False
        for other in matches:
            if other is m:
                continue
            if m['clean'] in other['clean']:
                is_substring = True
                break
        
        if not is_substring:
            distinct_matches.append(m)
            
    # 4. Sum speeds
    total_speed = sum(m['speed'] for m in distinct_matches)
    return total_speed


def extract_scorecard(record):
    """
    Extracts key specifications for the summary scorecard.
    
    Args:
        record (dict): Flat dictionary of motherboard data (clean_record)
        
    Returns:
        dict: Scorecard data with key specs
    """
    scorecard = {
        'lan_text': '-',
        'wireless': '-',
        'audio': '-',
        'bios_flash_btn': False,
        'vrm_text': '-',
        'fan_count': 0,
        'argb_count': 0,
        'rgb_count': 0,
        'usbc_header': False,
        'vcore_text': '-',
        'vrm_note': '',
        'usb_ports_total': '-',
        'usb_details': {
            'type_a': {'2.0': 0, '3.2_5g': 0, '3.2_10g': 0},
            'type_c': {'3.2_5g': 0, '3.2_10g': 0, '3.2_20g': 0, 'usb4_40g': 0}
        },
        'pcie_x16_total': '-',
        'm2_total': '-',
        'm2_details': []
    }
    
    def parse_count(val):
        if not val or val == '-':
            return 0
        try:
            return int(float(val))
        except:
            return 0

    for k, v in record.items():
        k_lower = k.lower()
        if not v or v == '-':
            continue
            
        # Networking
        if "networking" in k_lower:
            if "lan" in k_lower and ("controller" in k_lower or "ethernet" in k_lower):
                scorecard['lan_text'] = str(v)
            elif "wireless" in k_lower and "comment" not in k_lower:
                scorecard['wireless'] = str(v)
        
        # Audio
        if "audio" in k_lower and "codec" in k_lower and "comment" not in k_lower:
            scorecard['audio'] = str(v)
            
        # BIOS Flash
        if "bios flash" in k_lower and "comment" not in k_lower:
             scorecard['bios_flash_btn'] = True
                
        if "phase config" in k_lower:
            if "comment" in k_lower:
                scorecard['vrm_note'] = (scorecard['vrm_note'] + "\n" + str(v)).strip()
            else:
                scorecard['vrm_text'] = str(v)
                
        # VRM VCore
        if "vrm (vcore)" in k_lower:
            if "comment" in k_lower:
                scorecard['vrm_note'] = (scorecard['vrm_note'] + "\n" + str(v)).strip()
            else:
                scorecard['vcore_text'] = str(v)
            
        # Fans
        if "fan/pump headers" in k_lower:
            scorecard['fan_count'] = parse_count(v)
            
        # RGB
        if "argb" in k_lower or "3-pin" in k_lower:
            if "comment" not in k_lower:
                scorecard['argb_count'] = parse_count(v)
        if "rgb" in k_lower and "argb" not in k_lower and "4-pin" in k_lower:
            if "comment" not in k_lower:
                scorecard['rgb_count'] = parse_count(v)
                
        # USB-C Header
        if ("usb-c" in k_lower or "type-c" in k_lower) and "header" in k_lower:
             scorecard['usbc_header'] = True
             
        # USB Rear Details
        if "rear" in k_lower and "usb" in k_lower:
            val_int = parse_count(v)
            if "type a" in k_lower:
                if "2.0" in k_lower: scorecard['usb_details']['type_a']['2.0'] = val_int
                elif "5gbps" in k_lower: scorecard['usb_details']['type_a']['3.2_5g'] = val_int
                elif "10gbps" in k_lower: scorecard['usb_details']['type_a']['3.2_10g'] = val_int
            elif "type c" in k_lower:
                if "5gbps" in k_lower: scorecard['usb_details']['type_c']['3.2_5g'] = val_int
                elif "10gbps" in k_lower: scorecard['usb_details']['type_c']['3.2_10g'] = val_int
                elif "20gbps" in k_lower: scorecard['usb_details']['type_c']['3.2_20g'] = val_int
                elif "usb4" in k_lower or "40gbps" in k_lower: scorecard['usb_details']['type_c']['usb4_40g'] = val_int

        # USB Ports Total
        if "rear" in k_lower and "usb" in k_lower and "total" in k_lower:
             scorecard['usb_ports_total'] = str(v).replace('.0', '')
             
        # PCIe
        if "pcie slots" in k_lower and "x16" in k_lower and "total" in k_lower:
             scorecard['pcie_x16_total'] = str(v).replace('.0', '')
             
        # M.2
        if "storage" in k_lower:
             if "total m.2" in k_lower:
                 scorecard['m2_total'] = str(v).replace('.0', '')
             elif "m.2 (m)" in k_lower and "aic" not in k_lower:
                 # Parse: "2*5x4 1*4x4" or "2*5x4\n1*4x4"
                 # regex: (\d+)\*(\d+)x(\d+) (allow whitespace and * or x separator)
                 matches = re.findall(r'(\d+)\s*[\*x]\s*(\d+)x(\d+)', str(v), re.IGNORECASE)
                 if matches:
                     parsed_m2 = []
                     for m in matches:
                         count, gen, lanes = m
                         parsed_m2.append(f"{count}x Gen{gen}x{lanes}")
                     scorecard['m2_details'] = parsed_m2

    return scorecard


def unflatten_record(record):
    """
    Convert pipe-delimited flat keys into nested dictionary structure.
    
    Transforms Excel data like:
        {'General|Audio|Codec': 'ALC4080', 'Brand': 'ASUS'}
    Into:
        {'General': {'Audio': {'Codec': 'ALC4080'}}, 'Brand': 'ASUS'}
    
    Args:
        record: Dict with pipe-delimited keys
        
    Returns:
        Nested dictionary with hierarchical structure
        
    Examples:
        >>> unflatten_record({'A|B|C': '123'})
        {'A': {'B': {'C': '123'}}}
        
        >>> unflatten_record({'Brand': 'ASUS', 'General|Socket': 'AM5'})
        {'Brand': 'ASUS', 'General': {'Socket': 'AM5'}}
    """
    nested = {}
    
    for key, value in record.items():
        # Convert None to empty string, strip whitespace
        if value is None:
            value = ""
        clean_val = str(value).strip()
        
        # Normalize keys/aliases
        if "Lane-sharing" in key and "bifurcation" in key:
            key = "Notes|Details"
            
        # Split into path components
        parts = key.split('|')
        
        # Navigate/create nested structure
        current = nested
        for i, part in enumerate(parts[:-1]):
            if part not in current:
                current[part] = {}
            current = current[part]
            
            # Handle collision: key is both leaf and parent
            # (shouldn't happen in well-formed data, but defensive)
            if not isinstance(current, dict):
                current = {}
        
        # Set leaf value
        last = parts[-1]
        
        # Conflict resolution: Do not overwrite an existing dictionary (branch) 
        # with a scalar value (leaf), especially if the scalar is empty.
        # This handles cases where a header row suggests a structure, but 
        # adjacent empty columns promote the parent header as a leaf.
        if last in current and isinstance(current[last], dict):
            if not clean_val or clean_val == '-':
                continue
            # If there is a real value, we strictly shouldn't overwrite the dict.
            # We could store it elsewhere, but for now, structure > value.
            continue
            
        current[last] = clean_val
    
    return nested


def build_header_tree(columns_info):
    """
    Reconstruct hierarchical tree from flat column list.
    
    Converts list of column info dicts into a nested tree structure
    suitable for UI rendering (sidebar navigation, hierarchical display).
    
    Args:
        columns_info: List of dicts with keys:
            - 'path': List of parent names ['General', 'Audio']
            - 'name': Leaf name 'Codec'
            - 'key': Full pipe-delimited key 'General|Audio|Codec'
            
    Returns:
        List of tree nodes with structure:
            [
              {'name': 'General', 'children': [
                 {'name': 'Audio', 'children': [
                    {'name': 'Codec', 'key': 'General|Audio|Codec'}
                 ]}
              ]}
            ]
            
    Examples:
        >>> columns = [
        ...     {'path': ['General', 'Audio'], 'name': 'Codec', 'key': 'General|Audio|Codec'}
        ... ]
        >>> tree = build_header_tree(columns)
        >>> tree[0]['name']
        'General'
        >>> tree[0]['children'][0]['name']
        'Audio'
    """
    tree = []
    
    def get_or_create_node(current_level, name):
        """Find existing node or create new one."""
        for node in current_level:
            if node['name'] == name:
                return node
        new_node = {'name': name, 'children': []}
        current_level.append(new_node)
        return new_node

    for col in columns_info:
        # Build full path: parents + leaf
        full_path = col['path'] + [col['name']]
        
        current_level = tree
        for i, part in enumerate(full_path):
            is_leaf = (i == len(full_path) - 1)
            
            if is_leaf:
                # Leaf node: has 'key'  instead of 'children'
                found = False
                for node in current_level:
                    if node['name'] == part:
                        # Update existing node with key (handles case where node was created as parent first)
                        node['key'] = col['key']
                        found = True
                        break
                
                if not found:
                    current_level.append({'name': part, 'key': col['key']})
            else:
                # Parent node: has 'children'
                parent = get_or_create_node(current_level, part)
                current_level = parent['children']
    
    return tree


def clean_record_values(record):
    """
    Clean all values in a record (remove newlines, strip whitespace, convert floats to ints where appropriate).
    
    Args:
        record: Dict with string values
        
    Returns:
        Dict with cleaned values
        
    Examples:
        >>> clean_record_values({'A': '  foo\\nbar  ', 'B': 123})
        {'A': 'foo bar', 'B': '123'}
        
        >>> clean_record_values({'Total': 3.0, 'Model': 'X870E'})
        {'Total': '3', 'Model': 'X870E'}
    """
    cleaned = {}
    for key, value in record.items():
        if value is None:
            cleaned[key] = ''
        elif isinstance(value, float):
            # Check if float is actually a whole number (3.0 -> 3)
            if value == int(value):
                cleaned[key] = str(int(value))
            else:
                # Keep decimal if it's meaningful (e.g., 3.5)
                cleaned[key] = str(value).strip().replace('\n', ' ')
        else:
            # Convert to string, strip whitespace, replace newlines with spaces
            cleaned[key] = str(value).strip().replace('\n', ' ')
    return cleaned
