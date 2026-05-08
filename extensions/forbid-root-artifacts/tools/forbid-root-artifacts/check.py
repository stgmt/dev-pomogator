#!/usr/bin/env python3
"""
forbid-root-artifacts: Pre-commit hook to control files in repository root.

Usage:
    python check.py [--config PATH]

Exit codes:
    0 - OK, no violations
    1 - Violations found
    2 - Configuration error
"""
from __future__ import annotations

import fnmatch
import subprocess
import sys
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml is required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(2)


@dataclass
class Config:
    """Configuration for root artifacts check."""
    mode: str = "extend"  # "extend" or "replace"
    allow: list[str] = field(default_factory=list)
    deny: list[str] = field(default_factory=list)
    allowed_directories: Optional[list[str]] = None
    ignore_patterns: list[str] = field(default_factory=list)


@dataclass
class DefaultConfig:
    """Default whitelist configuration."""
    files: list[str] = field(default_factory=list)
    patterns: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Violation:
    """A file that violates the whitelist."""
    filename: str
    reason: str


def safe_text(value: str) -> str:
    """
    Safely encode text for console output on Windows.
    """
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    try:
        return value.encode(encoding, errors="backslashreplace").decode(encoding)
    except Exception:
        return value.encode("utf-8", errors="backslashreplace").decode("utf-8")


def get_repo_root() -> Path:
    """Get repository root via git."""
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        capture_output=True,
        text=True,
    )
    root = result.stdout.strip()
    if not root:
        raise RuntimeError("git rev-parse --show-toplevel returned empty path")
    return Path(root)


def get_script_dir() -> Path:
    """Get directory containing this script."""
    return Path(__file__).parent.resolve()


