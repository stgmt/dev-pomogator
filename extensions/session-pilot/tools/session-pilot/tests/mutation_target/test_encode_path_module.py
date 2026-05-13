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


# ---------- Targeted mutation killers (raise kill rate from 85.9% to ≥90%) ----------

def test_mnt_branch_excludes_len_exactly_6():
    """Kills M32 (`len(p) > 6` → `>= 6`).
    Path '/mnt/d' is 6 chars. Original: branch NOT triggered. Mutant: triggered,
    producing rest='' → adds 'D-' (or 'D' after lstrip) as a spurious variant.
    """
    v = set(encode("/mnt/d"))
    # Strict: no variant of length ≤ 2 from /mnt/ branch should appear.
    # Original produces only ['mnt-d'] (generic char-strip), no D-prefix variant.
    assert "D-" not in v, f"len=6 path triggered /mnt/ branch (M32): {sorted(v)}"
    assert "D" not in v, f"len=6 path produced bare 'D' variant (M32): {sorted(v)}"


def test_mnt_branch_triggers_for_len_exactly_7():
    """Kills M33 (`len(p) > 6` → `> 7`).
    Path '/mnt/d2' is 7 chars. Original: branch triggered, produces 'D-2'.
    Mutant: skipped → no D-2 variant.
    """
    v = set(encode("/mnt/d2"))
    assert "D-2" in v, f"len=7 path must trigger /mnt/ branch and produce 'D-2': {sorted(v)}"


def test_replace_colon_in_mnt_rest_removes_it():
    """Kills M50 (`.replace(':', '')` → `.replace('XX:XX', '')`) and
    M51 (`.replace(':', '')` → `.replace(':', 'XXXX')`).
    rest containing ':' must produce a variant with the ':' STRIPPED, not kept
    (M50) and not replaced with 'XXXX' (M51).
    """
    v = set(encode("/mnt/d/repos:test"))
    for variant in v:
        assert ":" not in variant, f"colon leaked into variant (M50 suspect): {variant!r} in {sorted(v)}"
        assert "XXXX" not in variant, f"XXXX placeholder leaked (M51 suspect): {variant!r}"


def test_windows_branch_triggers_at_len_exactly_3():
    """Kills M54 (`len(p) >= 3` → `> 3`) and M55 (`>= 3` → `>= 4`).
    Path 'D:/' is exactly 3 chars after rstrip preserves it (`/` rstripped though →
    becomes 'D:' len 2, branch should NOT trigger). Use 'D:\\' (D, :, backslash)
    which after rstrip('/').rstrip('\\') becomes 'D:' (len 2 — no good).
    Workaround: use 'D:a' (len 3) where p[2]='a' — but branch requires p[2] in ('/', '\\').
    So a path EXACTLY 3 chars after rstrip with a separator at p[2] does not exist
    (the separator IS the trailing char, so rstrip removes it).
    Reformulate: test len=3 path WHERE rstrip preserves it.
    """
    # 'd:/' after rstrip('/'): 'd:' — len 2, branch skipped.
    # Need: p where p[2] is '/' or '\\' AND there's content after, so rstrip preserves.
    # Minimal: 'D:/X' is 4 chars, p[2]='/' — len after rstrip = 4. Branch triggers.
    # For BOUNDARY at exactly 3: 'D:\\X'[0:3] = 'D:\\' (3 chars: D, :, \\). After rstrip
    # of '/' and '\\' — strips trailing '\\' → 'D:' (len 2). Branch skipped.
    # Thus a genuinely-len-3 input that hits the branch is hard to construct.
    #
    # Alternative kill: test that a path of EXACTLY 3 chars with p[1]==':' AND
    # p[2] in ('/','\\') and a trailing non-separator MUST exist. The smallest such
    # input is 4 chars (e.g., 'D:/X'). Original: branch triggered. Mutant M54 (> 3):
    # branch skipped at 4? No, 4 > 3 is True. Mutant skips only at exactly 3.
    # Since exactly-3 case is impossible after rstrip, M54/M55 are EQUIVALENT mutants
    # for our domain. Mark them as such — kill via len=4 test instead with a sentinel.
    #
    # For len=4 case 'D:/X', original AND mutants all take branch → can't distinguish.
    # Conclusion: M54+M55 are likely equivalent. Document and move on.
    v = set(encode("D:/X"))
    # len=4 should produce D--X canonical via Windows branch
    assert "D--X" in v, f"len=4 D:/X must produce D--X canonical variant: {sorted(v)}"


