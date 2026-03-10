"""
Analysis Tab — automatic failure grouping by error patterns with recommendations.
Ported from zoho analyst, made framework-agnostic.
"""

import re
from collections import defaultdict
from textual.app import ComposeResult
from textual.containers import Vertical, VerticalScroll
from textual.widgets import Static
from textual.widget import Widget

from ..models import TestStatus, TestResult, TestResultStatus


# Error pattern categories
ERROR_PATTERNS: list[tuple[str, re.Pattern, str]] = [
    ("Assertion", re.compile(r"(?:Assert|Expect|assert|expect)", re.IGNORECASE), "Check expected values and test data."),
    ("Timeout", re.compile(r"(?:timeout|timed?\s*out|ETIMEDOUT)", re.IGNORECASE), "Increase timeout or check service availability."),
    ("Connection", re.compile(r"(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|connection\s+refused)", re.IGNORECASE), "Check if required services are running."),
    ("Permission", re.compile(r"(?:EACCES|EPERM|permission\s+denied)", re.IGNORECASE), "Check file/directory permissions."),
    ("Not Found", re.compile(r"(?:ENOENT|not\s+found|404|Module not found)", re.IGNORECASE), "Check file paths and module imports."),
    ("Type Error", re.compile(r"(?:TypeError|is not a function|undefined is not)", re.IGNORECASE), "Check variable types and null checks."),
    ("Runtime", re.compile(r"(?:RangeError|ReferenceError|SyntaxError)", re.IGNORECASE), "Check code for runtime errors."),
]


def categorize_error(error: str | None, stack: str | None) -> tuple[str, str]:
    """Categorize an error message into a pattern group. Returns (category, recommendation)."""
    text = f"{error or ''} {stack or ''}"
    for category, pattern, recommendation in ERROR_PATTERNS:
        if pattern.search(text):
            return category, recommendation
    return "Unknown", "Investigate the error message and stack trace."


class AnalysisTab(Widget):
    """Failure analysis with error pattern grouping."""

    DEFAULT_CSS = """
    AnalysisTab {
        layout: vertical;
        padding: 1 2;
    }
    .group-header {
        text-style: bold;
        margin-top: 1;
    }
    .group-recommendation {
        color: $text-muted;
        margin-bottom: 1;
        padding-left: 2;
    }
    .test-entry {
        padding-left: 4;
    }
    .test-error {
        padding-left: 6;
        color: $error;
    }
    #no-failures {
        padding: 2 4;
        color: $success;
    }
    """

    def __init__(self) -> None:
        super().__init__()
        self._last_failed_key: str = ""

    def compose(self) -> ComposeResult:
        yield Static("[b]Failure Analysis[/]", classes="section-title")
        yield VerticalScroll(id="analysis-content")
        yield Static("[green]No failures to analyze[/]", id="no-failures")

    def update_status(self, status: TestStatus) -> None:
        """Rebuild analysis from failed tests. Skips rebuild if failures unchanged."""
        failed_tests: list[TestResult] = []

        if status.is_v2:
            for suite in status.suites:
                for test in suite.tests:
                    if test.status == TestResultStatus.FAILED:
                        failed_tests.append(test)

        # Skip rebuild if same failures as last update
        key = "|".join(f"{t.name}:{t.error or ''}" for t in failed_tests)
        if key == self._last_failed_key:
            return
        self._last_failed_key = key

        content = self.query_one("#analysis-content", VerticalScroll)
        no_failures = self.query_one("#no-failures", Static)

        if not failed_tests:
            content.display = False
            no_failures.display = True
            no_failures.update("[green]No failures to analyze[/]")
            return

        content.display = True
        no_failures.display = False

        # Group by error pattern
        groups: dict[str, list[tuple[TestResult, str]]] = defaultdict(list)
        for test in failed_tests:
            category, recommendation = categorize_error(test.error, test.stack)
            groups[category].append((test, recommendation))

        # Rebuild content
        content.remove_children()

        content.mount(Static(f"[bold red]{len(failed_tests)} failed test(s)[/] in {len(groups)} group(s)\n"))

        for category, items in sorted(groups.items(), key=lambda x: -len(x[1])):
            recommendation = items[0][1]
            content.mount(Static(
                f"[bold]{category}[/] ({len(items)} test(s))",
                classes="group-header",
            ))
            content.mount(Static(
                f"💡 {recommendation}",
                classes="group-recommendation",
            ))

            for test, _ in items:
                dur = f" ({test.duration_ms}ms)" if test.duration_ms else ""
                content.mount(Static(
                    f"❌ {test.name}{dur}",
                    classes="test-entry",
                ))
                if test.error:
                    err_display = test.error[:200] + "..." if len(test.error) > 200 else test.error
                    content.mount(Static(
                        f"  {err_display}",
                        classes="test-error",
                    ))
