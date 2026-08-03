# Spec Generator v4: verification-bearing generated tasks

**Date:** 2026-08-03  
**Incident baseline:** merge `9a7cc8275fcf23bde9e90bd9a5e78c7a0171c12e` / PR #220  
**Report branch:** `fix/remaining-manual-audit-defects` @ `d0ebb8f43e5aa6512aa83c6d44a88997a57f7e70` (re-provenanced 2026-08-03; an earlier draft of this report named the historical working branch `fix/manual-audit-bypasses`, which was superseded by this branch)  
**Purpose:** explain why green CI/BDD did not prove the task-planning feature worked, classify the reported bypasses, compare solution options, and record the selected spec change.

## Executive conclusion

The failure was not simply “weak tests.” The product contract let one broad signal — a green suite — stand in for several different truths:

1. the generated task is structurally valid;
2. its negative and edge cases are actually challenged;
3. the real consumer/runtime or shipped artifact works;
4. evidence is fresh and bound to the current task, graph, commit, commands, and artifacts;
5. someone independent of the implementing worker tried to refute the result;
6. all required proof lanes, not merely one lane, passed.

PR #220 could therefore merge with 1977 passing scenarios while concrete bypasses remained. The correct producer-level fix is a **verification-bearing generated-task contract** plus a **fresh independent verifier attestation**. CI/full BDD remains required, but becomes insufficient by itself.

## What happened

The session first treated these facts as equivalent:

```text
CI green + full Docker BDD green + PR merged
        ≈
feature works + task plan trustworthy + safe to declare DONE
```

A later source/runtime audit showed they are not equivalent. The tests primarily established that authored scenarios passed. They did not mechanically prove completeness of the expected evidence set, integrity after persistence, atomicity under concurrent writers, real installed/runtime behavior for every relevant surface, or resistance to targeted mutations.

The authoritative spec status independently agrees that the feature cannot be called complete. Verdict provenance: `audit-out/manual-audit-spec-generator-verdict.txt` (spec-verdict run captured during this audit) reports `VERDICT: NOT_READY — 45 blocking finding(s)` with EXECUTION RED (10 stale / 1 failed / 2 pending), TASK_TRUTH RED (45 DONE-but-unverified tasks), and 13 canonical not-run scenarios in `spec-generator-v4.feature`. An earlier draft of this report quoted 207 blockers / 17 not-run from a superseded pre-merge status payload; those numbers are historical, not current.

Post-remediation regeneration (after the Phase 49 fixes and the 1995/1995 full Docker run `run-1785784295477-full`): `audit-out/post-wp10-spec-generator-verdict.txt` reports canonical coverage 639 passed / 13 not-run (pre-existing FR-63 readiness fixtures), TASK_TRUTH GREEN (0 DONE-but-unverified), TRACEABILITY GREEN, BDD_SYNC GREEN. Remaining blocking lanes are by-design open: LIVE_EVIDENCE RED (SPECGEN004_668/669 require real Cursor producer proof, never suite-satisfiable) and one pre-existing `ACCEPTANCE_DELIVERY_COVERAGE` debt item on AC-63.4. Guard self-challenge evidence: neutralizing the symlink-containment check, the two-sided completeness loop, or the invalid-task scheduling guard one at a time turned SPECGEN004_689, SPECGEN004_690, and the feature79 batch RED in Docker (`audit-out/wp10-mutation1-containment-red.out`, `wp10-mutation2-two-sided-red.out`, `wp10-mutation3-invalid-guard-red.out`); restoring the guards returned the focused batch to green. The `wp10-self-challenge-result.txt` labels read "NOT RED" because the checker script parsed cucumber's failure summary in the wrong word order — the raw logs above are the evidence.

## Baseline defect classification

The table evaluates merge baseline `9a7cc827`, not the concurrent dirty fixes that appeared later in the working tree.

