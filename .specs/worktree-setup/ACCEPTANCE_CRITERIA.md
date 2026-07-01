# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-atomic-worktreebranch-creation-from-main)

WHEN user invokes skill with slug matching regex `^[a-z][a-z0-9-]*[a-z0-9]$` AND branch `feat/<slug>` does not yet exist (verified via `git show-ref --verify --quiet refs/heads/feat/<slug>` exit non-zero) THEN skill SHALL run `git worktree add -b feat/<slug> <main-parent>/<main-basename>-<slug>` and verify the new path exists with a `.git` file linking to main's `.git/worktrees/<slug>/` directory.

IF slug fails regex validation THEN skill SHALL refuse with error `Invalid slug: must match ^[a-z][a-z0-9-]*[a-z0-9]$ (kebab-case, 1–50 chars, no leading/trailing dash)` and exit code 2 without any git side effect.

IF branch `feat/<slug>` already exists THEN skill SHALL invoke UC-4 idempotency flow (ask whether to reuse existing branch or abort).

IF the target directory `<main-parent>/<main-basename>-<slug>` already exists on disk AND is NOT a registered git worktree (absent from `git worktree list --porcelain`) THEN skill SHALL refuse with `Target path <path> already exists and is not a worktree — remove it or choose a different slug` and exit code 2, without invoking `git worktree add`.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-full-installer-bootstrap-with-global-config-registration)

WHEN `git worktree add` (AC-1) succeeded THEN skill SHALL execute `node <main>/bin/cli.js --claude --all` with `cwd` set to the new worktree path, where `<main>` is parsed from first `worktree <path>` line of `git worktree list --porcelain`.

WHEN installer exits with code 0 THEN skill SHALL read `~/.dev-pomogator/config.json` and verify `installedExtensions[].projectPaths[]` contains the absolute path of the new worktree.

IF projectPath registration is absent after successful installer exit (config-write race, partial install) THEN skill SHALL print `Bootstrap incomplete — installer did not register projectPath. Retry: cd <worktree> && node <main>/bin/cli.js --claude --all`.

IF the projectPath registered by the installer is an ANCESTOR of the new worktree (or otherwise not equal to it) — i.e. `findRepoRoot()` resolved to an enclosing git repo because the worktree is nested — THEN skill SHALL refuse with `Installer resolved to <resolved-root>, not the worktree <worktree-path> — worktree is nested under another git repo; create it as a sibling of main` instead of accepting the wrong-root bootstrap.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-self-heal-hint-for-orphan-worktrees-via-tsx-runnerjs)

WHEN `tsx-runner.js` is invoked by any hook AND target script path starts with `.dev-pomogator/` AND `fs.existsSync(<resolved-script-path>)` returns false (checked AFTER `resolveScriptPath()` at line 107, BEFORE strategy iteration) THEN the runner SHALL append exactly one JSON line to `~/.dev-pomogator/orphan-worktrees.jsonl` with fields `ts`, `worktree_path`, `missing_script`, `hook_event`, `session_id`, then `process.exit(0)` to silently no-op the hook.

WHEN no prior entry exists for `(worktree_path, session_id)` tuple in the JSONL within the current session THEN runner SHALL also emit exactly one stderr line in format `[dev-pomogator] Orphan worktree detected at <path>. Bootstrap with: node <main-bin>/bin/cli.js --claude --all`.

WHEN a prior entry for the same `(worktree_path, session_id)` exists THEN runner SHALL append the new JSONL line (audit trail) but SHALL NOT emit a duplicate stderr line.

IF no living main install can be found by iterating `~/.dev-pomogator/config.json` `projectPaths[]` (all paths fail `fs.existsSync(<path>/bin/cli.js)`) THEN runner SHALL emit hint `[dev-pomogator] Orphan worktree at <path>. No living main install found in config; re-install via your package manager first.` (no hardcoded npx URL).

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-pr-creation-via-three-layer-config-resolution)

WHEN skill is invoked with `--pr=draft` AND `~/.dev-pomogator/worktree-setup.env` does not exist THEN skill SHALL create the file with a stub template (commented headers + empty `key=` lines + per-key inline source-command comments) BEFORE Layer 1 read attempt.

WHEN env file contains valid `WT_GH_OWNER` and `WT_GH_REPO` AND `gh repo view ${WT_GH_OWNER}/${WT_GH_REPO}` exits 0 THEN skill SHALL skip investigation entirely (Layer 1 hit).

