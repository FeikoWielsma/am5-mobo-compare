from flask import Flask, render_template, request, jsonify, g
from models import get_engine, get_session_factory
from services import MoboService

app = Flask(__name__)

# Initialize DB connection factory
engine = get_engine()
SessionLocal = get_session_factory(engine)

# Request Context Config
@app.before_request
def get_db():
    if 'db' not in g:
        g.db = SessionLocal()

@app.teardown_request
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def get_service():
    return MoboService(g.db)

@app.route('/')
def index():
    service = get_service()
    # Build dict for template from Motherboard attributes
    mobos = []
    for m in service.get_all_mobos():
        # Merge specs first, then override with authoritative identity fields
        mobo_dict = {**m.specs}
        mobo_dict.update({
            'id': m.id,
            'brand': m.brand,
            'model': m.model,
            'chipset': m.chipset,
            'form_factor': m.form_factor
        })
        mobos.append(mobo_dict)
    structure = service.get_structure()
    return render_template('index.html', mobos=mobos, structure=structure)



@app.route('/compare')
def compare():
    # Get IDs from query param
    ids_param = request.args.get('ids', '')
    ids = [x.strip() for x in ids_param.split(',') if x.strip()]
    
    service = get_service()
    # Return full Motherboard objects (SQLAlchemy models)
    selected_mobos = service.get_mobos_by_ids(ids)
    
    # Sort them: Chipset (worst to best), Form Factor, Brand
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
    
    # Form Factor order: E-ATX, ATX, m-ATX, m-ITX
    ff_order = {
        'E-ATX': 1,
        'ATX': 2, 'ATX-B': 2,
        'μ-ATX': 3, 'm-ATX': 3, 'u-ATX': 3, 'μ-ATX-B': 3,
        'm-ITX': 4, 'BKB ITX': 4
    }
    
    def sort_key(m):
        # 1. Chipset weight
        c_weight = chipset_order.get(m.chipset, 99)
        # 2. Form Factor weight
        ff_weight = ff_order.get(m.form_factor, 99)
        # 3. Brand
        brand = (m.brand or "").lower()
        # 4. Model
        model = (m.model or "").lower()
        return (c_weight, ff_weight, brand, model)
    
    selected_mobos.sort(key=sort_key)
    
    # Get Structure (Header Tree)
    structure = service.get_structure()
    
    # Get LAN Lookup
    lan_lookup = service.get_lan_lookup()
    
    return render_template('compare.html', mobos=selected_mobos, structure=structure, lan_lookup=lan_lookup)

@app.route('/api/mobos')
def api_mobos():
    service = get_service()
    mobos = service.get_all_mobos()
    
    def minimal(m):
        return {
            'id': m.id,
            'Brand': m.brand,
            'Model': m.model,
            'Chipset': m.chipset,
            'FormFactor': m.form_factor
        }
    return jsonify([minimal(m) for m in mobos])

if __name__ == '__main__':
    app.run(debug=True, port=5000)
