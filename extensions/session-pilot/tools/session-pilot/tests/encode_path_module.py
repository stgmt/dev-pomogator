"""
Standalone module isolating encode_path_for_claude for mutmut.

Server.py is large (~900 LOC) — running mutmut on the whole file
generates noise. This wrapper exposes only the function under test
so mutation analysis stays focused.

Used by mutmut config: mutates this file, runs test_encode_path.py
which imports from server.py — so we re-export here.

Note: we keep the actual implementation in server.py (single source
of truth); mutmut targets this thin re-export module to reduce
mutation surface to the encoder logic only.
"""

"""Self-contained module for mutmut — no external imports.

Mutmut copies this file to mutants/ and mutates each line. Importing
server.py from mutants/ would fail (path resolution differs). The
implementation is duplicated here intentionally; the canonical is
in server.py and tests/test_encode_path.py covers regression there."""


def encode_path_for_claude_v2(p: str) -> list[str]:
    """Identical implementation to server.py's encode_path_for_claude;
    mutmut mutates THIS function and re-runs tests against it."""
    variants = set()
    p = p.rstrip("/").rstrip("\\")
    variants.add(p.replace("/", "-").replace(":", "").replace("\\", "-"))
    win_form = p.replace(":", "").replace("\\", "-").replace("/", "-")
    variants.add(win_form)
    if p.startswith("/mnt/") and len(p) > 6:
        drive = p[5].upper()
        rest = p[6:]
        win = f"{drive}-{rest.replace('/', '-').replace(':', '')}"
        variants.add(win)
    if len(p) >= 3 and p[1] == ":" and p[2] in ("/", "\\"):
        drive_lo = p[0].lower()
        drive_up = p[0].upper()
        rest = p[3:].replace("\\", "-").replace("/", "-")
        variants.add(f"-mnt-{drive_lo}-{rest}")
        variants.add(f"{drive_up}--{rest}")
    return [v.lstrip("-") for v in variants] + [v for v in variants if v.startswith("-")] + list(variants)
