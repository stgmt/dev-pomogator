# Design

## Реализуемые требования

- [FR-1..FR-25](REQUIREMENTS.md) — все 25 функциональных требований реализуются в едином shared core модуле `src/doctor/` с 3 точками входа (slash / CLI flag / SessionStart hook)

## Компоненты

- `src/doctor/index.ts` — публичное API `runDoctor(options)` возвращающее `DoctorReport`
- `src/doctor/runner.ts` — orchestrator: загружает `config.installedExtensions`, drives per-extension gating (FR-21), запускает checks concurrently с bounded pool (NFR-P-3), применяет timeout (NFR-P-2, P-4)
- `src/doctor/reporter.ts` — форматер output: chalk table для interactive (traffic-light groups per FR-20), JSON для `--json` (FR-24 + FR-25 redaction), hook JSON payload для `--quiet` (FR-17)
- `src/doctor/reinstall.ts` — AskUserQuestion prompt + `spawn('npx', ['dev-pomogator'], {stdio:'inherit', shell:false})` (FR-18)
- `src/doctor/types.ts` — TypeScript interfaces (CheckResult, DoctorOptions, DoctorReport) — детали в [SCHEMA](pomogator-doctor_SCHEMA.md)
- `src/doctor/lock.ts` — file lock через `fs.writeFile(path, pid, {flag:'wx'})` против concurrent runs (NFR-R-4)
- `src/doctor/checks/*.ts` — один файл на FR (14 checks: node, git, home, hooks, env, envExample, bun, python, mcpParse, mcpProbe, version, gitignore, pluginLoader, docker)
- `extensions/pomogator-doctor/extension.json` — manifest: SessionStart hook registration
- `extensions/pomogator-doctor/tools/pomogator-doctor/doctor-hook.ts` — thin wrapper импортирующий `runDoctor({quiet:true})` из shared core
- `extensions/pomogator-doctor/claude/commands/pomogator-doctor.md` — slash command markdown с frontmatter `allowed-tools: [Bash, AskUserQuestion]`
- `src/index.ts` (edit) — добавление `--doctor` / `--json` / `--quiet` / `--extension <name>` flags

## Где лежит реализация

- App-код (shared core): `src/doctor/` (NEW)
- Extension: `extensions/pomogator-doctor/` (NEW)
- CLI wiring: `src/index.ts` (edit, add `--doctor` flag parsing)
- Tests: `tests/features/plugins/pomogator-doctor/*.test.ts` (NEW per-feature) + `tests/e2e/pomogator-doctor.test.ts` (NEW integration)
- Fixtures: `tests/fixtures/pomogator-doctor/` (NEW)

## Директории и файлы

```
src/doctor/
├── index.ts                 # runDoctor(options) public API
├── runner.ts                # orchestrator + per-ext gating
├── reporter.ts              # chalk + JSON + hook output
├── reinstall.ts             # AskUserQuestion + spawn
├── types.ts                 # TypeScript interfaces
├── lock.ts                  # concurrent-run lock
└── checks/
    ├── node-version.ts      # FR-1
    ├── git.ts               # FR-2
    ├── pomogator-home.ts    # FR-3
    ├── hooks-registry.ts    # FR-4
    ├── env-vars.ts          # FR-5 (dual location)
    ├── env-example.ts       # FR-6
    ├── bun.ts               # FR-7 (gated). Reuse: src/installer/memory.ts:checkBunInstalled()
    ├── python.ts            # FR-8 (gated, per-ext packages). Reuse: src/installer/memory.ts:pipInstall() fallback strategy для hint text
    ├── mcp-parse.ts         # FR-9
    ├── mcp-probe.ts         # FR-10 (Full probe)
    ├── version-match.ts     # FR-11
    ├── gitignore-block.ts   # FR-12
    ├── plugin-loader.ts     # FR-13 (4 states)
    └── docker.ts            # FR-14 (gated)

extensions/pomogator-doctor/
├── extension.json           # manifest w/ SessionStart hook + dependencies field
├── tools/pomogator-doctor/
│   └── doctor-hook.ts       # thin wrapper, calls runDoctor({quiet:true})
└── claude/commands/
    └── pomogator-doctor.md  # slash command

src/index.ts                 # edit: add --doctor flag parsing + routing

tests/features/plugins/pomogator-doctor/
├── doctor-core.test.ts      # FR-1..FR-14 (checks)
├── doctor-entry.test.ts     # FR-15..FR-17 (entry points)
├── doctor-reinstall.test.ts # FR-18, FR-19
├── doctor-output.test.ts    # FR-20, FR-23, FR-24, FR-25
└── doctor-gating.test.ts    # FR-21, FR-22

tests/fixtures/pomogator-doctor/
├── fake-mcp-server.ts       # stdio JSON-RPC server для FR-10 probe tests
├── temp-home-builder.ts     # tempdir ~/.dev-pomogator/ builder
└── dotenv-fixtures/
    ├── valid.env
    ├── missing-key.env
    └── malformed.env
```

