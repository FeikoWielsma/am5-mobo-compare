from sqlalchemy.orm import Session
from models import Motherboard, Structure

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
