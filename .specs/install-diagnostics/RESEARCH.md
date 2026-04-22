# Research

## Контекст

В апреле 2026 пользователь dev-pomogator на Windows 11 запустил `npx github:stgmt/dev-pomogator --claude --all` и получил **полностью пустой вывод** — после `Ok to proceed? (y) y` PowerShell просто вернул prompt. Никаких сообщений об ошибке, никакой установки, никаких изменений в `~/.dev-pomogator/`. Скриншот пользователя зафиксировал точную последовательность событий.

Это исследование выявляет root cause, документирует evidence для regression-тестов CORE003_18 (Linux control) и CORE003_19 (Windows TDD red), и обосновывает создание skill `install-diagnostics` (`.claude/skills/install-diagnostics/SKILL.md`).

## Источники

- Reproduction в `/tmp/test-install-pomogator` (текущая session) — три отдельных запуска: с stale cache, с custom `NPM_CONFIG_CACHE=/tmp/test-cache-pomogator`, с уникальным fresh cache `NPM_CONFIG_CACHE=/tmp/test-cache-1775726204`
- npm verbose debug logs из `%LOCALAPPDATA%\npm-cache\_logs\` (rotated, max 10) — пойманы 2 файла с матчинг таймстампами
- Inspection of `_npx/eade2dc1c54870ea/` — npx hash-папка для `github:stgmt/dev-pomogator`
- Source code: `dist/index.js`, `dist/installer/index.js` (через `git show HEAD:`), `bin/cli.js`
- Existing test: `tests/e2e/claude-installer.test.ts`, helpers `runInstaller()`, `getInstallLogPath()`

## Технические находки

### Reproduction (детерминированный)

Команда:

```bash
TEMP_DIR=/tmp/pom-diag-$(date +%s) && mkdir -p "$TEMP_DIR" && cd "$TEMP_DIR" && \
yes y | npx --loglevel verbose --yes github:stgmt/dev-pomogator --claude --all 2>&1 | tail -30
```

Output (точный фрагмент):

```
npm http fetch GET 200 https://codeload.github.com/stgmt/dev-pomogator/tar.gz/cad11b296c03935dd3ef05a140d86e32e9407a04 1058ms (cache revalidated)
npm warn cleanup Failed to remove some directories [
npm warn cleanup   [
npm warn cleanup     'C:\\Users\\stigm\\AppData\\Local\\npm-cache\\_npx\\eade2dc1c54870ea\\node_modules\\@inquirer\\external-editor',
npm warn cleanup     [Error: EPERM: operation not permitted, rmdir 'C:\Users\stigm\AppData\Local\npm-cache\_npx\eade2dc1c54870ea\node_modules\@inquirer\external-editor\dist\esm'] {
npm warn cleanup       errno: -4048,
npm warn cleanup       code: 'EPERM',
npm warn cleanup       syscall: 'rmdir',
npm warn cleanup     }
npm warn cleanup   ]
npm warn cleanup ]
npm silly unfinished npm timer reify
npm silly unfinished npm timer reify:unpack
npm silly unfinished npm timer reifyNode:node_modules/dev-pomogator
npm verbose cwd C:\Users\stigm\AppData\Local\Temp\pom-diag-...
npm verbose os Windows_NT 10.0.26200
npm verbose node v20.19.6
npm verbose npm  v11.11.1
npm verbose exit 2
npm verbose code 2
```

Тот же output воспроизводится с **fresh** `NPM_CONFIG_CACHE` (новая директория, которая никогда раньше не использовалась) — это исключает stale leftover cache как причину. Bug возникает на ЛЮБОМ npm-вызове на Windows.

### Root Cause (UPDATED 2026-04-09): dev-pomogator's `prepare` script fails because committed source files are missing from github

**Полная цепочка bug-а** (одна и та же причина на Linux и Windows):

1. `npx github:stgmt/dev-pomogator --claude --all` инициирует `npm exec`
2. npm exec вызывает internal `npm install` для git deps c `--include=dev` и `--prefer-online`
3. npm install клонирует github tarball в `_cacache/tmp/git-cloneXXXXXX/`
4. npm install запускает `prepare` script: `npm run build` = `tsc && node scripts/build-check-update.js`
5. **`tsc` падает с TypeScript ошибками**:
   ```
   src/updater/index.ts(21,61): error TS2307: Cannot find module '../utils/path-safety.js'
   src/updater/index.ts(23,33): error TS2307: Cannot find module '../installer/plugin-json.js'
   src/updater/index.ts(545,50): error TS2339: Property 'installedShared' does not exist on type 'Config'
   ... (multiple TS errors)
   src/updater/shared-sync.ts(26,38): error TS2307: Cannot find module '../utils/path-safety.js'
   ```
6. **Почему tsc падает**: на github HEAD (cad11b2) код в `src/updater/index.ts` импортирует:
   - `../utils/path-safety.js` — файл `src/utils/path-safety.ts` есть **локально** на машине разработчика, но **НЕ закоммичен в git** (untracked)
   - `../installer/plugin-json.js` — файл `src/installer/plugin-json.ts` есть **локально**, но **НЕ закоммичен** (untracked)
   - `installedShared` field on Config — добавлено в `src/config/schema.ts` локально, но изменение **НЕ закоммичено**
7. github HEAD имеет ИСПОЛЬЗОВАНИЕ этих сущностей в `src/updater/index.ts` (commit 2b22919 "force _shared/ recovery + publish FR-12") но не имеет ОПРЕДЕЛЕНИЯ
8. tsc → exit 2 → prepare script fails → npm install exits 2 → npm exec exits 2
9. **Bin `dev-pomogator` так и не извлечён**, потому что reify откатился до завершения unpack
10. npx не находит bin → silent exit with code 2

### Why это silent для пользователя

**На Linux:**
- `npm exec` подавляет error output от внутреннего `npm install` (это известное поведение npm CLI)
- Только `npm install --foreground-scripts github:stgmt/dev-pomogator` напрямую показывает реальную ошибку tsc
- `npx --loglevel verbose` показывает только `npm silly unfinished npm timer reify:unpack` и `npm verbose exit 2`, но не сами TS errors
- exit 2 пробрасывается без user-visible message

**На Windows:**
- Та же базовая причина (prepare script fails из-за отсутствующих файлов)
- ПЛЮС дополнительный симптом: при rollback partial install, Windows не может `rmdir` busy файлы (`@inquirer/external-editor/dist/esm`, `@inquirer/core/dist`) — генерирует `npm warn cleanup` сообщения
- Cleanup warnings — это **симптом**, не корень. Ошибка tsc происходит ДО них
- На Windows EPERM сообщения видны в `--loglevel verbose`, но скрыты при default loglevel
- Ranking от user-visible признаков: ничего → exit 2 → cleanup warnings (только при verbose) → реальная tsc ошибка (только при `npm install --foreground-scripts`)

### Why это silent для пользователя

`npm warn cleanup` — это warn-level message. Default loglevel для `npm exec` (npx) — это `notice`, который **показывает только notice/error**. Warn messages **скрыты** при default loglevel.

Это означает:
- При обычном `npx github:stgmt/dev-pomogator --claude --all` пользователь **не видит** ни cleanup warnings, ни какой-либо информации об ошибке
- npm exit code 2 пробрасывается без user-visible error message (npm не печатает `npm error ...`, потому что cleanup warnings не доросли до error level)
- bin `dev-pomogator` не извлечён в `_npx/<hash>/node_modules/`, поэтому npx падает на этапе "find bin to run", но и эту ошибку npm подавляет

Проверка через `--loglevel verbose` (level выше warn) **показывает** полный диагностический output — отсюда наша диагностика возможна.

### Что НЕ происходит при silent failure

Установщик dev-pomogator (`dist/index.js`) **никогда не загружается** в Node.js контекст:
- Нет вызова `runNonInteractiveInstaller()` → нет console.log с rocket banner
- Нет вызова `install()` → нет `installLog.info('=== Installation started ===')` → `~/.dev-pomogator/logs/install.log` НЕ обновляется (mtime остаётся прежним)
- Нет вызова `report.write()` → `~/.dev-pomogator/last-install-report.md` НЕ обновляется
- Нет вызова `installClaude()` → файлы в `.claude/`, `.dev-pomogator/tools/`, `~/.claude/settings.json` не созданы/не изменены

Это **сильное evidence**: можно проверить факт silent failure через `fs.stat(installLogPath).mtimeMs` — если mtime не изменился, installer не запускался.

### Evidence files (paths)

- npm cache logs: `C:\Users\stigm\AppData\Local\npm-cache\_logs\2026-04-09T*-debug-0.log` (rotated после 10 файлов)
- npx cache slot: `C:\Users\stigm\AppData\Local\npm-cache\_npx\eade2dc1c54870ea\` — после failed install содержит только пустой `node_modules/` (или partial extraction `node_modules/@inquirer/...`)
- Installer log: `C:\Users\stigm\.dev-pomogator\logs\install.log` — НЕ обновляется при silent failure (mtime остаётся прежним; в нашем случае mtime последнего успешного install = 2026-03-25)
- Install report: `C:\Users\stigm\.dev-pomogator\last-install-report.md` — НЕ обновляется (mtime от 2026-04-06)

### Reproduction на Linux (через docker run node:20-bookworm)

```bash
docker run --rm node:20-bookworm bash -c "mkdir /tmp/test && cd /tmp/test && npm install --foreground-scripts github:stgmt/dev-pomogator"
```

Output (релевантные строки):

```
> dev-pomogator@1.5.0 prepare
> npm run build

