#!/usr/bin/env python3
"""
MCP Setup Script for specs-workflow plugin.
Installs Context7 and Octocode MCP servers for Cursor and Claude Code.
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Dict, Any


def get_config_path(platform: str) -> Path:
    """Get the MCP config file path for the given platform."""
    home = Path.home()
    if platform == "cursor":
        return home / ".cursor" / "mcp.json"
    elif platform == "claude":
        return home / ".claude.json"
    else:
        raise ValueError(f"Unknown platform: {platform}")


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
        with open(config_path, "r", encoding="utf-8") as f:
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
            "command": "npx",
            "args": ["-y", "@upstash/context7-mcp@latest"]
        },
        "octocode": {
            "description": "GitHub code search",
            "command": "npx",
            "args": ["octocode-mcp@latest"]
        }
    }


def is_mcp_installed(config: Dict[str, Any], server_name: str) -> bool:
    """Check if MCP server is already installed.
    
    Checks for both exact name and common prefixed variants (user-*, cursor-*).
    """
    servers = config.get("mcpServers", {})
    
    # Check exact match
    if server_name in servers:
        return True
    
    # Check common prefixed variants
    prefixes = ["user-", "cursor-", "claude-"]
    for prefix in prefixes:
        if f"{prefix}{server_name}" in servers:
            return True
    
    # Check if server_name itself has prefix and base name exists
    for prefix in prefixes:
        if server_name.startswith(prefix):
            base_name = server_name[len(prefix):]
            if base_name in servers:
                return True
    
    return False


def build_mcp_entry(server_def: Dict[str, Any]) -> Dict[str, Any]:
    """Build MCP server entry for config."""
    return {
        "command": server_def["command"],
        "args": server_def["args"]
    }


def install_mcp_servers(
    platform: str,
    force: bool = False,
    check_only: bool = False
) -> int:
    """Install MCP servers for the given platform."""
    config_path = get_config_path(platform)
    config = load_mcp_config(config_path)
    definitions = get_mcp_definitions()
    
    print(f"\n{'='*50}")
    print(f"MCP Setup for {platform.upper()}")
    print(f"Config: {config_path}")
    print(f"{'='*50}\n")
    
    installed_count = 0
    skipped_count = 0
    
    for server_name, server_def in definitions.items():
        description = server_def.get("description", server_name)
        
        if is_mcp_installed(config, server_name) and not force:
            print(f"[OK] {server_name}: already installed ({description})")
            skipped_count += 1
            continue
        
        if check_only:
            print(f"[MISSING] {server_name}: not installed ({description})")
            continue
        
        print(f"[INSTALL] {server_name}: {description}")
        
        entry = build_mcp_entry(server_def)
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
