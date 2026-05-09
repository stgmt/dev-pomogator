"""
Regression tests for encode_path_for_claude — cross-OS path encoding.

Tests that BOTH Linux (/mnt/d/repos/foo → -mnt-d-repos-foo) AND Windows-style
(D:\\repos\\foo → D--repos-foo) variants are produced for any input path.
"""

import sys
from pathlib import Path

# Add server.py dir to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from server import encode_path_for_claude  # noqa: E402


def test_wsl_mounted_path_produces_both_variants():
    """User has worktree under /mnt/d/repos/foo (WSL mount of D:)."""
    variants = set(encode_path_for_claude("/mnt/d/repos/foo"))
    assert "-mnt-d-repos-foo" in variants or "mnt-d-repos-foo" in variants, (
        f"Linux-style variant missing. Got: {variants}"
    )
    assert "D-repos-foo" in variants or "D--repos-foo" in variants, (
        f"Windows-style variant missing for /mnt/d → D:. Got: {variants}"
    )


def test_windows_native_path_produces_both_variants():
    """User has worktree under D:\\repos\\foo (Windows native)."""
    variants = set(encode_path_for_claude("D:\\repos\\foo"))
    assert "D-repos-foo" in variants or "D--repos-foo" in variants, (
        f"Windows-style variant missing. Got: {variants}"
    )
    assert any("mnt-d-repos-foo" in v for v in variants), (
        f"Linux-style variant missing for D: → /mnt/d. Got: {variants}"
    )


def test_lm_saas_specific_regression():
    """B-1 incident: lm-saas worktree must produce D--repos-lm-saas variant
    (Claude on Windows writes JSONL there even when CWD is /mnt/d)."""
    variants = set(encode_path_for_claude("/mnt/d/repos/lm-saas"))
    has_windows_variant = any("D-repos-lm-saas" in v or "D--repos-lm-saas" in v for v in variants)
    assert has_windows_variant, (
        f"lm-saas regression: D--repos-lm-saas variant missing. Got: {variants}"
    )


def test_cursor_worktrees_pattern():
    """Cursor IDE creates worktrees at C:\\Users\\stigm\\.cursor\\worktrees\\foo.
    UC-11 says we should detect that Claude on Windows writes to
    C--Users-stigm--cursor-worktrees-foo."""
    variants = set(encode_path_for_claude("C:\\Users\\stigm\\.cursor\\worktrees\\foo"))
    # At minimum, : and \\ are stripped to produce some normalized form
    assert any("Users-stigm" in v for v in variants), (
        f"Cursor worktree variant missing. Got: {variants}"
    )


def test_returns_non_empty_for_any_input():
    """Sanity: any reasonable input path produces at least one variant."""
    for p in ["/repos/foo", "D:/repos/foo", "/home/user/code", "C:\\projects\\bar"]:
        variants = encode_path_for_claude(p)
        assert len(variants) >= 1, f"No variants for {p}"


def test_no_double_encoding():
    """Encoding must be idempotent for already-encoded inputs (defensive)."""
    encoded_input = "-mnt-d-repos-foo"
    variants = encode_path_for_claude(encoded_input)
    # Should not produce ridiculous over-encoded variants like "----mnt----d----..."
    for v in variants:
        assert "----" not in v, f"Over-encoded variant: {v}"


if __name__ == "__main__":
    import unittest
    # Convert pytest-style to unittest discovery
    test_funcs = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in test_funcs:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except AssertionError as e:
            print(f"FAIL {fn.__name__}: {e}")
            failed += 1
    sys.exit(1 if failed else 0)
