# Use Cases

## UC-1: Happy path — create worktree+branch+bootstrap from main

Maintainer invokes skill from main worktree (`D:/repos/dev-pomogator`) with a slug. Skill creates sibling worktree on `feat/{slug}` branch, runs full installer, runs doctor, prints final summary with paths and next-step command for opening Claude in new CWD.

Linked stories: US-1, US-4.

- User: `создай worktree для context-menu-fix`
- Skill validates slug (kebab-case, length ≤ 50), reserves path `D:/repos/dev-pomogator-context-menu-fix`
- Skill pre-flight: `git show-ref --verify --quiet refs/heads/feat/context-menu-fix` → if exit 0 (branch exists), branch reuse path (UC-4); if exit non-0 (branch absent), proceed with atomic create
- Skill runs `git worktree add -b feat/context-menu-fix D:/repos/dev-pomogator-context-menu-fix` (atomic — creates new local branch off HEAD AND worktree in one git call; verified via `git worktree add --help` usage `[(-b|-B) <new-branch>] <path>`)
- Skill runs `node <main-bin>/cli.js --claude --all` inside the new worktree (cwd = new worktree path; `<main-bin>` resolves to the absolute path of the currently-executing skill's main worktree's bin dir)
- Skill runs `~/.dev-pomogator/scripts/worktree-doctor.cjs` in new worktree
- Skill prints summary: new worktree path, branch, doctor verdict, suggested launch command (`wt -d D:/repos/dev-pomogator-context-menu-fix claude` for user to copy)
- Result: new worktree is green-state, ready for use

## UC-2: Orphan worktree self-heal (skill not used)

Maintainer creates worktree manually via raw `git worktree add` and starts `claude` in it. First hook firing detects missing `.dev-pomogator/tools/`, logs to JSONL, prints one-time stderr hint.

Linked stories: US-2.

- User: `git worktree add D:/repos/dev-pomogator-quickfix feat/quickfix && cd D:/repos/dev-pomogator-quickfix && claude`
- Stop hook fires after first prompt → tsx-runner.js invoked with target `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts`
- tsx-runner detects missing target → checks `~/.dev-pomogator/orphan-worktrees.jsonl` for prior entry of this absolute worktree path within session
- No prior entry → append one JSONL line + emit one stderr hint with bootstrap command
- Subsequent hooks in the same session → no additional hints, only JSONL appends
- Result: maintainer sees actionable hint once, can manually run bootstrap when convenient

## UC-3: Skill invoked from inside a sibling worktree (not main) — warn + offer continue

Maintainer is already inside a sibling worktree (orphan or healthy — irrelevant) and invokes the skill. Skill detects current CWD is not the main repo, warns explicitly, and offers to continue at user's discretion (using main worktree's bin/cli.js for bootstrap regardless of invocation CWD).

Linked stories: US-1 (edge case).

- User (cwd = `D:/repos/dev-pomogator-quickfix`): `создай worktree для another-feature`
- Skill runs `git worktree list --porcelain` → derives main worktree path (first line: `worktree <path>` is the primary)
- Skill compares `process.cwd()` to main worktree path → not equal → warn path active
- Skill prints warning: "⚠️ You are inside sibling worktree `<current>`, not main `<main>`. Continuing will create the new worktree as a sibling of main (not of current), and bootstrap will use main's `bin/cli.js`. Proceed?"
- Skill uses AskUserQuestion with options: "Continue from main" / "Abort and switch to main first"
- If user chooses "Continue from main":
  - Skill performs UC-1 steps but uses `git -C <main> worktree add ...` and `node <main>/bin/cli.js --claude --all` (operations rooted at main, not current CWD)
  - New sibling created relative to main (`D:/repos/dev-pomogator-another-feature`), not relative to current (`D:/repos/dev-pomogator-quickfix-another-feature`)
- If user chooses "Abort":
  - Skill exits with hint: "Run `cd <main> && claude` then re-invoke. Or stay here and re-invoke — skill will offer the same prompt."
  - No git operations performed