WHEN Layer 1 misses AND `git remote get-url origin` returns a GitHub URL THEN skill SHALL parse owner/repo from URL, validate via `gh repo view`, on success persist to env file and proceed (Layer 2 path a).

WHEN Layer 1 misses AND `git remote get-url origin` fails AND `gh repo view --json url,owner,name` succeeds (no positional arg) THEN skill SHALL extract `owner.login` and `name`, persist to env, and proceed (Layer 2 path b).

WHEN Layer 1 and Layer 2 both fail OR yield conflicting candidates THEN skill SHALL prompt via AskUserQuestion with suggested-default field populated from `${gh api user --jq .login}/${path.basename(<main>)}`, validate user input via `gh repo view`, persist on success (Layer 3).

WHEN owner/repo resolved (any layer) THEN skill SHALL run `git -C <new-worktree> push -u origin feat/<slug>` followed by `gh pr create --draft --repo ${WT_GH_OWNER}/${WT_GH_REPO} --title "feat(<slug>): WIP" --body "Auto-created by worktree-setup skill"` and print the resulting PR URL.

IF user invokes skill without `--pr` flag THEN skill SHALL NOT read env, write env, modify git remote config, or invoke any `gh`/`git push` commands.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-gh-authentication-pre-flight-check)

WHEN skill is invoked with `--pr=draft` THEN skill SHALL run `gh auth status` BEFORE `git worktree add`.

IF `gh auth status` exits non-zero THEN skill SHALL refuse with message `Run \`gh auth login\` first. Skill will not create worktree until gh is authenticated.` and exit code 3 without invoking any git or installer commands.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-worktree-doctorcjs-standalone-diagnostic)

WHEN `worktree-doctor.cjs` is invoked in a CWD where `.dev-pomogator/tools/` exists AND CWD is registered in `~/.dev-pomogator/config.json` `projectPaths[]` AND random 3-of-N sampled hook scripts referenced in `.claude/settings.json` all resolve to existing files THEN doctor SHALL exit 0 and stdout SHALL contain `status=OK` line.

IF `.dev-pomogator/tools/` does not exist OR CWD is not registered in global config THEN doctor SHALL exit 1 with `status=TOOLS_MISSING` or `status=NOT_REGISTERED` (whichever condition first fails).

IF any of the 3 sampled hook scripts resolves to a missing file THEN doctor SHALL exit 2 with `status=PARTIAL_INSTALL` and stdout SHALL list the specific missing scripts.

IF CWD is not a git repo OR `package.json` lacks `"name":"dev-pomogator"` THEN doctor SHALL exit 3 with `status=NOT_APPLICABLE` (no-op outside dev-pomogator repos).

WHEN doctor is invoked with `--quick` flag THEN ONLY Check #3 (tools dir existence) and Check #6 (is dev-pomogator repo) SHALL run; total runtime SHALL be <50ms (verified via integration test).

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-session-pilot-integration-contract)

WHEN [session-pilot](../session-pilot/FR.md) indexer scans worktrees (existing behavior) THEN indexer SHALL invoke `~/.dev-pomogator/scripts/worktree-doctor.cjs --quick` for each worktree AND set field `tools_present: true` if exit 0, else `false`.

WHEN session-pilot serves `GET /api/claude` THEN response JSON SHALL contain `tools_present: boolean` for each worktree row.

WHEN client POSTs to `/api/bootstrap` with body `{worktree_path: "<abs>"}` AND `worktree_path` matches a current indexer-whitelist entry THEN server SHALL spawn a Windows Terminal window via existing `terminal_launcher.py` pattern running `node <main>/bin/cli.js --claude --all` with cwd set to `worktree_path`, AND respond `{ok: true, spawned_pid: <int>}`.

IF `worktree_path` is not in indexer whitelist THEN server SHALL respond 403 with `{ok: false, error: "worktree_path not in current index whitelist"}` (matches existing `/api/launch` security pattern).

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-invocation-from-sibling-worktree-warn-offer-continue)

WHEN skill detects `process.cwd()` is not equal to the first `worktree <path>` line of `git worktree list --porcelain` (i.e., invocation from sibling worktree, not main) THEN skill SHALL print a warning line identifying current vs main paths AND invoke AskUserQuestion with options `Continue from main` / `Abort`.

