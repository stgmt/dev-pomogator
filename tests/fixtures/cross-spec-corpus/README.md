# cross-spec-corpus — fixture for tests/e2e/cross-spec-reconcile.test.ts (FR-17)

A real planted-drift corpus for the cross-spec-reconcile engine's e2e roundtrip.

**Provenance:** the expected finding codes below were captured from the REAL
engine (`reconcileCli` light mode) on 2026-06-15 — not invented. The codes are
lowercase-slashed (`impl-drift/missing-file`), as the producer actually emits.

**Layout:** specs live under `corpus/<slug>/` (NOT a literal `.specs/` dir, so the
spec-access-guard does not intercept fixture writes). The e2e COPIES `corpus/` to a
tmp `<root>/.specs/` before running the engine — reconcileCli scans `<root>/.specs/`
and writes `consistency-report.yaml` into each spec dir, which must not pollute the
read-only fixture.

**Planted drift → expected findings:**

| Spec   | Planted defect | Expected finding code(s) |
|--------|----------------|--------------------------|
| spec-a | `FILE_CHANGES.md` references `src/auth/token-service.ts`, absent on disk | `impl-drift/missing-file` (WARNING) + `spec-only/orphan-FR` |
| spec-b | FR-1 with no `ACCEPTANCE_CRITERIA.md` | `spec-only/missing-acceptance` + `spec-only/orphan-FR` |

To re-capture after an engine change: copy `corpus/` to `<tmp>/.specs/`, run
`reconcileCli(parseReconcileArgs([]), <tmp>)`, and read each
`consistency-report.yaml`.
