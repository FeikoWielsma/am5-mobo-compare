from sqlalchemy.orm import Session
from models import Motherboard, Structure, LanController

class MoboService:
    def __init__(self, session: Session):
        self.session = session

    def get_structure(self):
        """Fetches the Header Tree structure."""
        struct = self.session.query(Structure).get(1)
        return struct.content if struct else []

    def get_all_mobos(self):
        """Returns all motherboards."""
        return self.session.query(Motherboard).all()
        
    def get_mobos_by_ids(self, ids):
        """Returns motherboards matching specific IDs."""
        return self.session.query(Motherboard).filter(Motherboard.id.in_(ids)).all()

    def get_lan_lookup(self):
        """Fetches LAN controller lookup table."""
        controllers = self.session.query(LanController).all()
        return {c.name: c.speed for c in controllers}

    def sort_mobos(self, mobos):
        """Sorts motherboards by Chipset, Form Factor, Brand, and Model."""
        chipset_order = {
            'A620': 1, 'A620A': 1, 'A620(A)': 1,
            'B840': 2,
            'B650': 3,
            'B850': 4,
            'B650E': 5,
            'X670': 6,
            'X870': 7,
            'X670E': 8,
            'X870E': 9
        }
        
        ff_order = {
            'E-ATX': 1,
            'ATX': 2, 'ATX-B': 2,
            'μ-ATX': 3, 'm-ATX': 3, 'u-ATX': 3, 'μ-ATX-B': 3,
            'm-ITX': 4, 'BKB ITX': 4
        }
        
        def sort_key(m):
            c_weight = chipset_order.get(m.chipset, 99)
            ff_weight = ff_order.get(m.form_factor, 99)
            brand = (m.brand or "").lower()
            model = (m.model or "").lower()
            return (c_weight, ff_weight, brand, model)
        
        return sorted(mobos, key=sort_key)

    def get_minimal_mobo(self, m):
        """Returns a minimal dictionary representation of a motherboard."""
        return {
            'id': m.id,
            'Brand': m.brand,
            'Model': m.model,
            'Chipset': m.chipset,
            'FormFactor': m.form_factor
        }

    def inject_lan_speed_structure(self, structure):
        """
        Injects 'LAN Speed' into the structure tree under Networking > Ethernet.
        This allows the frontend to show it in the dropdown.
        """
        if not structure:
            return structure
            
        # Traverse to find Networking -> Ethernet
        # Structure is list of dicts: [{'name': 'General', 'children': [...]}, ...]
        
        # Helper to find node by name
        def find_node(nodes, name):
            for node in nodes:
                if node.get('name') == name:
                    return node
            return None

        networking = None
        general = find_node(structure, 'General')
        if general:
             networking = find_node(general.get('children', []), 'Networking')
        
        # Fallback: try root just in case structure changes
        if not networking:
             networking = find_node(structure, 'Networking')

        if networking:
            ethernet = find_node(networking.get('children', []), 'Ethernet')
            if ethernet:
                # Check if already exists to avoid dupes if called multiple times (though mostly per request)
                children = ethernet.get('children', [])
                if not find_node(children, 'LAN Speed'):
                    # Insert 'LAN Speed' virtual node
                    # It needs a 'key' that matches what we inject in data (e.g. 'LanSpeed')
                    children.append({
                        'name': 'LAN Speed',
                        'key': 'LanSpeed',
                        'children': []
                    })
        return structure

    def inject_lan_speed_data(self, mobo_dicts):
        """
        Injects 'LanSpeed' key into each motherboard dict.
        Calculates max speed from _lan_ids.
        """
        lan_lookup = self.get_lan_lookup()
        
        for m in mobo_dicts:
            # Check specs for _lan_ids
            # mobo_dicts comes from m.to_dict(), so structure is flat-ish but specs keys are at root if unflattened?
            # m.to_dict() merges specs into root. So checks 'specs' key?
            # Wait, m.to_dict() implementation: data = {**self.specs} ...
            # So _lan_ids should be at root if it was in specs.
            
            lan_ids = m.get('_lan_ids', [])
            max_speed = 0
            
            if lan_ids:
                for lid in lan_ids:
                    speed = lan_lookup.get(lid, 0)
                    if speed > max_speed:
                        max_speed = speed
            
            # Convert to label
            speed_label = "-"
            if max_speed >= 10000:
                speed_label = "10G"
            elif max_speed >= 5000:
                speed_label = "5G"
            elif max_speed >= 2500:
                speed_label = "2.5G"
            elif max_speed >= 1000:
                speed_label = "1G"
                
            m['LanSpeed'] = speed_label
            
        return mobo_dicts

    def filter_structure_drop_standard(self, structure):
        """
        Recursively filters out Brand, Chipset, Model, and Form Factor from structure.
        Also removes empty groups that result from this filtering.
        """
        if not structure:
            return []
            
        filtered_structure = []
        excluded_names = {'Brand', 'Chipset', 'Model', 'Form Factor', 'Website', 'Rear I/O Image'}
        # Specific known keys to exclude if they don't match by name for some reason
        excluded_keys = {
            'Brand', 
            'Chipset', 
            'Model', 
            'Motherboard|General|Form Factor',
            'Links|Website',
            'Rear I/O Image'
        }
        
        for item in structure:
            # Check exclusions
            if item.get('name') in excluded_names:
                continue
            if item.get('key') in excluded_keys:
                continue
                
            # Process children
            if 'children' in item:
                filtered_children = self.filter_structure_drop_standard(item['children'])
                # If it was a group (has children key) and now empty, skip it
                if not filtered_children:
                    continue
                
                # Create a copy to avoid mutating the original cached structure
                new_item = item.copy()
                new_item['children'] = filtered_children
                filtered_structure.append(new_item)
            else:
                filtered_structure.append(item)
                
        return filtered_structure
