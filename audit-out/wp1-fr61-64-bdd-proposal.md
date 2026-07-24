# WP-1 · FR-61..64 — minimal mutation-resistant BDD additions (read-only investigation, 2026-07-23)

Status: PROPOSAL (no edits made). Scope: close the three mutation-soft branches of
already-AC-pinned behavior that the WP-1 program plan
(`audit-reports/spec-generator-v4-program-plan-2026-07-23.md:236-238`) names as defects
(a) full AC identifiers, (d) WSL-aware probe, (f) effective/canonical lane alignment —
plus H2 (:37,:84) "effective 526 stale, canonical 526 passed, EXECUTION GREEN".

## 1. Evidence map — what already exists (all production-driven, all in Docker runs)

Feature: `.specs/spec-generator-v4/spec-generator-v4.feature` (executable source; in both
cucumber profiles' `paths`, cucumber.json:4 / cucumber.docker.json:4; tags filter
cucumber.json:55 excludes none of these).

| FR | Scenarios | ACs pinned | Step-def file (all drive real production code) |
|----|-----------|-----------|------------------------------------------------|
| 61 | SPECGEN004_539–543 (L3455–3488, `@feature61`) | AC-61.1..61.5 | tests/step_definitions/feature37_smart_verdict.ts (L392–730; real runSpecVerdict + buildToolRegistry get_spec_status + setEntityStatus door + bdd-overlay) |
| 62 | SPECGEN004_553–554 (L3490–3503, `@feature62 @FR-62`) | AC-62.1–62.3 | tests/step_definitions/feature62_root_resolution.ts (L79–145; real CLI spawn + resolveTargetProjectRoot + precheck + resolveMcpRoot) |
| 63 | SPECGEN004_555–557 (L3505–3524, `@feature63 @FR-63`) | AC-63.1–63.3 | tests/step_definitions/feature63_precheck_inventory.ts (L279–753; precheckWithInventory + get_spec_status + runSpecVerdict + evaluateReadiness/classifyEvidence) |
| 64 | SPECGEN004_558–561 (L3526–3552, `@feature64 @FR-64`) | AC-64.1–64.4 | tests/step_definitions/feature64_release_inventory.ts (L80–220; real evaluateReleaseInventory + node_modules-free installed spawn) |

Corrections to prior assumptions (verified directly):
- `evaluateReadiness` is NOT production-dead: `get_spec_status` calls it
  (tools/spec-mcp-server/tools.ts:1449) passing 4 locally-built lanes
  (TRACEABILITY/TASK_TRUTH/BDD_SYNC/FILTERED_PROOF, tools.ts:1451-1472); EXECUTION/
  STRUCTURE are derived internally. spec-verdict builds its own 7-lane set
  (tools/specs-generator/spec-verdict.ts:634-691). Drift risk is between these builders,
  not dead code.
- Stale IS handled in `get_spec_status` lifecycle: `summary.stale > 0 → PARTIAL`
  (tools.ts:1441, hint tools.ts:1482-1483) — but the STALE BRANCH has no scenario
  (556 exercises stale only at the library `evaluateReadiness` surface).
- `inventory` (ac_ids, per-AC test_paths, provenance/recency) is surfaced verbatim at
  tools.ts:1448/1514 citing AC-63.1/63.2.
- corpus-health: standalone (FR-37 domain, feature37_corpus_health.ts), NOT a spec-verdict
  lane, NOT in WP-1 file list — zero WP-1 items here.

## 2. The three mutation-soft gaps

### G1 — stale-evidence alignment across ALL THREE surfaces (WP-1 defect f + H2)
AC-63.3 requires "all surfaces SHALL return the same AND-composed overall readiness";
AC-63.2 requires distinguishing stale. Today: 556 pins stale at `evaluateReadiness`
library only; 555 pins inventory identity on a structural-only corpus; 540 pins gap
vocabulary. Nothing pins: canonical PASSED + effective STALE ⇒ precheck, MCP status and
spec-verdict all report NOT_READY/PARTIAL with the stale classification named.
Surviving mutations: tools.ts:1441 condition (drop/invert `summary.stale > 0`);
coverage.ts `bucketByResult` stale rule (AC-56.2: overlay-pass time < mtime);
precheck stale pass-through.

### G2 — dotted canonical AC ids survive every surface (WP-1 defect a)
AC-63.1 requires one identical inventory on all surfaces. Fixture in 555 uses BARE ids
(`AC-1`, duplicate `specgen004_600`) while the real corpus carries dotted ids
(`AC-63.10`). A normalization mutation (`id.split('.')[0]`, dedupe-by-parent — the exact
526/518 duplicate-key class, plan :238) survives the current suite. Also `test_paths: []`
honesty (AC-63.2) is asserted at `evaluateReadiness` (557) but not on the MCP/precheck
inventory views with dotted ids.

### G3 — WSL-aware environment blocker probe (WP-1 defect d, plan :237/:410)
`.claude/skills/spec-status/scripts/env-blockers.ts:19-32` `detectDockerBlocker()` runs a
bare `docker ps` (5 s) — on this machine docker lives only in WSL
(scripts/_docker-wsl.sh:5-16: TCP 2375 route; stale socket GIDs on /run/docker.sock), so
the probe false-reports `docker-unreachable` and cannot distinguish "WSL up, daemon dead"
from "no WSL". Existing coverage: HSCMD001 one scenario with a mock docker binary only
(tests/step_definitions/feature_hscmd_spec_status.ts:93-103); zero WSL-aware scenarios.
Reuse patterns: lock-manager.ts:57-74 (`WSL_DISTRO_NAME` precedence), _docker-wsl.sh:21-31
(wsl.exe capability probe).

