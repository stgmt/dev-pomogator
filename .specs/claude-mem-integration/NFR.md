# Non-Functional Requirements (NFR)

## Performance

- Post-install validation (worker + chroma health check) SHALL complete в < 10 секунд
- SessionStart health-check hook SHALL complete в < 15 секунд (existing timeout: 120s)
- Re-install skip (already running) SHALL complete в < 2 секунд

## Security

- N/A — все операции локальные (localhost ports, local files)

## Reliability

- Fail-open: если validation timeout → log warning, не блокировать установку
- Graceful degradation: chroma down → worker works, semantic search unavailable
- Atomic writes: install report через temp+move (existing pattern)

## Usability

- User-facing error: 1 строка причины + путь к install.log (уже реализовано)
- Install report: per-component table (worker | chroma | mcp | hooks | status)
- Health check hook: silent on success, stderr warning on failure (не блокирует SessionStart)
