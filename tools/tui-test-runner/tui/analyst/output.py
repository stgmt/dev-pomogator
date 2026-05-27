"""
Failure report generation — structured failure cards with context.
Ported from zoho analyst/output.py, simplified for framework-agnostic use.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from ..models import TestResultStatus, TestStatus
from .patterns import PatternLoader, PatternMatcher, MatchResult
from .parsers import parse_stack_trace, parse_failures_from_output, StackFrame
from .code_reader import CodeSnippetReader


@dataclass
class CrashPoint:
    """Location of the error."""
    file: str
    line: int
    method: str = ""
    code_snippet: Optional[str] = None


@dataclass
class Location:
    """Error location with call chain."""
    crash_point: Optional[CrashPoint] = None
    call_chain: List[StackFrame] = field(default_factory=list)

    def render_tree(self) -> str:
        """Render call chain as ASCII tree."""
        if not self.call_chain:
            return ""
        lines = []
        for i, frame in enumerate(self.call_chain):
            prefix = "└── " if i == len(self.call_chain) - 1 else "├── "
            icon = {"scenario": "🎬", "step_definition": "📝", "fixture": "🔧", "hook": "🪝"}.get(
                frame.classification, "📄"
            )
            lines.append(f"{prefix}{icon} {frame.file}:{frame.line} {frame.method}")
        return "\n".join(lines)


@dataclass
class FailureCard:
    """Self-contained failure report."""
    test: str
    duration: str = ""
    error_type: str = ""
    error_message: str = ""
    raw_stack: str = ""
    suite: str = ""
    suite_file: str = ""
    location: Optional[Location] = None
    matched_pattern: Optional[MatchResult] = None


@dataclass
class AnalysisReport:
    """Complete analysis report."""
    failures: List[FailureCard] = field(default_factory=list)
    total_tests: int = 0
    passed: int = 0
    failed: int = 0


@dataclass
class FailedTestRecord:
    """Flattened failed test from YAML v2 status."""
    test: str
    duration_ms: Optional[int] = None
    error: str = ""
    stack: str = ""
    suite: str = ""
    suite_file: str = ""


ERROR_TYPE_RE = re.compile(r"^([A-Za-z_][\w.]*?(?:Error|Exception)):\s*(.*)$")
GENERIC_ERROR_RE = re.compile(r"^([A-Za-z_][\w.]*)\s*:\s*(.*)$")


def _load_matcher(
    patterns_path: Optional[str],
    user_patterns_path: Optional[str],
) -> PatternMatcher:
    builtin = Path(patterns_path) if patterns_path else None
    user = Path(user_patterns_path) if user_patterns_path else None
    loader = PatternLoader(builtin_path=builtin, user_path=user)
    return PatternMatcher(loader.load())


def _normalize_error(error_text: str) -> tuple[str, str]:
    text = error_text.strip()
    if not text:
        return "", ""

    for pattern in (ERROR_TYPE_RE, GENERIC_ERROR_RE):
        match = pattern.match(text)
        if match:
            error_type = match.group(1).split(".")[-1].strip()
            error_message = match.group(2).strip()
            return error_type, error_message or text

    return "", text


def _format_duration(duration_ms: Optional[int]) -> str:
    if duration_ms is None:
        return ""
    return f"{duration_ms}ms"


def _build_location(stack_trace: str, reader: CodeSnippetReader) -> Optional[Location]:
    frames = parse_stack_trace(stack_trace)
    if not frames:
        return None

    top = frames[0]
    snippet = reader.get_snippet(top.file, top.line)
    crash = CrashPoint(
        file=top.file,
        line=top.line,
        method=top.method,
        code_snippet=snippet,
    )
    return Location(crash_point=crash, call_chain=frames)


def _build_failure_card(
    test: str,
    duration: str,
    error_type: str,
    error_message: str,
    stack_trace: str,
    reader: CodeSnippetReader,
    matcher: PatternMatcher,
    suite: str = "",
    suite_file: str = "",
) -> FailureCard:
    location = _build_location(stack_trace, reader) if stack_trace else None
    match_result = matcher.match(error_message, error_type) if (error_type or error_message) else None

    return FailureCard(
        test=test,
        duration=duration,
        error_type=error_type,
        error_message=error_message,
        raw_stack=stack_trace,
        suite=suite,
        suite_file=suite_file,
        location=location,
        matched_pattern=match_result,
    )


def _sort_cards(cards: List[FailureCard]) -> List[FailureCard]:
    return sorted(
        cards,
        key=lambda card: (
            1 if card.matched_pattern is None else 0,
            1 if card.location is None else 0,
            card.matched_pattern.pattern.id if card.matched_pattern else "zzzz",
            card.test.lower(),
        ),
    )


def _iter_failed_tests(status: TestStatus) -> List[FailedTestRecord]:
    if not status.suites:
        return []

    failures: List[FailedTestRecord] = []
    for suite in status.suites:
        for test in suite.tests:
            if test.status != TestResultStatus.FAILED:
                continue
            failures.append(FailedTestRecord(
                test=test.name,
                duration_ms=test.duration_ms,
                error=test.error or "",
                stack=test.stack or "",
                suite=suite.name,
                suite_file=suite.file,
            ))
    return failures


def analyze(
    test_output: str,
    project_root: Optional[str] = None,
    patterns_path: Optional[str] = None,
    user_patterns_path: Optional[str] = None,
) -> AnalysisReport:
    """Analyze test output and produce failure cards.

    Args:
        test_output: Raw test runner output text
        project_root: Project root for code snippet extraction
        patterns_path: Path to built-in patterns.yaml (default: bundled)
        user_patterns_path: Path to user override patterns.yaml
    """
    matcher = _load_matcher(patterns_path, user_patterns_path)
    reader = CodeSnippetReader(project_root)

    raw_failures = parse_failures_from_output(test_output)
    cards: List[FailureCard] = []
    for raw in raw_failures:
        cards.append(_build_failure_card(
            test=raw.test,
            duration=raw.duration,
            error_type=raw.error_type,
            error_message=raw.error_message,
            stack_trace=raw.stack_trace,
            reader=reader,
            matcher=matcher,
        ))

    return AnalysisReport(failures=_sort_cards(cards), failed=len(cards))


def analyze_status(
    status: TestStatus,
    project_root: Optional[str] = None,
    patterns_path: Optional[str] = None,
    user_patterns_path: Optional[str] = None,
) -> AnalysisReport:
    """Analyze failed tests already present in YAML v2 status."""
    matcher = _load_matcher(patterns_path, user_patterns_path)
    reader = CodeSnippetReader(project_root)

    cards: List[FailureCard] = []
    for failed_test in _iter_failed_tests(status):
        error_type, error_message = _normalize_error(failed_test.error)
        cards.append(_build_failure_card(
            test=failed_test.test,
            duration=_format_duration(failed_test.duration_ms),
            error_type=error_type,
            error_message=error_message or failed_test.error,
            stack_trace=failed_test.stack,
            reader=reader,
            matcher=matcher,
            suite=failed_test.suite,
            suite_file=failed_test.suite_file,
        ))

    return AnalysisReport(
        failures=_sort_cards(cards),
        total_tests=status.total,
        passed=status.passed,
        failed=len(cards),
    )