## Алгоритм (runDoctor)

1. **Lock acquire** — `lock.acquire('~/.dev-pomogator/doctor.lock', {timeout: 30s})` (NFR-R-4). Если lock held and PID alive → exit с `"Another doctor run in progress (PID=X)"`.
2. **Load config once** — `loadConfig()` из `~/.dev-pomogator/config.json` выполняется **однократно** в orchestrator и передаётся readonly как `CheckContext.config` во все checks. Checks НЕ читают config.json повторно. Если corrupt → critical C3 + reinstallable=yes (NFR-R-6).
3. **Grep rules/skills once** — `grep mcp__(\w+)__` по `.claude/rules/**/*.md` + `.claude/skills/**/*.md` выполняется **однократно** в orchestrator, результат (`referencedMcpServers: Set<string>`) передаётся в `CheckContext` для переиспользования FR-9 parse и FR-10 probe.
4. **Per-extension gating** (FR-21): aggregate dependencies из `config.installedExtensions[*].dependencies` (FR-22) → compute set relevant check IDs.
5. **Concurrent checks** (NFR-P-3): Promise.allSettled([relevant checks]) с bounded pool p-limit=8. Separate pool для MCP probes (p-limit=4, combined timeout=3s per server для initialize + tools/list handshake, **не 3s per JSON-RPC message**).
6. **Global timeout** (NFR-P-4): AbortController с 15s. On timeout → abort all, SIGKILL MCP children.
7. **Aggregate results**: CheckResult[], group by severity (ok/warning/critical) and `reinstallable`.
8. **Reinstall decision** (FR-18): if mode=interactive AND count(critical + reinstallable) ≥ 1 AND no `--json`/`--quiet` → AskUserQuestion → spawn installer on "Reinstall now".
9. **Report**: reporter.format(results, mode) → chalk / JSON / hook payload.
10. **Lock release** в finally block.
11. **Exit code** (FR-23): 0/1/2 по severities.

### CheckContext (shared state для checks)

```typescript
interface CheckContext {
  config: DevPomogatorConfig;              // loaded once (step 2)
  referencedMcpServers: Set<string>;       // grep result (step 3)
  installedExtensions: ExtensionManifest[]; // parsed from config.installedExtensions
  projectRoot: string;
  homeDir: string;
  signal: AbortSignal;                     // global timeout
}
```

Каждый check получает `ctx: CheckContext` как первый аргумент. Это устраняет N+1 fs reads (14 checks × loadConfig).

## Reinstall Decision Logic

```typescript
const reinstallable = results.filter(r => r.severity !== 'ok' && r.reinstallable);
const manual = results.filter(r => r.severity !== 'ok' && !r.reinstallable);

if (options.interactive && !options.json && !options.quiet && reinstallable.length > 0) {
  const summary = reinstallable.slice(0, 3).map(r => `${r.name}`).join(', ');
  const answer = await AskUserQuestion({
    question: `Found ${reinstallable.length} problem(s) that can be fixed by reinstall: ${summary}${reinstallable.length > 3 ? '...' : ''}. Run 'npx dev-pomogator' now?`,
    options: [
      { label: 'Reinstall now', description: 'Spawn npx dev-pomogator with stdio:inherit' },
      { label: 'Show details only', description: 'Continue without reinstall' }
    ]
  });
  if (answer === 'Reinstall now') {
    const child = spawn('npx', ['dev-pomogator'], { stdio: 'inherit', shell: false });
    await once(child, 'exit');
  }
}
// manual findings ВСЕГДА показываются в output — переустановка не поможет
if (manual.length > 0) reporter.emitNonReinstallableBlock(manual);
```

## MCP Full Probe Protocol

```
1. Parse .mcp.json + ~/.claude/mcp.json → map<serverName, {command?, args?, url?}>
2. Grep .claude/rules/**/*.md + .claude/skills/**/*.md for mcp__(\w+)__ → referencedServers
3. For each (name in referencedServers):
   - if name not in parsed config → FR-9 warning (skip probe)
   - else → spawn or fetch:
     stdio: spawn(config.command, config.args, {stdio:['pipe','pipe','pipe']})
     http: fetch(config.url, {method:'POST', body: JSON.RPC initialize})
   - send JSON-RPC:
     {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"pomogator-doctor"}}}
   - send initialize + await response + send tools/list + await response within **combined AbortController(3000ms)** (not per-message — 3s total для всего initialize+tools/list handshake)
   - if both respond with valid JSON-RPC in combined budget → ok
   - if combined timeout exceeded or error → child.kill('SIGKILL') + critical
4. Always cleanup in finally: child.kill() if alive
```