| Reported issue | Baseline verdict | Evidence and failure scenario |
|---|---|---|
| Incomplete live-evidence accepted | **Confirmed** | `tools/live-evidence/validator.mjs:124-153` validates only records that are present. It never iterates over every key in `expectedScenarios` to demand a record. Input: expected `{A: PASSED, B: PASSED}`, manifest contains valid `A` only → no missing-`B` error. |
| Producer identity/version can be substituted | **Partly confirmed** | Version is tied to `manifest.producer.version` at `tools/live-evidence/validator.mjs:136`, and a producer marker is checked around `:110`. But the event producer identity is only required to exist by profile assertions; it is not bound to the manifest producer identity/version tuple. |
| `trace_event` is not bound to the event actually found | **Confirmed** | `tools/live-evidence/validator.mjs:142` checks only that `record.trace_event` is truthy. Actual trace matching at `:145-150` independently searches by scenario/profile and never compares the located event to `record.trace_event`. |
| Workspace digest is only format-checked | **Confirmed** | `tools/live-evidence/validator.mjs:122` validates 64-hex form. Records are compared back to the same manifest value at `:135`, but the digest is not recomputed from a declared workspace file set during validation. |
| Environment SHA can replace actual HEAD | **Confirmed** | `tools/live-evidence/validator.mjs:57-65` returns any valid `DEV_POMOGATOR_GIT_SHA` without also comparing it to `git rev-parse HEAD`. The later manifest check therefore compares against the override, not necessarily the checkout. |
| Persisted evidence can resurrect completion | **Confirmed at merge; dirty-tree fix exists** | Baseline `restoreTaskEvidence` at `tools/spec-graph/task-evidence.ts:446-451` passed persisted records directly into the snapshot; `taskCompletionDecision` trusted persisted `eligibleForCompletion` at `:454-464`. The dirty tree now canonicalizes and re-derives eligibility, but that was not in merge `9a7cc827`. |
| Discovery proposal approval/digest can be tampered | **Confirmed at merge; dirty-tree fix exists** | Baseline `applyDiscoveryProposal` at `tools/spec-graph/task-discovery.ts:419-438` trusted the supplied digest and state. The dirty tree now recomputes both before apply. |
| Invalid canonical task can remain queryable/ready | **Confirmed** | `tools/spec-graph/task-plan-integration.ts:430-469` collects normalization diagnostics but still pushes `result.task`; `buildTaskPlanState` discards the diagnostics. Mutation paths reject errors, but initial/query state can still schedule the normalized record without carrying its invalidity. |
| Stale evidence does not block plan completion/readiness | **Confirmed at merge; dirty-tree fix exists** | Baseline plan scheduling ignored evidence; query only displayed stale evidence as a report around `tools/spec-graph/task-plan-integration.ts:769-793`. The dirty tree now feeds selected evidence into scheduling and adds a stale diagnostic. |
| Successful patch loses explicit conflicts | **Confirmed at merge; dirty-tree fix exists** | Baseline `applyTaskPlanPatch` rebuilt state without `conflicts` at `tools/spec-graph/task-plan-integration.ts:889-894`. The dirty tree now carries `state.conflicts`. |
| Revision check is not atomic with persistence | **Confirmed** | `tools/spec-graph/task-plan-integration.ts:880-905` compares `expectedRevision` in memory, then invokes a generic persistence callback. There is no storage-level compare-and-swap transaction tying the observed revision to the write. Two processes can both pass against revision N and write N+1. |
| Empty RED/GREEN/REFACTOR text is accepted | **Confirmed** | `tools/spec-graph/task-synthesis.ts:454-473` trims supplied text; review at `:671-710` checks phase order/edges and estimates, but not non-empty executable text for each phase. |
| Dependency can target a nonexistent task | **Confirmed** | `tools/spec-graph/task-synthesis.ts:593-598` normalizes dependency IDs. Synthesis review checks causal BDD edges, but does not prove every task dependency target exists in the synthesized task set. |
| Supplied FR/AC registries are not authoritative validation inputs | **Confirmed** | `SynthesisInput` exposes optional registries at `tools/spec-graph/task-synthesis.ts:138-144`, but lane synthesis/review conserves lane ownership without validating referenced FR/AC IDs against those registries. |
| Detached claude-mem spawn can violate fail-open | **Confirmed at merge; fixed on this branch** | At baseline `9a7cc827`, `tools/claude-mem-bootstrap/install-claude-mem.ts:305-311` called detached `spawn()` and `unref()` without an `error` listener; current branch adds the error handler. The install lock remains check-then-write (backoff stamp, not a safety gate) and is tracked as residual. |
| Codex unavailable can still yield overall pass | **Confirmed at merge; fixed on this branch** | At baseline, unavailable `codex plugin --help` became warning/skipped work at `tools/codex-plugin-support/verify-whitelist.ts:353-370`. Current branch fails those checks (`addFailedCodexInstallChecks`) and exits non-zero. |
| Codex path containment uses unsafe string prefix | **Confirmed at merge; fixed on this branch** | At baseline, `installedPath.startsWith(codexHome)` accepted sibling prefixes. Current branch uses realpath containment (`tools/codex-plugin-support/path-containment.ts:4`). |
| Production Codex harness honors a test-only env override | **Found in post-merge review** | `DEV_POMOGATOR_CODEX_PROBE` in `runCodex()` let any Node script impersonate Codex in production verification; the override is removed and deterministic substitution moves to a test-layer PATH shim. |
| Live-evidence validator follows symlinks outside the repository | **Found in post-merge review** | Lexical path containment accepted in-repo symlinks whose targets live outside; canonical realpath containment now rejects them fail-closed. |

