# Non-Functional Requirements (NFR)

## Performance

- postInstall НЕ ДОЛЖЕН блокировать инсталлер больше чем на 120 секунд (npm install -g может быть медленным)
- Проверка наличия бинарей (`which`/`where`) должна занимать < 1 секунда на каждый сервер

## Security

- Установка npm пакетов только из npm registry (не arbitrary URLs)
- Установка dotnet tools только из NuGet
- Никаких `npx tweakcc --apply` без explicit user consent (tweakcc патчит Claude Code installation)
- Локальные плагины создаются в `.dev-pomogator/tools/` (внутри проекта, не в системных директориях)

## Reliability

- Partial installation: если 1 из 4 серверов не установился — остальные 3 работают
- Network failure: если npm недоступен — graceful error, не crash
- Idempotent: повторный запуск не ломает существующую установку
- Windows: документировать known issue #16084 (LSP plugins not recognized on Windows 11)

## Usability

- Отчёт после установки: таблица с status каждого сервера
- Warning для пропущенных серверов (missing runtime) с инструкцией как установить
- Rule файл: понятные инструкции для Claude Code агента
- Не требовать перезапуск Claude Code (или явно сообщить если нужен)
