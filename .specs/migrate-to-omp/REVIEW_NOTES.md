# Spec Review: migrate-to-omp

**Phase:** Complete — every STOP remains unconfirmed.
**Generated:** 2026-08-22
**Scope:** categories 1, 2, 4–7, 9–10, 14–17; repository reality and primary OMP documentation.

## Summary

| Severity | Count | Verdict |
|---|---:|---|
| P0 (blockers) | 7 | STOP |
| P1 (fix before stop) | 7 | review |
| P2 (recommendations) | 2 | logged |

**Overall verdict:** STOP_BLOCKED. The plan does not yet define an installable OMP artifact, valid hook/tool contracts, or an executable FR→AC→scenario→task chain.

## P0 Findings

| # | Category | Location | Issue | Required fix |
|---|---|---|---|---|
| 0-1 | 17 Product/provider surface | DESIGN.md:14–17,29–33,52; FILE_CHANGES.md:11–18 | The install command resolves the existing root marketplace entry with source `./`, while the proposed package is nested under `omp-plugin/`; new hooks/tools are outside the selected root. | Choose one plugin root, place every discoverable asset beneath it, and assert resolved root plus loaded modules after install. |
| 0-2 | 1 External capability | RESEARCH.md:24,62,102–103; DESIGN.md:15,31–32,58–61 | Planned hook modules use async `ctx.block/confirm/rewrite`. OMP hooks require a default factory registering `pi.on(...)`; interception results are data objects. | Replace the 1:1 claim with a per-hook event/result/failure-policy matrix and use the documented factory API. |
| 0-3 | 1 External capability | RESEARCH.md:25,114; DESIGN.md:16,33,63–68 | Planned custom tools default-export an object, but OMP custom-tool loading requires a default factory function. | Select a supported registration route, use its actual execute contract, and prove runtime registry presence plus invocation. |
| 0-4 | 15 Reality drift | FR.md:50; DESIGN.md:17,24,40,105; TASKS.md:102; MIGRATE001_11 | Executable artifacts name `.claude/mcp.json`; the repository's canonical plugin path is root `.mcp.json` through `.claude-plugin/plugin.json`. | Retarget to real plugin discovery or add explicit OMP-native config; define collision policy and prove a real spec-door request in a fresh installed-plugin session. |
| 0-5 | 6 Traceability | TASKS.md:55–194; validation-report.md:10–17; get_trace FR-1 | The graph reports 0 tasks and six uncovered FRs. Task blocks lack parser-required `id:`; all six `@featureN` tags are orphaned in the checked-in validator. | Convert task blocks to canonical grammar, choose one FR/AC/UC tag resolver, then regenerate evidence and summary. |
| 0-6 | 9 BDD lifecycle | migrate-to-omp.feature:3; DESIGN.md:136–159; FIXTURES.md:5 | Feature selector is `@migrate-to-omp`, but setup, teardown and fixture ownership use `@migrate`. | Use one selector across feature, hooks, fixtures, tasks, runbook and lifecycle assertion. |
| 0-7 | 17 Recovery safety | FILE_CHANGES.md:21; TASKS.md:75,112,139,179–190; DESIGN.md:143; FIXTURES.md:31–32,67–68 | W1–W3 promise rollback before a runbook exists; cleanup conflicts between whole `.specs` checkout and fixture-only paths. | Deliver bounded rollback as W0, with allowlist, backup/restore, activation contract, and proof that unrelated specs survive failure. |

## P1 Findings

| # | Category | Location | Issue | Suggested fix |
|---|---|---|---|---|
| 1-1 | 9 BDD infrastructure | DESIGN.md:126,136–137; FILE_CHANGES.md:22–25 | Proposed `tests/e2e/*` hooks and `e2e/omp/Dockerfile` are not registered by current Cucumber profiles or canonical Docker wrapper. | Add a migration profile or update actual Cucumber/compose/runner imports and feature discovery. |
| 1-2 | 15 Runtime boundary | .mcp.json:5–19; tools/mcp-stdio-launcher.mjs:6–17; package.json:41,75 | Actual MCP door is Node/node20 plus native-dependency build; plan only names Bun work for `tools/_shared`. | Specify Node/Bun, launcher/env/root, native packaging, and runtime test matrix. |
| 1-3 | 4 Scope contract | FR.md:30–35; TASKS.md:59–62; DESIGN.md:43 | FR-4 says 57 hooks but tasks/acceptance own 16 without an explicit scope decision. | Add source→target→runtime→owner matrix; narrow FR-4 or assign all 57. |
| 1-4 | 4 Status integrity | .progress.json:5,9,14,19,24; TASKS.md:8–30,110–194 | State says Complete while all STOPs are false; summary is stale and verification tasks lack form fields. | Reconcile phase state; regenerate task table only after canonical task blocks are valid. |
| 1-5 | 4 Destructive semantics | FR.md:32; ACCEPTANCE_CRITERIA.md:25; USE_CASES.md:34–35; MIGRATE001_07 | Anti-placeholder alternates among deleting a file, rejecting a write, and preserving prior content. | Choose one bounded semantic and assert preserved state/no write. |
| 1-6 | 17 Session lifecycle | DESIGN.md:52–54; REQUIREMENTS.md:48–49 | Install is treated as active hook/tool loading; OMP requires reload for skills/MCP and fresh session for hooks/tools/extensions. | Add install → reload → restart → real capability exercise to W0/finalization. |
| 1-7 | 1 Research quality | RESEARCH.md:1–80 | Compatibility/comparative claims lack verified markers, consumer-shaped probes, exact pins, and required code-signature falsification search. | Record primary evidence, version/commit pins, probe receipts, and adversarial pattern-search results. |

## P2 Findings

| # | Category | Location | Note |
|---|---|---|---|
| 2-1 | 4 Use-case trace | USE_CASES.md:48–55 | UC-6 has no FR/AC/feature/CHK owner. Link it or explicitly mark it research-only. |
| 2-2 | 15 Verifiability | FILE_CHANGES.md:14–15 | Hook globs prevent file-level drift verification; replace with concrete inventory after scope decision. |

## Evidence

- `get_spec_status(migrate-to-omp)`: active, `NOT_READY`, 6 FR / 6 AC / 12 scenarios / 0 tasks; all scenarios lack canonical results.
- `get_trace(migrate-to-omp:FR-1)`: 0 AC, 0 scenarios, 0 tasks.
- Reality audit: 0 ERROR, 10 WARNING, 12 INFO. Mechanical warnings do not supersede the semantic P0 findings.
- Primary OMP sources reviewed: marketplace, hooks, custom-tools, extensions and MCP configuration/loader documentation.

## Repair policy

All repairs are **DECISION_REQUIRED** or **PROPOSAL_ONLY**. No requirement, code, task status, or recovery behavior was auto-modified.
