from flask import Flask, render_template, request, jsonify
from data_loader import load_data

app = Flask(__name__)

# Global variables to hold data
MOBO_DATA = []
MOBO_STRUCTURE = []

# Load data at startup
try:
    print("Loading data...")
    MOBO_DATA, MOBO_STRUCTURE = load_data()
    print(f"Data loaded: {len(MOBO_DATA)} motherboards.")
    print(f"Structure loaded: {len(MOBO_STRUCTURE)} categories.")
except Exception as e:
    print(f"Failed to load data: {e}")
    MOBO_DATA = []
    MOBO_STRUCTURE = []

@app.route('/')
def index():
    return render_template('index.html', mobos=MOBO_DATA)

@app.route('/compare')
def compare():
    # Get IDs from query param "ids" (comma separated)
    ids_param = request.args.get('ids', '')
    ids = [x.strip() for x in ids_param.split(',') if x.strip()]
    
    selected_mobos = [m for m in MOBO_DATA if m['id'] in ids]
    
    # Enrichment Logic (Controller Layer)
    # Enrichment Logic (Controller Layer)
    # Map: Category Name -> { 'feature': Child Feature Name, 'label': Display Label }
    SUMMARY_MAP = {
        'Audio': {'feature': 'Audio Codec+DAC', 'label': 'Codec'},
        'Memory': {'feature': 'RAM slots', 'label': 'Slots'},
        'Rear I/O': {'feature': 'Total USB', 'label': 'Total USB'},
        'Type A': {'feature': 'USBA Total', 'label': 'Total'},
        'Type C': {'feature': 'USB-C Total', 'label': 'Total'},
        'Ethernet': {'feature': 'LAN', 'label': 'LAN'},
        'PCIe Storage': {'feature': 'Total M.2', 'label': 'Total'}
    }
    
    def enrich_structure(nodes):
        for node in nodes:
            # If this node maps to a summary feature
            if node['name'] in SUMMARY_MAP:
                config = SUMMARY_MAP[node['name']]
                target_feature = config['feature']
                label = config['label']
                
                # Find the key for this feature among children
                if 'children' in node:
                    for child in node['children']:
                        if child['name'] == target_feature and 'key' in child:
                            node['summary_key'] = child['key']
                            node['summary_label'] = label
                            break
            # Recurse
            if 'children' in node:
                enrich_structure(node['children'])

    enrich_structure(MOBO_STRUCTURE)
    
    # Helper for formatting values (strip trailing .0)
    def format_val(val):
        s = str(val).strip()
        if s.endswith('.0') and s[:-2].isdigit():
            return s[:-2]
        return s

    # We now pass the predefined structure instead of guessing keys
    return render_template('compare.html', mobos=selected_mobos, structure=MOBO_STRUCTURE, format_val=format_val)

@app.route('/api/mobos')
def api_mobos():
    # Return minimal data for search
    def minimal(m):
        return {
            'id': m['id'],
            'Brand': m.get('Brand', ''),
            'Model': m.get('Model', ''),
            'Chipset': m.get('Chipset', '')
        }
    return jsonify([minimal(m) for m in MOBO_DATA])

if __name__ == '__main__':
    app.run(debug=True, port=5000)
