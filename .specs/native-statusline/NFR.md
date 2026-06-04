# Non-Functional Requirements (NFR)

## Performance

- SessionStart-хук SHALL завершаться быстро (< 200ms на тёплом старте); при `noop` — без записи на диск (нет I/O кроме одного read settings.json).
- Reconciler — чистая функция O(1), без сетевых/FS вызовов.

## Security

- Хук пишет ТОЛЬКО поле `statusLine` в `~/.claude/settings.json`; прочие поля сохраняются read-modify-write, секреты не логируются.
- Записываемая команда — фиксированный литерал `npx -y ccstatusline@latest` (не из пользовательского ввода) → нет инъекции.

## Reliability

- Fail-open: любая ошибка (битый JSON, отказ FS, отсутствие HOME) → `exit 0`, сессия не блокируется (NFR-R1).
- Atomic write (temp + rename) предотвращает повреждение settings.json при сбое/конкуренции (`atomic-config-save`).
- Идемпотентность: повторный запуск не меняет файл.

## Usability

- При первой установке — однократный `systemMessage`, объясняющий что строка появится со следующей сессии.
- Выключатель `DEV_POMOGATOR_STATUSLINE=off` документирован в `.env.example`.
- `/pomogator-doctor` даёт видимую ручку для немедленного применения.
