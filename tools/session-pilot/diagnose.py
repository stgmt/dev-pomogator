"""Diagnostic CLI for session-pilot — extracted from server.py (Phase 5 refactor).

Usage: python server.py --diagnose-livecycle /mnt/d/repos/lm-saas

Dumps every encoding variant produced by encode_path_for_claude for the given
worktree path, lists all Claude project base dirs, matches JSONLs by name +
suffix heuristics, and prints a verdict (LIVE / idle / NO MATCHES).
"""

import time
from pathlib import Path


def diagnose_livecycle(worktree_path: str, *, encode_path_for_claude,
                       claude_projects_dirs: list[Path],
                       running_threshold_sec: int) -> int:
    """Implementation moved to its own module. Dependencies passed in via kwargs
    so this function has no module-level coupling to server.py.

    Returns exit code (0 = matches found, 1 = no matches).
    """
    print(f"=== diagnose-livecycle for: {worktree_path}")
    variants = encode_path_for_claude(worktree_path)
    print(f"\nEncoding variants ({len(variants)}):")
    for v in sorted(set(variants)):
        print(f"  - {v}")

    print(f"\nClaude project base dirs ({len(claude_projects_dirs)}):")
    for d in claude_projects_dirs:
        exists = "✓ exists" if d.exists() else "✗ missing"
        print(f"  - {d}  [{exists}]")

    now = time.time()
    matches: list[dict] = []
    for base in claude_projects_dirs:
        if not base.exists():
            continue
        for proj in base.iterdir():
            name = proj.name
            match = (
                name in variants
                or any(name.endswith(v.lstrip("-")) for v in variants if len(v) > 4)
                or any(v.lstrip("-").endswith(name) for v in variants if len(name) > 8)
            )
            if not match:
                continue
            for jsonl in proj.glob("*.jsonl"):
                try:
                    st = jsonl.stat()
                    matches.append({
                        "path": str(jsonl), "size": st.st_size,
                        "mtime": st.st_mtime, "age_sec": int(now - st.st_mtime),
                    })
                except OSError:
                    pass

    print(f"\nMatched JSONLs ({len(matches)}):")
    matches.sort(key=lambda m: m["age_sec"])
    for m in matches[:20]:
        live_marker = "🟢 LIVE" if m["age_sec"] < running_threshold_sec else f"   {m['age_sec']}s"
        print(f"  {live_marker:10s}  {m['size']:>8}b  {m['path']}")
    if len(matches) > 20:
        print(f"  ... and {len(matches) - 20} more")

    if not matches:
        print(f"\n❌ NO MATCHES — investigate. Encoding variants don't match any Claude project dir name.")
        print(f"   List Claude project dirs found:")
        for base in claude_projects_dirs:
            if base.exists():
                names = sorted([p.name for p in base.iterdir() if p.is_dir()])[:30]
                print(f"   {base}:")
                for n in names:
                    print(f"     {n}")
        return 1

    youngest = matches[0]["age_sec"]
    print(f"\nVerdict:")
    if youngest < running_threshold_sec:
        print(f"  🟢 LIVE — youngest JSONL is {youngest}s old (< {running_threshold_sec}s threshold)")
    else:
        print(f"  ⚪ idle — youngest JSONL is {youngest}s old (> {running_threshold_sec}s threshold)")
        print(f"     If you're actively typing, raise threshold via: LIVE_THRESHOLD_SEC=300 python server.py")

    return 0
