# Research

## Контекст

dev-pomogator v1.x — это кастомная installer-система для расширений Claude Code (skills/rules/commands/tools/hooks/MCP). Архитектура не соответствует canonical Claude Code plugin format ([code.claude.com/docs/en/plugins.md](https://code.claude.com/docs/en/plugins.md)). Главный практический blocker: запись managed marker block в shared `.gitignore` target-проекта без opt-out. Ревьюверы команд блокируют такие коммиты, и поставить помогатор в строго ревьюируемый репозиторий невозможно.

Этот research фиксирует: (1) аудит текущих write-точек инсталлера, (2) actual canonical Anthropic guidelines на февраль-май 2026, (3) gap analysis между текущим состоянием и canonical, (4) constraints от существующих rules dev-pomogator.

## Источники

- Anthropic plugin docs: <https://code.claude.com/docs/en/plugins.md>
- **Anthropic plugin marketplaces docs (canonical schema)**: <https://code.claude.com/docs/en/plugin-marketplaces.md> [VERIFIED 2026-05-06 deep research]
- **Anthropic discover-plugins docs (`/reload-plugins` activation)**: <https://code.claude.com/docs/en/discover-plugins.md> [VERIFIED]
- **Anthropic Desktop docs**: <https://code.claude.com/docs/en/desktop.md>, <https://code.claude.com/docs/en/desktop-quickstart.md> [VERIFIED]
- Anthropic plugins-reference (full plugin.json schema): <https://code.claude.com/docs/en/plugins-reference.md>
- Anthropic skills docs: <https://code.claude.com/docs/en/skills.md>
- Anthropic settings docs: <https://code.claude.com/docs/en/settings.md>
- Anthropic MCP docs: <https://code.claude.com/docs/en/mcp.md>
- GitHub issue #54803 (MCP `--scope user` visibility bug): <https://github.com/anthropics/claude-code/issues/54803>
- Внутренний аудит: проведён в чат-сессиях 2026-05-05, 2026-05-06, 2026-05-07 (см. CHANGELOG.md)
- Plan-pomogator план: `~/.claude/plans/dev-pomogator-sparkling-cocoa.md`

## Технические находки

### Marketplace.json schema (verbatim from plugin-marketplaces.md, May 2026)

[VERIFIED: code.claude.com/docs/en/plugin-marketplaces.md] Marketplace catalog file `.claude-plugin/marketplace.json` schema:

**Top-level fields:**

| Field | Type | Required? | Description |
|-------|------|-----------|-------------|
| `name` | string | **Yes** | Marketplace identifier (kebab-case). Public-facing; users see в `/plugin install <plugin>@<marketplace>` |
| `owner` | object | **Yes** | `{ name (required), email? }` |
| `plugins` | array | **Yes** | List ≥1 plugin entry |
| `$schema` | string | No | JSON Schema URL (Claude Code ignores at load) |
| `description` | string | No | Marketplace description |
| `version` | string | No | Marketplace manifest version |
| `metadata.pluginRoot` | string | No | Base dir prepended to relative source paths |
| `allowCrossMarketplaceDependenciesOn` | array | No | Allowed dependency marketplaces |

**Plugin entry fields** (within `plugins[]`):

| Field | Type | Required? | Description |
|-------|------|-----------|-------------|
| `name` | string | **Yes** | Plugin identifier (kebab-case) |
| `source` | string\|object | **Yes** | Plugin source location |
| `description`, `version`, `author`, `homepage`, `repository`, `license`, `keywords`, `category`, `tags`, `strict` | various | No | Standard metadata |
| `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers` | string\|object | No | Component path overrides |

**Source field formats:**
- Relative path: `"./"` (same repo as marketplace) or `"./plugins/<name>/"`
- GitHub: `{"source": "github", "repo": "owner/repo"}`
- Git URL: `{"source": "url", "url": "..."}`
- Git subdirectory: `{"source": "git-subdir", "url": "...", "path": "..."}`
- npm package: `{"source": "npm", "package": "..."}`

dev-pomogator использует **relative path `"./"`** — single-plugin marketplace, plugin source = same repo as marketplace.

### `/reload-plugins` activation mechanism

[VERIFIED verbatim quote from discover-plugins.md, May 2026]:

> «After installing, run `/reload-plugins` to activate the plugin.»

Это означает: file placement в `~/.claude/plugins/` БЕЗ `enabledPlugins` declaration в settings.json + reload — **недостаточно** для активации plugin. Canonical activation flow:

1. `/plugin marketplace add <source>` — registers marketplace
2. `/plugin install <plugin>@<marketplace>` — copies plugin к cache + adds `"<plugin>@<marketplace>": true` в `enabledPlugins` соответствующего scope settings.json
3. `/reload-plugins` (CLI) или Desktop restart — activates skills/commands/hooks/MCP в current session

Это invalidates старая assumption «postinstall script copies files и Anthropic auto-discovers» — file placement **alone** не активирует plugin.

### Desktop UI «+ → Plugins» integration

[VERIFIED verbatim quote from desktop-quickstart.md, May 2026]:

> «Click the **+** button next to the prompt box and select **Plugins** to browse and install plugins that add skills, agents, MCP servers, and more.»

Anthropic Desktop application имеет **dedicated UI flow** для plugin install: «**+**» button → «**Plugins**» menu. Это означает Desktop читает same `~/.claude/plugins/cache/` и `enabledPlugins` settings.json что и CLI. Per desktop.md: «The desktop app shares configuration with CLI». Canonical install через `/plugin marketplace add` + `/plugin install` automatically делает plugin visible в Desktop UI после restart.

### Canonical plugin layout (Anthropic, 2026)

**Verified** через `code.claude.com/docs/en/plugins.md`. Плагин — это директория с `.claude-plugin/plugin.json` манифестом и стандартными подпапками:

```
my-plugin/
├── .claude-plugin/plugin.json   ← обязательно; единственное содержимое .claude-plugin/
├── skills/SKILL_NAME/SKILL.md
├── commands/*.md
├── agents/*.md
├── hooks/hooks.json
├── .mcp.json
└── monitors/monitors.json (optional)
```

Поля `plugin.json`: `name` (обязательно — namespace для skills), `description`, `version` (default = git SHA), `author`. **Запрещено** размещать `commands/`, `agents/`, `skills/` внутри `.claude-plugin/` — только `plugin.json`.

### Install scopes (verified)

**MCP servers** (`claude mcp add`):
- `--scope project` → `<cwd>/.mcp.json` (committed для команды)
- `--scope user` → `~/.claude.json` (БАГ #54803: пишется но не видно в `claude mcp list` на May 2026)
- `--scope local` (default) → `~/.claude.json` (видно нормально)

**Settings precedence** (verified): Managed (system) > CLI args > Local (`.claude/settings.local.json`, auto-gitignored) > Shared (`.claude/settings.json`, committed) > User (`~/.claude/settings.json`).

**Skills**: Enterprise > Personal (`~/.claude/skills/`) > Project (`.claude/skills/`) > Plugin (`<plugin>/skills/`). Plugin skills используют namespace `<plugin-name>:<skill-name>`.

**Plugins location**: `~/.claude/plugins/` (default user-scope, доступно во всех проектах) или `.claude/plugins/` (project-scope, in git). User-scope plugins видны в Claude Desktop (юзер подтвердил experience; Anthropic не задокументировал явно для Desktop, но de facto работает).

### Anthropic auto-gitignore pattern

**Verified** через `code.claude.com/docs/en/settings.md`:
> Claude Code will configure git to ignore `.claude/settings.local.json` when it is created.

Реализация: запись в **`~/.config/git/ignore`** (через `git config --global core.excludesFile`), НЕ в project `.gitignore`. То есть Anthropic САМ использует global git ignore (или эквивалент `.git/info/exclude`) для plugin-managed файлов, не трогая shared `.gitignore` команды.

### `.git/info/exclude` как git-native альтернатива

**Verified** через git documentation. `.git/info/exclude` — per-clone ignore-файл, формат идентичен `.gitignore`, не коммитится в репозиторий. Стандартная git feature, поддерживается всеми git-клиентами и хостингами. Идеально для plugin-managed файлов: per-developer per-clone, review-friendly.

### Текущий audit dev-pomogator (v1.5.0, 2026-05-05)

**Project-scope writes** (target проект):
- `.claude/commands/`, `.claude/rules/`, `.claude/skills/` — managed copy через `installClaude` loop
- `.dev-pomogator/tools/` — namespace-safe vendor lock
- `.dev-pomogator/.claude-plugin/plugin.json` — текущий plugin manifest (НЕ в canonical layout)
- `.claude/settings.local.json` — hooks + env (FR-2 из personal-pomogator: gitignored)
- `.claude/settings.json` — legacy migration (cleanup только)
- `.gitignore` — managed marker block ⚠ **review blocker** (FR-1 personal-pomogator)
- `.mcp.json` — smart-merge MCP servers

**User-scope writes** (`~/`):
- `~/.claude/settings.json` — SessionStart hook + statusLine wrapper
- `~/.dev-pomogator/scripts/` — global scripts (tsx-runner, check-update, launch-tui)
- `~/.config/dev-pomogator/config.json` — tracking installed extensions per project

**26 extensions** агрегируются в один runtime. Cursor support формально удалён (`src/index.ts:44-47` отвергает `--cursor`), но `extensions/edge-debug-port/extension.json:5` всё ещё содержит `["claude", "cursor"]`, `package.json:3` description упоминает Cursor, `package.json:12` keywords содержит `"cursor"` — технический долг.

### Migration infrastructure (existing)

Уже есть в репо:
- `src/updater/hook-migration.ts` — `migrateOldProjectHooks()` переписывает старый `settings.json` hook format на portable `tsx-runner` bootstrap
- `src/updater/content-hash.ts` — content hash tracking для drift detection (user modifications backup в `.dev-pomogator/.user-overrides/`)
- `src/installer/uninstall-project.ts` — per-project cleanup (managed files only)
- `src/config/schema.ts` — `ManagedFiles` dual format (string OR object with path+hash fields) для backward compat

Новая migration v1→v2 может использовать эти patterns.

## Где лежит реализация

- App-код: `src/installer/claude.ts`, `src/installer/extensions.ts`, `src/installer/gitignore.ts`, `src/installer/settings-local.ts`, `src/installer/uninstall-project.ts`, `src/index.ts`, `src/updater/github.ts`, `src/updater/hook-migration.ts`, `src/updater/content-hash.ts`
- Конфигурация: `src/config/schema.ts`, `~/.dev-pomogator/config.json`, `extensions/*/extension.json`
- Plugin manifest: `.dev-pomogator/.claude-plugin/plugin.json` (existing, требует canonical refactor)
- Build/install: `package.json` (bin: `./bin/cli.js` → `dist/index.js`)
- Tests: `tests/e2e/*.test.ts` (vitest), `tests/features/*.feature` (BDD)

## Выводы

1. **Distribution = canonical Anthropic marketplace** (not npm postinstall): `/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt`. npm package целиком выпиливается. File placement alone **insufficient** — нужна `enabledPlugins` declaration + `/reload-plugins`, Anthropic-managed.
2. **Default scope = user** (Anthropic canonical default per plugin-marketplaces.md). Это «global» в терминах юзера. User-scope plugins работают и в CLI, и в Desktop через canonical UI.
3. **Desktop integration через canonical UI** «**+** → Plugins» — verified via desktop-quickstart.md verbatim quote. Никакого custom Desktop setup не требуется после canonical install.
4. **Single-source-of-truth canonical layout**: `extensions/` слой выпиливается, всё в `<repo>/skills/`, `<repo>/commands/`, `<repo>/.claude-plugin/{plugin.json,marketplace.json}`. `extension.json` manifestов больше не существует.
5. **Migration v1 → v2** через standalone script `tools/migrate-v1-to-v2.ts` (user-driven через `npx tsx`) с `--global` flag — cleanit project AND global v1 artifacts (`~/.dev-pomogator/`, `~/.claude/settings.json` SessionStart entries, `~/.config/dev-pomogator/`).
6. **Cursor — мёртв**. Технический долг чистится тривиально (3 файла + grep по cursor mentions).
7. **research-workflow skill enforcement** через PostToolUse hook на Skill tool с matcher для skill name — scans output на presence маркеров `[VERIFIED]/[UNVERIFIED]/...`, warn-only если absent. Предотвращает повторение research failures.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp file + atomic move | config writes | NFR-Reliability, FR-1 |
| atomic-update-lock | `.claude/rules/atomic-update-lock.md` | Lock через `flag: 'wx'` (O_EXCL) | concurrent installs | NFR-Reliability |
| no-unvalidated-manifest-paths | `.claude/rules/no-unvalidated-manifest-paths.md` | Пути из манифеста валидировать через resolve+startsWith | manifest path resolution | NFR-Security |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — source of truth для апдейтера | manifest changes | FR-9 |
| extension-layout | `.claude/rules/extension-layout.md` | Skills/rules в `.claude/skills/` И `.claude/rules/`, не в extensions/EXTENSION_NAME/ | new extension creation | FR-1 |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Удалять только managed; user-mods в `.user-overrides/`; smart-merge hooks | uninstall, updater | FR-7, NFR-Reliability |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Апдейтер обновляет ВСЕ установленные плагины целиком | updater | FR-9, FR-10 |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты ОБЯЗАНЫ быть интеграционными (runInstaller/spawnSync) | new tests | All FR/AC tests |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker тесты 7-12 мин — `run_in_background`, не блокировать | test execution | NFR-Performance |
| post-edit-verification | `.claude/rules/pomogator/post-edit-verification.md` | После каждого edit — build + copy installed + tests + screenshot | implementation cycle | NFR-Reliability |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | В `extensions/**/*.ts` импорты с `.ts` расширением | new ext code | FR-1, FR-9 |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| personal-pomogator spec | `.specs/personal-pomogator/FR.md` | FR-1 gitignore marker block, FR-2 settings.local.json, FR-4 self-guard, FR-8 uninstall scope | Foundation: новая спека extends этот scope от project-only до user+project |
| hook-migration | `src/updater/hook-migration.ts` | `migrateOldProjectHooks()`, `migrateProjectSettings()` — pattern для format migration | Шаблон для FR-7 migration v1→v2 |
| content-hash | `src/updater/content-hash.ts` | SHA-256 drift detection, backup в `.user-overrides/` | Используется в migration для user-mod preservation |
| atomic write helpers | `src/_shared/atomic-write.ts` (или эквивалент) | `writeJsonAtomic()`, `writeFileAtomic()` (temp+move) | Reuse для всех новых writers |
| extension manifest aggregation | `src/installer/extensions.ts` `getExtension*()` | Читает `extensions/*/extension.json`, аггрегирует rules/skills/tools | Refactor в shared `buildCanonicalPlugin()` |
| uninstall-project | `src/installer/uninstall-project.ts` | Per-project cleanup, managed files only, smart-merge settings | Шаблон для FR-6 (cleanup обоих gitignore И exclude) |

### Architectural Constraints Summary

- **Atomic writes везде** (`atomic-config-save`, `atomic-update-lock`) — все новые writers (`git-exclude.ts`, `install-user-scope.ts`) обязаны через temp+move.
- **Path traversal guard** (`no-unvalidated-manifest-paths`) — все пути из user-config / extension manifests проходят через `resolveWithinPluginDir()` или эквивалент.
- **Manifest source-of-truth** (`extension-manifest-integrity`) — `extensions/*/extension.json` остаются canonical source; runtime plugin.json генерируется из них на install/update time.
- **Integration-first tests** (`integration-tests-first`) — все FR/AC покрыты `runInstaller()` или `spawnSync()` тестами; unit допустим как дополнение.
- **Extension layout** (`extension-layout`) — новые skills для v2 plugin живут в `.claude/skills/<skill-name>/` корня dev-pomogator repo, не в `extensions/<ext-name>/skills/`.
- **No backwards-compat shims без причины** — личный override `gitignoreMarker='gitignore'` оставляем потому что у некоторых команд это требование, а не legacy fallback.

## Risk Assessment

> Auto-populated by Skill `discovery-forms` during Phase 1. Hook `risk-assessment-guard` enforces:
> when `## Risk Assessment` heading is present, the table below must have ≥2 non-placeholder rows
> with Likelihood ∈ (Low/Medium/High), Impact ∈ (Low/Medium/High), and non-empty Mitigation.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude Desktop требует рестарт после plugin install — пользователи не понимают почему skills не появились | Medium | Low | Документировать в release notes UX flow; CLI выводит hint после install: "Restart Claude Desktop to pick up new plugin" |
| `npm i -g` без sudo на Linux/Mac → permission denied — postinstall fails silent → пользователь думает "молча установился" | High | Medium | Postinstall fail-soft с громким warning + manual fallback инструкция; intall-diagnostics skill детектит silent fail |
| Migration v1→v2 теряет user-mods при auto-overwrite (если content-hash mismatch) | Medium | High | Backup в `.dev-pomogator/.user-overrides/<rel-path>` перед overwrite (existing pattern из `updater-managed-cleanup`); migration log в `~/.dev-pomogator/last-update-report.md` |
| `.git/info/exclude` не существует если в проекте нет `.git/` (проект инициализирован но без git) | Low | Medium | Pre-flight check: detect `.git/` директорию; если нет — error "use --scope user OR git init"; явная диагностика, не silent fail |
| MCP `--scope user` баг (#54803) — если v2 регистрирует MCP в user-scope, они невидимы в `claude mcp list` | Low | Medium | Регистрировать MCP в plugin's `.mcp.json` (`<plugin>/.mcp.json`), не через `claude mcp add --scope user` — bypassим баг |
| Существующие cursor-using teams (если есть) — breaking при v2 upgrade | Low | Low | Cursor support уже отвергается с v1.5 (`src/index.ts:44-47`); фактических пользователей не должно быть; CHANGELOG.md явно фиксирует removal |
