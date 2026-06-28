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

## Direct-path fixtures consumed by the @feature17 BDD scenarios (FR-17)

The `spec-a/`, `spec-b/`, `spec-c/` dirs (directly under this folder, NOT under `corpus/`)
are the fixtures the @feature17 reconcile scenarios in
`tests/step_definitions/phase7-cross-spec.ts` actually READ (they copy the fixture FR.md
into a tmp `.specs/<slug>/`, then run `reconcileLight`). Finding codes verified from the
REAL engine, one row per asserting scenario:

| Fixture(s) | Planted defect | Expected finding code(s) | Asserting scenario |
|------------|----------------|--------------------------|--------------------|
| spec-c | FR declares MCP tool at `src/mcp/validate_user.ts`, absent on disk | `impl-drift/missing-file` (WARNING) | SPECGEN004_38 |
| spec-a + spec-b | `feedback_key = "session_token"` vs `"sessionToken"` | `cross-spec/runtime-identifier-drift` (CRITICAL) | SPECGEN004_39 |
| spec-a + spec-b | both reference the same impl path `src/auth/jwt.ts` (must exist on disk — the Batch-21 anti-FP gate) | `cross-spec/module-ownership-conflict` (CRITICAL) | SPECGEN004_395 |
