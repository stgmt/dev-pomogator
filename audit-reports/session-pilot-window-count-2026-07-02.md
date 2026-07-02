# session-pilot: "6 Claude windows open, dashboard shows only 5"

**Date:** 2026-07-02 · **Reporter:** owner (screenshot: 5 `● LIVE` rows, taskbar: 6 Claude windows)

> **Verdict.** The dashboard is right that only **5 sessions wrote a JSONL in the last 5 min** — but the 6th window IS open, just idle. session-pilot has a dedicated signal for exactly this (FR-25 "open window" detection via running `claude.exe`), and it is **completely dead** here: **two** defects chain together so the idle-but-open window renders as an anonymous "idle" row, indistinguishable from a long-dead session. Root: everything is running in **orphan mode** (no git repos discovered), and the orphan path-decoder **mangles literal-dash folder names** (`E:/repos/lm-saas` → the non-existent `E:/repos/lm/saas`), which breaks the process→row match that would light up the "Open" badge.

---

## 1. Ground truth (proofs)

**Running processes** — `process_scanner.scan_claude_processes()` (reads each `claude.exe` real cwd via PEB):

```
E:/repos/lm-saas       : [50952, 59264, 42984, 59712, 63212]   # 5 windows
E:/repos/dev-pomogator : [58048]                                 # 1 window (this session)
=> 6 claude.exe processes = 6 windows  (matches the taskbar)
```

**Raw filesystem, JSONLs modified < 300 s** (the LIVE definition), with the dashboard's own headless detector:

```
age=  5s headless=True   claude-mem-observer-sessions   (hidden — SDK observer)
age=  6s headless=True   claude-mem-observer-sessions   (hidden — SDK observer)
age=  9s headless=False  E--repos-dev-pomogator  b9796609  <- this session
age= 13s headless=False  E--repos-lm-saas        d487c28b
age=104s headless=False  E--repos-lm-saas        024d0313
age=140s headless=False  E--repos-lm-saas        ef3cc9c5
age=149s headless=True   claude-mem-observer-sessions   (hidden — SDK observer)
age=173s headless=False  E--repos-lm-saas        25af22b9
```

→ **5 non-hidden LIVE sessions** (1 dev-pomogator + **4** lm-saas). The **5th lm-saas window is open but idle** — its newest JSONL (`f3efdd47`) is ~547 s old (>300 s), so it is not LIVE-by-mtime. The dashboard's 5 LIVE == the filesystem's 5 LIVE (they agree).

**Path existence** (the smoking gun):

```
E:/repos/lm-saas   -> EXISTS   (real folder; the dash is LITERAL)
E:/repos/lm/saas   -> MISSING  (the decoder invented it: every dash -> slash)
```

**FR-25 "open" badge across every row of those cwds** (`/api/index`, server-side):

```
E:/repos/dev/pomogator : window_open_rows=0  closed=13  live=1
E:/repos/lm/saas       : window_open_rows=0  closed=17  live=4
```

`claude_window_open` is **False for 100% of rows**, even though `process_scanner` found 6 live PIDs. The attribution step matches `proc_map` keys (real cwd `E:/repos/lm-saas`) against each row's `worktree_path` (decoded `E:/repos/lm/saas`) → **never matches** → no badge.

---

## 2. Hypotheses & verdicts

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| H1 | Headless filter over-hides an interactive session | **REJECTED** | All 6 running procs are `headless=False`; the only hidden LIVE JSONLs are 3× `claude-mem-observer-sessions` (genuine SDK observers), not user windows. |
| H2 | LIVE threshold (300 s) too short → a real window looks idle | **TRUE but by-design** | The 6th window's JSONL is ~547 s old — Claude batches writes, so an idle-but-open window legitimately isn't "LIVE". This is *why* FR-25 exists; the bug is that FR-25 is broken (H4), not the threshold. |
| H3 | Frontend 5 s cache / client staleness hides the row | **REJECTED** | The **server-side** `/api/index` itself returns `claude_window_open=0` for all rows — the data is wrong before the frontend ever sees it. |
| H4 | Orphan decoder mangles literal-dash paths → process→row match fails | **CONFIRMED (root)** | `E:/repos/lm-saas` (real) decodes to `E:/repos/lm/saas` (fake); `proc_map["E:/repos/lm-saas"] ≠ row["E:/repos/lm/saas"]` → `window_open` never set. `_decode_claude_dir_name` turns *every* dash into `/`. |
| H5 | Everything is in orphan mode because repos aren't discovered | **CONFIRMED (enabler)** | `discover_repos()` scans only `~/repos`, `/mnt/d/repos`, `/mnt/c/repos` (indexer.py:155) and `REPOS` is unset — the user's repos live at `E:/repos`, so **zero** git repos are found → all 57 rows are `is_orphan=True` with fabricated `repo/branch` and mangled paths. |

