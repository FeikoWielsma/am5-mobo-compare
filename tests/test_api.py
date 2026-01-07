import pytest
import sys
import os
import json

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_index_route(client):
    """Test the main index page loads."""
    rv = client.get('/')
    assert rv.status_code == 200
    assert b"AM5 DB" in rv.data

def test_api_mobos(client):
    """Test the JSON API returns valid data."""
    rv = client.get('/api/mobos')
    assert rv.status_code == 200
    data = json.loads(rv.data)
    assert isinstance(data, list)
    if len(data) > 0:
        assert "id" in data[0]
        assert "Brand" in data[0]
        assert "Model" in data[0]

def test_compare_route_no_args(client):
    """Test compare page loads without arguments."""
    rv = client.get('/compare')
    assert rv.status_code == 200
    assert b"Comparison" in rv.data

def test_compare_route_with_ids(client):
    """Test compare page loads with specific IDs."""
    # First get valid IDs
    rv_api = client.get('/api/mobos')
    data = json.loads(rv_api.data)
    if len(data) >= 2:
        ids = f"{data[0]['id']},{data[1]['id']}"
        rv = client.get(f'/compare?ids={ids}')
        assert rv.status_code == 200
        # Check that the brand names appear in the HTML
        assert data[0]['Brand'].encode() in rv.data
        assert data[1]['Brand'].encode() in rv.data
