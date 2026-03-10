"""
Tests Tab — hierarchical test tree with status icons, sorting, filtering.
Built from YAML v2 suites[].tests[] data.
"""

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import Static, Tree, Input
from textual.widget import Widget

from ..models import TestStatus, TestSuite, TestResult, TestResultStatus


STATUS_ICONS = {
    TestResultStatus.PASSED: "✅",
    TestResultStatus.FAILED: "❌",
    TestResultStatus.SKIPPED: "⏭️",
    TestResultStatus.RUNNING: "🔄",
    TestResultStatus.PENDING: "⏳",
}

# Sort order: failed first for visibility
STATUS_ORDER = {
    TestResultStatus.FAILED: 0,
    TestResultStatus.RUNNING: 1,
    TestResultStatus.PENDING: 2,
    TestResultStatus.PASSED: 3,
    TestResultStatus.SKIPPED: 4,
}


class TestsTab(Widget):
    """Test tree with suite/test hierarchy and filtering."""

    DEFAULT_CSS = """
    TestsTab {
        layout: vertical;
    }
    #filter-input {
        dock: top;
        margin-bottom: 1;
    }
    #test-tree {
        height: 1fr;
    }
    #no-data {
        padding: 2 4;
        color: $text-muted;
    }
    """

    def __init__(self) -> None:
        super().__init__()
        self._filter_text = ""
        self._has_data = False
        self._last_data_key: str = ""

    def compose(self) -> ComposeResult:
        yield Input(placeholder="Filter tests (name or status)...", id="filter-input")
        yield Tree("Tests", id="test-tree")
        yield Static(
            "[dim]No suite details available (v1 protocol)\n"
            "Use enhanced wrapper with v2 YAML for test tree.[/]",
            id="no-data",
        )

    def on_mount(self) -> None:
        self.query_one("#test-tree", Tree).show_root = False

    def on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id == "filter-input":
            self._filter_text = event.value.lower()
            if self._has_data:
                self._rebuild_tree_filtered()

    def focus_filter(self) -> None:
        self.query_one("#filter-input", Input).focus()

    def update_status(self, status: TestStatus) -> None:
        """Rebuild test tree from YAML v2 status. Skips if data unchanged."""
        if not status.is_v2:
            self.query_one("#test-tree", Tree).display = False
            self.query_one("#no-data", Static).display = True
            self._has_data = False
            return

        # Skip rebuild if data unchanged
        key = "|".join(
            f"{s.name}:{s.passed}/{s.failed}/{s.total}:"
            + ",".join(f"{t.name}={t.status.value}" for t in s.tests)
            for s in status.suites
        )
        if key == self._last_data_key:
            return
        self._last_data_key = key

        self.query_one("#test-tree", Tree).display = True
        self.query_one("#no-data", Static).display = False
        self._has_data = True
        self._status = status
        self._rebuild_tree_filtered()

    def _rebuild_tree_filtered(self) -> None:
        tree = self.query_one("#test-tree", Tree)
        tree.clear()

        for suite in self._status.suites:
            # Sort tests: failed first
            sorted_tests = sorted(
                suite.tests,
                key=lambda t: STATUS_ORDER.get(t.status, 99),
            )

            # Filter
            if self._filter_text:
                sorted_tests = [
                    t for t in sorted_tests
                    if self._filter_text in t.name.lower()
                    or self._filter_text in t.status.value.lower()
                ]
                if not sorted_tests:
                    continue

            # Suite node
            suite_icon = "❌" if suite.failed > 0 else "✅" if suite.status == "passed" else "🔄"
            suite_label = f"{suite_icon} {suite.name} ({suite.passed}/{suite.total})"
            suite_node = tree.root.add(suite_label, expand=True)

            # Test nodes
            for test in sorted_tests:
                icon = STATUS_ICONS.get(test.status, "?")
                dur = f" ({test.duration_ms}ms)" if test.duration_ms else ""
                err = f" — {test.error[:60]}..." if test.error and len(test.error) > 60 else (f" — {test.error}" if test.error else "")
                suite_node.add_leaf(f"{icon} {test.name}{dur}{err}")
