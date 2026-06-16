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
