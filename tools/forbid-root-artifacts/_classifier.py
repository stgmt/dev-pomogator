#!/usr/bin/env python3
"""
Shared classifier module for forbid-root-artifacts plugin.

Single source of classification truth used by both check.py and configure.py.
Loads patterns from yaml (default-whitelist.yaml + .root-artifacts.yaml),
supports optional LLM classification via Claude Code CLI subscription.

Module is private to plugin (`_` prefix). Imported as:
    from _classifier import (
        ClassifierConfig, load_classifier_config,
        classify_file, llm_classify,
        find_stale_allow_entries, is_testsettings,
    )

If module is missing (broken upgrade), check.py falls back to embedded
_FALLBACK_TRASH_PATTERNS — see check.py import block.

References:
    .specs/forbid-root-artifacts/FR.md (FR-2, FR-3, FR-4)
    .specs/forbid-root-artifacts/RESEARCH.md (## Технические находки — VS legacy patterns)
"""
from __future__ import annotations

import fnmatch
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

try:
    import yaml
except ImportError:  # pragma: no cover — dep is required by extension manifest
    print("ERROR: pyyaml is required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(2)


# Per-CLI warning flags — printed once per CLI name per process (H6).
# Using a set instead of a single bool so two different `cli:` configs
# in the same process don't share/suppress each other's warnings.
_warned_no_cli: set[str] = set()


@dataclass
class ClassifierConfig:
    """Layered classifier configuration merged from default-whitelist.yaml + .root-artifacts.yaml."""

    mode: str = "hybrid"  # 'config' | 'llm' | 'hybrid'
    trash_patterns: list[str] = field(default_factory=list)
    config_patterns: list[str] = field(default_factory=list)
    use_default_trash: bool = True
    # C3: opt-in by default. Auto-prune modifies user yaml on every pre-commit
    # run — semantically a breaking change vs 1.0.0 unless explicitly enabled.
    auto_prune_enabled: bool = False
    llm_cli: str = "claude"
    llm_timeout_seconds: int = 30
    llm_cache_ttl_seconds: int = 86400  # 24h


def _read_yaml(path: Path) -> dict[str, Any]:
    """Read yaml file or return empty dict if missing/malformed."""
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        if isinstance(data, dict):
            return data
        return {}
    except yaml.YAMLError:
        return {}


def load_classifier_config(repo_root: Path, plugin_dir: Path) -> ClassifierConfig:
    """
    Load classifier configuration by merging plugin defaults + user overrides.

    Args:
        repo_root: repository root containing .root-artifacts.yaml (user config)
        plugin_dir: plugin directory containing default-whitelist.yaml (plugin defaults)

    Returns:
        ClassifierConfig with merged trash_patterns, config_patterns, mode and llm settings.
    """
    plugin_yaml = _read_yaml(plugin_dir / "default-whitelist.yaml")
    user_yaml = _read_yaml(repo_root / ".root-artifacts.yaml")

    cfg = ClassifierConfig()

    # Layer 1: defaults from plugin yaml.
    # NOTE: `patterns:` in default-whitelist.yaml is a *whitelist* pattern list
    # (files allowed in repo root) — semantically distinct from classification.
    # We use dedicated `trash_patterns_default` and `config_patterns_default` keys.
    default_trash = list(plugin_yaml.get("trash_patterns_default", []) or [])
    default_config = list(plugin_yaml.get("config_patterns_default", []) or [])

    # Layer 2: user overrides from .root-artifacts.yaml
    user_trash = list(user_yaml.get("trash_patterns", []) or [])
    user_config_patterns = list(user_yaml.get("config_patterns", []) or [])
    cfg.use_default_trash = bool(user_yaml.get("use_default_trash_patterns", True))

    # Merge trash patterns: user always added; defaults conditional on use_default_trash
    merged_trash: list[str] = []
    seen: set[str] = set()
    for p in user_trash:
        if p not in seen:
            merged_trash.append(p)
            seen.add(p)
    if cfg.use_default_trash:
        for p in default_trash:
            if p not in seen:
                merged_trash.append(p)
                seen.add(p)
    cfg.trash_patterns = merged_trash

    # Merge config patterns: user + defaults (no toggle for these — always merged)
    merged_config_patterns: list[str] = []
    seen_cfg: set[str] = set()
    for p in user_config_patterns:
        if p not in seen_cfg:
            merged_config_patterns.append(p)
            seen_cfg.add(p)
    for p in default_config:
        if p not in seen_cfg:
            merged_config_patterns.append(p)
            seen_cfg.add(p)
    cfg.config_patterns = merged_config_patterns

    # Classifier section
    classifier_yaml = user_yaml.get("classifier") or {}
    if isinstance(classifier_yaml, dict):
        mode = classifier_yaml.get("mode", "hybrid")
        if mode in ("config", "llm", "hybrid"):
            cfg.mode = mode
        else:
            print(
                f"WARNING: invalid classifier.mode '{mode}'; falling back to 'config'",
                file=sys.stderr,
            )
            cfg.mode = "config"

        llm_yaml = classifier_yaml.get("llm") or {}
        if isinstance(llm_yaml, dict):
            cli = llm_yaml.get("cli", "claude")
            if isinstance(cli, str) and cli:
                cfg.llm_cli = cli
            timeout = llm_yaml.get("timeout_seconds", 30)
            if isinstance(timeout, int) and timeout > 0:
                cfg.llm_timeout_seconds = timeout
            ttl = llm_yaml.get("cache_ttl_seconds", 86400)
            if isinstance(ttl, int) and ttl > 0:
                cfg.llm_cache_ttl_seconds = ttl

    # Auto-prune section. Default OFF (C3 — explicit opt-in to avoid breaking
    # downstream users who upgrade from 1.0.0 without realising pre-commit will
    # start mutating their yaml file).
    auto_prune_yaml = user_yaml.get("auto_prune") or {}
    if isinstance(auto_prune_yaml, dict):
        cfg.auto_prune_enabled = bool(auto_prune_yaml.get("enabled", False))

    return cfg


def is_testsettings(name: str) -> bool:
    """Return True if filename matches *.testsettings pattern (deprecated VS test settings)."""
    return fnmatch.fnmatch(name.lower(), "*.testsettings")


def classify_file(
    filename: str,
    config: ClassifierConfig,
    cache_path: Optional[Path] = None,
) -> str:
    """
    Classify a file as 'trash' | 'config' | 'unknown'.

    Layered logic:
        1. Match against config.trash_patterns → 'trash'
        2. Match against config.config_patterns → 'config'
        3. If config.mode in ('llm', 'hybrid') → invoke llm_classify (slow path)
        4. Fallback → 'unknown'

    Args:
        filename: basename of file to classify
        config: ClassifierConfig from load_classifier_config()
        cache_path: optional path to cache file for LLM results

    Returns:
        'trash' | 'config' | 'unknown'
    """
    name_lower = filename.lower()

    # Layer 1: trash patterns (user + optional default)
    for pattern in config.trash_patterns:
        if fnmatch.fnmatch(name_lower, pattern.lower()):
            return "trash"

    # Layer 2: config patterns (user + plugin defaults)
    for pattern in config.config_patterns:
        if fnmatch.fnmatch(name_lower, pattern.lower()):
            return "config"

    # Layer 3: LLM (deferred to t03; for now returns 'unknown' even in llm/hybrid mode)
    if config.mode in ("llm", "hybrid") and cache_path is not None:
        return llm_classify(filename, config, cache_path)

    # Layer 4: unknown
    return "unknown"


_LLM_PROMPT_TEMPLATE = (
    "Classify the file '{filename}' for repository root presence.\n"
    "Reply with EXACTLY ONE word: trash | config | unknown.\n"
    "- trash: build artifacts, temp files, IDE state, deprecated formats\n"
    "- config: legitimate project config or documentation\n"
    "- unknown: cannot determine"
)


def _sanitize_filename_for_prompt(filename: str) -> str:
    """Sanitize a filename for safe LLM prompt embedding.

    H4: Prevents prompt injection via crafted filenames containing newlines,
    quotes, or control characters. Allowed chars: ASCII alphanumerics,
    plus `._-` (sufficient to identify common file extensions). Anything
    else is replaced with `_`. Length capped at 255 (max basename on most
    filesystems).
    """
    safe = "".join(
        c if (c.isalnum() and c.isascii()) or c in "._-" else "_"
        for c in (filename or "")
    )
    return safe[:255] or "_"


def _load_cache(cache_path: Path) -> dict[str, Any]:
    """Load cache file or return empty cache structure if missing/corrupt."""
    empty: dict[str, Any] = {"schema_version": 1, "entries": {}}
    if not cache_path.exists():
        return empty
    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        print(
            f"WARNING: cache file {cache_path} is corrupt; treating as empty",
            file=sys.stderr,
        )
        return empty

    if not isinstance(data, dict):
        return empty
    if data.get("schema_version") != 1:
        # Forward migration safety: ignore old/future schemas
        return empty
    entries = data.get("entries")
    if not isinstance(entries, dict):
        return empty
    return {"schema_version": 1, "entries": entries}


def _save_cache(cache_path: Path, data: dict[str, Any], ttl_seconds: int = 86400) -> None:
    """Save cache atomically (temp + fsync + os.replace).

    H2: Evict expired entries at write-time so the cache file stays bounded.
    Without eviction the file grows unbounded — every unique unmatched
    filename ever classified accumulates ~50 bytes of JSON forever.
    """
    entries = data.get("entries", {})
    now = time.time()
    if isinstance(entries, dict):
        live: dict[str, Any] = {}
        for fname, entry in entries.items():
            if not isinstance(entry, dict):
                continue
            ts = entry.get("ts")
            if not isinstance(ts, (int, float)):
                continue
            delta = now - ts
            # Keep only entries within the valid TTL window
            if 0 <= delta < ttl_seconds:
                live[fname] = entry
        data = {"schema_version": 1, "entries": live}
    payload = json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True)
    _atomic_write_text(cache_path, payload)


