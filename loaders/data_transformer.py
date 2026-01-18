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

def normalize_lan_controller(raw_text, valid_controllers):
    """
    Parse raw LAN text into a list of canonical controller names.
    
    Args:
        raw_text (str): Raw text from Excel (e.g. "Realtek RTL8125BG + Intel I225-V")
        valid_controllers (list): List of known canonical controller names from DB/Lookup
        
    Returns:
        list: List of canonical names found (e.g. ['Realtek RTL8125BG', 'Intel I225-V'])
    """
    if not raw_text:
        return []
        
    # 1. Pre-cleaning & Expansion
    text = str(raw_text)
    
    # Common Typos / Abbreviations
    text = re.sub(r'\bRtlk\b', 'Realtek', text, flags=re.IGNORECASE)
    text = re.sub(r'\bRltk\b', 'Realtek', text, flags=re.IGNORECASE)
    text = re.sub(r'E3100G', 'E3100(G)', text, flags=re.IGNORECASE) # Fix Killer E3100G -> E3100(G) match
    
    # handle "Realtek RTL 8125" -> "Realtek RTL8125" (remove space between RTL and number)
    text = re.sub(r'RTL\s+(\d+)', r'RTL\1', text, flags=re.IGNORECASE)

    # Specific mapping for RTL8111 variations to the canonical name in DB which might be "Realtek RTL8111(F/K/EP)"
    # If we see RTL8111H, RTL8111G, etc, we normalize it to "RTL8111" for matching purposes if the specific key doesnt exist
    # But wait, we match against valid_controllers. 
    # Let's forcefully map RTL8111X to a known pattern or handle in matching loop.
    # Actually, let's just clean it here.
    # If the DB has "Realtek RTL8111(F/K/EP)", we want to match that.
    # So if text contains RTL8111, let's keep it but maybe we need a custom matcher below.
    # Let's just rely on the fuzzy matcher but improve it? 
    # No, simpler: Map RTL8111.* to a standard token if needed, but let's see.
    # If I change RTL8111H to just RTL8111, does it match?
    # "Realtek RTL8111" vs "Realtek RTL8111(F/K/EP)".
    # 'REALTEKRTL8111' in 'REALTEKRTL8111FKEP' -> YES.
    # So "Realtek RTL8111" matches. "Realtek RTL8111H" does NOT match because 'H' is not in 'FKEP'.
    
    # So: Strip the suffix letter for 8111 if it's H, G, EPV, etc.
    # Was `RTL8111[A-Z]`, changed to `RTL8111[A-Z]+` or `*` to handle EPV
    text = re.sub(r'RTL8111[A-Z]*', 'RTL8111', text, flags=re.IGNORECASE)
    
    # Generic map for RTL8125 variations (RTL8125D, RTL8125BG -> RTL8125 -> Match Realtek RTL8125)
    text = re.sub(r'RTL8125[A-Z]*', 'RTL8125', text, flags=re.IGNORECASE)
    
    # 2. Split into chunks
    # Split by: comma, &, +, ' and ', newline
    chunks = re.split(r'[,&+/\n]|\s+and\s+', text)
    
    found_controllers = []
    
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
            
        # Handle multipliers like "(2x)" or "x2"
        count = 1
        multi_match = re.search(r'\(?(\d+)x\)?|\b(\d+)x\b|x(\d+)', chunk, re.IGNORECASE)
        if multi_match:
            # Extract number
            nums = [n for n in multi_match.groups() if n]
            if nums:
                count = int(nums[0])
            # Remove the multiplier text to clean up for matching
            chunk = re.sub(r'\(?(\d+)x\)?|\b(\d+)x\b|x(\d+)', '', chunk, flags=re.IGNORECASE)
            
        # Clean chunk further for matching
        clean_chunk = re.sub(r'[^A-Z0-9]', '', chunk.upper())
        
        # 3. Find best match in valid_controllers
        best_match = None
        best_match_len = 0
        
        # We need to find which canonical controller is referenced in this chunk.
        # e.g. chunk="Realtek RTL8125" -> match="Realtek RTL8125BG" (fuzzy) or exact?
        # The user wants "RTL8125" -> "Realtek RTL8125" (2.5G).
        # But if valid_controllers has "Realtek RTL8125BG" and "Realtek RTL8125", preserving specific model is good.
        # But user said "RTL8111... should be 1G cards".
        
        candidates = []
        for vc in valid_controllers:
            vc_clean = re.sub(r'[^A-Z0-9]', '', vc.upper())
            
            # Check if canonical name is in chunk OR chunk is in canonical name
            # We favor strict containment.
            
            # Case A: Chunk contains canonical key (e.g. chunk="Realtek RTL8125BG", vc="RTL8125")
            # Case B: Canonical key contains chunk (e.g. chunk="RTL8125", vc="Realtek RTL8125")
            
            if vc_clean in clean_chunk:
                candidates.append(vc)
            elif clean_chunk in vc_clean and len(clean_chunk) > 4: # Avoid matching short noise
                 # Only if the chunk is specific enough. "Realtek" matches everything, bad.
                 # "RTL8125" matches "Realtek RTL8125BG".
                 if "REALTEK" in clean_chunk and len(clean_chunk) < 8:
                     pass # Skip just "Realtek"
                 else:
                     candidates.append(vc)
                 
        # Selection logic:
        # 1. Prefer longer matches (more specific).
        # 2. Prefer matches that start with "Realtek", "Intel", etc if chunk has it?
        
        if candidates:
            # Sort by length descending to get most specific match (RTL8125BG > RTL8125)
            # BUT wait, the user said "RTL8125's should be identified as 2.5G". 
            # If we match "Realtek RTL8125BG", speed is 2500. Correct.
            # If we match "Realtek RTL8125", speed is 2500. Correct.
            
            # Identify "Generic" vs "Specific".
            # For 8111, any variant is 1G.
            
            # Let's pick the longest candidate that is contained in the chunk (Case A)
            # If none, pick the shortest candidate that contains the chunk (Case B - expansion)?
            # meaningful expansion: "RTL8125" -> "Realtek RTL8125"
            
            # Refined approach:
            # Filter candidates to those compatible with the chunk.
            
            # Priority:
            # 1. Exact match (clean)
            # 2. Chunk contains Vendor + Model (RTL8125)
            
            # Let's use the `clean_chunk` to score.
            
            matches_with_score = []
            for cand in candidates:
                cand_clean = re.sub(r'[^A-Z0-9]', '', cand.upper())
                score = 0
                if cand_clean == clean_chunk:
                    score = 100
                elif cand_clean in clean_chunk:
                    score = 50 + len(cand_clean) # Prefer longer sub-matches
                elif clean_chunk in cand_clean:
                    # Expansion case. Danger of over-matching "Realtek" to "Realtek RTL8125"
                    # Require digit match?
                    if any(c.isdigit() for c in clean_chunk):
                         score = 20 + len(cand_clean) # Prefer picking the canonical name
                    else:
                         score = 0 # Ignore pure alpha matches like "Realtek" expanding to specific
                
                matches_with_score.append((cand, score))
            
            matches_with_score.sort(key=lambda x: x[1], reverse=True)
            
            if matches_with_score and matches_with_score[0][1] > 0:
                best = matches_with_score[0][0]
                
                # Special override: If it's an 8111, map to generic if specific not found or just to unify?
                # User said "All RTL81111 ... identified as 1G". As long as lookup has speed, it's fine.
                
                for _ in range(count):
                    found_controllers.append(best)

    return found_controllers