**Net:** H4 is the direct cause of the reported "5 vs 6" (the idle-open window gets no "Open" badge). H5 is the enabler (orphan mode) and separately explains why *every* row shows a non-existent path and empty repo/branch.

---

## 3. Fix

**Fix 1 — orphan process match by forward-encoding (primary; kills the lossy decode).**
In `build_session_index` Source B, do not match the running-process cwd against the *decoded* path. Instead build a reverse index `encode_path_for_claude(procCwd) → procCwd` and match the orphan dir **name** directly (exact — the encoder is the single source of truth). On a match, set the row's `worktree_path` to the **real** cwd (fixes the fabricated path) so the existing PID-attribution then lights up `claude_window_open`.

**Fix 2 — infer scan roots from running sessions (higher-leverage; fixes closed rows too).**
Feed `discover_repos()` the parent dirs of the running-process cwds (`E:/repos`). The user's repos then resolve as **Source A** git worktrees with correct paths + repo/branch, so *all* their sessions (open and closed) display correctly — not just the ones with a live process. Config alternative for the user: `REPOS=E:/repos`.

**Honest framing (not a false "all green").** After the fix the 6th window shows as **"Open"**, not "● LIVE" — it is open but hasn't written in >5 min, which is correct 3-state behavior (LIVE > Open > idle). Also note the PID→session link is a **newest-K heuristic** (FR-25 cannot know which PID writes which JSONL); it tags the K newest rows of a cwd, it does not prove `f3efdd47` is that exact PID.

---

## 4. Verification plan

- Restart the server (running instance has old code + 5 s caches).
- `/api/index`: assert `claude_window_open=True` on the idle lm-saas row + `worktree_path` = real `E:/repos/lm-saas`.
- Regression test in an existing file (`test_indexer_invariants.py`): proc_map with a literal-dash cwd + orphan dir encoding to it → the newest row gets `window_open=True` and the corrected path; re-run the "each worktree_path once" invariant (correcting the path changes the dedup key).
- Visual: claude-in-chrome screenshot of the live dashboard → CONFIRMED/DENIED that 5 LIVE + 1 Open (=6) now render.

---

## 5. Verified (post-fix)

Server restarted with the new code; `/api/index` (server-side, no cache lag):

```
LIVE: 2   OPEN(idle-but-open): 4   => active windows shown: 6   (matches 6 taskbar windows)
  LIVE age=8     repo=dev-pomogator  orphan=False  path=E:/repos/dev-pomogator
  LIVE age=13    repo=lm-saas        orphan=False  path=E:/repos/lm-saas
  OPEN age=350   repo=lm-saas        orphan=False  path=E:/repos/lm-saas
  OPEN age=665   repo=lm-saas        orphan=False  path=E:/repos/lm-saas
  OPEN age=757   repo=lm-saas        orphan=False  path=E:/repos/lm-saas
  OPEN age=1434  repo=lm-saas        orphan=False  path=E:/repos/lm-saas
```

All **6 windows now appear** (2 LIVE + 4 OPEN — the idle-but-open ones correctly render as **OPEN**, not LIVE, per the honest 3-state framing). Bonus wins from Fix 2: `orphan=False`, `repo` column populated, and paths corrected to the real `E:/repos/lm-saas` (the fabricated `E:/repos/lm/saas` is gone).

**Tests:** `test_indexer_invariants.py` 7/7 PASS incl. new **IDX_INV_07** (asserts the corrected path + `window_open=True` for a literal-dash orphan cwd with a live process) — and it *bites* (fails pre-fix, since the decoder produced `E:/repos/lm/saas`). `test_new_endpoints` 11/11, `test_jsonl_indexer` 12/12, `test_messages_for_session` 7/7 — no regression from the `discover_repos` signature change. Wired `test_indexer_invariants` into the CI run list.

**Not done:** pixel-level screenshot of the rendered dashboard — the claude-in-chrome extension is disconnected (tried; got "Browser extension is not connected"), and this repo's `session-pilot/mcp-chrome-only` rule forbids PowerShell desktop captures. The rendered result is inferred from the server-side data (6 active rows) + the frontend's 3-state renderer (`claude_window_open` → priority-1 "Open", frontend.py:501-504), not directly observed.

## 6. Cold-state durability (new-PC / all-windows-closed)

Fix 2 infers repo roots from *running* sessions — so on a cold machine or after all windows close, a repo outside the default scan folders would lose its correct path until a window is reopened there. Closed with a tiny **persisted memory**: the parent of every discovered repo is remembered in `<state>/repo-roots.json` (atomic write, fail-open) and re-fed to `discover_repos` on every build. Verified live: `["E:/repos"]` is written after one build. So once the dashboard has *ever* seen a session in a repo, it keeps resolving that repo's whole history correctly — even with zero windows open. On a brand-new PC the file self-populates the first time any Claude window is opened (no config; the dashboard itself autostarts via the plugin hook, PR #82). Tests: IDX_INV_08 (roundtrip + stale-root filtering), IDX_INV_09 (cold build finds a repo via persisted memory).
