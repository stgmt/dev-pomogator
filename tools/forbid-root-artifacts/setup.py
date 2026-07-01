#!/usr/bin/env python3
"""
Setup script for forbid-root-artifacts pre-commit hook.

This script (FR-8 — self-contained, portable install):
1. Copies runtime files into <repo>/.dev-pomogator/tools/forbid-root-artifacts/
2. Creates default .root-artifacts.yaml if not exists
3. Adds the hook to .pre-commit-config.yaml with a repo-relative, portable entry
4. Runs `pre-commit install` if pre-commit is available (else warns, non-fatal)

The .pre-commit-config.yaml entry is written BEFORE the pre-commit check so the wiring
is produced even on machines that do not yet have pre-commit (git-hook activation is a
separate, best-effort step). Deps are auto-provisioned by install-hook.ts (FR-9) /
deps-install.py.

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

# Runtime files that must live next to check.py in the consuming repo for the hook to run.
RUNTIME_FILES = [
    "check.py",
    "_classifier.py",
    "default-whitelist.yaml",
    ".root-artifacts.yaml.template",
]

# Repo-relative location the hook is installed into + the portable entry (FR-8).
INSTALL_REL_DIR = Path(".dev-pomogator") / "tools" / "forbid-root-artifacts"
HOOK_ENTRY = "python .dev-pomogator/tools/forbid-root-artifacts/check.py"


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


def copy_runtime_files(repo_root: Path, script_dir: Path) -> Path:
    """Copy runtime files into <repo>/.dev-pomogator/tools/forbid-root-artifacts/ (FR-8).

    Returns the target directory. If the script already runs from the target
    (self-contained repo), copying is skipped file-by-file.
    """
    target_dir = (repo_root / INSTALL_REL_DIR).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    if target_dir == script_dir:
        print(f"✓ Runtime files already in place: {target_dir}")
        return target_dir
    for name in RUNTIME_FILES:
        src = script_dir / name
        if src.exists():
            shutil.copy(src, target_dir / name)
    print(f"✓ Copied runtime files to: {target_dir}")
    return target_dir


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
        config_path.write_text(
            "# Configuration for forbid-root-artifacts\n"
            "mode: extend\n"
            "allow: []\n",
            encoding="utf-8",
        )
        print(f"✓ Created minimal config: {config_path}")

    return True


def add_hook_to_pre_commit_config(repo_root: Path) -> bool:
    """Add forbid-root-artifacts hook to .pre-commit-config.yaml with a portable entry (FR-8)."""
    config_path = repo_root / ".pre-commit-config.yaml"

    hook_entry = {
        "id": "forbid-root-artifacts",
        "name": "Forbid root artifacts",
        "entry": HOOK_ENTRY,
        "language": "python",
        "pass_filenames": False,
        "always_run": True,
        "additional_dependencies": ["pyyaml"],
    }

    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}

        repos = config.get("repos", [])
        for repo in repos:
            if repo.get("repo") == "local":
                for hook in repo.get("hooks", []):
                    if hook.get("id") == "forbid-root-artifacts":
                        print("✓ Hook already configured in .pre-commit-config.yaml")
                        return False

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
        config = {"repos": [{"repo": "local", "hooks": [hook_entry]}]}

    with open(config_path, "w", encoding="utf-8") as f:
        yaml.dump(config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    print(f"✓ Added hook to: {config_path}")
    return True


def run_pre_commit_install() -> bool:
    """Run pre-commit install (best-effort)."""
    try:
        subprocess.run(
            ["pre-commit", "install"],
            check=True,
            capture_output=True,
            text=True,
        )
        print("✓ Ran: pre-commit install")
        return True
    except subprocess.CalledProcessError as e:
        print(f"WARNING: pre-commit install failed: {e.stderr}", file=sys.stderr)
        return False


def main() -> int:
    """Main entry point."""
    print("Setting up forbid-root-artifacts...")
    print()

    try:
        repo_root = get_repo_root()
    except Exception as ex:
        print(f"ERROR: Failed to determine repository root: {ex}", file=sys.stderr)
        return 2

    script_dir = get_script_dir()

    # FR-8: make the install self-contained (runtime files under .dev-pomogator/), then write the
    # config wiring — BEFORE the pre-commit check, so the entry is produced even without pre-commit.
    copy_runtime_files(repo_root, script_dir)
    create_default_config(repo_root, script_dir)
    add_hook_to_pre_commit_config(repo_root)

    # Activate the git hook if pre-commit is available (deps are provisioned by install-hook.ts / FR-9).
    if check_pre_commit_installed():
        print("✓ pre-commit is installed")
        run_pre_commit_install()
    else:
        print("WARNING: pre-commit not found — config written but git hook not activated.",
              file=sys.stderr)
        print("  Install with: pip install pre-commit  (then: pre-commit install)", file=sys.stderr)

    print()
    print("Setup complete. The hook config is wired in .pre-commit-config.yaml.")
    print("To customize whitelist, edit .root-artifacts.yaml in repository root.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