def calculate_lan_score(lan_text, lan_lookup):
    """
    Calculate total LAN speed score based on lookup table.
    Uses normalize_lan_controller to identify chips first.
    """
    if not lan_text or not lan_lookup:
        return 0
    
    # Use the new normalizer
    # valid_controllers are the keys of lan_lookup
    controllers = normalize_lan_controller(lan_text, list(lan_lookup.keys()))
    
    total_speed = 0
    for c in controllers:
        speed = lan_lookup.get(c, 0)
        total_speed += speed
        
    return total_speed


    return scorecard


def calculate_vrm_score(phase_text, amp_text):
    """
    Calculate VRM score based on Total VCORE Capacity (Phases * Amps).
    Logic:
      - Parse phase count (e.g. '2x12+2+1' -> 2*12=24).
      - Parse amperage (e.g. '110A' -> 110).
      - Score = Phases * Amps.
      - Bonus for SPS (Smart Power Stage)?
    """
    if not phase_text or phase_text == '-':
        return 0
        
    # 1. Parse Phase Count (Vcore part is usually first)
    # Styles: "2x12+2+1", "16+2+1", "8+2+1", "Direct 20+2+1"
    # We want the first number group, handling '2x' multiplier.
    
    # Clean text
    p_text = str(phase_text).strip().lower()
    
    # Try finding 'NxM' pattern first
    match_nx = re.search(r'(\d+)\s*x\s*(\d+)', p_text)
    if match_nx:
        phases = int(match_nx.group(1)) * int(match_nx.group(2))
    else:
        # Fallback to first number found
        match_n = re.search(r'^(\d+)', p_text)
        if match_n:
            phases = int(match_n.group(1))
        else:
            phases = 0
            
    # 2. Parse Amperage
    a_text = str(amp_text).strip().upper() if amp_text else ""
    match_amp = re.search(r'(\d+)A', a_text)
    amps = int(match_amp.group(1)) if match_amp else 0
    
    # If no amps specified, assume a low baseline (e.g. 40A) to at least rank by phase count
    if phases > 0 and amps == 0:
        amps = 40
        
    score = phases * amps
    
    # Small tie-breaker for SPS (better tech)
    if 'SPS' in a_text:
        score += 1
        
    return score

