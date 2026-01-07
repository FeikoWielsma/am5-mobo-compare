import pytest
from playwright.sync_api import Page, expect
import re

import requests

@pytest.fixture(scope="module")
def valid_ids():
    """Fetch valid IDs from the running local server API."""
    try:
        response = requests.get("http://localhost:5000/api/mobos")
        response.raise_for_status()
        data = response.json()
        return [str(m['id']) for m in data]
    except Exception as e:
        pytest.skip(f"Could not fetch valid IDs from localhost:5000: {e}")

def test_compare_page_toggles(page: Page, valid_ids):
    if len(valid_ids) < 2:
        pytest.skip("Not enough motherboards in DB to test comparison.")
        
    ids = ",".join(valid_ids[:2])
    page.goto(f"http://localhost:5000/compare?ids={ids}") 

    # 2. Check "Hide Identical Values"
    toggle_hide = page.locator("#hideSameToggle")
    expect(toggle_hide).to_be_visible()
    
    # Wait for table to load
    page.wait_for_selector("#compareTable")

    # Toggle ON
    toggle_hide.check()
    
    # Verify rows with data-all-same="true" are hidden
    hidden_rows = page.locator('tr[data-all-same="true"]')
    
    # Check if we have any identical rows to test
    count = hidden_rows.count()
    if count > 0:
        expect(hidden_rows.first).to_have_css("display", "none")

    # Toggle OFF
    toggle_hide.uncheck()
    if count > 0:
        expect(hidden_rows.first).not_to_have_css("display", "none")

    # 3. Check "Highlight Differences"
    toggle_diff = page.locator("#highlightDiffToggle")
    
    # Toggle ON
    toggle_diff.check()
    expect(page.locator("#compareTable")).to_have_class(re.compile(r"highlight-diffs"))
    
    # Toggle OFF
    toggle_diff.uncheck()
    expect(page.locator("#compareTable")).not_to_have_class(re.compile(r"highlight-diffs"))

def test_add_remove_flow(page: Page, valid_ids):
    if not valid_ids:
        pytest.skip("No motherboards available.")
        
    page.goto("http://localhost:5000/compare")
    
    # Search for the brand of the first valid mobo?
    # Or just generic "X870" if we know it exists. 
    # Better: Use API fetch to find a real name.
    
    # Search logic
    page.fill("#moboSearch", "ASUS") # "ASUS" should return results
    page.wait_for_selector("#searchDropdown .dropdown-item")
    
    # Click first result
    page.click("#searchDropdown .dropdown-item >> nth=0")
    
    # Check URL
    expect(page).to_have_url(re.compile(r"ids="))
    
    # Check Table Header Count (should be at least 1 mobo)
    mobo_headers = page.locator(".group-header")
    expect(mobo_headers).to_have_count(1)
    
    # Remove
    mobo_headers.first.hover()
    page.click(".remove-mobo-btn >> nth=0")
    
    # Verify removal
    expect(mobo_headers).to_have_count(0)

def test_url_persistence(page: Page, valid_ids):
    """Test that reloading the page keeps the selected motherboards."""
    if not valid_ids:
        pytest.skip("No motherboards available.")
        
    id_to_test = valid_ids[0]
    page.goto(f"http://localhost:5000/compare?ids={id_to_test}")
    
    # Verify table loads
    expect(page.locator(".group-header")).to_have_count(1)
    
    # Reload
    page.reload()
    
    # Verify still there
    expect(page.locator(".group-header")).to_have_count(1)
    expect(page).to_have_url(re.compile(f"ids={id_to_test}"))
