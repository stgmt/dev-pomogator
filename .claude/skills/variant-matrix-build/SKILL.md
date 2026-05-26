---
name: variant-matrix-build
description: Phase-2 sub-skill that detects polymorphic FRs (shared pipeline + per-variant dispatch) and populates variant matrix artifacts — AC Decision Table, Gherkin Scenario Outline + Examples, per-variant tasks. Invoked by create-spec Phase 2 step 4c. Returns JSON summary. Mirrors requirements-chk-matrix shape.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# variant-matrix-build

## Mission

Прохождение FR.md спеки, поиск polymorphic dispatch language ("for each variant", "all doctypes", "переиспользуем", "общий pipeline"), и заполнение трёх связанных артефактов:

1. **ACCEPTANCE_CRITERIA.md** — Decision Table per polymorphic FR с required columns (`# | Variant | Trigger condition | Expected param | Test ref (@featureN) | Coverage`).
2. **{slug}.feature** — `Scenario Outline` + `Examples:` block с строкой на каждую `covered` AC row.
3. **TASKS.md** — отдельная задача per `pending` AC row с тегом `@featureN` + tracer line `_Variant: {axis}={value}_`.

Skill — soft layer enforcement: предлагает matrix template когда detection срабатывает. Hard layer — Phase 3+ Audit category VARIANT_COVERAGE blocks STOP #3 если matrix incomplete.

## Reference Incident

Driver: Stocktaking MR / Warehouse Transfer (QA Лилия Михайлова, 2026-04-27). Спека требовала валидацию stock в 4 местах, реализация — `formData.warehouseId || undefined` shared call-site. WarehouseTransfer doctype использует `sourceWarehouseId` — `'' || undefined → undefined` → фильтр снят → bug shipped. Per-variant matrix missing в спеке → пропустили в тестах и тасках. Этот skill catches класс факапа на spec stage.

## Preconditions

- Spec scaffolded через `scaffold-spec.ts` (caller has done this).
- Phase 1 Discovery confirmed (`spec-status.ts -ConfirmStop Discovery`).
- Phase 2 step 4b (Skill `requirements-chk-matrix`) уже завершён.
- FR.md содержит ≥1 functional requirement в формате `## FR-N:`.

## Inputs

- `.specs/{slug}/FR.md` — для detection.
- `.specs/{slug}/ACCEPTANCE_CRITERIA.md` — для AC Decision Table insertion.
- `.specs/{slug}/{slug}.feature` — для Scenario Outline + Examples insertion.
- `.specs/{slug}/TASKS.md` — для per-variant tasks insertion.

## Execution

### Step 1: Detect polymorphic FRs

```bash
npx tsx extensions/specs-workflow/tools/specs-generator/variant-matrix/variant-matrix-cli.ts <spec-path>
```

Returns JSON `{findings: [...]}`. Если findings содержит `code: AC_DECISION_TABLE_MISSING` для каждого polymorphic FR — переходить к Step 2. Если detection вернул пусто или все FRs hardOut → skill exits с `{frs_with_matrix: 0, ...}` (no-op fallback).

Также можно использовать direct module import в TypeScript context:

```ts
import { detectPolymorphicFRs } from 'extensions/specs-workflow/tools/specs-generator/variant-matrix/trigger-phrases.ts';
const result = detectPolymorphicFRs(frContent);
```

### Step 2: Spec author enumerates variants per FR

Для каждого polymorphic FR (where `hardOut: false`) — собрать с пользователя список вариантов (axis + values). Например:

> "FR-1 помечен polymorphic для axis 'doctype'. Какие variants нужно покрыть? (e.g. inbound, outbound, warehouse-transfer)"

Опционально — derive variants из existing code (grep по enum/switch), но primary — explicit user input.

### Step 3: Emit AC Decision Table

В ACCEPTANCE_CRITERIA.md для соответствующего AC раздела (`## AC-N (FR-N)`) вставить:

```markdown
**Variant Axis:** {axis}
**Shared codepath:** {function-name-or-call-site}

| # | Variant | Trigger condition | Expected param | Test ref (@featureN) | Coverage |
|---|---------|-------------------|----------------|----------------------|----------|
| 1 | {variant1} | {condition} | {param} | @feature{N}-{variant1} | pending |
| 2 | {variant2} | {condition} | {param} | @feature{N}-{variant2} | pending |
| ... | ... | ... | ... | ... | ... |
```

