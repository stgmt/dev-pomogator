"""
Pytest-compatible tests targeting encode_path_module.encode_path_for_claude_v2
specifically for mutmut mutation testing.

The same logic is duplicated in encode_path_module.py so mutmut can
mutate the function body directly. Tests here MUST exercise enough
mutation-killing assertions: exact-equality of every variant produced.

Run mutmut:
    mutmut run --paths-to-mutate=encode_path_module.py
    mutmut results
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from encode_path_module import encode_path_for_claude_v2 as encode  # noqa: E402


# ---------- regression cases that catch specific mutants ----------

def test_wsl_mounted_linux_variant():
    """rstrip mutation, replace mutation: "/mnt/d/repos/foo" must produce -mnt-d-repos-foo."""
    assert "-mnt-d-repos-foo" in encode("/mnt/d/repos/foo")


def test_wsl_mounted_windows_variant():
    """If drive_up upper() mutation OR if /mnt/ branch missing — fails."""
    assert "D--repos-foo" in encode("/mnt/d/repos/foo")


def test_windows_native_windows_variant():
    """If `--` literal mutated to `-`, this fails (the bug T26 caught originally)."""
    assert "D--repos-foo" in encode("D:\\repos\\foo")


def test_windows_native_linux_variant():
    """If drive_lo lower() mutation OR -mnt-x branch missing — fails."""
    assert "-mnt-d-repos-foo" in encode("D:\\repos\\foo")


def test_lm_saas_b1_both():
    """Composite test catching encoding asymmetry mutants for real B-1 case."""
    v = set(encode("/mnt/d/repos/lm-saas"))
    assert "-mnt-d-repos-lm-saas" in v
    assert "D--repos-lm-saas" in v


def test_no_separators_in_output():
    """If a replace() mutated to no-op, separators leak — this catches it."""
    for p in ["/mnt/d/repos/foo", "D:\\repos\\foo", "C:\\Users\\x\\.cursor\\worktrees\\bar"]:
        for v in encode(p):
            assert "/" not in v, f"slash in {v!r} from {p!r}"
            assert "\\" not in v, f"backslash in {v!r} from {p!r}"
            assert ":" not in v, f"colon in {v!r} from {p!r}"


def test_drive_letter_uppercase_in_windows_variant():
    """If `.upper()` mutated to `.lower()` or removed, D-- drops to d-- — fails."""
    v = set(encode("d:\\repos\\foo"))  # lowercase input
    # Canonical Windows form must be UPPER-case D
    assert "D--repos-foo" in v, f"uppercase canonical missing for lowercase input: {sorted(v)}"


def test_drive_letter_lowercase_in_linux_variant():
    """If `.lower()` mutated to `.upper()`, -mnt-D-... appears (wrong) — fails."""
    v = set(encode("D:\\repos\\foo"))  # uppercase input
    assert "-mnt-d-repos-foo" in v, f"lowercase canonical missing for uppercase input: {sorted(v)}"


def test_rstrip_handles_trailing_slash():
    """If rstrip mutation removes trailing slash handling, paths with trailing / break."""
    a = set(encode("/mnt/d/repos/foo"))
    b = set(encode("/mnt/d/repos/foo/"))  # trailing slash
    assert a == b, f"trailing slash should be stripped: {a} vs {b}"


def test_rstrip_handles_trailing_backslash():
    a = set(encode("D:\\repos\\foo"))
    b = set(encode("D:\\repos\\foo\\"))
    assert a == b, f"trailing backslash should be stripped: {a} vs {b}"


def test_short_input_no_crash():
    """If `len(p) > 6` mutation to `>= 6` or `> 5`, may IndexError on short input."""
    # These should NOT crash
    encode("/")
    encode("a")
    encode("/mnt")  # too short for /mnt/X branch
    encode("D:")    # too short for X:/ branch (no separator after :)
    encode("X")     # single char


def test_idempotent_call():
    """If global state introduced by mutation, repeated calls differ."""
    p = "/mnt/d/repos/foo"
    v1 = sorted(set(encode(p)))
    v2 = sorted(set(encode(p)))
    v3 = sorted(set(encode(p)))
    assert v1 == v2 == v3, f"non-idempotent: {v1} {v2} {v3}"


def test_result_is_list_type():
    """If return type mutated to set/tuple, list-only callers break."""
    result = encode("/mnt/d/repos/foo")
    assert isinstance(result, list), f"Not a list: {type(result)}"


def test_returns_at_least_one_variant():
    """If empty list returned, dashboard breaks."""
    assert len(encode("/repos/foo")) >= 1


def test_drive_p5_handling():
    """If `p[5]` mutated to `p[4]`, drive letter wrong (e.g. uses '/' as drive)."""
    v = set(encode("/mnt/d/repos/foo"))
    # The /mnt/X branch uses p[5] = 'd' to form 'D-...'
    has_correct_drive = any(s.startswith("D-") for s in v)
    assert has_correct_drive, f"D-* variant missing — p[5] mutation suspect: {sorted(v)}"


# pytest discovery (mutmut runs these via pytest by default)
if __name__ == "__main__":
    failed = 0
    for k, v in list(globals().items()):
        if k.startswith("test_") and callable(v):
            try:
                v()
                print(f"PASS {k}")
            except AssertionError as e:
                print(f"FAIL {k}: {e}")
                failed += 1
            except Exception as e:
                print(f"ERROR {k}: {type(e).__name__}: {e}")
                failed += 1
    sys.exit(1 if failed else 0)