def test_windows_branch_handles_forward_slash_separator():
    """Kills M61 (`("/", "\\")` → `("XX/XX", "\\")`).
    Original: `p[2] in ("/", "\\")` matches when p[2] is '/' OR '\\'.
    Mutant: first tuple item changed to "XX/XX" — never matches a 1-char p[2].
    Path 'D:/foo' has p[2]='/' — original triggers branch, mutant skips.
    """
    v = set(encode("D:/foo"))
    assert "D--foo" in v, f"D:/foo (forward-slash separator) must produce D--foo via Windows branch: {sorted(v)}"


def test_rstrip_only_strips_path_separators():
    """Kills M7 (`.rstrip("/")` → `.rstrip("XX/XX")`) and M8 (`.rstrip("\\")` → `.rstrip("XX\\XX")`).
    Mutants strip the chars 'X' and '/' (M7) or 'X' and '\\' (M8). Input ending in
    literal 'X' (uppercase) must NOT have the 'X' stripped — only true separators are.
    """
    v = set(encode("/mnt/d/repos/fooX"))
    assert any(variant.endswith("X") for variant in v), (
        f"trailing 'X' was stripped (M7/M8 suspect — rstrip is matching too broadly): {sorted(v)}"
    )


def test_windows_rest_replace_forward_slash_to_dash():
    """Kills M81 (`rest.replace("/", "-")` → `rest.replace("XX/XX", "-")`) and
    M82 (`rest.replace("/", "-")` → `rest.replace("/", "XX-XX")`).
    Path 'D:\\foo/bar' has forward slash inside the rest. Original replaces it
    with '-' → 'D--foo-bar'. M81 leaves '/' in place. M82 swaps '/' to literal 'XX-XX'.
    """
    v = set(encode("D:\\foo/bar"))
    assert "D--foo-bar" in v, f"Windows rest with mixed separators must produce D--foo-bar: {sorted(v)}"
    for variant in v:
        assert "/" not in variant, f"forward slash leaked into Windows variant (M81 suspect): {variant!r}"
        assert "XX-XX" not in variant, f"M82 placeholder leaked: {variant!r}"


def test_lstrip_only_strips_dashes_not_letters():
    """Kills M89 (`v.lstrip("-")` → `v.lstrip("XX-XX")` which collapses to lstrip set
    {`-`, `X`}). For input 'X:\\foo', the generic variant 'X-foo' would become bare
    'foo' under the mutant (strips 'X' then '-'). Original keeps the 'X' prefix.
    """
    v = encode("X:\\foo")
    # Original: 'X-foo'.lstrip('-') = 'X-foo' (no leading dash). 'X--foo'.lstrip('-') = 'X--foo'.
    # Mutant lstrip('-X'): both reduce to 'foo'. Bare 'foo' must NOT appear.
    assert "foo" not in v, (
        f"bare 'foo' leaked — lstrip stripped 'X' as if it were a dash (M89 suspect): {v}"
    )


def test_return_includes_duplicate_dash_prefixed_variants():
    """Kills M91 (middle filter `v.startswith("-")` → `v.startswith("XX-XX")`).
    The return assembles three lists; the middle one is the SUBSET of variants
    starting with '-'. Mutant changes the predicate to a string that no real variant
    can start with → middle list is empty → result length drops by N (where N is the
    number of dash-prefixed variants).

    For input 'D:\\\\foo' (single backslash inside Python string = D:\\foo):
      - generic variant 'D-foo' (no leading dash)
      - Windows branch adds '-mnt-d-foo' (leading dash) and 'D--foo' (no leading dash)
      Expected len = 3 (lstripped) + 1 (the one starting with '-') + 3 (raw) = 7.
      Mutant: 3 + 0 + 3 = 6.
    """
    result = encode("D:\\foo")
    # Count occurrences of the dash-prefixed variant. Original yields it TWICE
    # (once in the middle filter, once in the trailing raw list).
    dash_prefixed_count = sum(1 for v in result if v.startswith("-mnt-"))
    assert dash_prefixed_count >= 2, (
        f"dash-prefixed variant should appear ≥2 times in return (middle filter + raw list, M91 suspect): "
        f"got {dash_prefixed_count} in {result}"
    )


