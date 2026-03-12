"""
Analysis Tab — structured failure cards built from YAML v2 status.
"""

from pathlib import Path

from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.widget import Widget
from textual.widgets import Static

from ..analyst.output import AnalysisReport, FailureCard, analyze_status
from ..models import TestStatus


class AnalysisTab(Widget):
    """Failure analysis with pattern matching, locations, and code snippets."""

    DEFAULT_CSS = """
    AnalysisTab {
        layout: vertical;
        padding: 1 2;
    }
    .analysis-summary {
        text-style: bold;
        margin-bottom: 1;
    }
    .failure-title {
        text-style: bold;
        margin-top: 1;
    }
    .failure-meta {
        padding-left: 2;
    }
    .failure-hint {
        color: $text-muted;
        padding-left: 2;
    }
    .failure-error {
        color: $error;
        padding-left: 2;
    }
    .analysis-block {
        background: $surface;
        color: $text;
        margin: 1 0 0 2;
        padding: 1;
    }
    #no-failures {
        padding: 2 4;
        color: $success;
    }
    """

    def __init__(self, project_root: str | Path | None = None) -> None:
        super().__init__()
        self._project_root = str(project_root) if project_root else None
        self._last_failed_key: str = ""

    def compose(self) -> ComposeResult:
        yield Static("[b]Failure Analysis[/]", classes="section-title")
        yield VerticalScroll(id="analysis-content")
        yield Static("[green]No failures to analyze[/]", id="no-failures")

    def update_status(self, status: TestStatus) -> None:
        """Rebuild analysis from failed tests in YAML v2 status."""
        report = analyze_status(
            status,
            project_root=self._project_root,
            user_patterns_path=self._get_user_patterns_path(),
        )

        key = self._build_report_key(report)
        if key == self._last_failed_key:
            return
        self._last_failed_key = key

        content = self.query_one("#analysis-content", VerticalScroll)
        no_failures = self.query_one("#no-failures", Static)
        content.remove_children()

        if not report.failures:
            content.display = False
            no_failures.display = True
            no_failures.update("[green]No failures to analyze[/]")
            return

        content.display = True
        no_failures.display = False
        content.mount(Static(
            f"[bold red]{report.failed} failed test(s)[/] out of {report.total_tests or report.failed}",
            classes="analysis-summary",
        ))

        for index, card in enumerate(report.failures, start=1):
            self._mount_failure_card(content, index, card)

    def _build_report_key(self, report: AnalysisReport) -> str:
        parts: list[str] = []
        for card in report.failures:
            crash = card.location.crash_point if card.location and card.location.crash_point else None
            pattern_id = card.matched_pattern.pattern.id if card.matched_pattern else "unknown"
            parts.append(
                f"{card.test}:{pattern_id}:{card.error_type}:{card.error_message}:"
                f"{crash.file if crash else ''}:{crash.line if crash else 0}"
            )
        return "|".join(parts)

    def _get_user_patterns_path(self) -> str | None:
        if not self._project_root:
            return None
        path = Path(self._project_root) / ".dev-pomogator" / "patterns.yaml"
        return str(path) if path.exists() else None

    def _mount_failure_card(self, content: VerticalScroll, index: int, card: FailureCard) -> None:
        pattern_id = card.matched_pattern.pattern.id if card.matched_pattern else "Unknown"
        content.mount(Static(
            f"[bold red]#{index} {card.test}[/]",
            classes="failure-title",
        ))
        content.mount(Static(
            f"Pattern: {pattern_id}",
            classes="failure-meta",
        ))

        if card.matched_pattern and card.matched_pattern.pattern.hint:
            content.mount(Static(
                f"Hint: {card.matched_pattern.pattern.hint}",
                classes="failure-hint",
            ))

        if card.duration:
            content.mount(Static(
                f"Duration: {card.duration}",
                classes="failure-meta",
            ))

        error_label = f"{card.error_type}: {card.error_message}" if card.error_type else card.error_message
        if error_label:
            content.mount(Static(
                f"Error: {error_label}",
                classes="failure-error",
            ))

        crash = card.location.crash_point if card.location and card.location.crash_point else None
        if crash:
            method = f" {crash.method}" if crash.method else ""
            content.mount(Static(
                f"Location: {crash.file}:{crash.line}{method}",
                classes="failure-meta",
            ))

        if card.suite_file and not crash:
            content.mount(Static(
                f"Suite: {card.suite_file}",
                classes="failure-meta",
            ))

        call_tree = card.location.render_tree() if card.location else ""
        if call_tree:
            content.mount(Static(
                f"Call chain:\n{call_tree}",
                classes="analysis-block",
                markup=False,
            ))

        if crash and crash.code_snippet:
            content.mount(Static(
                f"Code snippet:\n{crash.code_snippet}",
                classes="analysis-block",
                markup=False,
            ))

        if card.raw_stack and (not crash or not crash.code_snippet):
            content.mount(Static(
                f"Stack trace:\n{card.raw_stack}",
                classes="analysis-block",
                markup=False,
            ))