- Result: user gets explicit notification + control, never silent surprise; chained worktree creation is impossible because operations always root at main regardless of invocation CWD

## UC-4: Idempotent re-run on existing worktree path

Maintainer re-invokes skill with a slug whose worktree already exists. Skill detects existence and offers to re-bootstrap (refresh tools + re-register projectPath in config) instead of failing.

Linked stories: US-1 (idempotency).

- User: `создай worktree для context-menu-fix` (already exists from UC-1)
- Skill runs `git worktree list` → finds existing entry for path
- Skill asks: "Worktree already exists. Re-bootstrap (refresh tools + re-register) or abort?" via AskUserQuestion
- If re-bootstrap → skip `git worktree add`, run installer + doctor only
- If abort → skill exits with code 0 and message "No changes made"
- Result: safe re-invocation without surprises

## UC-5: PR creation flag — env-first → investigate → ask (any repo, any user)

Maintainer invokes skill with `--pr=draft`. Skill resolves owner/repo via strict three-layer fallback. Result persists to env file so subsequent invocations skip investigation. Skill performs UC-1 + remote setup (if needed) + push + draft PR creation.

Linked stories: US-3.

Resolution order (skill tries in this exact order, stops at first success):

### Layer 0 — Ensure env file exists (always, idempotent)

Before any resolution begins on `--pr=draft` invocation:

- Skill checks `fs.existsSync('~/.dev-pomogator/worktree-setup.env')`
- If absent → skill creates the file with this documented stub template:

```
# worktree-setup config — auto-created by skill, safe to edit manually.
# Each key documents its canonical investigation source — agent uses those
# commands when a value is empty (Layer 2). Persist your values here to skip
# investigation entirely (Layer 1).

# WT_GH_OWNER — github account/org. Source: `gh api user --jq .login` or parsed
# from `git remote get-url origin`.
WT_GH_OWNER=

# WT_GH_REPO — github repository name. Source: `path.basename(main_worktree_cwd)`
# or parsed from `git remote get-url origin`.
WT_GH_REPO=

# WT_GH_PROTOCOL — https or ssh. Source: `gh auth status --hostname github.com`
# field "Git operations protocol". Default: https.
WT_GH_PROTOCOL=

# WT_GH_HOST — github hostname (for github enterprise users). Default: github.com.
WT_GH_HOST=
```

- If present (regardless of contents) → skill does NOT overwrite; proceeds to Layer 1
- File creation is idempotent: re-running skill never replaces existing content, only fills empty values after successful resolution

### Layer 1 — Read env file (no investigation, no asking)

- Skill reads `~/.dev-pomogator/worktree-setup.env` if it exists
- Required keys: `WT_GH_OWNER`, `WT_GH_REPO`. Optional: `WT_GH_PROTOCOL` (https|ssh, default https), `WT_GH_HOST` (default github.com)
- If both `WT_GH_OWNER` and `WT_GH_REPO` are present and non-empty → skill validates via `gh repo view ${WT_GH_OWNER}/${WT_GH_REPO}` returns 200 → proceeds. Skip Layer 2 and 3.
- If env values stale (gh repo view returns 404) → log warning, fall through to Layer 2 (env re-population on next valid resolution)

### Layer 2 — Agent investigates real sources (verify, don't fantasize)

For each candidate value, skill performs a verifiable command and uses its output:

1. **`git remote get-url origin`** — if returns valid GitHub URL → parse owner/repo from URL → validate via `gh repo view` → if 200, use
2. **`gh repo view --json url,sshUrl,owner,name`** (no positional arg — gh auto-detects from .git/config + upstream) — if succeeds → use `owner.login` and `name` → use (already validated by gh's existence)
3. **`gh api user --jq .login`** + **`path.basename(main_worktree_cwd)`** — combine into candidate `{login}/{basename}` → validate via `gh repo view {candidate}` → if 200, use

Investigation rules:
- Each candidate MUST be validated via `gh repo view {owner}/{repo}` before being accepted (never trust a derivation blindly)
- If multiple candidates exist and they agree → use the one from highest-priority source above
- If multiple candidates exist and they disagree (e.g., `git remote` says `forkA/repo`, `gh api user` says `forkB/repo`) → fall through to Layer 3 (agent cannot disambiguate without user input)
- If no candidate validates → fall through to Layer 3

On success: skill writes resolved `WT_GH_OWNER`/`WT_GH_REPO`/`WT_GH_PROTOCOL` to `~/.dev-pomogator/worktree-setup.env` for next invocation.

### Layer 3 — AskUserQuestion (last resort, with derived default)

Reached only when Layers 1 & 2 both failed. AskUserQuestion format:

- Question: "GitHub repo for this worktree? (format: owner/repo)"
- Suggested default: derived from investigation output — `{gh api user --jq .login}/{path.basename(main_worktree_cwd)}` — even if it didn't validate, it's still the best guess to show user
- After user answers, skill validates via `gh repo view {user_answer}` → if 200, persist to env file and proceed; if 404 → refuse with hint "Repo not found. Create via `gh repo create {user_answer}` first, then re-run with --pr=draft"

### Remote write + push + PR

After owner/repo resolved (from any layer):

- If no `origin` remote in worktree: `git -C <new-worktree> remote add origin <https-or-ssh-URL per WT_GH_PROTOCOL>`
- `git -C <new-worktree> push -u origin feat/<slug>`
- `gh pr create --draft --repo {owner}/{repo} --title "feat(<slug>): WIP" --body "Auto-created by worktree-setup skill"`
- Print PR URL in final summary

Result for all three layers: branch + worktree + draft PR. No re-asking on subsequent invocations. No hardcoded identifiers anywhere in code or docs.

## UC-7: session-pilot UI shows orphan worktrees with one-click bootstrap

Maintainer opens session-pilot dashboard. Indexer has detected orphan worktrees, UI shows them with 🔴 glyph and "doctor+bootstrap" action button. Click triggers server-side spawn of installer in new terminal window.

Linked stories: US-5.

- User opens `http://localhost:8083` (session-pilot dashboard already running)
- Server indexer per-worktree: invoke `worktree-doctor.cjs --quick` (cheap subset of checks), parse exit code into `tools_present` boolean
- API response `/api/claude` includes new field `tools_present` per row
- Frontend Tabulator renders new column "bootstrap" with conditional glyph: 🟢 if `tools_present=true`, 🔴 if `false`
- User clicks 🔴 row's action button → JS calls `POST /api/bootstrap {worktree_path: "<abs>"}`
- Server validates worktree_path against indexer whitelist (existing security pattern from handlers.py:62)
- Server spawns Windows Terminal window via existing `terminal_launcher.py:spawn_terminal` pattern, running `node <main-bin>/cli.js --claude --all` with cwd=worktree path
- Frontend polls `/api/claude` on 5s SWR interval (existing pattern) — row glyph flips to 🟢 when bootstrap completes
- Result: orphan worktree fixed without user remembering bootstrap command or leaving the dashboard

## UC-6: Bootstrap fails midway — doctor reports specific failure

Installer fails partway (permission denied, disk full, broken `extensions/`). Doctor reports specific failure code, skill prints retry command without claiming success.

Linked stories: US-1 (failure path), US-4.

- User: `создай worktree для broken-test`
- Worktree created OK
- `node bin/cli.js --claude --all` fails with `EACCES` on `.dev-pomogator/`
- Doctor runs → returns `status=PARTIAL_INSTALL`, exit code 2
- Skill prints: "Bootstrap incomplete — `Doctor: 🔴 partial_install`. Retry with: `cd D:/repos/dev-pomogator-broken-test && node D:/repos/dev-pomogator/bin/cli.js --claude --all`"
- Skill does NOT auto-delete the half-created worktree (preserves user's ability to debug)
- Result: partial state preserved, retry command surfaced, user can fix root cause
