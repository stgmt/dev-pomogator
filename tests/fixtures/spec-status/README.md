# Fixtures: spec-status

Test fixtures для integration tests `tests/e2e/spec-status.test.ts` (HSCMD001_01..04).

Spec reference: `.specs/honest-status-command/FIXTURES.md` (F-1..F-10).

## Inventory

| ID | Path | Purpose |
|----|------|---------|
| F-1 | `mock-spec-partial/` | Mock spec — 3 AC verified + 2 claimed-only (partial evidence) |
| F-2 | `mock-spec-claimed-only/` | Mock spec — all 3 AC marked done но без evidence (anti-overclaim target) |
| F-3 | `mock-spec-all-verified/` | Mock spec — all 3 AC verified с full evidence (baseline sanity) |
| F-4 | `sample-tests/weak.steps.ts` | WEAK BDD step-def — the `Then` asserts presence only (`assert.ok(x)`); `Given`/`When` setup steps are skipped |
| F-5 | `sample-tests/strong.steps.ts` | STRONG BDD step-def — the `Then` steps assert value-level structure (`assert.deepEqual`) + edge cases |
| F-6 | `sample-tests/fake-positive.steps.ts` | FAKE-POSITIVE-RISK BDD step-def — file-level `vi.mock` of a production path + a tautology `assert.ok(true)` in the `Then` |
| F-7 | `yaml-samples/status.fresh.yaml` | Fresh state YAML (state=passed, mtime recent) |
| F-8 | `yaml-samples/status.stale.yaml` | Stale heartbeat (state=running, mtime old via utimesSync) |
| F-9 | `yaml-samples/status.completed.yaml` | Completed test results sample |
| F-10 | `mock-bin/docker` (+ `docker.bat`) | Docker probe mock — exit 1 with connection error |

## Usage

Fixtures are static (no factory). Tests copy needed fixture в `os.tmpdir()` via `fs.cpSync` в `beforeEach`, cleanup в `afterEach`. YAML staleness simulated via `fs.utimesSync(path, atime, mtime)`.

Docker mock activated via PATH override:
```typescript
const env = { ...process.env, PATH: `${mockBinDir}${path.delimiter}${process.env.PATH}` };
```

See spec `FIXTURES.md` for detailed setup/teardown per fixture.
