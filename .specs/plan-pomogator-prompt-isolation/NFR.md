# Non-Functional Requirements (NFR)

## Performance

- **NFR-P1**: prompt-capture hook ОБЯЗАН добавлять <50ms latency к каждому UserPromptSubmit. Текущая реализация уже укладывается (atomic temp+rename JSON write одного объекта). Регекс-фильтр `/^<task-notification\b/i` имеет O(1) сложность на префиксе строки и не должен ухудшить производительность.
- **NFR-P2**: plan-gate `loadUserPrompts()` после удаления fallback-блока должен выполнять только 1 файловую операцию (`readPromptFile` для session-specific файла) вместо предыдущих 2-N (readdirSync + stat для каждого файла + readFileSync). Это улучшение производительности.

## Security

- **NFR-S1**: Никаких изменений в обработке user input. Все пути в `getPromptFilePath` уже sanitized через `sanitizeSessionId(sessionId)` (regex `/[^a-zA-Z0-9_-]/g` → `_`), исключая path traversal.
- **NFR-S2**: Файлы кэша пишутся атомарно через temp file + rename (`prompt-store.ts:48-54`) согласно правилу `atomic-config-save.md`. Эта инвариантность сохраняется без изменений.
- **NFR-S3**: Регекс `/^<task-notification\b/i` НЕ выполняет catastrophic backtracking (нет вложенных квантификаторов), безопасен для произвольного user input.

## Reliability

- **NFR-R1**: Fail-open принцип СОХРАНЁН — любая ошибка в `prompt-capture` или `plan-gate` ведёт к exit 0 (allow). Hook НЕ блокирует Claude Code из-за внутренних багов. Это закреплено в существующих try/catch блоках и `.catch((err) => { exit 0 })` wrapper.
- **NFR-R2**: При отсутствии `session_id` в hook input — graceful degradation: prompt-capture не пишет файл, plan-gate показывает пустую секцию, ExitPlanMode не блокируется по этой причине.
- **NFR-R3**: Defense-in-depth: даже если prompt-capture где-то сохранит task-notification (баг в будущем коде), `formatPromptsFromFile` отфильтрует на чтении.

## Usability

- **NFR-U1**: AI-агент при доработке плана видит ТОЛЬКО реальные текстовые промпты текущей сессии Claude Code в deny-сообщении plan-gate (это и есть UX-фикс — устранение дезинформирующего мусора).
- **NFR-U2**: Пустая секция «Последние сообщения пользователя» предпочтительнее показа чужих промптов из других задач/сессий — лучше отсутствие контекста чем неверный контекст.
- **NFR-U3**: Сообщение о deny-причине (Phase 2 ошибка) остаётся информативным даже при пустой секции промптов — agent видит точную ошибку валидации и template для исправления.
