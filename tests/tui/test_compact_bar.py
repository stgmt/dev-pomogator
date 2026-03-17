"""
CompactBar widget tests in real app context.

Tests render_compact() pure function AND widget integration.
PLUGIN011_60-62 cover the pure function in TypeScript; these test Pilot integration.
"""

import pytest

from tui.widgets.compact_bar import CompactBar, render_compact
from tui.models import TestState, TestStatus
from helpers import write_test_yaml


def test_render_compact_running():
    """render_compact returns single-line string with counts and progress."""
    status = TestStatus(
        state=TestState.RUNNING,
        framework="vitest",
        passed=38,
        failed=2,
        skipped=0,
        running=10,
        total=50,
        percent=76,
        duration_ms=12500,
    )
    output = render_compact(status)
    assert "76%" in output
    assert "38/50✅" in output
    assert "2❌" in output
    assert "vitest" in output
    assert "█" in output
    # Single line — no newlines
    assert "\n" not in output


def test_render_compact_idle():
    """render_compact returns idle indicator for None or idle status."""
    assert "no test runs" in render_compact(None)
    idle = TestStatus(state=TestState.IDLE)
    assert "no test runs" in render_compact(idle)


@pytest.mark.asyncio
async def test_compact_bar_visible_on_start(make_app):
    """App starts in compact mode — CompactBar visible."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        bar = app.query_one(CompactBar)
        assert app.screen.has_class("compact")
        assert bar.styles.display == "block"


@pytest.mark.asyncio
async def test_compact_bar_hidden_in_full_mode(make_app):
    """Pressing M switches to full — CompactBar hidden."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        await pilot.press("m")  # switch to full
        await pilot.pause()
        bar = app.query_one(CompactBar)
        assert not app.screen.has_class("compact")
        assert bar.styles.display == "none"
