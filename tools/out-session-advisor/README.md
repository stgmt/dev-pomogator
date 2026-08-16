# tools/out-session-advisor — «Аутсессионный адвизор + параллельная безопасность»

Реализация `.specs/out-session-advisor/` (FR-1..10). Клиентский аналог стокового Anthropic
Advisor: отдельная сессия наблюдает, проверяет и управляет ДРУГОЙ живой Claude Code сессией.

## Инструменты (CLI)

| Файл | FR | Что делает |
|------|----|------------|
| `tail_session.py` | FR-1 | Хвост главного jsonl + живых `subagents/agent-*.jsonl` (включая вложенный `subagents/workflows/<runId>/`, depth≤8, маркер `[subagent <id>]`, закрытые `[closed]`, дедуп). |
| `worker_driver.py` | FR-2 | **PRIMARY** драйвер воркера: `claude --input-format stream-json --output-format stream-json`, синхронизация по `type=result`; `--converse/--interactive/--run-json`. |
| `pty_daemon.py` | FR-2 | **FALLBACK** ConPTY: протокол `claude-ctl.json`/`claude-rsp.json` для handoff в живой TUI. |
| `strip_ansi.py` | FR-2 | Очистка ANSI/OSC из снапшотов PTY. |
| `verify_claims.ts` | FR-3 | Факт-проверка: `--claim file|chain|blocker` → CONFIRMED/GAP (файл/hash/size, 403-цепочка, run_external_blockers live|archived). |
| `consult.mjs` | FR-3 | Модель-консультация (модель-пара): `--session/--project-dir/--event-log/--point` → совет `ADVISOR_MODEL` (default gpt-5.6-sol) по транскрипту; fail-open. |
| `monitor.py` | FR-4 | Живость воркера: `idle | thinking-xhigh | dead`; «думает» ≠ «повис». |
| `lock.ts` | FR-7 | Атомарный лок `flag:'wx'` + владелец + stale-восстановление (аудит). |
| `git-guard.ts` | FR-6 | Гейт: `git add -A`/`.` → block; чужие staged (по транскриптам) → conflict. |
| `inventory.ts` | FR-8 | Инвентаризация сессий/процессов по репо (standalone). |
| `diag.ts` | FR-9/10 | «кто писал <файл>» (read-only) + сводка `ok/dirty/conflict`. |

## git-guard hook

Хук зарегистрирован как `PreToolUse` на Bash (`PreToolUse/7/0`) и блокирует `git add -A`, `git add .` и `--all`. Осознанный обход: маркер `[skip-git-guard: <причина>]` в тексте команды или env `GIT_GUARD_SKIP=1`; каждый обход пишется в audit `.dev-pomogator/git-guard-escapes.jsonl`. Режим fail-open: любая ошибка хука не блокирует команду.

## Протокол worker_driver (stream-json)

```
claude --input-format stream-json --output-format stream-json --verbose \
       [--resume <sid> --model <m> --dangerously-skip-permissions]
```
Отправка: одна строка JSON `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"…"}]}}`.
Синхронизация: дождись `type=result` перед следующим `send`. `system/init` даёт session_id.
**AskUserQuestion** не эмитится как пауза (нет в tools) — вопросы воркера приходят обычным
текстом в `result`, отвечай `send` (вариант A).

## Проверка

```bash
# live-проверки ядра (2026-08-15):
python tools/out-session-advisor/tail_session.py --session <sid> --project-dir <dir>
python tools/out-session-advisor/worker_driver.py --converse "Reply exactly: OK" --model ... --cwd <dir>
npx tsx tools/out-session-advisor/verify_claims.ts --claim chain --statuses 307,403,200
npx tsx tools/out-session-advisor/verify_claims.ts --claim blocker --sqlite <db> --run-id <r>
python tools/out-session-advisor/monitor.py --pid <p> --transcript <main.jsonl> --stale-after 600
npx tsx tools/out-session-advisor/lock.ts acquire|release|status|recover-stale <path>
npx tsx tools/out-session-advisor/git-guard.ts check --command "git add -A"
npx tsx tools/out-session-advisor/inventory.ts --repos a,b
npx tsx tools/out-session-advisor/diag.ts --who-wrote <path>
```
BDD: `scripts/docker-bdd.sh` (только Docker, не host). См. `.specs/out-session-advisor/`.

## Принципы

- **Один писатель в один файл** — адвизор никогда не пишет в JSONL воркера; single-writer.
- **Факты на диске > слова агента** — verify против БД/файлов/процессов.
- **Не вставать** — monitor различает `thinking-xhigh` (процесс жив) и `dead`.
- **Доменные истины** — промежуточный 403 ≠ блокер; бренд/артикул со страницы, не из slug.