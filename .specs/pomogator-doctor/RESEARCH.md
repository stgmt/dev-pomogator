# Research

## Контекст

Фича `pomogator-doctor` — диагностическая команда для dev-pomogator, которая проверяет окружение пользователя после `git clone` + `npm install` и показывает что сломано. Мотивация: предыдущий анализ показал что разработчик Б, склонивший проект с установленным помогатором у разработчика А, получает broken environment — hooks падают с ENOENT (`~/.dev-pomogator/` не в git), auto-commit hook выводит "missing AUTO_COMMIT_API_KEY", MCP tools (`mcp__context7__*`) молча не работают потому что MCP сервер не сконфигурирован у Б. Нет способа понять что именно сломано и как починить.

## Portability Analysis — 17 категорий зависимостей

Анализ выполнен на dev-pomogator commit `4835fbb`. Выявлены зависимости по критичности и возможности починки через переустановку (`reinstallable` flag). Второй проход анализа (с другой машины) добавил 3 категории (C15/C16/C17) и per-extension granularity.

## Extension Dependency Matrix — traffic-light классификация

Driving principle: **doctor запускает только те checks, которые relevant для installed extensions** (config.installedExtensions). Юзер установивший 3 из 18 extensions не получает шум от проверок Python/Bun/Docker которые ему не нужны.

### 🟢 Self-sufficient (работают сразу, только Node)

| Extension | Зависимости |
|-----------|-------------|
| auto-simplify | Node, Stop hook |
| bg-task-guard | Node, shell scripts |
| plan-pomogator | Node + local plan storage (plan-gate validation) |
| specs-workflow (specs-generator + specs-validator) | Node, Phase-gate на Write/Edit |
| steps-validator | Node, парсер `.steps-validator.yaml` |
| test-quality | Node, anti-pattern detection |
| suggest-rules | Node |

### 🟡 Нужны env vars (API ключи)

| Extension | Что нужно | Symptom без setup |
|-----------|-----------|-------------------|
| auto-commit | AUTO_COMMIT_API_KEY (LLM URL/model в settings) | Тихо пропускает, не блокирует |
| prompt-suggest | AUTO_COMMIT_API_KEY (или OPENROUTER_API_KEY) | Тихо пропускает |
| learnings-capture | опционально AUTO_COMMIT_API_KEY | Regex-only режим работает |
| test-statusline | TEST_STATUSLINE_ENABLED=true | Тихо отключится |

Места куда поставить (Doctor проверяет оба):
1. `.env` file в корне проекта (через dotenv)
2. `.claude/settings.local.json → env` блок (рекомендуемый для team secrets)

### 🔴 Нужны внешние зависимости (бинарники / pip пакеты / Docker)

| Extension | Что установить | Symptom без setup |
|-----------|----------------|---------------------|
| bun-oom-guard | claude-mem plugin + bun в PATH | SessionStart hook warn, не блокирует |
| claude-mem-health | Chroma vector DB на :8000 (chroma.exe), Python chromadb | Warn, сессия работает |
| context-menu | Windows only + Nilesoft Shell (через winget auto) | Skip на non-Windows |
| devcontainer | Docker + devcontainer CLI + PowerShell (Win) | Templates в `.devcontainer/` не подхватятся |
| forbid-root-artifacts | Python 3 + pyyaml + simple-term-menu | Pre-commit hook ломается на корневых артефактах |
| mcp-setup | Python 3 + npm (setup-скрипт вручную) | MCP servers context7/octocode не поставятся |
| tui-test-runner | Python 3 + textual + vitest/pytest/cargo/dotnet/go | PreToolUse-guards не запустят TUI |

### Classification rule

- **🟢 Self-sufficient**: no env vars, no external binaries, только Node + filesystem → доктор просто проверяет что `~/.dev-pomogator/tools/{ext}/` существует
- **🟡 Needs env vars**: доктор проверяет `envRequirements` через process.env + `settings.local.json → env` fallback
- **🔴 Needs external deps**: доктор проверяет `binaries` (Node/Bun/Python/Docker/chroma) + `pythonPackages` (pyyaml/textual/simple-term-menu/chromadb) per-extension

### Critical (сломается всегда без вмешательства)

