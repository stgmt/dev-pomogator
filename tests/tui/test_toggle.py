"""
PLUGIN011_63/64/64b replacement: Toggle compact/full via M key.

Uses Textual Pilot API instead of file inspection.
Tests real behavior: pressing M key, verifying CSS class changes.
"""

import pytest


@pytest.mark.asyncio
async def test_m_toggles_to_full(make_app):
    """PLUGIN011_63: App starts compact. Pressing M switches to full mode."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        assert app.screen.has_class("compact")  # starts compact
        await pilot.press("m")
        await pilot.pause()
        assert not app.screen.has_class("compact")  # now full


@pytest.mark.asyncio
async def test_m_toggles_back_to_compact(make_app):
    """PLUGIN011_64: Pressing M twice returns to compact."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        assert app.screen.has_class("compact")
        await pilot.press("m")
        await pilot.pause()
        assert not app.screen.has_class("compact")
        await pilot.press("m")
        await pilot.pause()
        assert app.screen.has_class("compact")


@pytest.mark.asyncio
async def test_toggle_uses_add_remove_class(make_app):
    """PLUGIN011_64b: Toggle uses add_class/remove_class (not toggle_class)."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.pause()
        # Starts compact. Multiple rapid toggles should be consistent
        for _ in range(5):
            await pilot.press("m")
            await pilot.pause()
        # Started compact + 5 toggles (odd) = full
        assert not app.screen.has_class("compact")
        await pilot.press("m")
        await pilot.pause()
        # + 6th toggle = compact again
        assert app.screen.has_class("compact")
