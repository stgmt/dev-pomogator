"""
Framework-agnostic stack trace and failure parsing.
Ported from zoho analyst/parsers.py, adapted from .NET-specific to multi-framework.
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class StackFrame:
    """Single stack frame."""
    file: str
    line: int
    method: str = ""
    classification: str = "other"  # scenario, step_definition, fixture, hook, other


@dataclass
class FailureInfo:
    """Raw failure data extracted from test output."""
    test: str
    duration: str = ""
    error_type: str = ""
    error_message: str = ""
    stack_trace: str = ""


# Regex patterns for various stack trace formats
STACK_PATTERNS = [
    # JavaScript/TypeScript: "at functionName (file.ts:123:45)"
    re.compile(r"at\s+(?:(.+?)\s+)?\((.+?):(\d+):\d+\)"),
    # JavaScript/TypeScript: "at file.ts:123:45"
    re.compile(r"at\s+(.+?):(\d+):\d+"),
    # Python: '  File "file.py", line 123, in method'
    re.compile(r'File "(.+?)", line (\d+)(?:, in (.+))?'),
    # C#/.NET: "at Namespace.Class.Method() in file.cs:line 123"
    re.compile(r"at\s+(.+?)\s+in\s+(.+?):line\s+(\d+)"),
    # Rust: "thread ... panicked at 'message', file.rs:123:45"
    re.compile(r"panicked at .+, (.+?):(\d+):\d+"),
    # Go: "\tfile.go:123"
    re.compile(r"\t(.+?):(\d+)"),
]

# Framework internals to filter out
FRAMEWORK_FILTERS = {
    "node_modules", "internal/", "node:", "timers.js",
    "System.", "Microsoft.", "NUnit.", "xUnit.", "Reqnroll.",
    "pytest", "_pytest", "pluggy", "unittest",
    "runtime/", "testing/", "std/",
}


def parse_stack_trace(stack_text: str) -> List[StackFrame]:
    """Parse stack trace into frames. Framework-agnostic."""
    frames: List[StackFrame] = []
    seen = set()

    for line in stack_text.splitlines():
        line = line.strip()
        if not line:
            continue

        for pattern in STACK_PATTERNS:
            match = pattern.search(line)
            if match:
                groups = match.groups()
                if len(groups) == 3:
                    # (method, file, line) or (file, line, method)
                    if groups[0] and "/" in groups[0] or "\\" in groups[0]:
                        file, line_num, method = groups[0], int(groups[1]), groups[2] or ""
                    else:
                        method, file, line_num = groups[0] or "", groups[1], int(groups[2])
                elif len(groups) == 2:
                    file, line_num = groups[0], int(groups[1])
                    method = ""
                else:
                    continue

                # Skip framework internals
                if any(f in str(file) for f in FRAMEWORK_FILTERS):
                    continue

                key = f"{file}:{line_num}"
                if key in seen:
                    continue
                seen.add(key)

                classification = _classify_frame(str(file))
                frames.append(StackFrame(
                    file=str(file),
                    line=int(line_num),
                    method=str(method),
                    classification=classification,
                ))
                break

        if len(frames) >= 10:  # Limit for token efficiency
            break

    return frames


def _classify_frame(file_path: str) -> str:
    """Classify stack frame by file path."""
    lower = file_path.lower()
    if ".feature" in lower or "scenario" in lower:
        return "scenario"
    if "step" in lower and ("definition" in lower or "steps" in lower):
        return "step_definition"
    if "fixture" in lower or "conftest" in lower or "setup" in lower:
        return "fixture"
    if "hook" in lower or "before" in lower or "after" in lower:
        return "hook"
    return "other"


def parse_failures_from_output(output: str) -> List[FailureInfo]:
    """Extract failure info from test runner output. Framework-agnostic."""
    failures: List[FailureInfo] = []

    # Pattern: vitest/jest FAIL block
    # "FAIL  path/to/test.ts > describe > test name"
    fail_pattern = re.compile(r"FAIL\s+(.+?)\s*$", re.MULTILINE)

    # Pattern: error message after assertion
    # "AssertionError: expected X to be Y"
    error_pattern = re.compile(r"((?:Assertion|Type|Reference|Syntax|Runtime)Error[:\s].+?)$", re.MULTILINE)

    # Simple approach: find FAIL blocks and extract error info
    lines = output.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        fail_match = fail_pattern.search(line)
        if fail_match:
            test_name = fail_match.group(1).strip()
            # Collect error context (next ~20 lines)
            context_lines = lines[i + 1 : i + 25]
            context = "\n".join(context_lines)

            error_type = ""
            error_message = ""
            error_match = error_pattern.search(context)
            if error_match:
                err = error_match.group(1)
                if ":" in err:
                    error_type, error_message = err.split(":", 1)
                    error_type = error_type.strip()
                    error_message = error_message.strip()
                else:
                    error_message = err.strip()

            failures.append(FailureInfo(
                test=test_name,
                error_type=error_type,
                error_message=error_message,
                stack_trace=context,
            ))
        i += 1

    return failures
