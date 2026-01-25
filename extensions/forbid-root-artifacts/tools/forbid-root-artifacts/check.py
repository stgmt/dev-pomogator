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
    
    # Find violations
    violations = find_violations(repo_root, allowed_files, patterns, allowed_directories)
    
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
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
