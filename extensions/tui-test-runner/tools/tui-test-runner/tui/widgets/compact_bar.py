"""
CompactBar — 3-line compact status display for TUI test runner.

Renders test progress in minimal space:
- Line 1: icon + framework + counts + progress bar + duration
- Line 2: current test name or last error
- Line 3: keybinding hints

@feature1 FR-1, FR-6
"""

from __future__ import annotations

from ..models import TestState, TestStatus


# Plain emoji icons (no Textual markup — for text rendering)
COMPACT_ICONS = {
    TestState.IDLE: "⏸",
    TestState.RUNNING: "🔄",
    TestState.PASSED: "✅",
    TestState.FAILED: "❌",
    TestState.ERROR: "⚠️",
    TestState.COMPLETED: "✅",
}


def progress_bar_ascii(percent: int, width: int = 20) -> str:
    """Render ASCII progress bar: █░ format."""
    filled = width * percent // 100
    return "█" * filled + "░" * (width - filled)


def render_compact(status: TestStatus | None) -> str:
    """Pure function: render compact status as plain text string."""
    if not status or status.state == TestState.IDLE:
        return "│ no test runs"

    icon = COMPACT_ICONS.get(status.state, "?")
    bar = progress_bar_ascii(status.percent)
    duration = status.duration_display

    line1 = (
        f"{icon} {status.framework} "
        f"{status.passed}✅ {status.failed}❌ {status.skipped}⏭ "
        f"{bar} {status.percent}% {duration}"
    )

    # Line 2: current running test or last error
    current = ""
    if status.running > 0 and status.suites:
        for suite in status.suites:
            for test in suite.tests:
                if test.status.value == "running":
                    current = f"  ▸ {test.name}"
                    break
            if current:
                break
    if not current and status.failed > 0 and status.error_message:
        current = f"  ✗ {status.error_message[:80]}"

    line3 = "  [X Stop]  [M Full]  [S Screenshot]"

    parts = [line1]
    if current:
        parts.append(current)
    parts.append(line3)
    return "\n".join(parts)


try:
    from textual.widgets import Static
    from textual.app import RenderableType
    from rich.text import Text

    class CompactBar(Static):
        """3-line compact status bar widget."""

        DEFAULT_CSS = """
        CompactBar {
            height: auto;
            max-height: 5;
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
