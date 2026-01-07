import os
import re
from flask import render_template
from app import app
from models import get_engine, get_session_factory
from services import MoboService

def build_static():
    print("Building static site for GitHub Pages...")
    
    # 1. Setup Data
    engine = get_engine()
    Session = get_session_factory(engine)
    session = Session()
    service = MoboService(session)
    
    # Fetch data once
    mobos = []
    for m in service.get_all_mobos():
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
    lan_lookup = service.get_lan_lookup()
    session.close()

    # 2. Render Pages manually via render_template
    with app.test_request_context():
        # Render Index (Embed full data for speed)
        index_html = render_template('index.html', mobos=mobos, structure=structure)
        
        # Render Compare Skeleton (Static renderer will fill the table)
        compare_html = render_template('compare.html', mobos=[], structure=structure, lan_lookup=lan_lookup)

    # 3. Post-Process (Fix paths and add static trigger)
    def sanitize(html):
        # Convert /static/ to static/
        html = html.replace('"/static/', '"static/')
        html = html.replace("'/static/", "'static/")
        
        # Set static trigger
        html = html.replace('</head>', '<script>window.IS_STATIC = true;</script></head>')
        
        # Path fixes for links
        html = html.replace('href="/"', 'href="index.html"')
        html = html.replace('href="/compare', 'href="compare.html')
        
        return html

    # Write to root
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(sanitize(index_html))

    with open('compare.html', 'w', encoding='utf-8') as f:
        f.write(sanitize(compare_html))

    print("Static build complete. Created index.html and compare.html in root.")

if __name__ == '__main__':
    build_static()