### Critical (сломается всегда без вмешательства)

| ID | Категория | Путь / проверка | Reinstallable | Причина |
|----|-----------|------------------|---------------|---------|
| C1 | Node.js ≥ 22.6 | `node --version` | no | Binary, user installs manually |
| C2 | Git в PATH | `git --version` | no | Binary |
| C3 | `~/.dev-pomogator/config.json` | `fs.exists()` | yes | Installer создаёт |
| C4 | `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs` | `fs.exists()` | yes | Installer генерит при setup |
| C5 | `~/.dev-pomogator/tools/{ext}/` для каждого installed extension | `config.installedExtensions[*].managed` | yes | Installer копирует из `extensions/*/` |
| C7 | `AUTO_COMMIT_API_KEY` и другие envRequirements | `process.env[name]` | no (API keys) / yes (если .env.example отсутствует) | Секреты — ручная настройка |
| C13 | Version match: `package.json` vs `~/.dev-pomogator/config.json` | `semver.compare` | yes | Installer обновляет config |

### Medium (опциональные фичи)

| ID | Категория | Проверка | Reinstallable | Fix hint |
|----|-----------|----------|---------------|---------|
| C9 | Bun ≥ latest | `bun --version` | no | PowerShell `irm bun.sh/install.ps1 \| iex` (Windows) / curl (Unix) |
| C10a | Python 3 в PATH | `python3 --version` (fallback `python --version`) | no | User installs Python 3 |
| C10b | Python packages per-extension (chromadb / pyyaml / simple-term-menu / textual) | `python3 -c 'import <pkg>'` для каждого из `extension.json → pythonPackages` installed extensions | no | `pip install --user <pkg>` с точным pkg из hint |
| C11 | MCP servers (parse .mcp.json + ~/.claude/mcp.json) | grep rules/skills for `mcp__*` → compare | no | Manual configure in `.mcp.json` |
| C12 | MCP Full probe — real connection | spawn stdio / fetch http + `initialize` + `tools/list`, timeout 3s | no | Check server logs, restart |
| C15 | Commands/Skills actually loaded в plugin-loader | Compare `.dev-pomogator/.claude-plugin/plugin.json` declared vs physical files в `.claude/commands/`, `.claude/skills/` и plugin registry `~/.claude/plugins/` | yes | Re-run installer — plugin-loader перерегистрирует |
| C16 | Docker + devcontainer CLI (опциональный, только если `devcontainer` extension installed) | `docker --version && devcontainer --version` | no | Install Docker Desktop + `npm install -g @devcontainers/cli` |
| C17 | Env vars в `.claude/settings.local.json → env` блоке (fallback к process.env для C7) | Parse JSON + check keys существуют | no (secrets — manual) / yes (если JSON malformed) | Set key in settings.local.json env block |

### Self-healing / managed

| ID | Категория | Проверка | Reinstallable |
|----|-----------|----------|---------------|
| C6 | Hooks в `.claude/settings.local.json` соответствуют `config.managed[projectPath].hooks` | JSON diff | yes |
| C8 | `.env.example` существует в корне | `fs.exists()` | yes |
| C14 | Managed gitignore block в target `.gitignore` | regex `MARKER_BEGIN...MARKER_END` | yes |

### Классификация reinstallable vs non-reinstallable — правило

**Reinstallable (yes)**: проблема в artefacts которые создаёт/управляет installer — `~/.dev-pomogator/*`, hooks JSON в `settings.local.json`, managed gitignore block, `.env.example` шаблон, version sync. Переустановка `npx dev-pomogator` восстановит.

**Non-reinstallable (no)**: проблема во внешних зависимостях — binaries (Node, Git, Bun, Python), secrets (API keys), внешние сервисы (MCP сервера). Переустановка не поможет, нужно действие пользователя: установить пакет, поставить env var, сконфигурировать MCP.

## Источники

### Community patterns

