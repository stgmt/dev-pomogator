# Research

## Контекст

Тесты dev-pomogator запускаются через centralized `/run-tests` skill. Текущий `test_guard.ts` блокирует прямые тест-команды, но НЕ проверяет актуальность билда. Результат: тесты бегут на устаревшем `dist/`, ошибки не воспроизводятся или воспроизводятся ложно.

Проблема особенно выражена при Docker тестах: `docker compose up` без `--build` использует кэшированный образ с устаревшим кодом.

## Источники

- `extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts` — текущий PreToolUse hook
- `extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts` — framework dispatch table
- `.claude/skills/run-tests/SKILL.md` — skill flow
- `scripts/docker-test.sh` — Docker test orchestrator
- `Dockerfile.test` — app layer с CACHEBUST
- `package.json` — build scripts (`tsc && node scripts/build-check-update.js`)

## Технические находки

### Текущий build pipeline

**Host (TypeScript):**
- `npm run build` → `tsc && node scripts/build-check-update.js`
- Source: `src/**/*.ts` → Output: `dist/**/*.js`
- Нет автоматической проверки staleness

**Docker:**
- `Dockerfile.test` использует `ARG CACHEBUST=1` для инвалидации COPY layer
- `docker-test.sh` всегда ставит `CACHEBUST=$(date +%s)` → rebuild COPY layer каждый раз
- НО: `docker compose up` без `--build` пропускает rebuild образа целиком
- `SKIP_BUILD=1` env var позволяет skip rebuild вручную

### Staleness detection — gap analysis

| Scope | Текущая проверка | Gap |
|-------|-----------------|-----|
| TypeScript `src/` → `dist/` | Нет | mtime comparison нужен |
| Docker image | CACHEBUST epoch | `--build` может быть пропущен |
| dotnet `**/*.cs` → `bin/` | Нет | `dotnet test` делает implicit build, но с `--no-build` — нет |
| pytest | N/A (интерпретируемый) | Не нужен |
| go/rust | N/A (compiler handles) | `go test` и `cargo test` компилируют сами |

### Фреймворки, которым НЕ нужен build-guard

- **pytest**: Python интерпретируемый, нет compile step
- **go**: `go test` компилирует автоматически
- **rust**: `cargo test` компилирует автоматически

### Фреймворки, которым НУЖЕН build-guard

- **vitest/jest**: если тестируют `dist/` output (не source напрямую). В dev-pomogator тесты тестируют `dist/` → нужен
- **dotnet**: `dotnet test` делает implicit build, НО с `--no-build` — нет. Нужен guard для `--no-build` сценария
- **Docker**: нужен `--build` при изменениях source/Dockerfile

### Точки интеграции

1. **run-tests SKILL.md** — добавить Step между detect framework и build command
2. **dispatch.ts** — добавить `prebuildCommand` в dispatch table
3. **test_guard.ts** — не трогать (он про блокировку прямых команд, не про build)

## Где лежит реализация

- Skill flow: `.claude/skills/run-tests/SKILL.md`
- Framework dispatch: `extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts`
- Docker test script: `scripts/docker-test.sh`
- Test wrapper: `extensions/tui-test-runner/tools/tui-test-runner/test_runner_wrapper.ts`
- Extension manifest: `extensions/tui-test-runner/extension.json`

## Выводы

1. Build staleness check нужен как новый Step в `/run-tests` skill (между detect framework и build command)
2. Реализация — TypeScript модуль `build-staleness.ts` в tui-test-runner extension
3. Docker режим: ensure `--build` flag при изменениях
4. Фреймворки go/rust/pytest НЕ нуждаются в проверке (компилятор/интерпретатор)
5. StatusLine уже поддерживает `phases[]` — добавить фазу "build"

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| centralized-test-runner | `.claude/rules/tui-test-runner/centralized-test-runner.md` | Тесты только через /run-tests | Запуск тестов | FR-1, FR-2 |
| post-edit-verification | `.claude/rules/pomogator/post-edit-verification.md` | После КАЖДОГО изменения: build → copy → test | Изменение кода | FR-1, FR-3 |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker тесты 7-12 мин, run_in_background | Docker тесты | NFR-Performance |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json = source of truth | Изменение extension | FR-4 |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Интеграционные тесты обязательны | Написание тестов | Testing |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| test_guard.ts | `extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts` | PreToolUse Bash guard с BLOCKED/ALLOWED patterns | Паттерн для нового guard, но build-check будет в skill, не в hook |
| dispatch.ts | `extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts` | Framework → command mapping | Добавить prebuildCommand |
| docker-test.sh | `scripts/docker-test.sh` | CACHEBUST + SKIP_BUILD | Интеграция: ensure --build |
| run-tests SKILL.md | `.claude/skills/run-tests/SKILL.md` | 4-step skill flow | Добавить Step 1.5: Build Check |
| _shared/hook-utils.ts | `extensions/_shared/hook-utils.ts` | Shared logging, path resolution | Reuse для нового модуля |

### Architectural Constraints Summary

- **Skill-driven**: build check должен быть шагом в `/run-tests` skill, не отдельным PreToolUse hook (hook не имеет контекста framework)
- **Fail-open**: ошибка в staleness check → пропустить проверку, не блокировать тесты
- **Framework-aware**: staleness logic зависит от framework (TypeScript: src→dist, dotnet: cs→bin, Docker: source→image)
- **Extension-contained**: новый код в `extensions/tui-test-runner/tools/tui-test-runner/`
