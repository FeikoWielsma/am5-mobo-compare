import sys
import os
from sqlalchemy.orm import Session
import json

# Add project root to sys.path
sys.path.append(os.getcwd())
from models import get_engine, Motherboard

def check_data():
    engine = get_engine()
    with Session(engine) as session:
        mobo = session.query(Motherboard).first()
        if mobo:
            print(f"Checking Mobo: {mobo.brand} {mobo.model}")
            print("-" * 20)
            print(f"Audio: {mobo.audio}")
            print(f"Network: {mobo.network}")
            print(f"Memory: {mobo.memory}")
            print(f"VRM: {mobo.vrm}")
            print(f"Internal IO: {mobo.internal_io}")
            
            # Check raw keys to see if we missed extraction
            print("-" * 20)
            print("Raw Data Keys Sample:")
            print(list(mobo.data.keys())[:10])

if __name__ == "__main__":
    check_data()