- **Claude Code `/doctor`** — каноничный diagnostic slash-command. Проверяет install type, multiple installations (npm global vs ~/.claude/local vs Homebrew), MCP config, permissions. Color-coded green/yellow/red с fix hints. (Blog: Vincent Qiao, "Claude Code /doctor Explained")
- **npm doctor** — `npm doctor` проверяет Node version, npm version, registry connectivity, git, permissions. (npm docs)
- **Expo Doctor** — `npx expo-doctor` для React Native projects — многопрофильный check: SDK version, dependencies integrity, project config. (Expo docs)
- **Salesforce CLI `sf doctor`** — extensible doctor pattern, plugins регистрируют свои checks. Полезный плагин-pattern для будущего расширения dev-pomogator doctor.
- **AWS Well-Architected REL05-BP01** — graceful degradation: трансформация hard deps в soft, kill-switch env vars, fail-soft wrapping.
- **Husky `prepare` script** — `"prepare": "husky"` запускается после `npm install` для локального dev (не downstream). Правильный scope для "setup my clone".
- **mise (ex rtx)** — modern replacement для asdf. `mise.toml` пинит Node/Python/Bun версии. Doctor может предлагать `mise install` как fix для C1/C9/C10.
- **Anthropic Plugins 2026 guidance** — `.mcp.json` в корне проекта коммитится в git, `.claude/settings.local.json` остаётся per-dev. Плагины — portable distribution mechanism.
- **devcontainer.json** — official Anthropic devcontainer для Claude Code (Dockerfile + init-firewall.sh). Опциональный path для contributors.

### MCP Protocol references

- **`initialize` + `tools/list` JSON-RPC** — стандартный handshake MCP. Spec: Anthropic MCP specification. `[VERIFIED: spec + реальные MCP servers context7/octocode]`
- **stdio transport** — JSON-RPC через stdin/stdout child process. Timeout нужен hard (SIGKILL), иначе сервер в infinite loop зависнет.
- **http transport** — POST JSON-RPC к endpoint. Быстрее probe (fetch + timeout).

### Node.js references

- **`child_process.spawn`** — `stdio: 'inherit'` для reinstall (пользователь видит progress installer-а).
- **`os.homedir()`** — кроссплатформенно, используется по всему installer-у.
- **`--experimental-strip-types`** — Node 22.6+ native TS execution, `.ts` specifiers обязательны (см. rule `ts-import-extensions`).

## Технические находки

### Per-extension dependency driving

Doctor драйвит checks из `config.installedExtensions`, не запускает все 17 слепо. Algorithm:

```
1. Load ~/.dev-pomogator/config.json → installedExtensions[]
2. For each ext: load extensions/<ext>/extension.json (из ~/.dev-pomogator/tools/ или src)
3. Aggregate dependencies:
   - nodeVersion (semver range) → C1
   - binaries[] (Node, Git, Bun, Python, chroma, docker, devcontainer) → C2/C9/C10a/C16
   - envRequirements[] (из existing schema) → C7 (проверяет process.env + settings.local.json)
   - pythonPackages[] (новое поле — spec предлагает добавить в extension.json schema):
     - claude-mem-health → chromadb
     - forbid-root-artifacts → pyyaml, simple-term-menu
     - tui-test-runner → textual
     - mcp-setup → (varies by MCP)
4. Run only relevant checks → report "7 of 17 checks relevant for your 3 installed extensions"
```

Spec-рекомендация: добавить в `extension.json` schema новое поле:
```json
"dependencies": {
  "node": ">=22.6",
  "binaries": ["python3", "chroma"],
  "pythonPackages": ["chromadb"],
  "docker": false
}
```

### Commands/Skills loader detection (C15)

Находка из второго прохода анализа: `.claude/commands/` и `.claude/skills/` могут быть физически пусты, хотя `plugin.json` декларирует команды/skills. Claude Code plugin-loader **может** регистрировать их динамически из `.dev-pomogator/.claude-plugin/plugin.json` без копирования в `.claude/`. Doctor должен различить 4 состояния:

| State | Declared в plugin.json | Физически в `.claude/commands/` | Работает в Claude Code (`/` UI) | Severity |
|-------|------------------------|----------------------------------|----------------------------------|---------|
| OK-physical | yes | yes | yes | ✓ |
| OK-dynamic | yes | no | yes (plugin-loader registered) | ✓ |
| BROKEN-missing | yes | no | no | ✗ critical, reinstallable |
| STALE-orphan | no | yes | - | ⚠ warning |

