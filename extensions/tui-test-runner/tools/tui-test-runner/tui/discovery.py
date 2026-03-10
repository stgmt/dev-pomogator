"""
Framework-agnostic test discovery.
Runs framework-specific list commands and parses output into test names.
Ported from zoho tui_test_explorer.adapter.discovery, adapted for multi-framework.
"""

import subprocess
import shutil
from dataclasses import dataclass
from typing import List, Optional


DISCOVERY_TIMEOUT = 30  # seconds


@dataclass
class DiscoveryResult:
    """Result of test discovery."""
    tests: List[str]
    framework: str
    timed_out: bool = False
    error: Optional[str] = None


# Framework → (command, parser)
DISCOVERY_COMMANDS = {
    "vitest": {
        "cmd": ["npx", "vitest", "--list"],
        "parse": lambda out: [l.strip() for l in out.splitlines() if l.strip() and not l.startswith(" ")],
    },
    "jest": {
        "cmd": ["npx", "jest", "--listTests"],
        "parse": lambda out: [l.strip() for l in out.splitlines() if l.strip()],
    },
    "pytest": {
        "cmd": ["python", "-m", "pytest", "--collect-only", "-q"],
        "parse": lambda out: [l.strip() for l in out.splitlines() if "::" in l],
    },
    "dotnet": {
        "cmd": ["dotnet", "test", "--list-tests", "-v=q"],
        "parse": lambda out: [l.strip() for l in out.splitlines() if l.strip() and not l.startswith(" ")],
    },
    "rust": {
        "cmd": ["cargo", "test", "--", "--list"],
        "parse": lambda out: [l.split(":")[0].strip() for l in out.splitlines() if ": test" in l],
    },
    "go": {
        "cmd": ["go", "test", "-list", ".*", "./..."],
        "parse": lambda out: [l.strip() for l in out.splitlines() if l.strip() and not l.startswith("ok")],
    },
}


def detect_framework() -> Optional[str]:
    """Detect test framework from project files."""
    import os
    checks = [
        ("vitest", ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"]),
        ("jest", ["jest.config.ts", "jest.config.js", "jest.config.cjs"]),
        ("pytest", ["pytest.ini", "conftest.py", "pyproject.toml"]),
        ("dotnet", []),  # check *.csproj
        ("rust", ["Cargo.toml"]),
        ("go", ["go.mod"]),
    ]
    for framework, files in checks:
        for f in files:
            if os.path.exists(f):
                return framework
    # Check for *.csproj
    import glob
    if glob.glob("*.csproj") or glob.glob("*.sln"):
        return "dotnet"
    return None


def discover_tests(framework: str) -> DiscoveryResult:
    """Run test discovery for the given framework.

    Returns DiscoveryResult with test names, or timed_out=True on timeout.
    """
    config = DISCOVERY_COMMANDS.get(framework)
    if not config:
        return DiscoveryResult(tests=[], framework=framework, error=f"Unknown framework: {framework}")

    cmd = config["cmd"]
    # Check if command exists
    if not shutil.which(cmd[0]):
        return DiscoveryResult(tests=[], framework=framework, error=f"Command not found: {cmd[0]}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=DISCOVERY_TIMEOUT,
        )
        tests = config["parse"](result.stdout)
        return DiscoveryResult(tests=tests, framework=framework)
    except subprocess.TimeoutExpired:
        return DiscoveryResult(tests=[], framework=framework, timed_out=True)
    except Exception as e:
        return DiscoveryResult(tests=[], framework=framework, error=str(e))
