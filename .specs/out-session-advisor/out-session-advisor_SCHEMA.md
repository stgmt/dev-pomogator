# Session Advisor / Parallel Session Safety Schema

## Pipeline

```
[адвизор] → tail_session (main jsonl + живые subagents)  →  [диагноз] verify_claims
          → "кто писал <path>" (FR-9, read-only)           →  [промпт] pty_daemon ctl/rsp
          → [коммит/лок] git-guard + parallel-lock          →  [сводка] parallel-session-diag
```

## Контракт транскрипта (вход, JSONL)

Значимые типы строк: `user`, `assistant`, `attachment`, `step-start`, `step-finish`. Парсер читает
`message.content[]` (`text`, `tool_use`, `tool_result`). Субагентные файлы — `subagents/agent-*.jsonl`.

```json
{ "type": "assistant", "message": { "content": [ { "type": "text", "text": "..." } ] } }
```

## ctl/rsp протокол ConPTY

```json
// claude-ctl.json (вход daemon)
{ "action": "send|read|exit", "prompt": "<utf8>", "wait": 2 }
```

```json
// claude-rsp.json (выход daemon)
{ "out": "<ansi snapshot, до 12000 chars>", "pid": 4242, "sent": true }
```

## Событийный лог worker_driver (JSONL, `--event-log`)

Одна строка = одно событие (нормализовано из stream-json stdout, формат в стиле csd events.ts):

```json
{"event": "send", "ts": "2026-08-16T02:52:59.000Z", "prompt": "..."}
{"event": "session_start", "ts": "...", "sid": "672f2a45-..."}
{"event": "thinking_tokens", "ts": "...", "estimated_tokens": 7}
{"event": "tool_use", "ts": "...", "tool": "Read", "tool_input": {"file_path": "AGENTS.md"}}
{"event": "tool_result", "ts": "...", "is_error": false}
{"event": "assistant_text", "ts": "...", "text": "OK"}
{"event": "result", "ts": "...", "sid": "...", "is_error": false, "text": "OK", "cost_usd": 0.21267}
```

- `event` ∈ {send, session_start, thinking_tokens, tool_use, tool_result, assistant_text, result}.
- tail_session `--event-log <path>` объединяет эти строки с файловым транскриптом (маркер `[live]`).

## verify_claims вердикт

```json
{
  "status": "CONFIRMED | GAP",
  "evidence": ["path/to/file:line", "run_external_blockers source=live"],
  "reason": "файл существует, hash совпал; ..."
}
```

## Lock-файл `.dev-pomogator/parallel-locks/<hash>.lock`

```json
{
  "owner_pid": 4242,
  "owner_cmd": "node tools/out-session-advisor/pty_daemon.py ...",
  "path": "src/product_identity.py",
  "created": "2026-08-14T05:00:00.000Z"
}
```

## Инвентаризация (вход для diag)

```json
{ "rows": [ { "repo": "d:\\repos\\sales", "pid": 8580, "session": "6126f730-...", "ts": "..." } ] }
```

## Git-гейт вердикт

```json
{
  "command": "git add -A",
  "decision": "warn | block | ok",
  "conflicts": ["d:\\repos\\sales\\src\\foo.py"],
  "override": "required|applied"
}
```

## Правила валидации

- Главный и субагентные файлы читаются по offset (НЕ ждём EOF); закрытые помечаются отдельно.
- Строка JSONL, что не парсится, — пропускается (fail-open), не роняя снапшот.
- Адвизор не пишет в файлы воркера (single-writer); `send` через ctl не содержит секретов.
- Lock создаётся через `writeFile(lock, owner, {flag:'wx'})` (О_EXCL). Второй acquire → EEXIST.
- stale = `owner_pid` не жив (по process-tree). recover_stale: удалить + пересоздать атомарно + audit.
- `git add -A`/`.` → `warn`/`block`; `--override` логируется в escape-audit.
- Инвентаризация not-found-дерева → строка `unknown`, не падение.