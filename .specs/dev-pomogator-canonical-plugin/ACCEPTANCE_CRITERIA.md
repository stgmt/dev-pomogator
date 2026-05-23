# Acceptance Criteria (EARS)

## AC-1 (FR-1, FR-9)

**Требование:** [FR-1](FR.md#fr-1-canonical-plugin-layout), [FR-9](FR.md#fr-9-single-canonical-plugin-manifest)

WHEN dev-pomogator repo build выполняется (`npm run build:plugin` или manual)
THEN repo SHALL содержать `.claude-plugin/plugin.json` со всеми обязательными полями (name=dev-pomogator, version=2.x, description, author)
AND repo SHALL содержать canonical sub-directories: `skills/<name>/SKILL.md`, `commands/*.md`, `hooks/hooks.json`, `.mcp.json`
AND `.claude-plugin/` директория SHALL содержать ТОЛЬКО `plugin.json` И `marketplace.json` (no other files per Anthropic spec).

## AC-2 (FR-2, FR-3)

**Требование:** [FR-2](FR.md#fr-2-marketplace-catalog-claude-pluginmarketplacejson), [FR-3](FR.md#fr-3-distribution-через-plugin-marketplace-add)

WHEN пользователь запускает `/plugin marketplace add stgmt/dev-pomogator` (CLI или Desktop UI)
THEN Claude Code SHALL clone dev-pomogator repo в marketplace cache
AND SHALL parse `.claude-plugin/marketplace.json` (validate per Anthropic schema)
AND SHALL register marketplace name "stgmt" в settings.json (source: `enabledMarketplaces` field или эквивалент)
AND SHALL make plugin "dev-pomogator" available для subsequent `/plugin install`.

## AC-3 (FR-4, FR-5, FR-6)

**Требование:** [FR-4](FR.md#fr-4-install-через-plugin-install-dev-pomogatorstgmt), [FR-5](FR.md#fr-5-scope-aware-install-userprojectlocal), [FR-6](FR.md#fr-6-activation-через-reload-plugins)

WHEN пользователь запускает `/plugin install dev-pomogator@stgmt` без явного `--scope`
THEN Claude Code SHALL install в default user-scope
AND SHALL copy plugin tree в `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`
AND SHALL добавить `"dev-pomogator@stgmt": true` в `~/.claude/settings.json` `enabledPlugins`
AND после `/reload-plugins` (CLI) или restart Desktop — skills из плагина SHALL быть доступны в Skill picker.

IF пользователь запускает `/plugin install dev-pomogator@stgmt --scope project`
THEN entry SHALL быть записана в `<cwd>/.claude/settings.json` `enabledPlugins` (committed file, shared с командой)
AND `<cwd>/.claude/settings.local.json` SHALL остаться не модифицированным.

IF пользователь запускает `/plugin install dev-pomogator@stgmt --scope local`
THEN entry SHALL быть записана в `<cwd>/.claude/settings.local.json` `enabledPlugins` (auto-gitignored)
AND `<cwd>/.claude/settings.json` SHALL остаться не модифицированным.

## AC-4 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-migration-v1-v2-documentation--optional-cleanup-script)

WHEN пользователь с v1 install в проекте запускает optional cleanup script `npx tsx <repo>/tools/migrate-v1-to-v2.ts`
THEN script SHALL детектить v1 install через `<cwd>/.dev-pomogator/.claude-plugin/plugin.json` version<2.0.0
AND SHALL backup user-modified files (content hash mismatch) в `<cwd>/.dev-pomogator/.user-overrides/<rel-path>`
AND SHALL remove project-scope managed files (`.claude/skills/`, `.claude/rules/`, `.dev-pomogator/`)
AND SHALL remove dev-pomogator managed marker block из `<cwd>/.gitignore`
AND SHALL print next steps: «Run `/plugin marketplace add stgmt/dev-pomogator` then `/plugin install dev-pomogator@stgmt`».

## AC-5 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-migration-v1-v2-documentation--optional-cleanup-script)

WHEN cleanup script выполняется на проекте без v1 install (`<cwd>/.dev-pomogator/` отсутствует или version >= 2.0.0)
THEN script SHALL exit с code 0
AND SHALL print informational message «No v1 install detected; nothing to migrate»
AND SHALL NOT modify any project files.

## AC-6 (FR-12)

**Требование:** [FR-12](FR.md#fr-12-uninstall-via-plugin-uninstall)

WHEN пользователь запускает `/plugin uninstall dev-pomogator@stgmt [--scope user|project|local]`
THEN Claude Code SHALL удалить `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/` целиком
AND SHALL remove `"dev-pomogator@stgmt"` entry из `enabledPlugins` соответствующего scope settings.json
AND SHALL preserve остальные `enabledPlugins` entries (smart merge, не truncate целиком).

## AC-7 (FR-11)

**Требование:** [FR-11](FR.md#fr-11-desktop-compatibility-via-canonical-ui)

WHEN пользователь открывает Claude Desktop application
AND кликает «**+**» button → «**Plugins**» menu item
THEN Desktop UI SHALL отображать plugin browser
AND после `/plugin marketplace add` (через CLI session или внутренний Desktop UI flow) dev-pomogator SHALL появиться в available plugins list
AND после install через UI plugin SHALL быть активен в Desktop session.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-cursor-support-removal)

WHEN кто-либо запускает legacy CLI entry point (если остался для migration utility) с флагом `--cursor`
THEN CLI SHALL exit с non-zero exit code (≥1)
AND stderr SHALL содержать message "Cursor support was removed in v2.0. Use canonical install: /plugin marketplace add stgmt/dev-pomogator."
AND no install actions SHALL быть выполнены.

## AC-8a (FR-8a)

**Требование:** [FR-8a](FR.md#fr-8a-exhaustive-cursor-purge--59-файлов)

WHEN Phase 3 (Cursor removal) завершена и release prepared
AND запущена команда:

```bash
grep -rln -i "cursor" \
  --include="*.ts" --include="*.js" --include="*.mjs" --include="*.cjs" \
  --include="*.json" --include="*.md" --include="*.py" --include="*.mdc" \
  --include="*.feature" --include="*.yaml" --include="*.yml" --include="*.sh" \
  --include="*.ps1" --include="*.bat" \
  extensions/ src/ scripts/ bin/ .claude/ tests/ \
  | grep -v "node_modules\|.stryker-tmp\|worktrees\|/backlog/" \
  | wc -l
```

THEN результат SHALL быть ≤ 5
AND оставшиеся файлы SHALL быть классифицированы как KEEP-historical в Phase 3 cleanup log
AND каждый оставшийся файл SHALL иметь объяснение (commit message / file comment) почему ref оставлен.
