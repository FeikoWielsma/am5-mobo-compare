"""
Guards for the declarative compare-table layout.

The compare table renders spec values by DotWrapper path, and DotWrapper
returns an empty wrapper for a key it can't find rather than raising. That is
convenient in a template but means a renamed or dropped spreadsheet column
shows up as a silently blank column instead of an error.

These tests close that gap: every path in COMPARE_LAYOUT must resolve to a
real value for at least one board in the database.
"""

import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import get_engine, get_session_factory, Motherboard
from services.compare_layout import COMPARE_LAYOUT, iter_row_paths, resolve_spec

TEMPLATES = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates"
)


@pytest.fixture(scope="module")
def mobos():
    engine = get_engine()
    session = get_session_factory(engine)()
    try:
        boards = session.query(Motherboard).all()
        assert boards, "database is empty -- run scripts/init_db.py"
        yield boards
    finally:
        session.close()


def _rows():
    """Every row in the layout, with the group it belongs to."""
    for section in COMPARE_LAYOUT:
        groups = [{"id": section["id"], "rows": section.get("rows", [])}]
        groups += section.get("children", [])
        for group in groups:
            for row in group.get("rows", []):
                yield group.get("id", section["id"]), row


@pytest.mark.parametrize(
    "label,path",
    list(dict.fromkeys(iter_row_paths())),
    ids=lambda v: str(v).replace(" ", "_"),
)
def test_every_layout_path_resolves_for_some_board(label, path, mobos):
    """
    A path that resolves empty for *every* board means the spreadsheet column
    behind it was renamed or removed, and the table is quietly rendering a
    blank column.
    """
    hits = sum(1 for m in mobos if str(resolve_spec(m.dot, path)).strip())
    assert hits > 0, (
        f"row {label!r} reads {path!r}, which is empty for all "
        f"{len(mobos)} boards -- the underlying column is likely gone or renamed"
    )


def test_custom_rows_have_a_renderer():
    """Every custom row name must have a branch in compare_rows.html."""
    with open(
        os.path.join(TEMPLATES, "partials", "compare_rows.html"), encoding="utf-8"
    ) as f:
        source = f.read()

    implemented = set(re.findall(r"name == '([a-z0-9_]+)'", source))
    declared = {
        row["name"] for _, row in _rows() if row["kind"] == "custom"
    }

    missing = declared - implemented
    assert not missing, f"custom rows with no renderer: {sorted(missing)}"

    unused = implemented - declared
    assert not unused, f"renderers no layout row uses: {sorted(unused)}"


def test_section_and_subsection_ids_are_unique():
    """The collapse/expand JS keys off these ids, so duplicates would alias."""
    ids = []
    for section in COMPARE_LAYOUT:
        ids.append(section["id"])
        for sub in section.get("children", []):
            ids.append(sub["id"])

    duplicates = {i for i in ids if ids.count(i) > 1}
    assert not duplicates, f"duplicate section ids: {sorted(duplicates)}"


def test_subsection_ids_are_prefixed_with_their_section():
    """compare.js derives the parent from the id prefix when restoring state."""
    for section in COMPARE_LAYOUT:
        for sub in section.get("children", []):
            assert sub["id"].startswith(f"{section['id']}-"), (
                f"subsection {sub['id']!r} is not prefixed with "
                f"section {section['id']!r}"
            )
