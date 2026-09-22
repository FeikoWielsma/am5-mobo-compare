import hashlib

from scripts import resolve_lfs_workbook


class FakeResponse:
    def __init__(self, *, body=None, chunks=None):
        self.body = body
        self.chunks = chunks

    def raise_for_status(self):
        pass

    def json(self):
        return self.body

    def iter_content(self, chunk_size):
        return iter(self.chunks)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


def test_resolve_lfs_pointer_downloads_verified_workbook(tmp_path, monkeypatch):
    content = b"PK\x03\x04example workbook content"
    oid = hashlib.sha256(content).hexdigest()
    workbook = tmp_path / "boards.xlsx"
    workbook.write_text(
        f"version https://git-lfs.github.com/spec/v1\noid sha256:{oid}\nsize {len(content)}\n",
        encoding="ascii",
    )

    def fake_post(url, *, json, headers, timeout):
        assert json["objects"] == [{"oid": oid, "size": len(content)}]
        return FakeResponse(body={"objects": [{"actions": {"download": {"href": "https://example.com/workbook"}}}]})

    def fake_get(url, *, headers, stream, timeout):
        return FakeResponse(chunks=[content])

    monkeypatch.setattr(resolve_lfs_workbook.requests, "post", fake_post)
    monkeypatch.setattr(resolve_lfs_workbook.requests, "get", fake_get)

    assert resolve_lfs_workbook.resolve_workbook(workbook)
    assert workbook.read_bytes() == content
    assert not resolve_lfs_workbook.resolve_workbook(workbook)
