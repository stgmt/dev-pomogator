# Spec Generator V3

Спека v3 upgrade dev-pomogator specs-workflow с импортом 7 артефактов из github.com/github/spec-kit (71k⭐) + wiki custom preset. Hallucination-proof через блокирующие PreToolUse hooks + meta-guard + audit log. Existing 30+ specs не трогаются (migration guard via `.progress.version`).

## Ключевые идеи

- **3 приватных child skills** (`discovery-forms`, `requirements-chk-matrix`, `task-board-forms`) — anti-pushy description, вызываются только из parent `create-spec` через `Skill(...)`.
- **6 блокирующих PreToolUse hooks** (exit 2 на violation): USER_STORIES form, TASKS Done When/Status/Est, DESIGN Alternatives, REQUIREMENTS CHK format, RESEARCH Risk Assessment, extension.json meta-guard.
- **No env var bypass.** `SPEC_FORM_GUARDS_DISABLE` не существует. Агент не может выключить защиту.
- **Meta-guard protects manifest.** Попытка удалить form-guard из extension.json/settings.local.json → DENY.
- **Audit log + UserPromptSubmit summary.** Каждый event в `~/.dev-pomogator/logs/form-guards.log`; summary за 24h в начале каждого prompt.
- **Migration guard.** Form-guards активны только при `.progress.json.version >= 3`. Existing v1/v2 specs pass-through.
- **Dogfood.** Эта спека сама написана в v3 формате — proof-of-concept.

## Файлы

- [USER_STORIES.md](USER_STORIES.md) — 6 user stories в v3 form.
- [USE_CASES.md](USE_CASES.md) — UC-1..UC-6 + Edge Cases.
- [RESEARCH.md](RESEARCH.md) — context + Risk Assessment (9 rows).
- [FR.md](FR.md) — 16 functional requirements.
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability.
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — AC-1..AC-10 EARS.
- [REQUIREMENTS.md](REQUIREMENTS.md) — CHK matrix 18 rows + Verification Process + Summary Counts.
- [DESIGN.md](DESIGN.md) — компоненты + алгоритм + Key Decisions (4 blocks) + BDD Test Infrastructure.
- [TASKS.md](TASKS.md) — Task Summary Table + 7 phases.
- [FILE_CHANGES.md](FILE_CHANGES.md) — ~35 files (create/edit).
- [CHANGELOG.md](CHANGELOG.md) — feature log.
- [spec-generator-v3.feature](spec-generator-v3.feature) — 28 BDD scenarios SPECGEN003_01..28.
- [.progress.json](.progress.json) — `version: 3` (v3 schema).

## Статус

- **Phase 0** (BDD Foundation): ✅ complete
- **Phase 1** (shared parsers + audit logger + migration): ✅ complete
- **Phase 2** (6 PreToolUse form-guards): ✅ complete
- **Phase 3** (3 child skills): ✅ complete
- **Phase 4** (templates + task-table + UserPromptSubmit summary): ✅ complete
- **Phase 5** (manifest v1.17.0 + specs-management.md wiring): ✅ complete
- **Phase 6** (dogfood spec): 🔄 in progress
- **Phase 7** (regression + refactor): ⏳ pending

См. [TASKS.md](TASKS.md) для detailed task breakdown.
