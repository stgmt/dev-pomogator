# Non-Functional Requirements (NFR)

## Performance

- **NFR-Perf-1**: PreToolUse hook (`phase-gate.ts`) ДОЛЖЕН завершать обработку за < 100ms, включая чтение `.progress.json` и вывод решения. Задержка hook напрямую блокирует каждый вызов Write/Edit в Claude Code.
- **NFR-Perf-2**: UserPromptSubmit hook (инжекция статуса фазы) ДОЛЖЕН добавлять не более 50ms к текущему времени обработки `validate-specs.ts`.
- **NFR-Perf-3**: Новые audit checks в `audit-spec.ps1` ДОЛЖНЫ добавлять не более 500ms к общему времени аудита (при спеке из 13 файлов суммарным объёмом до 100KB).

## Security

- N/A. Hook работает локально, читает только `.progress.json` из `.specs/` директории проекта. Валидация путей уже обеспечивается правилом `no-unvalidated-manifest-paths`.

## Reliability

- **NFR-Rel-1**: PreToolUse hook ДОЛЖЕН работать в режиме **fail-open**: любая ошибка (отсутствие файла, невалидный JSON, ошибка FS, неизвестное имя файла) приводит к exit code 0 (разрешение операции). Hook НЕ ДОЛЖЕН блокировать работу Claude при сбоях.
- **NFR-Rel-2**: Ошибки ДОЛЖНЫ записываться в stderr для диагностики, но НЕ ДОЛЖНЫ выводиться в stdout (stdout зарезервирован для JSON-ответа Claude Code).
- **NFR-Rel-3**: UserPromptSubmit hook ДОЛЖЕН продолжать работу при ошибке чтения `.progress.json` — выводить предупреждение вместо статуса фазы.
- **NFR-Rel-4**: Audit checks ДОЛЖНЫ продолжать выполнение остальных проверок при ошибке в одной из новых проверок, записывая ошибку как WARNING.

## Usability

- **NFR-Usab-1**: Сообщение deny от PreToolUse hook ДОЛЖНО содержать:
  1. Номер текущей СТОП-точки (STOP #N)
  2. Название текущей фазы (Discovery / Context / Requirements / Finalization)
  3. Имя заблокированного файла
  4. Команду для подтверждения СТОП-точки: `spec-status.ps1 -Path ".specs/<feature>" -ConfirmStop <Phase>`
- **NFR-Usab-2**: Инжекция статуса фазы (UserPromptSubmit) ДОЛЖНА содержать:
  1. Текущую фазу
  2. Список файлов, разрешённых для записи (текущая + все подтверждённые фазы)
  3. Список заблокированных файлов с указанием, какой STOP нужно подтвердить
- **NFR-Usab-3**: Сообщения deny и статуса ДОЛЖНЫ быть на русском языке (основной язык спек-workflow) с ключевыми терминами (STOP, deny, phase) на английском для однозначности парсинга.
