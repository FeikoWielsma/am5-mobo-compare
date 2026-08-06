"""
Shared pytest fixtures.

Two things this file exists to prevent:

1. Re-parsing the 170MB+ spreadsheet once per test. `load_data()` takes ~25s,
   so the `loaded_data` fixture parses once per session and hands out the
   result. Tests must treat it as read-only.

2. Tests writing into the served static assets. Image extraction is a side
   effect of `load_data()`, so MOBO_IO_IMAGE_DIR is redirected to a temp dir
   before `loaders.config` is imported.

The `live_server` fixture starts the app on its own ephemeral port, so the
suite no longer depends on a manually started server -- and can't accidentally
test one that happens to be running on :5000.
"""

import os
import socket
import subprocess
import sys
import tempfile
import time

import pytest
import requests

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

# Must happen before anything imports loaders.config, which reads this at
# import time. conftest is loaded before test modules, so this is early enough.
_TEST_IMAGE_DIR = os.path.join(tempfile.gettempdir(), "am5_test_io_images")
os.environ.setdefault("MOBO_IO_IMAGE_DIR", _TEST_IMAGE_DIR)

SERVER_BOOT_TIMEOUT = 60


def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def loaded_data():
    """
    Parses the spreadsheet once per session.

    Returns (mobos, structure). Treat as read-only -- it is shared across
    every test in the run.
    """
    from loaders import load_data

    return load_data()


@pytest.fixture(scope="session")
def live_server():
    """
    Runs app.py on an ephemeral port for the browser tests.

    Yields the base URL (no trailing slash). Fails loudly rather than
    skipping, so a broken server can't hide as a silently passing run.
    """
    port = _free_port()
    env = {
        **os.environ,
        "PORT": str(port),
        "FLASK_DEBUG": "0",  # no reloader -- see app.py
    }

    # Log to a file rather than a pipe. The dev server logs every request, and
    # nothing here drains a pipe -- once its buffer filled, the server would
    # block on write and hang partway through the run.
    log = tempfile.NamedTemporaryFile(
        mode="w+", suffix=".log", prefix="am5_test_server_", delete=False
    )

    def _server_output():
        log.flush()
        with open(log.name, "r", errors="replace") as fh:
            return fh.read()

    proc = subprocess.Popen(
        [sys.executable, "app.py"],
        cwd=PROJECT_ROOT,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )

    base_url = f"http://127.0.0.1:{port}"
    deadline = time.time() + SERVER_BOOT_TIMEOUT

    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(
                f"Test server exited early (code {proc.returncode}):\n"
                f"{_server_output()}"
            )
        try:
            requests.get(f"{base_url}/api/mobos", timeout=5).raise_for_status()
            break
        except Exception:
            time.sleep(0.5)
    else:
        proc.kill()
        raise RuntimeError(
            f"Test server did not become ready within {SERVER_BOOT_TIMEOUT}s:\n"
            f"{_server_output()}"
        )

    yield base_url

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    log.close()
    try:
        os.unlink(log.name)
    except OSError:
        pass


@pytest.fixture(scope="session")
def valid_ids(live_server):
    """Real motherboard IDs from the running server, for building URLs."""
    response = requests.get(f"{live_server}/api/mobos", timeout=30)
    response.raise_for_status()
    return [str(m["id"]) for m in response.json()]
