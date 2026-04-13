"""
Main Textual app for monitoring canonical YAML v2 test status.
"""

import importlib
from datetime import datetime
from pathlib import Path

from textual.app import App, ComposeResult
from textual.events import Resize
from textual.binding import Binding
from textual.css.query import NoMatches
from textual.reactive import reactive
from textual.widgets import Footer, Header, TabbedContent, TabPane

from .log_reader import LogReader
from .models import STATE_ICONS, TestState, TestStatus
from .widgets.analysis_tab import AnalysisTab
from .widgets.logs_tab import LogsTab
from .widgets.monitoring_tab import MonitoringTab
from .stop_handler import stop_tests
from .widgets import compact_bar as _compact_bar_module
from .widgets.compact_bar import CompactBar
from .widgets.tests_tab import TestsTab
from .yaml_reader import StatusChanged, YamlReader


class TestRunnerApp(App):
    """Rich 4-tab TUI for monitoring test execution."""

    CSS = """
    Screen {
        layout: vertical;
    }
    TabPane {
        padding: 0;
    }
    MonitoringTab, TestsTab, LogsTab, AnalysisTab {
        height: 1fr;
    }
    #status-bar {
        dock: bottom;
        height: 1;
        background: $surface;
        color: $text;
        padding: 0 1;
    }
    /* Compact mode: hide everything except compact bar */
    Screen.compact TabbedContent {
        display: none;
    }
    Screen.compact Header {
        display: none;
    }
    Screen.compact Footer {
        display: none;
    }
    Screen.compact CompactBar {
        display: block;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("m", "toggle_compact", "Compact", show=True),
        Binding("x", "stop_tests", "Stop", show=True),
        Binding("1", "switch_tab('tests')", "Tests", show=False),
        Binding("2", "switch_tab('logs')", "Logs", show=False),
        Binding("3", "switch_tab('monitoring')", "Monitoring", show=False),
        Binding("4", "switch_tab('analysis')", "Analysis", show=False),
        Binding("f", "focus_filter", "Filter", show=False),
        Binding("s", "screenshot", "Screenshot", show=False),
        Binding("question_mark", "show_help", "?", show=True),
    ]

    TITLE = "TUI Test Runner"

    status: reactive[TestStatus] = reactive(TestStatus, recompose=False)

    def __init__(
        self,
        status_file: str,
        log_file: str = "",
        framework: str = "auto",
        poll_interval: float = 0.5,
        auto_run: bool = False,
        fallback_dirs: list[str] | None = None,
    ) -> None:
        super().__init__()
        self._project_root = self._resolve_project_root(status_file)
        self._yaml_reader = YamlReader(status_file, fallback_dirs=fallback_dirs)
        self._log_file_override = log_file
        self._log_reader = LogReader(log_file) if log_file else None
        self._framework = framework
        self._poll_interval = poll_interval
        self._auto_run = auto_run
        self._screenshot_dir = Path("logs/screenshots")
        # Hot-reload: track compact_bar.py mtime for dev workflow
        self._compact_bar_path = Path(_compact_bar_module.__file__) if _compact_bar_module.__file__ else None
        self._compact_bar_mtime: float = 0
        if self._compact_bar_path:
            try:
                self._compact_bar_mtime = self._compact_bar_path.stat().st_mtime
            except OSError:
                pass

    def compose(self) -> ComposeResult:
        yield Header()
        yield CompactBar(id="compact-bar")
        with TabbedContent(initial="monitoring"):
            with TabPane("Tests", id="tests"):
                yield TestsTab()
            with TabPane("Logs", id="logs"):
                yield LogsTab()
            with TabPane("Monitoring", id="monitoring"):
                yield MonitoringTab()
            with TabPane("Analysis", id="analysis"):
                yield AnalysisTab(project_root=self._project_root)
        yield Footer()

    def on_mount(self) -> None:
        """Start polling loop. Start in compact mode by default."""
        self.set_interval(self._poll_interval, self._poll)
        self.screen.add_class("compact")
        if self._auto_run:
            self.notify("Auto-running tests...")

    def _poll(self) -> None:
        """Poll YAML status, log files, and hot-reload compact_bar.py if changed."""
        self._check_compact_bar_reload()
        new_status = self._yaml_reader.check()
        if new_status is not None:
            self.status = new_status
            self._sync_log_reader(new_status)
            self.post_message(StatusChanged(new_status))
            self._update_title()

        if self._log_reader:
            new_lines = self._log_reader.read_new_lines()
            if new_lines:
                logs_tab = self.query_one(LogsTab, LogsTab)
                logs_tab.append_lines(new_lines)

    def _check_compact_bar_reload(self) -> None:
        """Hot-reload compact_bar.py if file changed on disk.

        Works because CompactBar.render() calls render_compact() as a module-level
        name lookup. importlib.reload() updates the module dict in-place, so the
        existing widget instance picks up the new function without reinstantiation.
        """
        if not self._compact_bar_path:
            return
        try:
            current_mtime = self._compact_bar_path.stat().st_mtime
            if current_mtime != self._compact_bar_mtime:
                importlib.reload(_compact_bar_module)
                self._compact_bar_mtime = current_mtime
                try:
                    self.query_one(CompactBar).refresh()
                except NoMatches:
                    pass
        except (OSError, ImportError):
            pass  # fail-open: keep using current version

    def _update_title(self) -> None:
        s = self.status
        state_icon = STATE_ICONS.get(s.state, "")

        self.title = (
            f"TUI Test Runner {state_icon} "
            f"{s.passed}✓ {s.failed}✗ {s.skipped}⏭ ({s.percent}%) [{s.duration_display}]"
        )

    def _resolve_project_root(self, status_file: str) -> Path:
        status_path = Path(status_file).resolve()
        if len(status_path.parents) >= 3:
            return status_path.parents[2]
        return status_path.parent

    def _resolve_log_file(self, log_file: str) -> str:
        path = Path(log_file)
        if path.is_absolute():
            return str(path)
        return str((self._project_root / path).resolve())

    def _sync_log_reader(self, status: TestStatus) -> None:
        desired_log = self._log_file_override or status.log_file
        if not desired_log:
            self._log_reader = None
            return

        resolved_path = Path(self._resolve_log_file(desired_log))
        if self._log_reader and self._log_reader.log_file.resolve() == resolved_path:
            return

        self._log_reader = LogReader(str(resolved_path))

    def watch_status(self, new_status: TestStatus) -> None:
        """React to status changes — update all tabs + compact bar."""
        for tab_cls in (TestsTab, MonitoringTab, AnalysisTab):
            try:
                self.query_one(tab_cls).update_status(new_status)
            except NoMatches:
                pass
        # Refresh CompactBar when status changes
        try:
            self.query_one(CompactBar).refresh()
        except NoMatches:
            pass

    def action_switch_tab(self, tab_id: str) -> None:
        """Switch to tab by id (keyboard 1-4)."""
        tabbed = self.query_one(TabbedContent)
        tabbed.active = tab_id

    def action_focus_filter(self) -> None:
        """Focus the filter input in Tests tab."""
        try:
            tests_tab = self.query_one(TestsTab, TestsTab)
            tests_tab.focus_filter()
        except NoMatches:
            pass

    COMPACT_HEIGHT_THRESHOLD = 15

    def on_resize(self, event: Resize) -> None:
        """Auto-switch to compact mode when terminal is too small (@feature4)."""
        if event.size.height < self.COMPACT_HEIGHT_THRESHOLD and not self.screen.has_class("compact"):
            self.screen.add_class("compact")

    def action_stop_tests(self) -> None:
        """Stop running tests by sending termination signal (@feature3)."""
        pid = self.status.pid
        if pid <= 0:
            self.notify("No test process running", severity="warning")
            return
        if stop_tests(pid):
            self.notify(f"Stopped test process (PID {pid})")
        else:
            self.notify(f"Process {pid} already stopped", severity="information")

    def action_toggle_compact(self) -> None:
        """Toggle between compact and full mode (@feature2)."""
        if self.screen.has_class("compact"):
            self.screen.remove_class("compact")
        else:
            self.screen.add_class("compact")

    def action_screenshot(self) -> None:
        """Export screenshot as SVG file."""
        self._screenshot_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"tui-screenshot-{timestamp}.svg"
        filepath = self._screenshot_dir / filename
        self.export_screenshot(str(filepath))
        self.notify(f"Screenshot saved: {filepath}")

    HELP_TEXT = (
        "? — this help\n"
        "M — compact/full toggle\n"
        "X — stop tests\n"
        "Q — quit\n"
        "1-4 — switch tabs (full mode)\n"
        "F — focus filter\n"
        "S — screenshot\n"
        "─── Pane resize (Win Terminal) ───\n"
        "Alt+Shift+↑ — grow pane\n"
        "Alt+Shift+↓ — shrink pane\n"
        "Alt+Shift+← → — resize horizontal"
    )

    def action_show_help(self) -> None:
        """Show keybinding help overlay."""
        self.notify(self.HELP_TEXT, title="Keybindings", timeout=10)
