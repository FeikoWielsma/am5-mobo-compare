"""Replace a Git LFS workbook pointer with its verified public object."""

from __future__ import annotations

import hashlib
import os
import re
import tempfile
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "AM5 Motherboards Sheet (X870_X670_B850_B650_B840_A620).xlsx"
BATCH_URL = "https://github.com/FeikoWielsma/am5-mobo-compare.git/info/lfs/objects/batch"


def resolve_workbook(path: Path = WORKBOOK) -> bool:
    """Download the workbook only when a source checkout contains an LFS pointer."""
    with path.open("rb") as source:
        prefix = source.read(256)
    if not prefix.startswith(b"version https://git-lfs.github.com/spec/v1"):
        return False

    pointer = prefix.decode("ascii").replace("\r\n", "\n")
    oid_match = re.search(r"^oid sha256:([0-9a-f]{64})$", pointer, re.MULTILINE)
    size_match = re.search(r"^size ([0-9]+)$", pointer, re.MULTILINE)
    if not oid_match or not size_match:
        raise ValueError("Invalid Git LFS workbook pointer")
    oid, expected_size = oid_match.group(1), int(size_match.group(1))

    batch = requests.post(
        BATCH_URL,
        json={"operation": "download", "transfers": ["basic"], "objects": [{"oid": oid, "size": expected_size}]},
        headers={"Accept": "application/vnd.git-lfs+json", "Content-Type": "application/vnd.git-lfs+json"},
        timeout=30,
    )
    batch.raise_for_status()
    action = batch.json()["objects"][0]["actions"]["download"]
    if not action["href"].startswith("https://"):
        raise ValueError("Git LFS download URL is not HTTPS")

    print(f"Downloading Git LFS workbook ({expected_size} bytes)...", flush=True)
    digest = hashlib.sha256()
    actual_size = 0
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix="workbook-", suffix=".xlsx", delete=False) as temp:
            temp_path = Path(temp.name)
            with requests.get(action["href"], headers=action.get("header", {}), stream=True, timeout=(30, 120)) as download:
                download.raise_for_status()
                for chunk in download.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        temp.write(chunk)
                        digest.update(chunk)
                        actual_size += len(chunk)
        if actual_size != expected_size or digest.hexdigest() != oid:
            raise ValueError("Downloaded Git LFS workbook failed size or SHA-256 verification")
        os.replace(temp_path, path)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink()
    print("Git LFS workbook verified.", flush=True)
    return True


if __name__ == "__main__":
    resolve_workbook()
