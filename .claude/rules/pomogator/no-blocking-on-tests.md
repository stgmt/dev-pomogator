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

Для `scripts/docker-test.sh` persistent log уже встроен в сам скрипт (см. [docker-test.sh FR-1](../../../.specs/fix-bg-output-loss/FR.md)): каждый прогон пишется в `.dev-pomogator/.docker-status/test-run-<epoch>.log` через `tee -a` параллельно со stdout. Для других long-running bg команд — добавь `tee` вручную.

## Чеклист

- [ ] Тесты запущены с `run_in_background: true`
- [ ] НЕ использовал `TaskOutput block=true` для Docker тестов
- [ ] НЕ использовал `TaskStop` для Docker тестов
- [ ] Продолжал работу пока тесты бегут
- [ ] Bg команда с `| tail` использует `| tee <path> | tail -N` (не naked `| tail`)
