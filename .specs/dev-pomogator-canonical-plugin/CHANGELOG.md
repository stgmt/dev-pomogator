# Changelog

All notable changes to this feature will be documented in this file.

## [2.0.0] - TBD (BREAKING — canonical marketplace distribution)

### Added
- **Canonical Claude Code marketplace plugin distribution** — dev-pomogator теперь раздаётся через canonical Anthropic mechanism: `/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt`. Это работает в CLI и в Claude Desktop (через UI «+ → Plugins»). Verified per Anthropic plugins.md, plugins-reference.md, plugin-marketplaces.md, discover-plugins.md.
- **`.claude-plugin/marketplace.json`** — marketplace catalog manifest объявляющий dev-pomogator plugin available для install. Schema валидна per Anthropic plugin-marketplaces.md (name, owner, plugins[], optional metadata fields). FR-2.
- **`.claude-plugin/plugin.json`** — canonical plugin manifest с required name + optional version/description/author per Anthropic plugins-reference.md. FR-1, FR-9.
- **`buildCanonicalPlugin()`** в `src/installer/plugin-canonical.ts` — build-time aggregator читающий `extensions/*/extension.json` и генерирующий canonical artifacts (`plugin.json`, `marketplace.json`, `skills/`, `commands/`, `hooks/hooks.json`, `.mcp.json`). Запускается через `npm run build:plugin`. FR-1, FR-9.
- **`tools/migrate-v1-to-v2.ts`** — standalone optional cleanup script для пользователей переходящих с v1 install. User-driven (запускается explicitly через `npx tsx`), не часть plugin install flow (Anthropic plugin model запрещает project file writes из plugin runtime). FR-7.
- **Scope-aware install** через canonical `--scope user|project|local` flags Anthropic mechanism. Default = user (per plugin-marketplaces.md). FR-5.
- **Desktop UI integration** through canonical «**+** → Plugins» browser. Verified per `desktop-quickstart.md`. FR-11.

### Changed
- **Distribution model**: npm-based install (`npm i -g dev-pomogator && dev-pomogator --claude`) → canonical Anthropic marketplace install (`/plugin marketplace add` + `/plugin install`). FR-3, FR-4.
- **Activation**: file placement в `~/.claude/plugins/` → `enabledPlugins` declaration в settings.json + `/reload-plugins` (CLI) or Desktop restart. Anthropic-managed automatically через `/plugin install`. FR-6.
- **Default scope**: project (v1) → user (Anthropic canonical default). FR-5.
- **Update mechanism**: `dev-pomogator --update` (custom) → `/plugin marketplace update stgmt` (Anthropic-managed, version-tracked через marketplace.json). FR-10.

### Removed
- **BREAKING:** Cursor support удалён полностью (extension manifests, code paths, `package.json` keywords/description). v1.5 уже отвергал `--cursor`; v2 завершает cleanup. FR-8.
- **BREAKING:** npm postinstall hook (`bin/postinstall.js`, `package.json` `scripts.postinstall`) удалён. Distribution через canonical Anthropic marketplace, не npm.
- **BREAKING:** Custom `.gitignore` writer удалён. Canonical install не пишет в проект (cache живёт в `~/.claude/plugins/cache/`); `.gitignore` модификации больше не нужны.
- **BREAKING:** `.git/info/exclude` writer удалён. Тот же reason — canonical install не трогает project files.
- **BREAKING:** Custom config fields `installScope` и `gitignoreMarker` в `~/.dev-pomogator/config.json` удалены. Anthropic mechanism handles scope через `--scope` flag canonical install.
- **BREAKING:** `src/installer/install-user-scope.ts` (старый v2 design) удалён — canonical Anthropic install handles user-scope automatically.
- **BREAKING:** `npm i -g dev-pomogator` install path выпиливается. `package.json` остаётся для build tooling и legacy migration utility, не для install.

### Fixed
- **Главный практический blocker**: ревьюверы команд блокировали коммиты в shared `.gitignore` после v1 install. Canonical install Anthropic не пишет в project files вообще — review issue решена в principle. FR-2, FR-4.
- **Desktop compatibility**: v1 не работал в Claude Desktop (CLI-only). Canonical marketplace install — verified Desktop support per `desktop-quickstart.md` UI workflow. FR-11.
- **Activation reliability**: v1 file placement без `enabledPlugins` declaration не активировал plugin (verified per discover-plugins.md `/reload-plugins` requirement). Canonical mechanism Anthropic-managed activation. FR-6.

### Migration Guide (v1 → v2)

**Step 1 — cleanup v1 project artifacts** (one of):

a. **Recommended: optional cleanup script** запускается через npx без install:

```bash
# В каждом проекте где dev-pomogator v1 был установлен:
cd /path/to/your-project
npx tsx https://raw.githubusercontent.com/stgmt/dev-pomogator/main/tools/migrate-v1-to-v2.ts
```

Script:
1. Detects v1 install через `<cwd>/.dev-pomogator/.claude-plugin/plugin.json` version<2.0.0
2. Backups user-modified files (content hash mismatch) в `<cwd>/.dev-pomogator/.user-overrides/<rel-path>`
3. Removes managed project files: `.claude/skills/<dev-pomogator-managed>/`, `.claude/rules/<dev-pomogator-managed>/`, `.dev-pomogator/`
4. Removes managed marker block из `<cwd>/.gitignore` (preserves user entries)
5. Smart-merges removal of dev-pomogator hook entries из `<cwd>/.claude/settings.local.json`
6. Writes `<cwd>/.dev-pomogator/.migrated-to-v2` marker для idempotent re-run
7. Prints next steps

b. **Manual cleanup** (если предпочитаете контроль):
- `rm -rf .claude/skills/<dev-pomogator-managed-skill>/` (per skill)
- `rm -rf .claude/rules/<dev-pomogator-managed-rule>.md` (per rule)
- `rm -rf .dev-pomogator/` (всё содержимое)
- Editor: открыть `.gitignore`, удалить блок `# >>> dev-pomogator managed >>>` ... `# <<<`
- Editor: открыть `.claude/settings.local.json`, удалить hooks/env entries которые reference dev-pomogator

**Step 2 — canonical install:**

```
/plugin marketplace add stgmt/dev-pomogator
/plugin install dev-pomogator@stgmt
/reload-plugins
```

(Если используешь Claude Desktop: вместо `/reload-plugins` — restart Desktop приложения для подхвата нового install. Plugin browser UI: «+» button → «Plugins» menu.)

**Step 3 — verify:**
- В CLI session: skills из dev-pomogator должны быть видны через `/skill` picker (например `/dev-pomogator:create-spec`).
- В Desktop: открыть Skill picker и убедиться что skills appear.

### Опт-аут (если хочешь остаться на v1)

Не делать ничего: v1 install продолжит работать (npm package остаётся available для legacy versions). Но: future updates будут идти только в v2 stream; security/feature fixes в v1 не backportятся (single-maintainer project, не bandwidth для two distribution paths).

## [1.x] - до этой спеки

См. existing `.specs/personal-pomogator/CHANGELOG.md` для FR-1..FR-9 personal-pomogator scope (gitignore marker, settings.local.json, self-guard, uninstall scope) — v2 spec заменяет ту architecture canonical Anthropic mechanism.
