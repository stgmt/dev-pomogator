# Design

## Реализуемые требования

- [FR-1: Canonical plugin layout](FR.md#fr-1-canonical-plugin-layout)
- [FR-2: Marketplace catalog](FR.md#fr-2-marketplace-catalog-claude-pluginmarketplacejson)
- [FR-3: Distribution через `/plugin marketplace add`](FR.md#fr-3-distribution-через-plugin-marketplace-add)
- [FR-4: Install через `/plugin install`](FR.md#fr-4-install-через-plugin-install-dev-pomogatorstgmt)
- [FR-5: Scope-aware install](FR.md#fr-5-scope-aware-install-userprojectlocal)
- [FR-6: Activation через `/reload-plugins`](FR.md#fr-6-activation-через-reload-plugins)
- [FR-7: Migration v1 → v2](FR.md#fr-7-migration-v1-v2-documentation--optional-cleanup-script)
- [FR-8: Cursor support removal](FR.md#fr-8-cursor-support-removal)
- [FR-9: Single canonical plugin manifest](FR.md#fr-9-single-canonical-plugin-manifest)
- [FR-10: Update path](FR.md#fr-10-update-path-через-plugin-marketplace-update)
- [FR-11: Desktop compatibility](FR.md#fr-11-desktop-compatibility-via-canonical-ui)
- [FR-12: Uninstall](FR.md#fr-12-uninstall-via-plugin-uninstall)

## Компоненты

- **`buildCanonicalPlugin()`** (`src/installer/plugin-canonical.ts`) — build-time aggregator. Читает `extensions/*/extension.json`, генерирует `.claude-plugin/plugin.json` + копирует skills/rules/commands/hooks/mcp в canonical paths repo. Запускается через `npm run build:plugin`. Pure function (read source manifests + write canonical artifacts), no runtime.
- **`marketplace.json`** (`.claude-plugin/marketplace.json`) — static catalog file, hand-maintained или generated. Объявляет dev-pomogator plugin available для install. Schema per Anthropic plugin-marketplaces.md.
- **`migrate-v1-to-v2.ts`** (`tools/migrate-v1-to-v2.ts`) — standalone cleanup script для пользователей переходящих с v1. User-driven (запускается explicitly), не часть plugin install flow.
- **Anthropic-managed components** (no dev-pomogator code):
  - Plugin install/uninstall/update lifecycle
  - `enabledPlugins` settings.json updates
  - Cache management в `~/.claude/plugins/cache/`
  - Reload mechanism
  - Desktop UI integration

## Где лежит реализация

- Build-time:
  - `src/installer/plugin-canonical.ts` (NEW) — `buildCanonicalPlugin()` aggregator
  - `src/installer/extensions.ts` (EDIT) — refactor existing aggregation logic в shared utility, используется plugin-canonical.ts
- Plugin artifacts (committed в repo):
  - `.claude-plugin/plugin.json` (NEW or UPDATE) — canonical plugin manifest
  - `.claude-plugin/marketplace.json` (NEW) — marketplace catalog
  - `skills/<name>/SKILL.md` — aggregated skills (mirror `.claude/skills/`)
  - `commands/*.md` — aggregated commands
  - `hooks/hooks.json` — aggregated hooks
  - `.mcp.json` — aggregated MCP servers
  - `agents/*.md` — aggregated agents (where applicable)
- Migration utility:
  - `tools/migrate-v1-to-v2.ts` (NEW) — v1 cleanup script
- Documentation:
  - `README.md` (EDIT) — install commands, migration guide, Desktop integration
  - `CLAUDE.md` (EDIT) — architecture notes, development workflow
  - `.specs/dev-pomogator-canonical-plugin/CHANGELOG.md` (UPDATE) — v2.0 BREAKING + migration steps
- Tests:
  - `tests/e2e/canonical-plugin-build.test.ts` (NEW) — assertions на `buildCanonicalPlugin()` output
  - `tests/e2e/marketplace-json.test.ts` (NEW) — schema validation
  - `tests/e2e/migration-v1-to-v2.test.ts` (NEW) — cleanup script behavior
  - `tests/e2e/cursor-removal.test.ts` (NEW) — regression
  - `tests/features/dev-pomogator-canonical-plugin.feature` (UPDATE) — BDD scenarios

## Директории и файлы

### dev-pomogator repo (source-of-truth + plugin distribution)

```
dev-pomogator/
├── .claude-plugin/
│   ├── plugin.json          ← canonical plugin manifest
│   └── marketplace.json     ← marketplace catalog (NEW в v2)
├── skills/                   ← canonical skills tree (built from .claude/skills/)
│   └── <name>/SKILL.md
├── commands/                 ← canonical commands
├── hooks/
│   └── hooks.json            ← aggregated hooks
├── .mcp.json                 ← aggregated MCP
├── agents/                   ← где applicable
├── extensions/               ← source-of-truth для build (preserved)
│   └── <ext-name>/extension.json
├── src/                      ← build tools (TypeScript)
│   └── installer/plugin-canonical.ts
├── tools/
│   └── migrate-v1-to-v2.ts   ← standalone migration utility
├── package.json              ← npm package (deprecated install path; build tooling only)
└── README.md
```

### User's filesystem after canonical install

```
~/.claude/
├── plugins/
│   └── cache/
│       └── stgmt/
│           └── dev-pomogator/
│               └── 2.0.0/    ← Claude Code clones repo here
│                   ├── .claude-plugin/plugin.json
│                   ├── skills/<name>/SKILL.md
│                   ├── commands/*.md
│                   ├── hooks/hooks.json
│                   └── .mcp.json
└── settings.json             ← contains enabledPlugins entry
```

## Алгоритм

### Canonical install flow (first-time)

1. dev-pomogator team bumps `version` in `.claude-plugin/marketplace.json` AND `.claude-plugin/plugin.json` синхронно
2. Push to GitHub (или whatever source repo)
3. User: `/plugin marketplace add stgmt/dev-pomogator`
   - Claude Code clones repo (HTTPS git clone)
   - Reads `.claude-plugin/marketplace.json`
   - Validates schema per Anthropic plugin-marketplaces.md
   - Adds entry в settings.json `enabledMarketplaces`
4. User: `/plugin install dev-pomogator@stgmt [--scope user|project|local]`
   - Claude Code reads `marketplace.json` plugin entry для resolve `source` (`./` = same repo as marketplace)
   - Reads `.claude-plugin/plugin.json` для validate
   - Copies plugin tree в `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`
   - Adds `"dev-pomogator@stgmt": true` в `enabledPlugins` соответствующего scope settings.json
5. User: `/reload-plugins` (CLI) или restart Desktop
   - Claude Code re-scans `enabledPlugins`
   - Activates skills/commands/hooks/MCP из cached plugin tree

### Update flow

1. dev-pomogator team bumps version + push
2. User: `/plugin marketplace update stgmt`
   - Claude Code re-fetches marketplace.json
   - Detects version diff
   - Prompts user для re-install (или auto-update в зависимости от Claude Code config)
3. User: confirms update OR runs `/plugin install dev-pomogator@stgmt` повторно
4. User: `/reload-plugins` (CLI) или restart Desktop

### Migration v1 → v2 flow (user-driven, optional)

1. User читает CHANGELOG.md migration section
2. User делает один из:
   - **Manual cleanup**: удаляет `.claude/skills/<dev-pomogator-managed>/`, `.claude/rules/<dev-pomogator-managed>/`, `.dev-pomogator/`, marker block из `.gitignore`
   - **Script cleanup**: `npx tsx https://raw.githubusercontent.com/stgmt/dev-pomogator/main/tools/migrate-v1-to-v2.ts` (или клонирует repo и запускает локально)
3. Script:
   - Detects v1 install через `<cwd>/.dev-pomogator/.claude-plugin/plugin.json` version<2.0.0
   - Backups user-modifications в `.user-overrides/`
   - Removes managed project files
   - Cleans `.gitignore` block
   - Smart-merges removal из `.claude/settings.local.json`
   - Prints canonical install commands
4. User делает `/plugin marketplace add stgmt/dev-pomogator` + `/plugin install`

### Build flow (для maintainers)

1. dev-pomogator developer редактирует `extensions/<ext>/extension.json` или `.claude/skills/<name>/SKILL.md`
2. `npm run build:plugin`:
   - `buildCanonicalPlugin()` reads все 26 extension manifests
   - Aggregates skills/commands/hooks/mcp в canonical layout
   - Writes `.claude-plugin/plugin.json` + skills/, commands/, hooks/hooks.json, .mcp.json в repo root
   - Updates `version` field synchronized в обоих manifestах
3. `git commit && git push` — users получат update через `/plugin marketplace update stgmt` (FR-10)

## API

Этот плагин не экспортирует HTTP/network API. Внутренний build-time TypeScript API:

### `buildCanonicalPlugin(): Promise<BuildResult>`

- Input: none (читает `extensions/*/extension.json` из текущего repo)
- Output: `BuildResult { manifest: PluginManifest, marketplace: MarketplaceManifest, writtenPaths: string[], skippedPaths: string[] }`
- Side effects: writes `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/<name>/SKILL.md`, `commands/*.md`, `hooks/hooks.json`, `.mcp.json` в repo root
- Idempotent: re-running с unchanged sources → no-op (content hash compare)
- Pure read of source: НЕ читает `~/.claude/`, не пишет вне repo

### `runMigrationV1ToV2(projectPath: string, opts?): Promise<MigrationResult>`

- Input: absolute project path, optional `{ dryRun?: boolean, noBackup?: boolean }`
- Output: `MigrationResult { detectedV1Version: string, removedFiles: string[], backupFiles: string[], gitignoreBlockRemoved: boolean, settingsLocalUpdated: boolean, exitCode: 0 | 1 }`
- Side effects: removes project-scope managed files, creates `.user-overrides/` backups, cleans `.gitignore`, smart-merges `.claude/settings.local.json`
- Idempotent: re-running после cleanup → no-op (no v1 detected, exit 0 with informational message)

## Key Decisions

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2. Hook `design-decision-guard` enforces format:
> each `### Decision:` block must include **Rationale:**, **Trade-off:**, **Alternatives considered:** with ≥2 `- {alt}` bullets.

### Decision: Distribution через canonical Anthropic marketplace, не npm

**Rationale:** Anthropic plugin spec (verified per plugins.md, plugins-reference.md, plugin-marketplaces.md, discover-plugins.md) определяет canonical install path: `/plugin marketplace add` + `/plugin install`. Это:
- Работает в Desktop (UI «+» button → Plugins) — verified via `desktop-quickstart.md`
- Управляет `enabledPlugins` field automatically (file placement alone insufficient — verified via discover-plugins.md `/reload-plugins` quote)
- Cache + version management через Claude Code, не custom npm postinstall logic
- Совместимо с future Anthropic features (auto-updates, marketplace search, plugin browsing)

**Trade-off:** Breaking change для existing v1 users (manual migration steps). npm-based install path выпиливается полностью; users которые ожидают `npm i -g dev-pomogator` нужно re-onboard через CHANGELOG instructions. Mitigation: explicit migration script (FR-7).

**Alternatives considered:**
- npm i -g + postinstall script (старый v2 design) — rejected потому что: postinstall не canonical per Anthropic; не управляет `enabledPlugins`; не работает в Desktop; AP-2 (Distribution misassumption) lesson learned
- Hybrid (npm для одних users, marketplace для других) — rejected потому что split-brain confusion; double maintenance; install behavior зависит от user choice непредсказуемо
- npm install только marketplace utility (semi-canonical) — rejected потому что добавляет npm зависимость без value; canonical install уже user-friendly

### Decision: Migration v1→v2 — documentation-first, optional script

**Rationale:** Canonical plugin install flow (Anthropic-managed) НЕ может писать в project files (cache живёт в `~/.claude/plugins/cache/`). Поэтому migration v1 cleanup НЕ может быть автоматической частью `/plugin install`. Documentation explicit + standalone script — единственный canonical путь. Script user-driven, может быть запущен через `npx tsx` без install dependencies.

**Trade-off:** Пользователи должны прочитать CHANGELOG и явно запустить cleanup. Не автоматическое UX. Mitigation: clear instructions в CHANGELOG, README, и в первом launch плагина (если возможно — добавить hint в SKILL описании).

**Alternatives considered:**
- Auto-migration на первом `/plugin install` — невозможно потому что plugin install не имеет write access к project files
- npm migration tool (legacy npm package) — rejected потому что добавляет split distribution; users должны помнить два install commands
- Skip migration support — rejected потому что v1 пользователей нужно поддержать; user-overrides backup сохраняет их кастомизации

### Decision: Default scope = user (matches Anthropic default)

**Rationale:** Per plugin-marketplaces.md: «User scope (default): install for yourself across all projects». dev-pomogator не переопределяет default — следует Anthropic convention. User-scope:
- Доступно во всех проектах пользователя
- Видно в Claude Desktop через canonical UI
- Не требует team coordination

**Trade-off:** Команды которым нужен team-shared install (committed в `.claude/settings.json`) должны явно использовать `--scope project`. Это canonical Anthropic behavior, dev-pomogator не custom override.

**Alternatives considered:**
- Default = project (как старая v1) — rejected потому что diverges from Anthropic convention; пользователи привыкшие к canonical install будут confused
- Default = local (per-repo, не shared) — rejected потому что too narrow для typical use case; user обычно хочет cross-project availability

### Decision: dev-pomogator repo serves dual role — marketplace AND plugin source

**Rationale:** Simplest distribution model. Один git repo:
- Содержит `.claude-plugin/marketplace.json` со списком плагинов (один плагин в нашем случае — dev-pomogator)
- Plugin source = `./` (same repo as marketplace, per Anthropic relative path source format)
- User делает `/plugin marketplace add stgmt/dev-pomogator` (один шаг setup) → потом `/plugin install dev-pomogator@stgmt`

**Trade-off:** Если в будущем dev-pomogator team хочет split на multiple plugins (например, dev-pomogator-core + dev-pomogator-tui-runner) — нужно reorganize repo. Mitigation: marketplace.json supports multiple plugin entries; split можно сделать через relative paths (`./plugins/<plugin-name>/`) если нужно.

**Alternatives considered:**
- Separate marketplace repo (stgmt/claude-marketplace) + plugin repo (stgmt/dev-pomogator) — rejected потому что adds complexity для single-plugin use case; user setup требует понимания two repos
- Marketplace репо где dev-pomogator — один из многих плагинов community — rejected потому что добавляет maintenance overhead и слабее brand; pure dev-pomogator repo cleaner

### Decision: Version sync — single source of truth + pre-commit enforcement

> Added 2026-05-23 as mitigation Top-5 risk #1.

**Rationale:** `buildCanonicalPlugin()` читает версию из ОДНОГО источника (`package.json:version`) и atomically пишет ту же версию в `.claude-plugin/plugin.json` И `.claude-plugin/marketplace.json/plugins[0].version`. Pre-commit hook бежит build; CI test в PR проверяет no-drift. Без этого manual edit одного файла создаёт phantom updates у users — proof: существующий v1 `.dev-pomogator/.claude-plugin/plugin.json:3 = 1.5.0` уже out-of-sync с `package.json` (different file lifecycle).

**Trade-off:** Lock-step coupling между npm version и plugin version — features не bugs (consistency guarantee). Bump = run build перед коммитом; pre-commit hook делает это автоматически (`git add` обновлённых артефактов).

**Alternatives considered:**
- Manual bump в обоих файлах с trust dev-discipline — rejected, observed history разсинхронизуется без enforcement.
- Separate version в plugin.json (independent от npm) — rejected, two-source усложняет release; users проще ассоциировать одну версию.

### Decision: Schema validation в build — fail-fast перед commit

> Added 2026-05-23 as mitigation Top-5 risk #3.

**Rationale:** `buildCanonicalPlugin()` валидирует каждый сгенерированный artifact против Anthropic schemas (известных по `plugins-reference.md` + `plugin-marketplaces.md`). Если ошибка — exit non-zero до записи на диск; dev видит exact error message с field+location. Без этого ошибка проявится только в Desktop UI как silent skip.

**Trade-off:** Anthropic schemas могут эволюционировать; наш hardcoded schema может застаревать. Mitigation: schema references published Anthropic docs URL + date verified в комментарии; CHANGELOG fixируется при schema-update bumps.

**Alternatives considered:**
- Trust JSON.stringify output без validation — rejected per Top-5 #3.
- Validate только в CI, не локально — rejected: dev должен видеть error до push.
- Anthropic-provided validator (если npm-published) — checked 2026-05-23 — нет. Используем local JSON Schema validator (`ajv` уже в devDeps).

### Decision: Cross-platform migration script — defensive coding, без automated Windows test

> Added 2026-05-23 as mitigation Top-5 risk #5.

**Rationale:** Migration script (`tools/migrate-v1-to-v2.ts`) использует только: `path.join()` / `path.resolve()`, `glob` package с native sep handling, `fs.promises` API. НЕ string-concat для путей. **Automated cross-platform CI ВНЕ scope этой итерации** — Docker test infra только Linux (`tests/setup/ensure-docker.ts:14` enforces). Manual cross-platform smoke перед release (developer запускает script на Windows локально, документирует в release runbook).

**Trade-off:** Windows-specific bugs могут проскочить (например, CRLF line endings в `.gitignore` handling). Mitigation: release runbook включает manual Windows checklist; первый bug-report от Windows user приоритизируется как hotfix.

**Alternatives considered:**
- Wire up `hyperv-test-runner` skill для автоматизированных Windows VM tests — rejected: pipeline не настроен на 2026-05-23 (skill доступен, setup — отдельная задача).
- Skip Windows support целиком — rejected: cross-platform — baseline (см. `bun-oom-guard` extension для Windows OOM).
- Port на Bash — rejected: TS/Node consistency с остальным codebase.

### Decision: Generated `.claude-plugin/` committed в git с pre-commit regeneration

> Added 2026-05-23 as mitigation Top-5 risk #4 + risk 5.2.

**Rationale:** Marketplace.json `source: "./"` requires `.claude-plugin/plugin.json` exist в clone — иначе `git clone` + `/plugin marketplace add ./` ломается. Поэтому: keep `.claude-plugin/` в git, pre-commit hook regenerate + git add автоматически.

**Trade-off:** Generated файл в git → merge conflict risk при parallel feature dev в разных extensions. Mitigation: pre-commit hook regenerate из source manifests resolves 90% случаев. Если конфликт остался — `npm run build:plugin && git add .claude-plugin/` resolves.

**Alternatives considered:**
- Gitignore `.claude-plugin/`, regenerate в CI release — rejected: `git clone` не даёт рабочий плагин (marketplace `source: "./"` ломается).
- `.gitattributes merge=ours` для `.claude-plugin/` — rejected: silent override чужих изменений, не idiomatic.

### Decision: v1 detection — triple-marker check

> Added 2026-05-23 as mitigation Top-5 risk #2.

**Rationale:** Migration script определяет v1 install по комбинации 3 признаков (boolean confidence): (1) `<project>/.dev-pomogator/.claude-plugin/plugin.json` exists AND `version <2.0`; (2) `~/.dev-pomogator/` exists AND содержит `config.json`; (3) `<project>/.gitignore` содержит managed marker block `# >>> dev-pomogator managed >>>`. Если ≥2 из 3 — HIGH confidence, cleanup runs. Если 1 — partial install, interactive confirm перед cleanup. Если 0 — exit "no v1 install detected".

**Trade-off:** False-positive если user случайно имитировал один из маркеров. Mitigation: interactive confirm на 1-marker case, цена FP — user отказывается, exit.

**Alternatives considered:**
- Single-marker (только `plugin.json` exists) — rejected: partial uninstall edge case даёт false-negative; миграция не запустится.
- Always-run cleanup без detection — rejected: idempotent на v2-only проекте OK, но психологически dev/user пугается "что оно удаляет".

### Decision: Exhaustive Cursor purge — 59 файлов (FR-8a)

> Added 2026-05-23 as mitigation risk 4.1.

**Rationale:** Initial FR-8 underspecified scope. Exhaustive grep 2026-05-23 показал 59 файлов с cursor refs (vs FILE_CHANGES.md заявленных 39 — undercount на 51%). FR-8a explicitly extends с (a) exhaustive grep command (reproducible), (b) категоризация в 6 групп (root / extensions / src / .claude/ rules+commands / tests / scripts), (c) per-file classification в одну из 3 actions (DELETE-content / EDIT-content / KEEP-historical), (d) acceptance ≤5 KEEP-historical files после Phase 3.

**Trade-off:** Phase 3 work expands с ~3 файлов (per orig FILE_CHANGES.md) до ~54 files actual cleanup + ~5 historical-keep. Mitigation: разделить Phase 3 на 3 sub-phases (3a: root + src/, 3b: extensions/, 3c: .claude/ + tests/) — каждая sub-phase shippable independently.

**Alternatives considered:**
- Stick с orig FR-8 (3-файла scope) — rejected: leaves 56 файлов с stale cursor refs, partial cleanup gives false sense of completeness.
- Delete cursor-related tests целиком (тесты `cursor-dead-code-cleanup.test.ts` и `CORE018_cursor-dead-code-cleanup.feature`) — rejected: эти тесты protect regression (verify cursor support DOESN'T return), оставляем под KEEP-historical.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

> Секция НЕ может быть удалена.

**TEST_DATA:** TEST_DATA_NONE
**TEST_FORMAT:** BDD
**Framework:** vitest (TS) — используется для e2e тестов с BDD-style describe/it имитирующими Gherkin сценарии
**Install Command:** already installed (`vitest@^4.1.0` в `package.json` devDependencies)
**Evidence:** `package.json:59` — `"vitest": "^4.1.0"`; existing `tests/e2e/*.test.ts` patterns (e.g. `tests/e2e/doctor-core.test.ts`)
**Verdict:** TEST_DATA_NONE — фича не создаёт persistent данные требующие cleanup. Каждый тест работает в isolated tmp directory (existing pattern), создаёт fixture, запускает migration script или validates build output, tmp dir удаляется автоматически. No hooks required.

**Test scope changes vs old v2 spec:**
- DROPPED: postinstall test (no postinstall в новой архитектуре)
- DROPPED: git-exclude writer test (no .git/info/exclude в новой архитектуре)
- DROPPED: gitignore-marker config test (no project file writes)
- ADDED: marketplace.json schema validation test
- ADDED: buildCanonicalPlugin output validation test
- KEPT: migration script test (re-scoped — теперь cleanup-only, не copy-to-user-scope)
- KEPT: cursor-removal regression test
