"""
Cross-platform test process termination by PID.

@feature3 FR-3
"""

import os
import sys
import subprocess


def is_process_alive(pid: int) -> bool:
    """Check if process with given PID is still running."""
    if pid <= 0:
        return False
    try:
        if sys.platform == "win32":
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True, text=True, timeout=5,
            )
            return str(pid) in result.stdout
        else:
            os.kill(pid, 0)  # signal 0 = check existence
            return True
    except (ProcessLookupError, PermissionError, subprocess.SubprocessError):
        return False


def stop_tests(pid: int) -> bool:
    """Send termination signal to test process. Returns True if signal sent."""
    if pid <= 0 or not is_process_alive(pid):
        return False
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True, timeout=10,
            )
        else:
            import signal
            os.kill(pid, signal.SIGTERM)
        return True
    except (ProcessLookupError, PermissionError, subprocess.SubprocessError):
        return False
