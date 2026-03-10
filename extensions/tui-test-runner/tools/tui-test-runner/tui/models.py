"""
Data models for TUI test runner — mirrors YAML v2 schema.
Framework-agnostic: reads universal YAML format produced by Node.js adapters.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class TestState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    COMPLETED = "completed"


class TestResultStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class TestResult:
    name: str
    status: TestResultStatus = TestResultStatus.PENDING
    duration_ms: Optional[int] = None
    error: Optional[str] = None
    stack: Optional[str] = None


@dataclass
class TestSuite:
    name: str
    file: str = ""
    status: str = "running"
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    total: int = 0
    duration_ms: int = 0
    tests: list[TestResult] = field(default_factory=list)


@dataclass
class Phase:
    name: str
    status: str = "pending"
    started_at: str = ""
    duration_ms: int = 0


@dataclass
class TestStatus:
    """Mirrors YAML v2 schema. Also handles v1 (suites/phases empty)."""

    version: int = 1
    session_id: str = ""
    started_at: str = ""
    updated_at: str = ""
    state: TestState = TestState.IDLE
    framework: str = "unknown"
    total: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    running: int = 0
    percent: int = 0
    duration_ms: int = 0
    duration_str: str = ""
    error_message: str = ""
    log_file: str = ""
    suites: list[TestSuite] = field(default_factory=list)
    phases: list[Phase] = field(default_factory=list)

    @property
    def is_v2(self) -> bool:
        return self.version >= 2 and len(self.suites) > 0

    @property
    def duration_display(self) -> str:
        if self.duration_str:
            return self.duration_str
        secs = self.duration_ms / 1000
        if secs < 60:
            return f"{secs:.1f}s"
        mins = secs / 60
        return f"{mins:.1f}m"

    @staticmethod
    def from_dict(data: dict) -> "TestStatus":
        status = TestStatus(
            version=data.get("version", 1),
            session_id=str(data.get("session_id", "")),
            started_at=str(data.get("started_at", "")),
            updated_at=str(data.get("updated_at", "")),
            state=TestState(data.get("state", "idle")),
            framework=str(data.get("framework", "unknown")),
            total=int(data.get("total", 0)),
            passed=int(data.get("passed", 0)),
            failed=int(data.get("failed", 0)),
            skipped=int(data.get("skipped", 0)),
            running=int(data.get("running", 0)),
            percent=int(data.get("percent", 0)),
            duration_ms=int(data.get("duration_ms", 0)) if isinstance(data.get("duration_ms"), (int, float)) else 0,
            duration_str=str(data.get("duration", "")) if isinstance(data.get("duration"), str) else "",
            error_message=str(data.get("error_message", "")),
            log_file=str(data.get("log_file", "")),
        )

        for s in data.get("suites", []):
            suite = TestSuite(
                name=s.get("name", ""),
                file=s.get("file", ""),
                status=s.get("status", "running"),
                passed=int(s.get("passed", 0)),
                failed=int(s.get("failed", 0)),
                skipped=int(s.get("skipped", 0)),
                total=int(s.get("total", 0)),
                duration_ms=int(s.get("duration_ms", 0)),
            )
            for t in s.get("tests", []):
                suite.tests.append(TestResult(
                    name=t.get("name", ""),
                    status=TestResultStatus(t.get("status", "pending")),
                    duration_ms=t.get("duration_ms"),
                    error=t.get("error"),
                    stack=t.get("stack"),
                ))
            status.suites.append(suite)

        for p in data.get("phases", []):
            status.phases.append(Phase(
                name=p.get("name", ""),
                status=p.get("status", "pending"),
                started_at=p.get("started_at", ""),
                duration_ms=int(p.get("duration_ms", 0)),
            ))

        return status
