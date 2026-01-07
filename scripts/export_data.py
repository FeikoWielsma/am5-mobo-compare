import json
import os
from models import get_engine, get_session_factory, Motherboard, Structure, LanController

def export_to_static():
    engine = get_engine()
    Session = get_session_factory(engine)
    session = Session()

    # Ensure output directory exists
    data_dir = os.path.join('static', 'data')
    os.makedirs(data_dir, exist_ok=True)

    # 1. Export Motherboards
    print("Exporting motherboards...")
    mobos = session.query(Motherboard).all()
    mobo_list = []
    for m in mobos:
        mobo_list.append(m.to_dict())
    
    with open(os.path.join(data_dir, 'mobos.json'), 'w') as f:
        json.dump(mobo_list, f)

    # 2. Export Structure
    print("Exporting structure...")
    struct = session.query(Structure).get(1)
    if struct:
        with open(os.path.join(data_dir, 'structure.json'), 'w') as f:
            json.dump(struct.content, f)

    # 3. Export LAN Lookup
    print("Exporting LAN lookup...")
    controllers = session.query(LanController).all()
    lan_lookup = {c.name: c.speed for c in controllers}
    with open(os.path.join(data_dir, 'lan_lookup.json'), 'w') as f:
        json.dump(lan_lookup, f)

    session.close()
    print(f"Export complete. Files saved to {data_dir}")

if __name__ == '__main__':
    export_to_static()
