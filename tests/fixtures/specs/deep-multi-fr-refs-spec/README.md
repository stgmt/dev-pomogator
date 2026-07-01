# deep-multi-fr-refs-spec (F-25)

Dense cross-reference fixture: 10 FR × 15 AC × 8 Scenario × 12 Task × 5 File.

Owned per [.specs/spec-generator-v4/FIXTURES.md#f-25](../../../../.specs/spec-generator-v4/FIXTURES.md).

Consumed by:

- `tests/e2e/fixture-shapes.test.ts` SHAPE005 — node-count + edge-density
  assertions + `get_trace` ≤200ms p95 over 10 iterations.
- `SCENGEN004_55` — 5-path File node emission (once T-Trans.11 lands).
- NFR-Performance density check.

The fixture is shared (read-only) — do not mutate during test runs.
