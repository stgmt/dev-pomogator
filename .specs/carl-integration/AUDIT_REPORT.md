# Phase 3+ Audit Report: CARL Integration

**Spec:** `carl-integration`
**Audit date:** 2026-07-07
**Method:** dev-pomogator spec MCP door only (`list_spec_docs`, `read_spec_doc`, `get_trace`, `get_spec_status`, `conformance_check`, `apply_spec_change`)
**Scope:** Phase 3+ semantic audit focused on managed CARL integration, Claude Code first support, later gated Codex path, doctor repair, fail-open warning injection, dead-integration resistance, real-artifact evidence, traceability, and undefined behavior.

## Executive verdict

**Verdict:** READY_WITH_BLOCKED_IMPLEMENTATION_EVIDENCE

The spec is structurally traceable: 9 FR, 9 AC, 10 scenarios, and 10 tasks; conformance returns no orphan findings; every requested CARL concern has a FR/AC/scenario/task path. A real CARL runtime/output/benchmark fixture was captured from sibling repo `E:/repos/presentation-reels` under `tests/fixtures/carl/`, so the earlier producer-shape blocker is now partially retired. The implementation is still not ready to claim done because all CARL scenarios are still `not_run`, executable BDD and step definitions are not implemented yet, the captured CARL source artifacts were untracked in the sibling repo, and dev-pomogator has not yet packaged or exercised the plugin-distributed CARL hook path.

## Audit summary

| Category | Result | Notes |
|----------|--------|-------|
| Dead integration risk | Covered, with remaining implementation gate | FR-3/AC-3/TASK `wire-runtime-consumer` require the distributed hook path to invoke the runner; final done must prove the `.claude-plugin/hooks.json` command reaches the runner, not only file presence. |
| Verify against real artifact | Covered, with blocker | FR-3/FR-9 and TASK `capture-real-carl-artifact` require captured real CARL output or approved artifact before producer-shape and benchmark claims close. |
| Claude Code first path | Covered | FR-1/AC-1 and design specify managed Claude Code CARL install via canonical plugin hook path. |
| Codex sequencing | Covered | FR-7/AC-7 gate Codex CARL behind context-menu Codex launcher, deterministic dispatcher, and version-aware capability checks. |
| pomogator-doctor repair | Covered | FR-5/AC-5 and TASK `implement-doctor-carl-repair` define health states and managed-only repair. |
| Broken hook warning injection | Covered, with transport verification gap | FR-4/AC-4 require fail-open plus agent-visible warning reminding the AI to tell the user; exact Claude Code/Codex context transport remains `[UNVERIFIED]`. |
| Traceability | Mechanically clean after fixes | `get_trace` confirms FR-1/3/4/5/7 have AC, scenario, and task mappings; conformance returns 0 findings. |
| Undefined behavior/failure modes | Improved during audit | Fail-open scenario now covers missing dependency, timeout, malformed output, unsupported runtime, and runtime exception. |
| Cross-spec consistency | Covered | Research/design align with `codex-cli-support:FR-4`, `context-menu:FR-8`, `pomogator-doctor:FR-3`, and `dev-pomogator-canonical-plugin:FR-1`. |

## Findings fixed during this audit

| ID | Severity | Finding | Fix applied |
|----|----------|---------|-------------|
| AUDIT-1 | P0 traceability | USER_STORIES independent test tags for doctor, hook failure, Codex path, and review/reporting referenced earlier feature numbers, which could mislead implementation routing. | Updated the independent test tags to `@feature5`, `@feature4`, `@feature7`, and `@feature8` respectively. |
| AUDIT-2 | P0 fixture completeness | `FIXTURES.md` still contained scaffold placeholders even though DESIGN declares `TEST_DATA_ACTIVE`; this left fixture lifecycle and gap analysis undefined. | Replaced `FIXTURES.md` with CARL-specific fixture inventory, fixture details, dependency graph, gap matrix, and cleanup notes. |
| AUDIT-3 | P1 real-artifact discipline | NFR contained an assumed numeric hook latency target (`250 ms p95`) before any real CARL benchmark evidence exists. | Rewrote the NFR to require a bounded local budget while keeping the first numeric target draft until real CARL evidence calibrates it. |
| AUDIT-4 | P1 undefined behavior coverage | The fail-open scenario covered only a broken runtime dependency, while FR/AC list timeout, malformed output, unsupported mode, and runtime exceptions too. | Converted `CARL001_04` into a Scenario Outline covering missing dependency, timeout, malformed output, unsupported runtime, and runtime exception diagnostic codes. |

