"""
TUI Test Runner entry point.
Singleton instance management, CLI args, launch Textual app.
"""

import argparse
import os
import sys
import signal
from pathlib import Path


LOCK_FILE = Path.home() / ".tui-test-runner.lock"


def is_already_running() -> bool:
    """Check if another instance is running via lock file."""
    if not LOCK_FILE.exists():
        return False
    try:
        pid = int(LOCK_FILE.read_text().strip())
        # Check if process alive
        if sys.platform == "win32":
            import ctypes
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.OpenProcess(0x0400, False, pid)
            if handle:
                kernel32.CloseHandle(handle)
                return True
            return False
        else:
            os.kill(pid, 0)
            return True
    except (ValueError, OSError, ProcessLookupError):
        # Stale lock file
        LOCK_FILE.unlink(missing_ok=True)
        return False


def acquire_lock() -> None:
    LOCK_FILE.write_text(str(os.getpid()))


def release_lock() -> None:
    LOCK_FILE.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="TUI Test Runner")
    parser.add_argument("--status-file", required=True, help="Path to YAML status file")
    parser.add_argument("--log-file", default="", help="Path to test log file")
    parser.add_argument("--framework", default="auto", help="Test framework name")
    parser.add_argument("--poll-interval", type=float, default=0.5, help="Polling interval in seconds")
    parser.add_argument("--no-single-instance", action="store_true", help="Allow multiple instances")
    args = parser.parse_args()

    if not args.no_single_instance and is_already_running():
        print("TUI Test Runner is already running. Use --no-single-instance to override.", file=sys.stderr)
        sys.exit(0)

    acquire_lock()

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
        )
        app.run()
    finally:
        release_lock()


if __name__ == "__main__":
    main()
