# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Skill `discovery-forms` auto-populates this file during Phase 1. Hook `user-story-form-guard` enforces the form at Write/Edit time.

### User Story 1: One-command worktree creation with pre-installed dev-pomogator (Priority: P1)

As a dev-pomogator maintainer working on multiple features in parallel, I want to create a new worktree+branch with pre-installed dev-pomogator artifacts in one skill invocation, so that I avoid 8+ ERR_MODULE_NOT_FOUND on every Stop event and 3 errors per Bash tool call in orphan worktrees.

**Why:** Currently 4 of 5 sibling worktrees are orphan (no `.dev-pomogator/tools/`). Each manual fix is ~5 min and per-Bash hook spam is hot-path latency (~1.5s burned per Bash call). Skill removes the orphan state at creation time.

**Independent Test:** Invoke skill with slug `test-foo` from main worktree. Verify: sibling `D:/repos/dev-pomogator-test-foo` exists on branch `feat/test-foo` (created atomically via `git worktree add -b feat/test-foo` — verified through `git worktree add --help` usage line), contains `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` (sentinel file), and `~/.dev-pomogator/config.json` `installedExtensions[].projectPaths[]` contains the absolute path of the new worktree. Cleanup with `git worktree remove D:/repos/dev-pomogator-test-foo && git branch -D feat/test-foo` (`-D` forces deletion even if branch has unmerged commits from bootstrap — verified via `git branch -h` semantics: `-d` requires merged, `-D` ignores merge state).

**Acceptance Scenarios:**

Given main worktree at `D:/repos/dev-pomogator` on branch `main`
When user invokes skill `worktree-setup` with slug `test-foo`
Then sibling worktree `D:/repos/dev-pomogator-test-foo` is created on branch `feat/test-foo`
And `.dev-pomogator/tools/` exists in the new worktree
And `~/.dev-pomogator/config.json` `projectPaths` contains the absolute path of the new worktree

Given the worktree from the previous scenario
When any hook fires (Stop, SessionStart, PreToolUse Bash)
Then no `ERR_MODULE_NOT_FOUND` errors appear in hook output

Given user invokes skill from a sibling worktree (CWD != main worktree path)
When skill detects CWD via `git worktree list --porcelain`
Then skill prints a warning identifying current vs main paths and asks via AskUserQuestion: "Continue from main" / "Abort"
And on "Continue from main": skill roots all `git worktree add` and `node bin/cli.js` operations at main worktree (new sibling created relative to main, not relative to current)
And on "Abort": skill exits with no git/installer side effects

---

### User Story 2: Self-heal hint for manually-created orphan worktrees (Priority: P1)

As a dev-pomogator maintainer, I want orphan worktrees (created via raw `git worktree add` without the skill) to be detected automatically on first hook invocation, so that I get a one-time stderr hint with the bootstrap command instead of opaque `ERR_MODULE_NOT_FOUND` spam on every Stop event.

**Why:** The skill covers only deliberate worktree creation. Manual `git worktree add` (which still happens) leaves silent orphan state. Self-heal in `tsx-runner.js` is defence-in-depth — it does not auto-install (that would be too invasive), it only points at the bootstrap command.

**Independent Test:** Run `git worktree add D:/repos/dev-pomogator-manual-test feat/manual-test` without invoking the skill, then start `claude` in the new worktree. On the first hook firing: `~/.dev-pomogator/orphan-worktrees.jsonl` gains exactly one JSON line, and stderr contains exactly one hint line with the absolute bootstrap command. On subsequent hook firings in the same session, no additional stderr hint (deduplication by absolute worktree path).

**Acceptance Scenarios:**