**Проблема**: Doctor не может напрямую спросить Claude Code "видишь ли ты команду?". Heuristic:
1. Parse `.dev-pomogator/.claude-plugin/plugin.json` — declared commands/skills
2. Parse `.claude/commands/*.md` и `.claude/skills/*/SKILL.md` — physical
3. Parse `~/.claude/plugins/` registry (если существует) — registered dynamically
4. Если declared ∉ physical ∪ registered → ✗ BROKEN-missing (hint: reinstall)

### Doctor execution modes

3 точки входа — shared core в `src/doctor/` + три тонких адаптера:

1. **Interactive** (`/pomogator-doctor` slash или `dev-pomogator --doctor` без flags): chalk table, prompts для reinstall через AskUserQuestion
2. **JSON** (`dev-pomogator --doctor --json`): machine-readable JSON array, no chalk, redacted env values
3. **Quiet** (SessionStart hook): JSON hook protocol `{continue, suppressOutput?, additionalContext?}`, не промптит reinstall

### MCP Full probe protocol

```
1. Parse .mcp.json + ~/.claude/mcp.json → map<serverName, config>
2. Grep .claude/rules/*.md + .claude/skills/**/*.md for mcp__(\w+)__ → referenced servers set
3. Diff: referenced but not configured → C11 findings (no probe)
4. For each configured: spawn/fetch + initialize + tools/list with hard timeout 3s
5. Hard timeout via AbortSignal + child.kill('SIGKILL') to prevent hang
```

### Reinstall decision logic

```typescript
const reinstallable = results.filter(r => r.severity !== 'ok' && r.reinstallable);
const manual = results.filter(r => r.severity !== 'ok' && !r.reinstallable);

if (reinstallable.length > 0 && mode === 'interactive') {
  const answer = await AskUserQuestion(
    `${reinstallable.length} problem(s) can be fixed by reinstall. Run 'npx dev-pomogator' now?`
  );
  if (answer === 'Reinstall now') {
    spawn('npx', ['dev-pomogator'], { stdio: 'inherit' });
  }
}
if (manual.length > 0) printNonReinstallableBlock(manual);  // always show hints
```

## Где лежит реализация

- App-код (будущий, после этой спеки): `src/doctor/`, `extensions/pomogator-doctor/`, `src/index.ts` (--doctor flag)
- Конфигурация: `~/.dev-pomogator/config.json`, `.claude/settings.local.json`, `.env`, `.mcp.json`, `~/.claude/mcp.json`
- Тесты (будущие): `tests/features/plugins/pomogator-doctor/*.test.ts`, `tests/e2e/pomogator-doctor.test.ts`

## Выводы