### Important correction to the post-hoc audit

Some broad claims in the audit were too imprecise. Existing code already rejects duplicate evidence, unknown selected task IDs, blocked tasks in executable batches, unsafe pairwise batches, and a plain `DONE` outcome without a passed command-bearing evidence object. Those checks are useful, but they do not refute the confirmed bypasses above because the missing guarantee is the **composition of all required proof lanes**, not the absence of every individual guard.

## Why the existing tests missed this

### 1. Scenario success was mistaken for proof completeness

The validator tests exercised supplied records, but did not assert the collection invariant:

```text
set(actual scenario/profile evidence keys)
  ==
set(required scenario/profile keys)
```

Per-record assertions cannot detect a missing record.

### 2. Round-trip tests preserved data rather than distrusting it

A persistence test can prove byte-equivalent restoration while preserving forged `eligibleForCompletion: true`. Restoration needs validation semantics, not only serialization symmetry.

### 3. “Atomic” tests were single-process

Dry-run and all-or-nothing object mutation are not the same as storage-level concurrent compare-and-swap. The missing test needs two writers racing on the same persisted revision.

### 4. BDD drove source helpers more often than the final consumer artifact

A source import or helper call cannot prove an installed bundle, detached process, MCP transport, filesystem lock, or CLI plugin path behaves correctly.

### 5. Tests proved a behavior, not that they would fail if it broke

The suite lacked enough mutation/self-challenge evidence. A strong task must name the relevant mutant or perturbation and prove the task’s verification turns red under it.

### 6. The same worker remained the authority

The implementing agent ran tests, interpreted them, declared completion, merged, and cleaned up. No independent verifier was mechanically required before DONE.

## Solution options

| Option | Contract | Cost | Strength | Main limitation |
|---|---|---:|---|---|
| **A. Stronger generated checklist** | Expand `Done When` with runtime, negative, mutation, and audit commands | Low | Medium-low | Still prose; worker can skip, mis-run, or self-interpret proof. |
| **B. Typed proof bundle + independent attestation** | Add canonical `verification/v1`; worker records evidence, fresh verifier re-runs challenges, integration owner derives DONE | Medium | **High** | Requires new schema, attestation, runner integration, and migration. |
| **C. Separate verifier task node** | Generate a hard-dependent verifier sibling for every implementation task | High | Very high/process-visible | Doubles task graph noise, dependencies, scheduling, and migration overhead. |

## Recommendation: Option B

Use a typed proof bundle as the data foundation and require a fresh independent verifier attestation.

This is the smallest design that closes the actual authority gap without creating a second task graph. It reuses the current canonical task, evidence, staleness, planner, and lifecycle layers:

- task contract extension points: `tools/spec-graph/task-contract.ts:75-100`, `:321`, `:459`, `:548`;
- synthesis and pre-planning review: `tools/spec-graph/task-synthesis.ts:713`, `:746`, `:808`, `:864`;
- evidence admission and completion: `tools/spec-graph/task-evidence.ts:258`, `:263`, `:302`, `:493`;
- lifecycle shortcut that is currently too weak: `tools/spec-graph/task-synthesis.ts:924-947`;
- plan admission/apply: `tools/spec-graph/task-plan-integration.ts:843-905`.

### Proposed `verification/v1` minimum

```text
identity
  contractId, digest, taskId, FR/AC/scenario IDs, graphRevision, taskFingerprint

runtime challenge
  consumer kind, entrypoint/artifact, argv or runner identity, fixture provenance,
  expected observations, forbidden observations

adversarial challenge
  negative cases, boundary cases, expected errors, side-effect invariants

strength challenge
  mutation target/spec, required kill threshold or explicit self-challenge policy,
  survivor limit and review policy

evidence policy
  required proof kinds, freshness, full-vs-filtered scope, evidence sink/artifacts

independence
  worker identity, verifier identity, same-worker=false, attestation digest

budgets
  command/tool/write/time limits and explicit stop conditions
```

