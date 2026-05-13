# Fixtures

## Overview

session-pilot tests need 3 categories of fixtures:
1. **Synthetic JSONL files** in fake `~/.claude/projects/<encoded>/<uuid>.jsonl` directories — for testing `claude_sessions_for()` end-to-end without polluting real Claude history
2. **Path encoding test cases** — known input → expected variants for `encode_path_for_claude()` regression
3. **Live Zellij sessions** — for /api/launch integration tests; created on-demand via test setup, MUST be cleaned up after (currently NOT cleaned up — gap, see B-2 below)

Fixtures are **co-located with tests** at `extensions/session-pilot/tools/session-pilot/tests/fixtures/` — not in shared dev-pomogator fixtures dir, since session-pilot's needs are specific (Claude JSONL format, Zellij session lifecycle).

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | encode_path test cases | static | inline в test_encode_path.py | per-test | test function itself |
| F-2 | lm-saas regression case | static | inline | per-test | test_lm_saas_specific_regression |
| F-3 | Cursor worktree pattern | static | inline | per-test | test_cursor_worktrees_pattern |
| F-4 | first-worktree from /api/index | factory (HTTP-derived) | `_first_worktree()` helper | per-test | test_launch_idempotent.py |
| F-5 | sp-idempotency-test session | live Zellij session | created via POST /api/launch | per-test | test_double_post_within_5s_returns_cached |
| F-6 | sp-idempotency-test-2 session | live Zellij session | created via POST /api/launch | per-test | test_post_after_5s_runs_again |
| F-7 | synthetic JSONL fake-claude-projects | static (planned v0.2) | tests/fixtures/fake-claude-projects/ | per-test suite | T34 — not yet created |

## Fixture Details

### F-1: encode_path test cases

- **Type:** static (Python literals in test code)
- **Format:** Python tuple/dict
- **Setup:** None — literals in test function body
- **Teardown:** None
- **Dependencies:** None
- **Used by:** all 6 tests in `test_encode_path.py`
- **Assumptions:** `encode_path_for_claude()` is a pure function (no side effects), so fixtures can be inline

Example (line 17-18 в test_encode_path.py):
```python
variants = set(encode_path_for_claude("/mnt/d/repos/foo"))
```

### F-2: lm-saas regression case

- **Type:** static
- **Format:** Python literal
- **Setup:** Path `/mnt/d/repos/lm-saas` hardcoded
- **Teardown:** None
- **Dependencies:** None
- **Used by:** `test_lm_saas_specific_regression`
- **Assumptions:** Encoder must produce variant matching `D--repos-lm-saas` (Claude on Windows writes here even when CWD is /mnt/d). This was the root-cause of B-1 incident — Phase 3b LIVE detection bug.

### F-3: Cursor worktree pattern

- **Type:** static
- **Format:** Python literal
- **Setup:** Path `C:\Users\stigm\.cursor\worktrees\foo` hardcoded
- **Teardown:** None
- **Dependencies:** None
- **Used by:** `test_cursor_worktrees_pattern`
- **Assumptions:** UC-11 edge case — Cursor IDE worktree paths. Currently weak assertion (`any("Users-stigm" in v)`); v0.2 should strengthen to exact match `C--Users-stigm--cursor-worktrees-foo` per stronger-tests skill review.

### F-4: first-worktree from /api/index

