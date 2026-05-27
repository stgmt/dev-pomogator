# Design

## Реализуемые требования

- [FR-1: Polymorphic trigger detection](FR.md#fr-1-polymorphic-trigger-detection-через-mechanical-regex)
- [FR-2: Hard-OUT signals](FR.md#fr-2-hard-out-signals-anti-over-application)
- [FR-3: AC Decision Table](FR.md#fr-3-ac-decision-table-обязательна-per-polymorphic-fr)
- [FR-4: Gherkin Scenario Outline](FR.md#fr-4-gherkin-scenario-outline-в-feature-11-с-ac)
- [FR-5: TASKS.md per-variant](FR.md#fr-5-tasksmd-per-variant)
- [FR-6: Audit category VARIANT_COVERAGE](FR.md#fr-6-audit-category-variant_coverage-8-я-категория)
- [FR-7: Escape hatch с audit log](FR.md#fr-7-escape-hatch-с-audit-log)
- [FR-8: Phase 2 sub-skill variant-matrix-build](FR.md#fr-8-phase-2-sub-skill-variant-matrix-build)

## Компоненты

- `trigger-phrases.ts` — pure regex detection module (single source of truth для trigger patterns)
- `parsers.ts` — pure markdown/gherkin parsers (parseDecisionTable, parseExamplesTable, parseVariantTasks)
- `audit.ts` — checkVariantCoverage library function, calls trigger-phrases + parsers
- `escape-log.ts` — atomic JSONL append helper для escape hatch audit log
- `variant-matrix-build` skill (Phase 2 sub-skill) — proactively suggests matrix template
- `when-to-build-matrix.md` rule — trigger map с Apply WHEN + Hard-OUT signals
- `escape-hatch-audit.md` rule — JSONL format + anti-gaming guidance
- `phase3plus_audit-variant-coverage.md` reference — resolution guide для AI агента

## Где лежит реализация

- App-код tools: `tools/specs-generator/variant-matrix/`
- Skill: `extensions/specs-workflow/.claude/skills/variant-matrix-build/`
- Rules: `.claude/rules/specs-workflow/variant-matrix/`
- Audit reference: `.claude/skills/create-spec/references/phase3plus_audit-variant-coverage.md`
- Wiring: `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` (commandAuditSpec ~line 1611, categoryCount ~line 2676)
- Manifest: `extensions/specs-workflow/extension.json` (version 1.18.0 → 1.19.0)

## Директории и файлы

- `tools/specs-generator/variant-matrix/trigger-phrases.ts`
- `tools/specs-generator/variant-matrix/parsers.ts`
- `tools/specs-generator/variant-matrix/audit.ts`
- `tools/specs-generator/variant-matrix/escape-log.ts`
- `extensions/specs-workflow/.claude/skills/variant-matrix-build/SKILL.md`
- `.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md`
- `.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md`
- `.claude/skills/create-spec/references/phase3plus_audit-variant-coverage.md`

## Алгоритм

1. Phase 2 step 4b в create-spec workflow (existing) вызывает Skill("requirements-chk-matrix") — заполняет CHK matrix.
2. Phase 2 step 4c (NEW) вызывает Skill("variant-matrix-build") — детектит polymorphic FRs через trigger-phrases.ts.
3. Если detection возвращает >=1 polymorphic FR — skill заполняет AC Decision Table в ACCEPTANCE_CRITERIA.md, Scenario Outline + Examples в .feature, per-variant tasks в TASKS.md.
4. Phase 3+ Audit (existing) вызывает audit-spec.ts → categoryDispatch → audit.ts checkVariantCoverage().
5. checkVariantCoverage: для каждого polymorphic FR проверяет 4 conditions (FR↔AC, AC↔Examples 1:1, AC↔TASKS-or-OUT_OF_SCOPE, escape-reason length).
6. Findings emit-нуты с category VARIANT_COVERAGE; severity >= WARNING blocks spec-status.ts -ConfirmStop Audit.
7. Escape hatch `[skip-variant-matrix: reason]` ловится audit module и appends JSONL line через escape-log.ts.

## API

### detectPolymorphicFRs

- Module: trigger-phrases.ts
- Input: FR.md content string
- Output: `Array<{frId: string, lineNumber: number, triggers: Array<{phrase: string, line: number}>, axis?: string, hardOut: boolean}>`
- Behavior: scan для polymorphic phrases EN+RU, apply hard-OUT signals, return per-FR result objects.

### checkVariantCoverage

- Module: audit.ts
- Input: absolute path к .specs/{slug}/ directory
- Output: `Array<AuditFinding>` где finding = `{category, code, severity, message, frId, line?, file?}`
- Behavior: load FR/AC/.feature/TASKS, run detection + parsers, validate 4 conditions, return findings list.

### appendEscapeLog

- Module: escape-log.ts
- Input: cwd from hook context + entry object `{ts, spec, fr, reason, session_id}`
- Output: Promise<void>
- Behavior: atomic O_APPEND to `.claude/logs/spec-variant-matrix-escapes.jsonl`, ensures parent dir exists.

## Key Decisions

### Decision: Extend specs-workflow extension вместо нового extension

**Rationale:** User explicitly выбрал этот вариант через AskUserQuestion. Audit-категория живёт там же где dispatcher (specs-generator-core.mjs) → нет cross-extension import drift. Trigger-phrase regex set — single source of truth (skill + audit все импортируют один модуль). Единая версия (specs-workflow 1.18.0 → 1.19.0).

**Trade-off:** specs-workflow становится тяжелее (18 → 22 toolFiles). Менее модульно — uninstall variant-matrix невозможен без uninstall всего specs-workflow.

**Alternatives considered:**
- Новый отдельный extension spec-variant-matrix mirror scope-gate — rejected because cross-extension dispatch вводит regex drift risk + двойная manifest accounting; user explicitly выбрал extend specs-workflow.
- Hybrid (rule + audit без skill) — rejected because audit-only без proactive Phase 2 hint означает gap detected ПОСЛЕ того как agent уже потратил effort на Phase 2/3 без matrix.

### Decision: Mechanical regex без LLM в detection logic

**Rationale:** Mitigation для H2 risk (memory feedback_code-evidence-trumps-domain-sense.md): LLM семантически "не чувствует" domain. Anchor prevention в mechanical grep, не в semantic interpretation. Pure regex deterministic, тестируем, идемпотентен.

**Trade-off:** Closed list axis nouns может пропустить экзотические polymorphism axes (например payment-rail, compliance-jurisdiction). User accepts trade-off — closed list overridable через future config (out of scope for v0.1.0).

**Alternatives considered:**
- LLM-based intent classification — rejected because non-deterministic, expensive, hard to test, drift risk между dev/prod.
- Open-ended regex (any quantifier + any noun) — rejected because over-broad match → high false positive rate → users learn to escape-hatch every commit (H1 risk amplified).

### Decision: Threshold-2 hits для trigger detection

**Rationale:** Single hit может быть incidental phrase ("each user receives ..."). 2 hits OR 1 hit + axis enumeration signal — strong evidence что FR действительно polymorphic. Mirror scope-gate threshold heuristic.

**Trade-off:** Мог бы пропустить FRs с одним trigger (for each adapter). Mitigation — axis enumeration signal (если в FR упомянуты >=2 variants explicitly) повышает confidence до threshold.

**Alternatives considered:**
- Threshold-1 — rejected because too aggressive (over-application).
- Threshold-3 — rejected because most polymorphic FRs не содержат 3+ trigger phrases в коротком тексте.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js (TS) — existing dev-pomogator BDD framework через vitest test runner
**Install Command:** already installed (vitest + cucumber expressions через step-registrar)
**Evidence:** tests/e2e/specs-generator-*.test.ts существуют (multiple files), используют vitest + parseFeatureFile helper. См. tests/e2e/helpers.ts:parseFeatureFile.
**Verdict:** Hooks через runShellScript для invocation audit-spec.ts. Fixtures под tests/fixtures/specs-generator/variant-matrix/. Per-spec atomic test isolation.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| tests/e2e/helpers.ts | runShellScript | global | spawnSync wrapper для CLI tools | Да — основной test driver |
| tests/e2e/helpers.ts | getSpecsGeneratorFixturePath | global | Resolves fixture path | Да — extend для variant-matrix subdir |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| N/A | N/A | N/A | Все existing hooks достаточны | N/A |

### Cleanup Strategy

Каждая fixture — read-only static directory под tests/fixtures/specs-generator/variant-matrix/. Audit invocation read-only (только reads + writes AUDIT_REPORT.md в spec dir). Cleanup: remove AUDIT_REPORT.md в fixture перед каждым test run если нужно clean state. Escape log JSONL writes в test temp directory, cleaned by vitest.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| polymorphic-fr-complete | tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-complete/ | Happy-path positive case | static |
| polymorphic-fr-no-matrix | tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-no-matrix/ | Negative — missing AC table | static |
| polymorphic-fr-hard-out | tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-hard-out/ | H1 regression guard | static |
| polymorphic-fr-ru-mixed | tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-ru-mixed/ | RU detection | static |
| escape-hatch-short-reason | tests/fixtures/specs-generator/variant-matrix/escape-hatch-short-reason/ | FR-7 edge case | static |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| auditResult | object | runShellScript audit-spec.ts -Format json | test assertions | Audit output для verification |
