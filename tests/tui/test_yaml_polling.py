"""
YAML polling integration tests.

Tests that TUI reacts to YAML status file changes —
the core data flow: wrapper writes YAML → TUI reads → UI updates.
"""

import pytest

from tui.models import TestState
from helpers import write_test_yaml


@pytest.mark.asyncio
async def test_tui_starts_idle(make_app):
    """TUI starts with idle status when no YAML file exists."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        assert app.status.state == TestState.IDLE


@pytest.mark.asyncio
async def test_tui_reacts_to_yaml_change(make_app, status_file):
    """TUI picks up YAML changes and updates status."""
    app = make_app(poll_interval=0.1)
    async with app.run_test(size=(80, 24)) as pilot:
        assert app.status.state == TestState.IDLE
        # Write running YAML
        write_test_yaml(status_file, state="running", percent=50, passed=5, total=10)
        await pilot.pause(0.3)  # wait for poll cycle
        assert app.status.state == TestState.RUNNING
        assert app.status.percent == 50
        assert app.status.passed == 5


@pytest.mark.asyncio
async def test_tui_updates_on_completion(make_app, status_file):
    """TUI reflects completed state from YAML."""
    app = make_app(poll_interval=0.1)
    async with app.run_test(size=(80, 24)) as pilot:
        write_test_yaml(status_file, state="running", percent=50)
        await pilot.pause(0.3)
        assert app.status.state == TestState.RUNNING
        # Update to passed
        write_test_yaml(status_file, state="passed", percent=100, passed=10, total=10, running=0)
        await pilot.pause(0.3)
        assert app.status.state == TestState.PASSED
        assert app.status.percent == 100


@pytest.mark.asyncio
async def test_tui_handles_corrupted_yaml(make_app, status_file):
    """TUI doesn't crash on corrupted YAML."""
    from pathlib import Path

    app = make_app(poll_interval=0.1)
    async with app.run_test(size=(80, 24)) as pilot:
        # Write valid YAML first
        write_test_yaml(status_file, state="running", percent=30)
        await pilot.pause(0.3)
        assert app.status.state == TestState.RUNNING
        # Corrupt the file
        Path(status_file).write_text("{{{{invalid yaml!!!!!", encoding="utf-8")
        await pilot.pause(0.3)
        # Should keep previous status (not crash)
        assert app.status.state == TestState.RUNNING
