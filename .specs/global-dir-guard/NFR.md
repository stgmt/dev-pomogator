# Non-Functional Requirements (NFR)

## Performance

- Recovery SHALL завершаться за < 5 секунд (копирование 3 файлов + npm install tsx skip если уже есть)
- Детекция (file exists check) SHALL добавлять < 100ms к SessionStart

## Security

- Маркер-файл не содержит секретов (только timestamp + source string)
- Recovery не выполняет `npm install` если `~/.dev-pomogator/node_modules/` отсутствует — только копирование скриптов

## Reliability

- Recovery SHALL быть идемпотентным — повторный запуск не ломает уже восстановленные файлы
- При невозможности записи (EPERM) — логировать ошибку, не крашить hook

## Usability

- При recovery пользователь видит в stdout: что было обнаружено и что восстановлено
- При легитимном uninstall + последующей сессии: тихий skip, не пугать пользователя
