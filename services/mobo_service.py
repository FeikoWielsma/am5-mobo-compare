from sqlalchemy.orm import Session
from models import Motherboard, Structure

class MoboService:
    # Map: Category Name -> { 'feature': Child Feature Name, 'label': Display Label }
    SUMMARY_MAP = {
        'Audio': {'feature': 'Audio Codec+DAC', 'label': 'Codec'},
        'Memory': {'feature': 'RAM slots', 'label': 'Slots'},
        'Rear I/O': {'feature': 'Total USB', 'label': 'Total USB'},
        'Type A': {'feature': 'USBA Total', 'label': 'Total'},
        'Type C': {'feature': 'USB-C Total', 'label': 'Total'},
        'Ethernet': {'feature': 'LAN', 'label': 'LAN'},
        'PCIe Storage': {'feature': 'Total M.2', 'label': 'Total'}
    }

    def __init__(self, session: Session):
        self.session = session

    def get_structure(self):
        """Fetches the raw structure tree."""
        struct = self.session.query(Structure).get(1)
        return struct.content if struct else []

    def get_enriched_structure(self):
        """Fetches structure and applies summary logic."""
        structure = self.get_structure()
        self._enrich_structure_recursive(structure)
        return structure

    def _enrich_structure_recursive(self, nodes):
        """Recursively adds summary keys to nodes based on SUMMARY_MAP."""
        for node in nodes:
            # If this node maps to a summary feature
            if node['name'] in self.SUMMARY_MAP:
                config = self.SUMMARY_MAP[node['name']]
                target_feature = config['feature']
                label = config['label']
                
                # Find the key for this feature among children
                if 'children' in node:
                    for child in node['children']:
                        if child['name'] == target_feature and 'key' in child:
                            node['summary_key'] = child['key']
                            node['summary_label'] = label
                            break
            # Recurse
            if 'children' in node:
                self._enrich_structure_recursive(node['children'])

    def get_all_mobos(self):
        """Returns all motherboards."""
        return self.session.query(Motherboard).all()

    def get_mobos_by_ids(self, ids: list[str]):
        """Returns motherboards matching the list of IDs."""
        return self.session.query(Motherboard).filter(Motherboard.id.in_(ids)).all()
