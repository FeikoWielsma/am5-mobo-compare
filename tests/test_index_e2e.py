import pytest
from playwright.sync_api import Page, expect

# Assumption: app.py is running on localhost:5000
BASE_URL = "http://localhost:5000"

def test_index_loads_data(page: Page):
    """Test that the index page loads and renders the table with data."""
    page.goto(BASE_URL)
    
    # Check Title
    expect(page).to_have_title("AM5 Motherboard DB")
    
    # Check Table Visibility
    table = page.locator("#moboTable")
    expect(table).to_be_visible()
    
    # Check Row Count (Should be > 0)
    rows = page.locator(".mobo-row")
    expect(rows.first).to_be_visible()
    count = rows.count()
    assert count > 0, "No motherboard rows found on index page"
    
    # Check "X motherboards" badge
    badge = page.locator("#countDisplay")
    expect(badge).to_contain_text("motherboards")

def test_global_search(page: Page):
    """Test global search filtering."""
    page.goto(BASE_URL)
    
    # Wait for data load
    page.wait_for_selector(".mobo-row")
    rows = page.locator(".mobo-row")
    initial_count = rows.count()
    
    if initial_count == 0:
        pytest.skip("No data available to test search")

    # Pick a target from the first row to ensure we search for something that exists
    first_model = rows.first.locator(".model-click").inner_text()
    
    search_box = page.locator("#globalSearch")
    search_box.fill(first_model)
    
    # Trigger input event just in case
    search_box.dispatch_event("input")
    
    # Verify visible row contains the model
    # Wait for list to update usually happens fast.
    # We expect at least 1 result (the one we picked)
    # And potentially fewer results than total
    
    visible_rows = page.locator(".mobo-row:visible")
    expect(visible_rows.first).to_be_visible()
    
    first_text = visible_rows.first.inner_text()
    assert first_model in first_text

def test_brand_filter(page: Page):
    """Test filtering by Brand dropdown."""
    page.goto(BASE_URL)
    
    # Use existing data to pick a brand
    brand_header = page.locator(".filter-dropdown[data-col='brand']")
    button = brand_header.locator("button.filter-btn")
    
    # Open dropdown
    button.click()
    
    # Find a brand. The dropdown menu is inside the .filter-dropdown
    dropdown_menu = brand_header.locator(".dropdown-menu")
    expect(dropdown_menu).to_be_visible()
    
    # Click the first available checkbox option
    # Use force=True because typical Bootstrap dropdown checks might be obscured by custom styling
    options = dropdown_menu.locator(".filter-option")
    if options.count() == 0:
         pytest.skip("No brand options found")
    
    target_option = options.first
    brand_name = target_option.locator("span").first.inner_text() # The text part
    
    # Click it
    target_option.click(force=True)
    
    # Close dropdown
    button.click()
    
    # Verify button label update
    # Should say "1 Selected" or the brand name
    # Regex escaping for brand name just in case
    safe_brand = re.escape(brand_name)
    expect(button).to_have_text(re.compile(f"(1 Selected|{safe_brand})"))
    
    # Verify rows
    rows = page.locator(".mobo-row:visible")
    expect(rows.first).to_be_visible()
    
    # Check first few rows
    for i in range(min(3, rows.count())):
        row_text = rows.nth(i).inner_text()
        assert brand_name in row_text

import re # Need re for regex

def test_sorting(page: Page):
    """Test sorting by clicking headers."""
    page.goto(BASE_URL)
    
    # Sorting headers have .sortable class for static columns
    # Brand header is likely index 1 (after checkbox)
    # But headers have data-sort attribute
    brand_header = page.locator("th.sortable[data-sort='brand']")
    
    # Click sort (Ascending)
    brand_header.click()
    
    # Wait for URL to contain sorting param
    expect(page).to_have_url(re.compile(r"v="))
    
    # Check that sorting indicator is applied
    # main.js: indicator.innerHTML = direction === 'asc' ? '▲' : '▼';
    indicator = brand_header.locator(".sort-indicator")
    expect(indicator).to_have_text("▲")
    
    # Click sort (Descending)
    brand_header.click()
    expect(indicator).to_have_text("▼")

def test_add_remove_dynamic_column(page: Page):
    """Test adding and removing a dynamic column."""
    page.goto(BASE_URL)
    
    # Click Add Column
    add_btn = page.locator("#addDynamicColBtn")
    add_btn.click()
    
    # Wait for new header
    new_header = page.locator(".dynamic-col-header").last
    expect(new_header).to_be_visible()
    
    # Select a feature
    select = new_header.locator("select")
    
    # Pick the LAST option, which is usually a specific feature (leaf node)
    # Option 0 is "Select Feature..."
    # We use select_option with index.
    # We need to find how many options there are.
    # evaluating js to get length
    opt_count = select.evaluate("el => el.options.length")
    
    if opt_count > 1:
        # Select last option
        select.select_option(index=opt_count-1, force=True)
    
        # Verify a value appears in the column cells
        # Just check that the column exists and has content in first row
        first_row_last_cell = page.locator(".mobo-row").first.locator("td").last
        expect(first_row_last_cell).to_be_visible()
        # Content might be "-", so just ensuring it's not empty string
        # actually empty cell is <td></td>? 
        # Application usually puts something.
    
    # Remove Column
    # Check current count of dynamic headers
    header_count = page.locator(".dynamic-col-header").count()
    
    remove_btn = new_header.locator(".remove-col-btn")
    remove_btn.click()
    
    # Wait for count to decrease
    expect(page.locator(".dynamic-col-header")).to_have_count(header_count - 1)

def test_row_selection_and_compare(page: Page):
    """Test selecting rows and clicking Compare."""
    page.goto(BASE_URL)
    
    # Select first two rows
    rows = page.locator(".mobo-row")
    row1 = rows.nth(0)
    row2 = rows.nth(1)
    
    # Ensure visible
    row1.scroll_into_view_if_needed()
    row1.click()
    
    row2.scroll_into_view_if_needed()
    row2.click()
    
    # Compare Button (Top)
    compare_btn = page.locator("#compareBtnTop")
    expect(compare_btn).to_be_enabled()
    expect(compare_btn).to_contain_text("Compare (2)")
    
    # Click Compare
    compare_btn.click()
    
    # Should navigate to /compare
    expect(page).to_have_url(re.compile(r"/compare.*ids="))
    
    # Verify compare page loaded
    expect(page.locator("#compareTable")).to_be_visible()
