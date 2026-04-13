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
    """Polls a canonical v2 YAML status file and detects changes via mtime.

    Supports fallback directories: when the primary status file is missing,
    checks equivalent filenames in fallback dirs and picks the freshest.
    """

    def __init__(self, status_file: str, fallback_dirs: list[str] | None = None) -> None:
        self.status_file = Path(status_file)
        self._fallback_dirs: list[Path] = []

        # Auto-derive .docker-status/ fallback from .test-status/ primary path
        parent_name = self.status_file.parent.name
        if parent_name == ".test-status":
            docker_dir = self.status_file.parent.parent / ".docker-status"
            self._fallback_dirs.append(docker_dir)

        if fallback_dirs:
            for d in fallback_dirs:
                p = Path(d)
                if p not in self._fallback_dirs:
                    self._fallback_dirs.append(p)

        self._last_mtime: float = 0.0
        self._last_status: Optional[TestStatus] = None

    def _scan_dir_for_freshest(self, directory: Path) -> tuple[Optional[Path], float]:
        """Find the freshest status.*.yaml in a directory."""
        best: Optional[Path] = None
        best_mt: float = 0.0
        try:
            for f in directory.iterdir():
                if f.name.startswith("status.") and f.name.endswith(".yaml"):
                    try:
                        mt = f.stat().st_mtime
                        if mt > best_mt:
                            best_mt = mt
                            best = f
                    except OSError:
                        continue
        except OSError:
            pass
        return best, best_mt

    def check(self) -> Optional[TestStatus]:
        """Check for changes. Returns TestStatus if changed, None otherwise."""
        # Find freshest file across primary path + all fallback directories
        best_path: Optional[Path] = None
        best_mtime: float = 0.0

        # Check primary file
        try:
            mtime = self.status_file.stat().st_mtime
            if mtime > best_mtime:
                best_mtime = mtime
                best_path = self.status_file
        except OSError:
            pass

        # Check fallback dirs — scan ALL status.*.yaml files, not just same filename
        for fb_dir in self._fallback_dirs:
            fb_path, fb_mtime = self._scan_dir_for_freshest(fb_dir)
            if fb_path and fb_mtime > best_mtime:
                best_mtime = fb_mtime
                best_path = fb_path

        if best_path is None or best_mtime == self._last_mtime:
            return None

        try:
            content = best_path.read_text(encoding="utf-8")
            data = yaml.safe_load(content)
            if not isinstance(data, dict):
                self._last_status = None
                return None

            self._last_status = TestStatus.from_dict(data)
            self._last_mtime = best_mtime
            return self._last_status

        except (yaml.YAMLError, OSError, ValueError):
            self._last_status = None
            return None

    @property
    def current(self) -> Optional[TestStatus]:
        return self._last_status
