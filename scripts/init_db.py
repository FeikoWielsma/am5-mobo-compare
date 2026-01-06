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
        mobo_data, mobo_structure = load_data()
    except Exception as e:
        print(f"Error loading data: {e}")
        return

    print(f"Inserting {len(mobo_data)} motherboards and structure...")
    
    with Session(engine) as session:
        # Insert Structure
        struct_entry = Structure(id=1, content=mobo_structure)
        session.add(struct_entry)
        
        # Insert Motherboards
        for m in mobo_data:
            entry = Motherboard(
                id=m.get('id'),
                brand=m.get('Brand', ''),
                model=m.get('Model', ''),
                chipset=m.get('Chipset', ''),
                
                # New Components matching Excel
                general=m.get('general'),
                rear_io=m.get('rear_io'),
                video_outs=m.get('video_outs'),
                expansion=m.get('expansion'),
                memory=m.get('memory'),
                network=m.get('network'),
                audio=m.get('audio'),
                vrm=m.get('vrm'),
                internal_io=m.get('internal_io'),
                
                data=m # Keep full data
            )
            session.add(entry)
        
        session.commit()
    
    print("Database populated successfully.")

if __name__ == "__main__":
    init_db()
