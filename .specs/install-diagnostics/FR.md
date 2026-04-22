# Functional Requirements (FR)

## FR-1: Linux npx install regression coverage @feature1

Test suite ДОЛЖЕН содержать BDD-сценарий `CORE003_18` в `tests/features/core/CORE003_claude-installer.feature` и парный integration-тест в `tests/e2e/claude-installer.test.ts`, который проверяет что:

- `npx --yes github:stgmt/dev-pomogator --claude --all` на Linux exit с кодом `0`
- stdout содержит rocket banner `🚀 dev-pomogator installer (non-interactive)`
- stdout содержит completion message `✨ Installation complete`
- mtime `~/.dev-pomogator/logs/install.log` advances during run (proves installer.main() ran)
- `_npx/<hash>/node_modules/dev-pomogator/package.json` существует после install (proves bin extracted)
- stderr НЕ содержит `npm warn cleanup` сообщений (no Windows-style EPERM на Linux)

**Назначение:** Изначально задумывался как control test (passing). Но reproduction показал что Linux ТОЖЕ failing-by-design на текущем github HEAD из-за той же причины что и Windows: untracked source files (`src/utils/path-safety.ts`, `src/installer/plugin-json.ts`, `installedShared` field в `schema.ts`) ломают tsc compile в `prepare` script.

**Текущий статус:** TDD red. Должен стать PASS после commit-а missing файлов в git. См. [RESEARCH.md "Action Items"](RESEARCH.md#action-items-для-разработчика-не-часть-этой-спеки).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-linux-control-test-passes-in-docker-ci)

## FR-2: Windows npx install regression coverage @feature2

Test suite ДОЛЖЕН содержать BDD-сценарий `CORE003_19` в `tests/features/core/CORE003_claude-installer.feature` и парный integration-тест в `tests/e2e/claude-installer.test.ts`, который проверяет что:

- `npx --yes github:stgmt/dev-pomogator --claude --all` на Windows exit с кодом `0`
- stdout содержит rocket banner и completion message
- mtime install.log advances
- _npx cache populated с dev-pomogator
- stderr НЕ содержит `npm warn cleanup` (regression-тест на silent failure bug)

**Назначение:** TDD red regression-тест на known silent install failure. **Должен FAIL** на Windows host пока missing файлы не закоммичены (см. [RESEARCH.md](RESEARCH.md)). После commit-а missing source файлов станет green автоматически — assertions идентичны Linux test (FR-1).

**TDD red rationale:** failing test = живая документация bug-а для будущего fix-коммитера. Когда тест зелёный — bug точно исправлен, не нужен manual verification.

**Windows-specific симптом:** дополнительно к exit 2, на Windows reify rollback генерирует `npm warn cleanup ... EPERM ... rmdir @inquirer/external-editor/dist/esm` сообщения (на Linux их нет). Эти warnings — симптом, не корень. Корень одинаков на обеих платформах: tsc fails в prepare script.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-post-fix-feature2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-windows-regression-test-fails-on-windows-host-tdd-red--current-state), [UC-3](USE_CASES.md#uc-3-windows-regression-test-passes-after-upstream-fix-post-fix-state)

## FR-3: runInstallerViaNpx helper API @feature3

Helper-функция `runInstallerViaNpx(args, options)` ДОЛЖНА существовать в `tests/e2e/helpers.ts` и предоставлять следующий API:

- **Input**: `args: string` (default `'--claude --all'`), `options: { fresh?: boolean }`
- **Output**: `Promise<NpxInstallResult>` с полями:
  - `stdout: string` — captured stdout
  - `stderr: string` — captured stderr
  - `exitCode: number` — process exit code
  - `cleanupWarnings: string[]` — lines from stderr matching `/npm warn cleanup/i`
  - `cachePopulated: boolean` — true если `_npx/<hash>/node_modules/dev-pomogator/package.json` existed после run
  - `installerLogTouched: boolean` — true если mtime install.log advanced during run
  - `tempDir: string` — created via `mkdtempSync` (caller responsible for cleanup)
  - `tempCache: string | null` — created via `mkdtempSync` если `options.fresh === true`

**Поведение:**
- Создаёт isolated temp working dir через `fs.mkdtempSync(path.join(os.tmpdir(), 'pom-npx-'))`
- При `options.fresh === true` создаёт fresh `NPM_CONFIG_CACHE` через mkdtemp
- Замеряет mtime install.log ДО запуска
- Запускает `npx --loglevel verbose --yes github:stgmt/dev-pomogator <args>` через `spawnSync` с `input: 'y\n'`
- Парсит stderr на cleanup warnings
- Проверяет cache state и log mtime после run
- Возвращает structured result

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3-feature3)
**Leverage:** см. existing `runInstaller()` в `tests/e2e/helpers.ts:35-55` как reference