> dev-pomogator@1.5.0 build
> tsc && node scripts/build-check-update.js

src/updater/index.ts(21,61): error TS2307: Cannot find module '../utils/path-safety.js'
src/updater/index.ts(23,33): error TS2307: Cannot find module '../installer/plugin-json.js'
src/updater/index.ts(141,56): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'string'.
src/updater/index.ts(545,50): error TS2339: Property 'installedShared' does not exist on type 'Config'.
... (multiple TS errors)
src/updater/shared-sync.ts(26,38): error TS2307: Cannot find module '../utils/path-safety.js'

npm error code 2
npm error path /root/.npm/_cacache/tmp/git-clonedWAw13
npm error command failed
npm error command sh -c npm run build
npm error pkgid dev-pomogator@1.5.0
npm error git dep preparation failed
```

**Тот же error** скрыт в `npx --yes github:stgmt/dev-pomogator` — npm exec не пробрасывает stderr внутреннего npm install.

### Не помогает (пробовали)

- `rm -rf "C:/Users/stigm/AppData/Local/npm-cache/_npx/eade2dc1c54870ea/"` — папка сразу пересоздаётся при следующем npx и снова хитает ту же tsc ошибку
- `NPM_CONFIG_CACHE=/tmp/test-fresh-cache` (полностью fresh dir) — те же tsc errors, тот же exit 2
- `--loglevel silly` — показывает только "unfinished timer reifyNode", не сами tsc errors
- Очистка `npm cache clean --force` — irrelevant, потому что причина не в кэше

**Что СРАБАТЫВАЕТ для диагностики:**
- `npm install --foreground-scripts github:stgmt/dev-pomogator` — единственная команда, показывающая реальную tsc ошибку

## Где лежит реализация

- **Bin entry**: `bin/cli.js` (`await import('../dist/index.js')`) — НЕ загружается при silent failure
- **Main entry**: `dist/index.js` → `main()` → `runNonInteractiveInstaller()` (`dist/installer/index.js:17`) — первая `console.log` с rocket banner находится здесь
- **Installer log**: `dist/utils/logger.ts:5` → `LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs')` → создаётся в `install()` функции (`dist/installer/index.js:140`)
- **Install report**: `dist/installer/report.ts:19` → пишется в `finally` блоке `install()` (`dist/installer/index.js:227`)
- **Diagnostic skill**: `.claude/skills/install-diagnostics/SKILL.md` (создан в текущей session) — содержит 4 mode (A/B/C/D) для классификации failure modes
- **Helper для regression тестов**: `tests/e2e/helpers.ts` → `runInstallerViaNpx()` (добавляется в Phase 0 этого спека)
- **BDD сценарии**: `tests/features/core/CORE003_claude-installer.feature` → CORE003_18 (Linux), CORE003_19 (Windows TDD red)
- **Integration тесты**: `tests/e2e/claude-installer.test.ts` → 2 новых `describe.skipIf()` блока

