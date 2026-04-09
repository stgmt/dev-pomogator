# Аудит спецификации: plan-pomogator-prompt-isolation

Дата: 2026-04-09T13:00:00Z

## Сводка

| # | Категория | Авто | AI | Итого | Макс. критичность |
|---|-----------|------|----|-------|-------------------|
| 1 | ОШИБКИ (Errors) | 0 | 0 | 0 | none |
| 2 | ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps) | 0 | 0 | 0 | none |
| 3 | НЕКОНСИСТЕНТНОСТЬ (Inconsistency) | 0 | 0 | 0 | none |
| 4 | РУДИМЕНТЫ (Rudiments) | 0 | 0 | 0 | none |
| 5 | ФАНТАЗИИ (Fantasies) | 3 | 0 | 3 | INFO (false positives) |
| | **ИТОГО** | **3** | **0** | **3** | INFO (false positives) |

---

## Категория 1: ОШИБКИ (Errors)

0 findings. Все упомянутые в DESIGN.md компоненты (`prompt-capture.ts main()`, `plan-gate.ts loadUserPrompts/formatPromptsFromFile`, `prompt-store.ts`) реально существуют в кодовой базе по указанным путям. Все строки FR-1..FR-5 ссылаются на реальные line numbers в production коде.

---

## Категория 2: ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps)

0 findings (после фикс-итерации).

### Исправлено в ходе аудита

| # | Was | Fix |
|---|-----|-----|
| 1 | @feature6 в FR-6 без BDD сценария | Удалён @feature6 тег с FR-6 + AC-6, добавлено пояснение что FR-6 это meta-FR (process requirement, валидируется через `validate-spec.ts`, не runtime поведение) |
| 2 | @feature7 в FR-7 без BDD сценария | Удалён @feature7 тег с FR-7 + AC-7, добавлено пояснение что FR-7 это meta-FR (test coverage requirement, сами тесты И есть BDD сценарии) |
| 3 | @feature43 в AC-7 prose без сценария | Убран явный @feature43 тег из текста AC-7, заменён на описание "5 BDD сценариев в глобальном PLUGIN007_plan-pomogator.feature" |
| 4 | FR-6 не упомянут в TASKS.md | Добавлен пункт "Запустить validate-spec.ts → 0 ERROR" в Phase 3 с `_Requirements: [FR-6]_` ссылкой |
| 5 | @feature2 не упомянут в USER_STORIES.md | Добавлены теги @feature2 @feature5 к US-2 (parallel sessions story) с расширенным описанием изоляции на write-side и read-side |
| 6 | @feature5 не упомянут в USER_STORIES.md | Покрыт тем же фиксом #5 |

---

## Категория 3: НЕКОНСИСТЕНТНОСТЬ (Inconsistency)

0 findings. Терминология консистентна между всеми файлами:
- `session_id` (snake_case) используется единообразно во всех ссылках на hook input field
- `sessionId` (camelCase) используется единообразно для TypeScript variable
- `<task-notification>` тег упомянут везде с одинаковым форматом
- Имена функций (`prompt-capture.ts main()`, `plan-gate.ts loadUserPrompts`, `formatPromptsFromFile`) не имеют alternate spellings

---

## Категория 4: РУДИМЕНТЫ (Rudiments)

0 findings. RESEARCH.md имеет 3 закрытых open questions (помечены `- [x]` с резолюциями), нет client-side требований в серверной спеке (фича только серверная — hooks), нет устаревших TODO. Все Project Context & Constraints links указывают на актуальные правила.

---

## Категория 5: ФАНТАЗИИ (Fantasies)

3 findings, все INFO-уровень, все **false positives** от audit-spec.ts регекса который ищет UPPERCASE_LIKE_ENV_VARS:

| # | Критичность | Файл | Проблема | Решение |
|---|-------------|------|----------|---------|
| 1 | INFO | DESIGN.md | "Env var 'PLUGIN007_43' has no verification source" | False positive — `PLUGIN007_43` это test domain code (PLUGIN007 + scenario number), не env var. Используется в `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` для нумерации сценариев согласно `extension-test-quality.md`. Не требует `[VERIFIED:]` маркера |
| 2 | INFO | DESIGN.md | "Env var 'MAX_PROMPT_DISPLAY' has no verification source" | False positive — `MAX_PROMPT_DISPLAY` это TypeScript constant в `plan-gate.ts:57` (`const MAX_PROMPT_DISPLAY = 5`), не env var. Verified через grep `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:57` |
| 3 | INFO | DESIGN.md | "Env var 'PLUGIN007_43_05' has no verification source" | False positive — `PLUGIN007_43_05` это test ID format (DOMAIN_NN_MM как в `extension-test-quality.md` naming convention), не env var. Используется для именования it-блоков в `tests/e2e/plan-validator.test.ts` |

**Не требуют исправления** — false positives audit регекса. RESEARCH.md содержит секцию "Open Questions" со всеми резолюциями (3/3 закрыты), `BDD Test Infrastructure` в DESIGN.md имеет полную evidence через 4 вопроса классификации.

---

## Рекомендации

Приоритизированный список исправлений (после фикс-итерации):

1. **Высокая критичность:** none — все ERRORS = 0
2. **Средняя критичность:** none — все LOGIC_GAPS resolved в фикс-итерации
3. **Низкая критичность:** 3 INFO false positives FANTASIES — задокументированы в этом отчёте, не требуют исправления

## Validation Status

```
$ validate-spec.ts: files_with_errors=0, files_with_warnings=7 (CROSS_REF_LINKS + PLACEHOLDER false positives)
$ audit-spec.ts: ERRORS=0, LOGIC_GAPS=0, INCONSISTENCY=0, RUDIMENTS=0, FANTASIES=3 (all INFO false positives)
```

**Verdict:** Спека готова для имплементации. AC-6 (FR-6) выполнен — `validate-spec.ts` exit 0 без ERROR-уровень замечаний.
