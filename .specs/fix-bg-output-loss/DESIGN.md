# Design

## Реализуемые требования

### v0.1.0 (docker-test.sh)

- [FR-1: Persistent log для docker-test.sh output](FR.md#fr-1-persistent-log-для-docker-testsh-output)
- [FR-2: Обновить rule `no-blocking-on-tests`](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg)
- [FR-3: Directory lifecycle](FR.md#fr-3-directory-lifecycle--dev-pomogatordocker-status-создаётся-безопасно)
- [FR-4: Gitignore verification](FR.md#fr-4-log-rotation--gitignore--не-коммитить-test-run-log)
- [FR-5: Exit code preservation](FR.md#fr-5-exit-code-preservation--regression-guard)

### v0.2.0 (generic non-docker)

- ~~FR-7: Generic bg-log.sh wrapper~~ DEPRECATED v0.3.0 — replaced by FR-11
- FR-8: Rule update — confirmed Anthropic bug citations
- FR-9: PreToolUse bg-pipe-guard hook (OUT OF SCOPE)

### v0.3.0 (refactor — integrate into existing test_runner_wrapper)

- FR-10: Cleanup duplicate bg-log.sh (rollback FR-7)
- FR-11: Generic passthrough adapter в test_runner_wrapper
- FR-12: Smart converter hook (test_guard generates wrapper command)
- FR-13: /run-tests SKILL.md description + triggers
- FR-14: Skill trigger analysis report
- FR-15: Three-benchmark report
- FR-16: Installer hook path fix (conditional)

## v0.3.0 architecture — generic adapter integration

### Data flow (any long bg command)

```
Claude harness (run_in_background: true)
  └─ Skill("run-tests") OR direct Bash (denied + smart-converted by test_guard)
       └─ node test_runner_wrapper.cjs --framework <fw> -- <cmd> <args>
            └─ wrapper.ts:
                 - Resolves framework (vitest/jest/pytest/dotnet/rust/go/generic)
                 - Creates .dev-pomogator/.test-status/test.<prefix>.log
                 - Spawns <cmd> as child process
                 - Forwards stdout → parent + logStream.write(file)
                 - GenericAdapter.parseLine() returns null (no test events)
                 - YAML status: state building → running → passed/failed
                 - Heartbeat every 2s
```

### Why generic adapter (not standalone script)

| Concern | Standalone bg-log.sh (v0.2.0) | Generic adapter (v0.3.0) |
|---------|------------------------------|--------------------------|
| Persistent log | Duplicate of logStream.write() | Reuses existing infrastructure |
| YAML status | Not provided | Inherited from wrapper |
| Statusline / TUI monitoring | Not integrated | Auto-integrated |
| bg-task marker | Not provided | Inherited from wrapper |
| Discovery | Not applicable | Returns 0 for generic (no test count) |
| Maintenance burden | Two parallel systems | One unified wrapper |

### Smart converter hook (FR-12)

`test_guard.ts` reuses BLOCKED_PATTERNS for detection, adds `framework` field per entry, builds converted command on deny:

```typescript
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; framework: string }> = [
  { pattern: /\bdotnet\s+test\b/, framework: 'dotnet' },
  // ... 8 more patterns
];

function buildConvertedCommand(originalCommand: string, framework: string): string {
  const wrapperPath = '.dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs';
  return `node ${wrapperPath} --framework ${framework} -- ${originalCommand.trim()}`;
}
```

Output (excerpt from `permissionDecisionReason`):

```
🚫 Direct test command blocked: "dotnet test --filter MBIL001"

✅ Copy this exact wrapper invocation (smart-converter v0.3.0):

  node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework dotnet -- dotnet test --filter MBIL001
```

AI copies the line, runs it through Bash — теперь wrapped, persistent log, YAML status работают.

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

## Generic bg-log.sh architecture (v0.2.0)

### Why prefer direct redirect over `tee` pipe

`scripts/docker-test.sh` v0.1.0 использовал `... 2>&1 | tee -a "$LOG_FILE"`. Это работает для docker (process не Windows-native Bash subprocess), но для generic case (`dotnet test`, `pytest` напрямую) попадает в issue #16305 (pipeline data loss when pipeline is last element). v0.2.0 использует **прямой redirect без pipe** (`"$@" > "$LOG_FILE" 2>&1`) — обходит #16305 полностью, плюс exit code propagates через стандартный bash exit behavior без необходимости `set -o pipefail`.

### Data flow diagram

```
Claude Code Bash tool (run_in_background: true)
  └─ bash scripts/bg-log.sh <slug> <cmd> <args...>
       ├─ validates $# >= 2, sanitizes slug via `tr -cd 'A-Za-z0-9_-'`
       ├─ mkdir -p .dev-pomogator/.bg-logs/
       ├─ LOG_FILE=.dev-pomogator/.bg-logs/<epoch>-<slug>.log
       ├─ echo "[bg-log] Log: $LOG_FILE"   ← AI sees this in capture (single line)
       └─ "$@" > "$LOG_FILE" 2>&1          ← cmd output direct redirect, NO PIPE
            └─ <cmd> (dotnet test / pytest / cargo / sleep / anything)
                 └─ stdout+stderr → $LOG_FILE (на disk)
                 └─ exit code → bg-log.sh exit code (preserved)
```

### Why this beats 4 Anthropic bugs simultaneously

| Bug | Why redirect helps |
|-----|--------------------|
| [#16305](https://github.com/anthropics/claude-code/issues/16305) Pipeline lost | Нет pipe — нет потери |
| [#21915](https://github.com/anthropics/claude-code/issues/21915) Windows empty output | Output живёт в disk file, capture file `bg-log.sh` имеет всего одну строку (path) — почти всегда capture'ится корректно |
| [#36915](https://github.com/anthropics/claude-code/issues/36915) ConPTY leak | Subprocess получает fd 1 = direct file (no PTY chain) |
| [#50616](https://github.com/anthropics/claude-code/issues/50616) Windows hang | Если CLI hang'ает на capture — log file сохраняется до момента hang'а, можно диагностировать |

### Algorithm (bg-log.sh)

1. **Validate**: `[[ $# -lt 2 ]] && { echo "Usage: bg-log.sh <slug> <cmd> [args...]" >&2; exit 2; }`
2. **Sanitize slug**: `slug=$(echo "$1" | tr -cd 'A-Za-z0-9_-'); shift`
3. **Setup log**: `LOG_DIR=".dev-pomogator/.bg-logs"`; `mkdir -p "$LOG_DIR"`; `LOG_FILE="${LOG_DIR}/$(date +%s)-${slug}.log"`
4. **Announce path**: `echo "[bg-log] Log: $LOG_FILE"`
5. **Execute**: `"$@" > "$LOG_FILE" 2>&1` — exit code оригинальной команды becomes script exit code (нет pipe, нет pipefail need)

### Algorithm (rule update FR-8)

1. Сохранить existing секции v0.1.0: "Правильно" / "Неправильно" / "Anti-pattern: naked `| tail` в bg" / чеклист
2. После Anti-pattern добавить subsection `## Confirmed Anthropic bugs (post-incident 2026-05-10)` — таблица 4×3 (issue, status, why-it-applies)
3. Добавить subsection `## Preferred pattern: file redirect (Windows-safe)` с 3 examples (dotnet test, pytest, cargo test) + reference на `scripts/bg-log.sh`
4. Расширить чеклист пунктом `[ ] Не-docker bg → > file 2>&1 (БЕЗ pipe) ИЛИ scripts/bg-log.sh`

## Out of Scope propagation

### v0.1.0
- **FR-6** (feedback memory) — OUT OF SCOPE. User Story #4 также OUT OF SCOPE.
- Reproduction test H1 vs H2 vs H3 — OUT OF SCOPE (22-минутный run; defense-in-depth решение закрывает все три без подтверждения).
- Upstream Anthropic feature request (bg capture sentinel) — OUT OF SCOPE (filed separately).
- Log rotation policy (старше X дней) — OUT OF SCOPE (user manual cleanup; < 500KB typical size).

### v0.2.0
- **FR-9** (PreToolUse bg-pipe-guard hook) — OUT OF SCOPE (defer to follow-up spec). Reason: premature без baseline usage data + risk over-blocking legitimate piped commands.
- WSL fallback workflow documentation — OUT OF SCOPE (environment-level recommendation, не код этой спеки).
- Migration of existing `docker-test.sh` от `tee` pipe к direct redirect — OUT OF SCOPE (v0.1.0 паттерн уже работает для docker case; не ломаем).
- Log rotation для `.dev-pomogator/.bg-logs/` (cleanup старых runs) — OUT OF SCOPE для v0.2.0 (manual cleanup как в v0.1.0).

## Risks

N/A — не используется TEST_FORMAT=UNIT escape hatch. BDD framework установлен, никаких legacy constraints.
