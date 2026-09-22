import os
import sys
import io
from PIL import Image
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import app
from loaders.excel_loader import process_sheet_images

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_compression_headers(client):
    """Verify that gzip compression is applied when requested by the client."""
    response = client.get('/', headers={'Accept-Encoding': 'gzip'})
    assert response.status_code == 200
    assert response.headers.get('Content-Encoding') == 'gzip'

def test_static_cache_headers(client, tmp_path):
    """Verify that static files have Cache-Control headers set for long caching."""
    response = client.get('/static/css/styles.css')
    assert response.status_code == 200
    cache_control = response.headers.get('Cache-Control', '')
    assert 'max-age=31536000' in cache_control

def test_webp_thumbnail_generation(tmp_path, monkeypatch):
    """Test that process_sheet_images generates both full PNG and ~200px WebP thumbnail."""
    monkeypatch.setattr('loaders.config.IO_IMAGE_DIR', str(tmp_path))

    # Create dummy worksheet with an image
    class DummyAnchor:
        class _From:
            col = 0
            row = 1
        _from = _From()

    class DummyImage:
        anchor = DummyAnchor()
        # Create a test PIL Image: 600x300 red image
        img_buffer = io.BytesIO()
        img = Image.new('RGB', (600, 300), color='red')
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        ref = img_buffer

    class DummyWorksheet:
        _images = [DummyImage()]

    records = [{'_row_idx': 2, 'Brand': 'TestBrand', 'Model': 'TestModel'}]
    cols_info = [{'col_idx': 0, 'key': 'Rear I/O|Rear I/O Image'}]
    ids_by_row = {2: 'testbrand-testmodel'}

    process_sheet_images(DummyWorksheet(), records, cols_info, 'TestSheet', ids_by_row)

    png_path = tmp_path / 'testbrand-testmodel_io.png'
    webp_path = tmp_path / 'testbrand-testmodel_io_thumb.webp'

    assert png_path.exists()
    assert webp_path.exists()

    # Verify thumbnail aspect ratio & size
    with Image.open(webp_path) as thumb:
        assert thumb.format == 'WEBP'
        assert thumb.width <= 200
        assert thumb.height <= 200
        # Aspect ratio was 600x300 (2:1), so 200x100
        assert thumb.width == 200
        assert thumb.height == 100

    # Verify record was populated with both paths
    assert records[0]['Rear I/O|Rear I/O Image'] == '/static/img/io/testbrand-testmodel_io.png'
    assert records[0]['Rear I/O|Rear I/O Image Thumb'] == '/static/img/io/testbrand-testmodel_io_thumb.webp'
