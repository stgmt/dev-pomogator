"""
Logs Tab — real-time log viewer with syntax highlighting.
20+ regex patterns for: stack traces, timestamps, BDD keywords, HTTP codes, file paths, log levels.
Ported from zoho logs_tab.py — patterns are generic, not framework-specific.
"""

import re
from textual.app import ComposeResult
from textual.widgets import RichLog, Static
from textual.widget import Widget
from rich.text import Text


# Highlight patterns: (regex, style)
HIGHLIGHT_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Log levels (Serilog-style)
    (re.compile(r"\[INF\]|\bINFO\b"), "green"),
    (re.compile(r"\[WRN\]|\bWARN(?:ING)?\b"), "yellow"),
    (re.compile(r"\[ERR\]|\bERROR\b"), "bold red"),
    (re.compile(r"\[DBG\]|\bDEBUG\b"), "dim"),
    (re.compile(r"\[FTL\]|\bFATAL\b"), "bold red on white"),
    # Test results
    (re.compile(r"\bPASSED\b|✓|√"), "bold green"),
    (re.compile(r"\bFAILED\b|✗|×"), "bold red"),
    (re.compile(r"\bSKIPPED\b|○|↓"), "yellow"),
    # Stack traces
    (re.compile(r"^\s+at\s+.+"), "red"),
    (re.compile(r"^(Error|TypeError|ReferenceError|AssertionError|AssertionError):.*"), "bold red"),
    # BDD keywords
    (re.compile(r"\b(Given|When|Then|And|But)\b"), "bold cyan"),
    (re.compile(r"\b(Scenario|Feature|Background)\b:?"), "bold magenta"),
    # Timestamps
    (re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}"), "dim"),
    (re.compile(r"\d{2}:\d{2}:\d{2}\.\d+"), "dim"),
    # HTTP codes (require HTTP context to avoid false positives on line numbers etc.)
    (re.compile(r"(?:HTTP[/ ]\d\.\d\s+|status[: ]+)[2]\d{2}\b"), "green"),
    (re.compile(r"(?:HTTP[/ ]\d\.\d\s+|status[: ]+)[4]\d{2}\b"), "yellow"),
    (re.compile(r"(?:HTTP[/ ]\d\.\d\s+|status[: ]+)[5]\d{2}\b"), "red"),
    # File paths (Windows & Unix)
    (re.compile(r"[A-Za-z]:\\[\w\\.\-]+"), "underline"),
    (re.compile(r"/[\w/.\-]+\.\w+"), "underline"),
    # Duration
    (re.compile(r"\b\d+(?:\.\d+)?\s*(?:ms|s|m|min)\b"), "cyan"),
    # Docker keywords
    (re.compile(r"\b(?:docker|container|image|volume|network)\b", re.IGNORECASE), "blue"),
    # Namespace/class patterns
    (re.compile(r"\b\w+\.\w+\.\w+(?:\.\w+)+"), "dim cyan"),
]


def highlight_line(line: str) -> Text:
    """Apply syntax highlighting to a single log line."""
    text = Text(line)
    for pattern, style in HIGHLIGHT_PATTERNS:
        for match in pattern.finditer(line):
            start, end = match.span()
            text.stylize(style, start, end)
    return text


class LogsTab(Widget):
    """Real-time log viewer with syntax highlighting."""

    DEFAULT_CSS = """
    LogsTab {
        layout: vertical;
    }
    #log-viewer {
        height: 1fr;
    }
    #log-status {
        dock: bottom;
        height: 1;
        background: $surface;
        padding: 0 1;
    }
    """

    def __init__(self) -> None:
        super().__init__()
        self._line_count = 0

    def compose(self) -> ComposeResult:
        yield RichLog(highlight=False, markup=False, auto_scroll=True, max_lines=10000, id="log-viewer")
        yield Static("[dim]Waiting for log output...[/]", id="log-status")

    def append_lines(self, lines: list[str]) -> None:
        """Append new log lines with syntax highlighting."""
        log_widget = self.query_one("#log-viewer", RichLog)
        for line in lines:
            log_widget.write(highlight_line(line))
            self._line_count += 1

        self.query_one("#log-status", Static).update(
            f"[dim]{self._line_count} lines[/]"
        )
