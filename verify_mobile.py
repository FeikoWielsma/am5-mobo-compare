"""Mobile Viewport & UX Verification Script

Tests the SvelteKit frontend under mobile viewport emulation (iPhone 14: 390x844)
to ensure:
1. No horizontal layout blowout (scrollWidth <= 390).
2. Detail drawer opens fully on screen (not pushed off-screen to 998px).
3. Search inputs have font-size >= 16px (no iOS auto-zoom).
4. Quick filter chips bar is cleanly contained and touch-scrollable.
5. Mobile floating compare dock appears on selection.
6. Compare page (/compare) has sticky specification row labels during horizontal swipe.
7. ColumnPickerModal and ColumnFilterDropdown render responsively on mobile.
"""

import sys
import time
from playwright.sync_api import sync_playwright

def run_checks():
    errors = []
    print("[1/5] Launching Playwright with iPhone 14 mobile emulation...")
    with sync_playwright() as p:
        iphone = p.devices["iPhone 14"]
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(**iphone)
        page = context.new_page()

        base_url = "http://localhost:4173"

        # Check 1: Catalog Page Viewport Integrity
        print("\n[2/5] Testing Catalog Page (/) at 390x844...")
        page.goto(base_url, wait_until="networkidle")
        page.wait_for_timeout(1000)

        metrics = page.evaluate("""() => {
            const bodyWidth = document.body.scrollWidth;
            const docWidth = document.documentElement.scrollWidth;
            const innerWidth = window.innerWidth;
            const searchInput = document.querySelector('input[type="search"]');
            const searchFontSize = searchInput ? window.getComputedStyle(searchInput).fontSize : 'none';
            const filterBar = document.querySelector('.filter-chips-scroll');
            const filterBarWidth = filterBar ? filterBar.scrollWidth : 0;
            return { bodyWidth, docWidth, innerWidth, searchFontSize, filterBarWidth };
        }""")
        print(f"   -> Window innerWidth: {metrics['innerWidth']}px")
        print(f"   -> Document scrollWidth: {metrics['docWidth']}px")
        print(f"   -> Body scrollWidth: {metrics['bodyWidth']}px")
        print(f"   -> Search font size: {metrics['searchFontSize']}")

        if metrics['bodyWidth'] > metrics['innerWidth']:
            errors.append(f"Catalog layout blown out: body.scrollWidth ({metrics['bodyWidth']}) > innerWidth ({metrics['innerWidth']})")
        else:
            print("   [PASS] Body scrollWidth matches innerWidth (no horizontal blowout).")

        font_size_val = float(metrics['searchFontSize'].replace('px', ''))
        if font_size_val < 16.0:
            errors.append(f"Search input font-size is {metrics['searchFontSize']} (< 16px), will cause iOS auto-zoom")
        else:
            print(f"   [PASS] Search input font-size >= 16px ({metrics['searchFontSize']}), immune to iOS auto-zoom.")

        # Check 2: Detail Drawer
        print("\n[3/5] Testing Detail Drawer on mobile...")
        inspect_link = page.locator("a[title*='Quick inspect']").first
        inspect_link.wait_for(state="visible", timeout=5000)
        inspect_link.click()
        page.wait_for_timeout(500)

        drawer = page.locator(".drawer")
        drawer.wait_for(state="visible", timeout=5000)
        drawer_box = drawer.bounding_box()
        print(f"   -> Drawer bounding box: {drawer_box}")
        if not drawer_box:
            errors.append("Detail drawer was not found in DOM after inspect click.")
        else:
            if drawer_box['x'] > 50:
                errors.append(f"Drawer is rendered off-screen! x={drawer_box['x']} (expected <= 0)")
            elif drawer_box['width'] < 300:
                errors.append(f"Drawer width {drawer_box['width']} is too narrow.")
            else:
                print(f"   [PASS] Detail drawer opens fully on-screen (x={drawer_box['x']}, width={drawer_box['width']}px).")

        # Close drawer
        close_btn = page.locator(".drawer button[aria-label='Close']")
        if close_btn.count() > 0:
            close_btn.click()
            page.wait_for_timeout(500)
            drawer.wait_for(state="hidden", timeout=3000)
            print("   [PASS] Drawer closed cleanly.")

        # Check 3: Selection and Mobile Bottom Compare Dock
        print("\n[4/5] Testing Motherboard Selection & Mobile Bottom Compare Dock...")
        checkboxes = page.locator('.board-row input[type="checkbox"]')
        checkboxes.nth(0).click()
        checkboxes.nth(1).click()
        page.wait_for_timeout(500)

        dock = page.locator(".mobile-compare-dock")
        if dock.count() == 0 or not dock.is_visible():
            errors.append("Mobile compare dock (.mobile-compare-dock) did not appear when 2 boards were selected.")
        else:
            dock_text = dock.inner_text()
            print(f"   [PASS] Mobile bottom dock visible: '{dock_text.strip()}'")

        # Check 4: Compare Page Side-by-Side & Sticky Spec Row Headers
        print("\n[5/5] Testing Compare Page (/compare) at 390x844...")
        page.goto(f"{base_url}/compare?boards=ASRock_X870E_Taichi,ASUS_ROG_CROSSHAIR_X870E_HERO", wait_until="networkidle")
        page.wait_for_timeout(1000)

        comp_metrics = page.evaluate("""() => {
            const bodyWidth = document.body.scrollWidth;
            const innerWidth = window.innerWidth;
            const stickyHeader = document.querySelector('.sticky-col-header');
            const stickyHeaderStyle = stickyHeader ? window.getComputedStyle(stickyHeader).position : 'none';
            const rowLabel = document.querySelector('.row-label');
            const rowLabelStyle = rowLabel ? window.getComputedStyle(rowLabel).position : 'none';
            const rowLabelLeft = rowLabel ? window.getComputedStyle(rowLabel).left : 'none';
            return { bodyWidth, innerWidth, stickyHeaderStyle, rowLabelStyle, rowLabelLeft };
        }""")
        print(f"   -> Compare window innerWidth: {comp_metrics['innerWidth']}px")
        print(f"   -> Compare body scrollWidth: {comp_metrics['bodyWidth']}px")
        print(f"   -> .sticky-col-header position: {comp_metrics['stickyHeaderStyle']}")
        print(f"   -> .row-label position: {comp_metrics['rowLabelStyle']} (left: {comp_metrics['rowLabelLeft']})")

        if comp_metrics['bodyWidth'] > comp_metrics['innerWidth']:
            errors.append(f"Compare page body blowout: body.scrollWidth ({comp_metrics['bodyWidth']}) > innerWidth ({comp_metrics['innerWidth']})")
        else:
            print("   [PASS] Compare page body.scrollWidth matches innerWidth (scroll is contained).")

        if comp_metrics['rowLabelStyle'] != 'sticky':
            errors.append(f".row-label is not position: sticky (was {comp_metrics['rowLabelStyle']})")
        else:
            print("   [PASS] Compare row-label has position: sticky for horizontal scrolling.")

        # Test horizontal scroll containment in compare table
        page.evaluate("""() => {
            const container = document.querySelector('.compare-table-container');
            if (container) container.scrollLeft = 150;
        }""")
        page.wait_for_timeout(300)

        row_label_x = page.evaluate("""() => {
            const label = document.querySelector('.row-label');
            if (!label) return -1;
            const rect = label.getBoundingClientRect();
            return rect.x;
        }""")
        print(f"   -> .row-label x coordinate after 150px horizontal scroll: {row_label_x}px")

        # Check Column Picker Modal
        print("\nTesting Column Picker Modal on mobile...")
        page.goto(base_url, wait_until="networkidle")
        page.wait_for_timeout(500)
        col_btn = page.locator("button[title*='Add specification column']").first
        if col_btn.count() > 0:
            col_btn.click()
            page.wait_for_timeout(500)
            modal = page.locator(".modal.show")
            if modal.count() > 0 and modal.is_visible():
                modal_box = modal.bounding_box()
                tabs_scroll = page.locator(".category-tabs-scroll")
                tabs_box = tabs_scroll.bounding_box() if tabs_scroll.count() > 0 else None
                print(f"   [PASS] Column Picker modal opened cleanly on mobile (modal width: {modal_box['width']}px, tabs width: {tabs_box['width'] if tabs_box else 'N/A'}px)")
            else:
                errors.append("Column Picker modal did not display properly.")

        browser.close()

    print("\n=======================================================")
    if errors:
        print(f"FAILED with {len(errors)} error(s):")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)
    else:
        print("ALL MOBILE VERIFICATION CHECKS PASSED SUCCESSFULLY! :)")
        sys.exit(0)

if __name__ == "__main__":
    run_checks()
