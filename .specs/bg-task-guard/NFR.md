# Non-Functional Requirements (NFR)

## Performance

- Hook scripts SHALL выполняться за < 100ms (single stat() + file read).

## Security

- N/A

## Reliability

- Fail-open: при любой ошибке hook SHALL NOT блокировать Claude (exit 0).
- Marker файл SHALL быть в `.dev-pomogator/` (gitignored, не коммитится).

## Usability

- N/A — hooks прозрачны для пользователя.
