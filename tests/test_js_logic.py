import pytest
from playwright.sync_api import Page, expect

def test_m2_scoring_logic(page: Page):
    """
    Load the compare page (or any page with the JS) and unit test the parseValue function
    specifically for M.2 strings.
    """
    # We need to load the page that has compare.js loaded.
    # We can mock the network if needed, or just go to /compare which should load 
    # even if empty (but might need valid IDs to not error? No, /compare works empty).
    page.goto("http://localhost:5000/compare")

    # Inject a helper to expose parseValue or just run evaluation context
    # parseValue is global in compare.js? It's defined at top level scope in the file, 
    # but might not be attached to window. 
    # Based on compare.js structure:
    # `function parseValue(...)` is at top level. 
    # It should be available in window scope if compare.js is included as script.
    
    # Test Cases
    # Case 1: Slot Count Wins
    # 2 slots (Gen 3) vs 1 slot (Gen 5)
    val1 = "2*3x4"      # Score: 2M + ...
    val2 = "1*5x4"      # Score: 1M + ...
    
    score1 = page.evaluate('parseValue("2*3x4", "M.2 (M)").score')
    score2 = page.evaluate('parseValue("1*5x4", "M.2 (M)").score')
    
    assert score1 > score2, f"2 slots ({score1}) should beat 1 slot ({score2})"

    # Case 2: Bandwidth Wins when slots equal
    # 1 slot Gen 5 vs 1 slot Gen 4
    val3 = "1*5x4"
    val4 = "1*4x4"
    
    score3 = page.evaluate('parseValue("1*5x4", "M.2 (M)").score')
    score4 = page.evaluate('parseValue("1*4x4", "M.2 (M)").score')
    
    assert score3 > score4, f"Gen 5 ({score3}) should beat Gen 4 ({score4})"

    # Case 3: Mixed inputs
    # "1*5x4 + 1*4x4" (2 slots) vs "3*3x4" (3 slots)
    val5 = "1*5x4<br>1*4x4"
    val6 = "3*3x4"
    
    score5 = page.evaluate(f'parseValue("{val5}", "M.2 (M)").score')
    score6 = page.evaluate(f'parseValue("{val6}", "M.2 (M)").score')
    
    assert score6 > score5, f"3 slots ({score6}) should beat 2 slots mixed ({score5})"
    
    # Case 4: Text content check
    # Ensure it returns the original text
    text = page.evaluate('parseValue("1*5x4", "M.2 (M)").text')
    assert text == "1*5x4"

def test_total_m2_scoring_logic(page: Page):
    """
    Test logic for "Total M.2 (M)" field with "X(+Y)" format.
    """
    page.goto("http://localhost:5000/compare")
    
    # Case 1: Total Count Wins
    # 5(+2) = 7 total vs 5 = 5 total
    val1 = "5(+2)"
    val2 = "5"
    
    score1 = page.evaluate(f'parseValue("{val1}", "Total M.2 (M)").score')
    score2 = page.evaluate(f'parseValue("{val2}", "Total M.2 (M)").score')
    
    assert score1 > score2, f"7 total ({score1}) should beat 5 total ({score2})"
    
    # Case 2: Tie-break (Onboard Wins)
    # 5 vs 3(+2) (Both 5 total)
    val3 = "5"
    val4 = "3(+2)"
    
    score3 = page.evaluate(f'parseValue("{val3}", "Total M.2 (M)").score')
    score4 = page.evaluate(f'parseValue("{val4}", "Total M.2 (M)").score')
    
    assert score3 > score4, f"Native 5 ({score3}) should beat Mixed 5 ({score4})"
    
    # Check values
    # 5(+2) -> 7 total, 705 score
    assert score1 == 705
    # 5 -> 5 total, 505 score
    assert score3 == 505
    # 3(+2) -> 5 total, 503 score
    assert score4 == 503