Given an orphan worktree without `.dev-pomogator/tools/`
And no prior entry for this worktree in `~/.dev-pomogator/orphan-worktrees.jsonl`
When `tsx-runner.js` is invoked by any hook with a missing target script
Then `~/.dev-pomogator/orphan-worktrees.jsonl` gains one JSON line with fields `ts`, `worktree_path`, `missing_script`, `hook_event`
And stderr contains one hint line: `[dev-pomogator] Orphan worktree detected. Run: node <abs-path-to-main>/bin/cli.js --claude --all`

Given the same orphan worktree where the hint already appeared in the current session
When another hook fires with a missing target
Then no additional stderr hint is emitted (deduplicated by absolute worktree path within session)
And a new JSONL line is still appended (audit trail intact)

---

### User Story 3: Optional GitHub PR creation at end of skill flow (Priority: P2)

As a dev-pomogator user (any maintainer, on any repository), I want to optionally push the new branch and create a draft GitHub PR as part of the skill workflow, so that my full "branch → worktree → PR" routine is one command. The skill must derive owner/repo via a strict three-layer fallback (env file → agent investigates real sources → ask user) — never hardcode, never fantasize, never re-ask once persisted.

**Why:** Original ask included PR creation. dev-pomogator ships via `npx` to third parties, so no hardcoded identifiers. User explicitly demanded: env file first, agent investigates with verified sources second, ask only if both fail. Persist outcome so next invocation doesn't re-ask.

**Independent Test:** Invoke skill three times on different machines/repos:
- **Run 1** (fresh, env file absent): agent investigates via `git remote` + `gh repo view` + `gh api user`, validates candidate via `gh repo view {owner}/{repo}` → 200 OK, writes to `~/.dev-pomogator/worktree-setup.env`, proceeds.
- **Run 2** (same machine, env file populated): skill reads env, skips investigation, proceeds — no AskUserQuestion fires.
- **Run 3** (different machine, no remote, investigation ambiguous): skill asks via AskUserQuestion with suggested default derived from investigation output, persists answer to env on success.

**Acceptance Scenarios:**

Given env file `~/.dev-pomogator/worktree-setup.env` does not exist on first `--pr=draft` invocation
When user invokes skill with `--pr=draft`
Then skill creates the env file with a documented stub template before resolution begins
And the stub contains commented section headers, empty `WT_GH_OWNER=`, `WT_GH_REPO=`, `WT_GH_PROTOCOL=`, `WT_GH_HOST=` lines, and inline comments documenting each key's source command
And after Layer 2 or Layer 3 successful resolution, skill fills in the empty values via Edit (preserving comments)
And resolution continues normally as in subsequent scenarios

Given env file `~/.dev-pomogator/worktree-setup.env` contains valid `WT_GH_OWNER=...` and `WT_GH_REPO=...`
When user invokes skill with `--pr=draft`
Then skill reads env values, validates via `gh repo view {WT_GH_OWNER}/{WT_GH_REPO}` returns 200
And no investigation is performed and no AskUserQuestion fires
And branch is pushed to the resolved remote, draft PR is created

Given env file is missing or `WT_GH_OWNER`/`WT_GH_REPO` are empty
And `git remote get-url origin` returns a valid GitHub URL
When user invokes skill with `--pr=draft`
Then skill parses owner/repo from the remote URL
And validates via `gh repo view {owner}/{repo}` returns 200
And writes the resolved values to `~/.dev-pomogator/worktree-setup.env` for future invocations
And proceeds with push + PR creation
And no AskUserQuestion fires

Given env file is missing and no origin remote
And `gh repo view --json url` (no args) succeeds via `.git/config` auto-detect
When user invokes skill with `--pr=draft`
Then skill uses owner/repo from `gh repo view` JSON output
And validates same way + writes to env + proceeds
And no AskUserQuestion fires

Given env file missing AND investigation cannot derive owner/repo (no remote, no gh auto-detect, multiple plausible candidates conflict)
When user invokes skill with `--pr=draft`
Then skill asks via AskUserQuestion: "GitHub repo for this worktree? (format: owner/repo)"
And the AskUserQuestion suggested default is populated from investigation output: `{gh api user --jq .login}/{path.basename(main_worktree_cwd)}`
And once user answers, skill validates via `gh repo view` and writes to env on success
And subsequent invocations on the same machine read env and never re-ask

