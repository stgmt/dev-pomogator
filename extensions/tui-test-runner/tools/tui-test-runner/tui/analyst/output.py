"""
Failure report generation — structured failure cards with context.
Ported from zoho analyst/output.py, simplified for framework-agnostic use.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from .patterns import PatternLoader, PatternMatcher, MatchResult
from .parsers import parse_stack_trace, parse_failures_from_output, StackFrame, FailureInfo
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
    location: Optional[Location] = None
    matched_pattern: Optional[MatchResult] = None


@dataclass
class AnalysisReport:
    """Complete analysis report."""
    failures: List[FailureCard] = field(default_factory=list)
    total_tests: int = 0
    passed: int = 0
    failed: int = 0


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
    # Load patterns
    builtin = Path(patterns_path) if patterns_path else None
    user = Path(user_patterns_path) if user_patterns_path else None
    loader = PatternLoader(builtin_path=builtin, user_path=user)
    patterns = loader.load()
    matcher = PatternMatcher(patterns)

    # Code reader
    reader = CodeSnippetReader(project_root)

    # Parse failures
    raw_failures = parse_failures_from_output(test_output)

    cards: List[FailureCard] = []
    for raw in raw_failures:
        # Parse stack trace
        frames = parse_stack_trace(raw.stack_trace)

        # Build location
        location = None
        if frames:
            top = frames[0]
            snippet = reader.get_snippet(top.file, top.line)
            crash = CrashPoint(
                file=top.file,
                line=top.line,
                method=top.method,
                code_snippet=snippet,
            )
            location = Location(crash_point=crash, call_chain=frames)

        # Match pattern
        match_result = matcher.match(raw.error_message, raw.error_type)

        cards.append(FailureCard(
            test=raw.test,
            duration=raw.duration,
            error_type=raw.error_type,
            error_message=raw.error_message,
            location=location,
            matched_pattern=match_result,
        ))

    return AnalysisReport(failures=cards, failed=len(cards))
