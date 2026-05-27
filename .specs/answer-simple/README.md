# Answer Simple

Extension dev-pomogator который заставляет агента молча проверять "поймёт ли пользователь" перед отправкой каждого содержательного ответа (через 5-шаговый шаблон самопроверки и формат ответа-микроистории), плюс slash-команда `/answer-simple <черновик>` для ручного аудита текстов на жаргон, внутренние коды и multi-select.

## Ключевые идеи

- **Always-apply rule** прогоняет агента через 5 шагов (что я понял → черновик → самооценка → шаблон микроистории → переписать если плохо) ДО отправки ответа, чтобы пользователь не получал жаргонные multi-select вопросы и обрывочные "сделал X. готово" ответы.
- **Slash-команда `/answer-simple <черновик>`** даёт явный аудит: skill возвращает переформулированную микроисторию + список конкретных проблем (внутренние коды без расшифровки, multi-select >3 опций, жаргон, отсутствие причинно-следственных связок).
- **Чисто declarative** — никакого TypeScript кода, только markdown rule + markdown skill + JSON manifest. Аналог `extensions/auto-simplify/`, но с slash-командой.

## Где лежит реализация

- **App-код**: нет TS кода (declarative extension).
- **Rule**: `.claude/rules/answer-simple/clear-questions-to-user.md` (мигрирует из `.claude/rules/clear-questions-to-user.md` как часть implementation)
- **Skill**: `.claude/skills/answer-simple/SKILL.md`
- **Manifest**: `extensions/answer-simple/extension.json`
- **Wiring**: CLAUDE.md глоссарий-таблица (always-apply rules секция) обновляется на новый rule path
- **Tests**: `tests/e2e/answer-simple.test.ts` (vitest e2e, 5 it'ов mapping 1:1 с .feature scenarios PLUGIN017_01..05)

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 3 user stories (P1/P2/P3) с Acceptance Scenarios
- [USE_CASES.md](USE_CASES.md) — 4 UC покрывающие silent prevention, explicit invocation, incident trigger, installer
- [REQUIREMENTS.md](REQUIREMENTS.md) — Traceability matrix FR ↔ AC ↔ @featureN + CHK Verification matrix
- [FR.md](FR.md) — 5 функциональных требований
- [NFR.md](NFR.md) — Performance / Security / Reliability / Usability
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 5 AC в EARS формате
- [DESIGN.md](DESIGN.md) — компоненты, алгоритм, Key Decisions (3), BDD Test Infrastructure classification
- [TASKS.md](TASKS.md) — TDD план: Phase 1 extension skeleton → Phase 2 atomic rule migration → Phase 3 integration tests
- [answer-simple.feature](answer-simple.feature) — 5 BDD сценариев (PLUGIN017_01..05)
- [REVIEW_NOTES.md](REVIEW_NOTES.md) — pre-STOP #1 spec-review findings (1 P0 auto-fixed: hardcoded literal)
