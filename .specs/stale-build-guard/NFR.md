# Non-Functional Requirements (NFR)

## Performance

- Hook < 500ms. Только `fs.statSync` и `fs.readdirSync` для mtime comparison. Без child process, без network calls.

## Security

- N/A — hook работает локально, не обрабатывает внешний input кроме stdin JSON от Claude Code harness.

## Reliability

- Fail-open: любая ошибка (parse error, stat error, missing files) → exit 0 (allow). Hook не должен блокировать работу при собственных сбоях.

## Usability

- Deny message содержит конкретную fix-команду для copy-paste. Разработчик видит что именно нужно сделать, не угадывает.
