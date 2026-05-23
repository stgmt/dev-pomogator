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

> Original 6 risks auto-populated by Skill `discovery-forms` during Phase 1. **Expanded 2026-05-23** с 10-domain audit (25+ rows) + concrete proofs (file paths, line numbers, grep counts, GitHub issue links). Hook `risk-assessment-guard` enforces format: Likelihood ∈ (Low/Medium/High), Impact ∈ (Low/Medium/High), non-empty Mitigation.

### Top-5 critical (cross-domain)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **1. `plugin.json` ↔ `marketplace.json` version desync** при ручной правке версии в одном файле — `/plugin marketplace update` показывает phantom skip | High | High | `buildCanonicalPlugin()` атомарно пишет обе версии из single source. Pre-commit hook валидирует sync. CI fails на mismatch. **Proof:** существующий v1 `.dev-pomogator/.claude-plugin/plugin.json:3` уже имеет `"version": "1.5.0"` независимо от `package.json` — рассинхрон-pattern уже есть |
| **2. Silent v1+v2 duplication** — user ставит v2 поверх v1, hooks double-fire, skills двоятся | Medium | High | Migration script детектит v1 по 3 маркерам (`.dev-pomogator/.claude-plugin/plugin.json` + `~/.dev-pomogator/` + `.gitignore` marker block). v2 plugin SessionStart hook печатает warning если v1 artifact detected. **Proof:** v1 artifact живёт в `.dev-pomogator/.claude-plugin/plugin.json` (~2.3KB, версия 1.5.0, лист 23 extensions) |
| **3. Marketplace schema validation fail** — опечатка → Anthropic UI silent reject → весь release невидим | Medium | High | `validateMarketplaceSchema()` в build pipeline. CI fail-fast. Local `npm run build:plugin` обязателен перед коммитом. **Proof:** Anthropic `plugin-marketplaces.md` specify strict schema; нет existing validator в репе |
| **4. Stale `plugin.json` в git** — dev забыл `npm run build:plugin`, фичи отправлены но не активны | Medium | High | Pre-commit hook regenerate + git add автоматически. CI test в PR. **Proof:** существующий v1 artifact регенерировался manually — нет hook'а |
| **5. Migration script на Windows — path separator / glob issues** | Medium | Medium | **Defensive coding**: `path.join()` / `path.resolve()` вместо string concat; `glob` package с native sep handling. **Automated Windows test ВНЕ scope этой итерации** — Docker test infra Linux-only (`tests/setup/ensure-docker.ts:14` блокирует e2e на хосте; нет Windows pipeline). Manual cross-platform check перед release. **Proof:** `npm test` → `bash scripts/docker-test.sh` → Linux container only |

### Domain 1: Distribution / Marketplace (4)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 1.1 plugin.json↔marketplace.json version desync | High | High | См. Top-5 #1 |
| 1.2 marketplace.json schema validation fail | Medium | High | См. Top-5 #3 |
| 1.3 `source: "./"` resolution fail на non-GitHub forks | Low | Low | README документирует fork pattern; migration script подсказывает path. **Proof:** Anthropic `plugin-marketplaces.md` описывает только GitHub anchor |
| 1.4 Cascade fail — один сломанный skill из 26 ломает весь плагин | Medium | High | `buildCanonicalPlugin()` валидирует каждый skill/command/hook перед агрегацией (read file, check required fields); fail-fast с clear error. **Proof:** 26 extensions в `extensions/` — любой broken manifest валит build |

### Domain 2: Backward Compatibility — v1 users (4)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 2.1 Silent v1+v2 duplication | Medium | High | См. Top-5 #2 |
| 2.2 Orphaned `~/.dev-pomogator/` не cleanup-ится | Medium | Low | Migration script удаляет `~/.dev-pomogator/` целиком (backup в `.user-overrides/`); документирует что removed. **Proof:** `~/.dev-pomogator/` ref-ится в `src/installer/index.ts`, `src/installer/shared.ts`, `src/installer/mcp-config.ts`, `src/doctor/checks/pomogator-home.ts`, `src/doctor/checks/version-match.ts` — пять call sites |
| 2.3 Migration script не идемпотентен на partial v1 install | Medium | Medium | Iterate по known managed file list, skip missing файлы gracefully; report summary; exit 0 если nothing to clean |
| 2.4 Stale `~/.dev-pomogator/config.json` после migration | Low | Low | Migration script удаляет `config.json` целиком; v2 не использует |

