"""
Guards for motherboard identifiers.

Ids are the database key, the /compare?ids=... URL component and the
rear-I/O image filename, so they have to be stable across spreadsheet edits
and safe to drop into a query string unencoded.
"""

import os
import re
import sys
import urllib.parse

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loaders.ids import assert_unique_ids, make_mobo_id, slugify
from models import get_engine, get_session_factory, Motherboard

# The scheme replaced: {sheet}_{rowindex}_{model}
OLD_POSITIONAL_ID = re.compile(r"^[A-Za-z0-9()]+_\d+_")


@pytest.fixture(scope="module")
def mobo_ids():
    session = get_session_factory(get_engine())()
    try:
        ids = [m.id for m in session.query(Motherboard).all()]
        assert ids, "database is empty -- run scripts/init_db.py"
        return ids
    finally:
        session.close()


def test_id_is_independent_of_position():
    """The whole point: the same board yields the same id wherever it sits."""
    assert make_mobo_id("ASRock", "X870E Taichi") == make_mobo_id("ASRock", "X870E Taichi")


def test_plus_is_preserved_as_plus():
    """
    '+' distinguishes real boards ("M.2+" vs "M.2") but decodes to a space in
    a query string, so it is spelled out rather than dropped.
    """
    assert "plus" in make_mobo_id("Sapphire", "NITRO+ B850A WIFI")
    assert make_mobo_id("ASRock", "A620M- HDV-M.2+") != make_mobo_id("ASRock", "A620M- HDV-M.2")


def test_slugify_collapses_unsafe_runs():
    assert slugify("  ROG  STRIX / X870E  ") == "ROG_STRIX_X870E"
    assert slugify("") == "unknown"
    assert slugify(None) == "unknown"


def test_slugify_never_emits_a_comma():
    """Commas separate ids in the query string."""
    assert "," not in slugify("Foo, Bar")


def test_assert_unique_ids_raises_on_duplicates():
    records = [
        {"id": "a", "model": "One"},
        {"id": "a", "model": "Two"},
    ]
    with pytest.raises(ValueError, match="duplicate"):
        assert_unique_ids(records)


def test_assert_unique_ids_passes_when_unique():
    assert_unique_ids([{"id": "a", "model": "One"}, {"id": "b", "model": "Two"}])


# --- against the real database ----------------------------------------------

def test_all_ids_are_unique(mobo_ids):
    assert len(mobo_ids) == len(set(mobo_ids))


def test_no_id_still_uses_the_positional_scheme(mobo_ids):
    offenders = [i for i in mobo_ids if OLD_POSITIONAL_ID.match(i)]
    assert not offenders, (
        f"{len(offenders)} ids still encode a row position, e.g. {offenders[:3]}"
    )


def test_ids_survive_a_query_string_unencoded(mobo_ids):
    """
    A shared link puts ids straight into ?ids=... . Anything that changes
    under query-string parsing silently drops that board from the comparison
    -- which is what '+' did to 14 boards.
    """
    joined = ",".join(mobo_ids)
    parsed = urllib.parse.parse_qs(f"ids={joined}")["ids"][0]
    assert parsed.split(",") == mobo_ids


def test_ids_need_no_url_encoding(mobo_ids):
    for mobo_id in mobo_ids:
        assert urllib.parse.quote(mobo_id, safe="") == urllib.parse.quote(
            mobo_id, safe=""
        )
        assert mobo_id == urllib.parse.unquote(mobo_id), (
            f"{mobo_id!r} changes when URL-decoded"
        )
        assert not set(mobo_id) & set("+#&?%= /\\,"), (
            f"{mobo_id!r} contains a character that is unsafe in a query string"
        )
