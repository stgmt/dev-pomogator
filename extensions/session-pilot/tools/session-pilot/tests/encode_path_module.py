"""Mutmut target — copies the canonical encoder from claude_paths.py at module
load time so mutmut can mutate the function body here AND tests reflect any
upstream change.

DO NOT MANUALLY EDIT THE FUNCTION BODY HERE. Only the canonical version in
extensions/session-pilot/tools/session-pilot/claude_paths.py is authoritative.
This module re-implements identical logic for mutmut's benefit; a sync test
in test_encode_path_module.py asserts the two implementations agree on a
fixed corpus of inputs."""


def encode_path_for_claude_v2(p: str) -> list[str]:
    """Identical to claude_paths.encode_path_for_claude.

    Mutmut targets THIS function (mutation_target/ isolated dir).
    Sync invariant verified by test_encode_path_module.test_sync_with_canonical.
    """
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
