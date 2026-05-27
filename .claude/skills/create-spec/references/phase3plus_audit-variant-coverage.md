# Phase 3+ Audit — VARIANT_COVERAGE

8th audit category. Validates that FRs describing polymorphic dispatch (shared pipeline + per-variant call-site) have enumerated variant matrix в трёх артефактах: AC Decision Table, Gherkin Examples block, per-variant tasks.

## Что проверяет

Для каждого FR в `.specs/{slug}/FR.md` который detection module flags as polymorphic (через `tools/specs-generator/variant-matrix/trigger-phrases.ts:detectPolymorphicFRs`):

### Check 1: AC Decision Table presence

**Code:** `AC_DECISION_TABLE_MISSING`
**Severity:** WARNING
**Trigger:** FR помечен polymorphic (≥2 trigger hits, hardOut=false), но `ACCEPTANCE_CRITERIA.md` не содержит markdown table с required columns (`Variant` + `Coverage`).
**Resolution:** Run `Skill("variant-matrix-build")` to populate AC Decision Table OR add escape hatch `[skip-variant-matrix: <reason ≥8 chars>]` в FR body.

### Check 2: AC ↔ Examples row count match

**Code:** `AC_EXAMPLES_ROW_MISMATCH`
**Severity:** WARNING
**Trigger:** AC Decision Table covered-row count (excluding `excluded` rows) != `.feature` Examples block row count для same `@featureN` tag.
**Resolution:** Update Examples block to match covered-row count (1:1 mapping). Если row сознательно skipped — explicitly comment в Examples с reason.

### Check 3: AC ↔ TASKS-or-OUT_OF_SCOPE coverage

**Code:** `MISSING_VARIANT_TASK`
**Severity:** WARNING
**Trigger:** AC Decision Table содержит `pending` row но TASKS.md не содержит variant task с matching tracer line `_Variant: {axis}={value}_`.
**Resolution:** Add per-variant task в TASKS.md с tracer line, OR change AC row coverage to `excluded` с `[OUT_OF_SCOPE: <reason ≥8 chars>]`.

### Check 4: Escape hatch reason length

**Code:** `WARNING_REASON_TOO_SHORT`
**Severity:** INFO (не блокирует STOP #3)
**Trigger:** FR содержит `[skip-variant-matrix: <reason>]` где reason `<8 chars`.
**Resolution:** Expand reason до ≥8 chars с substantive rationale. См. `.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md` для anti-gaming guidance.

## Severity matrix

| Severity | Code | Blocks STOP #3? |
|----------|------|------------------|
| WARNING | AC_DECISION_TABLE_MISSING | YES |
| WARNING | AC_EXAMPLES_ROW_MISMATCH | YES |
| WARNING | MISSING_VARIANT_TASK | YES |
| INFO | WARNING_REASON_TOO_SHORT | NO |

`spec-status.ts -ConfirmStop Audit` refuses advancement если any finding с severity ≥ WARNING.

## Resolution guide (per finding)

### AC_DECISION_TABLE_MISSING

1. Determine variant axis (e.g. `doctype`, `provider`, `locale`).
2. Enumerate variants — derive из existing code (grep по enum/switch) OR explicit user input.
3. Insert AC Decision Table в соответствующий AC раздел в `ACCEPTANCE_CRITERIA.md`:

```markdown
## AC-N (FR-N): ...

**Variant Axis:** {axis}
**Shared codepath:** {function-name}

| # | Variant | Trigger condition | Expected param | Test ref (@featureN) | Coverage |
|---|---------|-------------------|----------------|----------------------|----------|
| 1 | {variant1} | ... | ... | @feature{N}-{variant1} | pending |
...
```

4. Re-run audit. Finding должен disappear.

### AC_EXAMPLES_ROW_MISMATCH

1. Read `.feature` file и AC Decision Table.
2. Add/remove rows в Examples block чтобы match AC covered count.
3. Comment excluded rows: `# {variant} excluded — see ACCEPTANCE_CRITERIA.md AC-N row N`.

### MISSING_VARIANT_TASK

1. Identify pending AC rows.
2. Add task в TASKS.md с template:

```markdown
- [ ] T-{N}-{variant}: Implement variant {variant} call-site mapping -- @feature{N} — Status: TODO | Est: 30m
  _Requirements: [FR-N](FR.md#fr-n-...)_
  _Variant: {axis}={variant}_
  **Done When:**
  - [ ] Call-site reads correct {axis} field for {variant}
  - [ ] @feature{N} variant {variant} scenario passes
```

### WARNING_REASON_TOO_SHORT

1. Expand reason в FR body. Examples of substantive rationales:
   - "covered by parametrized helper at tests/runner.ts iterating через DocumentType enum"
   - "deferred per JIRA-NNNN; current PR addresses architectural change"
   - "test infrastructure only — no production dispatch"

2. Re-run audit. INFO finding должен disappear.

## Examples

### Polymorphic FR без matrix → AC_DECISION_TABLE_MISSING

```markdown
## FR-3: Validate stock for all doctypes

System validates stock for each doctype через shared validation pipeline.

## AC-3 (FR-3)

WHEN user submits form THEN validateStockForItems SHALL be called.
```

→ Audit emit: `{code: 'AC_DECISION_TABLE_MISSING', severity: 'WARNING', frId: 'FR-3', message: 'FR-3 помечен polymorphic (3 triggers) но AC Decision Table отсутствует или incomplete...'}`.

### Hard-OUT signal → no finding

```markdown
## FR-5: Validate format только для receiving doctype

System validates format только для receiving. Other doctypes используют different pipeline.
```

→ Detection returns `{hardOut: true}` for FR-5. VARIANT_COVERAGE category emit zero findings. STOP #3 проходит без matrix.

### Valid escape hatch → no WARNING

```markdown
## FR-7: Validate format for all locales [skip-variant-matrix: covered by parametrized i18n test runner at tests/i18n-runner.ts]

System validates format across all locales.
```

→ Reason ≥8 chars. Audit downgrade всё severity к INFO для FR-7. JSONL log entry в `.claude/logs/spec-variant-matrix-escapes.jsonl`. STOP #3 проходит.

## Related

- Detection module: `tools/specs-generator/variant-matrix/trigger-phrases.ts`
- Audit library: `tools/specs-generator/variant-matrix/audit.ts`
- Skill: [`extensions/specs-workflow/.claude/skills/variant-matrix-build/SKILL.md`](../../../../extensions/specs-workflow/.claude/skills/variant-matrix-build/SKILL.md)
- Trigger map: [`.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md`](../../../../.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md)
- Escape hatch audit: [`.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md`](../../../../.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md)
- Reference incident: Stocktaking MR / Warehouse Transfer (QA Лилия Михайлова, 2026-04-27)
