# No Blocking on Tests

## Правило

Docker тесты занимают 7-12 минут. НИКОГДА не блокировать сессию ожиданием.

## Правильно

```
# Запустить в фоне
run_in_background: true

# Продолжать работу
# Когда notification придёт — обработать результат
```

## Неправильно

```
# Блокировка на 30 минут
TaskOutput block=true timeout=600000

# Убийство Docker тестов
TaskStop  # → zombie processes, broken pipes
```

## Anti-pattern: naked `| tail` в bg

Комбинация `<long-cmd> 2>&1 | tail -N` с `run_in_background: true` — **single point of failure**. При duration ≥ ~20 минут на Windows/Git-Bash capture file может оказаться 0 байт при `exit 0` (task завершилась успешно, но output потерян). См. incident `bd9aii2if` и [`.specs/fix-bg-output-loss/RESEARCH.md`](../../../.specs/fix-bg-output-loss/RESEARCH.md).

Три plausible hypotheses (все закрываются одним решением — persistent log на диске):

- **H1** — Claude harness capture handle дропается после продолжительного idle/volume
- **H2** — Git-Bash / Cygwin pipe buffer race в detached subshell при EOF
- **H3** — `docker compose -T` + block-vs-line buffering на long-output non-TTY

### Неправильно

```bash
# ❌ single point of failure — exit 0 + 0 bytes возможно
bash scripts/long-task.sh 2>&1 | tail -40   # (run_in_background: true)
```

### Правильно

```bash
# ✅ defense in depth — log файл переживает любой drop capture
bash scripts/long-task.sh 2>&1 | tee /tmp/full.log | tail -40

# или — отдельный redirect
bash scripts/long-task.sh &> /tmp/full.log; tail -40 /tmp/full.log
```

Для `scripts/docker-test.sh` persistent log уже встроен в сам скрипт (см. [docker-test.sh FR-1](../../../.specs/fix-bg-output-loss/FR.md)): каждый прогон пишется в `.dev-pomogator/.docker-status/test-run-<epoch>.log` через `tee -a` параллельно со stdout. Для других long-running bg команд — используй generic wrapper `scripts/bg-log.sh` (см. ниже) или ручной `> file 2>&1`.

## Confirmed Anthropic bugs (post-incident 2026-05-10)

Три plausible hypotheses из v0.1.0 оказались тремя разными **confirmed bugs** в `anthropics/claude-code`. Плюс четвёртый Windows-specific. Все закрыты как "not planned" / "duplicate" — официальный fix не ожидается, defense-in-depth на app-стороне обязателен.

| Hypothesis | GitHub Issue | Status | Что подтверждает |
|------------|--------------|--------|------------------|
| H1 (capture handle drop) | [#21915](https://github.com/anthropics/claude-code/issues/21915) — Bash tool produces no output on Windows | **closed: not planned** | `claude/[task-id].output` file создаётся но 0 bytes; "running" до timeout |
| H2 (Git-Bash pipe race) | [#16305](https://github.com/anthropics/claude-code/issues/16305) — Sandbox Bash loses pipe data when pipeline is last element | **closed: not planned** | `seq 2 \| cat` → 0 output. Workaround: trailing `;`, `(...)`, `bash -c "..."` |
| H3 (block buffering) | [#36915](https://github.com/anthropics/claude-code/issues/36915) — VSCode + Git Bash stdout не возвращается | closed as duplicate | ConPTY leaks PTY в bash subprocess; fd 1 → `/dev/pty0` который Claude не читает |
| (новое) Windows hang | [#50616](https://github.com/anthropics/claude-code/issues/50616) — CLI hangs since 2026-04-18 | **open** | CLI/extension hang forever на Windows v2.1.98+. Workaround: WSL Ubuntu |

Incident #2 (2026-05-10): `dotnet test --filter MBIL001` через `run_in_background: true` — 25 минут wait, 0 bytes capture, реальный процесс умер. Подтвердило что problem **шире** docker-test.sh — нужен generic wrapper.

## Preferred pattern: file redirect (Windows-safe для не-docker bg)

Универсальный workaround обходящий все 4 confirmed bugs одним приёмом — **прямой redirect без pipe**: `cmd > file 2>&1`. Нет pipe (обходит #16305), есть disk file (обходит #21915 capture race), нет PTY-piped subprocess (обходит #36915), file сохраняется до hang момента (минимизирует #50616).

### Правильно (preferred для не-docker bg)

```bash
# Universal pattern — обходит все 4 confirmed Claude Code Bash bugs
dotnet test --filter MBIL001 > .dev-pomogator/.bg-logs/dotnet-test.log 2>&1
pytest tests/ -v > .dev-pomogator/.bg-logs/pytest.log 2>&1
cargo test --release > .dev-pomogator/.bg-logs/cargo.log 2>&1
```

### Удобнее — через `scripts/bg-log.sh`

Convenience wrapper генерирует уникальный log path с timestamp + slug, делает `mkdir -p`, sanitизирует filename, echo'ит путь первой строкой stdout:

```bash
bash scripts/bg-log.sh dotnet-test dotnet test --filter MBIL001
bash scripts/bg-log.sh py-tests pytest tests/ -v
bash scripts/bg-log.sh cargo-tests cargo test --release
```

Output:
```
[bg-log] Log: .dev-pomogator/.bg-logs/1715000000-dotnet-test.log
```

AI читает этот путь, потом периодически делает Read tool на `.bg-logs/<file>.log` с `offset`/`limit` для tail-эффекта. Exit code оригинальной команды preserved.

### Когда какой паттерн использовать

| Сценарий | Паттерн |
|----------|---------|
| Docker тесты через `docker-test.sh` | Уже встроен `tee` в скрипт (v0.1.0) — ничего не добавлять |
| `dotnet test`, `pytest`, `cargo test` в bg | `scripts/bg-log.sh <slug> <cmd>` |
| Ручной long bg command без обёртки | `cmd > .dev-pomogator/.bg-logs/<slug>.log 2>&1` |
| Foreground (sync) команды | Никаких изменений — `tee` / redirect не нужны |

## Чеклист

- [ ] Тесты запущены с `run_in_background: true`
- [ ] НЕ использовал `TaskOutput block=true` для Docker тестов
- [ ] НЕ использовал `TaskStop` для Docker тестов
- [ ] Продолжал работу пока тесты бегут
- [ ] Bg команда с `| tail` использует `| tee <path> | tail -N` (не naked `| tail`)
- [ ] **Не-docker bg команды (`dotnet test`/`pytest`/`cargo test`/etc.) → `> file 2>&1` БЕЗ pipe, или `scripts/bg-log.sh` обёртка**