WHEN user selects `Continue from main` THEN skill SHALL execute ALL subsequent `git worktree add` and `node bin/cli.js` operations with cwd set to main worktree path (operations rooted at main, not at the invocation CWD). New sibling worktree SHALL be created relative to main's parent dir, never relative to the current sibling.

WHEN user selects `Abort` THEN skill SHALL exit cleanly with code 0 AND print hint `Switch to main first: cd <main> && claude` AND perform no git/installer/env side effects.

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-local-envconfig-file-synchronization-into-fresh-worktree)

WHEN worktree creation and FR-2 bootstrap succeeded AND main worktree contains a gitignored root `.env.test` THEN skill SHALL copy it to `<new-worktree>/.env.test` with byte-identical content (AC-10.1).

WHEN main worktree contains `.devcontainer/.env` THEN skill SHALL NOT byte-copy it; instead skill SHALL write `<new-worktree>/.devcontainer/.env` with `HOST_NOVNC_PORT`/`HOST_VNC_PORT` differing from main's (next free port pair) and `HOST_REPOS_PATH` set to main's parent directory (AC-10.2).

IF a copied file's contents match a secret pattern (`password|secret|api[_-]?key|token|BEGIN (RSA |EC |DSA )?PRIVATE KEY`) THEN skill SHALL emit exactly one stderr WARNING line naming the file WITHOUT printing the secret value (AC-10.3).

IF a target env file already exists in the new worktree THEN skill SHALL skip the copy (no overwrite) and record `action: skipped` in the env-sync audit log, keeping re-runs idempotent (AC-10.4).

WHEN the candidate set is computed THEN selection SHALL be runtime-derived via include-globs `.env`/`.env.*` + `git check-ignore` minus the exclude-list, with NO hardcoded `.env.test` literal in production logic — verified by an integration test on a repo whose env file has a different name (AC-10.5).

## AC-11 (FR-11)

**Требование:** [FR-11](FR.md#fr-11-build-and-dependency-synchronization)

WHEN worktree creation and bootstrap succeeded AND the worktree root `package.json` exists AND `node_modules/` is absent THEN skill SHALL run `npm install` with cwd set to the new worktree before doctor verification (AC-11.1).

WHEN `node_modules/` is present AND (`dist/` is absent OR any `src/` file is newer than the newest `dist/` file) THEN skill SHALL run `npm run build` in the worktree (AC-11.2).

IF the user passes `--skip-build` THEN skill SHALL NOT run `npm install` or `npm run build`, and SHALL print the manual commands `cd <worktree> && npm install && npm run build` (AC-11.3).

IF `npm install` or `npm run build` exits non-zero THEN skill SHALL print the failure plus the retry command and CONTINUE without deleting the worktree (best-effort, no rollback) (AC-11.4).

## AC-12 (FR-12)

**Требование:** [FR-12](FR.md#fr-12-devcontainer-integration)

WHEN the user passes `--devcontainer` AND the new worktree contains `.devcontainer/docker-compose.yml` THEN skill SHALL run `docker compose build` then `docker compose up -d` with cwd `<worktree>/.devcontainer`, using a compose project name derived from the worktree directory and the unique ports in `.devcontainer/.env` (AC-12.1).

IF Docker is unavailable OR `docker compose` exits non-zero THEN skill SHALL print the failure plus the manual command and CONTINUE without aborting worktree creation (AC-12.2).

WHEN the skill is invoked WITHOUT `--devcontainer` THEN skill SHALL NOT invoke any `docker` command (AC-12.3).

WHEN the devcontainer is created via "Reopen in Container" AND a root `package.json` exists THEN `post-create.sh` SHALL run `npm install` then `npm run build` idempotently (skip install when `node_modules` present and lockfile unchanged; skip build when `dist` fresh) (AC-12.4).

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-out-of-scope-explicit)

> OUT OF SCOPE — see FR-9. No acceptance criteria — FR-9 declares deferred items (session migration / cleanup batch / self-dogfood refactor) that are out of scope of this spec by user decision. Linked UCs/User Stories are not marked OUT_OF_SCOPE because they reference the out-of-scope FRs only contextually (e.g., NFR-U3 mentions "user copies command for opening claude" — that's the explicit no-session-transfer choice). Future specs may pick these up.
