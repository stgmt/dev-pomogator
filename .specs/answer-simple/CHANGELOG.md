# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added (post-implementation iterations)
- **FR-8 + Stop-hook (v1.1.0)** — runtime-принуждение простого языка. Добавлены `tools/answer-simple/jargon_detector.ts` (чистый детектор: regex по внутренним кодам + длина прозы, hard-OUT для code/таблиц/короткого) и `answer_simple_stop.ts` (Stop-hook: блокирует ответ-стену кодов через `{"decision":"block"}` с reason на простом русском, anti-loop через marker + `stop_hook_active`, fail-open). extension.json: +tools/toolFiles/hooks, version 1.0.0→1.1.0. **Разворачивает** исходное решение «no hooks» которое стояло на ложной посылке «Claude Code не имеет hook на финальный ответ» (Stop-hook его видит — проверено). Тесты PLUGIN017_06..09. См. DESIGN.md SUPERSEDED-пометки.
- **FR-6** (consistency reformulation ↔ findings) — добавлен после iter-3 evals выявили self-contradiction в eval-8 (skill расшифровал AJV inline но flag-нул как "без расшифровки").
- **FR-7** (internal codes vs general engineering vocabulary) — добавлен после iter-3 evals выявили over-flagging staging/prod/QPS/SRE/planned-downtime в eval-6.
- SKILL.md обновлён с 5 правилами (Правило 1 BYTE-FAITHFUL strict, Правило 2 question vs statement, Правило 3 empty invocation, Правило 4 consistency, Правило 5 vocab discrimination).
- evals/ директория в `.claude/skills/answer-simple/evals/evals.json` с 9 test prompts (5 базовых + 1 empty invocation + 3 edge cases: long draft / mixed RU+EN / code block).
- 4 итерации evals в `.claude/skills/answer-simple-workspace/iteration-1..4/` с benchmark.json + grading.json + HTML viewer per iteration.

### Changed (post-implementation iterations)
- Iter-1 → iter-2: убраны hallucinations в reformulation (skill больше не выдумывает "STOP #3", "polymorphic FR", "матрицу вариантов" если этого нет в источнике).
- Iter-2 → iter-3: edge cases (long draft / mixed lang / code block) handled без false-positives — service names, code identifiers внутри code block, file paths не flag-ятся.
- Iter-3 → iter-4: убран over-flagging staging/prod/QPS/SRE (Правило 5), preserved proper nouns (tenant не → клиенты, src/config/loader.ts byte-as-is), убран verb form shift (добавить не → добавлю), убрана AJV self-contradiction (Правило 4). Pass rate под более строгие assertions: 95.2% (1 remaining minor over-flag: "JSON schema validation").

### Added (initial spec)
- Spec оформлен (Phase 1 Discovery + Phase 2 Requirements + Phase 3 Finalization) с 3 user stories, изначально 5 FR (теперь 7), 5 AC (теперь 7), 4 NFR, 5 CHK в traceability matrix, BDD .feature с 5 scenarios PLUGIN017_01..05.
- DESIGN.md с 3 Key Decisions (declarative extension без TS tools, rule migration без duplication, no hooks needed) + BDD Test Infrastructure classification TEST_DATA_ACTIVE.
- REVIEW_NOTES.md документирует pre-STOP #1 spec-review с 1 P0 finding (hardcoded `stgmt/dev-pomogator` literal) которое автопатчем заменено на runtime-derived `<owner>/dev-pomogator` placeholder.

### Changed
- Pending implementation — изменения извне спеки (migration существующего rule, CLAUDE.md update, memory cross-reference) запланированы в Phase 2/3 TASKS.

### Fixed
- Pending — фиксов нет, это новая фича.

## [0.1.0] - TBD

### Added
- Initial implementation (после Phase 3 STOP #3): extension structure, skill SKILL.md, atomic rule migration с CLAUDE.md и memory updates, integration tests.