### Domain 3: MCP Servers (3)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 3.1 Anthropic issue #54803 — user-scope MCPs невидимы в `claude mcp list` | Low | Low | dev-pomogator НЕ использует `claude mcp add`; MCPs объявлены в `.mcp.json` плагина. README explicit |
| 3.2 Conflict MCP server names с existing | Medium | Medium | README документирует names; conflict detection helper в plugin install hook (опц.). **Proof:** `src/installer/mcp-config.ts` имеет smart-merge `writeServerEntry`, но не conflict detection |
| 3.3 `.mcp.json` merge с project-existing MCPs | Medium | Medium | Smart-merge переиспользовать из `src/installer/mcp-config.ts:writeServerEntry` — он preserves user entries при write. **Proof:** `src/installer/mcp-config.ts:55-89` написан именно для этого case |

### Domain 4: Cursor Removal — scope обновлён 2026-05-23 (3)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 4.1 **Incomplete cursor cleanup — реальное число файлов 59 (не 39 как в FILE_CHANGES.md)** | High | Medium | **FILE_CHANGES.md недокаунтит на 51%.** Exhaustive grep команда: `grep -rln -i "cursor" --include=*.{ts,js,mjs,cjs,json,md,py,mdc,feature,yaml,yml,sh,ps1,bat} extensions/ src/ scripts/ bin/ .claude/ tests/` (исключая node_modules / .stryker-tmp / worktrees / backlog) → **59 файлов**. Категории: (a) **Корень** (3): `package.json` (description "for Cursor and Claude Code" + keyword `"cursor"`), `README.md`, `CHANGELOG.md`; (b) **Mainstream extensions** (~12): `extensions/auto-commit/*`, `extensions/edge-debug-port/extension.json`, `extensions/specs-workflow/{tools/mcp-setup/*,tools/specs-validator/validate-specs.ts,tools/steps-validator/validate-steps.ts,extension.json}`, `extensions/onboard-repo/tools/onboard-repo/{lib/ignore-parser.ts,steps/parallel-recon.ts}`, `extensions/forbid-root-artifacts/*`, `extensions/plan-pomogator/*`, `extensions/suggest-rules/*`; (c) **src/** (1): `src/index.ts`; (d) **.claude/** (3 правила/команды): `.claude/commands/suggest-rules.md`, `.claude/rules/claude-md-glossary.md`, `.claude/rules/extension-manifest-integrity.md`; (e) **tests/** (~28): `tests/e2e/{cursor-dead-code-cleanup,helpers,auto-commit,claude-installer,claude-mem-*,cli-integration,mcp-setup,onboard-repo/*}.test.ts`, `tests/features/{core,plugins/*,onboard-repo}/*.feature`. **Mitigation:** Phase 3 (Cursor removal) запускает полный exhaustive grep команду, обходит все 59 файлов поштучно, классифицирует каждый ref как DELETE / EDIT-content / KEEP-historical (historical: `cursor-dead-code-cleanup` test name + явные commit/changelog references). Acceptance: повторный grep → ≤5 files (только historical names). Добавлен **FR-8a "Exhaustive Cursor purge — обход всех 59 файлов"** в FR.md. CI test проверяет threshold после release |
| 4.2 Existing Cursor users tries v2 install | Low | Low | Cursor отвергается с v1.5 (`src/index.ts:44-47`); CHANGELOG explicit |
| 4.3 Stale `extensions/{name}/cursor/` references в FILE_CHANGES.md | Low | Low | Физических `cursor/` dirs не существует; только text refs внутри файлов. **Proof:** `ls extensions/*/cursor/` пусто; FILE_CHANGES.md упоминает несуществующие пути типа `extensions/specs-workflow/cursor/commands/specs-workflow.md` — заведомо stale |

