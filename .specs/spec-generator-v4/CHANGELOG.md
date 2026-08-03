# Changelog

## 2026-08-04 — spec-generator-v4 readiness debt closed; Cursor live scenarios owner-attested

- **Readiness honesty (FR-81a / AC-63.4):** execution-ownership scope classifier — proven `@historical @superseded-by-<slug>` scenarios keep their evidence but leave active debt (fail-closed when the successor is missing); mandatory LIVE_EVIDENCE lane for `@live-evidence` scenarios; scope-aware EXECUTION gaps/lifecycle/hint on every status surface. Regressions SPECGEN004_686/_687 (Docker PASSED).
- **Task truth:** all 45 DONE-but-unverified tasks adjudicated obligation-by-obligation (146 checkboxes verified against real artifacts + canonical scenarios; stale wording rewritten to truthful evidence-bearing statements). TASK_TRUTH lane GREEN.
- **Full canonical run:** 1995/1995 scenarios PASSED on merged main (no commit during the run — a mid-run commit self-stales every evidence row).
- **Owner attestation:** SPECGEN004_668/_669 verified by the owner in a live Cursor session (2026-08-04); recorded as explicit `@live-attested` tags in the feature source (auditable, never a faked machine result); task p46-cursor-live-dogfood closed through the DONE gates. LIVE_EVIDENCE lane GREEN.
- **FR-68 producer fix:** AC_SATISFACTION now computes from each AC's OWN tested-by scenarios + current outcomes (fresh PASSED or owner attestation) — the old formula read `verifies` edges that structurally never target ACs, so the mandatory lane could never be satisfied (0/289). Now 102/289 with the real corpus; the remaining 187 ACs genuinely lack own-scenario evidence (per-AC authoring debt — FR-68 forbids bulk-tag laundering). Parent-FR scenarios still never complete an AC.

## 2026-08-01 — FR-82 immediate bounded MCP contracts; FR-83 deferred packet follow-up

- **FR-82 next/immediate:** Phase 47 now has nine TODO TDD tasks, ordered from real `wf_0315d03b-28` provenance/baseline through bounded `list_tasks`, `list_phase_tasks`, `search`, summary/census, and `read_spec_doc` contracts, then real BDD budget proof and dependency-absent bundle plus authoritative verdict. `SPECGEN004_670`–`SPECGEN004_677` remain pending.


## 2026-07-31 — FR-81 Cursor compat-first (spec + twin MCP file)

- Spec: FR-81 / US-61 / UC-33 / AC-81.1–6 / DESIGN decision / Phase 46 tasks / SPECGEN004_665–669.
- Dogfood: committed `.cursor/mcp.json` twin of root door; `ensure-cursor-mcp.ts` + doctor C33 warn/apply hint.
- Deterministic scenarios 665–667; live 668–669 remain evidence-pending (not suite-green).


## 2026-07-28 — Systematic AI-agent planner specified

- FR-80 requirements, design, and five planner tasks are authored.
- Implementation has not started.
- `SPECGEN004_657`–`SPECGEN004_664` have not been executed; their status is `UNKNOWN`.

