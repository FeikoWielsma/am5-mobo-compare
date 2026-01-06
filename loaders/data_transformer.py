"""
Data transformation utilities for motherboard specifications.

This module handles converting flat Excel data with pipe-delimited keys
into nested hierarchical structures suitable for JSON storage and template access.

Functions:
    unflatten_record: Convert flat dict with 'A|B|C' keys → nested {'A': {'B': {'C': value}}}
    build_header_tree: Convert column list → nested tree for UI rendering
    clean_record_values: Sanitize all values in a record
"""


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
    Clean all values in a record (remove newlines, strip whitespace).
    
    Args:
        record: Dict with string values
        
    Returns:
        Dict with cleaned values
        
    Examples:
        >>> clean_record_values({'A': '  foo\\nbar  ', 'B': 123})
        {'A': 'foo bar', 'B': '123'}
    """
    cleaned = {}
    for key, value in record.items():
        if value is None:
            cleaned[key] = ''
        else:
            # Convert to string, strip whitespace, replace newlines with spaces
            cleaned[key] = str(value).strip().replace('\n', ' ')
    return cleaned
