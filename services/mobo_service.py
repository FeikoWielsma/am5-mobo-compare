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
