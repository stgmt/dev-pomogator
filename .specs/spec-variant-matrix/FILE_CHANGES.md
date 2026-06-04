# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `tools/specs-generator/variant-matrix/trigger-phrases.ts` | create | [FR-1](FR.md#fr-1-polymorphic-trigger-detection-через-mechanical-regex), [FR-2](FR.md#fr-2-hard-out-signals-anti-over-application) |
| `tools/specs-generator/variant-matrix/parsers.ts` | create | [FR-3](FR.md#fr-3-ac-decision-table-обязательна-per-polymorphic-fr), [FR-4](FR.md#fr-4-gherkin-scenario-outline-в-feature-11-с-ac), [FR-5](FR.md#fr-5-tasksmd-per-variant) |
| `tools/specs-generator/variant-matrix/audit.ts` | create | [FR-6](FR.md#fr-6-audit-category-variantcoverage-8-я-категория) |
| `tools/specs-generator/variant-matrix/escape-log.ts` | create | [FR-7](FR.md#fr-7-escape-hatch-с-audit-log) |
| `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` | edit | [FR-6](FR.md#fr-6-audit-category-variantcoverage-8-я-категория) — wire VARIANT_COVERAGE category в commandAuditSpec ~line 1611 + categoryCount ~line 2676 |
| `extensions/specs-workflow/.claude/skills/variant-matrix-build/SKILL.md` | create | [FR-8](FR.md#fr-8-phase-2-sub-skill-variant-matrix-build) |
| `.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md` | create | [FR-2](FR.md#fr-2-hard-out-signals-anti-over-application) — trigger map с hard-OUT signals |
| `.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md` | create | [FR-7](FR.md#fr-7-escape-hatch-с-audit-log) — JSONL audit format |
| `.claude/skills/create-spec/references/phase2_requirements-and-design.md` | edit | [FR-8](FR.md#fr-8-phase-2-sub-skill-variant-matrix-build) — insert step 4c |
| `.claude/skills/create-spec/references/phase3plus_audit-overview.md` | edit | [FR-6](FR.md#fr-6-audit-category-variantcoverage-8-я-категория) — categories table 7→8 |
| `.claude/skills/create-spec/references/phase3plus_audit-variant-coverage.md` | create | [FR-6](FR.md#fr-6-audit-category-variantcoverage-8-я-категория) — resolution guide |
| `.claude/rules/plan-pomogator/cross-scope-coverage.md` | edit | [FR-3](FR.md#fr-3-ac-decision-table-обязательна-per-polymorphic-fr) — add Step 0 spec-time application |
| `extensions/specs-workflow/extension.json` | edit | Manifest bump 1.18.0 → 1.19.0; register new toolFiles + skillFiles + ruleFiles + skill |
| `CLAUDE.md` | edit | Add 2 rows to Always-apply rules table per claude-md-glossary rule |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-complete/FR.md` | create | Test fixture — happy path positive |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-complete/ACCEPTANCE_CRITERIA.md` | create | Test fixture — complete AC Decision Table |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-complete/DESIGN.md` | create | Test fixture — minimal valid DESIGN |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-complete/USE_CASES.md` | create | Test fixture — minimal valid USE_CASES |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-complete/USER_STORIES.md` | create | Test fixture — minimal valid USER_STORIES |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-complete/polymorphic-fr-complete.feature` | create | Test fixture — Examples block |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-no-matrix/FR.md` | create | Test fixture — negative case |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-no-matrix/ACCEPTANCE_CRITERIA.md` | create | Test fixture — AC без Decision Table |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-hard-out/FR.md` | create | Test fixture — H1 regression guard |
| `tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-ru-mixed/FR.md` | create | Test fixture — RU/EN cross-language |
| `tests/fixtures/specs-generator/variant-matrix/escape-hatch-short-reason/FR.md` | create | Test fixture — FR-7 edge case |
| `tests/e2e/specs-generator-variant-matrix.test.ts` | create | Integration tests (4 detection + 6 parsers + 5 audit + 6 e2e) |