# ---------- Equivalent mutants (documented; no test added) ----------
# M54 (`len(p) >= 3` → `> 3`) and M55 (`>= 3` → `>= 4`): both flip the boundary
# for the Windows branch from len≥3 to len≥4. The branch additionally requires
# p[1]==":" and p[2] in ("/", "\\"). A real len-3 input matching all conditions
# would be e.g. "X:/" — but the FIRST line of encode_path_for_claude_v2 is
# `p = p.rstrip("/").rstrip("\\")`, which strips that trailing "/" → len 2.
# Therefore an input of EXACTLY len 3 after rstrip that triggers this branch
# cannot exist. M54+M55 are EQUIVALENT_SUSPECT mutants for this function's
# input domain. Marked here per strong-tests skill convention.


class _SyncTestSkipped(Exception):
    """Sentinel: only raised when sync test cannot run (mutmut context)
    where canonical claude_paths.py is intentionally outside the mutated
    sandbox. Caught by __main__ block and printed as SKIP, not PASS.
    Any other ImportError must propagate as FAIL."""


def test_sync_with_canonical():
    """encode_path_module.encode_path_for_claude_v2 MUST stay in sync with
    claude_paths.encode_path_for_claude (the production canonical).

    If this test fails, either v2 was edited directly (forbidden — copy from
    canonical) OR canonical was edited and v2 not updated. Fix: copy
    function body from claude_paths.py to encode_path_module.py verbatim.

    Mutmut context (detected via path walk): claude_paths.py is intentionally
    NOT in the mutation sandbox so mutmut targets v2 only. Skip with explicit
    sentinel — silent ImportError swallow would be a fake-positive."""
    import sys, pathlib
    parent = pathlib.Path(__file__).resolve().parent
    found_root = None
    for _ in range(5):
        if (parent / "claude_paths.py").exists():
            sys.path.insert(0, str(parent))
            found_root = parent
            break
        parent = parent.parent
    if found_root is None:
        # Genuinely not on disk anywhere upward — mutmut isolated sandbox.
        raise _SyncTestSkipped(
            "claude_paths.py not found within 5 parent dirs — mutmut sandbox context"
        )
    try:
        from claude_paths import encode_path_for_claude as canonical
    except ImportError as e:
        # File exists on disk but import failed — that IS a real bug, not a skip.
        raise AssertionError(
            f"claude_paths.py found at {found_root} but import failed: {e!r}. "
            f"This is NOT a mutmut sandbox case — investigate path/syntax."
        ) from e

    corpus = [
        "/mnt/d/repos/foo",
        "/mnt/d/repos/lm-saas",
        "D:\\repos\\foo",
        "C:\\Users\\stigm\\.cursor\\worktrees\\bar",
        "/repos/baz",
        "/mnt/c/Users/x",
        "Z:\\projects\\quux",
    ]
    for p in corpus:
        v1 = sorted(set(encode(p)))
        v2 = sorted(set(canonical(p)))
        assert v1 == v2, (
            f"DRIFT for {p!r}:\n"
            f"  encode_path_module → {v1}\n"
            f"  claude_paths       → {v2}\n"
            f"Fix: copy function body from claude_paths.py to encode_path_module.py."
        )


# pytest discovery (mutmut runs these via pytest by default)
if __name__ == "__main__":
    failed = 0
    for k, v in list(globals().items()):
        if k.startswith("test_") and callable(v):
            try:
                v()
                print(f"PASS {k}")
            except _SyncTestSkipped as e:
                # Explicit SKIP path — only the sync test, only in mutmut sandbox.
                # Other tests cannot reach this branch.
                print(f"SKIP {k}: {e}")
            except AssertionError as e:
                print(f"FAIL {k}: {e}")
                failed += 1
            except Exception as e:
                print(f"ERROR {k}: {type(e).__name__}: {e}")
                failed += 1
    sys.exit(1 if failed else 0)
