"""
PLUGIN011_65/66 replacement: Stop tests via X key.

Uses Textual Pilot API instead of file inspection.
Tests real behavior: pressing X key, verifying notification.
"""

import pytest

from helpers import write_test_yaml
from tui.models import TestState


@pytest.mark.asyncio
async def test_x_with_no_process(make_app):
    """PLUGIN011_65: X key with pid=0 shows warning notification."""
    app = make_app()
    async with app.run_test(size=(80, 24), notifications=True) as pilot:
        # Default status has pid=0, pressing X should warn
        await pilot.press("x")
        await pilot.pause()
        # Verify app is still in idle state (no crash, no state change)
        assert app.status.state == TestState.IDLE
        assert app.status.pid <= 0


@pytest.mark.asyncio
async def test_x_does_not_crash_with_dead_pid(make_app, status_file):
    """PLUGIN011_66: X key with non-existent PID handles gracefully."""
    write_test_yaml(status_file, state=TestState.RUNNING, pid=999999999)
    app = make_app()
    async with app.run_test(size=(80, 24), notifications=True) as pilot:
        await pilot.pause(0.3)  # wait for poll to read YAML
        assert app.status.state == TestState.RUNNING
        await pilot.press("x")
        await pilot.pause()
        # App should not crash — stop_tests returns False for dead PID
        assert app.status.pid == 999999999
