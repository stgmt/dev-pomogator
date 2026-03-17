"""
Help overlay test — ? key shows keybinding hints.
"""

import pytest

from tui.app import TestRunnerApp


@pytest.mark.asyncio
async def test_help_keybinding_exists(make_app):
    """? keybinding is registered."""
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        binding_keys = [b.key for b in app.BINDINGS]
        assert "question_mark" in binding_keys


@pytest.mark.asyncio
async def test_help_text_defined(make_app):
    """HELP_TEXT contains pane resize instructions."""
    app = make_app()
    assert "Alt+Shift" in app.HELP_TEXT
    assert "compact" in app.HELP_TEXT.lower() or "M —" in app.HELP_TEXT
