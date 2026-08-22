# Spec Review: migrate-to-omp

**Phase:** Complete — Discovery, Context, Requirements and Finalization STOPs confirmed through the canonical phase door on 2026-08-22.
**Scope:** post-repair review of discovery, requirements, task plan, external OMP contracts, repository reality and semantic FR-to-scenario coverage.

## Summary

| Severity | Count | Verdict |
|---|---:|---|
| P0 | 0 | clear in the specification text |
| P1 | 1 | implementation evidence remains required |
| P2 | 1 | known detector false-positive |

**Document verdict:** COMPLETE_PLAN_WITH_IMPLEMENTATION_DEBT.

**Product verdict:** NOT_READY. This is truthful: the plan has no installed OMP implementation, no executable mirror or bindings, and no canonical result for its twelve scenarios.

## Resolved review findings

- The marketplace topology is one repository-root source: a root OMP catalog and one root extension factory; nested omp-plugin, omp-hooks and omp-tools trees were removed from the plan.
- Hook and tool designs use documented OMP factory, pi.on and pi.registerTool contracts rather than Claude-shaped callback objects.
- MCP planning now uses the real root .mcp.json Node launcher boundary, an installed-plugin discovery probe and collision evidence; it does not claim .claude/mcp.json exists.
- W0 owns bounded rollback before W1. It may remove only disposable fixture/project-scope state and must prove an unrelated sentinel spec remains unchanged.
- FR, AC, UC, feature tags, CHKs, decisions and eleven canonical task blocks are assembled. Structural validation, audit and anchor check are clean; semantic review reports zero FR-to-scenario drifts.

## P1 Finding

| # | Category | Evidence | Required delivery work |
|---|---|---|---|
| 1-1 | Execution / BDD sync | Smart verdict: 12 active source scenarios are NOT_RUN and SOURCE_ONLY; all six FRs are unverified. | Implement W0–W3 tasks, add the declared executable OMP mirror/step definitions/lifecycle, run canonical Docker evidence, then rerun the smart verdict. |

## P2 Finding

| # | Category | Evidence | Disposition |
|---|---|---|---|
| 2-1 | Reality detector false-positive | spec-reality-check flags FR-5 from commits ba948402d104fde2f81d02e2fe5d88158d821425 and dab3a1beb11ad6fc0fad8a8ca70427d5f51b2d40; their subjects concern pinator/spec-generator history, not the OMP rollback delivery. | Treat as a generic bare-FR pickaxe collision; do not claim FR-5 shipped. |

## Evidence

- validate-spec: 18/18 files, 0 errors, 0 warnings.
- audit-spec: 0 findings.
- anchor-integrity check: 0 broken anchors.
- requirements/user-story/task form checks: 0 violations.
- full smart verdict: 0 structural/audit/traceability/conformance errors, semantic drifts 0; overall NOT_READY only for honest unrun and source-only implementation evidence.

## Repair policy

No implementation status was marked DONE. The remaining work is the declared OMP implementation plan, not missing specification content.