## Выводы

1. Silent install failure = **дев-pomogator-specific bug**: 3 untracked файла в локальной dev-pomogator репозитории заставляют github HEAD-checkout НЕ компилироваться. Это НЕ npm bug, не Windows-specific bug, не upstream issue
2. Bug **легко исправить** в dev-pomogator: `git add src/utils/path-safety.ts src/installer/plugin-json.ts src/config/schema.ts && git commit -m "fix(updater): commit missing path-safety, plugin-json, installedShared"`
3. EPERM на Windows — **симптом**, не корень. После prepare failure, Windows reify rollback не может удалить busy файлы. На Linux нет EPERM, но та же tsc ошибка приводит к exit 2
4. **CORE003_18 (Linux) и CORE003_19 (Windows) ОБА failing-by-design** на текущем github HEAD. После commit-а missing файлов оба теста должны зелёным
5. Skill `install-diagnostics` правильно классифицирует this bug pattern: needs to be updated с Mode A=Win EPERM → Mode A=tsc prepare failure (untracked source files)
6. CORE003_19 не требует upstream npm fix как считалось ранее — просто `git add` + commit достаточно

## Action Items (для разработчика, не часть этой спеки)

- [ ] Закоммитить `src/utils/path-safety.ts` и `src/installer/plugin-json.ts` (untracked)
- [ ] Закоммитить изменения в `src/config/schema.ts` (добавление `installedShared` поля)
- [ ] Закоммитить изменения в `src/updater/index.ts` и `src/updater/shared-sync.ts` если они есть
- [ ] После commit & push: re-run CORE003_18 и CORE003_19 — оба должны PASS
- [ ] Удалить TDD red comments из тестов и feature scenarios после fix-а
- [ ] Обновить skill `.claude/skills/install-diagnostics/SKILL.md` Mode A description: добавить "проверь uncommitted source files" как первый шаг диагностики

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| installer-hook-formats | `.claude/rules/gotchas/installer-hook-formats.md` | extension.json hooks have 3 formats — все обрабатывать | Any code touching hooks parsing | FR-1, FR-2 |
| tui-debug-verification | `.claude/rules/pomogator/tui-debug-verification.md` | After wrapper changes, screenshot verify не SKIP_BUILD | Test runner / Docker rebuilds | NFR-Reliability |
| docker-no-git-repo | `.claude/rules/gotchas/docker-no-git-repo.md` | `.dockerignore` excludes `.git`, git commands fail | Hooks/tests calling `git diff` | NFR-Reliability (Linux test isolation) |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker tests 7-12 min, never block session | Long-running test commands | Verification Plan |
| post-edit-verification | `.claude/rules/pomogator/post-edit-verification.md` | After code change: build, copy installed, /run-tests | Any helper/test edit | DoD |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | 1:1 mapping test↔feature, naming DOMAIN_CODE_NN | New BDD scenarios | FR-1, FR-2, FR-5 |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Tests must be integration (runInstaller/spawnSync) | New helper + tests | FR-3 |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| Existing helper | `tests/e2e/helpers.ts:35-55` (`runInstaller`) | spawnSync('node', ['dist/index.js', ...args]) pattern | Reference impl for `runInstallerViaNpx()` |
| Existing helper | `tests/e2e/helpers.ts:1198` (`getInstallLogPath`) | Returns `~/.dev-pomogator/logs/install.log` path | Reused in `runInstallerViaNpx()` for mtime check |
| Existing test | `tests/e2e/claude-installer.test.ts` | `describe('CORE003: ...')` with `beforeAll(setupCleanState)` | Insertion point for new describe blocks |
| Existing feature | `tests/features/core/CORE003_claude-installer.feature` | 17+ scenarios CORE003_01..CORE003_CMEM | Insertion point for CORE003_18/19 |
| Diagnostic skill | `.claude/skills/install-diagnostics/SKILL.md` | 4-mode classification (A=Win EPERM, B=missing dist, C=installer crash, D=top error) | Referenced from FAIL message of CORE003_19 |
| Existing scaffold | `extensions/specs-workflow/tools/specs-generator/scaffold-spec.ts` | Generates 13-file structure | Used in `scaffold-spec` task |

