# Fixtures

## Overview

Doctor — extension с интенсивным interaction с файловой системой, `process.env`, child processes и external services (MCP servers). Классификация [BDD Test Infrastructure](DESIGN.md#bdd-test-infrastructure-обязательно) = TEST_DATA_ACTIVE → нужны 10 фикстур с явным lifecycle.

Фикстуры разделены на 4 категории: temp-home variants (5), fake-mcp-server variants (3), dotenv variants (3), plugin.json variants (2).

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | temp-home (valid) | factory | `tests/fixtures/pomogator-doctor/temp-home-builder.ts` | per-scenario | `beforeEach` hook |
| F-2 | temp-home (missing-tools) | factory | same builder, opts `{skipTools:true}` | per-scenario | `beforeEach` hook |
| F-3 | temp-home (stale-hooks) | factory | same builder, opts `{hooksDivergent:true}` | per-scenario | `beforeEach` hook |
| F-4 | temp-home (corrupt-config) | factory | same builder, opts `{corruptConfig:true}` | per-scenario | `beforeEach` hook |
| F-5 | temp-home (version-mismatch) | factory | same builder, opts `{configVersion:'1.3.0'}` | per-scenario | `beforeEach` hook |
| F-6 | fake-mcp-server (responsive) | container | `tests/fixtures/pomogator-doctor/fake-mcp-server.ts` | per-scenario | `beforeEach` spawn, `afterEach` SIGKILL |
| F-7 | fake-mcp-server (hanging) | container | same, opts `{hangOnInit:true}` | per-scenario | same |
| F-8 | fake-mcp-server (crashing) | container | same, opts `{crashOnInit:true}` | per-scenario | same |
| F-9 | dotenv (valid) | static | `tests/fixtures/pomogator-doctor/dotenv-fixtures/valid.env` | per-scenario | snapshot hook |
| F-10 | dotenv (missing-key) | static | same dir `missing-key.env` | per-scenario | snapshot hook |
| F-11 | dotenv (malformed) | static | same dir `malformed.env` | per-scenario | snapshot hook |
| F-12 | plugin.json (all-declared) | static | inline test data в `doctor-gating.test.ts` | per-scenario | test setup |
| F-13 | plugin.json (broken-missing) | static | inline | per-scenario | test setup |

## Fixture Details

### F-1: temp-home (valid)

- **Type:** factory (TypeScript builder)
- **Format:** function `buildTempHome(opts): Promise<string>` возвращающая temp dir path
- **Setup:**
  1. `await fs.mkdtemp(path.join(os.tmpdir(), 'pomogator-doctor-'))`
  2. `fs.mkdir(homeDir + '/.dev-pomogator/{scripts,tools/auto-commit,tools/plan-pomogator}', {recursive:true})`
  3. Write `config.json` со структурой: `{platforms:['claude'], version:'1.5.0', installedExtensions:[{name:'auto-commit', version:'1.5.0', managed:{hooks:{...}}}]}`
  4. Write stub `scripts/tsx-runner-bootstrap.cjs` (1-line noop)
  5. Set `process.env.HOME` (Unix) / `USERPROFILE` (Windows) → homeDir
- **Teardown:** `afterEach`: restore env + `fs.rm(homeDir, {recursive:true, force:true})`
- **Dependencies:** none
- **Used by:** POMOGATOR_DOCTOR001_01 (happy path), ..._04 (silent SessionStart), ..._07 (version match ok)
- **Assumptions:** tmpdir writable; process.env HOME/USERPROFILE mutable в test context

### F-2: temp-home (missing-tools)

- **Type:** factory (F-1 variant)
- **Format:** `buildTempHome({skipTools:true})`
- **Setup:** F-1 setup но пропускает step 2 создания `tools/*` subdirs
- **Teardown:** same as F-1
- **Dependencies:** F-1 builder
- **Used by:** POMOGATOR_DOCTOR001_02 (missing tools → reinstall prompt)
- **Assumptions:** same

### F-3: temp-home (stale-hooks)

- **Type:** factory (F-1 variant)
- **Format:** `buildTempHome({hooksDivergent:true})`
- **Setup:** F-1 + writes divergent `.claude/settings.local.json` в test project directory где hooks не совпадают с `config.managed[].hooks`
- **Teardown:** same + cleanup test project dir
- **Dependencies:** F-1, F-14 (test project dir из mkTempProject helper)
- **Used by:** POMOGATOR_DOCTOR001_XX (hooks sync critical)

### F-4: temp-home (corrupt-config)

- **Type:** factory (F-1 variant)
- **Format:** `buildTempHome({corruptConfig:true})`
- **Setup:** F-1 step 3 заменяется на `fs.writeFile(configPath, '{ invalid json here ')`
- **Teardown:** same
- **Dependencies:** F-1
- **Used by:** reliability test (NFR-R-6 corrupt config handling)

### F-5: temp-home (version-mismatch)

- **Type:** factory (F-1 variant)
- **Format:** `buildTempHome({configVersion:'1.3.0'})`
- **Setup:** F-1 но config.json.version = '1.3.0' vs package.json.version = '1.5.0'
- **Teardown:** same
- **Dependencies:** F-1
- **Used by:** POMOGATOR_DOCTOR001_07 (version mismatch → reinstall)

### F-6: fake-mcp-server (responsive)

- **Type:** container (child process)
- **Format:** TypeScript function spawning `node` с inline script implementing JSON-RPC stdio responder
- **Setup:** `const child = spawn('node', ['-e', FAKE_MCP_SCRIPT], {stdio:['pipe','pipe','pipe']})`. Script читает stdin JSON-RPC messages, отвечает на `initialize` и `tools/list` с валидными payloads (2 fake tools). Возвращает `{command: 'node', args: ['-e', SCRIPT], childHandle}`. Регистрирует child в `spawnedChildren` Set.
- **Teardown:** `afterEach`: `child.kill('SIGKILL')` + `await once(child, 'exit')` с 2s timeout. Удалить из Set.
- **Dependencies:** child-registry hook
- **Used by:** POMOGATOR_DOCTOR001_04+05 (SessionStart silent when MCP ok)
- **Assumptions:** Node spawn работает в test env; stdin/stdout buffer не full

### F-7: fake-mcp-server (hanging)

- **Type:** container
- **Format:** F-6 variant с `hangOnInit:true` — script accept initialize но NEVER responds (infinite setTimeout)
- **Setup:** same as F-6 но SCRIPT constant содержит hang logic
- **Teardown:** SIGKILL (обязательно — процесс не самоостановится)
- **Dependencies:** F-6 builder
- **Used by:** POMOGATOR_DOCTOR001_06 (MCP probe timeout → SIGKILL cleanup)

### F-8: fake-mcp-server (crashing)

- **Type:** container
- **Format:** F-6 variant с `crashOnInit:true` — script отвечает на initialize и сразу `process.exit(1)`
- **Setup:** same as F-6 но SCRIPT делает exit после первого message
- **Teardown:** child уже dead после initialize — registry check exitCode, если alive → SIGKILL
- **Dependencies:** F-6 builder
- **Used by:** UC-6 variant (crash mid-probe)

### F-9: dotenv (valid)

- **Type:** static file
- **Format:** .env
- **Setup:** `cp tests/fixtures/pomogator-doctor/dotenv-fixtures/valid.env tempProject/.env` + trigger dotenv.config() в test context
- **Teardown:** env-snapshot hook restore process.env
- **Dependencies:** env-snapshot hook, F-14 (tempProject)
- **Used by:** POMOGATOR_DOCTOR001_01 (API key present)
- **Content:** `AUTO_COMMIT_API_KEY=sk-test-fake-key-XXXX\nAUTO_COMMIT_LLM_URL=https://test.example.com\n`

### F-10: dotenv (missing-key)

- **Type:** static
- **Format:** .env
- **Setup:** same as F-9 но file БЕЗ `AUTO_COMMIT_API_KEY`
- **Teardown:** same
- **Dependencies:** same
- **Used by:** POMOGATOR_DOCTOR001_03 (missing API key → hint only)
- **Content:** `AUTO_COMMIT_LLM_URL=https://test.example.com\n` (only non-required)

### F-11: dotenv (malformed)

- **Type:** static
- **Format:** .env (intentionally broken)
- **Setup:** same as F-9
- **Teardown:** same
- **Dependencies:** same
- **Used by:** reliability test parser resilience
- **Content:** `BROKEN_LINE_NO_EQUALS\nAUTO_COMMIT_API_KEY=sk-test\n="no-name"\n`

### F-12: plugin.json (all-declared)

- **Type:** static (inline в test)
- **Format:** JSON литерал в test file
- **Setup:** Write JSON в `tempHomeDir + '/.dev-pomogator/.claude-plugin/plugin.json'` с `{commands: [{name:'reflect'}, {name:'suggest-rules'}], skills: [{name:'create-spec'}, ...]}`. Write соответствующие `.md` файлы в `~/.claude/commands/` или в project `.claude/commands/`.
- **Teardown:** part of temp-home cleanup
- **Dependencies:** F-1
- **Used by:** POMOGATOR_DOCTOR001_09 variant (all-ok plugin-loader)

### F-13: plugin.json (broken-missing)

- **Type:** static
- **Format:** JSON
- **Setup:** same as F-12 но НЕ пишет `.md` файлы (commands declared но physical missing)
- **Teardown:** same
- **Dependencies:** F-12 structure
- **Used by:** POMOGATOR_DOCTOR001_09 (BROKEN-missing → reinstall offer)

## Dependencies Graph

```
F-1 (temp-home valid) ← base
  ├── F-2 (missing-tools)   ← variant: skipTools
  ├── F-3 (stale-hooks)     ← variant: hooksDivergent + F-14
  ├── F-4 (corrupt-config)  ← variant: corruptConfig
  ├── F-5 (version-mismatch)← variant: configVersion
  └── F-12 (plugin.json all) ← writes into F-1's tempHomeDir
       └── F-13 (plugin.json broken) ← F-12 structure, не пишет physical files

F-6 (fake-mcp responsive) ← base for MCP tests
  ├── F-7 (hanging)   ← variant: hangOnInit
  └── F-8 (crashing)  ← variant: crashOnInit

F-9 (dotenv valid) ← base for env tests
  ├── F-10 (missing-key) ← subset content
  └── F-11 (malformed) ← corrupt format

External dependencies:
  All F-1..F-5 → child-registry hook (for safety SIGKILL)
  All F-6..F-8 → child-registry hook (mandatory for cleanup)
  All F-9..F-11 → env-snapshot hook (mandatory для restore)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | POMOGATOR_DOCTOR001_01 happy path | F-1, F-6, F-9, F-12 | none |
| @feature2 | _02 missing tools → reinstall prompt | F-2, F-6, F-9 | none |
| @feature3 | _03 missing API key → hint only | F-1, F-10 | none |
| @feature4 | _04 SessionStart silent when OK | F-1, F-6, F-9 | none |
| @feature4 | _05 SessionStart banner missing MCP | F-1, (no F-6, MCP not configured) | none (используется absence F-6) |
| @feature4 | _06 MCP probe timeout | F-1, F-7, F-9 | none |
| @feature2 | _07 version mismatch → reinstall | F-5, F-6, F-9 | none |
| @feature8 | _08 CI --json mode | F-1 variants + F-6 + F-9/F-10 | none |
| @feature10 | _09 plugin-loader broken-missing | F-1, F-13 | none |
| @feature9 | _10 traffic-light output | F-1, F-6, F-9 | none |
| @feature11 | _11 per-extension gating (2 ext only) | F-1 с installedExtensions=['plan-pomogator','auto-commit'] | Variant F-1 может потребоваться explicit option `installedExtensions: string[]` |
| @feature3 | _12 API key в settings.local.json fallback | F-1 + custom settings.local.json writer | Variant F-1 с опцией `envInSettingsLocal: Record<string,string>` — добавить в builder |

Identified gaps (to address in Phase 2 builder impl):
1. F-1 builder должен принимать `installedExtensions?: string[]` для UC-11 (per-ext gating)
2. F-1 builder должен принимать `envInSettingsLocal?: Record<string,string>` для UC-12 (settings.local.json env fallback)

Эти два options — extension F-1 API, не новые fixture IDs.

## Notes

### Cleanup Order Enforcement

Документ порядок cleanup обязателен — ошибки в порядке приведут к flaky tests:

1. Env restore **PERVUM** (before fs cleanup) — некоторые cleanup steps могут логировать и смотреть env
2. Fake MCP SIGKILL **WTOROE** — пока temp-home существует для child stdin/stdout flushing
3. Temp-home fs.rm **TRETIM** — после того как все children dead
4. Global child-registry sweep **POSLEDNIM** — safety net

Нарушение порядка → orphan processes в CI, flaky test isolation.

### Known Issues

- **Windows signal handling**: `child.kill('SIGKILL')` на Windows эквивалентен `taskkill /F` через libuv. Потенциальная задержка 500ms-2s до actual exit. Tests нужны explicit `await once(child, 'exit')` с timeout, иначе fs.rm temp-home может fail с EBUSY.
- **CI env vars leakage**: если CI runner сам устанавливает `AUTO_COMMIT_API_KEY` (например в GitHub secrets exposed to runner), env-snapshot захватит real value. Tests должны явно `delete process.env.AUTO_COMMIT_API_KEY` в beforeEach перед загрузкой fixture dotenv.
- **Cross-platform paths**: F-1 builder должен использовать `path.join` + корректный HOME var (`HOME` на Unix, `USERPROFILE` на Windows). Использовать `os.homedir()` override через env не работает в runtime — приходится устанавливать обе env vars для max compat.
