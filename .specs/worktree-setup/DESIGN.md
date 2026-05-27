# Design

## Реализуемые требования

- [FR-1: Atomic worktree+branch creation](FR.md#fr-1-atomic-worktreebranch-creation-from-main)
- [FR-2: Full installer bootstrap with global config registration](FR.md#fr-2-full-installer-bootstrap-with-global-config-registration)
- [FR-3: Self-heal hint for orphan worktrees](FR.md#fr-3-self-heal-hint-for-orphan-worktrees-via-tsx-runner-bootstrapcjs)
- [FR-4: PR creation via three-layer config resolution](FR.md#fr-4-pr-creation-via-three-layer-config-resolution)
- [FR-5: gh authentication pre-flight](FR.md#fr-5-gh-authentication-pre-flight-check)
- [FR-6: worktree-doctor.cjs standalone diagnostic](FR.md#fr-6-worktree-doctorcjs-standalone-diagnostic)
- [FR-7: session-pilot integration contract](FR.md#fr-7-session-pilot-integration-contract)
- [FR-8: Invocation-from-sibling warn flow](FR.md#fr-8-invocation-from-sibling-worktree--warn--offer-continue)

## Компоненты

- `Skill (worktree-setup)` — orchestration слой, читает USER intent (slug + flags), вызывает git/installer/doctor sequentially, прокладывает three-layer config resolution для PR flow. Живёт в `.claude/skills/worktree-setup/` (committed в dev-pomogator repo).
- `worktree-doctor.cjs` — standalone CJS диагностика, 6 checks с stable exit-code mapping, `--quick` mode для session-pilot hot-path. Установлен в `~/.dev-pomogator/scripts/` через installer (managed artifact с SHA-256 hash tracking).
- `tsx-runner.js` (extended) — existing script-resolution layer в global hook chain, к нему добавляется orphan-detect block (FR-3) сразу после `resolveScriptPath()` (line 107). Patch минимальный: один `fs.existsSync` + dedup-check + JSONL append + одна stderr line. (Note: `tsx-runner-bootstrap.cjs` — тонкий loader, только `require`-ит `tsx-runner.js`; патч НЕ туда — там нет strategy fallback и нет access к scriptPath.)
- `worktree-setup.env` — user-scoped persistent config в `~/.dev-pomogator/`, создаётся skill-ом со stub-template, заполняется после успешной резолюции owner/repo.
- `session-pilot integration` (контракт only; реализация в отдельной ветке) — indexer/handlers/frontend changes в `extensions/session-pilot/tools/session-pilot/` версии 0.4.0.

## Где лежит реализация

- App-код skill: `.claude/skills/worktree-setup/SKILL.md` (markdown + frontmatter с allowed-tools) + `.claude/skills/worktree-setup/scripts/orchestrate.ts` (Node/TypeScript helper)
- Global doctor: `~/.dev-pomogator/scripts/worktree-doctor.cjs` (no deps, runs Node ≥18 stdlib only)
- Self-heal patch: `~/.dev-pomogator/scripts/tsx-runner.js` (existing file — insert block after `resolveScriptPath()` at line 107)
- Audit log: `~/.dev-pomogator/orphan-worktrees.jsonl` (создаётся first write, append-only)
- Env config: `~/.dev-pomogator/worktree-setup.env` (создаётся skill-ом, key=value format)
- Wiring через installer: `extensions/_meta/` или `src/installer/extensions.ts` — register `worktree-doctor.cjs` and updated `tsx-runner.js` как managed files

## Директории и файлы

- `.claude/skills/worktree-setup/SKILL.md` (NEW)
- `.claude/skills/worktree-setup/scripts/orchestrate.ts` (NEW)
- `.claude/skills/worktree-setup/scripts/env-resolver.ts` (NEW)
- `.claude/skills/worktree-setup/scripts/pr-creator.ts` (NEW)
- `extensions/worktree-setup/extension.json` (NEW — manifest для installer-managed артефактов)
- `~/.dev-pomogator/scripts/worktree-doctor.cjs` (NEW, installed by installer)
- `~/.dev-pomogator/scripts/tsx-runner.js` (EDIT — insert orphan-detect block after `resolveScriptPath()` line 107)
- `tests/e2e/worktree-setup.test.ts` (NEW)
- `tests/fixtures/worktree-setup/` (NEW — fixtures для integration tests)
- `~/.dev-pomogator/worktree-setup.env` (RUNTIME — создаётся при первом `--pr=draft`)
- `~/.dev-pomogator/orphan-worktrees.jsonl` (RUNTIME — создаётся при первом orphan detect)

## Алгоритм

1. **Skill invocation** — receive slug + optional flags (`--pr=draft`)
2. **Slug validation** — regex `^[a-z][a-z0-9-]*[a-z0-9]$`, length 1–50
3. **gh auth pre-flight** (if `--pr=draft`) — `gh auth status` → refuse if non-zero
4. **Main worktree detection** — parse `git worktree list --porcelain` → first `worktree <path>` line = `<main>`
5. **CWD vs main comparison** — if not equal → FR-8 warn+continue/abort flow
6. **Branch pre-flight** — `git show-ref --verify --quiet refs/heads/feat/<slug>` → if exists, UC-4 idempotency
7. **Atomic worktree creation** — `git -C <main> worktree add -b feat/<slug> <main-parent>/<main-basename>-<slug>`
8. **Bootstrap** — `node <main>/bin/cli.js --claude --all` with cwd=new-worktree
9. **Doctor verification** — `node ~/.dev-pomogator/scripts/worktree-doctor.cjs` (full mode) in new worktree
10. **PR flow** (if `--pr=draft`) — three-layer resolution (env → investigate → ask) → push + `gh pr create`
11. **Final summary** — print new worktree path, branch, doctor verdict, PR URL (if any), suggested `wt -d <path> claude` command

## API

### Skill invocation contract

- Trigger phrases (RU): "создай worktree для X", "новый worktree X", "сделай PR + worktree для X"
- Trigger phrases (EN): "create worktree for X", "new worktree X", "PR + worktree X"
- Slot extraction: `slug` from phrase context; `--pr=draft` from "+ PR" / "with PR" / "+ pr"
- Output to user: text summary block (no JSON to user; JSON only in test harness via spawnSync)

### worktree-doctor.cjs CLI

- `node worktree-doctor.cjs` — full mode (all 6 checks)
- `node worktree-doctor.cjs --quick` — quick mode (Check #3 + #6 only, <50ms)
- stdout: plain-text `key=value` lines + final `status=<STATUS>`
- exit codes: 0=OK, 1=TOOLS_MISSING|NOT_REGISTERED, 2=PARTIAL_INSTALL, 3=NOT_APPLICABLE

### POST /api/bootstrap (session-pilot, FR-7)

- Method: `POST`
- Path: `/api/bootstrap`
- Request: `{"worktree_path": "<absolute-path-string>"}`
- Response 200: `{"ok": true, "spawned_pid": <integer>}`
- Response 403: `{"ok": false, "error": "worktree_path not in current index whitelist"}`
- Response 400: `{"ok": false, "error": "missing worktree_path"}` (malformed body)

## Key Decisions

### Decision: Use `git worktree add -b` for atomic branch+worktree creation

**Rationale:** Single command creates the new branch off HEAD AND the worktree in one git call. Eliminates the race window between separate `git branch` + `git worktree add` invocations. Verified via `git worktree add --help` usage line `[(-b | -B) <new-branch>] <path> [<commit-ish>]`.

**Trade-off:** Without `-b`, the same usage works for re-adding an existing branch's worktree (UC-4 idempotency path). Means we must pre-flight `git show-ref --verify --quiet refs/heads/feat/<slug>` to choose the right invocation. This adds one extra git call (~10ms) on every skill run.

**Alternatives considered:**
- Two-step `git branch feat/<slug> && git worktree add <path> feat/<slug>` — rejected because not atomic; if process is killed between commands, dangling branch is left. Also harder to debug from logs (two failure points).
- `git worktree add -B feat/<slug>` (force-create-or-reset) — rejected because `-B` will silently overwrite an existing branch's tip, destroying user's in-progress work in that worktree if one exists.

### Decision: Three-layer config resolution (env → investigate → ask)

**Rationale:** Persisted config (env file) eliminates re-asking on every PR-creating invocation; agent investigation handles fresh machines without bothering user; AskUserQuestion only as last resort with verified suggested default. Anti-fantasy guard: every candidate validated via `gh repo view` before use. Embodies feedback memories `feedback_env-first-then-investigate-then-ask.md` and `feedback_no-hardcoded-repo-or-user-identifiers.md`.

**Trade-off:** Three resolution layers mean three code paths to test and maintain. Skill complexity rises vs. a simple "ask every time" or "hardcoded" approach. CHK matrix accordingly has 5 CHKs covering FR-4 (CHK-FR4-01..05).

**Alternatives considered:**
- Ask every time — rejected because user explicitly demanded persistence: "только потом юзера спрашивать если не получилось самому найти ответ". Re-asking on every run is friction.
- Hardcode `stgmt/dev-pomogator` — rejected because dev-pomogator is shipped via `npx` to third parties; any maintainer-specific literal would break their workflow. Documented as P0 in REVIEW_NOTES.md round 1.
- Single Layer 2 only (no env) — rejected because every invocation would re-spawn `gh repo view` × ~5ms × N runs, adding latency without benefit when answer is stable across runs.

### Decision: Standalone worktree-doctor.cjs instead of porting full pomogator-doctor

**Rationale:** Full `/pomogator-doctor` (17 checks) lives in `.dev-pomogator/tools/pomogator-doctor/` — exactly the gitignored location that is missing in orphan worktrees (chicken-and-egg). A standalone CJS in global `~/.dev-pomogator/scripts/` works regardless of worktree-local state. Scope deliberately narrow (6 checks) to keep size <300 LOC and execution <200ms full / <50ms quick.

**Trade-off:** Two doctor implementations now exist (full + worktree-narrow). Risk of divergence over time. Mitigation: shared check #6 (`is dev-pomogator repo`) ensures both refuse cleanly outside dev-pomogator; doctor scripts cross-link in comments for maintenance awareness.

**Alternatives considered:**
- Port full pomogator-doctor to be standalone — rejected because that's significant refactor (17 checks have varied dependencies) and not the goal of this spec; future spec can unify.
- Skip doctor entirely; rely on user to invoke `/pomogator-doctor` manually after skill — rejected because partial-install failure (UC-6) wouldn't be caught at skill exit, leaving silently-broken worktrees.

### Decision: Self-heal as patch to existing tsx-runner.js (after resolveScriptPath line 107)

**Rationale:** `tsx-runner.js` (the script-resolution + strategy fallback layer) is already global, already installed, already invoked on every hook firing via the loader `tsx-runner-bootstrap.cjs → require(runner)`. Inserting the orphan-detect block immediately after `resolveScriptPath()` (line 107) is the semantically correct location — at that point we have the resolved script path and can cheaply check `fs.existsSync`. Adds one `fs.existsSync` + dedup-check + JSONL append + stderr line.

**Trade-off:** `tsx-runner.js` becomes responsible for two concerns (script resolution / strategy fallback + orphan detection). Mild violation of single-responsibility, but the two concerns share trigger context (script path resolved, but unable to execute).

**Alternatives considered:**
- Patch in `tsx-runner-bootstrap.cjs` instead — rejected because verified via Read of the file: it's a ~60-line thin loader that only does `require('~/.dev-pomogator/scripts/tsx-runner.js')` and handles MODULE_NOT_FOUND for the runner itself. It has NO access to script path resolution and NO strategy fallback logic. A check inserted there would either always run (slow, before knowing if check needed) or duplicate `resolveScriptPath` logic — both worse than placing the check where path is already resolved.
- New SessionStart hook `~/.claude/settings.json` calling a dedicated `worktree-doctor.cjs` — rejected because it runs once per session regardless of whether anything is broken; misses ongoing per-hook errors and adds startup latency to all sessions.
- Auto-bootstrap on detection (silently install) — rejected because invasive; user explicitly chose W1+W3 in Q4, and W3 is hint-only ("self-heal in tsx-runner.js adds defence-in-depth without requiring skill invocation" per US-2).

### Decision: env file mode 0600 (POSIX) and never store secrets

**Rationale:** Env file holds `WT_GH_OWNER`/`WT_GH_REPO`/`WT_GH_PROTOCOL`/`WT_GH_HOST` — non-secret identifiers. But user might add comments referring to local paths or `gh auth` setup hints; mode 0600 prevents readability by other local users on multi-user POSIX systems. Justified by NFR-S1.

**Trade-off:** On Windows, fs mode bits don't fully map (NTFS uses ACLs). We default to ACL inheritance from `~/.dev-pomogator/` directory instead of explicit chmod. Means Windows ACL must be correctly set on the parent dir; documented as known limitation.

**Alternatives considered:**
- Encrypt env file — rejected because complexity outweighs threat (no secrets stored).
- World-readable (0644) — rejected because future may add user-specific paths (e.g., login hints) that shouldn't leak cross-user.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js (existing in dev-pomogator repo via `tests/e2e/*.test.ts` + vitest integration; .feature files parsed via internal pattern in `extensions/specs-workflow/tools/specs-generator/analyze-features.ts`)
**Install Command:** already installed (vitest, ts-node via existing `package.json` dev-dependencies)
**Evidence:** `tests/e2e/auth.test.ts` (existing pattern); `package.json` contains `vitest` in `devDependencies`; existing fixtures under `tests/fixtures/`.
**Verdict:** hooks required for worktree lifecycle (create-on-Before / cleanup-on-After) and env-file isolation per scenario (write to temp HOME dir, not user's real `~/.dev-pomogator/`).

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` | beforeEach (vitest) | global | resets tmp dir, copies fixtures | Да — reuse `setupTempProject()` helper |
| `tests/e2e/helpers.ts:cleanupTempProject` | afterEach | global | removes tmp dir | Да — reuse |

> Existing helpers cover generic temp-dir lifecycle; worktree-specific cleanup needs new hook (see below).

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/worktree-helpers.ts:setupWorktreeFixture` | beforeEach | `@feature1`–`@feature8` | create isolated git repo + simulate main worktree in tmp dir; clone over fixture | `setupTempProject` |
| `tests/e2e/worktree-helpers.ts:cleanupWorktreeFixture` | afterEach | same scope | `git worktree remove --force <path>` for any created siblings; `git branch -D feat/<slug>`; rm temp HOME `~/.dev-pomogator/worktree-setup.env` | `cleanupTempProject` |
| `tests/e2e/worktree-helpers.ts:isolateEnv` | beforeEach | `@feature4` | sets `HOME` env var to tmp dir so skill writes env file to test-controlled location | new pattern |

> Каждый новый hook ОБЯЗАН быть указан в FILE_CHANGES.md (action=create) и в TASKS.md Phase 0.

### Cleanup Strategy

Cascade order (most-derived first):
1. `gh pr close --delete-branch <pr-number>` if PR was created (Layer 3 test paths)
2. `git -C <main> push origin --delete feat/<slug>` if branch was pushed
3. `git -C <main> worktree remove --force <new-worktree-path>`
4. `git -C <main> branch -D feat/<slug>`
5. `rm -rf <tmp-home>/.dev-pomogator/worktree-setup.env`
6. `rm -rf <tmp-home>/.dev-pomogator/orphan-worktrees.jsonl`
7. `rm -rf <new-worktree-path>` (in case `git worktree remove` left artifacts due to permission issues)

Rollback on error: even if any cleanup step fails (e.g., `gh pr close` rejected because PR was already closed), continue all subsequent steps. Test reports any cleanup failures as warnings, not hard fails (this is teardown — primary assertions already evaluated).

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| `worktree-setup-fresh-main` | `tests/fixtures/worktree-setup/fresh-main/` | Skeleton dev-pomogator repo with `package.json` + `.git/` initialized + no installed extensions; serves as main-worktree starting point | per-feature copy to tmp dir |
| `gh-mock-responses` | `tests/fixtures/worktree-setup/gh-mock/` | Pre-recorded `gh repo view` JSON outputs for synthetic owners/repos used in Layer 2 validation tests | shared across scenarios via env override `GH_MOCK_DIR` |
| `tsx-runner-bootstrap-pre-patched` | `tests/fixtures/worktree-setup/tsx-runner-bootstrap-original.cjs` | Snapshot of existing file before our patch, for regression testing of the strategy fallback path | shared, read-only |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tmpHome` | string (path) | `isolateEnv` beforeEach | env-resolver tests, doctor tests | tmp HOME dir for HOME-isolated runs |
| `tmpMainWorktree` | string (path) | `setupWorktreeFixture` beforeEach | git/skill orchestration tests | path to mocked main worktree |
| `createdSiblings` | string[] (paths) | skill orchestration tests | `cleanupWorktreeFixture` afterEach | accumulated list of sibling worktrees for teardown |
| `pushedBranches` | string[] (branch names) | PR-flow tests | cleanup hook | branches that were pushed to origin during test, for remote cleanup |