1. Нужен один shared core модуль `src/doctor/` — три тонких адаптера (slash / CLI / hook) переиспользуют его с разными флагами режима
2. Каждый check имеет `reinstallable: yes|no` meta-поле, управляющее UX переустановки
3. MCP Full probe обязателен — parse-only даёт ложнопозитивы (server сконфигурирован но процесс падает)
4. SessionStart hook silent when OK — следуя паттерну `claude-mem-health`, не захламляет chat
5. JSON output обязателен для CI — redact env var values для security
6. **Per-extension driving**: Doctor запускает только checks relevant для installed extensions, не все 17 слепо
7. **Traffic-light output** (🟢🟡🔴) — отчёт группируется по dependency type: self-sufficient / needs env / needs external deps
8. **Commands/Skills loader check (C15)** — отдельная категория, т.к. `.claude/commands/` может быть пуста при working plugin-loader (dynamic registration)
9. **API key dual location**: `.env` И `.claude/settings.local.json → env` — Doctor проверяет оба
10. Новое поле `dependencies` в `extension.json` schema (recommendation) — `binaries[]`, `pythonPackages[]`, `docker`, `nodeVersion` — enables per-extension driving

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp file + atomic move | reinstall flow пишет config | FR-5, NFR-Reliability |
| atomic-update-lock | `.claude/rules/atomic-update-lock.md` | Lock через `flag: 'wx'` | 2 doctor runs параллельно | Risk: reinstall race |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json как source of truth | новый extension `pomogator-doctor` | FR-8 |
| no-unvalidated-manifest-paths | `.claude/rules/no-unvalidated-manifest-paths.md` | Пути из манифеста валидировать через `resolveWithinProject` | hook paths validation | FR-6, NFR-Security |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | `.ts` specifiers обязательны в `extensions/**/*.ts` | `doctor-hook.ts` imports | FR-8 |
| installer-hook-formats | `.claude/rules/gotchas/installer-hook-formats.md` | 3 формата hook entries (string/object/array) | SessionStart hook registration | FR-4 |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Апдейтер обновляет все artefacts | reinstall flow | FR-5 |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты ОБЯЗАНЫ быть интеграционными | BDD step definitions | FR-12 |
| centralized-test-runner | `.claude/rules/tui-test-runner/centralized-test-runner.md` | Тесты только через `/run-tests` | test invocation в TASKS.md | TASKS Phase 0 |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| claude-mem-health | `extensions/claude-mem-health/` | Template SessionStart hook с JSON protocol (`{continue, suppressOutput}`), `writeOutput()` helper | Direct template для `extensions/pomogator-doctor/tools/pomogator-doctor/doctor-hook.ts` |
| status.ts | `src/installer/status.ts:4-29` | chalk pattern для installer status output — `chalk.bold`, `chalk.gray` | Reference для `src/doctor/reporter.ts` chalk formatting |
| env-setup.ts | `src/installer/env-setup.ts:30-43` | `getMissingRequiredEnv(extensions)` — итерирует envRequirements | **Reuse as-is** для C7 check |
| memory.ts | `src/installer/memory.ts:44-94, 139-150` | `checkBunInstalled()`, `pipInstall()` — binary presence + auto-install | **Reuse** для C9 / C10 checks |
| tsx-runner.js | `src/scripts/tsx-runner.js:5-12` | Multi-strategy fallback (native / local / home / global / npx) | doctor-hook.ts инициализация через tsx-runner-bootstrap |
| gitignore.ts | `src/installer/gitignore.ts:1-28` | `MARKER_BEGIN` / `MARKER_END` для managed blocks | Reuse для C14 validation |
| loadConfig | `src/config/index.ts:6` | Reads `~/.dev-pomogator/config.json` | Reuse для C3/C5/C6/C13 |
| runInstaller | `src/installer/index.ts:24-65` | Programmatic installer entry | reinstall flow может прямо импортить ИЛИ через spawn (безопаснее) |
| writeUpdateReport | `src/installer/backup.ts:68-98` | Markdown report writer | Reuse для `~/.dev-pomogator/logs/doctor-last-run.md` |

### Existing BDD Hooks

- `tests/e2e/helpers.ts` — `runInstaller()` wrapper через `spawnSync('node', [cliJs])`, fixture project в `os.tmpdir()`. **Reuse** для integration tests в Phase 0.
- `tests/features/plugins/*/` — pattern per-extension tests. Aligned 1:1 с `.feature` scenarios (rule `extension-test-quality`). Новые `tests/features/plugins/pomogator-doctor/*.test.ts` последуют этому паттерну.
- Нет существующего fake-MCP-server fixture — **потребуется новый** в `tests/fixtures/pomogator-doctor/fake-mcp-server.ts`

### Architectural Constraints Summary

- **Atomic writes**: конфиг → temp + `fs.move`, lock → `fs.writeFile` с `flag: 'wx'` (atomic-config-save, atomic-update-lock)
- **Path validation**: все пути из user input / манифестов через `resolveWithinProject(projectPath, path)` (no-unvalidated-manifest-paths)
- **Hook JSON protocol**: stdout одна JSON строка `{continue, suppressOutput?, additionalContext?}` для SessionStart (пример `claude-mem-health/health-check.ts`)
- **3 формата hook entries**: installer генерит object `{matcher, command, timeout}`; парсер должен обрабатывать все 3 (installer-hook-formats)
- **Node 22.6+ strip-types**: `extensions/**/*.ts` imports — `.ts` specifier обязателен (ts-import-extensions)
- **Integration tests first**: unit-only тесты для C1..C14 недопустимы; каждый check покрыт integration test через spawnSync или runInstaller pattern (integration-tests-first)
- **`/run-tests` gate**: запуск тестов только через `/run-tests`, прямые `npm test` блокируются PreToolUse hook (centralized-test-runner)