### Domain 5: Build & CI (3)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 5.1 Stale plugin.json в git | Medium | High | См. Top-5 #4 |
| 5.2 Generated artifact `.claude-plugin/plugin.json` merge conflicts в git | Medium | Medium | **Решение:** keep `.claude-plugin/` в git, pre-commit hook regenerate + stage. `git clone` даёт рабочий плагин без `npm install` — важно для marketplace `source: "./"` resolution |
| 5.3 `npm run build:plugin` slow в Docker CI timeout | Low | Low | `build:plugin` — pure local, без network. Tests в background per `no-blocking-on-tests` rule. **Proof:** `scripts/docker-test.sh` уже background pattern |

### Domain 6: Migration Tooling (3)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 6.1 `.user-overrides/` backup disk junk | Low | Low | Migration script печатает path + hint; hash-based dedup на repeated runs |
| 6.2 Migration script Windows path issues | Medium | Medium | См. Top-5 #5. Automated Windows test ВНЕ scope (Docker Linux-only) |
| 6.3 Migration lock file stuck после `kill -9` | Low | Low | Lock pattern `flag: 'wx'` + stale timeout 1 час (process alive check). **Proof:** existing pattern в `extensions/_shared/scope-gate-marker-store.ts`, `src/doctor/lock.ts`, `extensions/suggest-rules/tools/learnings-capture/queue.ts` — three call sites |

### Domain 7: Desktop UI / Plugin Activation (3)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 7.1 Desktop требует restart, users не знают | Medium | Low | CLI prominent hint после `/plugin install`; CHANGELOG explicit (legacy risk) |
| 7.2 Desktop UI schema silent skip | Medium | High | См. Top-5 #3 — schema validation в build |
| 7.3 Orphan settings.json entries при manual edit | Low | Low | CLI warning "use /plugin uninstall"; documentation |

### Domain 8: Repo Hygiene (3)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 8.1 `.claude-plugin/plugin.json` merge conflicts | Medium | Medium | См. 5.2 |
| 8.2 `extensions/*/cursor/` git history | Low | Low | History в old commits; CHANGELOG references commit SHA. **Proof:** физических `cursor/` dirs уже нет — только text refs |
| 8.3 Migration markers `.migrated-to-v2` user-deletable | Low | Low | Comment в marker файл "do not delete" + doc в migration script |

### Domain 9: User Communication (2)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 9.1 v1 users никогда не узнают про migration | Medium | Medium | **Phase 6.5:** v1.5.1 release с SessionStart hook что печатает ONCE warning "v2.0 released, see CHANGELOG". **Proof:** v1 install имеет SessionStart hook в `~/.claude/settings.json` — мы можем туда добавить notice |
| 9.2 Migration script npx URL fragile при GitHub outage | Low | Low | Migration guide включает BOTH `npx tsx https://...` AND local clone option |

### Domain 10: Spec Coverage Gaps (3)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 10.1 Min Claude Code version | Low | Low | README + `marketplace.json.description` указывает min CC version |
| 10.2 `--scope` flag может переименоваться Anthropic-side | Low | Low | Documentation: "follow Claude Code CLI syntax"; не hardcode |
| 10.3 FR-11 Desktop integration — no automated test | Medium | Medium | Manual smoke перед release; checklist в release runbook. **Automated test ВНЕ scope** (Desktop тестируется через actual UI) |

### Legacy risks (сохранены)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude Desktop требует рестарт после plugin install | Medium | Low | См. 7.1 |
| `npm i -g` без sudo silent fail | High | Medium | Postinstall fail-soft + install-diagnostics skill детектит. **NB:** в v2 postinstall удаляется целиком (canonical install — без npm), риск становится N/A |
| Migration v1→v2 теряет user-mods при auto-overwrite | Medium | High | См. 2.2 — backup в `.user-overrides/` (pattern из `updater-managed-cleanup` rule) |
| `.git/info/exclude` не существует если в проекте нет `.git/` | Low | Medium | Pre-flight check; canonical install не пишет в project (cache в `~/.claude/plugins/`), риск становится N/A для v2 |
| MCP `--scope user` баг (#54803) | Low | Medium | См. 3.1 |
| Существующие cursor-using teams breaking при v2 upgrade | Low | Low | См. 4.2 |
