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
    # View expects list of dicts (the 'data' column)
    mobos = [m.data for m in service.get_all_mobos()]
    return render_template('index.html', mobos=mobos)

@app.route('/compare')
def compare():
    # Get IDs from query param
    ids_param = request.args.get('ids', '')
    ids = [x.strip() for x in ids_param.split(',') if x.strip()]
    
    service = get_service()
    # Return full Motherboard objects (SQLAlchemy models)
    selected_mobos = service.get_mobos_by_ids(ids)
    
    # Sort them by the order of IDs if possible, or just brand/model
    # For now, simplistic
    
    return render_template('compare.html', mobos=selected_mobos)

@app.route('/api/mobos')
def api_mobos():
    service = get_service()
    mobos = service.get_all_mobos()
    
    def minimal(m):
        d = m.data
        return {
            'id': d.get('id'),
            'Brand': d.get('Brand', ''),
            'Model': d.get('Model', ''),
            'Chipset': d.get('Chipset', '')
        }
    return jsonify([minimal(m) for m in mobos])

if __name__ == '__main__':
    app.run(debug=True, port=5000)