### Completion rule

```text
DONE =
  full required suite evidence passes
  AND real-consumer runtime proof passes
  AND every required adversarial case passes
  AND mutation/self-challenge policy is satisfied
  AND independent verifier attestation matches exact fingerprints/digests
  AND evidence is current, owned, unfiltered where required, and non-stale
```

Any missing operand yields non-DONE with diagnostics and follow-up proposals.

## Bounded execution workflow

1. **Synthesis gate**
   - Generate `verification/v1` from FR/AC/BDD/design/repository surfaces.
   - Reject missing runtime target, expected observation, negative case, strength policy, ownership, or fingerprint.

2. **Worker**
   - Own exact implementation paths.
   - Run focused RED → GREEN → REFACTOR and ordinary suite checks.
   - Record evidence, but cannot set completion eligibility.
   - Stop at `NEEDS_CONTEXT`/`BLOCKED` if any proof obligation is unavailable.

3. **Fresh adversarial verifier**
   - Receive immutable task/evidence digests and bounded scope.
   - Start from “claim is false until reproduced.”
   - Drive the real consumer or shipped artifact, execute negative cases, and perform targeted mutation/self-challenge.
   - Emit compact attestation; never edit implementation.

4. **Integration owner**
   - Check all proof kinds and fingerprints.
   - Run broad integration/full suite, smart spec verdict, corpus/task trace checks, and shipped-artifact smoke only at this layer.
   - Derive DONE; workers and verifiers cannot.

5. **Stop conditions**
   - No retry widens scope.
   - Missing/empty/malformed verifier output is `BLOCKED`.
   - A failed runtime or surviving required mutant blocks completion even when CI is green.
   - Every dropped or unavailable scope remains explicit.

## Spec changes recorded

The spec was updated through the MCP mutation door:

- FR-80 now includes the verification-bearing generated-task amendment at `.specs/spec-generator-v4/FR.md:1315`.
- AC-80.11 defines the machine-checkable contract and independent completion gate at `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md:1531`.
- The incident is pinned at `.specs/spec-generator-v4/TASKS.md:2716`.
- Phase 48 is added at `.specs/spec-generator-v4/TASKS.md:2725` with four tasks:
  - `p48-verification-contract-schema`;
  - `p48-independent-verifier-attestation`;
  - `p48-bounded-verification-workflow`;
  - `p48-runtime-mutation-regressions`.

Scenarios were intentionally not fabricated. Phase 48 tasks were created as task-only pins because no real matching step definitions exist yet; the implementation phase must author executable scenarios through the test-author workflow and prove they turn red against planted defects.

## Verification performed for this report

- Read and processed 100% of the oversized status and coverage payloads.
- Compared merge baseline source with the concurrent dirty working tree.
- Ran spec conformance for `spec-generator-v4`: zero error findings.
- Ran acceptance-delivery coverage: no findings in the analyzer’s currently supported high-risk claim classes.
- Ran reality check: the old spec still has substantial historical FILE_CHANGES drift; therefore this report does **not** call the whole spec clean.
- Ran `git diff --check`: passed; only an LF→CRLF warning exists for the concurrently modified bundle.
- Did not run Docker BDD or mutation testing for the new feature because no implementation or Phase 48 executable scenarios exist yet.

## Current state and ownership warning

Analysis started on clean `main` at merge `9a7cc827` and moved through a historical working branch (`fix/manual-audit-bypasses`) into the current branch `fix/remaining-manual-audit-defects` @ `d0ebb8f43e5aa6512aa83c6d44a88997a57f7e70`, which carries the committed fixes for restored evidence, proposal integrity, stale readiness, conflict preservation, live-evidence bindings, and the task-plan bundle. The post-merge review then found five further gaps (symlink escape, fake CAS proof, self-generated evidence, Codex test-only override, missing synthesis branch tests); their remediation is tracked in `C:\Users\stigm\.claude\plans\sprightly-roaming-pond.md` and the spec updates added through the MCP door. This report’s own repository mutations are the FR/AC/incident/Phase-48 spec additions plus this audit file.
