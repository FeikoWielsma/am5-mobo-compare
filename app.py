from flask import Flask, render_template, request, jsonify, g
from flask_compress import Compress
from models import get_engine, get_session_factory
from services import MoboService
from services.compare_layout import COMPARE_LAYOUT, resolve_spec
from services.spec_display import (
    USB_SPEED_BADGES,
    USB_TYPE_A_KEYS,
    USB_TYPE_C_KEYS,
    usb_badges_for,
    usb_badge_by_speed,
)

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 31536000
Compress(app)

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
    
    # Inject Virtual Columns (LAN Speed)
    service.inject_lan_speed_data(mobos)
    
    structure = service.get_structure()
    service.inject_lan_speed_structure(structure)
    
    # Filter out standard columns from dropdown
    structure = service.filter_structure_drop_standard(structure)
    
    return render_template(
        'index.html',
        mobos=mobos,
        structure=structure,
        usb_speed_badges=USB_SPEED_BADGES,
        usb_type_a_keys=USB_TYPE_A_KEYS,
        usb_type_c_keys=USB_TYPE_C_KEYS,
    )



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

    # Get LAN Lookup
    lan_lookup = service.get_lan_lookup()

    return render_template(
        'compare.html',
        mobos=sorted_mobos,
        lan_lookup=lan_lookup,
        layout=COMPARE_LAYOUT,
        resolve_spec=resolve_spec,
        usb_badges_for=usb_badges_for,
        usb_badge_by_speed=usb_badge_by_speed,
        usb_type_a_keys=USB_TYPE_A_KEYS,
        usb_type_c_keys=USB_TYPE_C_KEYS,
    )

@app.route('/api/mobos')
def api_mobos():
    service = get_service()
    mobos = service.get_all_mobos()
    return jsonify([service.get_minimal_mobo(m) for m in mobos])

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    # Debug (and its auto-reloader) is on by default for local dev, but the
    # test suite disables it -- the reloader forks a child process that
    # survives terminating the parent.
    debug = os.environ.get('FLASK_DEBUG', '1').lower() not in ('0', 'false', 'no')
    app.run(debug=debug, host='0.0.0.0', port=port)
