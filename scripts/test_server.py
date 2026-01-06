import urllib.request
import sys
import os

# Add project root to sys.path
sys.path.append(os.getcwd())
try:
    from models import get_engine, Motherboard
    from sqlalchemy.orm import Session
except ImportError:
    print("Could not import models")
    sys.exit(1)

def test():
    # 1. Get IDs from DB
    engine = get_engine()
    with Session(engine) as session:
        mobos = session.query(Motherboard).limit(3).all()
        ids = [m.id for m in mobos]
    
    print(f"Testing with IDs: {ids}")
    
    # 2. Request Compare
    url = f"http://127.0.0.1:5000/compare?ids={','.join(ids)}"
    try:
        with urllib.request.urlopen(url) as response:
             if response.status == 200:
                 content = response.read().decode('utf-8')
                 print("Success! Page loaded.")
                 if "Rear I/O" in content and "Expansion" in content:
                      print("Found expected headers.")
                 else:
                      print("WARNING: Expected headers not found.")
             else:
                 print(f"Failed: {response.status}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test()