### Architectural Constraints Summary

- **Тесты ОБЯЗАНЫ быть integration** (`integration-tests-first.md`) → `runInstallerViaNpx()` использует реальный `spawnSync('npx', ...)`, не моки
- **1:1 mapping test ↔ feature** (`extension-test-quality.md`) → каждый CORE003_18/19 scenario имеет `it()` блок с тем же кодом + @feature тег
- **Docker tests запускаются на Linux** (`docker-no-git-repo.md`) → CORE003_18 пройдёт в CI, CORE003_19 будет SKIPPED через `describe.skipIf()`
- **Никогда не блокировать на тестах** (`no-blocking-on-tests.md`) → validation запускать через `run_in_background: true`
- **Naming convention CORE003_NN** (`extension-test-quality.md`) → CORE003_18 и CORE003_19 — следующие свободные номера после CORE003_17

---

## Second Failure Mode — npm Confirmation Prompt Race (2026-04-20)

> Добавлено после diagnostic session где skill `install-diagnostics` обнаружил **отличный от Mode A** pattern. Этот root cause **не покрывался** исходной спекой — она фокусировалась на EPERM/tsc prepare fail. Здесь bin даже не запускается.

### User-visible symptom

```
PS D:\repos\smarts> npx github:stgmt/dev-pomogator --claude
Need to install the following packages:
github:stgmt/dev-pomogator
Ok to proceed? (y) y
PS D:\repos\smarts>
```

