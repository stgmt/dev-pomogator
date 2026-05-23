# Functional Requirements (FR)

## FR-1: Canonical plugin layout

dev-pomogator формирует структуру с обязательным манифестом `.claude-plugin/plugin.json` (поля: `name`, `version`, `description`, `author`) и canonical sub-directories: `skills/<skill-name>/SKILL.md`, `commands/*.md`, `hooks/hooks.json`, `.mcp.json`, `agents/*.md` (где есть). Никаких других артефактов внутри `.claude-plugin/` кроме `plugin.json` и `marketplace.json` (FR-2). Build-time aggregation из 26 `extensions/*/extension.json` в единый plugin tree через `buildCanonicalPlugin()`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-fr-9)
**Use Case:** [UC-1](USE_CASES.md#uc-1-first-time-install-default-global)

## FR-2: Marketplace catalog (.claude-plugin/marketplace.json)

dev-pomogator repo содержит `.claude-plugin/marketplace.json` который объявляет dev-pomogator как plugin available для install. Schema (verbatim per Anthropic plugin-marketplaces.md):

```json
{
  "name": "stgmt",
  "owner": { "name": "stgmt" },
  "plugins": [
    {
      "name": "dev-pomogator",
      "source": "./",
      "description": "Team coding standards and workflows for Claude Code (skills/rules/hooks/MCP)",
      "version": "2.0.0",
      "author": { "name": "stgmt" },
      "repository": "https://github.com/stgmt/dev-pomogator",
      "license": "MIT",
      "keywords": ["claude-code", "rules", "standards", "tdd", "workflow", "ai-coding"]
    }
  ]
}
```

Required top-level fields: `name` (kebab-case marketplace identifier), `owner.name`, `plugins[]` (≥1 entry). Plugin entry required: `name`, `source` (relative path `./` означает «same repo as marketplace»). Optional fields per Anthropic spec: `description`, `version`, `author`, `homepage`, `repository`, `license`, `keywords`, `category`, `tags`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-first-time-install-default-global)

## FR-3: Distribution через `/plugin marketplace add`

Canonical install начинается с `/plugin marketplace add stgmt/dev-pomogator` (CLI command или Desktop UI). Это:

1. Клонирует/скачивает dev-pomogator repo в Claude Code's marketplace cache
2. Читает `.claude-plugin/marketplace.json`
3. Регистрирует marketplace в user/project settings (`enabledMarketplaces`)
4. Делает доступным catalog для `/plugin install`

dev-pomogator больше **не распространяется через `npm i -g`**. Старый npm-based install path выпиливается; package.json `bin/cli.js` остаётся ТОЛЬКО для legacy migration utility (FR-7) и постепенно deprecated.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-first-time-install-default-global)

## FR-4: Install через `/plugin install dev-pomogator@stgmt`

После `/plugin marketplace add` пользователь делает `/plugin install dev-pomogator@stgmt`. Claude Code:

1. Читает `.claude-plugin/plugin.json` из dev-pomogator repo (resolved per `source: "./"` в marketplace.json)
2. Копирует plugin tree в `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`
3. Добавляет `"dev-pomogator@stgmt": true` в `enabledPlugins` соответствующего scope settings.json
4. Triggers `/reload-plugins` (CLI) или auto-reload (Desktop UI)

