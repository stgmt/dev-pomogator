"""
TUI Test Runner entry point.
Singleton instance management, CLI args, launch Textual app.
"""

import argparse
import os
import re
import sys
import signal
from pathlib import Path


LOCK_FILE = ".tui-test-runner.lock"


def get_lock_file(status_file: str) -> Path:
    """Get per-session lock file path from status file name."""
    match = re.search(r'status\.(.+)\.yaml$', os.path.basename(status_file))
    if match:
        session = match.group(1)
        return Path.home() / f".tui-test-runner.{session}.lock"
    return Path.home() / LOCK_FILE


def is_already_running(lock_file: Path) -> bool:
    """Check if another instance is running via lock file."""
    if not lock_file.exists():
        return False
    try:
        pid = int(lock_file.read_text().strip())
        # Check if process alive
        if sys.platform == "win32":
            import ctypes
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.OpenProcess(0x0400, False, pid)
            if handle:
                kernel32.CloseHandle(handle)
                return True
        else:
            os.kill(pid, 0)
            return True
    except (ValueError, OSError, ProcessLookupError):
        pass
    # Stale or unreadable lock file — clean up
    lock_file.unlink(missing_ok=True)
    return False


def acquire_lock(lock_file: Path) -> None:
    lock_file.write_text(str(os.getpid()))


def release_lock(lock_file: Path) -> None:
    lock_file.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="TUI Test Runner")
    parser.add_argument("--status-file", required=True, help="Path to YAML status file")
    parser.add_argument("--log-file", default="", help="Path to test log file")
    parser.add_argument("--framework", default="auto", help="Test framework name")
    parser.add_argument("--poll-interval", type=float, default=0.5, help="Polling interval in seconds")
    parser.add_argument("--run", action="store_true", help="Auto-run tests on startup")
    parser.add_argument("--filter", default="", help="Initial test name filter")
    parser.add_argument("--no-single-instance", action="store_true", help="Allow multiple instances")
    args = parser.parse_args()

    lock_file = get_lock_file(args.status_file)

    if not args.no_single_instance and is_already_running(lock_file):
        print("TUI Test Runner is already running for this session. Use --no-single-instance to override.", file=sys.stderr)
        sys.exit(0)

    acquire_lock(lock_file)

    # Force color support (override NO_COLOR from IDEs)
    os.environ.pop("NO_COLOR", None)
    if "TERM" not in os.environ:
        os.environ["TERM"] = "xterm-256color"

    try:
        from .app import TestRunnerApp

        app = TestRunnerApp(
            status_file=args.status_file,
            log_file=args.log_file,
            framework=args.framework,
            poll_interval=args.poll_interval,
            auto_run=args.run,
        )
        app.run()
    finally:
        release_lock(lock_file)


if __name__ == "__main__":
    main()