def _cache_get(cache: dict[str, Any], filename: str, ttl_seconds: int) -> Optional[str]:
    """Return cached result if entry exists and within TTL, else None.

    H1: Reject negative deltas as well — handles system clock moving backward
    (NTP correction, manual change, container drift). Without this, an entry
    whose `ts` is in the future (relative to current `time()`) is treated as
    fresh forever.
    """
    entries = cache.get("entries", {})
    entry = entries.get(filename)
    if not isinstance(entry, dict):
        return None
    result = entry.get("result")
    ts = entry.get("ts")
    if result not in ("trash", "config", "unknown") or not isinstance(ts, (int, float)):
        return None
    delta = time.time() - ts
    # Treat both expired (delta >= ttl) and "future" entries (delta < 0) as cache miss
    if delta < 0 or delta >= ttl_seconds:
        return None
    return result


def _cache_put(cache: dict[str, Any], filename: str, result: str) -> None:
    """Insert/update cache entry with current timestamp."""
    entries = cache.setdefault("entries", {})
    entries[filename] = {"result": result, "ts": int(time.time())}
    cache["schema_version"] = 1


def _parse_llm_result(stdout: str) -> Optional[str]:
    """Parse claude -p --output-format json stdout. Return validated token or None."""
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    raw = payload.get("result")
    if not isinstance(raw, str):
        return None
    token = raw.strip().split()[0].lower() if raw.strip() else ""
    if token in ("trash", "config", "unknown"):
        return token
    return None


