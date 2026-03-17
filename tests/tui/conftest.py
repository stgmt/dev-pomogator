"""
Fixtures for Textual TUI Pilot tests.

Provides headless TestRunnerApp instances with temp status files
for testing compact mode, toggle, stop, resize, and YAML polling.
"""

import sys
from pathlib import Path

import pytest

# Add TUI source to Python path
TUI_SRC = (
    Path(__file__).parent.parent.parent
    / "extensions"
    / "tui-test-runner"
    / "tools"
    / "tui-test-runner"
)
sys.path.insert(0, str(TUI_SRC))


@pytest.fixture
def status_file(tmp_path):
    """Temp path for a YAML status file."""
    return str(tmp_path / "status.test1234.yaml")


@pytest.fixture
def make_app(status_file):
    """Factory for TestRunnerApp with a temp status file."""
    from tui.app import TestRunnerApp

    def _make(**kwargs):
        defaults = {
            "status_file": status_file,
            "poll_interval": 0.1,
        }
        defaults.update(kwargs)
        return TestRunnerApp(**defaults)

    return _make
