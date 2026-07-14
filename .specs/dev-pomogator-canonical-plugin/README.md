# Dev Pomogator Canonical Marketplace Plugin (v2)

Refactor dev-pomogator из кастомной installer-системы (`npm i -g dev-pomogator --claude` пишущей в project) в canonical Claude Code marketplace plugin (`/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt`). Главный практический blocker (запись в shared `.gitignore` блокирует review команд) устраняется в principle — canonical install не трогает project files. Совместимость с Claude Desktop через canonical UI «+ → Plugins». Cursor support вырезается полностью.

## Ключевые идеи

- **Canonical marketplace distribution** — `.claude-plugin/marketplace.json` объявляет dev-pomogator plugin, пользователь делает `/plugin marketplace add stgmt/dev-pomogator` (CLI или Desktop UI), затем `/plugin install dev-pomogator@stgmt`. Anthropic-managed cache + `enabledPlugins` + reload. Schema valid per `plugin-marketplaces.md`.
- **Canonical plugin layout** — `.claude-plugin/plugin.json` + `skills/`, `commands/`, `hooks/`, `.mcp.json`, `agents/` per Anthropic plugin spec.
- **Default install scope = user** (Anthropic canonical default) — доступно во всех проектах + видимо в Claude Desktop. Project и local scopes доступны через `--scope` flag.
- **Hand-maintained manifests + drift test**: три canonical манифеста (`.claude-plugin/plugin.json`, `marketplace.json`, `hooks.json`) поддерживаются вручную в repo root. Drift test (`tests/e2e/canonical-plugin.test.ts`) guard'ит синхронизацию — каждая hooks.json команда резолвится в on-disk скрипт под `tools/` (и vice-versa) + manifest schema validity. Build-step'а нет.
- **Migration v1 → v2**: documentation-first + optional standalone cleanup script (`tools/migrate-v1-to-v2.ts`) запускаемый user'ом через `npx tsx` без npm install. Anthropic plugin model запрещает project file writes из plugin runtime, поэтому migration не automatic.
- **Cursor support удалён полностью** — manifests, code paths, `package.json` metadata. CLI legacy entry point (если remains для migration utility) обновляет error message с canonical install hint.

## Planned hook runtime recovery

A portable POSIX/Git-atomic best-effort shell preflight will recover the launcher before Node-based bootstrap runs. Recovery is keyed by Claude session plus canonical project CWD and runs at most once for that key; a lock, marker, filesystem, recovery, or diagnostic failure is non-fatal and preserves normal hook dispatch with actionable diagnostics. POSIX accepts only `node`; Windows accepts only `node.exe`; there is no cross-platform fallback. The contract applies equally to canonical-plugin and repository-dogfood launches. Migration is explicit `--global`-only and leaves the project sentinel set byte-for-byte unchanged on success, dry-run, already-migrated, and failure paths. Hook-runtime BDD scenarios, step definitions, fixtures, and runtime proof are owned by `plugin-deps`; their evidence records the resolved `origin/main` commit, rather than `HEAD`, worktree, cache, or user-global state. `/pomogator-doctor` and migration guidance surface recovery information; Docker BDD proves the complete runtime path.

## Phase-3+ Audit Report — hook-runtime recovery (2026-07-15)

**Verdict: corrections required; do not advance the phase.** This audit is bounded to the canonical baseline in `origin/main`; no worktree-local, global-user, or unrelated v2 artifact is evidence for acceptance.

1. **Migration isolation — FR-7 / AC-4 / AC-5 / CANON001_70–75.** Replace the project-cleanup contract with an explicit `--global`-only mode. It may inspect and change only the global legacy installation and its migration marker/backups; it MUST NOT read, write, remove, merge, or create `<cwd>/.claude/**`, `<cwd>/.dev-pomogator/**`, `<cwd>/.gitignore`, project settings, or any unrelated v2 artifact. The implementation and BDD evidence must prove a byte-for-byte unchanged project sentinel set on success, dry-run, already-migrated, and failure paths.
2. **Canonical baseline — FR-7 / T14.** All recovery and migration comparisons must resolve against `origin/main` only. The audit rejects `HEAD`, a worktree branch, cache contents, or user-global state as a baseline. Record the resolved `origin/main` commit in the test evidence.
3. **BDD ownership — FR-14 / AC-9 / PLUGINDEPS001_01–03.** Hook-runtime BDD scenarios, step definitions, fixtures, and runtime proof belong to the `plugin-deps` ownership boundary, not this canonical-distribution spec. Before implementation, establish the target `plugin-deps` spec nodes and replace this spec's direct scenario ownership with cross-spec trace links; do not duplicate scenarios. `PLUGINDEPS001_03` is presently UNDEFINED, so it cannot be acceptance evidence.
4. **Portable recovery contract — FR-14 / AC-9 / T14.** Specify and verify POSIX/Git atomic best-effort state creation; recovery is keyed by Claude session plus canonical project CWD and runs no more than once for that key. A lock, marker, or filesystem failure is non-fatal: preserve the hook's normal dispatch and emit actionable diagnostics. POSIX dispatch accepts only `node`; Windows dispatch accepts only `node.exe` (never cross-platform fallback). The recovery path must neither invoke host BDD nor make Node bootstrap conditional on a failed diagnostic.

