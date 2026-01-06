import sys
import os
from sqlalchemy.orm import Session

# Add project root to sys.path
sys.path.append(os.getcwd())

from models import get_engine, Motherboard
import json

def inspect_keys():
    engine = get_engine()
    with Session(engine) as session:
        mobo = session.query(Motherboard).first()
        if mobo:
            # Print top-level keys
            keys = list(mobo.data.keys())
            keys.sort()
            print("Total Keys:", len(keys))
            print("Sample Keys:")
            for k in keys[:20]:
                print(f" - {k}")
            
            # Check for specific "complex" keys
            print("\nAudio Keys:")
            print([k for k in keys if "Audio" in k])
            
            print("\nUSB Keys:")
            print([k for k in keys if "USB" in k])

if __name__ == "__main__":
    inspect_keys()