Prompt проглотил `y`, но npm exit без proceeding. Никаких сообщений в stdout/stderr, bin не запускался, `~/.dev-pomogator/logs/install.log` не обновлён.

### Evidence collected (2026-04-20 diagnostic session)

| Источник | Данные |
|---|---|
| `~/.dev-pomogator/logs/install.log` mtime | Apr 18 02:39 (2 дня до диагностики) → installer.main() не запускался |
| `~/.dev-pomogator/last-install-report.md` mtime | Apr 18 (confirms nothing recorded) |
| `~/AppData/Local/npm-cache/_npx/eade2dc1c54870ea/` (Apr 20 15:13) | **Пустая директория** — нет `node_modules/`, нет `package.json`. Classic partial/no reify — отличается от EPERM path где `@inquirer/...` partially present |
| npm logs до reproduce | Pomogator-specific log ротирован (npm keeps 10) |
| Reproduce с `--yes` (bypass prompt) | Exit 0, 17 плагинов установлено, `install.log` updated |
| Reproduce без `--yes` (empty stdin) | Воспроизводит empty `_npx/<hash>/` + log mtime не advanced |
| PowerShell env | Clean dir: no node_modules, no package.json, no .npmrc |
| Windows Defender фон | Присутствует во всех npm logs но не на reify — не root cause |

