# Fixtures

## Overview

Planned fixtures model policy contracts, trusted and forged invocation envelopes, clean plugin homes, and two producer-derived sanitized views of the first local workflow incident. The second user-supplied postmortem has no producer journal and is represented only by a provenance/missing-artifacts plan plus negative `REPLAY_UNAVAILABLE` cases. Journal fixtures preserve real producer structure and failure signatures but contain no user secrets or raw prompts.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Consumer contract matrix | static | `tests/fixtures/dynamic-workflow-engineering/consumer-contracts.json` | per-feature | policy step definitions |
| F-2 | Finite inventory incident journal | planned producer-derived export | `tests/fixtures/dynamic-workflow-engineering/journals/incident-1.jsonl` | per-feature | monitor step definitions |
| F-3 | Partial useful review journal | planned producer-derived export | `tests/fixtures/dynamic-workflow-engineering/journals/incident-2.jsonl` | per-feature | monitor step definitions |
| F-4 | Clean plugin home | factory | generated temporary directory | per-scenario | install step definitions |

## Fixture Details

### F-1: Consumer contract matrix

- **Type:** static file
- **Format:** JSON
- **Setup:** load valid, expired, forged-origin, forbidden-subtype, duplicate, oversized, and budget-exhausted cases
- **Teardown:** none
- **Dependencies:** none
- **Used by:** @feature1, @feature2, @feature4, @feature5, @feature11
- **Assumptions:** fixture schema equals the policy runtime schema

### F-2: Finite inventory incident journal

- **Type:** planned sanitized export of the first local `wf_0315d03b-28f` incident; not a hand-authored snapshot
- **Format:** NDJSON
- **Setup:** reconcile the local incident JSON with producer journal/transcript records through the future exporter, then copy the sanitized result to a scenario-local path
- **Teardown:** remove the scenario-local copy
- **Dependencies:** first-incident producer journal/transcript, local incident JSON, and exporter
- **Used by:** @feature6, @feature7, @feature8, @feature10, @feature13
- **Assumptions:** exact supplied metrics remain product input until producer provenance is reconciled; missing records produce `REPLAY_UNAVAILABLE`

### F-3: Partial useful review journal

- **Type:** sanitized second view of the first local `wf_0315d03b-28f` producer journal; never derived from the second user-supplied postmortem
- **Format:** NDJSON
- **Setup:** generate from reconciled first-incident producer records, then copy to a scenario-local journal path
- **Teardown:** remove the scenario-local copy
- **Dependencies:** reconciled first-incident producer journal/transcript and exporter
- **Used by:** @feature7, @feature8, @feature9, @feature10, @feature13
- **Assumptions:** includes the first incident's completed GitHub output, exhausted spec branch, physical retries, and missing synthesis input; absent producer records make it `REPLAY_UNAVAILABLE`, not a hand-authored positive fixture

### F-4: Clean plugin home

- **Type:** factory
- **Format:** directory plus environment
- **Setup:** create isolated HOME/config/cache and install the canonical local marketplace plugin
- **Teardown:** stop task-owned processes and remove only the generated home
- **Dependencies:** packaged plugin artifact
- **Used by:** @feature3, @feature11, @feature12
- **Assumptions:** repository node_modules is hidden and assets resolve via CLAUDE_PLUGIN_ROOT

## Dependencies Graph

`F-1 → policy scenarios`

`F-2 + F-3 → monitor, circuit, synthesis, and resume scenarios`

`packaged plugin → F-4 → install and real-host scenarios`

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1-2 | admission and denial | F-1 | real-host native event remains mandatory |
| @feature3 | installed skill and steering | F-4 | none after canonical install passes |
| @feature4-6 | bounds and circuit | F-1, planned F-2 | first-incident producer provenance and executable runtime remain missing |
| @feature7-10 | monitor, partial result, verification, replay/resume | planned F-2, planned F-3 | no positive replay fixture exists until the first incident is reconciled |
| @feature11-12 | fail-closed audit and tier | F-1, F-4 | host capability may yield a lower tier |
| @feature13 | dogfood regression | F-2, F-3 | preserve USER_ASSERTION_ONLY provenance |

## Notes

Fixtures must mirror real policy schema and current workflow journal fields. Hand-authored extra fields cannot serve as positive proof. Before DONE, capture one actual current-runtime journal and compare parsed ground truth independently.

## F-5: Second dogfood provenance-only fixture plan

**Status:** `USER-SUPPLIED / UNVERIFIED_FOR_THIS_REPOSITORY / REPLAY_UNAVAILABLE`

The second dogfood incident is the supplied `E:\Note from ChatGPT.txt` postmortem. It is a failure-class input for requirements and BDD design, not a local producer artifact. No adjacent-project commit, model identifier, container name, self-test count, or reported result is a positive fixture for dev-pomogator.

The future fixture boundary is planned at `tests/fixtures/dynamic-workflow-engineering/second-incident/`. The first planned file is `PROVENANCE.md`; it SHALL enumerate provenance and missing-artifact requirements without fabricating event records. Authoritative replay may begin only when the original run-state, per-run journals, process-group scans, terminal diagnostics, lease/resource labels and mount/source evidence, dirty-worktree/base-SHA evidence, and independent producer readback are supplied and reconciled.

Required replay inputs:

- packet/run identity: expected root, exact worktree mode, base SHA, owner task, dirty-path allowlist, run ID, phase, and proof-layer state;
- process ownership: owner PID, descendant/writer scans, stop state, and terminal evidence;
- single-writer state: CAS transitions, checkout-writer lock, external/shared-runtime lease, and ownership census;
- resource evidence: repository/worktree/SHA/run-owner labels and actual mount/source validation;
- process diagnostics: argv, stdout, stderr, evidence files, native exit code, atomic result JSON, and failure diagnostics;
- mutation/evidence state: baseline hashes, staged/quarantined entries, proof-layer results, and typed result collections;
- observability: per-run state/progress/commands/artifacts/terminal files with monotonic events and monitor/watchdog lifecycle;
- independent producer readback for any external result claim.

Until every mandatory input is available, the fixture may exercise negative provenance and `REPLAY_UNAVAILABLE` behavior only. It SHALL not be used to claim implementation, test, completion, or a green guarantee tier.
