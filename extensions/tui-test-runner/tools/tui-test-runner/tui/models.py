"""
Data models for the canonical status v2 schema.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


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


REQUIRED_TOP_LEVEL_FIELDS = (
    "version",
    "session_id",
    "pid",
    "started_at",
    "updated_at",
    "state",
    "framework",
    "total",
    "passed",
    "failed",
    "skipped",
    "running",
    "percent",
    "duration_ms",
    "error_message",
    "log_file",
    "suites",
    "phases",
)


def _require_mapping(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("status payload must be a mapping")
    return data


def _require_str(data: dict[str, Any], field: str) -> str:
    value = data.get(field)
    if not isinstance(value, str):
        raise ValueError(f"missing or invalid '{field}'")
    return value


def _require_int(data: dict[str, Any], field: str) -> int:
    value = data.get(field)
    if not isinstance(value, (int, float)):
        raise ValueError(f"missing or invalid '{field}'")
    return int(value)


def _require_list(data: dict[str, Any], field: str) -> list[Any]:
    value = data.get(field)
    if not isinstance(value, list):
        raise ValueError(f"missing or invalid '{field}'")
    return value


@dataclass
class TestStatus:
    version: int = 2
    session_id: str = ""
    pid: int = 0
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
        return self.version == 2

    @property
    def duration_display(self) -> str:
        secs = self.duration_ms / 1000
        if secs < 60:
            return f"{secs:.1f}s"
        mins = secs / 60
        return f"{mins:.1f}m"

    @staticmethod
    def from_dict(data: dict[str, Any]) -> "TestStatus":
        data = _require_mapping(data)
        missing = [field for field in REQUIRED_TOP_LEVEL_FIELDS if field not in data]
        if missing:
            raise ValueError(f"missing canonical v2 fields: {', '.join(missing)}")

        version = _require_int(data, "version")
        if version != 2:
            raise ValueError(f"unsupported status version: {version}")

        pid = _require_int(data, "pid")
        if pid <= 0:
            raise ValueError("status pid must be greater than zero")

        status = TestStatus(
            version=version,
            session_id=_require_str(data, "session_id"),
            pid=pid,
            started_at=_require_str(data, "started_at"),
            updated_at=_require_str(data, "updated_at"),
            state=TestState(_require_str(data, "state")),
            framework=_require_str(data, "framework"),
            total=_require_int(data, "total"),
            passed=_require_int(data, "passed"),
            failed=_require_int(data, "failed"),
            skipped=_require_int(data, "skipped"),
            running=_require_int(data, "running"),
            percent=_require_int(data, "percent"),
            duration_ms=_require_int(data, "duration_ms"),
            error_message=_require_str(data, "error_message"),
            log_file=_require_str(data, "log_file"),
        )

        for suite_data in _require_list(data, "suites"):
            suite_data = _require_mapping(suite_data)
            suite = TestSuite(
                name=_require_str(suite_data, "name"),
                file=str(suite_data.get("file", "")),
                status=_require_str(suite_data, "status"),
                passed=_require_int(suite_data, "passed"),
                failed=_require_int(suite_data, "failed"),
                skipped=_require_int(suite_data, "skipped"),
                total=_require_int(suite_data, "total"),
                duration_ms=_require_int(suite_data, "duration_ms"),
            )

            for test_data in _require_list(suite_data, "tests"):
                test_data = _require_mapping(test_data)
                duration_value = test_data.get("duration_ms")
                duration_ms = int(duration_value) if isinstance(duration_value, (int, float)) else None
                suite.tests.append(TestResult(
                    name=_require_str(test_data, "name"),
                    status=TestResultStatus(_require_str(test_data, "status")),
                    duration_ms=duration_ms,
                    error=str(test_data["error"]) if "error" in test_data and test_data["error"] is not None else None,
                    stack=str(test_data["stack"]) if "stack" in test_data and test_data["stack"] is not None else None,
                ))

            status.suites.append(suite)

        for phase_data in _require_list(data, "phases"):
            phase_data = _require_mapping(phase_data)
            status.phases.append(Phase(
                name=_require_str(phase_data, "name"),
                status=_require_str(phase_data, "status"),
                started_at=str(phase_data.get("started_at", "")),
                duration_ms=_require_int(phase_data, "duration_ms"),
            ))

        return status
