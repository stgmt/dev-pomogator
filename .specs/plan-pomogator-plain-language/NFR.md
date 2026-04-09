# Non-Functional Requirements (NFR)

## Performance

- Валидация наличия `## 💬 Простыми словами` секции через `validateSections` (REQUIRED_SECTIONS итерация) добавляет <5мс к существующему validatePlanPhased вызову на плане до 500 строк (одна дополнительная regex search).
- Валидация non-empty content через `validateHumanSummarySection` добавляет <10мс (slice + filter пустых строк).
- Общий impact на ExitPlanMode latency <20мс — незаметен пользователю.

## Security

- N/A — никаких сетевых вызовов, никаких чтений вне рабочего директория, никакого parsing transcript-файлов или other Claude Code internal state.
- Новая функция `validateHumanSummarySection` оперирует только in-memory строками плана-файла. Никаких file system operations кроме существующих в `validate-plan.ts`.

## Reliability

- Phase 1 error при отсутствии секции — fail-fast поведение допустимо так как breaking change осознанно принят (см. RESEARCH.md D-6).
- Существующее fail-open поведение `plan-gate.ts` (error в hook → allow) сохраняется — если новая функция `validateHumanSummarySection` падает с unexpected exception, plan-gate exitов с 0 (allow) вместо блокировки.
- Регрессия: добавление новой записи в REQUIRED_SECTIONS массив НЕ ломает существующую `validateSections` логику благодаря относительному order check `if (index < lastIndex)` (validate-plan.ts:85). Все существующие e2e тесты продолжают проходить после обновления fixture (FR-4).
- Atomic обновление файлов реализации — каждый файл (template.md, validate-plan.ts, fixture, rule, requirements.md, extension.json) обновляется отдельно через Edit tool (атомарная операция в git working tree).

## Usability

- Phase 1 error message содержит actionable hint с готовым шаблоном секции для копипасты: "Добавь первой секцией: `## 💬 Простыми словами` с тремя подсекциями: `### Сейчас (как работает)`, `### Как должно быть (как я понял)`, `### Правильно понял?`".
- Правило plan-pomogator.md содержит примеры хорошего вывода в чат (casual-стиль, простые слова, без технического жаргона) и плохого (формальные FR, юридический жаргон) — для guidance AI агенту.
- Существующее `plan-gate.ts` deny output автоматически embedит обновлённый template.md — пользователь видит правильный шаблон в любом deny message.
- BREAKING change для существующих планов сопровождается major version bump 2.0.0 + явная BREAKING CHANGE запись в commit message + README extension.