## 3. Proposed scenarios (all into EXISTING files — BDD-only compliant)

### S1 → SPECGEN004_562 · kills G1 · AC-63.3 + AC-63.2 + AC-56.2
Insert after `.specs/spec-generator-v4/spec-generator-v4.feature:3524` (FR-63 block).
Step-def: tests/step_definitions/feature63_precheck_inventory.ts (reuse the 3-surface
driver from 555/556; fixture mirrors the REAL overlay producer per
verify-against-real-artifact — one `.scenario-results.ndjson` row, AC-56.1 shape).

```gherkin
  @feature63 @FR-63
  Scenario: SPECGEN004_562 stale canonical evidence keeps every surface AND-composed NOT_READY
    Given a fixture spec has canonical passed scenarios and an overlay passed row whose time is older than the fixture feature and step definition mtimes
    When precheck, MCP status, and spec-verdict evaluate the fixture
    Then each surface classifies the evidence as stale rather than passed and names the effective and canonical counts as distinct numbers
    And the lifecycle is PARTIAL not GREEN and the AND-composed overall readiness is NOT_READY with the same next action on all three surfaces
```

### S2 → SPECGEN004_563 · kills G2 · AC-63.1 + AC-63.2
Insert after S1. Step-def: same file; extend `writeInventoryFixture` pattern with dotted
ids (`AC-63.10`, `AC-63.11`) and one AC carrying `test_paths: []`.

```gherkin
  @feature63 @FR-63
  Scenario: SPECGEN004_563 dotted AC ids and empty test paths survive every surface verbatim
    Given a fixture spec maps FRs to dotted AC ids such as AC-63.10 and one AC has no executable test paths
    When precheck, MCP status, and spec-verdict report the fixture
    Then every surface emits the full dotted AC id verbatim and counts each AC exactly once
    And the AC with no executable paths keeps test_paths empty rather than being dropped or truncated to its parent id
```

### S3 → SPECGEN004_564 · kills G3 · needs a new AC first (see §5)
Insert after `.specs/spec-generator-v4/spec-generator-v4.feature:3503` (FR-62 block).
Step-def: tests/step_definitions/feature62_root_resolution.ts (add import of
`detectDockerBlocker` from `.claude/skills/spec-status/scripts/env-blockers.ts`).
Deterministic inside the Docker container via PATH shims (same mock-binary pattern as
HSCMD001): failing `docker` stub + succeeding `wsl.exe` stub answering the `docker info`
probe; negatives: failing `wsl.exe` ⇒ "no WSL" report, succeeding `wsl.exe` with failing
inner daemon ⇒ "daemon dead inside WSL" report.

```gherkin
  @feature62 @FR-62
  Scenario: SPECGEN004_564 the environment blocker probe is WSL aware
    Given a host has no working bare docker binary but a WSL daemon reachable through the tcp docker endpoint
    When the spec-status environment blocker probe runs
    Then no docker-unreachable blocker is reported
    And the report distinguishes a dead daemon inside WSL from the absence of WSL itself
```

## 4. Production mutation targets (verifyKill / stryker inputs per scenario)

| Scenario | Mutate | Expected kill |
|----------|--------|---------------|
| 562 | tools/spec-mcp-server/tools.ts:1441 — drop `summary.stale > 0` from the PARTIAL condition | lifecycle flips GREEN ⇒ Then fails |
| 562 | tools/spec-graph/coverage.ts `bucketByResult` — classify overlay-older-than-mtime passed as `passed` (AC-56.2 stale rule) | stale count 0 ⇒ Then fails |
| 562 | .claude/skills/spec-status/scripts/precheck.ts — pass canonical result through without recency check | precheck surface diverges ⇒ Then fails |
| 563 | tools/spec-graph/readiness-inventory.ts:290-381 — normalize `ac_ids` by `split('.')[0]` or dedupe by parent | AC-63.10 collapses into AC-63 ⇒ count/verbatim Then fails |
| 563 | tools/spec-graph/readiness-inventory.ts — omit `test_paths` for empty arrays | empty-array Then fails |
| 564 | .claude/skills/spec-status/scripts/env-blockers.ts:19-32 — remove the WSL fallback / merge both failure modes into one `docker-unreachable` code | both Thens fail |

## 5. Prerequisites & guardrails

- AC prereq for S3: no FR-61..64 AC covers the WSL-aware probe (AC-62.3 is root identity,
  not the docker probe). Add via the MCP door first (`add_acceptance_criterion`): AC-62.4
  under FR-62, or an AC under the honest-status-command spec (HSCMD001) whose
  env-blocker scenario already lives at tests/features/plugins/spec-status/HSCMD001_spec-status.feature:41.
- Doc drift to fix in the same PR: feature comment L3453 "(pending implementation)" is
  stale — 539–543 exist and pass.
- Filtered runs: `--tags @feature62/@feature63` COLLIDE with PLUGIN006 scenarios
  (tests/features/plugins/specs-workflow/PLUGIN006_specs-generator.feature:435-499).
  Use `--name "SPECGEN004_56[234]"` — filtered runs write throwaway ndjson, never the
  canonical `.last-test-run.ndjson` (scripts/run-bdd.mjs:77-98).
- Host ban: everything via `scripts/docker-bdd.sh` (no-host-bdd-runs); the wsl.exe shim
  is a plain executable in PATH — works inside the Linux container.
- BDD-only: all three are edits to an existing .feature + existing step-def files —
  allowed; no new `*.test.ts`.
- Authoring route: test-author skill (strong-tests §6.5) for the step bodies; fixtures
  must mirror the real producers (AC-56.1 overlay row shape; real
  `.last-test-run.ndjson` envelope), per verify-against-real-artifact.
