# Tasks

## TDD Workflow

> Red → Green → Refactor. Integration-first.

## Phase 0: BDD Foundation (Red)

### 📋 `bdd-feature`
> Создать .feature файл

- **files:** `tests/features/core/CORE019_claude-mem-integration.feature` *(create)*
- **changes:**
  - Скопировать из `.specs/claude-mem-integration/claude-mem-integration.feature`
  - 9 scenarios: health hooks, post-install validation, per-component report, graceful degradation, re-install
- **refs:** FR-1..FR-7
- **deps:** *none*

---

### 📋 `bdd-stubs`
> Создать заглушки тестов

- **files:** `tests/e2e/claude-installer.test.ts` *(edit)*
- **changes:**
  - Добавить describe `CORE019: Claude-mem Integration` с 9 it-блоками matching scenarios
  - Все throw 'not implemented'
- **refs:** FR-7
- **deps:** `bdd-feature`

---

## Phase 1: Auto-install health extension (FR-1)

### 📋 `auto-install-health`
> Когда needsClaudeMem=true → автоматически ставить claude-mem-health

- **files:** `src/installer/index.ts` *(edit)*
- **changes:**
  - После `ensureClaudeMem('claude')` success: проверить `extensions.includes('claude-mem-health')`, если нет → `await installClaude({ extensions: ['claude-mem-health'], executedSharedHooks })`
  - Добавить report entry: `claude-mem/hooks: ok` или `fail`
- **refs:** FR-1
- **leverage:** `installClaude()` из `src/installer/claude.ts`
- **deps:** *none*

---

## Phase 2: Post-install validation + logging (FR-2, FR-3)

### 📋 `post-install-validation`
> После ensureClaudeMem: проверить worker + chroma + MCP alive

- **files:** `src/installer/memory.ts` *(edit)*
- **changes:**
  - В конце `ensureClaudeMem()` (после line 726): вызвать `isWorkerRunning()` + `isChromaRunning()` + `fs.pathExists(mcpServerPath)`
  - Вернуть validation result object `{ worker: boolean, chroma: boolean, mcpBinary: boolean }`
  - В `index.ts`: использовать результат для report entries (worker/chroma/mcp × ok/warn/fail)
- **refs:** FR-2
- **deps:** *none*

---

### 📋 `structured-logging`
> Все 12 точек отказа без logging → добавить installLog

- **files:** `src/installer/memory.ts` *(edit)*
- **changes:**
  - Передавать `logger` как параметр в `ensureClaudeMem(platform, logger?)`
  - Lines 258, 318, 340, 354, 475, 630: добавить `logger?.warn()` или `logger?.error()` рядом с existing console.log
  - Каждый log entry: step name + error message + context (port, path, command)
- **refs:** FR-3
- **leverage:** `formatErrorChain()` из `src/utils/logger.ts`
- **deps:** *none*

---

## Phase 3: Graceful degradation (FR-5)

### 📋 `graceful-degradation`
> Worker fail → skip MCP registration; Chroma fail → warn not fail

- **files:** `src/installer/memory.ts` *(edit)*
- **changes:**
  - Перед `registerClaudeMemMcp()` (line 724): guard `if (!await isWorkerRunning()) { log error; return validation; }`
  - Chroma failure: уже non-blocking (existing), убедиться что report показывает warn а не fail
- **refs:** FR-5
- **deps:** `post-install-validation`

---

## Phase 4: Per-component install report (FR-4)

### 📋 `per-component-report`
> Install report с breakdown: worker/chroma/mcp/hooks × ok/warn/fail

- **files:** `src/installer/report.ts` *(edit)*, `src/installer/index.ts` *(edit)*
- **changes:**
  - В index.ts: после ensureClaudeMem + auto-install health → добавить 4 report entries из validation result
  - Report format: `| claude-mem/worker | ok |`, `| claude-mem/chroma | warn | degraded mode |`, etc.
- **refs:** FR-4
- **deps:** `post-install-validation`, `auto-install-health`

---

## Phase 5: Tests Green (FR-7)

### 📋 `tests-green`
> Реализовать 9 тестов из CORE019

- **files:** `tests/e2e/claude-installer.test.ts` *(edit)*
- **changes:**
  - CORE019_01: health hooks in settings.json — readJson + check SessionStart contains health-check.ts
  - CORE019_02-03: install report per-component — readFile + toContain('claude-mem/worker') + toContain('ok')
  - CORE019_04: install.log has structured errors — getInstallLog + toMatch(/\[ERROR\].*step/)
  - CORE019_05: console diagnostics — installerResult.logs + toContain('Reason:')
  - CORE019_06: graceful degradation — conditional on Docker env (chroma may or may not work)
  - CORE019_07: MCP not registered when worker dead — conditional
  - CORE019_08: re-install skip — runInstaller twice, check no duplicates
  - CORE019_09: per-component report — readFile report + toContain rows
- **refs:** FR-7
- **deps:** all previous phases

---

## Phase 6: Refactor

### 📋 `refactor`
> /simplify + verify

- **files:** `src/installer/memory.ts` *(edit)*
- **changes:**
  - /simplify на изменённые файлы
  - npm run build
  - /run-tests в background
- **refs:** NFR
- **deps:** `tests-green`
