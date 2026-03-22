"""
CompactBar — single-line compact status display for TUI test runner.

Renders test progress in minimal space (1 line):
icon + framework + counts + progress bar + % + duration

@feature1 FR-1, FR-6
"""

from __future__ import annotations

from ..models import STATE_ICONS, TestState, TestStatus


def progress_bar_ascii(percent: int, width: int = 12) -> str:
    """Render ASCII progress bar: █░ format."""
    filled = width * percent // 100
    return "█" * filled + "░" * (width - filled)


def render_compact(status: TestStatus | None) -> str:
    """Pure function: render compact status as single-line plain text string."""
    if not status or status.state == TestState.IDLE:
        return "⏸ no test runs"

    icon = STATE_ICONS.get(status.state, "?")
    bar = progress_bar_ascii(status.percent, width=12)
    duration = status.duration_display

    total_str = f"/{status.total}" if status.total > 0 else ""
    pct_str = f"{status.percent}%" if status.total > 0 else ""
    return (
        f"{icon} {status.framework} "
        f"{status.passed}{total_str}✅ {status.failed}❌ "
        f"{bar} {pct_str} {duration}".rstrip()
    )


try:
    from textual.widgets import Static
    from textual.app import RenderableType
    from rich.text import Text

    class CompactBar(Static):
        """Single-line compact status bar widget."""

        DEFAULT_CSS = """
        CompactBar {
            height: 1;
            padding: 0 1;
            display: none;
        }
        """

        def render(self) -> RenderableType:
            status = getattr(self.app, "status", None)
            text = render_compact(status)
            if not status or status.state == TestState.IDLE:
                return Text(text, style="dim")
            return Text(text)

except ImportError:
    # Textual not installed — render_compact still usable as pure function
    pass
