# Design

## Реализуемые требования

- [FR-1: Persistent log для docker-test.sh output](FR.md#fr-1-persistent-log-для-docker-testsh-output)
- [FR-2: Обновить rule `no-blocking-on-tests`](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg)
- [FR-3: Directory lifecycle](FR.md#fr-3-directory-lifecycle--dev-pomogatordocker-status-создаётся-безопасно)
- [FR-4: Gitignore verification](FR.md#fr-4-log-rotation--gitignore--не-коммитить-test-run-log)
- [FR-5: Exit code preservation](FR.md#fr-5-exit-code-preservation--regression-guard)

## Компоненты

- `scripts/docker-test.sh` — shell wrapper над `docker compose run`; patched для tee на persistent log
- `.claude/rules/pomogator/no-blocking-on-tests.md` — always-apply rule, extended с Anti-patterns section
- `.dev-pomogator/.docker-status/` — existing managed directory (gitignored через `.dev-pomogator/`)

## Где лежит реализация

- App-код: `scripts/docker-test.sh:69-72` (текущий `docker compose run` invocation) — точка вставки `tee`
- Wiring: `.claude/rules/pomogator/no-blocking-on-tests.md` (always-apply rule, триггерится на Docker test context)
- Gitignore: `.gitignore:34` (`.dev-pomogator/` already ignored — verified via grep)

## Директории и файлы

- `scripts/docker-test.sh` (edit)
- `.claude/rules/pomogator/no-blocking-on-tests.md` (edit)
- `tests/e2e/docker-test-tee.test.ts` (create) — integration test для FR-1/FR-3/FR-5
- `tests/features/fix-bg-output-loss.feature` (create) — BDD scenarios
- `tests/fixtures/docker-test-tee/` (create) — fixtures для integration test

## Алгоритм (docker-test.sh patch)

1. В начале скрипта после `set -o pipefail` (строка 6) вычислить переменную `LOG_DIR` со значением `.dev-pomogator/.docker-status` и переменную `LOG_FILE` со значением `"$LOG_DIR"/test-run-"$(date +%s)".log`
2. Выполнить `mkdir -p "$LOG_DIR"` для idempotent создания директории (FR-3)
3. Перед `docker compose run` блоком (строки 69-72) вывести в stdout: `echo "[docker-test] Log: $LOG_FILE"` — чтобы AI/user видели путь в первую строку (Usability NFR)
4. В `docker compose run` invocation добавить в pipeline `2>&1 | tee -a "$LOG_FILE"` → output идёт в stdout родителя AND в log файл одновременно
5. `set -o pipefail` (уже активен) гарантирует: если `docker compose run` exits non-zero → docker-test.sh тоже non-zero (FR-5)
6. Trap cleanup (строки 25-28) НЕ трогает log файл — файл остаётся на диске после exit для incident recovery

### Patch diff (indicative)

Три additions около строк 6, 63, 69-72 оригинального `scripts/docker-test.sh`:

1. После `set -o pipefail` — добавить переменные `LOG_DIR` (значение `.dev-pomogator/.docker-status`) и `LOG_FILE` (значение `"$LOG_DIR"/test-run-"$(date +%s)".log`), затем `mkdir -p "$LOG_DIR"`.
2. Непосредственно перед блоком `docker compose ... run` — echo строки `[docker-test] Log: "$LOG_FILE"` в stdout (usability — AI/user сразу видит путь).
3. В конце invocation `docker compose -f docker-compose.test.yml run --rm -T ... test "$@"` — добавить `2>&1 | tee -a "$LOG_FILE"`.

Полный patch будет применён Edit tool'ом в implementation фазе. `set -o pipefail` из строки 6 сохраняется; exit code `docker compose run` propagates наверх.

## Алгоритм (rule update)

1. В `no-blocking-on-tests.md` после секции "Чеклист" добавить новую секцию `## Anti-pattern: `| tail` в bg`
2. Документировать 3 hypotheses (H1/H2/H3) одной строкой каждая (ссылка на RESEARCH.md для details)
3. Показать Неправильно vs Правильно с `tee` fallback
4. Добавить чеклист-bullet: `- [ ] Bg команда с `\| tail` использует `\| tee <path> \| tail -N` (не naked tail)`

## API

N/A — feature не добавляет API endpoints.

## BDD Test Infrastructure

**Classification:** TEST_DATA_NONE

**TEST_FORMAT:** BDD

**Framework:** vitest (BDD-style describe/it + @featureN теги)

**Install Command:** already installed (evidence: `package.json` + `tests/e2e/*.test.ts` existing patterns)

**Evidence:** `tests/e2e/` содержит 10+ existing BDD-style test files используя `describe()/it()` + `spawnSync` / `runInstaller` integration pattern. Framework vitest — detected в `package.json` devDependencies (see RESEARCH.md "Existing Patterns & Extensions" table).

**Verdict:** No hooks required. Феча проверяет поведение shell скрипта и текст правила — не создаёт persistent test data, не мутирует внешние системы. Integration tests используют `os.tmpdir()` для temporary log paths, cleanup через `afterEach(fs.rm)` на scope одного test file (no global hooks).

<!-- Подсекции Existing hooks / New hooks / Cleanup Strategy / Test Data & Fixtures / Shared Context удалены из-за TEST_DATA_NONE — не заполняются. -->

## Out of Scope propagation

- **FR-6** (feedback memory) — OUT OF SCOPE. User Story #4 также OUT OF SCOPE.
- Reproduction test H1 vs H2 vs H3 — OUT OF SCOPE (22-минутный run; defense-in-depth решение закрывает все три без подтверждения).
- Upstream Anthropic feature request (bg capture sentinel) — OUT OF SCOPE (filed separately).
- Log rotation policy (старше X дней) — OUT OF SCOPE (user manual cleanup; < 500KB typical size).

## Risks

N/A — не используется TEST_FORMAT=UNIT escape hatch. BDD framework установлен, никаких legacy constraints.
