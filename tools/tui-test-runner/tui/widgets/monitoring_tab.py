"""
Monitoring tab with canonical YAML v2 session summary and phases.
"""

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widget import Widget
from textual.widgets import ProgressBar, Static

from ..models import TestState, TestStatus


STATUS_ICONS = {
    TestState.IDLE: "[dim]⏸ Idle[/]",
    TestState.BUILDING: "[bold yellow]🔨 Building[/]",
    TestState.RUNNING: "[bold blue]🔄 Running[/]",
    TestState.PASSED: "[bold green]✅ Passed[/]",
    TestState.FAILED: "[bold red]❌ Failed[/]",
    TestState.ERROR: "[bold yellow]⚠️ Error[/]",
    TestState.COMPLETED: "[bold green]✅ Completed[/]",
}

PHASE_ICONS = {
    "pending": "⏳",
    "running": "🔄",
    "completed": "✅",
    "failed": "❌",
}


class MonitoringTab(Widget):
    """Real-time monitoring dashboard."""

    DEFAULT_CSS = """
    MonitoringTab {
        layout: vertical;
        padding: 1 2;
    }
    .section-title {
        text-style: bold;
        margin-bottom: 1;
    }
    .stat-row {
        layout: horizontal;
        height: 1;
    }
    .stat-label {
        width: 16;
        color: $text-muted;
    }
    .stat-value {
        min-width: 20;
    }
    #progress-section {
        margin-top: 1;
        height: auto;
    }
    #phases-section {
        margin-top: 1;
        height: auto;
    }
    #error-section {
        margin-top: 1;
        color: $error;
    }
    """

    def compose(self) -> ComposeResult:
        yield Static("[b]Monitoring[/]", classes="section-title")

        with Vertical(id="status-section"):
            with Horizontal(classes="stat-row"):
                yield Static("State:", classes="stat-label")
                yield Static("[dim]Waiting...[/]", id="state-value", classes="stat-value")
            with Horizontal(classes="stat-row"):
                yield Static("Framework:", classes="stat-label")
                yield Static("", id="framework-value", classes="stat-value")
            with Horizontal(classes="stat-row"):
                yield Static("Duration:", classes="stat-label")
                yield Static("", id="duration-value", classes="stat-value")

        with Vertical(id="progress-section"):
            yield ProgressBar(total=100, show_eta=False, id="progress-bar")
            with Horizontal(classes="stat-row"):
                yield Static("Total:", classes="stat-label")
                yield Static("0", id="total-value", classes="stat-value")
            with Horizontal(classes="stat-row"):
                yield Static("Passed:", classes="stat-label")
                yield Static("[green]0[/]", id="passed-value", classes="stat-value")
            with Horizontal(classes="stat-row"):
                yield Static("Failed:", classes="stat-label")
                yield Static("[red]0[/]", id="failed-value", classes="stat-value")
            with Horizontal(classes="stat-row"):
                yield Static("Skipped:", classes="stat-label")
                yield Static("[yellow]0[/]", id="skipped-value", classes="stat-value")

        with Vertical(id="phases-section"):
            yield Static("[b]Phases[/]", classes="section-title")
            yield Static("", id="phases-content")

        yield Static("", id="error-section")

    def update_status(self, status: TestStatus) -> None:
        """Update all dashboard elements from status."""
        self.query_one("#state-value", Static).update(
            STATUS_ICONS.get(status.state, str(status.state))
        )
        self.query_one("#framework-value", Static).update(status.framework)
        self.query_one("#duration-value", Static).update(status.duration_display)

        bar = self.query_one("#progress-bar", ProgressBar)
        bar.update(progress=status.percent)

        self.query_one("#total-value", Static).update(str(status.total))
        self.query_one("#passed-value", Static).update(f"[green]{status.passed}[/]")
        self.query_one("#failed-value", Static).update(f"[red]{status.failed}[/]")
        self.query_one("#skipped-value", Static).update(f"[yellow]{status.skipped}[/]")

        if status.phases:
            lines = []
            for phase in status.phases:
                icon = PHASE_ICONS.get(phase.status, "?")
                dur = f" ({phase.duration_ms / 1000:.1f}s)" if phase.duration_ms else ""
                lines.append(f"  {icon} {phase.name}: {phase.status}{dur}")
            self.query_one("#phases-content", Static).update("\n".join(lines))
        else:
            self.query_one("#phases-content", Static).update("  [dim]No phase data yet[/]")

        if status.error_message:
            self.query_one("#error-section", Static).update(
                f"[bold red]Error:[/] {status.error_message}"
            )
        else:
            self.query_one("#error-section", Static).update("")
