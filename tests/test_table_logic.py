"""
Unit tests for static/js/table_logic.js.

This logic used to live inside main.js's initApp() closure, where the only
way to reach it was to drive the whole page in a browser. It is loaded into
a blank page here and called directly, the same approach test_js_logic.py
uses for parsers.js -- no server required.
"""

import json
import os

import pytest
from playwright.sync_api import Page

JS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "static", "js", "table_logic.js",
)

BOARDS = [
    {
        "id": "ASUS_ROG_STRIX_X870E_E",
        "brand": "ASUS", "chipset": "X870E", "model": "ROG STRIX X870E-E",
        "form_factor": "ATX",
        "specs": {"General": {"Market": {"A-MSRP (USD)": "499"}}},
    },
    {
        "id": "ASRock_B650M_Pro_RS",
        "brand": "ASRock", "chipset": "B650", "model": "B650M Pro RS",
        "form_factor": "μ-ATX",
        "specs": {"General": {"Market": {"A-MSRP (USD)": "129"}}},
    },
    {
        "id": "Gigabyte_X670E_AORUS_MASTER",
        "brand": "Gigabyte", "chipset": "X670E", "model": "X670E AORUS MASTER",
        "form_factor": "E-ATX",
        "specs": {"General": {"Market": {"A-MSRP (USD)": "89"}}},
    },
]

PRICE_KEY = "General|Market|A-MSRP (USD)"


def _eval(page, body, **names):
    """Run `body` with BOARDS plus any extra names bound as globals."""
    setup = "const BOARDS = " + json.dumps(BOARDS) + ";"
    for key, value in names.items():
        setup += f"const {key} = {json.dumps(value)};"
    return page.evaluate(f"() => {{ {setup} return ({body}); }}")


@pytest.fixture
def loaded(page: Page):
    page.goto("data:text/html,<html><body></body></html>")
    page.add_script_tag(path=JS_PATH)
    return page


# --- getNestedValue ---------------------------------------------------------

def test_get_nested_value_reads_pipe_path_from_specs(loaded):
    got = _eval(loaded, f"getNestedValue(BOARDS[0], {json.dumps(PRICE_KEY)})")
    assert got == "499"


def test_get_nested_value_reads_root_property(loaded):
    assert _eval(loaded, "getNestedValue(BOARDS[0], 'brand')") == "ASUS"


def test_get_nested_value_returns_dash_for_missing(loaded):
    assert _eval(loaded, "getNestedValue(BOARDS[0], 'No|Such|Key')") == "-"
    assert _eval(loaded, "getNestedValue(BOARDS[0], '')") == "-"


# --- badge classes ----------------------------------------------------------

@pytest.mark.parametrize("value,expected", [
    ("X870E", "badge-chipset badge-chipset-x870e"),
    ("A620(A)", "badge-chipset badge-chipset-a620a"),
    ("", ""),
])
def test_chipset_badge_class(loaded, value, expected):
    assert _eval(loaded, f"chipsetBadgeClass({json.dumps(value)})") == expected


@pytest.mark.parametrize("value,expected", [
    ("ATX", "badge-ff badge-ff-atx"),
    ("μ-ATX", "badge-ff badge-ff-matx"),
    ("E-ATX", "badge-ff badge-ff-eatx"),
    ("BKB ITX", "badge-ff badge-ff-miniitx"),
])
def test_form_factor_badge_class(loaded, value, expected):
    assert _eval(loaded, f"formFactorBadgeClass({json.dumps(value)})") == expected


# --- search -----------------------------------------------------------------

def test_search_matches_across_fields_in_any_word_order(loaded):
    """The bug this consolidation fixed: word order used to matter in one of
    the two search implementations."""
    assert _eval(loaded, "matchesGlobalSearch(BOARDS[0], 'asus x870')") is True
    assert _eval(loaded, "matchesGlobalSearch(BOARDS[0], 'x870 asus')") is True
    assert _eval(loaded, "matchesGlobalSearch(BOARDS[0], 'asus b650')") is False


def test_empty_search_matches_everything(loaded):
    assert _eval(loaded, "matchesGlobalSearch(BOARDS[0], '')") is True
    assert _eval(loaded, "matchesGlobalSearch(BOARDS[0], '   ')") is True


