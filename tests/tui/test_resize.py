"""
PLUGIN011_67 replacement: Auto-compact on terminal resize.

Uses Textual Pilot API instead of file inspection.
Tests real behavior: resizing terminal, verifying CSS class changes.
"""

import pytest


@pytest.mark.asyncio
async def test_starts_compact_stays_compact_on_small(make_app):
    """App starts compact; resize to small keeps compact."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        assert app.screen.has_class("compact")  # starts compact
        await pilot.resize_terminal(80, 14)
        await pilot.pause()
        assert app.screen.has_class("compact")  # still compact


@pytest.mark.asyncio
async def test_m_toggles_to_full_then_resize_recompacts(make_app):
    """M switches to full. Resize below threshold re-enables compact."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        await pilot.press("m")  # switch to full
        await pilot.pause()
        assert not app.screen.has_class("compact")
        await pilot.resize_terminal(80, 14)
        await pilot.pause()
        assert app.screen.has_class("compact")  # auto-compact triggered


@pytest.mark.asyncio
async def test_compact_sticky_on_resize_up(make_app):
    """Compact stays when terminal grows back (sticky behavior)."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        assert app.screen.has_class("compact")
        await pilot.resize_terminal(80, 30)
        await pilot.pause()
        assert app.screen.has_class("compact")  # stays compact


@pytest.mark.asyncio
async def test_m_restores_full_from_compact(make_app):
    """M key can restore full mode from default compact."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        assert app.screen.has_class("compact")
        await pilot.press("m")
        await pilot.pause()
        assert not app.screen.has_class("compact")
