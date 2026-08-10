# Design

## Реализуемые требования

- [FR-1: Canonical plugin layout](FR.md#fr-1-canonical-plugin-layout)
- [FR-2: Marketplace catalog](FR.md#fr-2-marketplace-catalog-claude-pluginmarketplacejson)
- [FR-3: Distribution через `/plugin marketplace add`](FR.md#fr-3-distribution-через-plugin-marketplace-add)
- [FR-4: Install через `/plugin install`](FR.md#fr-4-install-через-plugin-install-dev-pomogatorstgmt)
- [FR-5: Scope-aware install](FR.md#fr-5-scope-aware-install-userprojectlocal)
- [FR-6: Activation через `/reload-plugins`](FR.md#fr-6-activation-через-reload-plugins)
- [FR-7: Migration v1 → v2](FR.md#fr-7-migration-v1-v2-documentation-optional-cleanup-script)
- [FR-8: Cursor support removal](FR.md#fr-8-cursor-support-removal)
- [FR-9: Single canonical plugin manifest](FR.md#fr-9-single-canonical-plugin-manifest)
- [FR-10: Update path](FR.md#fr-10-update-path-через-plugin-marketplace-update)
- [FR-11: Desktop compatibility](FR.md#fr-11-desktop-compatibility-via-canonical-ui)
- [FR-12: Uninstall](FR.md#fr-12-uninstall-via-plugin-uninstall)

## Компоненты

- **`.claude-plugin/plugin.json`** + **`.claude-plugin/hooks.json`** + **`.claude-plugin/marketplace.json`** — три hand-authored canonical manifest файла в repo root. Поддерживаются вручную (committed static files), не генерируются build-step'ом. `plugin.json` — canonical plugin manifest; `hooks.json` — aggregated hooks config; `marketplace.json` — catalog объявляющий dev-pomogator plugin available для install. Schema per Anthropic plugin-marketplaces.md.
- **Tools tree** (`tools/<tool>/`) — все tool/hook скрипты лежат top-level в `tools/`. `hooks.json` ссылается на эти on-disk скрипты.
- **Drift test** (`tests/e2e/canonical-plugin.test.ts`) — guard синхронизации между hand-maintained манифестами и реальными on-disk tools. Assert'ит что каждая hook-команда в `hooks.json` резолвится в существующий скрипт под `tools/` (и vice-versa), плюс schema validity манифестов. Замена build-step'а: вместо генерации — verification.
- **`migrate-v1-to-v2.ts`** (`tools/migrate-v1-to-v2/migrate-v1-to-v2.ts`) — standalone cleanup script для пользователей переходящих с v1. User-driven (запускается explicitly), не часть plugin install flow.
- **Anthropic-managed components** (no dev-pomogator code):
  - Plugin install/uninstall/update lifecycle
  - `enabledPlugins` settings.json updates
  - Cache management в `~/.claude/plugins/cache/`
  - Reload mechanism
  - Desktop UI integration

## Где лежит реализация

- Hand-authored canonical manifests (committed в repo root, maintained вручную):
  - `.claude-plugin/plugin.json` — canonical plugin manifest
  - `.claude-plugin/marketplace.json` — marketplace catalog
  - `.claude-plugin/hooks.json` — aggregated hooks config (ссылается на `tools/<tool>/` скрипты)
- Plugin artifacts (committed в repo):
  - `skills/<name>/SKILL.md` — skills tree
  - `commands/*.md` — commands
  - `.mcp.json` — MCP servers
  - `agents/*.md` — agents (where applicable)
  - `tools/<tool>/` — top-level tool/hook скрипты (после удаления `src/` и `extensions/` это единственное место кода)
- Migration utility:
  - `tools/migrate-v1-to-v2/migrate-v1-to-v2.ts` (NEW) — v1 cleanup script
- Documentation:
  - `README.md` (EDIT) — install commands, migration guide, Desktop integration
  - `CLAUDE.md` (EDIT) — architecture notes, development workflow
  - `.specs/dev-pomogator-canonical-plugin/CHANGELOG.md` (UPDATE) — v2.0 BREAKING + migration steps
- Tests:
  - `tests/e2e/canonical-plugin.test.ts` (NEW) — drift test: каждая hook-команда в `hooks.json` резолвится в on-disk скрипт под `tools/` и vice-versa, + manifest schema validity
  - `tests/e2e/marketplace-json.test.ts` (NEW) — schema validation
  - `tests/e2e/migration-v1-to-v2.test.ts` (NEW) — cleanup script behavior
  - `tests/e2e/cursor-removal.test.ts` (NEW) — regression
  - `tests/features/dev-pomogator-canonical-plugin.feature` (UPDATE) — BDD scenarios

## Директории и файлы

### dev-pomogator repo (source-of-truth + plugin distribution)

```
dev-pomogator/
├── .claude-plugin/
│   ├── plugin.json          ← canonical plugin manifest (hand-authored)
│   ├── marketplace.json     ← marketplace catalog (hand-authored, NEW в v2)
│   └── hooks.json           ← aggregated hooks config (hand-authored)
├── skills/                   ← canonical skills tree
│   └── <name>/SKILL.md
├── commands/                 ← canonical commands
├── .mcp.json                 ← MCP config
├── agents/                   ← где applicable
├── tools/                    ← top-level tool/hook scripts (src/ и extensions/ удалены в v2)
│   ├── <tool>/...            ← скрипты на которые ссылается hooks.json
│   └── migrate-v1-to-v2/migrate-v1-to-v2.ts  ← standalone migration utility
├── tests/e2e/canonical-plugin.test.ts  ← drift test (hooks.json ↔ tools/ sync)
├── package.json              ← npm package (deprecated install path; tooling only)
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
│                   ├── .claude-plugin/hooks.json
│                   ├── skills/<name>/SKILL.md
│                   ├── commands/*.md
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

### Maintenance flow (для maintainers)

Манифеста НЕ генерируются — поддерживаются вручную. При добавлении/изменении skill/command/hook/tool:

1. dev-pomogator developer редактирует `skills/<name>/SKILL.md`, `commands/*.md`, `tools/<tool>/...`, или hook-скрипт
2. Если затронут hook — вручную обновляет `.claude-plugin/hooks.json` (command → on-disk `tools/<tool>/` путь)
3. При release — вручную bump'ит `version` synchronized в `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json`
4. Запускает drift test (`tests/e2e/canonical-plugin.test.ts`) — assert'ит что каждая hooks.json команда резолвится в on-disk скрипт под `tools/` (и vice-versa) + manifest schema validity
5. `git commit && git push` — users получат update через `/plugin marketplace update stgmt` (FR-10)

## API

Этот плагин не экспортирует public HTTP/network API. Внутренний local HTTP hook-service transport is specified by FR-15–FR-24; it is not a public plugin API. Build-step нет (манифеста hand-authored). Внутренний TypeScript API — drift test + migration:

### Drift test (`tests/e2e/canonical-plugin.test.ts`)

- Input: none (читает `.claude-plugin/hooks.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` + сканирует on-disk `tools/`)
- Assertions:
  - Каждая hook-команда в `hooks.json` резолвится в существующий on-disk скрипт под `tools/`
  - Каждый hook-скрипт под `tools/` (который должен быть зарегистрирован) присутствует в `hooks.json` (vice-versa)
  - `plugin.json`/`marketplace.json`/`hooks.json` schema-valid per Anthropic spec
  - `plugin.json.version` == `marketplace.json plugins[].version`
- Read-only: НЕ пишет файлы, только verification

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

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

> Секция НЕ может быть удалена.

### Decision: Global-only migration preserves project sentinels

**Требование:** [FR-7](FR.md#fr-7-migration-v1-v2-documentation-optional-cleanup-script)

**Rationale:** A global-only repair must not become a disguised project cleanup. A project can contain v1 residue, active v2 configuration, and user recovery material at the same time; observing or rewriting it makes the global operation non-local and can delete recovery evidence.

**Alternatives considered:**
- Permit project inspection in `--global-only` mode — rejected because it turns a global repair into an unbounded project mutation.
- Preserve only paths known to the current implementation — rejected because a new managed path could invalidate the safety guarantee without changing the mode contract.

**Trade-off:** `--global-only` cannot opportunistically clean a project, so users must choose an explicit project-scoped workflow when that is intended. The narrower contract requires byte-for-byte sentinel fixtures for success, dry-run, already-migrated, and failure branches, but makes the global path independently auditable and safe to retry.

**Verification:** `CANON001_101` uses collision-free `.dev-pomogator/**` and `.dev-pomogator-v1-overrides/**` fixtures, compares the full sentinel set byte-for-byte in all four outcomes, and records the resolved `origin/main` commit instead of `HEAD`, worktree, cache, or user-global state.

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
- ADDED: drift test (`canonical-plugin.test.ts`) — hooks.json commands ↔ on-disk tools/ sync + manifest schema validity
- KEPT: migration script test (re-scoped — теперь cleanup-only, не copy-to-user-scope)
- KEPT: cursor-removal

### Decision: Portable shell dispatch and CWD-keyed fail-open doctor

**Требование:** [FR-14](FR.md#fr-14-plugin-hook-commands-are-portable-deps-absent-safe-and-fail-open)

**Rationale:** A canonical plugin runs outside the repository and can be launched by POSIX or Windows shells. Guarding only after Node begins leaves a prohibited host BDD command too late to reject, while a Windows-only executable name or global doctor cache breaks unrelated POSIX and multi-repository sessions.

Canonical plugin and repository dogfood hook entries use a shared POSIX-shell pre-dispatch script. It performs the host-BDD guard before any Node process is created, selects `node` on POSIX and `node.exe` only on Windows, then delegates to the existing target. Doctor state is cached using both Claude Code session identity and canonical project CWD so a verdict cannot bleed into another repository. All doctor transport, parse, and startup errors take the fail-open branch and preserve the target hook invocation.

**Alternatives considered:**
- A Node-first launcher was rejected because it cannot guarantee pre-Node BDD rejection.
- A process-global doctor cache was rejected because CWD changes cause state leakage.
- Fail-closed doctor checks were rejected because diagnostics must not stop ordinary hook work.

**Trade-off:** The dispatch layer is deliberately small and shell-only rather than importing TypeScript diagnostics before selection; this duplicates a narrow amount of argument classification but preserves portability and prevents a broken doctor from becoming a global tool-call outage.

**Verification:** `PLUGINDEPS001_03` invokes the launcher from POSIX and a foreign CWD, proves early host-BDD rejection and `node` selection, proves `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PROJECT_DIR` anchoring rather than process-CWD lookup, and proves permitted work continues when doctor data is unavailable or malformed. The scenario uses the real launcher, not a mocked dispatch function.

## HTTP hook-review policy (FR-15–FR-24)

The shell-free policy has two declarative inputs: `.claude-plugin/hooks.json` is the registration surface and the approved local `tools/hook-review` registry is transport authority. Managed hot-path hooks use `type: "http"`; the registry binds accepted event/matcher pairs to a local route and declares `bearer-env` authentication by variable name. The gate does not contact the route and cannot expose a token.

The gate rejects hot-path `bash`, `sh`, `.sh`, and inline `node -e`, unapproved HTTP routes, and route/event/matcher drift. The documented `SessionStart` plugin-root service bootstrap is the sole command exception. `CORE024_01` covers the negative policy surface; `CORE024_02` proves the approved HTTP plus bootstrap path.

**Trade-off:** local registry metadata adds a review-time source of truth, but makes Windows shell regressions and manifest/registry drift testable without a live service or credential.

### Decision: Supervised command client for recoverable HTTP dispatch

**Требование:** [FR-13](FR.md#fr-13-plugin-hooks-use-one-authenticated-loopback-service)

**Rationale:** Claude Code documents HTTP connection failures as fail-open and provides no retry or fallback field. A bare `http://127.0.0.1:42619` registration therefore loses every hook while the daemon is absent. Generated non-SessionStart registrations use one builtins-only `client.mjs` command. The client reads the exact hook JSON from stdin, invokes existing `ensureUp` before dispatch, authenticates with the persisted service credential, and writes the service response unchanged. On a connection-class exception only, it invokes `ensureUp` again and repeats the same request once. The existing exclusive startup lease coalesces concurrent recovery.

The client treats any received HTTP response as a live-service result and does not restart for 401, 403, 404, or 503. `ensureUp` retains sole process-ownership authority, so the client cannot terminate a foreign listener. After the bounded retry is exhausted, the client appends a redacted transport diagnostic and exits zero with no hook decision, preserving fail-open behavior without exposing `ECONNREFUSED` as work for the user.

**Trade-off:** steady-state hooks start one Node process instead of Claude Code issuing HTTP directly, but avoid shell parsing and recover from daemon loss in the same session. The fixed port remains an explicit local contract; a foreign listener is reported but never killed.

**Alternatives considered:**
- Native HTTP retry was rejected because the documented hook schema has no retry or fallback field.
- SessionStart-only recovery was rejected because it leaves the active session broken until restart.
- Killing the process bound to the fixed port was rejected because ownership cannot be inferred safely from a port.
- Installing an OS-level supervisor was rejected because it adds cross-platform installation and lifecycle complexity.

### Incident hardening: Stop fanout and child memory boundary (2026-07-23)

The incident showed a healthy daemon alongside a failed Stop request: the daemon was only the HTTP boundary; each dispatch still created a fresh Node child, and the host exposed thirteen independent Stop registrations. The selected first-phase fix keeps all thirteen public route IDs and their matcher/order/timeout metadata, but adds a service-local event flight keyed by event plus session_id. The first request runs the complete Stop route set once in numeric registry order; later requests receive only their own route output or failure. A failure in one route therefore does not convert successful sibling routes into a false success or duplicate their side effects.

The legacy adapter remains the execution boundary because current targets include shell/tsx bootstrap, process.exit, and nested cp.spawn behavior that is not safe to place in a persistent worker without an explicit protocol contract. Its stdout and stderr are incrementally bounded at 256 KiB; overflow kills only that child and is reported as a sanitized route diagnostic. This eliminates unbounded capture growth and host-level duplicate Stop execution without pretending that it eliminates every cold child start.

A fixed global concurrency cap (including maxInFlight=2) is rejected: it lowers throughput, does not remove cold-start/bootstrap allocation, and cannot distinguish compatible workers from legacy side-effecting commands. Worker reuse is a separate opt-in phase with compatibility audit, framed protocol, recycle policy, and no retry after uncertain side effects.

### Persistent worker migration: explicit capability boundary

The first-phase Stop coordinator and bounded child capture do not by themselves remove cold runtime allocation. The second phase introduces a supervised worker host behind the existing daemon. The registry is authoritative: execution=persistent is emitted only when a reviewed capability entry names a reusable adapter, protocol, and loader; all routes default to execution=child. A persistent adapter exports handle(input, request), performs no stdin read, argv parsing, process exit, or import-time work, and returns one event-valid object. Legacy scripts are not imported opportunistically.

The worker host loads the adapter once at startup and serves versioned newline-delimited JSON frames containing request_id, route, event, input, and runtime context. The manager serializes each route worker FIFO, starts it lazily, bounds frames at 256 KiB, records worker PID for diagnostics, evicts idle workers, and recycles on timeout, crash, transport/protocol failure, or output overflow. A failed request is never replayed because a side effect may already have happened. The daemon remains healthy and the existing HTTP 503/fail-open policy remains the boundary for the affected request.

This migration eliminates repeated Node/tsx cold starts for every route in the audited persistent capability set. Incompatible routes retain the legacy child adapter intentionally; that fallback is explicit in registry metadata and is not counted as migrated. Adding another persistent route requires a handler audit, worker reuse/FIFO test, recycle/no-retry test, and generated-registry parity evidence.

### Decision: one self-healing Stop dispatcher with request-scoped project execution

**Требование:** [FR-13], [AC-12], [AC-13]

**Rationale:** One self-healing client preserves PR #227 daemon recovery while removing 13 host-visible launches. Explicit per-request project identity is required because a global daemon and persistent workers outlive any one repository.

**Trade-off:** The service owns an aggregation oracle, project-aware flight keys, and serialized legacy fallback, increasing routing complexity. In return, peak Stop fanout is bounded and route behavior remains testably equivalent.

**Alternatives considered:**
- Keep 13 manifest commands and rely only on event coalescing — rejected because the host still launches 13 Node clients under memory pressure.
- Register native HTTP Stop hooks directly — rejected because a dead daemon would bypass the builtins client's same-session self-heal path.
- Disable individual routes or external plugins — rejected because it changes product behavior and does not repair project identity.

**Manifest boundary:** `generate-manifest.mjs` emits one DevPomogator Stop client command targeting a logical Stop group route. The command remains builtins-only and owns ensure-up/retry-on-connection-loss exactly as PR #227 specifies. No code mutates registrations owned by context-mode, claude-mem, or any other plugin.

**Service boundary:** The request envelope carries `{sessionId, projectRoot, eventName, payload}`. A flight key includes the normalized project root, preventing cross-repository coalescing. The Stop group executes logical registry routes in canonical order. Compatible workers are either keyed by project or proven stateless with explicit per-request context; legacy child routes are queued one at a time and retain 256 KiB input/output caps.

**Semantic aggregation boundary:** Before replacing the manifest, an integration fixture captures the Claude-host-observable legacy result matrix for approval, blocking, reason/system message, `additionalContext`, nonzero/invalid output, timeouts, route order, and active stop-loop cases. The dispatcher aggregator is defined by differential equivalence to that oracle, not by an invented merge rule. Any matrix mismatch blocks migration.

**Project/data boundary:** `pluginRoot` locates code only. The current request supplies `projectRoot`; the service forwards it as child CWD and explicit worker context. Startup environment is never authority for later requests. Spec-conformance routes delegate retention and no-spec behavior to spec-generator-v4 FR-83.

**Failure boundary:** A connection-class failure self-heals and retries the request once; a live HTTP error or uncertain worker/child result is never retried. A route failure follows the captured legacy fail-open/block semantics. Service health and unrelated project flights remain available after bounded route failure.