## API

### Public API: runDoctor(options)

- Method: TypeScript function
- Path: `src/doctor/index.ts`
- Signature: `async function runDoctor(options: DoctorOptions): Promise<DoctorReport>`
- Options (details в [SCHEMA](pomogator-doctor_SCHEMA.md)):
  - `interactive?: boolean` — default true для CLI, false для hook
  - `quiet?: boolean` — JSON hook payload only
  - `json?: boolean` — machine-readable JSON, no chalk
  - `extension?: string` — filter checks для конкретного ext
  - `timeout?: number` — override global timeout (default 15000ms)

### Slash command: /pomogator-doctor

- Trigger: пользователь вводит `/pomogator-doctor` в Claude Code
- Behavior: markdown инструкция Claude-у → spawn `dev-pomogator --doctor`

### CLI: dev-pomogator --doctor

- Method: CLI flag в `src/index.ts`
- Flags: `--doctor`, `--json`, `--quiet`, `--extension <name>`

### SessionStart hook

- Method: Claude Code SessionStart lifecycle hook
- Path: зарегистрирован через `extensions/pomogator-doctor/extension.json`
- Command: `node -e "require(...tsx-runner-bootstrap.cjs)(...)" -- ".dev-pomogator/tools/pomogator-doctor/doctor-hook.ts" --quiet`
- Response: stdout одна строка JSON per Claude Code hook protocol

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE

**Evidence:** (1) Doctor читает/пишет `~/.dev-pomogator/config.json` в integration tests — создаём/удаляем; (2) MCP probe тесты spawn-ят fake MCP server — нужен lifecycle; (3) Dotenv fixtures меняют `process.env` — нужен rollback; (4) Reinstall tests spawn-ят fake installer — нужно откатить state. Все 4 вопроса = ДА.

**Verdict:** Нужны новые hooks: (a) tempHome setup/teardown per-feature, (b) fakeMcpServer setup/teardown per-scenario, (c) envSnapshot setup/teardown per-scenario, (d) child-process registry для reliable SIGKILL в After.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts:runInstaller` | helper (not hook) | any | spawnSync installer для integration tests | Да — переиспользовать для reinstall tests |
| `tests/e2e/helpers.ts:runInstallerViaNpx` | helper | any | содержит inline `mkdtempSync` для temp project — **нужно extract and export `createTempProject()`** в отдельный helper либо использовать `fs.mkdtempSync(path.join(os.tmpdir(), 'pomogator-doctor-'))` inline в fixtures | Partial — требует extract refactor в helpers.ts (see TASKS Phase 0) |
| Нет dedicated BDD hooks в текущем проекте | — | — | vitest с `beforeEach`/`afterEach`, не Cucumber | Частично — pattern тот же |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/fixtures/pomogator-doctor/temp-home-builder.ts` | beforeEach/afterEach per-test | `@doctor-home` | mkdtemp `~/.dev-pomogator-test-XXXX/`, write stub config.json + tsx-runner-bootstrap.cjs, setenv HOME/USERPROFILE | `mkTempProject` helper |
| `tests/fixtures/pomogator-doctor/fake-mcp-server.ts` | beforeEach/afterEach per-test | `@mcp-probe` | spawn local stdio JSON-RPC server отвечающий на initialize+tools/list, return port/socket path. afterEach: SIGKILL + wait exit | N/A — новый |
| `tests/fixtures/pomogator-doctor/env-snapshot.ts` | beforeEach/afterEach per-test | `@env-aware` | snapshot process.env keys, apply fixture .env content через dotenv, afterEach restore | N/A — новый |
| `tests/fixtures/pomogator-doctor/child-registry.ts` | beforeAll/afterAll per-file | global | track all spawn'ed children в Set, afterAll → SIGKILL все выжившие | NFR-R-5 SIGKILL cleanup |

### Cleanup Strategy

Порядок cleanup (reverse of setup) в `afterEach`:

1. **env-snapshot**: restore process.env keys изменённые dotenv load
2. **fake-mcp-server**: SIGKILL каждый spawned server, await `once(child, 'exit')` с 2s timeout, если не завершился — log warning (не fail test)
3. **temp-home-builder**: fs.rm recursive temp dir. ENOENT → ignore (тест возможно удалил сам).
4. **child-registry** (afterAll file-level): SIGKILL любые orphan children которые не попали в per-test cleanup.

