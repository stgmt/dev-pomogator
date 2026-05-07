# Dev Pomogator Canonical Marketplace Plugin (v2)

Refactor dev-pomogator из кастомной installer-системы (`npm i -g dev-pomogator --claude` пишущей в project) в canonical Claude Code marketplace plugin (`/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt`). Главный практический blocker (запись в shared `.gitignore` блокирует review команд) устраняется в principle — canonical install не трогает project files. Совместимость с Claude Desktop через canonical UI «+ → Plugins». Cursor support вырезается полностью.

## Ключевые идеи

- **Canonical marketplace distribution** — `.claude-plugin/marketplace.json` объявляет dev-pomogator plugin, пользователь делает `/plugin marketplace add stgmt/dev-pomogator` (CLI или Desktop UI), затем `/plugin install dev-pomogator@stgmt`. Anthropic-managed cache + `enabledPlugins` + reload. Schema valid per `plugin-marketplaces.md`.
- **Canonical plugin layout** — `.claude-plugin/plugin.json` + `skills/`, `commands/`, `hooks/`, `.mcp.json`, `agents/` per Anthropic plugin spec.
- **Default install scope = user** (Anthropic canonical default) — доступно во всех проектах + видимо в Claude Desktop. Project и local scopes доступны через `--scope` flag.
- **Build pipeline**: `npm run build:plugin` запускает `buildCanonicalPlugin()` который читает 26 `extensions/*/extension.json` и генерирует canonical artifacts в repo root для distribution.
- **Migration v1 → v2**: documentation-first + optional standalone cleanup script (`tools/migrate-v1-to-v2.ts`) запускаемый user'ом через `npx tsx` без npm install. Anthropic plugin model запрещает project file writes из plugin runtime, поэтому migration не automatic.
- **Cursor support удалён полностью** — manifests, code paths, `package.json` metadata. CLI legacy entry point (если remains для migration utility) обновляет error message с canonical install hint.

## Где лежит реализация

- **Build tools**: `src/installer/plugin-canonical.ts` (NEW) — `buildCanonicalPlugin()` aggregator. `src/installer/extensions.ts` (EDIT) — refactor aggregation в shared utility.
- **Plugin artifacts** (committed в repo, generated): `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/<name>/SKILL.md`, `commands/*.md`, `hooks/hooks.json`, `.mcp.json`.
- **Source-of-truth (preserved)**: `extensions/<ext-name>/extension.json` остаются canonical source per `extension-manifest-integrity` rule.
- **Migration utility**: `tools/migrate-v1-to-v2.ts` (NEW) — standalone cleanup script.
- **Tests**: `tests/e2e/canonical-plugin-build.test.ts`, `tests/e2e/marketplace-json.test.ts`, `tests/e2e/migration-v1-to-v2.test.ts`, `tests/e2e/cursor-removal.test.ts`, `tests/features/dev-pomogator-canonical-plugin.feature`, `tests/fixtures/v1-install/**`.
- **Docs**: `CLAUDE.md` (architecture + build commands), `README.md` (canonical install commands + migration guide).
- **Removed (старый v2 design)**: `bin/postinstall.js`, `src/installer/install-user-scope.ts`, `src/installer/git-exclude.ts`, custom config fields `installScope`/`gitignoreMarker`. См. CHANGELOG.

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 6 user stories (P1: gitignore-fix, Desktop visibility, canonical install flow, migration; P2: project-scope; P3: cursor cleanup)
- [USE_CASES.md](USE_CASES.md) — 7 UC + 6 edge cases (canonical install, scopes, migration, uninstall)
- [RESEARCH.md](RESEARCH.md) — Anthropic guidelines (plugins.md, plugins-reference.md, marketplace-spec, desktop docs), 11 relevant rules, 6 рисков с Mitigation
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix + 24 CHK-FR rows с Verification Method (mix integration/manual)
- [FR.md](FR.md), [NFR.md](NFR.md), [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — formal requirements (12 FRs, 8 ACs)
- [DESIGN.md](DESIGN.md) — components, build pipeline algorithm, 4 Key Decisions с Trade-offs (canonical distribution, documentation-first migration, default user-scope, dual-role repo)
- [dev-pomogator-canonical-plugin_SCHEMA.md](dev-pomogator-canonical-plugin_SCHEMA.md) — pipeline diagram + JSON shapes (plugin.json, marketplace.json, V1InstallInfo, MigrationResult, PluginTree, enabledPlugins entry format)
- [dev-pomogator-canonical-plugin.feature](dev-pomogator-canonical-plugin.feature) — 22 BDD сценария CANON001_10..120 покрывающих @feature1..@feature12 (mix automated and @manual для Anthropic-managed flows)
- [TASKS.md](TASKS.md) — TDD-плана, 8 фаз (Phase -1 Infra → Phase 0 BDD foundation → Phase 1 Build pipeline → Phase 2 Migration → Phase 3 Cursor removal → Phase 4 Cleanup старого v2 design → Phase 5 Docs → Phase 6 Refactor + Final verification)
- [FILE_CHANGES.md](FILE_CHANGES.md) — список затронутых файлов с FR-references (≈30 files: ~10 create, ~10 edit, ~6 delete старого v2 design)
- [FIXTURES.md](FIXTURES.md) — 8 fixtures (4 static v1-install + 4 runtime factories)
- [CHANGELOG.md](CHANGELOG.md) — v2.0 BREAKING changes + полный migration guide (script + manual)
