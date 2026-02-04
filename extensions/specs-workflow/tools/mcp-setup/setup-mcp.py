#!/usr/bin/env python3
"""
MCP Setup Script for specs-workflow plugin.
Installs Context7 and Octocode MCP servers for Cursor and Claude Code.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, Optional, Tuple


def get_project_config_path(platform: str, cwd: Optional[Path] = None) -> Optional[Path]:
    """Return project MCP config path if it exists."""
    root = cwd or Path.cwd()
    if platform == "cursor":
        config_path = root / ".cursor" / "mcp.json"
    elif platform == "claude":
        config_path = root / ".mcp.json"
    else:
        raise ValueError(f"Unknown platform: {platform}")
    return config_path if config_path.exists() else None


def get_global_config_path(platform: str) -> Path:
    """Get the global MCP config file path for the given platform."""
    home = Path.home()
    if platform == "cursor":
        return home / ".cursor" / "mcp.json"
    elif platform == "claude":
        return home / ".mcp.json"
    else:
        raise ValueError(f"Unknown platform: {platform}")


def get_config_path(platform: str) -> Tuple[Path, str]:
    """Resolve MCP config path and scope (project/global)."""
    project_path = get_project_config_path(platform)
    if project_path:
        return project_path, "project"
    return get_global_config_path(platform), "global"


def get_backup_path(config_path: Path) -> Path:
    """Get backup path for the given config."""
    return config_path.with_suffix(config_path.suffix + ".backup")


def restore_backup(config_path: Path) -> bool:
    """Restore config from backup if it exists."""
    backup_path = get_backup_path(config_path)
    if not backup_path.exists():
        return False
    config_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(backup_path, config_path)
    print(f"[RESTORE] Restored config from backup: {backup_path}")
    return True


def load_mcp_config(config_path: Path, allow_restore: bool = True) -> Dict[str, Any]:
    """Load existing MCP config or return empty structure."""
    backup_path = get_backup_path(config_path)

    if not config_path.exists():
        if allow_restore and backup_path.exists():
            if restore_backup(config_path):
                return load_mcp_config(config_path, allow_restore=False)
        return {"mcpServers": {}}

    try:
        with open(config_path, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
            if "mcpServers" not in data:
                data["mcpServers"] = {}
            return data
    except (json.JSONDecodeError, IOError) as exc:
        if allow_restore and backup_path.exists():
            print(f"[WARN] Invalid config at {config_path}, attempting restore from backup...")
            if restore_backup(config_path):
                return load_mcp_config(config_path, allow_restore=False)
        raise RuntimeError(f"Failed to read MCP config: {config_path}") from exc


def save_mcp_config(config_path: Path, config: Dict[str, Any]) -> None:
    """Save MCP config to file (backup + atomic write)."""
    config_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path = get_backup_path(config_path)

    if config_path.exists():
        shutil.copy2(config_path, backup_path)
        print(f"[BACKUP] Config backed up to {backup_path}")

    temp_path = config_path.with_name(config_path.name + ".tmp")
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, config_path)
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def get_mcp_definitions() -> Dict[str, Dict[str, Any]]:
    """Get MCP server definitions."""
    script_dir = Path(__file__).parent
    config_file = script_dir / "mcp-config.json"
    
    if config_file.exists():
        with open(config_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("servers", {})
    
    # Fallback to hardcoded definitions
    return {
        "context7": {
            "description": "Library documentation",
            "package": "@upstash/context7-mcp@latest",
            "bin": "context7-mcp"
        },
        "octocode": {
            "description": "GitHub code search",
            "package": "octocode-mcp@latest",
            "bin": "octocode-mcp"
        }
    }


def find_existing_server_key(config: Dict[str, Any], server_name: str) -> Optional[str]:
    """Find existing MCP server key (exact or prefixed variant)."""
    servers = config.get("mcpServers", {})

    # Check exact match
    if server_name in servers:
        return server_name

    # Check common prefixed variants
    prefixes = ["user-", "cursor-", "claude-"]
    for prefix in prefixes:
        key = f"{prefix}{server_name}"
        if key in servers:
            return key

    # Check if server_name itself has prefix and base name exists
    for prefix in prefixes:
        if server_name.startswith(prefix):
            base_name = server_name[len(prefix):]
            if base_name in servers:
                return base_name

    return None


def is_mcp_installed(config: Dict[str, Any], server_name: str) -> bool:
    """Check if MCP server is already installed."""
    return find_existing_server_key(config, server_name) is not None


def get_user_npm_prefix() -> Path:
    """Return the user-level npm global prefix used by setup."""
    return Path.home() / ".npm-global"


def get_npm_bin_dir(prefix_dir: Path) -> Path:
    """Return the directory that contains npm global binaries."""
    return prefix_dir if os.name == "nt" else prefix_dir / "bin"


def resolve_npm_bin(bin_name: str, prefix_dir: Path) -> Path:
    """Resolve npm global binary path for current OS."""
    bin_dir = get_npm_bin_dir(prefix_dir)
    if os.name == "nt":
        return bin_dir / f"{bin_name}.cmd"
    return bin_dir / bin_name


def build_mcp_entry(server_def: Dict[str, Any], prefix_dir: Path) -> Dict[str, Any]:
    """Build MCP server entry for config."""
    bin_name = server_def.get("bin")
    if bin_name:
        command_path = resolve_npm_bin(bin_name, prefix_dir)
        if not command_path.exists():
            raise RuntimeError(f"Expected MCP binary not found: {command_path}")
        return {
            "command": str(command_path),
            "args": server_def.get("args", [])
        }

    command = server_def.get("command")
    if not command:
        raise RuntimeError("Missing command or bin for MCP server")

    return {
        "command": command,
        "args": server_def.get("args", [])
    }


def entries_match(existing: Dict[str, Any], expected: Dict[str, Any]) -> bool:
    """Compare MCP entries by command and args."""
    return (
        existing.get("command") == expected.get("command")
        and existing.get("args", []) == expected.get("args", [])
    )


def ensure_npm_package(server_def: Dict[str, Any], prefix_dir: Path, force: bool) -> None:
    """Install npm package if required."""
    package_name = server_def.get("package")
    if not package_name:
        return

    if force:
        install_npm_package(package_name, prefix_dir)
        return

    bin_name = server_def.get("bin")
    if bin_name:
        command_path = resolve_npm_bin(bin_name, prefix_dir)
        if command_path.exists():
            return

    install_npm_package(package_name, prefix_dir)


def install_npm_package(package: str, prefix_dir: Path) -> None:
    """Install MCP server package globally via npm into user prefix."""
    if not package:
        raise RuntimeError("Missing package name for MCP server")

    npm_path = shutil.which("npm")
    if not npm_path:
        raise RuntimeError("npm not found in PATH. Install Node.js and npm first.")

    prefix_dir.mkdir(parents=True, exist_ok=True)
    print(f"  [NPM] npm install -g --prefix {prefix_dir} {package}")
    result = subprocess.run(
        [npm_path, "install", "-g", "--prefix", str(prefix_dir), package],
        text=True,
        capture_output=True
    )

    if result.returncode != 0:
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"npm install -g {package} failed with exit code {result.returncode}")


def install_mcp_servers(
    platform: str,
    force: bool = False,
    check_only: bool = False
) -> int:
    """Install MCP servers for the given platform."""
    config_path, config_scope = get_config_path(platform)
    prefix_dir = get_user_npm_prefix()
    config = load_mcp_config(config_path)
    definitions = get_mcp_definitions()
    
    print(f"\n{'='*50}")
    print(f"MCP Setup for {platform.upper()}")
    print(f"Config: {config_path} ({config_scope})")
    if config_scope == "project":
        print("Reason: project config found")
    else:
        print("Reason: project config not found")
    print(f"{'='*50}\n")
    
    installed_count = 0
    skipped_count = 0
    
    for server_name, server_def in definitions.items():
        description = server_def.get("description", server_name)
        
        existing_key = find_existing_server_key(config, server_name)

        if check_only:
            if existing_key:
                print(f"[OK] {server_name}: already installed ({description})")
            else:
                print(f"[MISSING] {server_name}: not installed ({description})")
            continue

        if existing_key and not force:
            try:
                ensure_npm_package(server_def, prefix_dir, force=False)
                expected_entry = build_mcp_entry(server_def, prefix_dir)
            except RuntimeError as exc:
                print(f"[ERROR] {server_name}: {exc}")
                return 1

            existing_entry = config["mcpServers"].get(existing_key, {})
            if entries_match(existing_entry, expected_entry):
                print(f"[OK] {server_name}: already installed ({description})")
                skipped_count += 1
                continue

            print(f"[UPDATE] {server_name}: {description}")
            config["mcpServers"][existing_key] = expected_entry
            installed_count += 1
            continue
        
        print(f"[INSTALL] {server_name}: {description}")

        try:
            ensure_npm_package(server_def, prefix_dir, force=force)
        except RuntimeError as exc:
            print(f"[ERROR] {server_name}: {exc}")
            return 1

        try:
            entry = build_mcp_entry(server_def, prefix_dir)
        except RuntimeError as exc:
            print(f"[ERROR] {server_name}: {exc}")
            return 1
        config["mcpServers"][server_name] = entry
        installed_count += 1
        print(f"  [OK] Added {server_name}")
    
    if not check_only and installed_count > 0:
        save_mcp_config(config_path, config)
        print(f"\n[SAVED] Config written to {config_path}")
        print(f"\n[INFO] Restart {platform.title()} IDE to apply changes")
    
    print(f"\nSummary: {installed_count} installed, {skipped_count} skipped")
    
    return 0 if installed_count > 0 or skipped_count > 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Install MCP servers for Cursor and Claude Code"
    )
    parser.add_argument(
        "--platform",
        choices=["cursor", "claude", "both"],
        default="cursor",
        help="Target platform (default: cursor)"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only check if MCP servers are installed"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force reinstall even if already installed"
    )
    
    args = parser.parse_args()
    
    platforms = ["cursor", "claude"] if args.platform == "both" else [args.platform]
    
    exit_code = 0
    for platform in platforms:
        result = install_mcp_servers(
            platform=platform,
            force=args.force,
            check_only=args.check
        )
        if result != 0:
            exit_code = result
    
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
