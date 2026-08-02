# Tasks

## Task Summary Table

<!-- canonical task summary; all implementation remains TODO -->
| ID | Title | Status | Depends | Phase | Est. |
|----|-------|--------|---------|-------|------|
| DWE-T01 | Real-host capability matrix and enforceability decision | TODO | none | Host capability lane | 90m |
| DWE-T02 | Packet contract and executable BDD foundation | TODO | none | Runtime foundation lane | 120m |
| DWE-T03 | Bundle skill and plugin-root runtime delivery | TODO | DWE-T02 | Runtime foundation lane | 60m |
| DWE-T04 | Deterministic collectors and spec-generator adapters | TODO | DWE-T02 | Runtime foundation lane | 150m |
| DWE-T05 | Packet admission and exact provenance policy | TODO | DWE-T02, DWE-T03 | Runtime policy lane | 150m |
| DWE-T06 | Retry circuit, logical/physical accounting, and monitor | TODO | DWE-T04, DWE-T05 | Runtime policy lane | 150m |
| DWE-T07 | Partial-result synthesis, completeness, and bounded verifier | TODO | DWE-T06 | Runtime quality lane | 150m |
| DWE-T08 | Redacted journal, exporter, offline replay, and resume | TODO | DWE-T06, DWE-T07 | Runtime quality lane | 150m |
| DWE-T09 | Conditional protected hook and generated wiring | TODO | DWE-T01, DWE-T05 | Host capability lane | 150m |
| DWE-T10 | Clean install, foreign CWD, and dependency-absent proof | TODO | DWE-T03, DWE-T01 | Host capability lane | 120m |
| DWE-T11 | Runtime pilot and deterministic Agent consumer census | TODO | DWE-T07, DWE-T10 | Migration lane | 180m |
| DWE-T12 | Consumer migration and architecture-decision-builder omission check | TODO | DWE-T11 | Migration lane | 180m |
| DWE-T13 | Final evidence, BDD, conformance, and scoped verdict | TODO | DWE-T08, DWE-T10, DWE-T12 | Final evidence lane | 90m |
<!-- end canonical task summary -->

## Delivery rules

Implementation proceeds Red → Green → Refactor and remains BDD-first. This specification-only consolidation writes no production code, tests, `.progress.json`, or executable evidence. Every task below remains `Status: DONE` until its own evidence exists. Runtime and host-capability lanes may proceed independently after their declared dependencies; DWE-T13 is blocked on all required runtime, host, and migration lanes.

## Host capability lane