## Remaining implementation blockers

| ID | Blocks | Required evidence before done |
|----|--------|-------------------------------|
| BLOCK-1 | FR-1, FR-3, FR-8, FR-9 | Real CARL runtime/output/benchmark evidence is captured under `tests/fixtures/carl/` from sibling repo `E:/repos/presentation-reels`; remaining blocker is source/vendor acceptance plus proving dev-pomogator packages and invokes the accepted CARL runtime through its plugin-distributed hook path. |
| BLOCK-2 | FR-3 | Runtime consumer proof must drive the same plugin-distributed hook command that users receive and fail if files exist but the hook is not wired. |
| BLOCK-3 | FR-4 | Claude Code agent-visible context injection transport must be verified with the real hook mechanism; Codex transport remains deferred until Codex dispatcher support exists. |
| BLOCK-4 | FR-5 | `pomogator-doctor` CARL check and repair are planned but not implemented; final evidence must show missing/stale/repairable/user-conflict/broken-runtime/unsupported handling. |
| BLOCK-5 | FR-7 | Codex CARL positive path is blocked until context-menu Codex launcher and deterministic hook dispatcher prerequisites exist; unsupported/deferred state is acceptable until then. |
| BLOCK-6 | All FRs | Spec-level scenarios are authored but not run/ingested; `get_spec_status(view=coverage)` reports 10 `not_run` scenarios. |

## Cross-spec consistency notes

- `codex-cli-support:FR-4` defines version-aware Codex hook capability (`SessionStart`, `Stop`, `UserPromptSubmit`, and Bash-only `PreToolUse`/`PostToolUse` by version). CARL FR-7 correctly requires capability detection and must not claim parity through unsupported events.
- `context-menu:FR-8` requires Claude Code and Codex to remain parallel channels with separate scripts/flags. CARL correctly keeps Claude Code CARL independent when Codex CARL is unsupported or deferred.
- `pomogator-doctor:FR-3` models reinstallable managed structure checks. CARL FR-5 follows that pattern and limits repair to managed artifacts.
- `dev-pomogator-canonical-plugin:FR-1` states hooks are hand-authored static `.claude-plugin/hooks.json` entries with tool scripts under `tools/<tool>/`. CARL runtime proof must therefore exercise the plugin-distributed hook entry, not a repository-only side channel.

## Traceability check

| FR | AC | Scenario | Task coverage | Status |
|----|----|----------|---------------|--------|
| FR-1 | AC-1 | CARL001_01 | BDD red, managed install, runtime consumer, final verification | Mapped; not run |
| FR-2 | AC-2 | CARL001_02 | BDD red, managed install, final verification | Mapped; not run |
| FR-3 | AC-3 | CARL001_03 | artifact capture, BDD red, runtime consumer, final verification | Mapped; not run |
| FR-4 | AC-4 | CARL001_04 outline | BDD red, fail-open warning, final verification | Mapped; not run |
| FR-5 | AC-5 | CARL001_05 | BDD red, doctor repair, final verification | Mapped; not run |
| FR-6 | AC-6 | CARL001_06 | managed install, doctor repair, final verification | Mapped; not run |
| FR-7 | AC-7 | CARL001_07 | BDD red, blocked Codex gate, final verification | Mapped; blocked/deferred |
| FR-8 | AC-8 | CARL001_08 | artifact capture, BDD red, review report, final verification | Mapped; not run |
| FR-9 | AC-9 | CARL001_09/CARL001_10 | artifact capture, benchmark, final verification | Mapped; not run |

## Recommendations for implementation reviewers

1. Do not mark CARL installed/healthy from file existence. Require the registered hook command to invoke the CARL runner.
2. Before accepting any parser, benchmark, or output fixture, capture one real CARL artifact and reconcile it with a ground-truth summary.
3. Run the CARL hook entry in a deps-absent plugin-user mode if it imports any non-`node:` package.
4. Verify fail-open warning injection through the actual Claude Code hook context path and assert the warning tells the AI agent to tell the user.
5. Keep Codex support `unsupported` or `deferred` until context-menu launcher and deterministic dispatcher prerequisites are present and version capability permits the needed hook event.
6. Keep benchmark thresholds draft/blocked until real CARL evidence or an approved external requirement supplies numeric values.

## Final self-check

- Conformance before report: no orphan findings.
- Coverage before report: 10 scenarios authored, 0 passed, 10 not_run.
- Mechanical audit fixes applied through MCP door only.
- No phase advancement performed.
- Legacy/drift triage not run.
