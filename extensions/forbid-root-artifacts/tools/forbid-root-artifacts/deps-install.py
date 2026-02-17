#!/usr/bin/env python3
"""
Install Python dependencies for forbid-root-artifacts.

Uses only stdlib — no third-party imports.
Always exits 0 (warnings on failure, never blocks install).

Dependencies installed:
  - pyyaml: required by configure.py, check.py
  - pre-commit: required for git hook setup
"""
from __future__ import annotations

import shutil
import subprocess
import sys


def _pip_install(package: str) -> bool:
    """Install a package via pip. Returns True on success."""
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", package],
            check=True,
            capture_output=True,
            text=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"  WARNING: pip install {package} failed: {e.stderr.strip()}", file=sys.stderr)
        return False
    except FileNotFoundError:
        print(f"  WARNING: pip not found, cannot install {package}", file=sys.stderr)
        return False


def ensure_pyyaml() -> None:
    """Ensure pyyaml is installed."""
    try:
        import importlib
        importlib.import_module("yaml")
        print("  pyyaml: already installed")
    except ImportError:
        print("  pyyaml: not found, installing...")
        if _pip_install("pyyaml"):
            print("  pyyaml: installed successfully")
        else:
            print("  pyyaml: FAILED — configure.py will not work", file=sys.stderr)


def ensure_pre_commit() -> None:
    """Ensure pre-commit is available."""
    # Check direct command
    if shutil.which("pre-commit"):
        print("  pre-commit: already installed")
        return

    # Check python -m pre_commit
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pre_commit", "--version"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print("  pre-commit: already installed (python -m)")
            return
    except Exception:
        pass

    print("  pre-commit: not found, installing...")
    if _pip_install("pre-commit"):
        print("  pre-commit: installed successfully")
    else:
        print("  pre-commit: FAILED — git hook will not be set up", file=sys.stderr)


def main() -> int:
    """Install dependencies. Always returns 0."""
    print("Installing forbid-root-artifacts dependencies...")
    ensure_pyyaml()
    ensure_pre_commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