def llm_classify(
    filename: str,
    config: ClassifierConfig,
    cache_path: Path,
) -> str:
    """
    Classify file via Claude Code CLI subscription (subprocess).

    Layered with cache:
        1. Cache hit (within TTL) → return cached result
        2. shutil.which(config.llm_cli) → if None, return 'unknown' + one-time WARN
        3. subprocess `claude -p '<prompt>' --output-format json` with timeout
        4. Parse stdout JSON 'result' field, validate token
        5. Cache result, return

    Any failure (timeout, non-zero exit, parse error) → 'unknown'.
    """
    cache = _load_cache(cache_path)
    cached = _cache_get(cache, filename, config.llm_cache_ttl_seconds)
    if cached is not None:
        return cached

    cli_path = shutil.which(config.llm_cli)
    if cli_path is None:
        # H6: warn once per cli name (set), not once per process (bool)
        if config.llm_cli not in _warned_no_cli:
            print(
                f"WARNING: {config.llm_cli} CLI not in PATH; LLM classification disabled",
                file=sys.stderr,
            )
            _warned_no_cli.add(config.llm_cli)
        return "unknown"

    # H4: sanitize filename before embedding in prompt to prevent injection
    # via crafted filenames (newlines, quotes, control chars).
    safe_filename = _sanitize_filename_for_prompt(filename)
    prompt = _LLM_PROMPT_TEMPLATE.format(filename=safe_filename)
    try:
        # M7: force subscription path by stripping ANTHROPIC_API_KEY from
        # subprocess env. If user has ANTHROPIC_API_KEY set in their shell,
        # claude CLI would otherwise route through paid API instead of their
        # subscription — surprising the user with bills. Spec NFR-Security-6
        # promises "0 API keys" — enforce it.
        sub_env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
        completed = subprocess.run(
            [cli_path, "-p", prompt, "--output-format", "json"],
            capture_output=True,
            text=True,
            timeout=config.llm_timeout_seconds,
            check=False,
            env=sub_env,
        )
    except subprocess.TimeoutExpired:
        print(
            f"WARNING: claude CLI timed out classifying {filename}; treating as unknown",
            file=sys.stderr,
        )
        return "unknown"
    except (OSError, ValueError) as ex:
        # H4: ValueError fires when filename contains NUL (\\0) or other chars
        # that subprocess refuses to pass as argv. Don't crash.
        print(
            f"WARNING: claude CLI invocation failed ({ex}); treating as unknown",
            file=sys.stderr,
        )
        return "unknown"

    if completed.returncode != 0:
        print(
            f"WARNING: claude CLI returned exit {completed.returncode} for {filename}; treating as unknown",
            file=sys.stderr,
        )
        return "unknown"

    parsed = _parse_llm_result(completed.stdout or "")
    if parsed is None:
        print(
            f"WARNING: failed to parse claude CLI output for {filename}; treating as unknown",
            file=sys.stderr,
        )
        return "unknown"

    _cache_put(cache, filename, parsed)
    try:
        _save_cache(cache_path, cache, config.llm_cache_ttl_seconds)
    except OSError as ex:
        print(
            f"WARNING: failed to save classifier cache ({ex}); continuing",
            file=sys.stderr,
        )
    return parsed


