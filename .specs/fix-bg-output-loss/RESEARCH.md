# Research

## Контекст

Во время verification прогона scope-gate extension фичи background Bash task `bd9aii2if` (команда: `bash scripts/docker-test.sh npx vitest run -t "SCOPEGATE" 2>&1 | tail -40`) отработала 22 минуты и завершилась `exit 0`, но captured stdout оказался **0 байт**. Это не падение — это тихая потеря output'а: процесс работал, Docker build прошёл, vitest запускался, но ни одной строки не осталось в harness capture file.

Инцидент полностью не блокирует shipping фичи (unit + hook-level тесты пройдены standalone), но создаёт прецедент: любой будущий long-running bg task с паттерном `| tail` подвержен тому же silent-loss.

## Источники

- **Reproduction matrix (2026-04-23)**: 5 эмпирических bg Bash тестов с изменением duration/pipe/tail — задокументированы в incident report конверсации. Коротие (<1 мин) с pipe+tail — работают. 22-мин с pipe+tail+docker — 0 bytes.
- **Code inspection**: `test_runner_wrapper.ts:366` использует `process.stdout.write(text)` — forward активен.
- **Foreground replication**: та же команда без `run_in_background` — output видимый.
- **Git-Bash / Windows environment**: host = Windows 11, shell = Git-Bash; `docker compose -T` disables pseudo-TTY — вход в non-line-buffered mode possible.
- **Node.js Docs (TS via native strip-types)**: `nodejs.org/api/typescript.html` — относится к tsx-runner chain, но не к subject bug.

## Технические находки

### Где живёт проблема

Цепочка от bg task до capture file:

```
Claude harness (run_in_background: true)
  └─ bash -c "bash scripts/docker-test.sh ... 2>&1 | tail -40"
       └─ docker-test.sh (scripts/docker-test.sh)
            └─ docker compose -f docker-compose.test.yml run --rm -T test "$@"
                 └─ tini (Dockerfile ENTRYPOINT)
                      └─ test_runner_wrapper.cjs (CJS shim)
                           └─ tsx test_runner_wrapper.ts (TS wrapper)
                                └─ npx vitest
                                     └─ testing code
```

Каждое звено в foreground верифицировано. Проблема появляется только когда:
1. Task запущена как `run_in_background: true` в Claude harness
2. Duration ≥ ~20 минут
3. Команда использует pipe `| tail -N`
4. Внутри — `docker compose run -T` (non-TTY)

### Ranked hypotheses

| H# | Severity | Description | How to confirm |
|----|----------|-------------|----------------|
| H1 | LIKELY | Harness capture handle dropped после продолжительного idle/volume | 22-мин bg run с `\| tee /tmp/full.log` — если capture пустой, а tee полный → H1 |
| H2 | PLAUSIBLE | Git-Bash / Cygwin pipe buffer race в detached subshell при EOF | 22-мин bg run без tail, `&> /tmp/run.log` — если capture работает → H2 |
| H3 | PLAUSIBLE | `docker compose -T` + block-vs-line buffering на long-output non-TTY | diagnostic run со `stdbuf -oL docker compose ...` |
| H4 | UNLIKELY | `test_runner_wrapper` перенаправляет в log-only | Отвергнуто: код на `:366` forward'ит `process.stdout.write(text)` |
| H5 | UNLIKELY | `docker-test.sh` trap EXIT убивает pipe раньше flush'а | Отвергнуто: trap runs после `docker compose run` returned |

Remediation должен покрыть **все три plausible hypotheses одновременно** (H1/H2/H3) → defense in depth через `tee` persistent log.

### Существующий pattern в проекте

`docker-test.sh` уже использует `| tail -20` для build output (строки 41, 52) — но это короткий output (<100 строк), не триггерит баг. Проблема именно на vitest run output (строки ×∞ за 22 минуты).

Скрипт уже создаёт директорию `.dev-pomogator/.test-status/` (строка 11) — есть прецедент для persistent status файлов. Директория `.dev-pomogator/.docker-status/` также используется `tui-debug-verification.md` правилом для YAML heartbeat.

### Анти-паттерн в AI-generated bg commands

Конкретный паттерн, который триггерит bug:
```bash
# ❌ single point of failure
<long-cmd> 2>&1 | tail -N   # с run_in_background: true
```

