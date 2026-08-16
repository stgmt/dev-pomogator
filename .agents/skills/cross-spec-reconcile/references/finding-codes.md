# Finding codes — cross-spec-reconcile

Every finding the reconciler emits carries a slash-namespaced `code` (`<namespace>/<name>`),
a `class`, and a `severity` (`CRITICAL` | `WARNING` | `INFO`). `CRITICAL` findings trigger a
blocking `AskUserQuestion` (header `⚠️ CRIT`); a user override is logged to
`.claude/logs/cross-spec-overrides.jsonl`.

This catalogue is the **source-of-truth extract from the engine** — codes come from
`scripts/reconcile.ts` (mechanical, light + full mode) and `scripts/full-mode.ts` (the
one LLM-semantic code). Counts in older task notes ("28"/"37") are stale; the real set is
**31** codes below. If you add a code in the engine, add its row here.

## Namespaces

| Namespace | Meaning |
|---|---|
| `impl-drift/*` | the spec claims something the code/tests do not back (missing file/symbol/test, dead link, stale result) |
| `cross-spec/*` | two specs disagree, or a locked decision diverges from reality |
| `spec-only/*` | a single spec is internally incomplete/contradictory (no cross-spec or code comparison) |
| `schema-drift/*` | a doc's structure violates the expected schema/shape |

## Codes

### `impl-drift/*` — spec vs code/tests

| Code | Severity | Class | Remediation |
|---|---|---|---|
| `impl-drift/missing-file` | WARNING | uncovered | A `FILE_CHANGES`/spec path does not exist on disk — create the file or fix the reference. |
| `impl-drift/missing-symbol` | WARNING | uncovered | A referenced function/class/identifier is absent from the code — implement it or correct the name. |
| `impl-drift/dead-link` | WARNING | uncovered | A markdown link target is missing — repoint or remove the link (see `anchor-fix`). |
| `impl-drift/missing-test` | INFO | uncovered | An FR/AC has no mapped test — add a scenario or mark `[OUT_OF_SCOPE]`. |
| `impl-drift/test-result-stale` | WARNING | uncovered | The last recorded test result predates the code it covers — re-run the suite. |
| `impl-drift/test-without-fr` | WARNING | uncovered | A test maps to no FR (orphan/"test from nowhere") — tag it `@featureN` or add the missing FR. |

### `cross-spec/*` — spec vs spec

| Code | Severity | Class | Remediation |
|---|---|---|---|
| `cross-spec/runtime-identifier-drift` | CRITICAL | runtime-identifier-drift | The same runtime identifier is described differently across specs — reconcile to one canonical form. |
| `cross-spec/url-shape-drift` | CRITICAL | runtime-identifier-drift | The same endpoint URL is shaped differently across specs — align the path/shape. |
| `cross-spec/cli-flag-drift` | WARNING | runtime-identifier-drift | The same CLI flag differs across specs — align the flag name/semantics. |
| `cross-spec/enum-divergence` | CRITICAL | schema-drift | A shared enum has divergent members across specs — reconcile the membership. |
| `cross-spec/module-ownership-conflict` | CRITICAL | contradiction | Two specs claim ownership of the same module — assign a single owner. |
| `cross-spec/missing-cross-ref` | INFO | concept-overlap | Related specs do not cross-reference each other — add a link. |
| `cross-spec/contradictory-nfr` | CRITICAL | contradiction | Two specs state conflicting non-functional requirements — resolve the conflict. |
| `cross-spec/schema-mismatch` | CRITICAL | schema-drift | A shared schema/shape differs across specs — align to one definition. |
| `cross-spec/decision-locked-but-reality-diverges` | CRITICAL | architectural-decision-vs-reality | A locked architecture decision contradicts the code — update the spec (decision wrong) or the code (reality wrong). See `cross-spec-resolve` paths A/B/C. |
| `cross-spec/duplicate-fr-id` | CRITICAL | contradiction | The same FR id appears in two specs — renumber one. |
| `cross-spec/contradictory-fr` | CRITICAL | contradiction | Two specs' FRs conflict — resolve which holds. |
| `cross-spec/concept-overlap` | INFO | concept-overlap | Two specs cover overlapping concepts — dedupe or cross-reference. |
| `cross-spec/semantic-drift` | varies (LLM-judged) | semantic | Full-mode only: the Phase-3 judge found a semantic divergence not caught mechanically — review the judge rationale and reconcile. |

### `spec-only/*` — a single spec, internal

| Code | Severity | Class | Remediation |
|---|---|---|---|
| `spec-only/missing-acceptance` | WARNING | spec-only | An FR has no acceptance criteria — add AC. |
| `spec-only/orphan-AC` | INFO | spec-only | An AC maps to no FR — link it or remove it. |
| `spec-only/unreachable-task` | INFO | spec-only | A task references nothing reachable — fix its refs. |
| `spec-only/orphan-task` | WARNING | spec-only | A task maps to no FR — link it to a requirement. |
| `spec-only/missing-fr-section` | WARNING | spec-only | `FR.md` is missing a required section — add it. |
| `spec-only/duplicate-fr-id` | CRITICAL | contradiction | A duplicate FR id within one spec — renumber. |
| `spec-only/orphan-FR` | WARNING | spec-only | An FR has no AC/scenario — add coverage. |
| `spec-only/uncovered-AC` | WARNING | spec-only | An AC has no scenario — add a scenario. |

### `schema-drift/*` — document structure

| Code | Severity | Class | Remediation |
|---|---|---|---|
| `schema-drift/invalid-frontmatter` | WARNING | schema-drift | A doc's YAML frontmatter is invalid/missing required keys — fix the frontmatter. |
| `schema-drift/json-shape-drift` | WARNING | schema-drift | A JSON artifact's shape diverges from its schema — align the shape. |
| `schema-drift/missing-feature-heading` | CRITICAL | schema-drift | A `.feature` is missing a required heading — add it. |

> **Severity → action.** `CRITICAL` blocks via `AskUserQuestion` (override logged). `WARNING`/`INFO`
> are surfaced in the per-spec `consistency-report.yaml` (and SARIF) for triage, not blocking.
> For resolving `impl-drift/architectural-decision-vs-reality`, use the `cross-spec-resolve` skill
> (paths A = fix spec, B = fix code, C = defer with `[OUT_OF_SCOPE]`).