def calculate_usb_header_score(val):
    """
    Calculate score for USB-C Header.
    Logic: Count * Speed.
    Speeds: 20G=200, 10G=100, 5G=50
    """
    if not val or val == '-':
        return 0
        
    # Standard format from loader: "1*20g" or "2*5g"
    # Also handle raw text if needed
    text = str(val).lower()
    
    score = 0
    
    # Regex to find all header instances
    # Matches "1*20g", "1x 20gbps", etc.
    matches = re.findall(r'(\d+)\s*[\*x]\s*(\d+)g', text)
    
    for count, speed in matches:
        c = int(count)
        s = int(speed) # 20, 10, 5
        
        # Weighting
        # 20G is much better than 10G
        weight = s * 10
        score += c * weight
        
    # Fallback if specific formatting fails but text exists (e.g. "Yes")
    if score == 0 and val:
        return 1
        
    return score

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
        'lan_text': '-',
        'wireless': '-',
        'audio': '-',
        'bios_flash_btn': False,
        'debug_text': '-',
        'debug_score': 0,
        'vrm_text': '-',
        'vrm_score': 0,
        'fan_count': 0,
        'argb_count': 0,
        'rgb_count': 0,
        'usbc_header': False,
        'usbc_header_score': 0,
        'vcore_text': '-',
        'vrm_note': '',
        'usb_ports_total': '-',
        'usb_details': {
            'type_a': {'2.0': 0, '3.2_5g': 0, '3.2_10g': 0},
            'type_c': {'3.2_5g': 0, '3.2_10g': 0, '3.2_20g': 0, 'usb4_40g': 0}
        },
        'pcie_x16_total': '-',
        'pcie_x16_cpu': False,
        'pcie_x16_lanes': '-',
        'pcie_x16_lanes_html': '',
        'pcie_x16_details': [],
        'pcie_x16_comment': '',
        'm2_total': '-',
        'm2_details': [],
        'm2_note': '',
        'lan_badges': []
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
            
        # BIOS Flash (Button)
        if "bios flash" in k_lower and "comment" not in k_lower:
             scorecard['bios_flash_btn'] = True

        # Debug features (Internal headers & features|Features|Debug features)
        if "debug features" in k_lower:
             val_str = str(v)
             scorecard['debug_text'] = val_str
             
             # Ranking: Power LED < Debug LED(s) < POST code < LCD display
             score = 0
             v_lower = val_str.lower()
             
             if "lcd" in v_lower:
                 score = 4
             elif "post" in v_lower and "code" in v_lower:
                 score = 3
             elif "debug" in v_lower and "led" in v_lower:
                 score = 2
             elif "power" in v_lower and "led" in v_lower:
                 score = 1
                 
             if score > scorecard['debug_score']:
                 scorecard['debug_score'] = score
                
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
             scorecard['usbc_header'] = str(v) # Store the actual text
             
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
        if "pcie slots" in k_lower and "x16" in k_lower:
            if "total" in k_lower:
                scorecard['pcie_x16_total'] = str(v).replace('.0', '')
            if "electrical lanes" in k_lower:
                if "_bold" in k_lower:
                    scorecard['pcie_x16_cpu'] = True
                    # If we already have plain details, bold them now
                    if scorecard['pcie_x16_details'] and not scorecard.get('pcie_x16_lanes_html'):
                         scorecard['pcie_x16_details'] = [f"<b>{d}</b>" for d in scorecard['pcie_x16_details']]
                if "_html" in k_lower:
                    scorecard['pcie_x16_lanes_html'] = str(v)
                    parts = str(v).split(',')
                    details = []
                    is_in_bold = False
                    for p in parts:
                        p = p.strip()
                        if not p: continue
                        seg = p
                        if is_in_bold and not seg.startswith('<b>'):
                            seg = '<b>' + seg
                        if '<b>' in seg and '</b>' not in seg:
                            seg = seg + '</b>'
                            is_in_bold = True
                        elif '</b>' in seg and '<b>' not in seg:
                            pass
                        elif '</b>' in seg:
                            is_in_bold = False
                        details.append(seg)
                    scorecard['pcie_x16_details'] = details
                elif "_comment" not in k_lower and "_bold" not in k_lower:
                    scorecard['pcie_x16_lanes'] = str(v)
                    if not scorecard.get('pcie_x16_details'):
                        parts = str(v).split(',')
                        details = [p.strip() for p in parts if p.strip()]
                        if scorecard.get('pcie_x16_cpu'):
                            details = [f"<b>{d}</b>" for d in details]
                        scorecard['pcie_x16_details'] = details
                if "_comment" in k_lower:
                    comment = str(v).strip()
                    if comment:
                        if scorecard.get('pcie_x16_comment'):
                            if comment not in scorecard['pcie_x16_comment']:
                                scorecard['pcie_x16_comment'] += " | " + comment
                        else:
                            scorecard['pcie_x16_comment'] = comment
             
        # M.2
        if "storage" in k_lower:
             if "total m.2" in k_lower:
                 scorecard['m2_total'] = str(v).replace('.0', '')
             elif "m.2 (m)" in k_lower and "aic" not in k_lower:
                 if "_comment" in k_lower:
                     scorecard['m2_note'] = str(v)
                 else:
                     matches = re.findall(r'(\d+)\s*[\*x]\s*(\d+)x(\d+)', str(v), re.IGNORECASE)
                     if matches:
                         parsed_m2 = []
                         for m in matches:
                             count, gen, lanes = m
                             parsed_m2.append(f"{count}x Gen{gen}x{lanes}")
                         scorecard['m2_details'] = parsed_m2

    # Calculate Derived Scores
    scorecard['vrm_score'] = calculate_vrm_score(scorecard['vrm_text'], scorecard['vcore_text'])
    scorecard['usbc_header_score'] = calculate_usb_header_score(scorecard.get('usbc_header', '-'))

    return scorecard

def inject_scorecard_lan_badges(scorecard, canonical_ids, lan_lookup):
    """
    Injects pre-calculated LAN badges into the scorecard for consistent UI rendering.
    """
    if not canonical_ids or not lan_lookup:
        return
        
    badges = []
    for cid in canonical_ids:
        speed = lan_lookup.get(cid, 0)
        label = "1G"
        color = "bg-secondary"
        
        if speed >= 10000:
            label = "10G"
            color = "bg-danger"
        elif speed >= 5000:
            label = "5G"
            color = "bg-warning text-dark"
        elif speed >= 2500:
            label = "2.5G"
            color = "bg-info text-dark"
            
        badges.append({
            'name': cid,
            'label': label,
            'speed': speed,
            'color': color
        })
        
    # Sort descending by speed
    badges.sort(key=lambda x: x['speed'], reverse=True)
    scorecard['lan_badges'] = badges


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
        # Normalize keys/aliases (Consistency with unflatten_record)
        key = col['key']
        if "Lane-sharing" in key and "bifurcation" in key:
            # We must also update the path because the tree is built from path components
            col['path'] = ["Notes"] 
            col['name'] = "Details"
            col['key'] = "Notes|Details"

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
