# Use Cases

## UC-1: Happy path — polymorphic FR с complete matrix

AI пишет FR-3 "validate stock for all doctypes" в спеке. Detection module trigger-phrases.ts срабатывает (≥2 trigger phrases: "all" + "doctypes"), skill variant-matrix-build предлагает AC Decision Table template. AI заполняет 5 строк (4 covered + 1 OUT_OF_SCOPE), Scenario Outline + Examples в .feature, per-variant tasks в TASKS.md.

- Phase 2 step 4c: Skill detects polymorphic FR, suggests matrix template
- AI fills Decision Table с covered/excluded для каждой строки
- Phase 3+ Audit category VARIANT_COVERAGE: zero findings
- STOP #3 проходит → spec ready for Implementation

## UC-2: Gap detected — incomplete matrix

AI пишет polymorphic FR-3 но забыл строку в AC Decision Table для одного варианта. Phase 3+ Audit детектит mismatch.

- AI заполнил AC table 4 rows вместо 5 (один variant пропущен)
- Audit category VARIANT_COVERAGE emit finding `code: AC_DECISION_TABLE_MISSING` или `AC_EXAMPLES_ROW_MISMATCH`
- spec-status.ts -ConfirmStop Audit refuses advancement
- AI чинит — добавляет missing row → re-run audit → green

## UC-3: Legitimate single-variant — hard-OUT skip

FR-5 описывает функционал только для одного варианта: "validate format только для receiving". Hard-OUT signal "только" в close proximity к polymorphic-trigger phrase.

- Detection module видит phrase + hard-OUT signal в same paragraph
- Returns `{hardOut: true}` — detection skip
- Audit emit zero VARIANT_COVERAGE findings
- STOP #3 проходит без matrix (rule не over-applies)

## UC-4: Legitimate escape hatch с substantive reason

FR-7 polymorphic, но один variant tested через parametrized helper в общем test runner — separate matrix не нужна.

- AI добавляет в FR body: `[skip-variant-matrix: covered by parametrized test helper at tests/runner.ts]` (60 chars reason)
- Audit парсит escape hatch, reason ≥8 chars → severity downgrade
- Audit emit INFO finding `WARNING_REASON_OK` в AUDIT_REPORT.md (visible но не блокирует)
- JSONL log entry appended в `.claude/logs/spec-variant-matrix-escapes.jsonl`
- STOP #3 проходит

## UC-5: RU/EN mixed FR — bilingual detection

FR-2 содержит русский текст: "переиспользуем для каждого доктайпа shared validation pipeline". Detection regex matches RU patterns (`для каждого`, `доктайпа`) + EN patterns (`shared validation pipeline`).

- Detection threshold-2 met с mixed language signals
- Skill suggests matrix template
- AI заполняет AC + Examples + tasks
- Same flow как UC-1 — language agnostic