Каждая строка изначально `pending` — пользователь обновит на `covered` после написания test или на `excluded` с `[OUT_OF_SCOPE: <reason ≥8 chars>]`.

### Step 4: Emit Gherkin Scenario Outline + Examples

В `{slug}.feature` файле вставить:

```gherkin
@feature{N} @variant-matrix
Scenario Outline: {FR-N description} per <{axis}>
  Given {axis} is "<{axis}>"
  When {trigger condition}
  Then validation outcome is "<outcome>"

Examples:
  | {axis}      | outcome     |
  | {variant1}  | validated   |
  | {variant2}  | validated   |
  # {excluded-variant} excluded — see ACCEPTANCE_CRITERIA.md AC-N row N
```

Examples table должна matchить AC table (1:1 для covered rows; excluded — commented out или skipped).

### Step 5: Emit per-variant tasks в TASKS.md

В Phase 2 (или соответствующем) разделе TASKS.md добавить:

```markdown
- [ ] T-{N}-{variant1}: Implement variant {variant1} call-site mapping -- @feature{N} — Status: TODO | Est: 30m
  _Requirements: [FR-N](FR.md#fr-n-{slug})_
  _Variant: {axis}={variant1}_
  **Done When:**
  - [ ] Call-site reads correct {axis} field for {variant1}
  - [ ] @feature{N} variant {variant1} scenario passes

- [ ] T-{N}-{variant2}: Implement variant {variant2} call-site mapping -- @feature{N} — ...
  _Variant: {axis}={variant2}_
```

### Step 6: Return JSON contract

```json
{
  "frs_with_matrix": 2,
  "ac_rows": 9,
  "examples_rows": 7,
  "tasks_emitted": 7,
  "escape_hatches": 0,
  "files_touched": [
    ".specs/{slug}/ACCEPTANCE_CRITERIA.md",
    ".specs/{slug}/{slug}.feature",
    ".specs/{slug}/TASKS.md"
  ]
}
```

## Contract

**Output JSON shape:**

| Field | Type | Description |
|-------|------|-------------|
| `frs_with_matrix` | number | Количество FR-ов с emitted matrix |
| `ac_rows` | number | Total Decision Table rows (across all FRs) |
| `examples_rows` | number | Total Examples rows |
| `tasks_emitted` | number | Total per-variant tasks added |
| `escape_hatches` | number | Detected escape hatches с reason ≥8 chars (skipped FRs) |
| `files_touched` | string[] | List of file paths modified |

## Fallback

Если detection возвращает 0 polymorphic FRs (все либо single-variant либо без trigger phrases) — skill exits cleanly с:

```json
{
  "frs_with_matrix": 0,
  "ac_rows": 0,
  "examples_rows": 0,
  "tasks_emitted": 0,
  "escape_hatches": 0,
  "files_touched": []
}
```

No error, не блокирует Phase 2 progression. Это expected для simple specs без polymorphic dispatch.

## Hard-OUT signals

Detection skips FRs которые содержат:

- "только/single/specific/единственн{ое,ый}/конкретн{ый,ое}" в same paragraph как trigger phrase
- `> OUT OF SCOPE` blockquote
- `[OUT_OF_SCOPE: <reason>]` marker

Per memory `feedback_single-incident-rules-over-generalize.md` — H1 mitigation чтобы single-variant FRs не over-trigger.

## Escape hatch

Если variant matrix действительно не нужна для polymorphic FR (например, тесты уже covered через parametrized helper) — добавить в FR body:

```markdown
[skip-variant-matrix: <reason ≥8 chars>]
```

Audit category VARIANT_COVERAGE downgrade severity to INFO для этого FR. Reason `<8 chars` triggers `WARNING_REASON_TOO_SHORT` finding (logged JSONL audit trail в `.claude/logs/spec-variant-matrix-escapes.jsonl`).

## Related

- Trigger map rule: [.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md](../../../.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md)
- Escape hatch audit: [.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md](../../../.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md)
- Audit category reference: [.claude/skills/create-spec/references/phase3plus_audit-variant-coverage.md](../../../.claude/skills/create-spec/references/phase3plus_audit-variant-coverage.md)
- Adjacent skill (commit-time): [scope-gate verify-generic-scope-fix](../../../../scope-gate/.claude/skills/verify-generic-scope-fix/SKILL.md)
- Plan-time fallback rule: [cross-scope-coverage.md](../../../.claude/rules/plan-pomogator/cross-scope-coverage.md)
