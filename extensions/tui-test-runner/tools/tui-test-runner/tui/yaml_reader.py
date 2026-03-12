"""
YAML status file poller — reads canonical v2 YAML and emits Textual messages on change.
Framework-agnostic: consumes status file produced by test_runner_wrapper.ts.
"""

from pathlib import Path
from typing import Optional

import yaml
try:
    from textual.message import Message
except ModuleNotFoundError:
    class Message:  # type: ignore[override]
        def __init__(self, *args, **kwargs) -> None:
            pass

from .models import TestStatus


class StatusChanged(Message):
    """Emitted when YAML status file content changes."""

    def __init__(self, status: TestStatus) -> None:
        super().__init__()
        self.status = status


class YamlReader:
    """Polls a canonical v2 YAML status file and detects changes via mtime."""

    def __init__(self, status_file: str) -> None:
        self.status_file = Path(status_file)
        self._last_mtime: float = 0.0
        self._last_status: Optional[TestStatus] = None

    def check(self) -> Optional[TestStatus]:
        """Check for changes. Returns TestStatus if changed, None otherwise."""
        try:
            mtime = self.status_file.stat().st_mtime
            if mtime == self._last_mtime:
                return None

            content = self.status_file.read_text(encoding="utf-8")
            data = yaml.safe_load(content)
            if not isinstance(data, dict):
                self._last_status = None
                return None

            self._last_status = TestStatus.from_dict(data)
            self._last_mtime = mtime
            return self._last_status

        except (yaml.YAMLError, OSError, ValueError):
            self._last_status = None
            return None

    @property
    def current(self) -> Optional[TestStatus]:
        return self._last_status