`| tail` полезен для сокращения output в Claude chat, но является единственной точкой захвата. Если что-то в цепочке дропнет data — 0 bytes.

Safe pattern:
```bash
# ✅ defense in depth
<long-cmd> 2>&1 | tee /tmp/full.log | tail -N
# или
<long-cmd> &> /tmp/full.log; tail -N /tmp/full.log
```

## Где лежит реализация

- App-код для патча: `scripts/docker-test.sh` (workflow-level wrapper над `docker compose run`)
- Rule-обновление: `.claude/rules/pomogator/no-blocking-on-tests.md`
- Persistent log каталог: `.dev-pomogator/.docker-status/test-run-<timestamp>.log` (новый path)
- Feedback memory: `C:\Users\stigm\.claude\projects\D--repos-dev-pomogator\memory\feedback_bg-tail-requires-tee.md` (новый)

## Выводы

1. **Root cause не 100% confirmed** (нужен 22-мин reproduction test), но все три plausible hypotheses закрываются одним решением: параллельный `tee` на persistent disk log.
2. **Harness internals opaque** — нельзя audit bg capture lifecycle без Anthropic support; поэтому defensive code на app-стороне оправдан.
3. **Rule-обновление важнее скрипта** — docker-test.sh это единственный вызов, но anti-pattern `| tail` в bg применим ко **всем** long-running командам. Без правила AI сгенерирует naked `| tail` снова.
4. **Regression risk minimal**: `tee` — POSIX, присутствует в Git-Bash и всех Linux/Docker контейнерах. Добавление `tee` в pipeline не меняет exit code (first-command pipeline success via `set -o pipefail` уже активен в docker-test.sh:6).

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker tests 7-12 мин; run_in_background без блокировки | запуск docker тестов | FR-2 (обновить rule с tee pattern) |
| tui-debug-verification | `.claude/rules/pomogator/tui-debug-verification.md` | Проверка compact bar через YAML heartbeat в .dev-pomogator/.docker-status/ | TUI/statusline/wrapper changes | NFR-Reliability (используем тот же каталог) |
| centralized-test-runner | `.claude/rules/tui-test-runner/centralized-test-runner.md` | Тесты только через /run-tests; прямые команды блокируются | test commands | FR-1 (tee в docker-test.sh → доступно через /run-tests) |
| post-edit-verification | `.claude/rules/pomogator/post-edit-verification.md` | После изменения кода: build, copy installed, /run-tests bg, screenshot UI | любое изменение кода | AC-3 (verify rule update применяется) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| docker-test.sh | `scripts/docker-test.sh` | Docker compose wrapper, session isolation, trap cleanup, set -o pipefail | Direct edit target для FR-1 |
| .docker-status dir | `.dev-pomogator/.docker-status/` | Existing directory for YAML heartbeat (tui-debug-verification) | Reuse для test-run-*.log persistent logs |
| .test-status dir | `.dev-pomogator/.test-status/session.env` | Session ID передаётся между hooks и docker-test.sh | Pattern: `.dev-pomogator/.*-status/` для transient runtime artifacts |
| set -o pipefail | `scripts/docker-test.sh:6` | Fail-fast exit если любой command в pipe fails | Safe для `tee` insertion — exit code сохраняется |
| TypeScript / vitest | `tests/e2e/*.test.ts` | Existing BDD-style tests через vitest | TEST_DATA_NONE — feature не создаёт persistent data в test-scope |

### BDD Framework Detection (for test-project)

- **Language**: TypeScript
- **Framework**: vitest (BDD-style через describe/it + @featureN теги)
- **Evidence**: `tests/e2e/*.test.ts` существуют, vitest в package.json
- **Install**: already installed
- **Hook convention**: `tests/e2e/` — describe-level beforeEach/afterEach; no global BeforeAllHook file pattern
- **Config**: `vitest.config.ts`

### Architectural Constraints Summary

- `docker-test.sh` uses `set -o pipefail` → insert `tee` в pipeline безопасно (exit preserved)
- `.dev-pomogator/.docker-status/` уже существует и gitignored (prior art — `tui-debug-verification`)
- Правило `no-blocking-on-tests.md` — в категории `pomogator/` (dogfood rules), обновление триггерит rules-optimizer skill automatically
- Никаких breaking changes для существующих invocations `docker-test.sh` — только additive behavior (extra tee)
- Rule change будет self-applying через CLAUDE.md rules index (нет manual install)
