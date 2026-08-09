# Changelog
## 2026-08-10 — FR-83 Codex Desktop host adapter specified (spec-only)

- Added FR-83, User Story 63, UC-35, three NFRs, AC-83.1–83.10, CHK-FR83-01–10, one design decision, fixture inventory, Phase 50 file/task plan, and SPECGEN004_701–714; matrix rows now have four distinct scenario ids plus an exact-cardinality aggregate.
- Chose one canonical SpecGraph/MCP/workflow engine with generated Codex adapters and a separate full `spec-generator-v4` plugin; kept `context-menu`, Cursor FR-81, and app control-plane APIs outside the change.
- Split ownership: spec-generator-v4 owns runtime/skills/hooks/orchestration/doctor/live proof and emits the immutable package handoff; codex-init FR-8 is the sole marketplace/whitelist/status writer; codex-cli-support supplies no competing spec-generator writer.
- Captured the live MCP dogfood gap where post-transaction in-memory traces can lose cross-document edges; AC-83.2 now requires live post-mutation trace equality with a fresh cold graph.
- No implementation, plugin install, Docker BDD, or live Desktop verification is claimed. New tasks are TODO and scenarios are expected to remain not-run until implementation evidence exists.



## 2026-08-07 — FR-68 AC_SATISFACTION debt closure: 187 gap ACs resolved (181 evidenced, 6 documented clarify)

Every acceptance criterion that lacked its own verifying scenario got an honest, individually-journaled resolution — all writes through the MCP door, no bulk tag-laundering (TAG_BULK_SUSPECT controls verified clean each wave):

- **Waves 1–6** mapped 155 ACs to their own passing scenarios via per-scenario `@AC-N.N` tags (Dynamic Workflow runs dwe-30b2f9e3 / dwe-f2da09f7 / dwe-9d7f1e0f / dwe-c3bed036 / dwe-babba718 / dwe-cb45c0aa — each admission `allow` + ROOT_VERIFIED; journal `audit-reports/ac-mapping-spec-generator-v4.md`).
- **New scenario SPECGEN004_693** (@feature58, step-defs `tests/step_definitions/feature58_retag_invariant.ts`) pins the FR-58 retag invariant for AC-58.1/AC-58.3: FR-19 covered only by the two-tier policy scenarios, migrated form-contract scenarios owned by FR-58.
- **Spot-check** of 13/130 mappings repaired 3 with sibling-scenario tags and carried 1 uncovered clause (AC-24.1 tamper-log-append) into the follow-up list.
- **6 ACs documented clarify** (no honest scenario possible without separate work): AC-1.3 (legacy v1 install semantics), AC-7.4 (dead-integration-guard not implemented as automation), AC-7.5 (one-time measurement protocol), AC-20.2 (perf budget + atomicity clauses), AC-26.2 (SEMANTIC_CHECK_SKIPPED_OPT_OUT finding code not implemented), AC-36.6 (migration-phase process invariant). Each has a concrete follow-up in the journal.
- **Residual clauses** on 8 mapped ACs are tracked explicitly in the journal (never silent).

Result: AC_SATISFACTION 283/289 (lane RED until the 6 clarify follow-ups land — readiness-inventory carries no waiver path by design); all other mandatory lanes GREEN; full Docker suite **1996/1996 PASSED**.


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



## 2026-08-08 — six-AC remediation implementation

- AC-7.5 now has a repeatable real Marksman link-definition proof: the launcher receives initialized, didOpen, and textDocument/definition messages and the test asserts target document and heading range.
- AC-7.4 now has an executable guard that rejects missing or untruthful runtime consumers and requires a passing real-artifact command; current Marksman integration has positive Docker evidence.
- AC-36.6 now has a machine-readable migration-phase gate that denies dirty, filtered, stale, failed, or unqualified evidence and allows only a complete fresh phase.
- AC-20.2 and AC-26.2 were previously given AC-owned BDD evidence in this remediation wave; AC-1.3 remains explicitly superseded.
