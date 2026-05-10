"""
Cross-OS Claude project path encoding.

Single source of truth for `encode_path_for_claude`. server.py and
mutmut test target import from here so the implementation is never
duplicated.

Per `.claude/rules/session-pilot/claude-projects-encoding.md`:
Claude Code on Windows writes JSONL to `D--repos-foo` even when CWD
is `/mnt/d/repos/foo` (WSL). Encoder must produce ALL plausible
variants so the dashboard scans every possible location.
"""

from __future__ import annotations


def encode_path_for_claude(p: str) -> list[str]:
    """Return all plausible Claude project-dir encodings for path `p`.

    Examples:
        /mnt/d/repos/foo  → ["-mnt-d-repos-foo", "mnt-d-repos-foo",
                              "D--repos-foo", "D-repos-foo"]
        D:\\repos\\foo     → ["D--repos-foo", "D-repos-foo",
                              "-mnt-d-repos-foo", "mnt-d-repos-foo"]

    The dashboard scans both ~/.claude/projects (WSL) and
    /mnt/c/Users/.../.claude/projects (Windows mount), trying every
    returned variant against subdirectory names. Match wins.
    """
    variants = set()
    p = p.rstrip("/").rstrip("\\")
    # Generic char-stripping form. Single line replaces 3 chars.
    variants.add(p.replace(":", "").replace("\\", "-").replace("/", "-"))
    # If path starts with /mnt/X/, also try X-... encoding (Windows Claude target)
    if p.startswith("/mnt/") and len(p) > 6:
        drive = p[5].upper()
        rest = p[6:]
        variants.add(f"{drive}-{rest.replace('/', '-').replace(':', '')}")
    # If path starts with X:/, also try -mnt-x-... encoding (WSL Claude target)
    # AND X--rest encoding (Windows Claude canonical with DOUBLE dash —
    # this is what Claude actually writes; single-dash misses real JSONL dirs)
    if len(p) >= 3 and p[1] == ":" and p[2] in ("/", "\\"):
        drive_lo = p[0].lower()
        drive_up = p[0].upper()
        rest = p[3:].replace("\\", "-").replace("/", "-")
        variants.add(f"-mnt-{drive_lo}-{rest}")
        variants.add(f"{drive_up}--{rest}")  # canonical Windows form: D--repos-foo
    return [v.lstrip("-") for v in variants] + [v for v in variants if v.startswith("-")] + list(variants)