dev-pomogator runtime не зависит от npm; install полностью managed Claude Code'ом.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-4-fr-5-fr-6)
**Use Case:** [UC-1](USE_CASES.md#uc-1-first-time-install-default-global)

## FR-5: Scope-aware install (user/project/local)

`/plugin install dev-pomogator@stgmt --scope <user|project|local>` поддерживает три canonical scopes per Anthropic plugins spec:

- **user (default)** — install для пользователя across all projects. Пишется в `~/.claude/settings.json` `enabledPlugins`. **Default behavior** если `--scope` не указан.
- **project** — install для всех collaborators этого репозитория. Пишется в `<cwd>/.claude/settings.json` `enabledPlugins` (committed file, shared с командой).
- **local** — install только для пользователя в этом репо. Пишется в `<cwd>/.claude/settings.local.json` `enabledPlugins` (auto-gitignored).

dev-pomogator не реализует кастомный scope handling — Anthropic mechanism canonical. dev-pomogator только декларирует что user-scope является «default рекомендованным» в README/CHANGELOG.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-4-fr-5-fr-6)
**Use Case:** [UC-3](USE_CASES.md#uc-3-project-scope-install-team-shared), [UC-4](USE_CASES.md#uc-4-local-scope-install-personal-per-repo)

## FR-6: Activation через `/reload-plugins`

После `/plugin install`:

- В CLI: пользователь запускает `/reload-plugins` (или automatic если CLI version supports it). Без reload плагин зарегистрирован но skills/hooks не активны в текущей session.
- В Desktop: reload автоматический после UI install action; для manual install (`/plugin install` через CLI потом switch в Desktop) требуется restart Desktop приложения.

dev-pomogator должен документировать в README + CHANGELOG: «After /plugin install run /reload-plugins (CLI) or restart Claude Desktop». Это NFR-Usability требование.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-4-fr-5-fr-6)
**Use Case:** [UC-1](USE_CASES.md#uc-1-first-time-install-default-global)

## FR-7: Migration v1 → v2 (documentation + optional cleanup script)

Существующие пользователи v1.x имеют project-scope artifacts: `<cwd>/.claude/skills/`, `<cwd>/.claude/rules/`, `<cwd>/.dev-pomogator/`, marker block в `<cwd>/.gitignore`. v2 не имеет npm-based auto-migration (потому что canonical install не использует npm). Migration через documentation + optional standalone cleanup script:

1. **Documentation (CHANGELOG.md, README.md)**: explicit instructions:
   - Step 1: Manually remove v1 project artifacts (или run optional cleanup script — см. ниже)
   - Step 2: `/plugin marketplace add stgmt/dev-pomogator`
   - Step 3: `/plugin install dev-pomogator@stgmt`
   - Step 4: `/reload-plugins`

2. **Optional cleanup script** (`tools/migrate-v1-to-v2.ts` в repo): пользователь запускает `npx tsx https://raw.githubusercontent.com/stgmt/dev-pomogator/main/tools/migrate-v1-to-v2.ts` в своём проекте (или клонирует repo и запускает локально). Script:
   - Detects v1 install через `<cwd>/.dev-pomogator/.claude-plugin/plugin.json` version<2.0.0
   - Backups user-modified files в `<cwd>/.dev-pomogator/.user-overrides/<rel-path>` если content hash mismatch (existing pattern из `updater-managed-cleanup` rule)
   - Removes managed project files (`.claude/skills/`, `.claude/rules/`, `.dev-pomogator/`)
   - Removes managed marker block из `<cwd>/.gitignore`
   - Smart-merges removal of dev-pomogator entries из `<cwd>/.claude/settings.local.json`
   - Prints next steps (canonical install commands)

Migration explicit и user-driven — никакого silent magic. Подход canonical: dev-pomogator плагин сам не пишет в project files (Anthropic plugin model rules), поэтому migration не может быть автоматической при `/plugin install`.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-7), [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-7)
**Use Case:** [UC-2](USE_CASES.md#uc-2-upgrade-v1-v2-from-existing-project-install)

## FR-8: Cursor support removal

Cursor-related код удаляется полностью:

- `extensions/edge-debug-port/extension.json` — `"platforms": ["claude", "cursor"]` → `["claude"]`.
- `package.json:3` description — обновить на «Canonical Claude Code plugin distributed via marketplace».
- `package.json:12` keywords — удалить `"cursor"` из массива.
- `src/installer/cursor.ts` (если существует) — удалить.
- Любые `commandFiles.cursor` / `ruleFiles.cursor` / `.cursor/` references в extension manifestах — удалить.
- CLI-only entry point (если остаётся для legacy migration) обновить error message: "Cursor support was removed in v2.0. Use canonical install: /plugin marketplace add stgmt/dev-pomogator."

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-7](USE_CASES.md#uc-7-cursor-flag-rejection-regression-protection)

## FR-8a: Exhaustive Cursor purge — 59 файлов

> Added 2026-05-23. Расширение FR-8 после exhaustive grep audit показавшего что FILE_CHANGES.md недосчитывает на 51% (заявлено 39 файлов, реально 59).

Реальный scope cleanup-а: **59 файлов** с упоминаниями `cursor`/`Cursor` в mainstream коде (без node_modules, .stryker-tmp, worktrees, .specs/backlog/). Команда для воспроизведения inventory:

```bash
grep -rln -i "cursor" \
  --include="*.ts" --include="*.js" --include="*.mjs" --include="*.cjs" \
  --include="*.json" --include="*.md" --include="*.py" --include="*.mdc" \
  --include="*.feature" --include="*.yaml" --include="*.yml" --include="*.sh" \
  --include="*.ps1" --include="*.bat" \
  extensions/ src/ scripts/ bin/ .claude/ tests/ \
  | grep -v "node_modules\|.stryker-tmp\|worktrees\|/backlog/"
```

### Категории (фактический inventory 2026-05-23)

| Категория | Кол-во | Файлы (samples) |
|-----------|--------|-----------------|
| (a) Root | 3 | `package.json`, `README.md`, `CHANGELOG.md` |
| (b) Mainstream extensions | ~12 | `extensions/auto-commit/*`, `extensions/edge-debug-port/extension.json`, `extensions/specs-workflow/{tools/mcp-setup/*,tools/specs-validator/validate-specs.ts,tools/steps-validator/validate-steps.ts,extension.json,README.md}`, `extensions/onboard-repo/tools/onboard-repo/{lib/ignore-parser.ts,steps/parallel-recon.ts}`, `extensions/forbid-root-artifacts/*`, `extensions/plan-pomogator/*`, `extensions/suggest-rules/*` |
| (c) src/ | 1 | `src/index.ts` (main entry) |
| (d) .claude/ rules+commands | 3 | `.claude/commands/suggest-rules.md`, `.claude/rules/claude-md-glossary.md`, `.claude/rules/extension-manifest-integrity.md` |
| (e) tests/ | ~28 | `tests/e2e/{cursor-dead-code-cleanup,helpers,auto-commit,claude-installer,claude-mem-*,cli-integration,mcp-setup,onboard-repo/*}.test.ts`, `tests/features/{core,plugins/*,onboard-repo}/*.feature` |
| (f) scripts/ | 1 | `scripts/build-test-base.sh` |
| **Total** | **~59** | — |

### Классификация per file (обязательная phase 3 procedure)

Каждый из 59 файлов проходит **классификацию** одним из трёх вариантов:

1. **DELETE-content** — удалить cursor-specific блок/строку/секцию (e.g. `"platforms": [..., "cursor"]` → удалить `"cursor"`, оставить остальное).
2. **EDIT-content** — заменить cursor mention на neutral wording или Claude-only equivalent (e.g. `"description": "for Cursor and Claude Code"` → `"description": "for Claude Code"`; tests которые проверяют cursor-rejection остаются, но переписываются под error message v2.0).
3. **KEEP-historical** — оставить как есть; это исторический artefact:
   - Spec slug `cursor-dead-code-cleanup` (имя файла теста / feature — артефакт прошлой работы)
   - CHANGELOG.md entries про прошлые versions где Cursor поддерживался
   - Commit messages / git history references
   - Acceptance limit: ≤5 файлов в KEEP-historical после Phase 3.

### Acceptance

После Phase 3 cleanup повторный exhaustive grep:

```bash
grep -rln -i "cursor" --include="*.ts" ... extensions/ src/ scripts/ bin/ .claude/ tests/ \
  | grep -v "node_modules\|.stryker-tmp\|worktrees\|/backlog/" \
  | wc -l
```

→ Результат ≤ 5 (только KEEP-historical файлы). CI test проверяет threshold после release.

**Связанные AC:** [AC-8a](ACCEPTANCE_CRITERIA.md#ac-8a-fr-8a)
**Use Case:** [UC-7](USE_CASES.md#uc-7-cursor-flag-rejection-regression-protection)

## FR-9: Single canonical plugin manifest

Один `.claude-plugin/plugin.json` объединяет ВСЕ 26 extensions как агрегированные skills/commands/hooks/MCP. `extensions/*/extension.json` остаются source-of-truth для **build-time** агрегации (per `extension-manifest-integrity` rule), но **runtime не зависит от них** — Claude Code читает только canonical `plugin.json`. Это делает plugin self-contained для marketplace distribution.

Build-time helper `buildCanonicalPlugin()` (`src/installer/plugin-canonical.ts`) читает все `extensions/*/extension.json` и генерирует `.claude-plugin/plugin.json` + копирует skills/rules/commands/hooks/mcp в canonical paths repo. Это становится частью CI/build pipeline (`npm run build:plugin`), не runtime.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-fr-9)
**Use Case:** [UC-1](USE_CASES.md#uc-1-first-time-install-default-global)

## FR-10: Update path через `/plugin marketplace update`

Для refresh dev-pomogator до новой version:

```
/plugin marketplace update stgmt
```

Claude Code re-fetches marketplace.json, detects version bump, prompts user для re-install/auto-update. Если `marketplace.json` `version` field не указан — Claude Code использует git commit SHA (per Anthropic spec) → updates на каждый git push.

dev-pomogator team responsibility — bump `version` в `marketplace.json` AND `plugin.json` синхронно при каждом release. Это обеспечивает predictable update behavior.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-fr-9)
**Use Case:** [UC-1](USE_CASES.md#uc-1-first-time-install-default-global)

## FR-11: Desktop compatibility via canonical UI

Claude Desktop поддерживает плагины через canonical UI: «**+** button → **Plugins** → browse/install». Это backed официальной документацией (verbatim из `desktop-quickstart.md`):

> Click the **+** button next to the prompt box and select **Plugins** to browse and install plugins that add skills, agents, MCP servers, and more.

После Desktop UI install (или CLI install с последующим Desktop restart) skills из `.claude-plugin/plugin.json` становятся видимы в Desktop Skill picker. dev-pomogator marketplace.json + plugin.json должны быть **valid per Anthropic schema** (no custom fields, no schema deviations) чтобы UI flow работал без surprises.

Desktop reload behavior: `/reload-plugins` слот не доступен в Desktop UI (CLI-only command). Manual restart Desktop приложения требуется для подхвата нового install. Документировать в README.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-11)
**Use Case:** [UC-1](USE_CASES.md#uc-1-first-time-install-default-global)

## FR-12: Uninstall via `/plugin uninstall`

`/plugin uninstall dev-pomogator@stgmt [--scope <user|project|local>]` — Anthropic-managed cleanup:

1. Удаляет `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`
2. Удаляет `"dev-pomogator@stgmt": true` из `enabledPlugins` соответствующего scope settings.json
3. Triggers reload (CLI) или requires restart (Desktop)

dev-pomogator не реализует custom uninstall code — Anthropic mechanism canonical. Если у пользователя остались v1 project artifacts (унаследованы от старого install) — он использует optional cleanup script (FR-7).

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-12)
**Use Case:** [UC-5](USE_CASES.md#uc-5-uninstall-canonical), [UC-6](USE_CASES.md#uc-6-cleanup-v1-residue)