---

## Post-Launch Edge Cases Found (2026-04-20)

> Добавлено после incident-отчёта по `D:\repos\webapp\` где юзер увидел 8 `ERR_MODULE_NOT_FOUND` на каждом Stop event + был неспособен диагностировать через `/pomogator-doctor`. Все находки — с file:line пруфами из живого запуска `dev-pomogator --doctor` и реальных файлов.

### Real-world state examined

1. **webapp project**: `.claude/settings.local.json` содержит **22 хука** зарегистрированных через 5 events (Stop=8, SessionStart=4, PreToolUse=4, UserPromptSubmit=4, PostToolUse=2). Пруф: `D:/repos/webapp/.claude/settings.local.json:1-215`.
2. **Project-local wipe**: `D:/repos/webapp/.dev-pomogator/tools/` содержит только подпапку `tui-test-runner/tui/` — 16 других extension tool-directories отсутствуют. Пруф: `ls` output `tui-test-runner` single entry.
3. **HOME partial wipe**: `C:/Users/stigm/.dev-pomogator/tools/` — директория НЕ существует. Но `~/.dev-pomogator/scripts/tsx-runner.js` и `node_modules/` целы (tsx strategy 1.25 работает для проектов с local .dev-pomogator/tools).
4. **Config.json tracks both projects**: `installedExtensions[*].projectPaths` содержит `D:\\repos\\dev-pomogator` И `D:\\repos\\webapp`. Managed tools hashes сохранены per-project (часто разные sha256 для одного и того же script пути — evidence of version drift).
5. **pomogator-doctor extension НЕ в installedExtensions**: `grep '"name":' ~/.dev-pomogator/config.json` → 17 extensions, `pomogator-doctor` отсутствует. SessionStart doctor hook не зарегистрирован ни в одной projectPath.

### Defects in existing checks (D1-D4)

| ID | Check | File:line | Проблема | Live evidence |
|----|-------|-----------|----------|----------------|
| D1 | C6 hooks-registry | `src/doctor/checks/hooks-registry.ts:30` `ctx.config?.managed?.[ctx.projectRoot]?.hooks` | Читает top-level `config.managed`, но реальная schema — `installedExtensions[*].managed[projectRoot].hooks` | `✗ C6: unexpected keys: Stop, SessionStart, PreToolUse, UserPromptSubmit, PostToolUse` на рабочей установке dev-pomogator — всегда critical |
| D2 | C13 version-match | `version-match.ts:12` `ctx.config?.version ?? null` | Top-level `version` field не пишется installer-ом | `⚠ C13: cannot compare versions (config=unknown, package=24.1.20)` — dead by design |
| D3 | C5 extension tools | `pomogator-home.ts:82-84` `toolDir = path.join(homeDir, '.dev-pomogator', 'tools', ext.name)` | Проверяет HOME директорию, но хуки запускаются project-relative | Ложный ok если HOME цел а project wiped; в webapp совпадение — оба wiped |
| D4 | Cross-project blindness | `runner.ts:28` `projectRoot = options.projectRoot ?? process.cwd()` | Проверяется только cwd-проект, даже если config tracks другие | `/pomogator-doctor` из dev-pomogator не узнает про сломанный webapp |

### Blind spots (B1-B7)

| ID | Blind spot | Impact | Evidence |
|----|-----------|--------|----------|
| B1 | Hook command → script path existence не проверяется | 22 broken хука в webapp дают 0 detections от доктора | Webapp: hook `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` не существует → `ERR_MODULE_NOT_FOUND` на каждом Stop |
| B2 | Managed tools SHA-256 integrity не проверяется | User edits silently затираются при reinstall; version drift undetected | `config.json` hash `auto_commit_stop.ts` для dev-pomogator = `f4ea8b61...`, для webapp = `33b4e963...` — разные версии одного script |
| B3 | `.dev-pomogator/.claude-plugin/plugin.json` missing → C15 silent ok | `/pomogator-doctor` и другие commands не грузятся Claude Code-ом | `plugin-loader.ts:97` — `if (!manifest) return [{severity: 'ok', message: 'no plugin.json manifest found — nothing to verify'}]` |
| B4 | pomogator-doctor не установлен по дефолту | SessionStart баннер (FR-17) не срабатывает на broken installs | `grep '"name":' config.json` не включает `pomogator-doctor`; webapp `settings.local.json.SessionStart` не имеет doctor-hook |
| B5 | Stale managed entries после extension rename/remove | Installer не чистит при uninstall — вечный шум от doctor reinstall suggestions | potential case — сейчас не проявляется, но при любом future rename extension |
| B6 | `~/.dev-pomogator/node_modules/.bin/tsx` existence не проверяется | tsx-runner strategy 1.25 тихо degrades если binary отсутствует | `tsx-runner.js:222-228` зависит от этого binary |
| B7 | `tsx-runner.js` content corruption не детектируется | Syntax error в runner → все hooks crash через bootstrap `throw e` | `tsx-runner-bootstrap.cjs:60` |

### Performance / UX findings

- **Node 20 drift**: юзер имеет Node 20.19.6. tsx-runner.log показывает `0:native:notfound,1:local:notfound,1.25:home` — 3 стратегии per hook cold start. При 22 хуках за UserPrompt/Stop cycle ~9s дополнительной задержки vs Node 22.6. C1 warning не отражает real cost.
- **MCP probe 3s timeout слишком жёсткий**: `C12:mcp-atlassian: timeout (3019ms)` + `C12:playwright: spawn npx ENOENT (20ms)` — первое false positive (server slow but functional), второе — distinct error case (PATH issue не "server down"). Смешивать в одно "critical" лишает пользователя точного hint-а.
- **Параллельный stderr шум**: 8 Stop hooks запускаются параллельно, stderr interleaved — invisible какой hook зафейлил первым. Доктор должен sort + group by event чтобы output читаемый.

### Windows-specific edge cases

- **Partial wipe semantics**: `tui-test-runner/tui/` существует как подпапка, но `tui_stop.ts` в корне нет. `fs.existsSync(directoryPath)` возвращает true → false negative в C5. Requires **file-level** checks (каждый `managed.tools[].path` separately).
- **Backslash path escaping**: config.json хранит `"D:\\repos\\webapp"` (escaped). При сравнении с `process.cwd()` на Windows работает, но test-coverage должен include этот case.
- **bg-task-guard как parallel sub-tool**: `test-statusline/extension.json` декларирует `bg-task-guard` как **второй** tool-directory (not nested inside `test-statusline/`). Installer создаёт параллельные `.dev-pomogator/tools/test-statusline/` и `.dev-pomogator/tools/bg-task-guard/` — хук `bg-task-guard/stop-guard.sh` регистрируется через отдельную `hooks.Stop[]` entry. Orphan detection MUST учитывать sub-tools в extension manifest.

### Sources verified

- **Live doctor output**: `dev-pomogator --doctor` запущен в dev-pomogator на 2026-04-20 — confirmed D1, D2, P2 defects.
- **Real settings.local.json**: `D:/repos/webapp/.claude/settings.local.json` — 22 хука, 5 events, все с `.dev-pomogator/tools/...` paths.
- **Real config.json**: `C:/Users/stigm/.dev-pomogator/config.json` — 2520+ строк, 17 installed extensions, `pomogator-doctor` отсутствует.
- **tsx-runner strategies**: `src/scripts/tsx-runner.js:374-396` подтверждает `runNodeNativeTs` возвращает false для Node < 22.6.
- **Bootstrap fail-soft**: `src/scripts/tsx-runner-bootstrap.cjs:50-56` — silent no-op при missing runner, но tsx-runner сам exit(1) при missing script.

### Implications для реализации (P0 minimum patch)

3 файла + 4 edit'а покроют 90% webapp-style сценариев:

1. **New** `src/doctor/checks/hook-command-integrity.ts` (~80 строк) — FR-26
2. **New** `src/doctor/checks/managed-files-integrity.ts` (~70 строк) — FR-27
3. **Fix** `src/doctor/checks/hooks-registry.ts` (~20 строк change) — FR-31 (critical false-positive regression)
4. **Fix** `src/doctor/checks/plugin-loader.ts` (~10 строк change) — FR-28

P1 дополнения (MCP retune, --all-projects, self-install, config.version) — следующая итерация после P0 verify.
