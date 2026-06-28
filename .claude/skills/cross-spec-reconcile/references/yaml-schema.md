# Consistency Report YAML schema

`cross-spec-reconcile` writes one `consistency-report.yaml` per spec to
`.specs/<slug>/consistency-report.yaml` (atomic temp-file + rename). The shape is FIXED and
hand-emitted by `scripts/yaml-writer.ts` (no YAML dependency — keeps the skill self-contained
and the diff readable). This doc is the schema extract from that emitter; if you change
`emitYaml`, update this.

## Top-level keys (always present, in this order)

| Key | Type | Source | Notes |
|---|---|---|---|
| `generated_at` | string (ISO 8601) | `report.generatedAt` | when the run produced the report |
| `mode` | string | `report.mode` | `light` (mechanical only) or `full` (adds the LLM-semantic pass) |
| `spec_slug` | string | `report.specSlug` | the spec this report is about |
| `total_findings` | integer | `report.findings.length` | count of `findings[]` |
| `summary` | map | computed (FR-17) | aggregate roll-up — see [§ summary](#summary) below; always present, even with zero findings |
| `findings` | list \| `[]` | `report.findings` | empty list emitted literally as `findings: []` |

## `findings[]` item

Each finding emits its three **required** keys first, then only the **optional** keys that are
set (absent keys are omitted, not emitted as null):

| Key | Required | Type | Meaning |
|---|---|---|---|
| `code` | ✅ | string | slash-namespaced code (see [finding-codes.md](finding-codes.md)) |
| `class` | ✅ | string | finding class (e.g. `uncovered`, `contradiction`, `schema-drift`) |
| `severity` | ✅ | string | `CRITICAL` \| `WARNING` \| `INFO` |
| `referenced_in` | — | string | the doc/location that made the claim (typical for `impl-drift/*`, `spec-only/*`) |
| `expected_path` | — | string | the path the spec expected to exist (for `impl-drift/missing-*`, `dead-link`) |
| `spec_a` | — | string | first spec slug of a cross-spec pair (for `cross-spec/*`) |
| `spec_b` | — | string | second spec slug of a cross-spec pair (for `cross-spec/*`) |
| `suggested_fix` | — | string | a one-line remediation hint (any finding may carry it) |

## summary

FR-17 (`impl-coverage-summary`) roll-up, emitted right after `total_findings`. Always present
(zero findings → counts are `0`, the maps are emitted as `{}`, recommendations as `[]`).

| Key | Type | Meaning |
|---|---|---|
| `by_severity` | map | counts keyed by `CRITICAL` / `WARNING` / `INFO` (all three keys always present) |
| `by_class` | map \| `{}` | counts keyed by the REAL `FindingClass` values present (`uncovered`, `contradiction`, `runtime-identifier-drift`, `architectural-decision-vs-reality`, `concept-overlap`, `spec-only`, `schema-drift`), sorted; absent classes omitted |
| `by_namespace` | map \| `{}` | counts keyed by the code prefix before `/` (e.g. `cross-spec`, `impl-drift`), sorted |
| `totals.findings` | integer | `report.findings.length` |
| `totals.specs_compared` | integer | corpus size compared (`.specs/<slug>/` count) — `report.specsCompared` |
| `totals.impl_paths_checked` | integer | impl path references existence-checked for this spec — `report.implPathsChecked` |
| `top_3_recommendations` | list \| `[]` | up to 3 findings, highest `severity` first; each item carries `code`, `severity`, `fix` (= `suggested_fix`, falling back to `class`) |

> **Taxonomy note (verify-divergent-contracts):** the FR-17 Done-When originally specified
> `by_class: {covered, uncovered, orphaned, outdated}`. Those are NOT the implemented finding
> classes (only `uncovered` overlaps; `covered`/`orphaned`/`outdated` do not exist). Code is the
> source of truth: `by_class` reports the real `FindingClass` values, and the Done-When taxonomy
> was corrected to match.

### Example

```yaml
generated_at: 2026-06-29T00:00:00Z
mode: light
spec_slug: demo
total_findings: 3
summary:
  by_severity:
    CRITICAL: 2
    WARNING: 1
    INFO: 0
  by_class:
    contradiction: 1
    runtime-identifier-drift: 1
    uncovered: 1
  by_namespace:
    cross-spec: 2
    impl-drift: 1
  totals:
    findings: 3
    specs_compared: 12
    impl_paths_checked: 47
  top_3_recommendations:
    - code: cross-spec/runtime-identifier-drift
      severity: CRITICAL
      fix: align ids
    - code: cross-spec/contradictory-nfr
      severity: CRITICAL
      fix: contradiction
    - code: impl-drift/missing-file
      severity: WARNING
      fix: add it
findings:
  - code: impl-drift/missing-file
    class: uncovered
    severity: WARNING
    ...
```

## Escaping

A scalar is double-quoted (and `"`/`\` escaped) iff it contains any of `: # \n " ' \ & * ? { } [ ] ,`
or has leading/trailing whitespace. Otherwise it is emitted bare. There are no nested
arrays-of-objects, anchors, or multi-line scalars — `suggested_fix` is single-line.

## Example

```yaml
generated_at: 2026-06-16T08:00:00.000Z
mode: full
spec_slug: spec-generator-v4
total_findings: 2
findings:
  - code: impl-drift/missing-file
    class: uncovered
    severity: WARNING
    referenced_in: ".specs/spec-generator-v4/FILE_CHANGES.md"
    expected_path: tools/spec-graph/does-not-exist.ts
    suggested_fix: "create the file or drop the FILE_CHANGES row"
  - code: cross-spec/runtime-identifier-drift
    class: runtime-identifier-drift
    severity: CRITICAL
    spec_a: session-pilot
    spec_b: native-statusline
    suggested_fix: "reconcile the identifier to one canonical form"
```

Empty report:

```yaml
generated_at: 2026-06-16T08:00:00.000Z
mode: light
spec_slug: answer-simple
total_findings: 0
findings: []
```

> A SARIF sibling (`consistency-report.sarif`) is emitted by `scripts/sarif.ts` for tooling that
> consumes SARIF; the YAML above is the human-/agent-facing source of truth.
