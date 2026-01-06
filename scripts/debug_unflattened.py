import sys
import os
from sqlalchemy.orm import Session
import json

# Add project root to sys.path
sys.path.append(os.getcwd())
try:
    from models import get_engine, Motherboard
except ImportError:
    pass

def check_data():
    engine = get_engine()
    with Session(engine) as session:
        mobos = session.query(Motherboard).limit(5).all()
        for mobo in mobos:
            print(f"Checking Mobo: {mobo.brand} {mobo.model}")
            print(f"Rear IO keys: {mobo.rear_io.keys() if mobo.rear_io else 'None'}")
            
            if mobo.rear_io and 'USB' in mobo.rear_io:
                 print(f"  USB keys: {mobo.rear_io['USB'].keys()}")
                 print(f"  Total USB: {mobo.rear_io['USB'].get('Total USB')}")
            else:
                 print("  No USB section")
            
            print("-" * 20)

if __name__ == "__main__":
    check_data()
