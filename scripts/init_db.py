import sys
import os
from sqlalchemy.orm import Session

# Add project root to sys.path
sys.path.append(os.getcwd())

from models import get_engine, Base, Motherboard, Structure
from data_loader import load_data

def init_db():
    print("Initializing Database...")
    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    
    print("Loading data from Excel...")
    try:
        # load_data now returns list of dicts with 'specs' key populated
        mobo_data, header_tree = load_data()
    except Exception as e:
        print(f"Error loading data: {e}")
        return

    print(f"Inserting {len(mobo_data)} motherboards and structure...")
    
    with Session(engine) as session:
        # Insert Structure
        struct_entry = Structure(id=1, content=header_tree)
        session.add(struct_entry)
        
        # Insert Motherboards
        for m in mobo_data:
            entry = Motherboard(
                id=m['id'],
                brand=m['brand'],
                model=m['model'],
                chipset=m['chipset'],
                specs=m['specs'] # The full hierarchy
            )
            session.add(entry)
        
        session.commit()
    
    print("Database populated successfully.")

if __name__ == "__main__":
    init_db()