Каскадные зависимости: fake-mcp-server может spawn nested children (через JSON-RPC server's code) — registry track их transitively.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| `temp-home (valid)` | `tests/fixtures/pomogator-doctor/temp-home-builder.ts` | full valid `~/.dev-pomogator/` с config.json, scripts/, tools/auto-commit/ | per-scenario |
| `temp-home (missing-tools)` | same builder с option `skipTools:true` | config.json есть, но tools/ пуст — FR-3 critical | per-scenario |
| `temp-home (corrupt-config)` | same builder с option `corruptConfig:true` | config.json = invalid JSON — NFR-R-6 | per-scenario |
| `fake-mcp-server (responsive)` | `tests/fixtures/pomogator-doctor/fake-mcp-server.ts` | отвечает на initialize+tools/list в 100ms | per-scenario |
| `fake-mcp-server (hanging)` | same with `hangOnInit:true` | accept initialize но never respond — FR-10 timeout | per-scenario |
| `fake-mcp-server (crashing)` | same with `crashOnInit:true` | process.exit(1) после initialize — FR-10 external | per-scenario |
| `dotenv-fixtures/valid.env` | `tests/fixtures/pomogator-doctor/dotenv-fixtures/valid.env` | содержит AUTO_COMMIT_API_KEY=sk-test-fake-key [VERIFIED: extensions/auto-commit/extension.json envRequirements] | per-scenario |
| `dotenv-fixtures/missing-key.env` | same dir | missing AUTO_COMMIT_API_KEY | per-scenario |
| `dotenv-fixtures/malformed.env` | same dir | `MALFORMED LINE\nAUTO_COMMIT_API_KEY=test` — тест parser resilience | per-scenario |
| `plugin.json (all-declared)` | inline в test | все commands + skills в plugin.json | per-scenario |
| `plugin.json (broken-missing)` | inline | declared but нет на диске — FR-13 BROKEN-missing | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tempHomeDir` | `string` | `temp-home-builder.ts:beforeEach` | FR-3/FR-4/FR-11/FR-12 checks в тесте | path к temp `~/.dev-pomogator/` |
| `fakeMcpServers` | `Map<name, ChildProcess>` | `fake-mcp-server.ts:beforeEach` | FR-10 probe tests + afterEach cleanup | tracking spawned MCP stdio procs |
| `envSnapshot` | `Record<string, string \| undefined>` | `env-snapshot.ts:beforeEach` | `afterEach` restore | отслеживание изменённых env keys |
| `spawnedChildren` | `Set<ChildProcess>` | `child-registry.ts:beforeAll` | все tests + `afterAll` cleanup | global SIGKILL safety net |
| `tempProjectDir` | `string` | `mkTempProject` (existing helper) | FR-12 gitignore tests + reinstall tests | path к temp project |

## External Service Verification

| Сервис | Используется в | Verification source | Status |
|--------|---------------|---------------------|--------|
| `AUTO_COMMIT_API_KEY` env var | FR-5 dual location check, dotenv fixtures | `extensions/auto-commit/extension.json` envRequirements[0] (required=true) — existing extension, env var shipped to end users | [VERIFIED: extension.json в кодовой базе] |
| MCP JSON-RPC protocol (initialize + tools/list) | FR-10 Full probe | [Anthropic MCP specification](https://modelcontextprotocol.io/specification) — stable протокол с 2024-11-05 | [VERIFIED: Anthropic MCP spec] |
| Node.js `child_process.spawn` | FR-10 (stdio MCP), FR-18 (reinstall), FR-7 (bun --version), etc. | [Node.js docs child_process](https://nodejs.org/api/child_process.html) | [VERIFIED: Node 22+ docs] |
| `process.kill(pid, 'SIGKILL')` cross-platform | FR-10 probe timeout cleanup | Node docs — Windows имеет эквивалент через taskkill, но `child.kill('SIGKILL')` работает через libuv | [VERIFIED: Node process docs] |
| Claude Code SessionStart hook JSON protocol | FR-17 | Claude Code docs + реальный пример `extensions/claude-mem-health/tools/claude-mem-health/health-check.ts` | [VERIFIED: живой код в repo] |
| AskUserQuestion tool | FR-18 reinstall prompt | Claude Code internal tool, frontmatter `allowed-tools: [AskUserQuestion]` в slash command markdown | [VERIFIED: есть в allowed-tools list existing commands] |
| `fs.writeFile(path, data, {flag:'wx'})` atomic lock | NFR-R-4 | Node docs: wx = O_CREAT \| O_EXCL — atomic create-if-not-exists | [VERIFIED: Node fs docs, rule `atomic-update-lock`] |
| Claude Code plugin-loader dynamic registration (`~/.claude/plugins/`) | FR-13 OK-dynamic state | Исследование показало директория существует у юзера с установленным plugin.json, но точный формат регистрации НЕ подтверждён через official docs | [UNVERIFIED — требуется проверка на живом юзере или Claude Code docs lookup перед implementation] |