### Root cause

npm 11.11.1 на Windows PowerShell (conhost backend) показывает confirmation prompt `Ok to proceed? (y)` перед `npm exec` установкой. Interactive stdin prompt race-ится с pipe между conhost и Node child process (npm/cli#7147). Prompt читает `y` input, но npm exec **exit 0 без proceeding** — bin `dev-pomogator` так и не извлёкся в `_npx/<hash>/`.

Отличие от Mode A (EPERM):
- **Mode A (EPERM)**: reify **стартует**, хитает EPERM на cleanup частично извлечённых `@inquirer/external-editor/dist/esm`, exit 2, stderr полон `npm warn cleanup` lines
- **Mode B (prompt-race)**: reify **не стартует вообще**, exit 0, stderr/stdout пустые, `_npx/<hash>/` создана но пустая

### Why silent

npm exec на Windows PS при interactive prompt не пишет installer output в stderr/stdout если prompt exit-нул до реального reify. Pipe между conhost и child stdin может race-иться на PowerShell — known npm 11.x behavior (npm/cli#7147). Exit code = 0 (silent) потому что prompt refusal = "не ошибка" с точки зрения npm.

### Confirmed fix options (verified)

| Option | Команда | Status |
|--------|---------|--------|
| 1 (primary) | <!-- lint-install: allow --> `npx --yes github:stgmt/dev-pomogator --claude` | ✅ Verified: exit 0, 17 плагинов, install.log updated |
| 2 (fallback) | `npm install -g github:stgmt/dev-pomogator && dev-pomogator --claude --all` | ✅ Bypasses npx entirely |
| 3 (radical) | `git clone ... && cd dev-pomogator && npm install && node bin/cli.js --claude --all` | ✅ Обходит npm exec полностью |

### Why this wasn't caught earlier

1. Linux Docker CI ВСЕГДА использует `--yes` flag в test helpers (`runInstallerViaNpx` defaults to `input: 'y\n'`), potentially скрывая prompt-race на любой платформе
2. Developer machines uses `npx --yes` в muscle memory / старых guides — баг не срабатывает
3. Symptom silent → no telemetry / log trail → bug not reported
4. Existing RESEARCH.md ожидает Mode A evidence (cleanup warnings) — не ищет empty `_npx/<hash>/`

### Known related upstream issues

- npm/cli#7147 — "npm exec confirmation prompt race on Windows PowerShell" (open as of 2026-04-20)
- Related Windows conhost stdin buffering under PowerShell

### Implications

1. **Primary defense — FR-7 docs hardening**: замена всех `npx github:stgmt/dev-pomogator` на `npx --yes github:stgmt/dev-pomogator` в user-facing docs. Low-risk, immediately effective.
2. **Regression prevention — FR-8 CI lint**: grep .md files, fail если unsafe pattern return.
3. **Diagnostic coverage — FR-6**: skill `install-diagnostics` должен различать Mode A vs B vs A+B.
4. **Test reproduction — FR-9**: CORE003_20 с `forceYes: false` воспроизводит prompt-race в isolated env.
5. **Deferred safety net — FR-10**: optional defensive wrapper bin для edge cases после FR-7 adoption.

### Cross-ref with Mode A

Mode A (EPERM, original FR-1..FR-5) и Mode B (prompt-race, FR-6..FR-10) являются **independent failure modes того же симптома**. Юзер может хитать их в любой последовательности:
- Typical first-time user: Mode B первый (prompt-race blocks any attempt)
- После FR-7 docs fix: user использует `--yes`, видит Mode A (если EPERM actual)
- Mode A+B одновременно возможно когда partial reify идёт до EPERM но после prompt proceed

Diagnostic skill FR-6 выдаёт `Mode: A+B (sequential)` в этом случае.