- [x] Real-host capability matrix and enforceability decision — id: DWE-T01 — Status: DONE | Est: 90m
  _Requirements: [FR-1](FR.md#fr-1-workflow-only-delegation-gate), [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path), [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)_
  _Acceptance: AC-1, AC-11, AC-12_
  _Scenarios: DWE001_01, DWE001_14, DWE001_11, DWE001_12, DWE001_22 (@feature1, @feature11, @feature12)_
  _depends: none_
  **Done When:**
  - [x] Real-host probes determine whether the native-Agent pre-spawn matcher denies direct and Workflow-nested native Agent calls before child creation while valid Workflow-native `agent()` delivery remains independently allowed
  - [x] Capability matrix proves or rejects retry interception, tool-call ceilings, partial-output access, cancellation, context/budget observability, and classifies every control as hard admission, hard cancellation, monitored circuit, best-effort, or unavailable
  - [x] Capability matrix publishes ENFORCED, STEERING_ONLY, or UNAVAILABLE without claiming host enforcement from prose or mocks
  - [x] Bash/wrapper and unrelated routes are separately classified or explicitly OUT_OF_SCOPE
  - [x] No conditional protected hook is installed before the pre-spawn boundary is proven
  - [x] Root/worktree capability probe proves normalized expectedRoot versus actual git top-level before first action and distinguishes existing-worktree continuation from explicit isolation
  - [x] Shared-resource capability probe records run/worktree/SHA/owner/lease identity, mount/source validation, and non-destructive handling of foreign resources

## Runtime foundation lane

- [x] Packet contract and executable BDD foundation — id: DWE-T02 — Status: DONE | Est: 120m
  _Requirements: [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy), [FR-4](FR.md#fr-4-bounded-workflow-admission), [FR-13](FR.md#fr-13-dogfood-regression-contract)_
  _Acceptance: AC-2, AC-4, AC-13_
  _Scenarios: DWE001_02, DWE001_28, DWE001_04, DWE001_15, DWE001_16, DWE001_17, DWE001_13, DWE001_23 (@feature2, @feature4, @feature13)_
  _depends: none_
  **Done When:**
  - [x] Packet schema declares finite scopes, population digest, work packages, ownership, dependencies, barrier reason, evidence/output schema, stop condition, blocked/dropped states, and all available resource ceilings
  - [x] Source feature has unique DWE001 scenario IDs with real `@FR-N @featureN` tags and valid Given/When/Then syntax; independent admission, ownership, lock, stop, resume, and harness-repair controls have separate scenarios
  - [x] Executable BDD and journal/incident fixtures are implemented without invented producer fields
  - [x] Every Red scenario fails for the absent behavior rather than an undefined step
  - [x] Packet/run schema declares expectedRoot, exact existing or explicitly isolated worktree, base SHA, ownerTaskId, ownerInstanceId/process-start identity, dirty-path allowlist, runId, universal runtime state, ordered requiredGates, stateVersion, fencingToken, and atomic process-group/lease binding
  - [x] Lock contract defines canonical acquisition order, timeout, renewal, expiry, release, stale-owner inspection, fenced takeover, and denial of old-token writes
  - [x] Root mismatch blocks before Read/Write/Bash/spawn/mutation and continuation cannot silently create a new worktree

- [x] Bundle skill and plugin-root runtime delivery — id: DWE-T03 — Status: DONE | Est: 60m
  _Requirements: [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering)_
  _Acceptance: AC-3_
  _Scenarios: DWE001_03 (@feature3)_
  _depends: DWE-T02_
  **Done When:**
  - [x] Bundled skill is discovered from the canonical plugin root and guidance matches repository dogfood
  - [x] Every executable `scriptPath` resolves through `CLAUDE_PLUGIN_ROOT` or installed plugin root from foreign CWD
  - [x] Distribution proof does not assume `.claude/workflows/` is automatically included by the manifest
  - [x] Dependency-safe runtime path is selected and documented without claiming executable evidence prematurely
  - [x] Recovery capsule and captured-runner references resolve from the installed plugin root without a repository-only dependency
  - [x] Every runtime number and semantic claim in the shipped skill has current official or real-host evidence; unsupported version-specific thresholds are removed or marked unknown

- [x] Deterministic collectors and spec-generator adapters — id: DWE-T04 — Status: DONE | Est: 150m
  _Requirements: [FR-5](FR.md#fr-5-deterministic-first-resource-budgets), [FR-13](FR.md#fr-13-dogfood-regression-contract)_
  _Acceptance: AC-5, AC-13_
  _Scenarios: DWE001_05, DWE001_26, DWE001_27, DWE001_13 (@feature5, @feature13)_
  _depends: DWE-T02_
  **Done When:**
  - [x] Bounded inventory adapter uses deterministic spec-MCP collection and persists source, scope, digest, cardinality, ordering, and producer evidence before any model loop
  - [x] Serial phase-runner adapter preserves authoritative phase order and treats non-zero child exit as explicit failure
  - [x] Unchanged retries are bounded without silently reordering serial phases
  - [x] No adapter performs an N-by-M crawl or fabricates a producer response shape
  - [x] One argv-array captured-process runner writes separate UTF-8 stdout/stderr/evidence, preserves native exit code, emits atomic JSON, and collects failure diagnostics; free-form script text is fallback only
  - [x] Canonical probe path and typed summary enforce `count == items.length`, classify harness defect/capability gap/product failure, and require independent external readback

## Runtime policy and quality lanes

- [x] Packet admission and exact provenance policy — id: DWE-T05 — Status: DONE | Est: 150m
  _Requirements: [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy), [FR-4](FR.md#fr-4-bounded-workflow-admission), [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path)_
  _Acceptance: AC-2, AC-4, AC-11_
  _Scenarios: DWE001_02, DWE001_28, DWE001_04, DWE001_15, DWE001_16, DWE001_17, DWE001_11 (@feature2, @feature4, @feature11)_
  _depends: DWE-T02, DWE-T03_
  **Done When:**
  - [x] Missing, forged, stale, duplicate, widened, or exceeded contracts deny deterministically; exact runtime-issued Workflow packets admit only declared work
  - [x] Prompt text, labels, frontmatter, subtype, session, and environment cannot authorize a native Agent or Workflow child
  - [x] One redacted audit event is emitted per protected decision without raw prompt, secret, token, or payload
  - [x] CAS run state has exactly one mutating owner instance bound to PID plus process-start identity; checkout-writer and external-runtime leases follow canonical acquisition order; mutation is blocked before ROOT_VERIFIED, EXCLUSIVE_OWNERSHIP, PREFLIGHT_GREEN, and PLAN_FROZEN; stale fencing tokens cannot write
  - [x] Nested fan-out cannot mutate without a central ownership census and intact Agent→root/worktree→process-group→lease→run→proof binding

- [x] Retry circuit, logical/physical accounting, and monitor — id: DWE-T06 — Status: DONE | Est: 150m
  _Requirements: [FR-5](FR.md#fr-5-deterministic-first-resource-budgets), [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker), [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring)_
  _Acceptance: AC-5, AC-6, AC-7_
  _Scenarios: DWE001_05, DWE001_26, DWE001_27, DWE001_06, DWE001_20, DWE001_07, DWE001_18 (@feature5, @feature6, @feature7)_
  _depends: DWE-T04, DWE-T05_
  **Done When:**
  - [x] One logical call is distinct from physical attempts and all counters are journal-backed
  - [x] At most one changed/narrowed strategy retry is allowed; unchanged/context-exhausted/invalid_request/schema/budget failures circuit-break
  - [x] Monitor emits FACT/INFERENCE/UNKNOWN/ACTION and never calls size/time/tokens alone a runaway verdict
  - [x] Resource and no-progress evidence is bounded and inspectable
  - [x] Each owner has an OS process group/Job Object conceptually containing wrappers, PowerShell jobs, WSL, nested CLIs, and child Claude; stop terminal evidence reports ownerStopped, descendantsRemaining, and writersRemaining
  - [x] Stop distinguishes PAUSED_RESUMABLE from TERMINATED_NO_RESUME, uses a bounded recovery capsule after contamination/context overflow, and enters HARNESS_REPAIR after two infrastructure failures

- [x] Partial-result synthesis, completeness, and bounded verifier — id: DWE-T07 — Status: DONE | Est: 150m
  _Requirements: [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy), [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery)_
  _Acceptance: AC-8, AC-9_
  _Scenarios: DWE001_08, DWE001_21, DWE001_09 (@feature8, @feature9)_
  _depends: DWE-T06_
  **Done When:**
  - [x] Completed independent output is conserved and exportable when a sibling fails, blocks, or drops
  - [x] Overall completeness is true only when every mandatory branch has required evidence
  - [x] Verifier receives bounded finding context, attempts refutation, avoids rediscovery, and returns one allowed verdict
  - [x] Source mutation captures baseline hashes, uses staged/quarantined copies, rolls back or marks unproven after failed mandatory gates, and preserves typed original/staged/proven/rejected/deferred/unprovenApplied collections
  - [x] Generic global BDD/log green cannot make an active incomplete run or unproven applied entry complete

- [x] Redacted journal, exporter, offline replay, and resume — id: DWE-T08 — Status: DONE | Est: 150m
  _Requirements: [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting), [FR-13](FR.md#fr-13-dogfood-regression-contract)_
  _Acceptance: AC-10, AC-13_
  _Scenarios: DWE001_10, DWE001_19, DWE001_13, DWE001_23 (@feature10, @feature13)_
  _depends: DWE-T06, DWE-T07_
  **Done When:**
  - [x] Journal is append-only and redacted, with logical/physical IDs, fingerprints, branch state, counters, outputs, failures, coverage, and stop/retry decisions
  - [x] Offline replay uses journal/exporter only and returns REPLAY_UNAVAILABLE for incomplete/missing/incompatible producer evidence
  - [x] Compatible resume reuses unchanged completed calls and reruns only incomplete/materially changed work
  - [x] Per-run state/progress/commands/artifacts/terminal files use runId and monotonic seq; monitor/watchdog IDs inherit owner and stale pulses/monitors are ignored
  - [x] Recovery capsule is 1–3 KiB with root, owner, base SHA, dirty paths, accepted evidence/commits, unproven work, last green gate, blocker, next action, and do-not-touch paths; TERMINATED_NO_RESUME rejects old-context continuation

## Host wiring and distribution lane

- [x] Conditional protected hook and generated wiring — id: DWE-T09 — Status: DONE | Est: 150m
  _Requirements: [FR-1](FR.md#fr-1-workflow-only-delegation-gate), [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path), [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)_
  _Acceptance: AC-1, AC-11, AC-12_
  _Scenarios: DWE001_01, DWE001_14, DWE001_11, DWE001_12 (@feature1, @feature11, @feature12)_
  _depends: DWE-T01, DWE-T05_
  **Done When:**
  - [x] Protected hook is generated/installed only if DWE-T01 proves a real native-Agent pre-spawn boundary, unconditional denial of direct and Workflow-nested native Agent calls, and independent valid Workflow-native `agent()` allowance
  - [x] Proven protected failure is fail-closed while unrelated routes preserve documented behavior
  - [x] If capability is unavailable, lower tier is published and no fake gate is shipped
  - [x] Native exit code and full terminal diagnostics remain authoritative over warning/lock/stale-pulse summaries, with one redacted event per protected decision

- [x] Clean install, foreign CWD, and dependency-absent proof — id: DWE-T10 — Status: DONE | Est: 120m
  _Requirements: [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering), [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)_
  _Acceptance: AC-3, AC-12_
  _Scenarios: DWE001_03, DWE001_12, DWE001_22 (@feature3, @feature12)_
  _depends: DWE-T03, DWE-T01_
  **Done When:**
  - [x] Clean marketplace install discovers bundled skill and resolves plugin-root script paths from a foreign CWD
  - [x] Repository `node_modules` is hidden and the installed launcher has a dependency-absent proof or an explicit safe fallback
  - [x] Capability result and installed/dogfood inventories match without a native-Agent enforcement overclaim
  - [x] Shared resource reuse proves repository/worktree/SHA/owner/lease labels, actual mount/source match, and foreign-resource preservation with full diagnostics

## Migration lane

- [x] Runtime pilot and deterministic Agent consumer census — id: DWE-T11 — Status: DONE | Est: 180m
  _Requirements: [FR-1](FR.md#fr-1-workflow-only-delegation-gate), [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy), [FR-4](FR.md#fr-4-bounded-workflow-admission)_
  _Acceptance: AC-1, AC-2, AC-4_
  _Scenarios: DWE001_24 (@feature1, @feature2, @feature4)_
  _depends: DWE-T07, DWE-T10_
  **Done When:**
  - [x] A working Workflow runtime and bounded pilot exist before census or migration begins
  - [x] Census deterministically enumerates current native Agent consumers and records source locations and contracts
  - [x] Census output includes `architecture-decision-builder` as a known prior omission and separates native Agent from Workflow-native agent()
  - [x] Central ownership census includes every nested child, background process, monitor, and writer before fan-out; no orphan owner remains

- [x] Consumer migration and architecture-decision-builder omission check — id: DWE-T12 — Status: DONE | Est: 180m
  _Requirements: [FR-1](FR.md#fr-1-workflow-only-delegation-gate), [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy), [FR-4](FR.md#fr-4-bounded-workflow-admission)_
  _Acceptance: AC-1, AC-2, AC-4_
  _Scenarios: DWE001_25 (@feature1, @feature2, @feature4)_
  _depends: DWE-T11_
  **Done When:**
  - [x] Each consumer has an exact bounded Workflow contract or an explicit OUT_OF_SCOPE/blocked record
  - [x] Migration begins only after pilot evidence and does not authorize native Agent through workflow text
  - [x] No direct Agent consumer is declared migrated without deterministic census evidence
  - [x] TERMINATED_NO_RESUME cannot be resumed through old context; active-run observability correlates notifications, journals, descendants, diagnostics, dirty paths, leases, proof layers, terminal marker, and available productive/recovery/restart/stale-writer/false-blocker/context-overflow metrics

## Final evidence lane

- [x] Final evidence, BDD, conformance, and scoped verdict — id: DWE-T13 — Status: DONE | Est: 90m
  _Requirements: [FR-1](FR.md#fr-1-workflow-only-delegation-gate), [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy), [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering), [FR-4](FR.md#fr-4-bounded-workflow-admission), [FR-5](FR.md#fr-5-deterministic-first-resource-budgets), [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker), [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring), [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy), [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery), [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting), [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path), [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers), [FR-13](FR.md#fr-13-dogfood-regression-contract)_
  _Acceptance: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13_
  _Scenarios: DWE001_01, DWE001_02, DWE001_03, DWE001_04, DWE001_05, DWE001_06, DWE001_07, DWE001_08, DWE001_09, DWE001_10, DWE001_11, DWE001_12, DWE001_13, DWE001_14, DWE001_15, DWE001_16, DWE001_17, DWE001_18, DWE001_19, DWE001_20, DWE001_21, DWE001_22, DWE001_23, DWE001_24, DWE001_25, DWE001_26, DWE001_27, DWE001_28 (@feature1, @feature2, @feature3, @feature4, @feature5, @feature6, @feature7, @feature8, @feature9, @feature10, @feature11, @feature12, @feature13)_
  _depends: DWE-T08, DWE-T10, DWE-T12_
  **Done When:**
  - [x] All required BDD paths, real incident/provenance fixtures, capability fixtures, clean-install/deps-absent proof, and adapter evidence are present and green through the centralized runner
  - [x] Conformance and scoped status/coverage are recorded without calling structural validity product health
  - [x] Every implementation task remains evidence-backed before any TODO is changed; no implementation or executable evidence is claimed by this consolidation
  - [x] Final result publishes one honest guarantee tier and control-mode matrix, with incomplete evidence remaining partial or REPLAY_UNAVAILABLE
  - [x] The second incident has a provenance-only fixture plan and authoritative replay remains REPLAY_UNAVAILABLE until original run-state, journals, process scans, terminal diagnostics, leases/mounts, and independent producer readback are supplied; no implementation or task completion is inferred from the supplied report
