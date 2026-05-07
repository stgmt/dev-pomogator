"""
Log file tailer — streams new lines from the test log file.
Does NOT load entire file into memory (NFR-P4: handles 100MB+ files).
"""

import os
from pathlib import Path
from typing import Optional


class LogReader:
    """Tails a log file, returning only new lines since last read."""

    def __init__(self, log_file: str) -> None:
        self.log_file = Path(log_file)
        self._offset: int = 0

    def read_new_lines(self) -> list[str]:
        """Read lines appended since last call. Returns empty list if no changes."""
        if not self.log_file.exists():
            return []

        try:
            file_size = self.log_file.stat().st_size
            if file_size <= self._offset:
                if file_size < self._offset:
                    # File was truncated/rotated — reset
                    self._offset = 0
                return []

            with open(self.log_file, "r", encoding="utf-8", errors="replace") as f:
                f.seek(self._offset)
                data = f.read()
                self._offset = f.tell()

            lines = data.splitlines()
            return lines

        except OSError:
            return []

    def reset(self) -> None:
        self._offset = 0