# --- filtering --------------------------------------------------------------

def test_filter_by_brand(loaded):
    got = _eval(loaded, """
        filterMobos(BOARDS, { filters: { brand: new Set(['ASUS']) } }).map(m => m.brand)
    """)
    assert got == ["ASUS"]


def test_empty_filter_set_does_not_narrow(loaded):
    got = _eval(loaded, "filterMobos(BOARDS, { filters: { brand: new Set() } }).length")
    assert got == len(BOARDS)


def test_filter_by_dynamic_column(loaded):
    got = _eval(loaded, f"""
        filterMobos(BOARDS, {{
            filters: {{ dyn1: new Set(['129']) }},
            dynamicKeys: {{ 1: {json.dumps(PRICE_KEY)} }}
        }}).map(m => m.brand)
    """)
    assert got == ["ASRock"]


def test_filters_combine_with_search(loaded):
    got = _eval(loaded, """
        filterMobos(BOARDS, {
            search: 'aorus',
            filters: { form_factor: new Set(['E-ATX']) }
        }).length
    """)
    assert got == 1


# --- sorting ----------------------------------------------------------------

def test_sort_is_numeric_aware_on_dynamic_column(loaded):
    """String ordering would put '129' before '89'."""
    got = _eval(loaded, f"""
        sortMobos(BOARDS, {{ column: 'dyn1', direction: 'asc' }},
                  {{ 1: {json.dumps(PRICE_KEY)} }})
            .map(m => getNestedValue(m, {json.dumps(PRICE_KEY)}))
    """)
    assert got == ["89", "129", "499"]


def test_sort_descending_reverses(loaded):
    got = _eval(loaded, "sortMobos(BOARDS, { column: 'brand', direction: 'desc' }).map(m => m.brand)")
    assert got == ["Gigabyte", "ASUS", "ASRock"]


def test_sort_without_column_preserves_order_and_copies(loaded):
    got = _eval(loaded, """
        (() => {
            const out = sortMobos(BOARDS, { column: null });
            return [out.map(m => m.brand).join(','), out === BOARDS];
        })()
    """)
    assert got[0] == "ASUS,ASRock,Gigabyte"
    assert got[1] is False, "must not sort the caller's array in place"


# --- available values -------------------------------------------------------

def test_available_values_excludes_target_column_from_narrowing(loaded):
    """Ticking one brand must not hide the other brands from its own list."""
    got = _eval(loaded, """
        Array.from(availableValuesFor(BOARDS, 'brand', {
            filters: { brand: new Set(['ASUS']) }
        })).sort()
    """)
    assert got == ["ASRock", "ASUS", "Gigabyte"]


def test_available_values_narrowed_by_other_columns(loaded):
    got = _eval(loaded, """
        Array.from(availableValuesFor(BOARDS, 'brand', {
            filters: { form_factor: new Set(['ATX']) }
        }))
    """)
    assert got == ["ASUS"]


# --- view state -------------------------------------------------------------

def test_view_state_round_trips(loaded):
    got = _eval(loaded, """
        (() => {
            const state = buildViewState({
                filters: { brand: new Set(['ASUS']) },
                dynamicKeys: { 1: 'General|Market|A-MSRP (USD)' },
                search: 'rog',
                sort: { column: 'brand', direction: 'desc' }
            });
            return [state, decodeViewState(encodeViewState(state))];
        })()
    """)
    assert got[0] == got[1]
    assert got[0]["s"] == "rog"
    assert got[0]["f"]["brand"] == ["ASUS"]
    assert got[0]["o"] == {"c": "brand", "d": "desc"}


def test_encoded_state_is_url_safe(loaded):
    encoded = _eval(loaded, """
        encodeViewState({ s: 'a search with spaces + symbols/slashes?' })
    """)
    assert not set(encoded) & set("+/=&?# ")


def test_empty_view_state_is_empty_object(loaded):
    assert _eval(loaded, "buildViewState({})") == {}
    assert _eval(loaded, "buildViewState({ filters: { brand: new Set() } })") == {}