## FR-4: install-diagnostics spec structure @feature4

`.specs/install-diagnostics/` ДОЛЖНА быть создана с full 13-file structure согласно `.claude/rules/specs-workflow/specs-validation.md`. Все 13 обязательных файлов + опциональный `install-diagnostics.feature` ДОЛЖНЫ быть заполнены focused-контентом про silent install bug.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4-feature4)

## FR-5: Cross-references via @featureN tags @feature5

@featureN теги ДОЛЖНЫ связывать:

- FR-1 (этот FR.md) ↔ AC-1 (ACCEPTANCE_CRITERIA.md) ↔ CORE003_18 scenario (CORE003 feature file)
- FR-2 ↔ AC-2/AC-3 ↔ CORE003_19 scenario
- FR-3 ↔ AC-4
- FR-4 ↔ AC-5
- FR-5 ↔ AC-6
- Каждый `it()` блок в `tests/e2e/claude-installer.test.ts` для CORE003_18/19 ДОЛЖЕН иметь `// @feature18` / `// @feature19` comment

**Назначение:** автоматическая трассируемость требований до тестов. `audit-spec.ts -Path ".specs/install-diagnostics"` должен находить все cross-refs без ошибок.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-5-feature5)

---

# Second Failure Mode: npm Confirmation Prompt Race (2026-04-20)

> Добавлено после live diagnostic report пользователя: `npx github:stgmt/dev-pomogator --claude` → `Ok to proceed? (y) y` → **silent exit 0**, без каких-либо сообщений, `~/.dev-pomogator/logs/install.log` не обновляется, `_npx/<hash>/` содержит **пустую папку** (без node_modules, без package.json — classic partial/no reify).
>
> Это **второй независимый root cause** для того же симптома "silent install failure" — отличается от EPERM-path (FR-1..FR-5) тем, что **reify даже не стартует**. Evidence: reproduce с `--yes` flag → exit 0, 17 плагинов установлено; reproduce **без** `--yes` → пустая `_npx/eade2dc1c54870ea/`, install.log mtime не двигается.

## FR-6: Prompt-race failure mode detection @feature6

Diagnostic skill `/install-diagnostics` ДОЛЖЕН различать два независимых silent-failure modes через evidence-driven branching. Схема именований compatible со существующим `INSTALL_DIAG_02`:

**Mode A — Reify EPERM (existing, FR-1..FR-5):**
- `_npx/<hash>/node_modules/@inquirer/...` partially present
- stderr содержит `npm warn cleanup`
- exit code = 2
- Reproduce с `--yes` всё равно fails (same EPERM)

**Mode B — Prompt-race (new, this FR-6..FR-10):**
- `fs.readdirSync('_npx/<hash>/')` returns `[]` (либо отсутствует `node_modules/`)
- install.log mtime NOT advanced
- stderr/stdout юзера пустые (kроме `Ok to proceed? (y)` prompt)
- exit code от `npx` = 0 (silent)
- Reproduce с `--yes` flag → success → confirms prompt-race

