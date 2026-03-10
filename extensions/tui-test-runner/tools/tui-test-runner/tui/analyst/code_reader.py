"""
Code snippet extraction from source files.
Finds files in project tree, reads ±N lines around error location.
Ported from zoho analyst/code_reader.py, adapted for multi-language projects.
"""

from pathlib import Path
from typing import Dict, List, Optional


# Directories to skip during file search
SKIP_DIRS = {
    "node_modules", "dist", ".next", "build", "out",
    "__pycache__", ".pytest_cache", ".mypy_cache",
    "bin", "obj", "target", ".git", ".svn",
    "coverage", ".nyc_output", ".venv", "venv",
}


class CodeSnippetReader:
    """Read code snippets from source files with caching."""

    def __init__(self, project_root: Optional[str] = None):
        self._root = Path(project_root) if project_root else Path.cwd()
        self._file_cache: Dict[str, Optional[Path]] = {}
        self._content_cache: Dict[Path, List[str]] = {}

    def get_snippet(self, file_name: str, line: int, context: int = 3) -> Optional[str]:
        """Get code snippet around the given line.

        Args:
            file_name: File name or relative path
            line: Error line number (1-based)
            context: Number of context lines before/after

        Returns:
            Formatted snippet with line numbers and arrow marker, or None.
        """
        file_path = self._find_file(file_name)
        if not file_path:
            return None

        lines = self._read_file(file_path)
        if not lines or line < 1 or line > len(lines):
            return None

        start = max(0, line - context - 1)
        end = min(len(lines), line + context)
        return self._format_snippet(lines, start, end, line)

    def _find_file(self, file_name: str) -> Optional[Path]:
        """Find file in project tree. Caches results."""
        if file_name in self._file_cache:
            return self._file_cache[file_name]

        # Try exact path first
        exact = self._root / file_name
        if exact.is_file():
            self._file_cache[file_name] = exact
            return exact

        # Search by basename
        basename = Path(file_name).name
        for path in self._root.rglob(basename):
            if any(skip in path.parts for skip in SKIP_DIRS):
                continue
            if path.is_file():
                self._file_cache[file_name] = path
                return path

        self._file_cache[file_name] = None
        return None

    def _read_file(self, file_path: Path) -> List[str]:
        """Read file contents. Caches results."""
        if file_path in self._content_cache:
            return self._content_cache[file_path]

        for encoding in ("utf-8", "utf-16", "cp1252", "latin-1"):
            try:
                lines = file_path.read_text(encoding=encoding).splitlines()
                self._content_cache[file_path] = lines
                return lines
            except (UnicodeDecodeError, UnicodeError):
                continue

        self._content_cache[file_path] = []
        return []

    def _format_snippet(self, lines: List[str], start: int, end: int, error_line: int) -> str:
        """Format code snippet with line numbers and arrow marker."""
        result = []
        max_line_num = len(str(end))
        for i in range(start, end):
            line_num = i + 1
            prefix = "→ " if line_num == error_line else "  "
            padded_num = str(line_num).rjust(max_line_num)
            result.append(f"{prefix}{padded_num}│ {lines[i]}")
        return "\n".join(result)
