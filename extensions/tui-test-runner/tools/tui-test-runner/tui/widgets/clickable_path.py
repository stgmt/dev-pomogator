"""Clickable Path Widget — cross-platform clickable file/directory paths in log output.

Ported from zoho tui_test_explorer/ui/widgets/clickable_path.py (224 LOC).
Added: regex detection of paths within log lines, multiple paths per line.
"""

import platform
import re
import subprocess
from pathlib import Path
from typing import NamedTuple

from textual.widgets import Static
from textual.message import Message


# Regex for file paths with optional :line[:col]
# Windows: D:\path\file.ts:42  or  C:\dir\sub dir\file.py:10:5
# Unix: /path/to/file.ts:42  or  /home/user/src/app.py
_WIN_PATH = r'[A-Za-z]:\\(?:[\w\-. ]+\\)*[\w\-. ]+\.\w+'
_UNIX_PATH = r'/(?:[\w\-. ]+/)+[\w\-. ]+\.\w+'
_LINE_COL = r'(?::\d+(?::\d+)?)?'

PATH_RE = re.compile(
    rf'(?P<path>(?:{_WIN_PATH}|{_UNIX_PATH}){_LINE_COL})'
)


class PathSegment(NamedTuple):
    """A segment of a log line — either plain text or a detected path."""
    text: str
    is_path: bool
    file_path: str  # resolved path without :line:col, empty if not a path
    line: int  # 0 if no line number


def parse_paths(text: str) -> list[PathSegment]:
    """Split a log line into plain text and path segments."""
    segments: list[PathSegment] = []
    last_end = 0

    for m in PATH_RE.finditer(text):
        start, end = m.span()
        if start > last_end:
            segments.append(PathSegment(text[last_end:start], False, '', 0))

        raw = m.group('path')
        # Extract file path and line number
        parts = raw.rsplit(':', 2)
        if len(parts) >= 2 and parts[-1].isdigit():
            if len(parts) >= 3 and parts[-2].isdigit():
                file_path = ':'.join(parts[:-2])
                line = int(parts[-2])
            else:
                file_path = ':'.join(parts[:-1])
                line = int(parts[-1])
        else:
            file_path = raw
            line = 0

        segments.append(PathSegment(raw, True, file_path, line))
        last_end = end

    if last_end < len(text):
        segments.append(PathSegment(text[last_end:], False, '', 0))

    return segments


class ClickablePath(Static):
    """A clickable path that opens in file explorer on click.

    Cross-platform support:
    - Windows: explorer.exe /select,
    - macOS: open -R
    - Linux: xdg-open
    """

    DEFAULT_CSS = """
    ClickablePath {
        height: 1;
    }

    ClickablePath:hover {
        background: $surface-lighten-1;
    }
    """

    class PathClicked(Message):
        """Emitted when path is clicked."""
        def __init__(self, path: Path, line: int = 0) -> None:
            super().__init__()
            self.path = path
            self.line = line

    def __init__(
        self,
        path: str | Path,
        *,
        label: str = '',
        line: int = 0,
        truncate: bool = True,
        truncate_length: int = 50,
        id: str | None = None,
        classes: str | None = None,
    ) -> None:
        super().__init__(id=id, classes=classes)
        self._path = Path(path) if isinstance(path, str) else path
        self._label = label
        self._line = line
        self._truncate = truncate
        self._truncate_length = truncate_length

    @property
    def path(self) -> Path:
        return self._path

    @path.setter
    def path(self, value: str | Path) -> None:
        self._path = Path(value) if isinstance(value, str) else value
        self._update_display()

    def on_mount(self) -> None:
        self._update_display()

    def _update_display(self) -> None:
        path_str = str(self._path)
        if self._line:
            path_str = f'{path_str}:{self._line}'

        if self._truncate and len(path_str) > self._truncate_length:
            display_path = '...' + path_str[-(self._truncate_length - 3):]
        else:
            display_path = path_str

        if self._label:
            self.update(f'[dim]{self._label}[/dim] [link]{display_path}[/link]')
        else:
            self.update(f'[link]{display_path}[/link]')

        self.tooltip = str(self._path)

    def on_click(self) -> None:
        self._flash_click()
        self.post_message(self.PathClicked(self._path, self._line))
        self._open_in_explorer()

    def _flash_click(self) -> None:
        from textual.color import Color

        original_bg = self.styles.background
        flash_color = Color(255, 193, 7)  # Amber flash
        self.styles.background = flash_color
        self.styles.animate(
            'background',
            value=original_bg if original_bg else Color(0, 0, 0, 0),
            duration=0.3,
            easing='out_cubic',
        )

    def _open_in_explorer(self) -> None:
        path = self._path
        try:
            system = platform.system()
            if system == 'Windows':
                if path.is_file():
                    subprocess.Popen(['explorer', '/select,', str(path)])
                else:
                    subprocess.Popen(['explorer', str(path if path.exists() else path.parent)])
            elif system == 'Darwin':
                if path.is_file():
                    subprocess.Popen(['open', '-R', str(path)])
                else:
                    subprocess.Popen(['open', str(path if path.exists() else path.parent)])
            else:
                target = path.parent if path.is_file() else path
                subprocess.Popen(['xdg-open', str(target)])
        except Exception:
            # Silently ignore — missing file should not crash TUI (FR-2, PLUGIN013_07)
            pass
