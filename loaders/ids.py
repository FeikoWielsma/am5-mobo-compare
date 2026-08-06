"""
Stable, URL-safe motherboard identifiers.

IDs used to be `{sheet}_{rowindex}_{model}`, derived from a board's position
in the spreadsheet. Inserting a row renumbered every board below it, which:

  * invalidated every shared /compare?ids=... link,
  * orphaned the rear-I/O PNGs, which are named after the id, leaving stale
    files behind on each refresh,
  * meant the id changed without the board changing.

A refresh in August 2026 renumbered 245 of 596 boards for exactly this reason.

The id is now derived from the board's identity -- brand and model -- so it
only changes when the board's own name does.

URL safety
----------
Ids travel in a query string (`/compare?ids=a,b,c`), where `+` decodes to a
space. Fourteen boards had `+` in their model name (Sapphire NITRO+, ASRock
M.2+, Biostar PRO+) and could not be loaded from a shared link at all -- the
board silently vanished from the comparison.

`+` is also meaningful: "A620M- HDV-M.2+" and "A620M- HDV-M.2" are two
different boards, so it cannot simply be dropped. It is spelled out as
"plus", and everything else outside [A-Za-z0-9._-] becomes an underscore.
Commas are excluded too, since they separate ids in the query string.
"""

import re

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def slugify(text):
    """Reduce free text to the safe id alphabet, preserving '+' as 'plus'."""
    text = str(text or "").strip()
    text = text.replace("+", "plus")
    text = _UNSAFE.sub("_", text)
    text = re.sub(r"_+", "_", text)
    return text.strip("_-") or "unknown"


def make_mobo_id(brand, model):
    """
    The canonical id for a board. Used for the database key, the compare
    URL, and the rear-I/O image filename -- these must agree, so every
    caller goes through here.
    """
    return f"{slugify(brand)}_{slugify(model)}"


def assert_unique_ids(records):
    """
    Fail loudly on duplicate ids.

    Two boards sharing an id would otherwise collide on the primary key, or
    silently overwrite each other's extracted image. If this ever fires, the
    spreadsheet has two rows with the same brand and model and the scheme
    needs another distinguishing field -- don't paper over it with a counter,
    which would reintroduce position-dependence.
    """
    seen = {}
    duplicates = []
    for record in records:
        rid = record.get("id")
        if rid in seen:
            duplicates.append((rid, seen[rid], record.get("model")))
        else:
            seen[rid] = record.get("model")

    if duplicates:
        detail = "\n".join(
            f"  {rid!r}: {a!r} and {b!r}" for rid, a, b in duplicates
        )
        raise ValueError(
            f"{len(duplicates)} duplicate motherboard id(s):\n{detail}"
        )
