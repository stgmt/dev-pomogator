"""Shared test helpers for TUI Pilot tests."""

from pathlib import Path

import yaml

from tui.models import TestState


def write_test_yaml(
    status_file: str,
    *,
    state: TestState = TestState.RUNNING,
    framework: str = "vitest",
    passed: int = 0,
    failed: int = 0,
    skipped: int = 0,
    running: int = 1,
    total: int = 10,
    percent: int = 0,
    duration_ms: int = 5000,
    pid: int = 99999,
    error_message: str = "",
):
    """Write a canonical v2 YAML status file for testing."""
    data = {
        "version": 2,
        "session_id": "test1234test1234",
        "pid": pid,
        "started_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:05.000Z",
        "state": state.value if isinstance(state, TestState) else state,
        "framework": framework,
        "total": total,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "running": running,
        "percent": percent,
        "duration_ms": duration_ms,
        "error_message": error_message,
        "log_file": "",
        "suites": [],
        "phases": [],
    }
    p = Path(status_file)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(yaml.dump(data, default_flow_style=False), encoding="utf-8")
