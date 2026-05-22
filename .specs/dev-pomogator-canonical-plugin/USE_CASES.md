# Use Cases

## UC-1: First-time install (default user-scope)

Чистое окружение: пользователь устанавливает dev-pomogator впервые через canonical Anthropic mechanism. По дефолту scope = user. Покрывает FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-9, FR-11.

- Пользователь читает README dev-pomogator (или Anthropic plugin discovery docs)
- В Claude Code (CLI или Desktop) запускает: `/plugin marketplace add stgmt/dev-pomogator`
  - Claude Code clones repo (HTTPS git clone)
  - Reads `.claude-plugin/marketplace.json`
  - Validates schema per Anthropic plugin-marketplaces.md
  - Registers marketplace "stgmt" в Claude Code state
- Пользователь запускает: `/plugin install dev-pomogator@stgmt`
  - Claude Code resolves plugin source через marketplace.json (`source: "./"`)
  - Reads `.claude-plugin/plugin.json` для validate
  - Copies plugin tree в `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`
  - Adds `"dev-pomogator@stgmt": true` в `~/.claude/settings.json` `enabledPlugins`
- Пользователь запускает: `/reload-plugins` (CLI) или restart Desktop application
- Skills/commands/hooks/MCP plugin становятся активны во всех projects этого пользователя

## UC-2: Upgrade v1 → v2 from existing project install

Пользователь имел v1 install в проекте (`.claude/skills/`, `.claude/rules/`, `.dev-pomogator/`, marker block в `.gitignore` через npm postinstall). Переходит на canonical v2. Покрывает FR-7.

- Пользователь читает CHANGELOG.md migration guide
- Запускает optional cleanup script: `npx tsx https://raw.githubusercontent.com/stgmt/dev-pomogator/main/tools/migrate-v1-to-v2.ts` (или клонирует repo и запускает локально)
  - Script detects v1 install через `<cwd>/.dev-pomogator/.claude-plugin/plugin.json` version<2.0.0
  - Backups user-modified files (content hash mismatch) в `<cwd>/.dev-pomogator/.user-overrides/<rel-path>`
  - Removes managed project files: `.claude/skills/<dev-pomogator-managed>/`, `.claude/rules/<dev-pomogator-managed>/`, `.dev-pomogator/`
  - Removes managed marker block из `<cwd>/.gitignore`
  - Smart-merges removal of dev-pomogator hook entries из `<cwd>/.claude/settings.local.json`
  - Prints next steps
- Пользователь следует printed instructions:
  1. `/plugin marketplace add stgmt/dev-pomogator`
  2. `/plugin install dev-pomogator@stgmt`
  3. `/reload-plugins` (или restart Desktop)
- v1 artifacts удалены, v2 canonical install активен

## UC-3: Project-scope install (team-shared)

Команда хочет install dev-pomogator который виден всем collaborators этого репозитория. Покрывает FR-5 (project scope).

- Один из team members в репозитории запускает: `/plugin install dev-pomogator@stgmt --scope project`
  - Claude Code adds `"dev-pomogator@stgmt": true` в `<cwd>/.claude/settings.json` `enabledPlugins`
  - `<cwd>/.claude/settings.json` — committed file (shared с командой), pushed в репо
- Команда coммитит изменения в `<cwd>/.claude/settings.json`
- Каждый team member делает `git pull` + `/plugin marketplace add stgmt/dev-pomogator` (если ещё не добавил marketplace) + `/reload-plugins` — plugin активен у них без отдельного install action

## UC-4: Local-scope install (personal per-repo)

Пользователь хочет dev-pomogator только в одном проекте, но не shared с командой. Покрывает FR-5 (local scope).

- В проекте запускает: `/plugin install dev-pomogator@stgmt --scope local`
  - Claude Code adds entry в `<cwd>/.claude/settings.local.json` `enabledPlugins` (auto-gitignored по Anthropic convention)
  - Не модифицирует `<cwd>/.claude/settings.json`
- Только этот пользователь видит plugin в этом проекте

## UC-5: Uninstall canonical

Пользователь удаляет dev-pomogator. Покрывает FR-12.

- Пользователь запускает: `/plugin uninstall dev-pomogator@stgmt [--scope user|project|local]`
  - Claude Code удаляет cache directory `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`
  - Удаляет `"dev-pomogator@stgmt"` entry из `enabledPlugins` соответствующего scope settings.json
  - Preserves остальные plugin entries (smart merge)
- Опционально: `/plugin marketplace remove stgmt` если пользователь не хочет marketplace catalog тоже

## UC-6: Cleanup v1 residue

Пользователь думал что мигрировал, но обнаружил остатки v1 файлов в одном из projects (например, забыл запустить cleanup script когда апгрейдил несколько проектов сразу). Edge case под FR-7.

- Запускает cleanup script повторно: `npx tsx <repo>/tools/migrate-v1-to-v2.ts`
- Если v1 install detected — script делает cleanup
- Если нет (`.dev-pomogator/.migrated-to-v2` marker присутствует или version >= 2.0.0) — script exits с code 0 + informational message «No v1 install detected; nothing to migrate»

## UC-7: Cursor flag rejection (regression protection)

Пользователь по привычке или по старой документации передаёт `--cursor`. Покрывает FR-8.

- Пользователь запускает legacy CLI entry point (`dev-pomogator --cursor` если бинарь ещё существует для legacy migration utility)
- CLI exits с non-zero exit code
- Stderr содержит: "Cursor support was removed in v2.0. Use canonical install: /plugin marketplace add stgmt/dev-pomogator."
- Не выполняется никаких install actions

## Edge Cases

- **EC-1 No git connectivity**: `/plugin marketplace add stgmt/dev-pomogator` requires HTTPS git access. Если нет network — Anthropic-managed error (не наша проблема).
- **EC-2 Marketplace.json schema validation fail**: Если `.claude-plugin/marketplace.json` не valid per Anthropic schema — `/plugin marketplace add` returns error. dev-pomogator team responsibility — keep schema valid (test через `tests/e2e/marketplace-json.test.ts`).
- **EC-3 Version mismatch**: marketplace.json version != plugin.json version → users могут видеть confusing UX. dev-pomogator build script обязан synchronize обе version при release.
- **EC-4 Re-running cleanup script** (UC-6): script idempotent, exit 0 если no v1 detected.
- **EC-5 Concurrent /plugin install** в multiple Claude Code sessions: Anthropic-managed lock (не наша проблема).
- **EC-6 dev-pomogator dogfood self-install**: dev-pomogator developer's machine может иметь и canonical v2 install AND source repo с development version. Resolution: dev mode использует source repo через `--plugin-dir ./` flag (если Claude Code supports), production install — through canonical mechanism. Не создаёт коллизию потому что разные cache locations.
