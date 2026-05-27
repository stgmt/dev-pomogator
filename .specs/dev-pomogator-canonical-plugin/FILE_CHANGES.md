# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.claude-plugin/plugin.json` | create | [FR-1](FR.md#fr-1-canonical-plugin-layout), [FR-9](FR.md#fr-9-single-canonical-plugin-manifest) — canonical plugin manifest, hand-authored (maintained вручную, не generated) |
| `.claude-plugin/marketplace.json` | create | [FR-2](FR.md#fr-2-marketplace-catalog-claude-pluginmarketplacejson) — marketplace catalog, hand-authored, объявляющий dev-pomogator plugin available для install |
| `.claude-plugin/hooks.json` | create | [FR-1](FR.md#fr-1-canonical-plugin-layout), [FR-9](FR.md#fr-9-single-canonical-plugin-manifest) — hooks config, hand-authored; команды ссылаются на on-disk скрипты под `tools/` |
| `skills/<name>/SKILL.md` (mass) | create | [FR-1](FR.md#fr-1-canonical-plugin-layout) — canonical skills tree в repo root для plugin distribution |
| `commands/*.md` (mass) | create | [FR-1](FR.md#fr-1-canonical-plugin-layout) — canonical commands |
| `.mcp.json` (repo root) | create | [FR-1](FR.md#fr-1-canonical-plugin-layout) — MCP servers config (если applicable) |
| `tools/<tool>/...` (mass) | move | [FR-1](FR.md#fr-1-canonical-plugin-layout) — все tool/hook скрипты перенесены top-level в `tools/` (после удаления `src/` и `extensions/`) |
| `tools/migrate-v1-to-v2/migrate-v1-to-v2.ts` | create | [FR-7](FR.md#fr-7-migration-v1-v2-documentation--optional-cleanup-script) — standalone cleanup script для users переходящих с v1 |
| `package.json` | edit | [FR-3](FR.md#fr-3-distribution-через-plugin-marketplace-add), [FR-8](FR.md#fr-8-cursor-support-removal) — remove npm-based install path; remove "Cursor" из description+keywords |
| `tests/e2e/canonical-plugin.test.ts` | create | Drift test для AC-1, FR-9: каждая hooks.json команда резолвится в on-disk скрипт под `tools/` (и vice-versa) + manifest schema validity |
| `tests/e2e/marketplace-json.test.ts` | create | Integration tests для AC-2: marketplace.json schema validation per Anthropic spec |
| `tests/e2e/migration-v1-to-v2.test.ts` | create | Integration tests для AC-4, AC-5: cleanup script behavior с fixture v1 install |
| `tests/e2e/cursor-removal.test.ts` | create | Regression tests для AC-8: cursor mentions absent, --cursor exits non-zero |
| `tests/fixtures/v1-install/.dev-pomogator/.claude-plugin/plugin.json` | create | Fixture v1 plugin manifest (version 1.5.0) для migration script tests |
| `tests/fixtures/v1-install/.claude/skills/sample-skill/SKILL.md` | create | Fixture skill в project scope для cleanup test |
| `tests/fixtures/v1-install/.gitignore` | create | Fixture .gitignore с managed marker block для cleanup assertion |
| `tests/features/dev-pomogator-canonical-plugin.feature` | create | BDD scenarios под canonical marketplace architecture (CANON001_10..120 для AC-1..AC-8). Note: spec-internal copy в `.specs/dev-pomogator-canonical-plugin/dev-pomogator-canonical-plugin.feature` уже существует; this entry — для копии в `tests/features/` для test runner integration |
| `CLAUDE.md` | edit | Update Architecture section: canonical marketplace plugin distribution, hand-maintained manifests + drift test, deprecated npm install path |
| `README.md` | edit | NEW install commands: `/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt`; remove npm install instructions; v1→v2 migration guide |
| `.specs/dev-pomogator-canonical-plugin/CHANGELOG.md` | edit | Update v2.0 BREAKING changes для canonical marketplace approach (removes npm postinstall + .gitignore writes; adds marketplace.json) |