# Path-traversal blockers (H5):
#   /  \  ..  \0 — POSIX + Windows path separators / parent-dir / NUL
#   :         — Windows drive letter ("C:foo.txt" is drive-relative)
#   <>"|*?    — Windows reserved characters
_PATH_TRAVERSAL_CHARS = ("/", "\\", "..", "\0", ":", "<", ">", '"', "|", "*", "?")

# Windows reserved device names (case-insensitive, with or without extension)
_WINDOWS_RESERVED_NAMES = frozenset({
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
})


def _is_safe_basename(entry: str) -> bool:
    """Return True if entry is a plain basename (no path separators / parent-dir
    / NUL / Windows drive-relative / Windows reserved name).

    H5: also blocks Windows-specific path forms (`C:foo.txt`, `<>|"*?`,
    `CON.txt`, `aux`, etc.) that pass POSIX-only checks but are problematic
    on Windows filesystems.
    """
    if not entry:
        return False
    if any(token in entry for token in _PATH_TRAVERSAL_CHARS):
        return False
    # Windows reserved name (case-insensitive, ignoring extension)
    base = entry.split(".", 1)[0].upper()
    if base in _WINDOWS_RESERVED_NAMES:
        return False
    # Trailing space or dot is invalid on Windows
    if entry.endswith(" ") or entry.endswith("."):
        return False
    return True


def find_stale_allow_entries(repo_root: Path, allow_list: list[str]) -> list[str]:
    """
    Find entries in allow list that no longer exist on disk.

    Path traversal protection (NFR-Security-2):
        Entries containing '/', '\\', '..', or NUL byte are skipped with stderr WARN.
        These are not considered stale (they may be intentional non-basename refs;
        we refuse to make policy decisions on them).

    Args:
        repo_root: repository root for existence checks
        allow_list: entries from .root-artifacts.yaml `allow:`

    Returns:
        Sorted list of basenames that exist in allow_list but not on disk.
    """
    stale: list[str] = []
    for entry in allow_list:
        if not isinstance(entry, str):
            continue
        if not _is_safe_basename(entry):
            print(
                f"WARNING: skipping non-basename allow entry: {entry}",
                file=sys.stderr,
            )
            continue
        if not (repo_root / entry).exists():
            stale.append(entry)
    stale.sort(key=str.lower)
    return stale


# Atomic file write helper (reused from setup-mcp.py:119-125 pattern)
def _atomic_write_text(target: Path, content: str) -> None:
    """Write content to target atomically (temp file + fsync + os.replace)."""
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target.with_name(target.name + ".tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, target)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
