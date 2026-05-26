# Functional Requirements (FR)

## FR-1: Atomic worktree+branch creation from main

Skill SHALL create a new git worktree at a sibling path `<main-parent>/<main-basename>-<slug>` on a new local branch `feat/<slug>` via a single `git worktree add -b feat/<slug> <path>` invocation (atomic — branch and worktree created together off current HEAD of main). Slug validation: kebab-case, length 1–50, regex `^[a-z][a-z0-9-]*[a-z0-9]$`. Pre-flight: if branch `feat/<slug>` already exists (verified via `git show-ref --verify --quiet refs/heads/feat/<slug>` exit 0), skill SHALL offer reuse path via UC-4 idempotency flow instead of failing. Additionally, skill SHALL pre-flight the target DIRECTORY: if `<main-parent>/<main-basename>-<slug>` already exists on disk AND is NOT a registered git worktree (not present in `git worktree list --porcelain`), skill SHALL refuse with error `Target path <path> already exists and is not a worktree — remove it or choose a different slug` and exit code 2, rather than letting `git worktree add` fail with an opaque message. An existing path that IS a registered worktree routes to the UC-4 reuse flow.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Cases:** [UC-1](USE_CASES.md#uc-1-happy-path), [UC-3](USE_CASES.md#uc-3-skill-invoked-from-inside-a-sibling-worktree-not-main--warn--offer-continue), [UC-4](USE_CASES.md#uc-4-idempotent-re-run-on-existing-worktree-path)
**User Stories:** US-1

## FR-2: Full installer bootstrap with global config registration

After worktree creation, skill SHALL invoke `node <main>/bin/cli.js --claude --all` with cwd set to the new worktree path. `<main>` MUST be resolved at runtime (never hardcoded) — derived from `git worktree list --porcelain` first entry. After installer completes, skill SHALL verify that `~/.dev-pomogator/config.json` `installedExtensions[].projectPaths[]` contains the absolute path of the new worktree (proof that registration occurred). If verification fails, skill SHALL print "Bootstrap incomplete — installer did not register projectPath" with the exact retry command.

The installer MUST target the NEW worktree, not an ancestor repository. `installClaude()` resolves its target via `findRepoRoot()` (`src/utils/repo.ts:13-36`), which returns the TOPMOST git root walking up the tree (comment: "install into the outermost project"). For a sibling worktree (`<main-parent>/<main-basename>-<slug>`) whose parent is not itself a git repo, this resolves to the worktree correctly; but if the worktree lands nested under another git repository, `findRepoRoot()` would resolve to that ancestor and the installer would populate the wrong tree. Therefore skill SHALL verify the registered projectPath equals the new worktree path exactly; IF the registered path is an ANCESTOR of (or otherwise not equal to) the worktree, skill SHALL refuse with `Installer resolved to <resolved-root>, not the worktree <worktree-path> — worktree is nested under another git repo; create it as a sibling of main` rather than silently bootstrapping the wrong root.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path), [UC-6](USE_CASES.md#uc-6-bootstrap-fails-midway--doctor-reports-specific-failure)
**User Stories:** US-1

## FR-3: Self-heal hint for orphan worktrees via tsx-runner.js

On any hook invocation in a worktree where target script does not exist (`fs.existsSync(<resolved-script-path>)` false AND target starts with `.dev-pomogator/`), `tsx-runner.js` SHALL append exactly one JSON line to `~/.dev-pomogator/orphan-worktrees.jsonl` with fields `{ts: ISO8601, worktree_path: abs, missing_script: rel, hook_event: str, session_id: str-or-null}`, AND emit exactly one stderr hint line per session per worktree. The check inserts AFTER `resolveScriptPath()` (current source line 107) and BEFORE strategy iteration — if check fires, runner exits 0 (silent no-op for hook). Deduplication key: `(worktree_path, session_id)` derived from env `CLAUDE_SESSION_ID` (fallback: PID of parent claude process). Subsequent hook firings in the same session for the same worktree SHALL still append JSONL (audit trail) but SHALL NOT repeat the stderr hint.

Note: `tsx-runner-bootstrap.cjs` is a ~60-line thin loader that only `require`s `tsx-runner.js`; the strategy fallback (Node 22+ native, local tsx, npx, etc.) and `resolveScriptPath` live in `tsx-runner.js` (verified via Read of `~/.dev-pomogator/scripts/tsx-runner.js` line 85–107, 359, 503). Self-heal belongs in the script-resolution layer, not the loader.

Hint format: `[dev-pomogator] Orphan worktree detected at <worktree_path>. Bootstrap with: node <abs-path-to-living-main>/bin/cli.js --claude --all`. Living main resolved by iterating `~/.dev-pomogator/config.json` `installedExtensions[].projectPaths[]` and selecting first where `fs.existsSync(<path>/bin/cli.js)`. If none found, hint omits the bootstrap command and instead says: "No living dev-pomogator main install found in registered projectPaths. Re-install via your package manager first."

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-2](USE_CASES.md#uc-2-orphan-worktree-self-heal-skill-not-used)
**User Stories:** US-2

## FR-4: PR creation via three-layer config resolution

When skill is invoked with `--pr=draft` flag, skill SHALL resolve `WT_GH_OWNER` and `WT_GH_REPO` through this strict order, stopping at first success:

1. **Layer 0:** ensure `~/.dev-pomogator/worktree-setup.env` exists; if absent, create with documented stub template (key=value lines with `=` empty, inline comments naming investigation source per key)
2. **Layer 1:** read env file; if `WT_GH_OWNER` and `WT_GH_REPO` both non-empty AND `gh repo view ${WT_GH_OWNER}/${WT_GH_REPO}` exits 0 → use, skip Layer 2 and 3
3. **Layer 2:** agent investigates real sources in order — (a) `git remote get-url origin` parse, (b) `gh repo view --json url,owner,name` (no positional), (c) `gh api user --jq .login` + `path.basename(<main>)` combined; each candidate MUST validate via `gh repo view {candidate}` exit 0 before being accepted; multiple disagreeing candidates → fall through to Layer 3
4. **Layer 3:** AskUserQuestion with suggested default `{gh api user .login}/{path.basename(<main>)}`; validate user input via `gh repo view`; on success persist to env, on 404 refuse with hint to run `gh repo create`

After successful resolution, skill SHALL: `git -C <new-worktree> remote add origin <url>` (only if origin missing); `git -C <new-worktree> push -u origin feat/<slug>`; `gh pr create --draft --repo ${WT_GH_OWNER}/${WT_GH_REPO} --title "feat(<slug>): WIP" --body "Auto-created by worktree-setup skill"`. Skill SHALL print the resulting PR URL.

Without `--pr` flag, skill SHALL NOT touch env file, remote config, or invoke any `gh`/`git push` commands.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-5](USE_CASES.md#uc-5-pr-creation-flag--env-first--investigate--ask-any-repo-any-user)
**User Stories:** US-3

## FR-5: gh authentication pre-flight check

When skill is invoked with `--pr=draft`, skill SHALL invoke `gh auth status` BEFORE `git worktree add`. If exit code is non-zero, skill SHALL refuse with hint "Run `gh auth login` first. Skill will not create worktree until gh is authenticated." and exit cleanly without any git/installer side effects. This pre-flight ordering prevents leaving a half-created worktree if gh is misconfigured.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-5](USE_CASES.md#uc-5-pr-creation-flag--env-first--investigate--ask-any-repo-any-user)
**User Stories:** US-3

## FR-6: worktree-doctor.cjs standalone diagnostic

Skill SHALL install `worktree-doctor.cjs` to `~/.dev-pomogator/scripts/` (managed by installer with SHA-256 hash tracking in global config). Doctor MUST be standalone (zero dependencies outside Node stdlib + `fs-extra` if available; safe fallback to fs/promises). Doctor checks (exit code → status semantics):

| Exit | Status | Meaning |
|------|--------|---------|
| 0 | OK | All checks passed in CWD |
| 1 | TOOLS_MISSING / NOT_REGISTERED | `.dev-pomogator/tools/` absent OR CWD not in global `projectPaths[]` |
| 2 | PARTIAL_INSTALL | Some hooks referenced in `.claude/settings.json` resolve to missing tools (random sample of 3) |
| 3 | NOT_APPLICABLE | Not a git repo, or `package.json` lacks `"name":"dev-pomogator"` (skill is a no-op outside dev-pomogator repos) |

Doctor SHALL support `--quick` flag: only Check #3 (tools dir) + Check #6 (is dev-pomogator repo); used by session-pilot integration to avoid >50ms per row. Output: plain-text `key=value` lines + final `status=OK|TOOLS_MISSING|...` line. Skill invokes doctor after FR-2 bootstrap completes; prints `Doctor: 🟢 OK` or `Doctor: 🔴 <status>` line.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path), [UC-6](USE_CASES.md#uc-6-bootstrap-fails-midway--doctor-reports-specific-failure)
**User Stories:** US-4, US-5 (quick mode)

## FR-7: session-pilot integration contract

This spec defines the integration contract; **implementation of session-pilot-side changes lives in the session-pilot worktree** (branch `feat/session-pilot`, version bump 0.3.0 → 0.4.0). Contract:

1. session-pilot indexer SHALL invoke `~/.dev-pomogator/scripts/worktree-doctor.cjs --quick` for each worktree it discovers, parsing exit code into a boolean `tools_present` field. Per-call budget: <50ms (doctor `--quick` mode designed for this).
2. session-pilot API response at `GET /api/claude` SHALL include `tools_present: boolean` per row.
3. session-pilot SHALL expose new endpoint `POST /api/bootstrap` accepting JSON `{worktree_path: string}`. Server SHALL validate `worktree_path` against indexer whitelist (reuse existing security pattern in `handlers.py` for `/api/launch`). On valid request: server spawns a new Windows Terminal window via existing `terminal_launcher.py` pattern, running `node <main>/bin/cli.js --claude --all` with cwd set to `worktree_path`.
4. session-pilot frontend SHALL render a "bootstrap" column in the worktree dashboard with conditional glyph (🟢 if `tools_present=true`, 🔴 otherwise) and a click handler POSTing to `/api/bootstrap`. Dashboard SHALL refresh affected row via existing 5-second SWR poll cycle.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-7](USE_CASES.md#uc-7-session-pilot-ui-shows-orphan-worktrees-with-one-click-bootstrap)
**User Stories:** US-5

## FR-8: Invocation from sibling worktree — warn + offer continue

When skill detects current CWD is not the main worktree path (compared via `git worktree list --porcelain` first entry), skill SHALL print a warning identifying current and main paths, then prompt via AskUserQuestion with options "Continue from main" / "Abort". On "Continue from main", skill SHALL root ALL subsequent operations (`git worktree add`, `node bin/cli.js`) at main worktree path regardless of invocation CWD — new sibling created relative to main, never chained off the current sibling. On "Abort", skill SHALL exit cleanly with hint to `cd <main>` first.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-3](USE_CASES.md#uc-3-skill-invoked-from-inside-a-sibling-worktree-not-main--warn--offer-continue)
**User Stories:** US-1 (edge case AC)

## FR-10: Local env/config file synchronization into fresh worktree

After FR-2 bootstrap completes and before FR-6 doctor verification, skill SHALL copy local gitignored env/config files from the main worktree into the new worktree, because `git worktree add` checks out only committed files and therefore omits the test/runtime config the worktree needs. The candidate set SHALL be derived at runtime (never a hardcoded filename list): enumerate repo-root files matching include-globs `.env` and `.env.*` that are gitignored (verified via `git -C <main> check-ignore <file>` exit 0), MINUS an exclude-list — `.env.example` (committed template) and `.devcontainer/.env` (handled separately below). For each remaining candidate, skill SHALL copy it to the same relative path in the new worktree via a byte-identical file copy (not symlink — Windows file/dir symlinks require elevated privileges; copy works without them and isolates worktree-local edits from main).

Skill SHALL NOT byte-copy `.devcontainer/.env`. Instead, IF main contains `.devcontainer/.env` THEN skill SHALL regenerate it in the new worktree with worktree-unique ports, mirroring `New-WorktreeEnv` in `extensions/devcontainer/tools/devcontainer/launch-worktree.ps1` (`HOST_NOVNC_PORT`/`HOST_VNC_PORT` set to the next free pair, `HOST_REPOS_PATH` to main's parent). Copying it verbatim would duplicate main's ports and collide on `docker compose up`.

IF a copied file's contents match a secret pattern (`password`, `secret`, `api[_-]?key`, `token`, `BEGIN (RSA |EC |DSA )?PRIVATE KEY` — same set as `Test-SensitiveContent` in `launch-worktree.ps1`) THEN skill SHALL emit exactly one stderr WARNING line naming the file and SHALL NOT print or log the secret value itself; the copy still proceeds (user chose the copy strategy). IF a target env file already exists in the new worktree THEN skill SHALL skip it (no overwrite), preserving worktree-local edits and keeping re-runs idempotent. Env-sync is best-effort: a per-file failure (permission denied, file locked) SHALL emit a stderr warning and continue, never aborting worktree creation. Each action SHALL be recorded as one env-sync audit JSONL line (see SCHEMA) with `action` ∈ `copied|regenerated|skipped|warned`.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path)
**User Stories:** US-1

## FR-11: Build and dependency synchronization

After FR-10 env-sync and before FR-6 doctor verification, skill SHALL ensure the new worktree is buildable, because `git worktree add` carries no gitignored build artifacts and the FR-2 installer only runs `npm install --ignore-scripts` for tool dependencies (it does NOT run the worktree's root install or build — it warns "run npm run build first", verified `src/installer/shared.ts:276,330,407`). Concretely: IF the worktree root `package.json` exists AND `node_modules/` is absent THEN skill SHALL run `npm install` in the worktree; IF `dist/` is absent OR stale (any `src/` file newer than the newest `dist/` file) THEN skill SHALL run `npm run build`. Without these, the worktree fails `npm test`/`npm run build` and the `build_guard` hook (rule `centralized-test-runner`) blocks all tests on a missing/stale `dist/`.

IF the user passes `--skip-build` THEN skill SHALL skip both `npm install` and `npm run build`, and SHALL print the exact manual commands (`cd <worktree> && npm install && npm run build`) so the user can run them later. Build/deps-sync is best-effort: IF `npm install` or `npm run build` exits non-zero THEN skill SHALL print the failure and the retry command and CONTINUE (no rollback of the worktree, consistent with NFR-R3) — the worktree is preserved for debugging. The time spent in `npm install`/`npm run build` is excluded from the skill performance budget (NFR-P5), same as installer time.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path), [UC-6](USE_CASES.md#uc-6-bootstrap-fails-midway--doctor-reports-specific-failure)
**User Stories:** US-1, US-4

## FR-12: DevContainer integration

The skill SHALL integrate with the `devcontainer` extension in two complementary ways.

**(a) Skill brings the container up (`--devcontainer` flag).** WHEN the user passes `--devcontainer` AND the new worktree contains `.devcontainer/docker-compose.yml` THEN, after build/deps-sync (FR-11) and before doctor (FR-6), skill SHALL run `docker compose build` then `docker compose up -d` with cwd set to `<worktree>/.devcontainer`, using a compose project name derived from the worktree directory (sanitized lowercase, `[^a-z0-9]` stripped — same convention as `launch-worktree.ps1:162`) and the worktree-unique ports already written to `.devcontainer/.env` by FR-10 env-sync (which mirrors `New-WorktreeEnv`/`Get-NextPorts`). This is best-effort: IF Docker is unavailable or `docker compose` exits non-zero THEN skill SHALL print the failure plus the manual command (`cd <worktree>/.devcontainer && docker compose up -d --build`) and CONTINUE without aborting (NFR-R3). Without `--devcontainer`, skill SHALL NOT invoke Docker.

**(b) The container builds the project on create (`post-create.sh`).** The devcontainer lifecycle currently configures git/zsh/MCP but does NOT install or build the project, so a reopened container has no root `node_modules`/`dist`. The devcontainer template `extensions/devcontainer/tools/devcontainer/templates/scripts/post-create.sh` SHALL, after its existing setup, run `npm install` then `npm run build` when a root `package.json` exists, idempotently (skip install if `node_modules` present and lockfile unchanged; skip build if `dist` fresh). This makes "Reopen in Container" yield a ready-to-work environment and mirrors the host-side FR-11 contract inside the container.

Both halves keep the existing `launch-worktree.ps1` workflow intact (coexistence — see DESIGN); the skill reuses its port allocation and rebuild logic rather than duplicating it.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path)
**User Stories:** US-1

## FR-9: Out of Scope (explicit)

**AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) (declares no testable criteria — OUT_OF_SCOPE)

> OUT OF SCOPE — Session migration / context transfer between worktrees (Q3 user decision: "без Q3/session-transfer"). Skill prints suggested command for launching new claude in new worktree but does not perform the transfer itself.
>
> OUT OF SCOPE — Batch cleanup of existing orphan worktrees (Q6 user decision: "без cleanup batch"). Self-heal (FR-3) and session-pilot UI (FR-7) provide one-at-a-time remediation paths; no bulk command.
>
> OUT OF SCOPE — Refactor of dev-pomogator self-dogfood model (committed `.claude/settings.json`). Risk #1 in RESEARCH.md documented as known structural constraint; this spec preserves the model. Future spec may address via split into committed-skeleton + local-overlay.
>
> Related UC, AC, and User Stories should be marked `> OUT OF SCOPE — см. FR-9`.
