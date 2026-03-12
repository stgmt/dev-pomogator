"""
Pattern matching for test failure analysis.
Loads patterns from YAML, matches by regex first then keyword ALL logic.
Ported from zoho analyst/patterns.py, adapted for framework-agnostic use.
"""

import re
import sys
import yaml
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional


@dataclass
class Pattern:
    """Single error pattern definition."""
    id: str
    match: str  # regex pattern
    hint: str
    category: str = "unknown"
    keywords: List[str] = field(default_factory=list)
    _compiled: Optional[re.Pattern] = field(default=None, repr=False)

    def compile(self) -> bool:
        """Compile regex. Returns False if invalid."""
        if not self.match:
            self._compiled = None
            return True
        try:
            self._compiled = re.compile(self.match, re.IGNORECASE)
            return True
        except re.error:
            print(f"Warning: Invalid regex in pattern '{self.id}': {self.match}", file=sys.stderr)
            self._compiled = None
            return False


@dataclass
class MatchResult:
    """Result of pattern matching."""
    pattern: Pattern
    matched_by: str  # "regex" or "keywords"


class PatternLoader:
    """Load patterns from YAML files."""

    def __init__(self, builtin_path: Optional[Path] = None, user_path: Optional[Path] = None):
        self._builtin_path = builtin_path or (Path(__file__).parent / "patterns.yaml")
        self._user_path = user_path

    def load(self) -> List[Pattern]:
        """Load and merge patterns. User patterns take priority."""
        builtin = self._load_file(self._builtin_path)
        if self._user_path and self._user_path.exists():
            user = self._load_file(self._user_path)
            # User patterns override built-in by id
            user_ids = {p.id for p in user}
            return user + [p for p in builtin if p.id not in user_ids]
        return builtin

    def _load_file(self, path: Path) -> List[Pattern]:
        """Load patterns from a single YAML file."""
        if not path.exists():
            return []
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or "patterns" not in data:
                return []
            patterns = []
            for entry in data["patterns"]:
                p = Pattern(
                    id=entry.get("id", "unknown"),
                    match=entry.get("match", ""),
                    hint=entry.get("hint", ""),
                    category=entry.get("category", "unknown"),
                    keywords=entry.get("keywords", []),
                )
                if p.compile():  # Skip patterns with invalid regex
                    patterns.append(p)
            return patterns
        except Exception:
            return []


class PatternMatcher:
    """Match test failures against patterns.

    Algorithm: regex first → keyword ALL → first wins.
    """

    def __init__(self, patterns: List[Pattern]):
        self._patterns = patterns

    def match(self, error_message: str, error_type: str = "") -> Optional[MatchResult]:
        """Match error against patterns. Returns first match or None."""
        text = f"{error_type} {error_message}".strip()
        text_lower = text.lower()

        for pattern in self._patterns:
            regex_matched = False
            if pattern._compiled is not None:
                if not pattern._compiled.search(text):
                    continue
                regex_matched = True

            if pattern.keywords:
                if not all(kw.lower() in text_lower for kw in pattern.keywords):
                    continue
                return MatchResult(
                    pattern=pattern,
                    matched_by="regex+keywords" if regex_matched else "keywords",
                )

            if regex_matched:
                return MatchResult(pattern=pattern, matched_by="regex")

        return None
