# Functional Requirements (FR)

## FR-1: Polymorphic trigger detection через mechanical regex

Module `tools/specs-generator/variant-matrix/trigger-phrases.ts` экспортирует функцию `detectPolymorphicFRs(frContent)`. Detection mechanically (regex), no LLM в logic. Closed list polymorphism-axis nouns (14 items: doctype, type, kind, variant, provider, adapter, tenant, locale, channel, method, role, version, backend, driver). Threshold ≥2 hits OR 1 hit + axis enumeration signal elsewhere в FR.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path-polymorphic-fr-с-complete-matrix)

## FR-2: Hard-OUT signals (anti-over-application)

Если FR содержит "только/single/specific", или `> OUT OF SCOPE` blockquote, или axis уже enumerated within 30 lines, или это NFR.md — detection skip. Code blocks (фенсинг) стрипаются перед regex matching. Address H1 risk (single-incident over-generalization) per memory feedback_single-incident-rules-over-generalize.md.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-3](USE_CASES.md#uc-3-legitimate-single-variant-hard-out-skip)

## FR-3: AC Decision Table обязательна per polymorphic FR

Required columns: `# | Variant | Trigger condition | Expected param | Test ref (@featureN) | Coverage`. Coverage cell value: `covered | excluded | pending`. Excluded требует `[OUT_OF_SCOPE: <reason >=8 chars>]`. Audit парсит таблицу через regex и cross-references с .feature Examples.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)

## FR-4: Gherkin Scenario Outline в .feature 1:1 с AC

Каждая covered AC row → одна строка в Examples block. Excluded rows skipped. Audit category VARIANT_COVERAGE emit finding если row count mismatch (исключая OUT_OF_SCOPE rows).

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)

## FR-5: TASKS.md per-variant

Каждая pending AC row → отдельная задача с тегом `@featureN` + tracer line `_Variant: {axis}={value}_`. Это enforce-ит чтобы разработчик imp-ил call-site mapping для каждого варианта отдельно.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)

## FR-6: Audit category VARIANT_COVERAGE (8-я категория)

Phase 3+ Audit checks 4 conditions: (1) FR-trigger ↔ AC-table presence; (2) AC ↔ Examples 1:1 row count; (3) AC ↔ TASKS-or-OUT_OF_SCOPE; (4) escape-hatch reason length. Emit findings, blocks STOP #3 если matrix incomplete (severity ≥ WARNING). Implementation: `tools/specs-generator/variant-matrix/audit.ts` exports `checkVariantCoverage(specPath): AuditFinding[]`. Wired в `specs-generator-core.mjs` commandAuditSpec ~line 1611 + categoryCount ~line 2676.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3), [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4), [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-2](USE_CASES.md#uc-2-gap-detected-incomplete-matrix)

## FR-7: Escape hatch с audit log

`[skip-variant-matrix: reason]` в FR section body, reason >=8 chars enforced. Append JSONL entry в `.claude/logs/spec-variant-matrix-escapes.jsonl` (atomic O_APPEND). Schema: `{ts, spec, fr, reason, session_id, cwd}`. Reason `<8 chars` → audit downgrade severity к INFO finding `WARNING_REASON_TOO_SHORT`. Anti-gaming guidance в rule escape-hatch-audit.md.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-7)
**Use Case:** [UC-4](USE_CASES.md#uc-4-legitimate-escape-hatch-с-substantive-reason)

## FR-8: Phase 2 sub-skill variant-matrix-build

New skill at `extensions/specs-workflow/.claude/skills/variant-matrix-build/SKILL.md`. Frontmatter: `disable-model-invocation: true` (caller-only — invoked by create-spec Phase 2 step 4c). Detects polymorphic FRs via trigger-phrases.ts, generates AC Decision Table template, Gherkin Examples block, per-variant tasks placeholder. Returns JSON `{frs_with_matrix, ac_rows, examples_rows, tasks_emitted, escape_hatches, files_touched}`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3), [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path-polymorphic-fr-с-complete-matrix), [UC-5](USE_CASES.md#uc-5-ruen-mixed-fr-bilingual-detection)

## FR-9: PreToolUse form-guard на Write/Edit FR.md — OUT OF SCOPE

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#out-of-scope-fr-9-deferred-to-v020) (FR помечен OUT OF SCOPE, см. ссылку для контекста)

> OUT OF SCOPE — defer to v0.2.0
>
> v0.1.0 audit-only достаточно для prevention. Добавит form-guard variant-matrix-guard.ts если post-launch usage data покажет что audit-only ловит факапы слишком поздно. Связанные UC, AC и User Stories также должны быть помечены `> OUT OF SCOPE — см. FR-9`.
