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


# =============================================================================
# AI Agent Classification
# =============================================================================

# Files that are DEFINITELY trash - delete without asking
TRASH_PATTERNS = [
    # Temp/backup files
    "*.tmp", "*.temp", "*.bak", "*.swp", "*.swo", "*.orig",
    "*.backup", "*~", "*.old",
    # Logs
    "*.log", "*.logs", "npm-debug.log*", "yarn-debug.log*",
    "yarn-error.log*", "lerna-debug.log*", "debug.log",
    # Cache/compiled
    "*.cache", "*.pyc", "*.pyo", "*.pyd", "__pycache__",
    "*.class", "*.o", "*.obj", "*.exe", "*.dll", "*.so",
    # OS junk
    ".DS_Store", "Thumbs.db", "desktop.ini", "*.lnk",
    # IDE junk (not in .gitignore)
    "*.sublime-workspace", ".idea", "*.iml",
    # Random extensions that are never config
    "*.cal", "*.bkp", "*.gho", "*.iso",
    # Build artifacts
    "*.min.js", "*.min.css", "*.map",
    # Test artifacts
    "coverage", ".nyc_output", "junit.xml",
    # Misc junk JSON (not package.json, tsconfig.json, etc.)
    "*.json.bak", "*.json.tmp", "*.json.old",
]

# Files that MAY be important - ask user
CONFIG_PATTERNS = [
    # Configs (known)
    "package.json", "tsconfig.json", "jsconfig.json",
    "*.config.js", "*.config.ts", "*.config.mjs",
    "*.yaml", "*.yml", "*.toml",
    "Makefile", "Dockerfile*", "docker-compose*",
    "*.md", "LICENSE*", "CHANGELOG*",
    "*.env", "*.env.*",
    # Scripts
    "*.sh", "*.ps1", "*.bat", "*.cmd",
]


def classify_file(filename: str) -> str:
    """
    Classify file for AI agent instructions.
    
    Returns:
        'trash' - obvious junk, delete without asking
        'config' - likely important, ask user
        'unknown' - analyze content to decide
    """
    name_lower = filename.lower()
    
    for pattern in TRASH_PATTERNS:
        if fnmatch.fnmatch(name_lower, pattern.lower()):
            return "trash"
    
    for pattern in CONFIG_PATTERNS:
        if fnmatch.fnmatch(name_lower, pattern.lower()):
            return "config"
    
    return "unknown"


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
    
    # AI Agent instructions
    print("=" * 60)
    print("## AI AGENT INSTRUCTIONS")
    print("=" * 60)
    print()
    
    trash_files = [v for v in violations if classify_file(v.filename) == "trash"]
    config_files = [v for v in violations if classify_file(v.filename) == "config"]
    unknown_files = [v for v in violations if classify_file(v.filename) == "unknown"]
    
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
    
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
