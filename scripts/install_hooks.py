"""
Installer script for repository git hooks.
Configures git to use the version-controlled .githooks/ directory.
"""

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def install_hooks() -> int:
    """Configure git core.hooksPath to point to .githooks."""
    print("Installing git hooks...")

    cmd = ["git", "config", "core.hooksPath", ".githooks"]
    res = subprocess.run(cmd, cwd=REPO_ROOT)
    if res.returncode != 0:
        print("Failed to configure git core.hooksPath", file=sys.stderr)
        return res.returncode

    hook_path = REPO_ROOT / ".githooks" / "pre-commit"
    if hook_path.exists():
        try:
            hook_path.chmod(0o755)
        except Exception:
            pass

    print("Git hooks configured successfully:")
    print("  core.hooksPath = .githooks")
    return 0


if __name__ == "__main__":
    sys.exit(install_hooks())
