# Spec Review: dynamic-workflow-engineering

**Reviewed:** 2026-08-02
**Scope:** consolidated Dynamic Workflow authoring after contract, scenario, task-trace, and fixture-provenance corrections
**Authoring verdict:** **PASS**
**Product readiness:** **NOT_READY / TESTS_NOT_RUN**

## Current evidence snapshot

| Surface | Current fact |
|---|---|
| Functional requirements | 13 |
| Acceptance criteria | 13 |
| Source BDD scenarios | 28, all `@pending` and not run |
| Tasks | 13, all author-declared `TODO` |
| Phase-1 MCP conformance findings | 0 |
| Authoritative readiness trace warnings | 13 `UNVERIFIED_FR`, because all requirements are intentionally unexecuted |
| Executable BDD evidence | 0 |
| Production implementation evidence | 0 |
| First local incident replay | unavailable until producer records are reconciled |
| Second user-supplied incident replay | `REPLAY_UNAVAILABLE` |

The graph is structurally coherent, but structural coherence is not product health. The runtime, hook, adapters, exporter, process ownership, install parity, consumer migration, and real-host proof are still unimplemented.

## Prior blocker disposition

| Prior finding | Disposition | Current contract |
|---|---|---|
| Native Agent and Workflow-native `agent()` were mixed | **CLOSED in authoring** | They are separate subjects. Caller-controlled provenance never authorizes native Agent. A protected native-Agent boundary may ship only after direct and Workflow-nested deny-before-spawn are proven; valid Workflow-native delivery has its own bounded admission. |
| Limits were called hard without a host control | **CLOSED in authoring** | Every ceiling is classified as hard admission, hard cancellation, monitored circuit, best-effort, or unavailable. Post-event observation is not enforcement; unavailable required guarantees cause rejection or explicit downgrade. |
| Native-Agent consumer list was hand-written and incomplete | **CLOSED in authoring** | A deterministic census and a separate migration scenario own discovery and disposition; `architecture-decision-builder` is an explicit prior omission. |
| Host claims exceeded evidence | **CLOSED in authoring** | The hard gate is an architecture candidate until the real-host matrix proves it. Published tier is exactly `ENFORCED`, `STEERING_ONLY`, or `UNAVAILABLE`. |
| Unsupported numeric workflow thresholds | **CLOSED in authoring** | The preserved skill no longer hard-codes unsupported version-specific thresholds. |
| Task summary and body IDs disagreed | **CLOSED in authoring** | Summary and task blocks use `DWE-T01` through `DWE-T13`. |
| Source scenarios bundled too many independent controls | **CLOSED in authoring** | The source feature now has 28 bounded scenarios, including separate branches for pre-spawn denial, provenance forgery, root mismatch, fenced ownership, stale takeover, ceilings, captured processes, process-tree stop, unsafe resume, harness repair, transactional mutation, resources, incident provenance, census, and migration. |
| Task-to-scenario ownership used ranges or broad proxies | **CLOSED in authoring** | Every task names concrete scenario IDs; the final evidence task lists all 28 IDs explicitly. |
| Incident fixtures could be mistaken for hand-authored positive evidence | **CLOSED in authoring** | First-incident journals are only planned producer-derived exports and return `REPLAY_UNAVAILABLE` when records are missing. The second postmortem is provenance-only and cannot close implementation. |

## Open execution gates

These are not authoring defects; they are the implementation work that keeps the feature not ready:

1. Prove or reject the native-Agent pre-spawn boundary on the real installed host, including a direct call, a nested call from a Workflow worker, and independent valid Workflow-native delivery.
2. Implement bounded packet admission, universal run states, compare-and-swap transitions, process-start identity, fencing tokens, checkout-writer lock, external-runtime lease, renewal/expiry/release, stale-owner inspection, and old-token denial.
3. Implement deterministic collectors, the serial phase adapter with non-zero exit propagation, typed captured-process execution, and independent producer readback.
4. Implement retry accounting, process-tree cancellation, per-run monitoring, partial-result conservation, transactional mutation, redacted journal, offline replay, and safe resume.
5. Build producer-derived first-incident fixtures; keep positive replay unavailable until reconciliation succeeds.
6. Implement executable BDD twins against real runtime paths and run them only through the centralized Docker path.
7. Prove clean install, foreign working directory, dependency absence, consumer census/migration, and distribution parity.
8. Publish one evidence-backed guarantee tier. Never publish `ENFORCED` from prose, source-only scenarios, mocks, or adjacent-project evidence.

## Evidence boundaries

- The second postmortem at `E:\Note from ChatGPT.txt` is useful requirements input, not a local producer journal.
- Adjacent-project commits, tests, model names, container names, and reported results are not dev-pomogator implementation evidence.
- All source scenarios remain unexecuted; `@pending` is an authoring marker, not a passed test.
- Coverage currently reports 28 not-run scenarios and all 13 requirements not execution-verified. The authoritative readiness check therefore keeps traceability/execution red even though the Phase-1 MCP conformance query returns no structural findings.
- All task checkboxes remain open. The coverage view may label graph-linked open tasks `IN_PROGRESS`; that is a computed non-DONE rollup, not an author-declared task status transition.

## Final review conclusion

The one canonical specification is ready to enter implementation. The Dynamic Workflow product itself is not ready. The next action is the real-host capability and bounded-runtime foundation work, followed by executable integration-first BDD and authoritative replay/install evidence.
