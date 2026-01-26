#!/usr/bin/env python3
"""
Interactive configurator for forbid-root-artifacts whitelist.

Scans repository root, finds files not in whitelist, and helps
the user add them to .root-artifacts.yaml.

Usage:
    python configure.py [--non-interactive]
"""
from __future__ import annotations

import argparse
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
class DefaultConfig:
    """Default whitelist configuration."""
    files: list[str] = field(default_factory=list)
    patterns: list[str] = field(default_factory=list)


@dataclass
class UserConfig:
    """User configuration from .root-artifacts.yaml."""
    mode: str = "extend"
    allow: list[str] = field(default_factory=list)
    deny: list[str] = field(default_factory=list)
    allowed_directories: Optional[list[str]] = None
    ignore_patterns: list[str] = field(default_factory=list)


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


def load_user_config(repo_root: Path) -> Optional[UserConfig]:
    """Load user configuration from repository root."""
    config_path = repo_root / ".root-artifacts.yaml"
    if not config_path.exists():
        return None
    
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except yaml.YAMLError as e:
        print(f"WARNING: Invalid YAML in .root-artifacts.yaml: {e}", file=sys.stderr)
        return None
    
    return UserConfig(
        mode=data.get("mode", "extend"),
        allow=data.get("allow", []) or [],
        deny=data.get("deny", []) or [],
        allowed_directories=data.get("allowed_directories"),
        ignore_patterns=data.get("ignore_patterns", []) or [],
    )


def build_whitelist(defaults: DefaultConfig, user_config: Optional[UserConfig]) -> tuple[set[str], list[str]]:
    """Build final whitelist from defaults and user config."""
    if user_config is None:
        return set(defaults.files), defaults.patterns
    
    if user_config.mode == "replace":
        allowed = {f.lower() for f in user_config.allow}
        patterns = user_config.ignore_patterns
    else:
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


def find_files_not_in_whitelist(
    repo_root: Path,
    allowed_files: set[str],
    patterns: list[str],
) -> list[str]:
    """Find files in repository root that are not in whitelist."""
    not_in_whitelist: list[str] = []
    always_allowed_dirs = {".git", ".svn", ".hg"}
    
    for entry in repo_root.iterdir():
        name = entry.name
        name_lower = name.lower()
        
        # Skip directories
        if entry.is_dir():
            if name_lower not in always_allowed_dirs:
                # We could add directory handling here if needed
                pass
            continue
        
        # Check if file is in whitelist
        if name_lower in allowed_files:
            continue
        
        if matches_pattern(name, patterns):
            continue
        
        not_in_whitelist.append(name)
    
    not_in_whitelist.sort(key=str.lower)
    return not_in_whitelist


def interactive_select(files: list[str]) -> list[str]:
    """
    Interactive multi-select using simple-term-menu.
    Falls back to simple input if not available.
    """
    try:
        from simple_term_menu import TerminalMenu
        
        # Create menu with multi-select
        menu = TerminalMenu(
            files,
            title="Select files to add to whitelist (SPACE to toggle, ENTER to confirm):",
            multi_select=True,
            show_multi_select_hint=True,
            multi_select_select_on_accept=False,
            multi_select_empty_ok=True,
        )
        
        menu.show()
        selected_indices = menu.chosen_menu_indices or ()
        
        return [files[i] for i in selected_indices]
    
    except ImportError:
        # Fallback to simple input
        return fallback_select(files)


def fallback_select(files: list[str]) -> list[str]:
    """Simple fallback selection without external dependencies."""
    print("\nFiles not in whitelist:")
    for i, f in enumerate(files, 1):
        print(f"  {i}. {f}")
    
    print("\nEnter numbers of files to add to whitelist (comma-separated, or 'all', or empty to skip):")
    try:
        choice = input("> ").strip()
    except (EOFError, KeyboardInterrupt):
        return []
    
    if not choice:
        return []
    
    if choice.lower() == "all":
        return files
    
    selected: list[str] = []
    for part in choice.split(","):
        part = part.strip()
        if part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < len(files):
                selected.append(files[idx])
    
    return selected


def save_user_config(repo_root: Path, config: UserConfig) -> None:
    """Save user configuration to .root-artifacts.yaml."""
    config_path = repo_root / ".root-artifacts.yaml"
    
    data: dict = {"mode": config.mode}
    
    if config.allow:
        data["allow"] = config.allow
    
    if config.deny:
        data["deny"] = config.deny
    
    if config.allowed_directories is not None:
        data["allowed_directories"] = config.allowed_directories
    
    if config.ignore_patterns:
        data["ignore_patterns"] = config.ignore_patterns
    
    with open(config_path, "w", encoding="utf-8") as f:
        f.write("# Configuration for forbid-root-artifacts\n")
        f.write("# See: https://github.com/user/dev-pomogator\n\n")
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
    
    print(f"\n✓ Saved configuration to {config_path.name}")


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Configure forbid-root-artifacts whitelist")
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Add all existing files to whitelist without prompting",
    )
    args = parser.parse_args()
    
    print("\n🔍 Configuring forbid-root-artifacts whitelist...\n")
    
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
    
    # Find files not in whitelist
    not_in_whitelist = find_files_not_in_whitelist(repo_root, allowed_files, patterns)
    
    if not not_in_whitelist:
        print("✓ All files in repository root are already in whitelist.")
        print("  No configuration needed.\n")
        return 0
    
    print(f"Found {len(not_in_whitelist)} file(s) not in whitelist:\n")
    for f in not_in_whitelist:
        print(f"  • {f}")
    print()
    
    # Select files to add
    if args.non_interactive:
        selected = not_in_whitelist
        print("Non-interactive mode: adding all files to whitelist.")
    else:
        selected = interactive_select(not_in_whitelist)
    
    if not selected:
        print("\nNo files selected. You can run this configurator later or")
        print("manually edit .root-artifacts.yaml to add files.")
        return 0
    
    # Update or create user config
    if user_config is None:
        user_config = UserConfig()
    
    # Add selected files (avoid duplicates)
    existing_allow_lower = {f.lower() for f in user_config.allow}
    for f in selected:
        if f.lower() not in existing_allow_lower:
            user_config.allow.append(f)
            existing_allow_lower.add(f.lower())
    
    # Save config
    save_user_config(repo_root, user_config)
    
    print("\nAdded to whitelist:")
    for f in selected:
        print(f"  ✓ {f}")
    
    print("\n✨ Configuration complete!\n")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