Given main worktree without the `--pr` flag
When user invokes skill with slug `mything`
Then worktree creation + bootstrap complete as in US-1
And no push/PR/env writes are attempted (skill never touches git remote config or env file without `--pr`)

---

### User Story 4: Doctor verifies green state immediately after bootstrap (Priority: P2)

As a dev-pomogator maintainer, I want a quick green-light verification at the end of skill workflow, so that I'm confident the new worktree won't break before I switch into it.

**Why:** Catches partial install failures early. Full `/pomogator-doctor` is heavyweight (17 checks); a focused `worktree-doctor.cjs` (5–7 checks, ~200ms) covers worktree-specific invariants without slowdown.

**Independent Test:** After skill invocation, the skill's stdout contains either a `Doctor: 🟢 OK` line OR a specific failure line (`🔴 tools_missing`, `🔴 not_registered`, `🔴 partial_install`). Exit code of skill matches doctor's status.

**Acceptance Scenarios:**

Given skill completed bootstrap step successfully
When skill invokes `worktree-doctor.cjs` in the new worktree CWD
Then doctor exits with code 0 and status `OK`
And skill stdout contains a `Doctor: 🟢 OK` line

Given bootstrap step failed midway (e.g., permission denied on `.dev-pomogator/`)
When skill invokes `worktree-doctor.cjs`
Then doctor exits with a non-zero code
And skill stdout contains a `Doctor: 🔴 {reason}` line
And skill stdout contains a "Bootstrap incomplete — retry with: …" hint with the exact bootstrap command

---

### User Story 5: session-pilot UI shows orphan worktrees with one-click bootstrap (Priority: P2)

As a dev-pomogator maintainer using session-pilot dashboard, I want orphan worktrees to be visually flagged in the worktree table (red glyph in a new "bootstrap" column) with a one-click "doctor + bootstrap" action button, so that I can fix any orphan worktree without leaving the dashboard or remembering the bootstrap command.

**Why:** Skill (US-1) covers new worktree creation, self-heal hint (US-2) covers next-hook detection. But existing orphan worktrees (4 of 5 on this machine right now) only surface when claude is launched in them. Session-pilot already enumerates worktrees for the dashboard — adding orphan detection there is the natural surface for batch visibility + remediation.

**Independent Test:** Open session-pilot dashboard at http://localhost:8083. Verify: each row shows a "bootstrap" column with 🟢 OK for healthy worktrees and 🔴 ORPHAN for those without `.dev-pomogator/tools/`. Click the 🔴 row's "doctor+bootstrap" button → POST request to `/api/bootstrap` → server spawns `node bin/cli.js --claude --all` in worktree CWD via existing `terminal_launcher.py` pattern → after completion, refresh of row shows 🟢 OK.

**Acceptance Scenarios:**

Given session-pilot indexer scans worktrees in `~/.dev-pomogator/config.json` + git worktree list
When indexer encounters a worktree path
Then it adds a `tools_present` boolean field by calling `worktree-doctor.cjs --quick` (which only runs Check #3 from doctor — `.dev-pomogator/tools/` existence) and parsing exit code
And the field is added to the API response under `/api/claude` next to existing columns

Given a worktree row in the dashboard with `tools_present=false`
When user clicks the "doctor+bootstrap" button (new column action)
Then session-pilot POSTs to `/api/bootstrap` with `{worktree_path: "<abs>"}`
And server spawns a new Windows Terminal window running `node <main-bin>/cli.js --claude --all` with cwd set to the worktree path (using existing `terminal_launcher.spawn_terminal` pattern)
And the dashboard polls `/api/claude` on a 5s interval and refreshes the row when `tools_present` flips to true
