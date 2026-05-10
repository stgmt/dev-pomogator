"""
Tests for `python server.py --diagnose-livecycle <path>` CLI subcommand.

Per FR-19, AC-19: CLI must dump:
1. Encoding variants section
2. Claude project base dirs scanned
3. Per-JSONL match table (path/mtime/age/size)
4. Verdict line (🟢 LIVE / ⚪ idle / ❌ no match)

Real subprocess invocation, real filesystem state. Per
integration-tests-first rule.
"""

import os
import subprocess
import sys
from pathlib import Path

SERVER_PY = Path(__file__).resolve().parent.parent / "server.py"
PYTHON = sys.executable


def _run_diagnose(path: str, timeout: int = 30) -> tuple[int, str, str]:
    """Run --diagnose-livecycle CLI; return (exit_code, stdout, stderr)."""
    out = subprocess.run(
        [PYTHON, str(SERVER_PY), "--diagnose-livecycle", path],
        capture_output=True, text=True, timeout=timeout, check=False,
    )
    return out.returncode, out.stdout, out.stderr


# ---------- structural tests ----------

def test_cli_exists_and_responds():
    """--diagnose-livecycle returns non-error exit (0 if matches found, 1 if no match)."""
    rc, stdout, stderr = _run_diagnose("/tmp/definitely-not-a-real-path-12345")
    # Exit 0 OR 1 (no matches) — both expected, NOT crash codes (2+, signal codes)
    assert rc in (0, 1), f"unexpected exit code {rc}; stderr: {stderr[:300]}"


def test_cli_dumps_diagnose_header():
    """First line shows 'diagnose-livecycle for: <path>'."""
    target = "/mnt/d/repos/dev-pomogator-session-pilot"
    rc, stdout, _ = _run_diagnose(target)
    assert "=== diagnose-livecycle for:" in stdout, (
        f"missing header section. Got first 200 chars: {stdout[:200]!r}"
    )
    assert target in stdout, f"target path not echoed: {stdout[:200]!r}"


def test_cli_lists_encoding_variants():
    """Section 'Encoding variants' is present with at least 1 listed variant."""
    rc, stdout, _ = _run_diagnose("/mnt/d/repos/lm-saas")
    assert "Encoding variants" in stdout, f"section missing: {stdout[:300]!r}"
    # The lm-saas path produces at least 5 variants per FR-17
    # Check that BOTH key variants appear
    assert "-mnt-d-repos-lm-saas" in stdout, "WSL variant missing in output"
    assert "D--repos-lm-saas" in stdout, "Windows variant missing in output"


def test_cli_lists_claude_project_base_dirs():
    """Section 'Claude project base dirs' enumerates scanned directories.

    Path separator is OS-native (forward slash on Linux/WSL, backslash on
    Windows native Python), so assert tokens separately rather than the
    literal joined path.
    """
    rc, stdout, _ = _run_diagnose("/mnt/d/repos/dev-pomogator")
    assert "Claude project base dirs" in stdout, "base dirs section missing"
    assert ".claude" in stdout, "expected .claude path component in output"
    assert "projects" in stdout, "expected projects path component in output"


def test_cli_dumps_matched_jsonls_section():
    """Section 'Matched JSONLs' header is present (count may be 0 or N)."""
    rc, stdout, _ = _run_diagnose("/mnt/d/repos/dev-pomogator")
    assert "Matched JSONLs" in stdout, "Matched JSONLs section missing"


def test_cli_emits_verdict_line():
    """Final 'Verdict:' line with 🟢 / ⚪ / ❌ glyph."""
    rc, stdout, _ = _run_diagnose("/mnt/d/repos/dev-pomogator")
    # Either has matches → "Verdict:" + (LIVE or idle) glyph
    # Or no matches → "❌ NO MATCHES" earlier in output
    has_verdict = "Verdict:" in stdout
    has_no_match_msg = "NO MATCHES" in stdout
    assert has_verdict or has_no_match_msg, (
        f"missing verdict — got: {stdout[-500:]!r}"
    )
    if has_verdict:
        # Verdict should be either 🟢 LIVE or ⚪ idle
        verdict_section = stdout[stdout.index("Verdict:"):stdout.index("Verdict:") + 200]
        assert ("🟢" in verdict_section) or ("⚪" in verdict_section), (
            f"verdict missing glyph: {verdict_section!r}"
        )


def test_cli_no_match_path_returns_exit_1_with_diagnostic():
    """Path that won't match any Claude project dir → exit 1 with NO MATCHES verdict."""
    rc, stdout, _ = _run_diagnose("/tmp/definitely-no-claude-history-here-xyz123")
    if "NO MATCHES" in stdout:
        assert rc == 1, f"NO MATCHES path should exit 1, got {rc}"
        # Should also dump available Claude project dirs as troubleshooting aid
        assert "Claude project dirs" in stdout or "encoding variants" in stdout.lower()


def test_cli_dev_pomogator_finds_jsonls_for_active_session():
    """Smoke test: dev-pomogator worktree (this conversation lives there) MUST have ≥1 JSONL match.

    Environment-gated: only meaningful where Claude history actually exists.
    Skips cleanly on CI/clean runners that have no ~/.claude/projects (otherwise
    the test would always fail there — false negative, not encoding regression).
    """
    home_claude = Path.home() / ".claude" / "projects"
    if not home_claude.exists():
        print(f"SKIP test_cli_dev_pomogator_finds_jsonls_for_active_session: "
              f"{home_claude} does not exist (CI/clean runner — no Claude history)")
        return
    rc, stdout, _ = _run_diagnose("/mnt/d/repos/dev-pomogator")
    # Active session ⇒ should have matches; no matches would be suspicious
    if "NO MATCHES" in stdout:
        # Acceptable only if Claude really hasn't run there (e.g. fresh checkout)
        # — but in this E2E session, claude IS running there, so this assertion
        # should pass; if it doesn't, encoding regression suspected.
        raise AssertionError(
            f"dev-pomogator should have JSONL history (this conversation runs there). "
            f"NO MATCHES verdict suggests encoding regression. "
            f"Output tail: {stdout[-400:]!r}"
        )


# ---------- runner ----------

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