Skill SHALL output `Mode: A` или `Mode: B` в report header. IF both indicators present — output `Mode: A+B (sequential)` с hint что prompt-race blocks user from ever hitting EPERM issue. Backward compatibility: `INSTALL_DIAG_02` scenario (уже labels "Mode A — Windows EPERM") остаётся valid.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-6-feature6)
**Use Case:** [UC-4](USE_CASES.md#uc-4-promptrace-detection-feature6)

## FR-7: Docs hardening — `--yes` flag in all user-facing install commands @feature6

Все user-facing документы, содержащие `npx github:stgmt/dev-pomogator` или `npx dev-pomogator` как install instruction, SHALL использовать `npx --yes github:stgmt/dev-pomogator` (или `npx -y`). Затрагивает:

- `README.md` (root) — badge-row install snippet + Getting Started section
- `extensions/*/README.md` — individual extension install examples
- `docs/**/*.md` — any docs mentioning install commands
- `CLAUDE.md` — root-level developer docs
- `src/installer/messages.ts` (если есть hint strings) — post-error fallback suggestions
- Marketing pages / site content (если есть)

**Rationale**: `npx` без `--yes` показывает `Ok to proceed? (y)` prompt при first-time fetch from github. На Windows PowerShell (npm 11.x) этот prompt race-ится с stdin через conhost pipe (npm/cli#7147) — prompt consumes `y` input, но npm exec exits без proceeding. Поведение воспроизводится при cold npx cache. `--yes` bypass-ит prompt entirely.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-7-feature6)
**Use Case:** [UC-5](USE_CASES.md#uc-5-docs-hardening-prevents-silent-failure-feature6)

## FR-8: Install-command lint check (regression prevention) @feature6

Repo SHALL содержать lint/regression check который grep-ает tracked .md files на pattern `npx github:stgmt/dev-pomogator` БЕЗ preceding `--yes` / `-y` flag и fails build если found. Реализация:

- Новый tool: `tools/lint-install-commands.ts` (или скрипт внутри `tests/e2e/`)
- Pattern (regex): `/npx\s+(?!--?yes\s+|-y\s+)(?:github:stgmt\/)?dev-pomogator/`
- Exclusions: `CHANGELOG.md` (historical), `.specs/**/RESEARCH.md` (research logs), файлы с `<!-- lint-install: allow -->` markers
- Integration: vitest test `CORE007_12 docs have --yes flag in all npx install examples` OR separate `npm run lint:docs`

IF pattern found without `--yes` → test fails с list of offending lines и hint "Add `--yes` to prevent npm/cli#7147 prompt race on Windows PowerShell".

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-8-feature6)

## FR-9: BDD regression scenario for prompt-race (CORE003_20) @feature6

Test suite ДОЛЖЕН содержать BDD scenario `CORE003_20 npx prompt-race produces empty _npx cache` в `tests/features/core/CORE003_claude-installer.feature` который:

- Сетап: fresh `NPM_CONFIG_CACHE` (mkdtemp) чтобы гарантировать cold fetch → prompt triggered
- Запускает: `npx github:stgmt/dev-pomogator --claude --all` (БЕЗ `--yes`) через `spawnSync` с `input: ''` (empty stdin, чтобы prompt не получил answer), `timeout: 30_000`
- Ожидает: either exit 0 (on platforms where prompt times out → npx aborts) OR exit non-zero
- Проверяет post-state: `_npx/<hash>/node_modules/dev-pomogator/package.json` НЕ существует (nothing reified)
- Проверяет post-state: install.log mtime NOT advanced

**TDD status:** initially passing (проверяет что failure mode reproducible). После FR-10 defensive fix в bin — scenario должен быть **skipped** или **inverted** (install всё равно should work despite prompt race через defensive proxy bin).

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-9-feature6)

## FR-10: Defensive bin wrapper (optional/deferred) @feature6

IF prompt-race proves to be recurring issue после FR-7 docs fix, repo MAY introduce defensive wrapper scheme:

- `package.json.bin.dev-pomogator` → thin `bin/dev-pomogator-safe.cjs` wrapper
- Wrapper writes to `~/.dev-pomogator/logs/wrapper-entry.log` ON EVERY invocation (persistent marker что bin ran)
- Then wrapper invokes real `bin/dev-pomogator.cjs`
- Diagnostic skill SHALL читать `wrapper-entry.log` как "proof bin was invoked" — если empty after `npx` → 100% confirmation prompt-race (bin не запускался совсем)

Marked as `[DEFERRED]` — реализация depends on whether docs fix (FR-7) alone окажется достаточным. Decision point: если >1 user report в `.specs/install-diagnostics/RESEARCH.md` в течение 3 месяцев → implement; иначе skip.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-10-feature6)
