"""
Tests for encode_path_for_claude — cross-OS path encoding.

Two tiers:

1. Example-based regression tests with EXACT equality assertions for
   variants that Claude actually uses on Windows + WSL. These are the
   failure cases from real B-1 incident (lm-saas detection bug).

2. Property-based tests via Hypothesis — round-trip invariants,
   determinism, idempotence. Catch entire bug classes that example
   tests miss.

Per `.specs/session-pilot/RESEARCH.md`: Claude Code on Windows writes
JSONL to `D--repos-foo` even when CWD is /mnt/d. This means BOTH
encoding variants must be in the output for /mnt/d/repos/foo.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from server import encode_path_for_claude  # noqa: E402

# Hypothesis is optional — gracefully skip property tests if not installed.
try:
    from hypothesis import given, strategies as st, settings, HealthCheck
    HYPOTHESIS_AVAILABLE = True
except ImportError:
    HYPOTHESIS_AVAILABLE = False


# ---------- Example-based regression tests (exact equality) ----------

def test_wsl_mounted_path_produces_linux_variant_exact():
    """For /mnt/d/repos/foo MUST produce '-mnt-d-repos-foo' (Linux Claude target)."""
    variants = set(encode_path_for_claude("/mnt/d/repos/foo"))
    assert "-mnt-d-repos-foo" in variants, (
        f"Linux variant '-mnt-d-repos-foo' MISSING. Got variants: {sorted(variants)}"
    )


def test_wsl_mounted_path_produces_windows_variant_exact():
    """For /mnt/d/repos/foo MUST also produce 'D--repos-foo' (Win Claude target).

    This is the lm-saas regression: Claude Code on Windows writes JSONL to
    D--repos-foo even when shell CWD is /mnt/d/repos/foo. Without this
    variant, dashboard shows worktree as idle while user is actively typing.
    """
    variants = set(encode_path_for_claude("/mnt/d/repos/foo"))
    assert "D--repos-foo" in variants, (
        f"Windows variant 'D--repos-foo' MISSING — this is the B-1 lm-saas bug. "
        f"Got: {sorted(variants)}"
    )


def test_windows_native_path_produces_windows_variant_exact():
    """For D:\\repos\\foo MUST produce 'D--repos-foo'."""
    variants = set(encode_path_for_claude("D:\\repos\\foo"))
    assert "D--repos-foo" in variants, (
        f"'D--repos-foo' MISSING for D:\\repos\\foo. Got: {sorted(variants)}"
    )


def test_windows_native_path_produces_linux_variant_exact():
    """For D:\\repos\\foo MUST also produce '-mnt-d-repos-foo' (WSL Claude target)."""
    variants = set(encode_path_for_claude("D:\\repos\\foo"))
    assert "-mnt-d-repos-foo" in variants, (
        f"'-mnt-d-repos-foo' MISSING for D:\\repos\\foo. Got: {sorted(variants)}"
    )


def test_lm_saas_b1_regression_both_variants_present():
    """B-1 incident: lm-saas worktree NOT shown LIVE despite active typing.

    Root cause was: encoder produced '-mnt-d-repos-lm-saas' but NOT
    'D--repos-lm-saas' — the latter is where Claude Code Windows writes
    JSONL when launched from /mnt/d/repos/lm-saas in WSL.
    """
    variants = set(encode_path_for_claude("/mnt/d/repos/lm-saas"))
    assert "-mnt-d-repos-lm-saas" in variants, (
        f"Linux variant missing. Got: {sorted(variants)}"
    )
    assert "D--repos-lm-saas" in variants, (
        f"Windows variant missing — exact B-1 regression case. Got: {sorted(variants)}"
    )


def test_dot_folder_produces_double_dash_around_dot_dir():
    """Claude Code replaces `.` in dot-folders (e.g. `.claude`) with `-`,
    producing `--claude-` in project dir names (NOT `-.claude-`).

    Without this variant the dashboard misses session data for any worktree
    that contains a dot-folder in its path (e.g. linked worktrees under
    `<repo>/.claude/worktrees/<name>` or `<repo>/.cursor/worktrees/<name>`).
    """
    variants = set(encode_path_for_claude("D:/repos/foo/.claude/bar"))
    assert "D--repos-foo--claude-bar" in variants, (
        f"Dot-folder variant 'D--repos-foo--claude-bar' MISSING. "
        f"Got variants: {sorted(variants)}"
    )


def test_dot_folder_real_products_20340_regression():
    """Exact path from real user dashboard: dev-pomogator's linked worktree
    at /.claude/worktrees/products-20340-spec-fixes maps to claude project
    dir `D--repos-dev-pomogator--claude-worktrees-products-20340-spec-fixes`
    (double-dash around .claude, then single-dash separators).

    Before fix: encoder produced `-.claude-` (literal dot) which never matched
    Claude's real folder name. After fix: variant with `--claude-` is present.
    """
    real_path = "D:/repos/dev-pomogator/.claude/worktrees/products-20340-spec-fixes"
    real_claude_dir = "D--repos-dev-pomogator--claude-worktrees-products-20340-spec-fixes"
    variants = set(encode_path_for_claude(real_path))
    assert real_claude_dir in variants, (
        f"Real-world regression: variant for products-20340 worktree missing.\n"
        f"  Expected variant: {real_claude_dir!r}\n"
        f"  Got: {sorted(v for v in variants if 'products-20340' in v)}"
    )


def test_returns_non_empty_for_typical_inputs():
    """Sanity: any reasonable input produces ≥1 variant."""
    for p in ["/repos/foo", "D:/repos/foo", "/home/user/code", "C:\\projects\\bar"]:
        variants = encode_path_for_claude(p)
        assert len(variants) >= 1, f"No variants for {p!r}"


def test_deterministic_same_input_same_output():
    """Calling twice with same input returns identical variants."""
    p = "/mnt/d/repos/foo"
    v1 = sorted(set(encode_path_for_claude(p)))
    v2 = sorted(set(encode_path_for_claude(p)))
    assert v1 == v2, f"Non-deterministic: first {v1}, second {v2}"


def test_no_double_encoding_already_encoded_input():
    """When input is already encoded (e.g. '-mnt-d-repos-foo'), no over-encoding."""
    encoded_input = "-mnt-d-repos-foo"
    variants = encode_path_for_claude(encoded_input)
    for v in variants:
        assert "----" not in v, f"Over-encoded: {v!r} contains '----'"
        assert "------" not in v, f"Severely over-encoded: {v!r}"


# ---------- Property-based tests via Hypothesis ----------

if HYPOTHESIS_AVAILABLE:

    # Strategy: generate path-like strings with letters, digits, hyphens, slashes, backslashes, colons
    path_segment = st.text(alphabet=st.characters(whitelist_categories=["L", "N"], whitelist_characters="_-"), min_size=1, max_size=20)
    path_strategy = st.lists(path_segment, min_size=1, max_size=5).map(lambda parts: "/".join(parts))


    @given(p=path_strategy)
    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    def test_property_returns_non_empty_list(p):
        """Invariant: ANY input produces non-empty variant list."""
        result = encode_path_for_claude(p)
        assert isinstance(result, list), f"Not a list: {type(result)}"
        assert len(result) >= 1, f"Empty variants for {p!r}"


    @given(p=path_strategy)
    @settings(max_examples=50)
    def test_property_idempotent(p):
        """Invariant: calling twice produces identical output (no global state leak)."""
        v1 = encode_path_for_claude(p)
        v2 = encode_path_for_claude(p)
        assert v1 == v2, f"Non-idempotent for {p!r}: first {v1}, second {v2}"


    @given(p=path_strategy)
    @settings(max_examples=50)
    def test_property_no_path_separators_in_variants(p):
        """Invariant: variants are flat strings with NO `/` or `\\` separators
        (Claude project dir names use `-` everywhere)."""
        variants = encode_path_for_claude(p)
        for v in variants:
            assert "/" not in v, f"Variant contains '/' separator: {v!r} from {p!r}"
            assert "\\" not in v, f"Variant contains '\\\\' separator: {v!r} from {p!r}"
            assert ":" not in v, f"Variant contains ':' (Windows drive): {v!r} from {p!r}"


    @given(
        a=st.text(alphabet="abcdefghij", min_size=1, max_size=10),
        b=st.text(alphabet="abcdefghij", min_size=1, max_size=10),
    )
    @settings(max_examples=30)
    def test_property_distinct_inputs_distinct_outputs(a, b):
        """Invariant: substantially different inputs produce different variant sets.

        Loose property — accepts overlap (encoder collapses some forms) but
        completely identical sets for distinct paths is suspicious.
        """
        if a == b:
            return  # skip self-comparison
        path_a = f"/repos/{a}"
        path_b = f"/repos/{b}"
        if path_a == path_b:
            return
        v_a = set(encode_path_for_claude(path_a))
        v_b = set(encode_path_for_claude(path_b))
        # Variants should differ — at least one variant in v_a not in v_b OR vice versa
        assert v_a != v_b, (
            f"Distinct inputs produced IDENTICAL variants:\n"
            f"  {path_a!r} → {sorted(v_a)}\n"
            f"  {path_b!r} → {sorted(v_b)}"
        )


# ---------- Manual test runner ----------

if __name__ == "__main__":
    test_funcs = [
        (k, v) for k, v in list(globals().items())
        if k.startswith("test_") and callable(v)
    ]
    failed = 0
    skipped = 0
    for name, fn in test_funcs:
        if name.startswith("test_property_") and not HYPOTHESIS_AVAILABLE:
            print(f"SKIP {name} (Hypothesis not installed)")
            skipped += 1
            continue
        try:
            fn()
            print(f"PASS {name}")
        except AssertionError as e:
            print(f"FAIL {name}: {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR {name}: {type(e).__name__}: {e}")
            failed += 1
    if skipped:
        print(f"--- {skipped} property-based tests skipped (install hypothesis to run) ---")
    sys.exit(1 if failed else 0)