def load_default_whitelist(script_dir: Path) -> DefaultConfig:
    """Load default whitelist from script directory."""
    default_path = script_dir / "default-whitelist.yaml"
    if not default_path.exists():
        return DefaultConfig()
    
    with open(default_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    
    return DefaultConfig(
        files=[f.lower() for f in data.get("files", [])],
        patterns=data.get("patterns", []),
    )


def load_user_config(repo_root: Path) -> Optional[Config]:
    """Load user configuration from repository root."""
    config_path = repo_root / ".root-artifacts.yaml"
    if not config_path.exists():
        return None
    
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except yaml.YAMLError as e:
        print(f"ERROR: Invalid YAML in .root-artifacts.yaml: {e}", file=sys.stderr)
        sys.exit(2)
    
    return Config(
        mode=data.get("mode", "extend"),
        allow=data.get("allow", []) or [],
        deny=data.get("deny", []) or [],
        allowed_directories=data.get("allowed_directories"),
        ignore_patterns=data.get("ignore_patterns", []) or [],
    )


def build_whitelist(defaults: DefaultConfig, user_config: Optional[Config]) -> tuple[set[str], list[str]]:
    """
    Build final whitelist from defaults and user config.
    
    Returns:
        Tuple of (allowed_files_set, patterns_list)
    """
    if user_config is None:
        return set(defaults.files), defaults.patterns
    
    if user_config.mode == "replace":
        # Replace mode: only user-specified files
        allowed = {f.lower() for f in user_config.allow}
        patterns = user_config.ignore_patterns
    else:
        # Extend mode: defaults + user additions - user denials
        allowed = set(defaults.files)
        allowed.update(f.lower() for f in user_config.allow)
        allowed -= {f.lower() for f in user_config.deny}
        patterns = defaults.patterns + user_config.ignore_patterns
    
    return allowed, patterns


def matches_pattern(filename: str, patterns: list[str]) -> bool:
    """Check if filename matches any glob pattern."""
    for pattern in patterns:
        if fnmatch.fnmatch(filename.lower(), pattern.lower()):
            return True
    return False


# =============================================================================
# Classifier (loaded from _classifier.py — yaml-driven)
# =============================================================================
#
# Patterns now live in:
#   extensions/forbid-root-artifacts/tools/forbid-root-artifacts/default-whitelist.yaml
#       → trash_patterns_default
#       → config_patterns_default
#   .root-artifacts.yaml (user, in target repo)
#       → trash_patterns
#       → config_patterns
#
# See `.specs/forbid-root-artifacts/FR.md` (FR-2, FR-4) for design rationale.

try:
    from _classifier import (
        ClassifierConfig,
        classify_file,
        find_stale_allow_entries,
        is_testsettings,
        load_classifier_config,
    )
except ImportError as _classifier_import_err:
    # Graceful degradation for broken upgrade scenarios (UC-7, NFR-Reliability-1).
    # Embedded fallback is intentionally minimal — clear intent that this is a
    # safety net, not a drift target. Full pattern lists live in
    # `default-whitelist.yaml` (yaml-driven, see _classifier.py).
    print(
        "WARNING: classifier module missing — using fallback "
        f"({_classifier_import_err})",
        file=sys.stderr,
    )

    _FALLBACK_TRASH_PATTERNS = [
        "*.tmp", "*.bak", "*.log", "*.swp", "*.suo", "*.user",
    ]

    @dataclass
    class ClassifierConfig:  # type: ignore[no-redef]
        mode: str = "config"
        trash_patterns: list = field(default_factory=lambda: list(_FALLBACK_TRASH_PATTERNS))
        config_patterns: list = field(default_factory=list)
        use_default_trash: bool = True
        auto_prune_enabled: bool = True
        llm_cli: str = "claude"
        llm_timeout_seconds: int = 30
        llm_cache_ttl_seconds: int = 86400

    def load_classifier_config(repo_root, plugin_dir):  # type: ignore[no-redef]
        return ClassifierConfig()

    def classify_file(filename: str, config=None, cache_path=None) -> str:  # type: ignore[no-redef]
        name_lower = filename.lower()
        for pattern in _FALLBACK_TRASH_PATTERNS:
            if fnmatch.fnmatch(name_lower, pattern.lower()):
                return "trash"
        return "unknown"

    def find_stale_allow_entries(repo_root, allow_list):  # type: ignore[no-redef]
        stale = []
        for entry in allow_list:
            if not isinstance(entry, str):
                continue
            if any(t in entry for t in ("/", "\\", "..", "\0")) or not entry:
                print(f"WARNING: skipping non-basename allow entry: {entry}", file=sys.stderr)
                continue
            if not (repo_root / entry).exists():
                stale.append(entry)
        stale.sort(key=str.lower)
        return stale

    def is_testsettings(name: str) -> bool:  # type: ignore[no-redef]
        return fnmatch.fnmatch(name.lower(), "*.testsettings")


def find_violations(
    repo_root: Path,
    allowed_files: set[str],
    patterns: list[str],
    allowed_directories: Optional[list[str]] = None,
) -> list[Violation]:
    """Find files in repository root that violate the whitelist."""
    violations: list[Violation] = []
    
    # Directories that are always allowed (system directories)
    always_allowed_dirs = {".git", ".svn", ".hg"}
    
    for entry in repo_root.iterdir():
        name = entry.name
        name_lower = name.lower()
        
        # Check directories
        if entry.is_dir():
            # Always allow system directories
            if name_lower in always_allowed_dirs:
                continue
            
            if allowed_directories is not None:
                if name_lower not in {d.lower() for d in allowed_directories}:
                    violations.append(Violation(
                        filename=name + "/",
                        reason="directory not in allowed_directories",
                    ))
            continue
        
        # Check files
        if name_lower in allowed_files:
            continue
        
        if matches_pattern(name, patterns):
            continue
        
        violations.append(Violation(
            filename=name,
            reason="file not in whitelist",
        ))
    
    violations.sort(key=lambda v: v.filename.lower())
    return violations


_DEFAULT_YAML_HEADER = (
    "# Configuration for forbid-root-artifacts pre-commit hook\n"
    "# Documentation: https://github.com/stgmt/dev-pomogator/tree/main/extensions/forbid-root-artifacts\n\n"
)


def _extract_existing_header(text: str) -> Optional[str]:
    """Extract the leading comment block from a yaml file (C2).

    Returns the verbatim sequence of lines from start of file up to (but not
    including) the first non-comment, non-blank line — including any trailing
    blank line. Returns None if the file has no header (first non-blank line
    is yaml content, e.g. `mode: extend`).

    This preserves user-customised headers (license blocks, copyright,
    "owned by team X" notes) byte-for-byte across auto-prune rewrites.
    """
    lines = text.splitlines(keepends=True)
    header_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            header_lines.append(line)
        else:
            break
    if not header_lines:
        return None
    # Trim purely-blank lines from the very top to keep header tight,
    # but preserve any internal blank-line separators.
    while header_lines and not header_lines[0].strip():
        header_lines.pop(0)
    if not header_lines:
        return None
    # Ensure the header ends with a single blank line separator before yaml body
    if header_lines and header_lines[-1].strip():
        header_lines.append("\n")
    return "".join(header_lines)


@contextmanager
def _file_lock(lock_path: Path):
    """Cross-platform file lock for concurrent-process protection (H3).

    Holds an exclusive lock on a sibling `.lock` file for the duration of
    the with-block. Lock is released when the context exits, even on
    exception. On Windows uses `msvcrt.locking`; on POSIX uses `fcntl.flock`.

    Best-effort: if locking is unavailable on the platform (extremely rare),
    falls back to no-op so the operation still proceeds.
    """
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fd = None
    try:
        fd = open(lock_path, "a+")
        try:
            if sys.platform == "win32":
                import msvcrt  # noqa: PLC0415
                # Lock 1 byte at offset 0 — Windows requires non-zero length
                msvcrt.locking(fd.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl  # noqa: PLC0415
                fcntl.flock(fd.fileno(), fcntl.LOCK_EX)
        except OSError:
            # Best-effort: continue without lock if syscall unsupported
            pass
        yield
    finally:
        if fd is not None:
            try:
                if sys.platform == "win32":
                    try:
                        import msvcrt  # noqa: PLC0415
                        fd.seek(0)
                        msvcrt.locking(fd.fileno(), msvcrt.LK_UNLCK, 1)
                    except OSError:
                        pass
                # POSIX: closing fd releases flock automatically
                fd.close()
            except OSError:
                pass


def _save_yaml_preserving_keys(yaml_path: Path, mutated_key: str, mutated_value) -> None:
    """
    Atomically rewrite yaml file, mutating just one top-level key.

    Holds a file lock during read-modify-write to prevent concurrent
    pre-commit processes from clobbering each other's changes (H3).
    Preserves the existing header comment block byte-for-byte (C2 — user
    custom license/copyright notes are kept). Inline comments inside yaml
    sections are still lost (PyYAML limitation; documented in README).

    Uses temp file + fsync + os.replace for the atomic-write step
    (NFR-Security-3).
    """
    import os as _os

    lock_path = yaml_path.with_name(yaml_path.name + ".lock")
    with _file_lock(lock_path):
        existing_text = ""
        if yaml_path.exists():
            with open(yaml_path, "r", encoding="utf-8") as f:
                existing_text = f.read()

        # Re-parse INSIDE the lock so we mutate the freshest state on disk
        try:
            raw = yaml.safe_load(existing_text) or {}
        except yaml.YAMLError:
            raw = {}
        if not isinstance(raw, dict):
            raw = {}

        # Mutate (or remove if empty list provided)
        if isinstance(mutated_value, list) and not mutated_value:
            raw.pop(mutated_key, None)
        else:
            raw[mutated_key] = mutated_value

        # C2: preserve existing user header byte-for-byte; fall back to default
        # only if file has no leading comment block (e.g. brand-new yaml).
        header = _extract_existing_header(existing_text)
        if header is None:
            header = _DEFAULT_YAML_HEADER
        body = yaml.dump(raw, default_flow_style=False, allow_unicode=True, sort_keys=False)

        # Atomic write inside the lock
        tmp_path = yaml_path.with_name(yaml_path.name + ".tmp")
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                f.write(header)
                f.write(body)
                f.flush()
                _os.fsync(f.fileno())
            _os.replace(tmp_path, yaml_path)
        finally:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass


def main() -> int:
    """Main entry point."""
    try:
        repo_root = get_repo_root()
    except Exception as ex:
        print(f"ERROR: Failed to determine repository root: {ex}", file=sys.stderr)
        return 2
    
    script_dir = get_script_dir()

    # Load configurations
    defaults = load_default_whitelist(script_dir)
    user_config = load_user_config(repo_root)

    # Build whitelist
    allowed_files, patterns = build_whitelist(defaults, user_config)
    allowed_directories = user_config.allowed_directories if user_config else None

    # Load classifier config (yaml-driven; FR-2/FR-4)
    classifier_cfg = load_classifier_config(repo_root, script_dir)

    # C1: Check both signals (violations + auto-prune) BEFORE deciding on the
    # exit path, so we can emit a combined report instead of split-screen UX
    # (auto-prune fires → user re-stages → SECOND run shows violations).
    violations = find_violations(repo_root, allowed_files, patterns, allowed_directories)

    # Auto-prune stale allow entries (FR-1, AC-1, AC-2)
    pruned_entries: list[str] = []
    prune_failed = False
    if classifier_cfg.auto_prune_enabled and user_config is not None and user_config.allow:
        stale = find_stale_allow_entries(repo_root, list(user_config.allow))
        if stale:
            stale_set = {s.lower() for s in stale}
            user_config.allow = [a for a in user_config.allow if a.lower() not in stale_set]
            try:
                _save_yaml_preserving_keys(repo_root / ".root-artifacts.yaml", "allow", user_config.allow)
            except OSError as ex:
                prune_failed = True
                print(
                    f"WARNING: failed to save auto-pruned yaml ({ex}); skipping prune",
                    file=sys.stderr,
                )
            else:
                pruned_entries = stale

    # Combined report: report both auto-prune AND violations in same exit-1.
    # Order: violations first (most actionable), then auto-prune notice.
    if not violations and not pruned_entries:
        return 0

    if pruned_entries and not violations:
        # Pure auto-prune case (no violations)
        stale_list = ", ".join(pruned_entries)
        print(
            f"forbid-root-artifacts auto-pruned {len(pruned_entries)} stale entries "
            f"from .root-artifacts.yaml: {stale_list}",
            file=sys.stderr,
        )
        print(
            "Run: git add .root-artifacts.yaml && git commit "
            "(yaml changes will be included in commit)",
            file=sys.stderr,
        )
        return 1

    # If we get here: violations are present (with or without prune). Fall
    # through to existing violation-report path; emit auto-prune notice
    # afterward so user sees BOTH in a single run.
    if not violations:
        return 0
    
    # Report violations
    print("ERROR: Files found in repository root that are NOT in whitelist. Commit blocked.")
    print()
    print("Violations:")
    for v in violations:
        print(f"  ❌ {safe_text(v.filename)}")
    print()
    print("Allowed files:")
    for f in sorted(allowed_files)[:10]:
        print(f"  ✅ {f}")
    if len(allowed_files) > 10:
        print(f"  ... and {len(allowed_files) - 10} more")
    print()
    print("What to do:")
    print("  - Remove or move files to subdirectories (src/, docs/, tools/, etc.)")
    print("  - Or add files to .root-artifacts.yaml in repository root:")
    print()
    print("    mode: extend")
    print("    allow:")
    for v in violations[:3]:
        print(f"      - {v.filename}")
    print()
    
    # AI Agent instructions
    print("=" * 60)
    print("## AI AGENT INSTRUCTIONS")
    print("=" * 60)
    print()
    
    # M1: classify each violation once, not 3× (was three list comprehensions)
    cache_path = repo_root / ".dev-pomogator" / ".classifier-cache.json"
    classified: dict[str, list] = {"trash": [], "config": [], "unknown": []}
    for v in violations:
        bucket = classify_file(v.filename, classifier_cfg, cache_path)
        classified.setdefault(bucket, []).append(v)
    trash_files = classified["trash"]
    config_files = classified["config"]
    unknown_files = classified["unknown"]
    
    if trash_files:
        print("### AUTO-DELETE (obvious trash):")
        for v in trash_files:
            print(f"  - {safe_text(v.filename)}")
        print()
        print("Action: Delete these files without asking user.")
        print("Command: Remove-Item <file> (Windows) or rm <file> (Unix)")
        print()
    
    if config_files:
        print("### ASK USER (config/important files):")
        for v in config_files:
            print(f"  - {safe_text(v.filename)}")
        print()
        print("Action: Ask user whether to:")
        print("  1. Add to whitelist (.root-artifacts.yaml)")
        print("  2. Move to subdirectory (src/, docs/, tools/, etc.)")
        print()
    
    if unknown_files:
        print("### ANALYZE (unknown files):")
        for v in unknown_files:
            print(f"  - {safe_text(v.filename)}")
        print()
        print("Action: Read file content, determine if trash or important, then decide.")
        print()
    
    if not trash_files and not config_files and not unknown_files:
        print("No files to process.")
        print()
    
    print("To add files to whitelist, edit .root-artifacts.yaml:")
    print("  mode: extend")
    print("  allow:")
    for v in config_files[:3] if config_files else violations[:3]:
        print(f"    - {v.filename}")
    print()
    print("After fixing, retry: git add . && git commit")
    print()

    # C1: emit auto-prune notice on stderr in the SAME run as the violation
    # report, so the user sees both signals together (not split-screen).
    if pruned_entries:
        stale_list = ", ".join(pruned_entries)
        print(
            f"forbid-root-artifacts also auto-pruned {len(pruned_entries)} stale entries "
            f"from .root-artifacts.yaml: {stale_list}",
            file=sys.stderr,
        )
        print(
            "Run: git add .root-artifacts.yaml together with your fix.",
            file=sys.stderr,
        )

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