- **Type:** factory (HTTP-derived at test runtime)
- **Format:** string (worktree path)
- **Setup:** `_first_worktree()` helper makes GET /api/index, returns `data["rows"][0]["worktree_path"]`
- **Teardown:** None (read-only)
- **Dependencies:** Requires running session-pilot server on localhost:8083 with at least 1 worktree configured
- **Used by:** all integration tests in test_launch_idempotent.py
- **Assumptions:** Server is up; at least 1 worktree autodiscovered (very likely on user's machine — 45 worktrees observed)

### F-5: sp-idempotency-test session

- **Type:** live Zellij session
- **Format:** Zellij session created via KDL layout
- **Setup:** First POST to /api/launch with `{worktree_path, session_name: "sp-idempotency-test", mode: "fresh"}`
- **Teardown:** ⚠️ **Currently NOT cleaned up** — leaks zombie Zellij sessions across test runs (see Gap Analysis B-2)
- **Dependencies:** F-4 (first-worktree path), running Zellij server
- **Used by:** `test_double_post_within_5s_returns_cached`
- **Assumptions:** Zellij installed; `script` (util-linux) available for pty allocation

### F-6: sp-idempotency-test-2 session

Same as F-5 but session name `sp-idempotency-test-2`. Used by `test_post_after_5s_runs_again` after 6s sleep.

### F-7: synthetic fake-claude-projects (planned v0.2 — T34)

- **Type:** static directory tree
- **Format:** JSONL files в `tests/fixtures/fake-claude-projects/` mirroring `~/.claude/projects/<encoded>/<uuid>.jsonl` structure
- **Setup:** Test setup symlinks fixture dir to `$HOME/.claude/projects` (or sets env var override)
- **Teardown:** Remove symlink
- **Dependencies:** None
- **Used by:** future `test_jsonl_indexer.py` (T34)
- **Assumptions:** session-pilot will gain env override for CLAUDE_PROJECTS_DIRS to enable fixture pointing without polluting real ~/.claude

Sample structure (planned):
```
tests/fixtures/fake-claude-projects/
├── -mnt-d-repos-foo/
│   ├── 11111111-1111-1111-1111-111111111111.jsonl  (10 messages, fresh mtime)
│   └── 22222222-2222-2222-2222-222222222222.jsonl  (5 messages, stale mtime)
├── D--repos-foo/                                    (cross-OS variant of same logical path)
│   └── 33333333-3333-3333-3333-333333333333.jsonl
└── C--Users-stigm--cursor-worktrees-bar/             (Cursor edge case)
    └── 44444444-4444-4444-4444-444444444444.jsonl
```

## Expected encoding variants table (anchor for regression tests)

| Input path | Expected variants (any subset is acceptable, but one MUST match Claude's actual output for the OS scenario) |
|---|---|
| `/mnt/d/repos/foo` | `-mnt-d-repos-foo`, `mnt-d-repos-foo`, `D--repos-foo`, `D-repos-foo` |
| `D:\repos\foo` | `D--repos-foo`, `D-repos-foo`, `-mnt-d-repos-foo`, `mnt-d-repos-foo` |
| `/mnt/d/repos/lm-saas` | `-mnt-d-repos-lm-saas`, `D--repos-lm-saas` (B-1 regression — both required) |
| `C:\Users\stigm\.cursor\worktrees\foo` | `C--Users-stigm--cursor-worktrees-foo` (Cursor edge — currently weak in F-3, see Gap) |
| `\\wsl$\Ubuntu\home\user\foo` (theoretical UNC) | unverified — `--diagnose-livecycle` to discover |

## Dependencies Graph

```
F-1 (encode test cases)  ─── used by ─────► test_encode_path.py (6 tests)
F-2 (lm-saas regression) ─── subset of ──► F-1
F-3 (Cursor pattern)     ─── subset of ──► F-1

F-4 (first-worktree)     ─── used by ─────► test_launch_idempotent.py (5 tests)
F-5 (sp-idem-test)       ─── depends on ──► F-4, Zellij server
F-6 (sp-idem-test-2)     ─── depends on ──► F-4, Zellij server (same shape as F-5)

F-7 (synthetic JSONLs)   ─── planned v0.2 ► future test_jsonl_indexer.py (T34)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | dashboard cold load top-20 <1s | F-4 (real worktrees) | No synthetic 300-row dataset for performance regression |
| @feature2 | /api/claude returns top-5 with last_message | F-4 + real ~/.claude | F-7 not yet created — uses real Claude history (slow, non-deterministic) |
| @feature3 | ETag/304 path | F-4 + real ~/.claude | Same as @feature2 |
| @feature4 | /api/launch resume injection | F-5, F-6 (live sessions) | **B-2: no cleanup leaks zombie Zellij sessions** |
| @feature4 | /api/launch validation rejects | F-4 (path whitelist test) | None — validation tests don't need fixtures |
| @feature5 | /api/message returns N-th + neighbors | (deferred v0.2) | Endpoint not yet implemented |
| @feature6 | /api/git-status | (deferred v0.2) | Endpoint not yet implemented |
| @feature7 | /api/health <5ms | None needed (no input) | None |
| @feature9 | top-20 cold <1s on 45 worktrees | F-4 (user's actual setup) | Need synthetic 300-row dataset for stress test |
| @feature11 | 4-button Action column | F-5 + manual UI | No automated frontend test |
| @feature17 | encoding ALL variants returned | F-1, F-2, F-3 | F-3 weak per stronger-tests review |
| @feature19 | --diagnose-livecycle CLI | (manual run on lm-saas) | No automated test for CLI output format |
| @feature20 | LIVE threshold 300s default | F-1 (env var test) | None — config tested via code review |

## Known fixture issues

### B-2: test_launch_idempotent leaks Zellij sessions

**Symptom**: Running `test_launch_idempotent.py` 10 times creates 20 zombie Zellij sessions (`sp-idempotency-test`, `sp-idempotency-test-2` accumulating).

**Root cause**: F-5 and F-6 fixtures don't have teardown — the integration tests POST to /api/launch which spawns Zellij sessions, but never call `zellij delete-session --force <name>`.

**Mitigation (v0.2 — T26)**: Add `try/finally` cleanup OR pytest fixture с autouse teardown:
```python
@pytest.fixture(autouse=True)
def cleanup_test_sessions():
    yield
    for name in ["sp-idempotency-test", "sp-idempotency-test-2"]:
        subprocess.run([ZELLIJ_BIN, "delete-session", "--force", name],
                       capture_output=True, check=False)
```

**Workaround until then**: manual cleanup `zellij delete-session --force sp-idempotency-test*` between test sessions.

### Weak F-3 (Cursor pattern)

Current assertion `any("Users-stigm" in v for v in variants)` is overly permissive — passes even if encoder produces `Cmd-Users-stigm-x` which would fail real Cursor JSONL match. Per stronger-tests skill review (T26), v0.2 must strengthen to exact equality with documented variant.

## Notes

**Cleanup ordering**: Live Zellij sessions (F-5, F-6) MUST be cleaned up BEFORE removing test directory (since `delete-session --force` requires Zellij socket which lives in `~/.cache/zellij/`). Order:
1. `zellij delete-session --force <name>` (per session)
2. Optional: rm cache dir if test pollution suspected

**Real ~/.claude/projects pollution risk**: integration tests currently read user's real Claude history. Tests don't WRITE there, so pollution risk is low. But test failures could expose private user data in error messages — mitigation v0.2 is to use F-7 synthetic fixtures via env override.

**Performance fixture (synthetic 300-row dataset)**: planned for stress-testing pagination; would auto-generate 300 fake worktree rows with mocked git. Out of scope v0.1; tracked in v0.2 backlog (T34 covers the JSONL part; pagination fixture would be separate task).
