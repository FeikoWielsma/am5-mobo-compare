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

def test_vrm_vcore_scoring_logic(page: Page):
    """
    Test logic for "VRM (VCore)" field.
    Hierarchy: SPS > DrMOS > Discrete.
    Score = Tier*1000 + Amps.
    """
    page.goto("http://localhost:5000/compare")
    
    # Case 1: SPS vs DrMOS (Technology Wins)
    # 50A SPS vs 90A DrMOS (Realistically amps usually correlate, but testing logic)
    # SPS (Tier 2) = 2050
    # DrMOS (Tier 1) = 1090
    val1 = "50A SPS"
    val2 = "90A DrMOS"
    
    score1 = page.evaluate(f'parseValue("{val1}", "VRM (VCore)").score')
    score2 = page.evaluate(f'parseValue("{val2}", "VRM (VCore)").score')
    
    assert score1 > score2, f"SPS ({score1}) should beat DrMOS ({score2})"
    assert score1 == 2050
    assert score2 == 1090

    # Case 2: Amps Win within same Tier
    # 110A SPS vs 80A SPS
    val3 = "110A SPS"
    val4 = "80A SPS"
    
    score3 = page.evaluate(f'parseValue("{val3}", "VRM (VCore)").score')
    score4 = page.evaluate(f'parseValue("{val4}", "VRM (VCore)").score')
    
    assert score3 > score4
    assert score3 == 2110
    
    # Case 3: Discrete (1H/1L)
    # Should be Tier 0
    val5 = "1H/1L"
    score5 = page.evaluate(f'parseValue("{val5}", "VRM (VCore)").score')
    
    assert score5 == 0
    
    # Check simple comparison
    assert score5 == 0
    
    # Check simple comparison
    assert score2 > score5 # DrMOS > Discrete

def test_wireless_scoring_logic(page: Page):
    """
    Test logic for "Wireless" field.
    Hierarchy: 
    1. Gen: 7 (7000) > 6E (6000) > 6 (5000) > 5 (4000) > Slot (1000)
    2. Mfr: Intel (500) > Qualcomm (400) > Realtek (300) > Mediatek (200) > Generic (100)
    """
    page.goto("http://localhost:5000/compare")
    
    # Case 1: Gen 7 vs Gen 6E
    # QCNCM865 (Wi-Fi 7) vs RZ608 (Wi-Fi 6E)
    val1 = "QCNCM865 (Wi-Fi 7)"
    val2 = "RZ608 (Wi-Fi 6E)"
    
    score1 = page.evaluate(f'parseValue("{val1}", "Wireless").score')
    score2 = page.evaluate(f'parseValue("{val2}", "Wireless").score')
    
    assert score1 > score2, "WiFi 7 should beat WiFi 6E"
    assert score1 >= 7000
    assert score2 >= 6000 and score2 < 7000
    
    # Case 2: Manufacturer Hierarchy (Same Gen)
    # Intel vs Mediatek (WiFi 7) -> BE200 vs RZ738
    # Actually checking scoring directly
    val_intel = "BE200 (Wi-Fi 7)"       # 7000 + 500 = 7500
    val_qual = "QCNCM865 (Wi-Fi 7)"     # 7000 + 400 = 7400
    val_real = "RTL8922AE (Wi-Fi 7)"    # 7000 + 300 = 7300
    val_med = "RZ738 (Wi-Fi 7)"         # 7000 + 200 = 7200
    val_gen = "Wi-Fi 7, see note"       # 7000 + 100 = 7100
    
    s_intel = page.evaluate(f'parseValue("{val_intel}", "Wireless").score')
    s_qual = page.evaluate(f'parseValue("{val_qual}", "Wireless").score')
    s_real = page.evaluate(f'parseValue("{val_real}", "Wireless").score')
    s_med = page.evaluate(f'parseValue("{val_med}", "Wireless").score')
    s_gen = page.evaluate(f'parseValue("{val_gen}", "Wireless").score')
    
    assert s_intel == 7500
    assert s_qual == 7400
    assert s_real == 7300
    assert s_med == 7200
    assert s_gen == 7100
    
    assert s_intel > s_qual > s_real > s_med > s_gen
    
    # Case 3: Empty Slot
    val_slot = "M.2-2230 (no card)"
    s_slot = page.evaluate(f'parseValue("{val_slot}", "Wireless").score')
    assert s_slot == 1000
    
    assert s_gen > s_slot

def test_lan_scoring_logic(page: Page):
    """
    Test logic for "LAN Controller" field.
    Logic: Sum of speeds of detected controllers.
    """
    page.goto("http://localhost:5000/compare")
    
    # Inject Mock LAN_SCORES for consistent testing
    # Real app loads from Excel, but for JS unit test we mock the data
    page.evaluate("""
        window.LAN_SCORES = {
            'Intel I226-V': 2500,
            'Marvell AQC113C': 10000,
            'Realtek RTL8125': 2500,
            'Realtek RTL8111H': 1000
        };
    """)
    
    # Case 1: Single Controller
    # "Intel I226-V" -> 2500
    val1 = "Intel I226-V"
    score1 = page.evaluate(f'parseValue("{val1}", "LAN Controller").score')
    assert score1 == 2500
    
    # Case 2: Dual Controller (Summing)
    # "Intel I226-V + Marvell AQC113C" -> 2500 + 10000 = 12500
    val2 = "Intel I226-V, Marvell AQC113C"
    score2 = page.evaluate(f'parseValue("{val2}", "LAN Controller").score')
    assert score2 == 12500
    
    # Case 3: Comparison
    assert score2 > score1
    
    # "realtek rtl8125" -> should match "Realtek RTL8125"
    val3 = "Realtek RTL8125 2.5GbE"
    score3 = page.evaluate(f'parseValue("{val3}", "LAN Controller").score')
    assert score3 == 2500

    # Case 5: Messy input (Extra spaces, hyphens)
    # "Intel I-226V, Marvell  AQC113C" -> Should match "Intel I226-V" + "Marvell AQC113C"
    val4 = "Intel I-226V, Marvell  AQC113C"
    score4 = page.evaluate(f'parseValue("{val4}", "LAN Controller").score')
    assert score4 == 12500

    # Case 6: Abbreviation (Rltk -> Realtek)
    # "Rltk RTL8126" -> Should match "Realtek RTL8126" (assuming lookup has it as 5G/5000)
    # We mocked RTL8126? No, let's add it to mock or just check logic if key exists
    # Let's update mock first to include RTL8126
    page.evaluate("""
        window.LAN_SCORES['Realtek RTL8126'] = 5000;
    """)
    val5 = "Rltk RTL8126"
    score5 = page.evaluate(f'parseValue("{val5}", "LAN Controller").score')
    assert score5 == 5000
    
    # Case 7: Deduplication (Subset matching)
    # "Realtek RTL8111H" contains "RTL8111". Should only match the specific "RTL8111H"
    # Assuming lookup has "RTL8111H": 1000 and "RTL8111": 1000
    page.evaluate("""
        window.LAN_SCORES['Realtek RTL8111'] = 1000;
        window.LAN_SCORES['Realtek RTL8111H'] = 1000;
    """)
    val7 = "Realtek RTL8111H"
    score7 = page.evaluate(f'parseValue("{val7}", "LAN Controller").score')
    assert score7 == 1000  # NOT 2000
