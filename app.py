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
    mobos = [m.to_dict() for m in service.get_all_mobos()]
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
    
    # Sort them using service logic
    sorted_mobos = service.sort_mobos(selected_mobos)
    
    # Get Structure (Header Tree)
    structure = service.get_structure()
    
    # Get LAN Lookup
    lan_lookup = service.get_lan_lookup()
    
    return render_template('compare.html', mobos=sorted_mobos, structure=structure, lan_lookup=lan_lookup)

@app.route('/api/mobos')
def api_mobos():
    service = get_service()
    mobos = service.get_all_mobos()
    return jsonify([service.get_minimal_mobo(m) for m in mobos])

if __name__ == '__main__':
    app.run(debug=True, port=5000)
