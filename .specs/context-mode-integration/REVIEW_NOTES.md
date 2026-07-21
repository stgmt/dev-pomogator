# Spec Review: context-mode-integration

**Generated:** 2026-07-21
**Updated:** 2026-07-21 after spec completion pass
**Scope:** manual spec-review + spec-reality-check + validate-spec + audit-spec + spec-verdict + MCP graph/status probes.

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 | 0 | Clear |
| P1 | 0 | Clear |
| P2 | 3 | Known implementation/reality notes |
| P3 | 0 | Clear |

**Overall verdict:** READY_FOR_IMPLEMENTATION. The spec is structurally valid, graph-traceable, BDD-sync clean, and aligned with canonical issue #139. It is not a shipped/implemented feature yet: `spec-verdict` correctly remains `OVERALL: NOT_READY` because all 9 scenarios are intentionally not executed until implementation wires the BDD steps and Docker/WSL run evidence.

## Resolved Findings

| # | Previous issue | Resolution |
|---|----------------|------------|
| R-1 | 9 `SOURCE_ONLY` BDD sync findings | `context-mode-integration.feature` scenarios now carry intentional `@wip` pending markers until Phase 0 wires executable BDD. `spec-verdict` now reports `BDD_SYNC: GREEN`. |
| R-2 | `FR_NO_DESIGN:3`, `FR_NO_STORY:4` | `USER_STORIES.md` now has one story block per FR, and `DESIGN.md` has one decision per FR. `spec-verdict` now reports `conformance: 0 error / 0 warning`. |
| R-3 | `@feature1..9` missing from USER_STORIES/USE_CASES/TASKS | Feature tags are propagated into user stories, use cases, feature file, and TASKS trace. `audit-spec` now reports 0 findings. |
| R-4 | TASKS form violations and graph task count 0 | TASKS now uses graph-readable `— id: ... — Status: ...` task headers and every task has Done When checkboxes. `get_spec_status(counts)` now reports `task: 11`. |
| R-5 | TASKS/FILE_CHANGES drift | FILE_CHANGES now includes every fixture path and the source feature-file edit referenced by TASKS. Reality-check no longer reports orphan TASK/FC entries. |
| R-6 | Unverified status/config vocabulary in DESIGN | DESIGN now marks proposed status and fixture constants with `[UNVERIFIED]` where they are implementation vocabulary rather than already-existing code facts. |

## Remaining Notes

| # | Category | Location | Note |
|---|----------|----------|------|
| P2-1 | Execution evidence pending | `context-mode-integration.feature` | All 9 scenarios are `not_run`, as expected before implementation. Independent spec-status verification classified AC-1..AC-9 as lacking executable evidence because scenarios are `@wip`/`not_run`, implementation tasks are TODO, and the planned implementation modules are absent. Phase 0 must add `tests/step_definitions/feature_context_mode_integration.ts`, remove `@wip` as scenarios become executable, and produce Docker/WSL BDD evidence. |
| P2-2 | Existing-code drift warning | `FR-1`, `FR-6`, `FR-7`; commit `fec620862bb8c5d20e7c68bd40238363e9b473ef` | Reality-check finds matching historical code text, so implementation should verify reuse/edit before creating new modules. This is not a spec blocker; it is a pre-implementation due-diligence note. |
| P2-3 | Semantic lane skipped | `spec-verdict --no-semantic` | Semantic LLM drift check was intentionally skipped for local verification. Structural/traceability/readiness lanes other than execution are clean. |

## Verification Evidence

- `npx tsx tools/specs-generator/validate-spec.ts -Path .specs/context-mode-integration` => 0 errors / 0 warnings.
- `npx tsx tools/specs-generator/audit-spec.ts -Path .specs/context-mode-integration` => 0 findings.
- `npx tsx tools/specs-validator/spec-form-parsers.ts --check tasks .specs/context-mode-integration/TASKS.md` => 0 violations.
- `npx tsx tools/specs-validator/spec-form-parsers.ts --check decisions .specs/context-mode-integration/DESIGN.md` => 0 violations.
- `npx tsx tools/specs-validator/spec-form-parsers.ts --check chk-rows .specs/context-mode-integration/REQUIREMENTS.md` => 0 violations.
- `npx tsx .agents/skills/spec-reality-check/scripts/verify.ts .specs/context-mode-integration --format human` => 0 ERROR / 3 WARNING / 0 INFO; remaining warnings are code-drift due-diligence for FR-1/FR-6/FR-7.
- `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/context-mode-integration --no-semantic` => `VERDICT: GRAPH_GREEN`, `STRUCTURE: GREEN`, `TRACEABILITY: GREEN`, `TASK_TRUTH: GREEN`, `BDD_SYNC: GREEN`, `EXECUTION: NOT_RUN`.
- MCP `get_spec_status({ spec: "context-mode-integration", view: "counts" })` => `fr: 9`, `ac: 9`, `scenario: 9`, `task: 11`.