**Required next MCP changes:** amend FR-7, AC-4, AC-5, the `@feature7` scenarios, and T14 for migration isolation and the `origin/main` evidence record; amend FR-14, AC-9, and T14 for the atomic/best-effort/session-CWD/OS-specific dispatch contract; then create or link the `plugin-deps` requirement, AC, task, and BDD nodes before transferring PLUGINDEPS001 ownership. No phase/status change is authorised by this report.

## Где лежит реализация

- **Canonical manifests** (committed в repo, hand-authored): `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.claude-plugin/hooks.json`. Поддерживаются вручную, не генерируются.
- **Plugin artifacts** (committed в repo): `skills/<name>/SKILL.md`, `commands/*.md`, `.mcp.json`, `tools/<tool>/...` (top-level tool/hook скрипты — `src/` и `extensions/` удалены в этой миграции).
- **Drift test**: `tests/e2e/canonical-plugin.test.ts` (NEW) — guard sync между hand-maintained манифестами и on-disk скриптами под `tools/`.
- **Migration utility**: `tools/migrate-v1-to-v2/migrate-v1-to-v2.ts` (NEW) — standalone cleanup script.
- **Tests**: `tests/e2e/canonical-plugin-build.test.ts`, `tests/e2e/marketplace-json.test.ts`, `tests/e2e/migration-v1-to-v2.test.ts`, `tests/e2e/cursor-removal.test.ts`, `tests/features/dev-pomogator-canonical-plugin.feature`, `tests/fixtures/v1-install/**`.
- **Docs**: `CLAUDE.md` (architecture + build commands), `README.md` (canonical install commands + migration guide).
- **Removed**: весь `src/` каталог и `extensions/` дерево (installer-система, postinstall, gitignore/git-exclude writers, cursor code, custom config fields). Tools переехали top-level в `tools/`. См. CHANGELOG.

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 6 user stories (P1: gitignore-fix, Desktop visibility, canonical install flow, migration; P2: project-scope; P3: cursor cleanup)
- [USE_CASES.md](USE_CASES.md) — 7 UC + 6 edge cases (canonical install, scopes, migration, uninstall)
- [RESEARCH.md](RESEARCH.md) — Anthropic guidelines (plugins.md, plugins-reference.md, marketplace-spec, desktop docs), 11 relevant rules, 6 рисков с Mitigation
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix + 24 CHK-FR rows с Verification Method (mix integration/manual)
- [FR.md](FR.md), [NFR.md](NFR.md), [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — formal requirements (12 FRs, 8 ACs)
- [DESIGN.md](DESIGN.md) — components, maintenance flow + drift test, 4 Key Decisions с Trade-offs (canonical distribution, documentation-first migration, default user-scope, dual-role repo)
- [dev-pomogator-canonical-plugin_SCHEMA.md](dev-pomogator-canonical-plugin_SCHEMA.md) — pipeline diagram + JSON shapes (plugin.json, marketplace.json, V1InstallInfo, MigrationResult, PluginTree, enabledPlugins entry format)
- [dev-pomogator-canonical-plugin.feature](dev-pomogator-canonical-plugin.feature) — 22 BDD сценария CANON001_10..120 покрывающих @feature1..@feature12 (mix automated and @manual для Anthropic-managed flows)
- [TASKS.md](TASKS.md) — TDD-плана, 8 фаз (Phase -1 Infra → Phase 0 BDD foundation → Phase 1 Build pipeline → Phase 2 Migration → Phase 3 Cursor removal → Phase 4 Cleanup старого v2 design → Phase 5 Docs → Phase 6 Refactor + Final verification)
- [FILE_CHANGES.md](FILE_CHANGES.md) — список затронутых файлов с FR-references (≈30 files: ~10 create, ~10 edit, ~6 delete старого v2 design)
- [FIXTURES.md](FIXTURES.md) — 8 fixtures (4 static v1-install + 4 runtime factories)
- [CHANGELOG.md](CHANGELOG.md) — v2.0 BREAKING changes + полный migration guide (script + manual)
