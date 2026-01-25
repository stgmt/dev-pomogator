#!/usr/bin/env python3
"""
Setup script for forbid-root-artifacts pre-commit hook.

This script:
1. Checks if pre-commit is installed
2. Creates default .root-artifacts.yaml if not exists
3. Adds hook to .pre-commit-config.yaml if not present
4. Runs pre-commit install

Usage:
    python setup.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml is required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(2)


def get_repo_root() -> Path:
    """Get repository root via git."""
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        capture_output=True,
        text=True,
    )
    return Path(result.stdout.strip())


def get_script_dir() -> Path:
    """Get directory containing this script."""
    return Path(__file__).parent.resolve()


def check_pre_commit_installed() -> bool:
    """Check if pre-commit is installed."""
    return shutil.which("pre-commit") is not None


def create_default_config(repo_root: Path, script_dir: Path) -> bool:
    """Create default .root-artifacts.yaml if not exists."""
    config_path = repo_root / ".root-artifacts.yaml"
    template_path = script_dir / ".root-artifacts.yaml.template"
    
    if config_path.exists():
        print(f"✓ Config already exists: {config_path}")
        return False
    
    if template_path.exists():
        shutil.copy(template_path, config_path)
        print(f"✓ Created config from template: {config_path}")
    else:
        # Create minimal config
        config_path.write_text(
            "# Configuration for forbid-root-artifacts\n"
            "mode: extend\n"
            "allow: []\n",
            encoding="utf-8",
        )
        print(f"✓ Created minimal config: {config_path}")
    
    return True


def add_hook_to_pre_commit_config(repo_root: Path) -> bool:
    """Add forbid-root-artifacts hook to .pre-commit-config.yaml."""
    config_path = repo_root / ".pre-commit-config.yaml"
    
    hook_entry = {
        "id": "forbid-root-artifacts",
        "name": "Forbid root artifacts",
        "entry": "python tools/forbid-root-artifacts/check.py",
        "language": "python",
        "pass_filenames": False,
        "always_run": True,
        "additional_dependencies": ["pyyaml"],
    }
    
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        
        # Check if hook already exists
        repos = config.get("repos", [])
        for repo in repos:
            if repo.get("repo") == "local":
                hooks = repo.get("hooks", [])
                for hook in hooks:
                    if hook.get("id") == "forbid-root-artifacts":
                        print("✓ Hook already configured in .pre-commit-config.yaml")
                        return False
        
        # Add to existing local repo or create new
        local_repo = None
        for repo in repos:
            if repo.get("repo") == "local":
                local_repo = repo
                break
        
        if local_repo:
            local_repo.setdefault("hooks", []).append(hook_entry)
        else:
            repos.append({"repo": "local", "hooks": [hook_entry]})
        
        config["repos"] = repos
    else:
        # Create new config
        config = {
            "repos": [
                {"repo": "local", "hooks": [hook_entry]}
            ]
        }
    
    with open(config_path, "w", encoding="utf-8") as f:
        yaml.dump(config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
    
    print(f"✓ Added hook to: {config_path}")
    return True


def run_pre_commit_install() -> bool:
    """Run pre-commit install."""
    try:
        result = subprocess.run(
            ["pre-commit", "install"],
            check=True,
            capture_output=True,
            text=True,
        )
        print("✓ Ran: pre-commit install")
        return True
    except subprocess.CalledProcessError as e:
        print(f"ERROR: pre-commit install failed: {e.stderr}", file=sys.stderr)
        return False


def main() -> int:
    """Main entry point."""
    print("Setting up forbid-root-artifacts...")
    print()
    
    # Check pre-commit
    if not check_pre_commit_installed():
        print("ERROR: pre-commit is not installed.", file=sys.stderr)
        print()
        print("Install with:")
        print("  pip install pre-commit")
        print()
        return 2
    
    print("✓ pre-commit is installed")
    
    try:
        repo_root = get_repo_root()
    except Exception as ex:
        print(f"ERROR: Failed to determine repository root: {ex}", file=sys.stderr)
        return 2
    
    script_dir = get_script_dir()
    
    # Create default config
    create_default_config(repo_root, script_dir)
    
    # Add hook to pre-commit config
    add_hook_to_pre_commit_config(repo_root)
    
    # Run pre-commit install
    run_pre_commit_install()
    
    print()
    print("Setup complete! The hook will run on every commit.")
    print()
    print("To customize whitelist, edit .root-artifacts.yaml in repository root.")
    print("To run manually: python tools/forbid-root-artifacts/check.py")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
