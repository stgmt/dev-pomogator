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
    variants.add(p.replace(":", "").replace("\\", "-").replace("/", "-"))
    if p.startswith("/mnt/") and len(p) > 6:
        drive = p[5].upper()
        rest = p[6:]
        variants.add(f"{drive}-{rest.replace('/', '-').replace(':', '')}")
    if len(p) >= 3 and p[1] == ":" and p[2] in ("/", "\\"):
        drive_lo = p[0].lower()
        drive_up = p[0].upper()
        rest = p[3:].replace("\\", "-").replace("/", "-")
        variants.add(f"-mnt-{drive_lo}-{rest}")
        variants.add(f"{drive_up}--{rest}")
    return [v.lstrip("-") for v in variants] + [v for v in variants if v.startswith("-")] + list(variants)
