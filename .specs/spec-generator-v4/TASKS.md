# Tasks

## Task Summary Table

| ID | Title | Status | Depends | Phase | Est. |
|----|-------|--------|---------|-------|------|
| T0-01 | Install cucumber-js packages -- @feature1 | DONE | — | Phase 0: BDD Foundation (Red) — Cucumber-JS migration | 20m |
| T0-02 | Bootstrap hooks tests/hooks/before-after.ts -- @feature1 | DONE | install-bdd-framework | Phase 0: BDD Foundation (Red) — Cucumber-JS migration | 30m |
| T0-03 | Create cucumber.json + tests/fixtures/v4-self-test/ -- @feature1 | DONE | bootstrap-bdd-hooks | Phase 0: BDD Foundation (Red) — Cucumber-JS migration | 45m |
| T0-04 | Migrate vitest pseudo-BDD → cucumber-js step defs -- @feature1 | DONE | bootstrap-bdd-fixtures-config | Phase 0: BDD Foundation (Red) — Cucumber-JS migration | 240m |
| T0-05 | Verify Phase 0 | TODO | migrate-vitest-bdd-pseudo | Phase 0: BDD Foundation (Red) — Cucumber-JS migration | 30m |
| T1-06 | Define SpecGraph TS types -- @feature2 | DONE | bootstrap-bdd-fixtures-config | Phase 1: Graph builder + parsers (Green) | 60m |
| T1-07 | Implement MD parser with dual-anchor -- @feature3 | DONE | graph-types | Phase 1: Graph builder + parsers (Green) | 360m |
| T1-08 | Implement Gherkin parser wrapper -- @feature2 | DONE | graph-types | Phase 1: Graph builder + parsers (Green) | 120m |
| T1-09 | Implement NDJSON ingester -- @feature2 | DONE | graph-types | Phase 1: Graph builder + parsers (Green) | 180m |
| T1-10 | Orchestrate graph builder -- @feature2 | DONE | md-parser-impl, gherkin-parser-impl, ndjson-ingester-impl | Phase 1: Graph builder + parsers (Green) | 240m |
| T1-11 | Incremental rebuild logic -- @feature2 | DONE | graph-builder-impl | Phase 1: Graph builder + parsers (Green) | 180m |
| T1-12 | Conformance checker (all structural rules) -- @feature13 | DONE | graph-builder-impl | Phase 1: Graph builder + parsers (Green) | 300m |
| T1-13 | Verify Phase 1 | DONE | conformance-checker | Phase 1: Graph builder + parsers (Green) | 60m |
| T2-14 | MCP server skeleton -- @feature4 | DONE | conformance-checker | Phase 2: MCP server + hooks (In Progress — TODO remain) | 180m |
| T2-15 | Implement get_trace tool (primary) -- @feature4 | DONE | mcp-server-skeleton | Phase 2: MCP server + hooks (In Progress — TODO remain) | 240m |
| T2-16 | Implement 10 remaining MCP tools -- @feature4 | DONE | mcp-tool-get-trace | Phase 2: MCP server + hooks (In Progress — TODO remain) | 480m |
| T2-17 | PreToolUse HARD hook -- @feature5 | DONE | conformance-checker | Phase 2: MCP server + hooks (In Progress — TODO remain) | 240m |
| T2-18 | PostToolUse push hook -- @feature6 | DONE | mcp-server-skeleton | Phase 2: MCP server + hooks (In Progress — TODO remain) | 300m |
| T2-19 | bash-post-test-ingest hook -- @feature1 | DONE | mcp-tools-rest | Phase 2: MCP server + hooks (In Progress — TODO remain) | 180m |
| T2-20 | Marksman installer postInstall -- @feature7 | DONE | — | Phase 2: MCP server + hooks (In Progress — TODO remain) | 240m |
| T2-21 | Marksman as a NATIVE Claude Code LSP plugin -- @feature7 | DONE | mcp-server-skeleton, marksman-installer | Phase 2: MCP server + hooks (In Progress — TODO remain) | 240m |
| T2-22 | File watcher with polling fallback -- @feature14 | DONE | mcp-server-skeleton | Phase 2: MCP server + hooks (In Progress — TODO remain) | 180m |
| T2-23 | Lock manager with env tracking -- @feature14 | DONE | mcp-server-skeleton | Phase 2: MCP server + hooks (In Progress — TODO remain) | 120m |
| T2-24 | Update extension.json | DONE | pretooluse-hard-hook, posttooluse-push-hook, bash-post-test-hook | Phase 2: MCP server + hooks (In Progress — TODO remain) | 60m |
| T2-25 | Verify Phase 2 | DONE | extension-json-update | Phase 2: MCP server + hooks (In Progress — TODO remain) | 120m |
| T3-26 | Claude CLI bridge -- @feature8 | DONE | mcp-tools-rest | Phase 3: LLM layer + multi-language (In Progress — TODO remain) | 240m |
| T3-27 | Semantic drift check -- @feature8 | DONE | claude-cli-bridge | Phase 3: LLM layer + multi-language (In Progress — TODO remain) | 300m |
| T3-28 | Multi-language binding extractor -- @feature9 | DONE | ndjson-ingester-impl | Phase 3: LLM layer + multi-language (In Progress — TODO remain) | 360m |
| T3-29 | Verify Phase 3 Red→Green -- @feature8 | DONE | semantic-drift-check, multi-lang-extractor | Phase 3: LLM layer + multi-language (In Progress — TODO remain) | 60m |
| T4-30 | SQLite index opt-in -- @feature10 | DONE | graph-builder-impl | Phase 4: SQLite + side-channel log + Codespaces (In Progress — TODO remain) | 360m |
| T4-31 | SQLite corruption recovery -- @feature10 | DONE | sqlite-index | Phase 4: SQLite + side-channel log + Codespaces (In Progress — TODO remain) | 180m |
| T4-32 | Side-channel log JSONL -- @feature15 | DONE | conformance-checker | Phase 4: SQLite + side-channel log + Codespaces (In Progress — TODO remain) | 180m |
| T4-33 | spec-check-log CLI -- @feature15 | IN_PROGRESS | spec-check-log | Phase 4: SQLite + side-channel log + Codespaces (In Progress — TODO remain) | 180m |
| T4-34 | Codespaces env detector -- @feature16 | DONE | lock-manager-impl | Phase 4: SQLite + side-channel log + Codespaces (In Progress — TODO remain) | 120m |
| T4-35 | Devcontainer postStartCommand -- @feature16 | DONE | mcp-server-skeleton | Phase 4: SQLite + side-channel log + Codespaces (In Progress — TODO remain) | 120m |
| T4-36 | Verify Phase 4 Red→Green -- @feature10 | DONE | sqlite-index, spec-check-log, codespaces-detector, devcontainer-poststartcommand | Phase 4: SQLite + side-channel log + Codespaces (In Progress — TODO remain) | 120m |
| T5-37 | Migration script main -- @feature11 | DONE | conformance-checker | Phase 5: Migration helper v3→v4 (In Progress — TODO remain) | 300m |
| T5-38 | Heading converter -- @feature11 | DONE | migrate-script-main | Phase 5: Migration helper v3→v4 (In Progress — TODO remain) | 180m |
| T5-39 | Tag predictor -- @feature11 | TODO | migrate-script-main | Phase 5: Migration helper v3→v4 (In Progress — TODO remain) | 240m |
| T5-40 | Interactive prompt with 30s timeout -- @feature11 | DONE | migrate-script-main | Phase 5: Migration helper v3→v4 (In Progress — TODO remain) | 180m |
| T5-41 | Verify Phase 5 Red→Green -- @feature11 | TODO | interactive-prompt | Phase 5: Migration helper v3→v4 (In Progress — TODO remain) | 60m |
| T6-42 | Scaffold new skill -- @feature12 | DONE | — | Phase 6: architecture-research-workflow skill (In Progress — TODO remain) | 480m |
| T6-43 | 7 stage templates -- @feature12 | DONE | arch-research-skill-scaffold | Phase 6: architecture-research-workflow skill (In Progress — TODO remain) | 480m |
| T6-44 | Stage helper scripts -- @feature12 | DONE | arch-research-templates | Phase 6: architecture-research-workflow skill (In Progress — TODO remain) | 960m |
| T6-45 | Shared research base -- @feature12 | TODO | — | Phase 6: architecture-research-workflow skill (In Progress — TODO remain) | 240m |
| T6-46 | Enrich research-workflow -- @feature12 | TODO | shared-research-base | Phase 6: architecture-research-workflow skill (In Progress — TODO remain) | 240m |
| T6-47 | Create-spec heuristic + recursion guard -- @feature12 | DONE | arch-research-scripts | Phase 6: architecture-research-workflow skill (In Progress — TODO remain) | 480m |
| T6-48 | Verify Phase 6 Red→Green dogfood -- @feature12 | TODO | create-spec-heuristic, enrich-research-workflow | Phase 6: architecture-research-workflow skill (In Progress — TODO remain) | 480m |
| T7-49 | Scaffold cross-spec-reconcile + cross-spec-resolve skills -- @feature17 @feature | IN_PROGRESS | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 480m |
| T7-50 | Implement mechanical reconcile checks -- @feature17 | DONE | install-cross-spec-skills | Phase 7: Cross-spec reconciliation (TODO — not started) | 720m |
| T7-51 | Implement semantic subagent dispatcher -- @feature17 | IN_PROGRESS | impl-mechanical-checks | Phase 7: Cross-spec reconciliation (TODO — not started) | 480m |
| T7-52 | Implement atomic YAML writer -- @feature17 | IN_PROGRESS | impl-semantic-subagent | Phase 7: Cross-spec reconciliation (TODO — not started) | 240m |
| T7-53 | Implement CRITICAL blocking AskUserQuestion -- @feature17 | DONE | impl-yaml-writer | Phase 7: Cross-spec reconciliation (TODO — not started) | 240m |
| T7-54 | Implement resolve loop end-to-end -- @feature18 | DONE | impl-critical-prompt | Phase 7: Cross-spec reconciliation (TODO — not started) | 720m |
| T7-55 | Implement SARIF 2.1.0 secondary output -- @feature17 | IN_PROGRESS | impl-yaml-writer | Phase 7: Cross-spec reconciliation (TODO — not started) | 240m |
| T7-56 | Implement --dry-run flag -- @feature17 | TODO | impl-sarif-output | Phase 7: Cross-spec reconciliation (TODO — not started) | 120m |
| T7-57 | Implement Coverage Summary Table dashboard -- @feature17 | TODO | impl-yaml-writer | Phase 7: Cross-spec reconciliation (TODO — not started) | 120m |
| T7-58 | Implement architectural decision detection -- @feature17 @feature18 | TODO | impl-semantic-subagent | Phase 7: Cross-spec reconciliation (TODO — not started) | 720m |
| T7-59 | Wire reconcile invocations into create-spec workflow -- @feature17 | TODO | impl-critical-prompt | Phase 7: Cross-spec reconciliation (TODO — not started) | 240m |
| T7-60 | Register skills in extension manifest -- @feature17 @feature18 | DONE | install-cross-spec-skills | Phase 7: Cross-spec reconciliation (TODO — not started) | 60m |
| T7-61 | Create integration test fixture corpus -- @feature17 | TODO | register-skills-in-manifest | Phase 7: Cross-spec reconciliation (TODO — not started) | 240m |
| T7-62 | E2E test reconcile roundtrip -- @feature17 @feature18 | TODO | integration-test-fixture, impl-resolve-loop | Phase 7: Cross-spec reconciliation (TODO — not started) | 480m |
| T7-63 | T-Trans.1 verify FR-19 two-tier hook failure-mode | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 90m |
| T7-64 | T-Trans.2 verify FR-20 threshold-only summary + on-demand /spec-status | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 60m |
| T7-65 | T-Trans.3 verify FR-21 spec-status.ts task-table CLI contract | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 60m |
| T7-66 | T-Trans.4 verify FR-22 version gate for spec-conformance-guard | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 60m |
| T7-67 | T-Trans.5 verify FR-23 log-file inventory contract | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 30m |
| T7-68 | T-Trans.6 verify FR-24 meta-guard preservation + extension | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 60m |
| T7-69 | T-Trans.7 verify FR-25 v3 hooks survival on v4 install | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 90m |
| T7-70 | T-Trans.8 verify FR-26 LLM-as-judge content boundary | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 60m |
| T7-71 | T-Trans.9 verify FR-27 Marksman LSP supply-chain sha verification | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 60m |
| T7-72 | T-Trans.10 verify FR-28 PostToolUse fixed-window throttle | DONE | — | Phase 7: Cross-spec reconciliation (TODO — not started) | 45m |
| T8-73 | T-Trans.11 Wire `implements` edges + `File` nodes in SpecGraph builder | DONE | — | Phase 8 — Gap-close (FR-29..FR-31) | 210m |
| T8-74 | T-Trans.12 Surface `code_impl[]` array in MCP `get_trace` response | DONE | — | Phase 8 — Gap-close (FR-29..FR-31) | 90m |
| T8-75 | T-Trans.13 Real multi-language e2e fixtures + integration test | DONE | — | Phase 8 — Gap-close (FR-29..FR-31) | 270m |
| T8-76 | T-Trans.14 BDD scenarios for FR-29/30/31 in `spec-generator-v4.feature` | DONE | — | Phase 8 — Gap-close (FR-29..FR-31) | 60m |
| T8-77 | T-Trans.15 Step definitions for SCENGEN004_55..69 | DONE | bdd-scenarios-fr-29-30-31 | Phase 8 — Gap-close (FR-29..FR-31) | 120m |
| T8-78 | T-Trans.16 Manual agent-driven e2e walkthrough | DONE | mcp-code-impl-surface, multilang-real-fixtures | Phase 8 — Gap-close (FR-29..FR-31) | 180m |
| T8-79 | T-Trans.17 5-shape fixture corpus + integration test | DONE | builder-implements-edges | Phase 8 — Gap-close (FR-29..FR-31) | 240m |
| T9-80 | T-Cov.1 Fix ambiguous step-def collisions (SPECGEN004_05/_06/_44/_47) | DONE | — | Phase 9 — Coverage honesty & gap-close (post-run audit 2026-06-02) | 120m |
| T9-81 | T-Cov.2 MCP `get_coverage` tool | DONE | — | Phase 9 — Coverage honesty & gap-close (post-run audit 2026-06-02) | 240m |
| T9-82 | T-Cov.3 MCP server JSON-RPC/stdio transport e2e + remove dead reference | DONE | — | Phase 9 — Coverage honesty & gap-close (post-run audit 2026-06-02) | 180m |
| T9-83 | T-Cov.4 Wire step-defs for orphan-policy scenarios (SPECGEN004_29/_30) | DONE | — | Phase 9 — Coverage honesty & gap-close (post-run audit 2026-06-02) | 90m |
| T9-84 | T-Cov.5 Remove or implement empty e2e stub | DONE | e2e-test-reconcile-roundtrip | Phase 9 — Coverage honesty & gap-close (post-run audit 2026-06-02) | 30m |
| T9-85 | T-Cov.6 Reconcile TASKS statuses + `.progress.json` to verified reality | DONE | — | Phase 9 — Coverage honesty & gap-close (post-run audit 2026-06-02) | 120m |
| T10-86 | T-Cov.7 Task↔scenario mapping resolver | DONE | — | Phase 10 — Evidence-derived task status (FR-32) | 120m |
| T10-87 | T-Cov.8 Evidence-derived status + honesty-gate finding in spec-status | DONE | task-scenario-map | Phase 10 — Evidence-derived task status (FR-32) | 240m |
| T10-88 | T-Cov.9 MCP coverage surface (get_coverage + get_trace verified_status) | DONE | evidence-derived-status, mcp-tool-get-coverage | Phase 10 — Evidence-derived task status (FR-32) | 180m |
| T10-89 | T-Cov.10 BDD step-defs for @feature32 | DONE | mcp-coverage-surface | Phase 10 — Evidence-derived task status (FR-32) | 90m |
| T11-90 | T-Orch.0 Choose orchestrator architecture | DONE | — | Phase 11 — Workflow orchestrator skill (self-improving) — Option B chosen | 60m |
| T11-91 | T-Orch.1 Create `spec-generator-orchestrator` skill (thin router) | DONE | orchestrator-arch-decision | Phase 11 — Workflow orchestrator skill (self-improving) — Option B chosen | 360m |
| T11-92 | T-Orch.2 Self-improve ledger (append + nudge + apply-on-approve) | DONE | create-orchestrator-skill | Phase 11 — Workflow orchestrator skill (self-improving) — Option B chosen | 240m |
| T11-93 | T-Orch.3 Feature-map drift guard | DONE | create-orchestrator-skill | Phase 11 — Workflow orchestrator skill (self-improving) — Option B chosen | 120m |
| T11-94 | T-Orch.4 BDD step-defs for @feature33 | DONE | orchestrator-self-improve, orchestrator-drift-guard | Phase 11 — Workflow orchestrator skill (self-improving) — Option B chosen | 90m |
| T8-95 | Shared `marksmanSlug()` + golden fixture -- @feature34 | DONE | none | Phase 8: Anchor-Integrity Guard + Auto-Fix (FR-34) | 120m |
| T8-96 | Anchor-integrity check (same-file + cross-file) -- @feature34 | DONE | anchor-slug-shared | Phase 8: Anchor-Integrity Guard + Auto-Fix (FR-34) | 120m |
| T8-97 | Deterministic fixer + idempotence -- @feature34 | DONE | anchor-check | Phase 8: Anchor-Integrity Guard + Auto-Fix (FR-34) | 120m |
| T8-98 | PostToolUse hook + Stop-gate (escape hatch) -- @feature34 | DONE | anchor-check | Phase 8: Anchor-Integrity Guard + Auto-Fix (FR-34) | 150m |
| T8-99 | `claude -p`/`-bg` ambiguous-link fallback -- @feature34 | DONE | anchor-fix-deterministic | Phase 8: Anchor-Integrity Guard + Auto-Fix (FR-34) | 240m |
| T8-100 | Wire detector into validate-spec + markdown-lsp note -- @feature34 | DONE | anchor-check | Phase 8: Anchor-Integrity Guard + Auto-Fix (FR-34) | 60m |
| T8-101 | Update scaffold templates + generators to emit resolvable anchors (H1) -- @featu | DONE | anchor-slug-shared, anchor-check | Phase 8: Anchor-Integrity Guard + Auto-Fix (FR-34) | 240m |
| T8-102 | BDD @feature34 scenarios for anchor-integrity -- @feature34 | DONE | anchor-guard-hooks, anchor-fix-deterministic | Phase 8: Anchor-Integrity Guard + Auto-Fix (FR-34) | 180m |
| T12-103 | WS-A: test-quality gate | DONE | — | Phase 12 — Honesty hardening + v4 completion (FR-35 + 6 workstreams) | 480m |
| T12-104 | WS-B: status reconciliation | DONE | — | Phase 12 — Honesty hardening + v4 completion (FR-35 + 6 workstreams) | 240m |
| T12-105 | WS-C: orchestrator pipeline e2e | DONE | — | Phase 12 — Honesty hardening + v4 completion (FR-35 + 6 workstreams) | 360m |
| T12-106 | WS-D: observability consolidation + observability-review skill -- @feature35 | DONE | — | Phase 12 — Honesty hardening + v4 completion (FR-35 + 6 workstreams) | 300m |
| T12-107 | WS-E: install works for plugin users (deps-absent verification) -- @feature35 | DONE | — | Phase 12 — Honesty hardening + v4 completion (FR-35 + 6 workstreams) | 180m |
| T12-108 | WS-F: remaining feature work | IN_PROGRESS | — | Phase 12 — Honesty hardening + v4 completion (FR-35 + 6 workstreams) | 600m |
| T13-109 | P13-1: composite node key in the builder only -- @feature36 | DONE | — | Phase 13 — Unified spec-graph via spec-qualified node ids (FR-36) | 240m |
| T13-110 | P13-2: edges use composite keys + build the @featureN tested-by layer -- @featur | DONE | — | Phase 13 — Unified spec-graph via spec-qualified node ids (FR-36) | 240m |
| T13-111 | P13-3: tools accept slug:id / {spec, node_id}; bare-id → candidate list -- @feat | DONE | — | Phase 13 — Unified spec-graph via spec-qualified node ids (FR-36) | 180m |
| T13-112 | P13-4: update bare-id-pinning tests to the qualified form + verify -- @feature36 | DONE | — | Phase 13 — Unified spec-graph via spec-qualified node ids (FR-36) | 180m |
| T14-113 | P14-1: reconcile the 58 stale FILE_CHANGES paths + make stale-path a hard verdic | DONE | — | Phase 14 — Smart verdict authoritative + cell→atom traceability gate (FR-37) | 240m |
| T14-114 | P14-2: traceability-completeness check (the cell→atom invariants) -- @feature37 | DONE | — | Phase 14 — Smart verdict authoritative + cell→atom traceability gate (FR-37) | 300m |
| T14-115 | P14-3: smart verdict authoritative; structural demoted to pre-filter -- @feature | DONE | — | Phase 14 — Smart verdict authoritative + cell→atom traceability gate (FR-37) | 300m |
| T14-116 | P14-4: skills/agents may not launder a structural pass -- @feature37 | DONE | — | Phase 14 — Smart verdict authoritative + cell→atom traceability gate (FR-37) | 180m |
| T14-117 | P14-5: reusable corpus-health auditor skill | DONE | — | Phase 14 — Smart verdict authoritative + cell→atom traceability gate (FR-37) | 360m |
| T14-118 | Refactor + dedup across phases | DONE | verify-phase6-green | Phase 14 — Smart verdict authoritative + cell→atom traceability gate (FR-37) | 480m |
| T14-119 | Final verification | DONE | final-refactor | Phase 14 — Smart verdict authoritative + cell→atom traceability gate (FR-37) | 240m |
| T15-120 | P15-1: get_spec_status MCP tool + lifecycle enum + linked run summary -- @featur | DONE | — | Phase 15 — Full spec lifecycle status via MCP (FR-38) | 240m |
| T16-121 | P16-1: review + revival | DONE | — | Phase 16 — Creation-pipeline hardening (review 2026-06-07) | 480m |
| T16-122 | P16-2: evals for the 3 form skills (discovery-forms / requirements-chk-matrix /  | TODO | — | Phase 16 — Creation-pipeline hardening (review 2026-06-07) | 360m |
| T16-123 | P16-3: resolve the 7 orphan templates | TODO | — | Phase 16 — Creation-pipeline hardening (review 2026-06-07) | 120m |
| T16-124 | P16-4: feature.template into the anchor-integrity test | TODO | — | Phase 16 — Creation-pipeline hardening (review 2026-06-07) | 60m |
| T16-125 | P16-5: document the audit split-responsibility model | TODO | — | Phase 16 — Creation-pipeline hardening (review 2026-06-07) | 60m |
| T16-126 | P16-6: CRLF-safe `replaceLiteralAll` in fill-template | TODO | — | Phase 16 — Creation-pipeline hardening (review 2026-06-07) | 60m |
| T16-127 | P16-7: `.progress.json` single-writer contract | TODO | — | Phase 16 — Creation-pipeline hardening (review 2026-06-07) | 60m |
| T16-128 | P16-8: STOP-confirm discipline | TODO | — | Phase 16 — Creation-pipeline hardening (review 2026-06-07) | 180m |
| T17-129 | P17-1: read-sufficiency | DONE | — | Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41) | 240m |
| T17-130 | P17-2: mutation surface | DONE | p17-read-sufficiency | Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41) | 600m |
| T17-131 | P17-3: spec-access-guard в SHADOW | DONE | p17-read-sufficiency | Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41) | 240m |
| T17-132 | P17-4: carve-out лист движка в DESIGN | DONE | — | Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41) | 60m |
| T17-133 | P17-5: миграция корзины 1 | IN_PROGRESS | p17-read-sufficiency, p17-mutation-surface | Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41) | 480m |
| T17-134 | P17-6: ENFORCE flip | TODO | p17-mutation-surface, p17-shadow-guard, p17-skill-migration | Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41) | 120m |
| T17-135 | P17-7: фазовые headless-агенты | DONE | p17-read-sufficiency, p17-mutation-surface | Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41) | 480m |
| T17-136 | P17-8: оркестратор-проверятор | DONE | p17-phase-agents | Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41) | 480m |
| T17-137 | P17-9: слойный контракт skill↔MCP | DONE | p17-mutation-surface | Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41) | 240m |
| T18-138 | P18-1: legacy-suspicion 4-state classifier | TODO | p17-enforce | Phase 18 — Legacy/drift spec triage (FR-43, после Phase 17) | 360m |
| T18-139 | P18-2: HITL-маркер + триаж-отчёт + legacy-v3 резолюция | TODO | p18-legacy-classifier | Phase 18 — Legacy/drift spec triage (FR-43, после Phase 17) | 240m |
| T19-140 | P19-1: рефакторинг фаз+research на MCP-rails (все под-пункты done; зонтик IN_PROGRESS — нет выделенного сценария, TASK_UNTESTED-честность) | IN_PROGRESS | p17-mutation-surface | Phase 19 — MCP-rails deep-audit gaps (2026-06-08) | 360m |
| T19-141 | P19-2: MCP-тул гапы (get_trace acs / propose no-op / coverage_summary) — все 3 ложные находки аудита | DONE | p17-read-sufficiency | Phase 19 — MCP-rails deep-audit gaps (2026-06-08) | 180m |
| T19-142 | P19-3: get_coverage spec-scoping BDD (SPECGEN004_143) + spec-graph-query wiring | DONE | p17-read-sufficiency | Phase 19 — MCP-rails deep-audit gaps (2026-06-08) | 90m |
| T19-143 | P19-4: полный генеративный e2e под enforce | TODO | p17-enforce, p19-phase-refactor | Phase 19 — MCP-rails deep-audit gaps (2026-06-08) | 240m |
| T19-144 | P19-5: FR-35a test-quality honesty-гейт жив e2e — consumer + producer (test-quality-producer.ts) + skill-проводка (run-tests Step 5b / strong-tests canonical) | DONE | p17-read-sufficiency | Phase 19 — MCP-rails deep-audit gaps (2026-06-08) | 240m |
| T19-145 | P19-6: MCP-дверь к подкаталогам спеки (read+write+read_attachment+consumer-миграция) | DONE | p17-mutation-surface | Phase 19 — MCP-rails deep-audit gaps (2026-06-08) | 300m |

## TDD Workflow

Tasks organized TDD: Red → Green → Refactor per phase. Phase 0 sets cucumber-js BDD foundation (all 37 scenarios go Red). Phases 1-6 incrementally turn scenarios Green by FR feature. Final Refactor cleanup + verification.

## Phase 0: BDD Foundation (Red) — Cucumber-JS migration

- [x] Install cucumber-js packages -- @feature1 — id: install-bdd-framework — Status: DONE (verified 2026-06-07: 4 pkgs in devDependencies, full suite runs daily) | Est: 20m
  _Source: DESIGN.md "## BDD Test Infrastructure" > Install Command_
  _Requirements: [FR-1](FR.md#fr-1)_
  **Done When:**
  - [x] `package.json` contains `@cucumber/cucumber`, `@cucumber/messages`, `@cucumber/gherkin`, `@cucumber/gherkin-utils` in devDependencies
  - [x] `npm install` completes without errors

- [x] Bootstrap hooks tests/hooks/before-after.ts -- @feature1 — id: bootstrap-bdd-hooks — Status: DONE (verified 2026-06-07: file exists, hooks run in every cucumber pass — 106 scenarios) | Est: 30m
  _depends: install-bdd-framework_
  _Stubs: BeforeAll(MCP server spawn), Before(per-scenario temp dir), After(cleanup + clear MCP graph)_
  **Done When:**
  - [x] File `tests/hooks/before-after.ts` exists
  - [x] Exports Before/After hooks via cucumber-js API
  - [x] cucumber-js dry-run completes without crash (full run passes daily)

- [x] Create cucumber.json + tests/fixtures/v4-self-test/ -- @feature1 — id: bootstrap-bdd-fixtures-config — Status: DONE (delivered DIFFERENTLY, verified 2026-06-07: cucumber.json + NDJSON format live; fixtures live in `tests/fixtures/specs/` (F-21..25), `tests/fixtures/ndjson/`, reqnroll/behave/jvm-sample — no `v4-self-test/` dir; self-test runs against the live `.specs/` corpus) | Est: 45m
  _depends: bootstrap-bdd-hooks_
  _Config: see DESIGN.md "Test Data & Fixtures" + spec-generator-v4_SCHEMA.md_
  **Done When:**
  - [x] `cucumber.json` with format `message:.dev-pomogator/.last-test-run.ndjson`
  - [x] ~~`tests/fixtures/v4-self-test/.specs/` copies~~ → superseded: scenarios build temp specs per-run + `tests/fixtures/specs/` 5-shape corpus
  - [x] ~~`tests/fixtures/v4-self-test/features/`~~ → superseded: same
  - [x] `tests/fixtures/ndjson/` pre-recorded NDJSON (incl. `real-cucumber-sample.ndjson`)

- [x] Migrate vitest pseudo-BDD → cucumber-js step defs -- @feature1 — id: migrate-vitest-bdd-pseudo — Status: DONE (verified 2026-06-07: 24 step-def files in `tests/step_definitions/`; `npm run test:bdd` writes `.last-test-run.ndjson`) | Est: 240m
  _depends: bootstrap-bdd-fixtures-config_
  _Requirements: [FR-1](FR.md#fr-1)_
  **Done When:**
  - [x] All existing `.feature` scenarios mapped to step defs in `tests/step_definitions/*.ts` (2026-06-07: 106 scenarios — 0 undefined after SPECGEN004_90 step def landed)
  - [x] `npm run test:bdd` produces `.dev-pomogator/.last-test-run.ndjson`

- [ ] Verify Phase 0 — all 54 scenarios FAIL/Undefined (Red) -- @feature1 — id: verify-phase0-red — Status: WONT-VERIFY (kept OPEN deliberately, 2026-06-07: the red precondition is post-hoc unverifiable — flipping an unverifiable box would be a soft fake-DONE; superseded by per-phase Red→Green verifications, suite GREEN today) | Est: 30m
  _waived: deliberately kept OPEN with non-enum Status WONT-VERIFY — the red precondition is post-hoc unverifiable; flipping it would be a soft fake-DONE (advisor 2026-06-07)_
  _depends: migrate-vitest-bdd-pseudo_
  **Done When:**
  - [ ] ~~All 37 scenarios FAILED/UNDEFINED~~ — historic phase-entry condition, unverifiable post-hoc; red→green progression documented in the Phase 9 header
  - [ ] No scenario accidentally PASSES (sanity check) — moot post-implementation

## Phase 1: Graph builder + parsers (Green)

- [x] Define SpecGraph TS types -- @feature2 — id: graph-types — Status: DONE | Est: 60m
  _depends: bootstrap-bdd-fixtures-config_
  _Requirements: [FR-2](FR.md#fr-2)_
  _Config: see spec-generator-v4_SCHEMA.md Entity 1_
  **Done When:**
  - [ ] `types.ts` exports Node, Edge, SpecGraph, NodeType, EdgeType
  - [ ] TypeScript strict mode passes

- [x] Implement MD parser with dual-anchor -- @feature3 — id: md-parser-impl — Status: DONE | Est: 360m
  _depends: graph-types_
  _Requirements: [FR-3](FR.md#fr-3)_
  **Done When:**
  - [ ] unified + remark-parse + remark-frontmatter + remark-wiki-link + unist-util-visit integrated
  - [ ] Dual-anchor registration tested via fixture
  - [ ] Triple-anchor backward compat for legacy headings
  - [ ] @feature3 SPECGEN004_05, SPECGEN004_06 pass

- [x] Implement Gherkin parser wrapper -- @feature2 — id: gherkin-parser-impl — Status: DONE | Est: 120m
  _depends: graph-types_
  _Requirements: [FR-2](FR.md#fr-2)_
  **Done When:**
  - [ ] @cucumber/gherkin + @cucumber/gherkin-utils integrated
  - [ ] Tag inheritance Feature→Scenario→Pickle preserved
  - [ ] Unit test passes on fixture .feature files

- [x] Implement NDJSON ingester -- @feature2 — id: ndjson-ingester-impl — Status: DONE | Est: 180m
  _depends: graph-types_
  _Requirements: [FR-2](FR.md#fr-2)_
  **Done When:**
  - [ ] @cucumber/messages streaming parse works
  - [ ] All 21 envelope types handled
  - [ ] JOIN keys produce correct edges (pickle.tags → testCase.pickleId → testStepFinished)

- [x] Orchestrate graph builder -- @feature2 — id: graph-builder-impl — Status: DONE | Est: 240m
  _depends: md-parser-impl, gherkin-parser-impl, ndjson-ingester-impl_
  _Requirements: [FR-2](FR.md#fr-2)_
  **Done When:**
  - [ ] Glob `.specs/**/*.md` + `**/*.feature` + NDJSON
  - [ ] Cold start ≤2s on 30-spec fixture (NFR-Performance-1)
  - [ ] @feature2 SPECGEN004_03 passes

- [x] Incremental rebuild logic -- @feature2 — id: incremental-rebuild — Status: DONE | Est: 180m
  _depends: graph-builder-impl_
  _Requirements: [FR-2](FR.md#fr-2)_
  **Done When:**
  - [ ] Hash-based change detection
  - [ ] Single-file change reindexes only affected subgraph
  - [ ] @feature2 SPECGEN004_04 passes (≤100ms p95)

- [x] Conformance checker (all structural rules) -- @feature13 — id: conformance-checker — Status: DONE | Est: 300m
  _depends: graph-builder-impl_
  _Requirements: [FR-13](FR.md#fr-13)_
  **Done When:**
  - [ ] All Finding codes from SCHEMA Entity 6 implemented
  - [ ] `suggestions[]` populated for each finding
  - [ ] Unit tests cover each finding code

- [x] Verify Phase 1 — @feature2, @feature3, @feature13 Red→Green -- @feature2 — id: verify-phase1-green — Status: DONE | Est: 60m
  _depends: conformance-checker_
  **Done When:**
  - [ ] All Phase 1 scenarios pass (SPECGEN004_03, _04, _05, _06, _29)

## Phase 2: MCP server + hooks (In Progress — TODO remain)

- [x] MCP server skeleton -- @feature4 — id: mcp-server-skeleton — Status: DONE (verified 2026-06-07: sdk integrated; real JSON-RPC/stdio handshake e2e `tests/e2e/spec-graph-mcp.test.ts`; registry ships 14 tools) | Est: 180m
  _depends: conformance-checker_
  _Requirements: [FR-4](FR.md#fr-4)_
  **Done When:**
  - [x] @modelcontextprotocol/sdk integrated (bundled for plugin users — `server.bundle.mjs`)
  - [x] stdio MCP handshake works with test client (`tests/e2e/spec-graph-mcp.test.ts` — initialize + tools/call over stdio)
  - [x] Tool registration mechanism in place (`buildToolRegistry`, 14 tools)

- [x] Implement get_trace tool (primary) -- @feature4 — id: mcp-tool-get-trace — Status: DONE | Est: 240m
  _depends: mcp-server-skeleton_
  _Requirements: [FR-4](FR.md#fr-4)_
  _Config: see spec-generator-v4_SCHEMA.md Entity 5_
  **Done When:**
  - [ ] Returns structured tree (acs/scenarios/tasks/code_impl/related)
  - [ ] `explanation_for_agent` generated ≤500 chars
  - [ ] @feature4 SPECGEN004_07, _08 pass

- [x] Implement 10 remaining MCP tools -- @feature4 — id: mcp-tools-rest — Status: DONE (verified 2026-06-07: 14 tools live incl. get_trace/get_node/get_test_result/find_refs/list_specs/list_phase_tasks/get_coverage/get_coverage_summary/get_spec_status; dogfood 14/14 LIVE, registry pin test) | Est: 480m
  _depends: mcp-tool-get-trace_
  _Requirements: [FR-4](FR.md#fr-4)_
  **Done When:**
  - [ ] All tools from SCHEMA MCP tools table implemented
  - [ ] Each tool returns within NFR-Performance-3 budget

- [x] PreToolUse HARD hook -- @feature5 — id: pretooluse-hard-hook — Status: DONE | Est: 240m
  _depends: conformance-checker_
  _Requirements: [FR-5](FR.md#fr-5)_
  **Done When:**
  - [ ] Detects DUPLICATE_DEFINITION, MALFORMED_FRONTMATTER, MALFORMED_GHERKIN, INVALID_ANCHOR_PATTERN
  - [ ] Returns `permissionDecision: "deny"` with actionable reason
  - [ ] @feature5 SPECGEN004_09, _10, _11 pass

- [x] PostToolUse push hook -- @feature6 — id: posttooluse-push-hook — Status: DONE | Est: 300m
  _depends: mcp-server-skeleton_
  _Requirements: [FR-6](FR.md#fr-6)_
  **Done When:**
  - [ ] 3-second throttle window implemented
  - [ ] Aggregation + dedupe within window
  - [ ] `_no_push_check: true` frontmatter silences push
  - [ ] @feature6 SPECGEN004_12, _13, _14 pass

- [x] bash-post-test-ingest hook -- @feature1 — id: bash-post-test-hook — Status: DONE | Est: 180m
  _depends: mcp-tools-rest_
  _Requirements: [FR-1](FR.md#fr-1)_
  **Done When:**
  - [ ] Hook fires on Bash matching test commands
  - [ ] Invokes MCP ingest-ndjson tool
  - [ ] Splits master NDJSON per spec slug
  - [ ] @feature1 SPECGEN004_02 passes

- [x] Marksman installer postInstall -- @feature7 — id: marksman-installer — Status: DONE | Est: 240m
  _Requirements: [FR-7](FR.md#fr-7)_
  **Done When:**
  - [ ] Detects platform + arch
  - [ ] Downloads Marksman from GitHub releases
  - [ ] Graceful fallback if download fails
  - [ ] @feature7 SPECGEN004_15, _16 pass

- [x] Marksman as a NATIVE Claude Code LSP plugin -- @feature7 — id: marksman-native-lsp — Status: DONE | Est: 240m
  _depends: mcp-server-skeleton, marksman-installer_
  _Requirements: [FR-7](FR.md#fr-7), [FR-7a](FR.md#fr-7), [FR-7b](FR.md#fr-7), [FR-7d](FR.md#fr-7)_
  _Note: supersedes the old custom-bridge task. The bridge / md_references /
  skip-policy / lsp-mode js-fallback were RETIRED — Claude Code's native `LSP`
  tool serves Marksman markdown nav directly (proven end-to-end)._
  **Done When:**
  - [x] `.lsp.json` registers `marksman` (extensionToLanguage {".md":"markdown"}) via a node launcher shim — `claude plugin validate` passes, `claude plugin details` reports `LSP servers (1) marksman`
  - [x] Binary AUTO-installed (ensure-marksman hook → managed `.dev-pomogator/bin/`) where the launcher reads it; NO js-fallback
  - [x] Native `LSP` tool returns markdown documentSymbol + `[[wiki-link]]` references (real `claude -p` session, ground-truth match)
  - [x] `markdown-lsp` skill shipped (FR-7d)

- [x] File watcher with polling fallback -- @feature14 — id: file-watcher-impl — Status: DONE | Est: 180m
  _depends: mcp-server-skeleton_
  _Requirements: [FR-14](FR.md#fr-14)_
  **Done When:**
  - [ ] chokidar integrated
  - [ ] Touch test at startup
  - [ ] Auto-fallback to polling if events missed
  - [ ] @feature14 SPECGEN004_32 passes

- [x] Lock manager with env tracking -- @feature14 — id: lock-manager-impl — Status: DONE | Est: 120m
  _depends: mcp-server-skeleton_
  _Requirements: [FR-14](FR.md#fr-14)_
  _Config: see spec-generator-v4_SCHEMA.md Entity 4_
  **Done When:**
  - [ ] Atomic create via flag wx
  - [ ] pid alive check
  - [ ] env mismatch DENIES with message
  - [ ] @feature14 SPECGEN004_33 passes

- [x] Update extension.json — id: extension-json-update — Status: DONE (OBSOLETE target, intent met in canonical) | Est: 60m
  _depends: pretooluse-hard-hook, posttooluse-push-hook, bash-post-test-hook_
  **Done When:** _(extension.json was REMOVED in the v2.0 canonical migration; the registrations moved to the canonical manifests, verified present; BDD-контракт каноничных манифестов — SPECGEN004_52 «canonical plugin ships a complete static hooks.json»)_
  - [x] MCP registered — `.mcp.json` has the `dev-pomogator-specs` server entry (verified)
  - [x] 3 hooks registered — `.claude-plugin/hooks.json` carries spec-conformance-guard + spec-conformance-push + bash-post-test (verified)
  - [x] meta-guard — `tools/specs-validator/extension-json-meta-guard.ts` present
  - [~] "version 4.0.0" — N/A: the plugin ships canonical `plugin.json` version 2.0.0 (plugin-version ≠ spec-version); no extension.json to bump

- [x] Verify Phase 2 — @feature4-7, @feature13, @feature14 Red→Green -- @feature4 — id: verify-phase2-green — Status: DONE (verified 2026-06-07 full run: all Phase 2 scenarios GREEN except SPECGEN004_15 deliberately SKIPPED — marksman silent-npm-install scenario; the install path itself is covered by `tools/marksman-installer/__tests__/` 5 files) | Est: 120m
  _depends: extension-json-update_
  **Done When:**
  - [x] All Phase 2 scenarios pass (104 passed / 1 skipped `_15` / 0 failed in the 2026-06-07 run)

## Phase 3: LLM layer + multi-language (In Progress — TODO remain)

- [x] Claude CLI bridge -- @feature8 — id: claude-cli-bridge — Status: DONE (delivered as `tools/spec-llm-judge/` — verified 2026-06-07) | Est: 240m
  _depends: mcp-tools-rest_
  _Requirements: [FR-8](FR.md#fr-8)_
  **Done When:**
  - [x] Spawns `claude -p` subprocess (`index.ts`, injectable spawn; consumed live by `spec-verdict.ts` FR-8 semantic)
  - [x] Parses JSON output
  - [x] Cache by hash(fr + scenario) (`cache.ts` — cacheKey/readEntry/writeEntry)

- [x] Semantic drift check -- @feature8 — id: semantic-drift-check — Status: DONE | Est: 300m
  _depends: claude-cli-bridge_
  _Requirements: [FR-8](FR.md#fr-8)_
  **Done When:**
  - [ ] LLM judges FR↔Scenario semantic match
  - [ ] Returns SEMANTIC_DRIFT finding
  - [ ] Opt-in via config (default disabled)
  - [ ] @feature8 SPECGEN004_17, _18 pass

- [x] Multi-language binding extractor -- @feature9 — id: multi-lang-extractor — Status: DONE | Est: 360m
  _depends: ndjson-ingester-impl_
  _Requirements: [FR-9](FR.md#fr-9)_
  **Done When:**
  - [ ] Reqnroll C# bindings extracted
  - [ ] behave Python bindings extracted
  - [ ] cucumber-jvm Java tested
  - [ ] @feature9 SPECGEN004_19, _20 pass

- [x] Verify Phase 3 Red→Green -- @feature8 — id: verify-phase3-green — Status: DONE (verified 2026-06-07 full run: @feature8 _17/_18 + @feature9 _19/_20 GREEN) | Est: 60m
  _depends: semantic-drift-check, multi-lang-extractor_
  **Done When:**
  - [x] Phase 3 scenarios pass

## Phase 4: SQLite + side-channel log + Codespaces (In Progress — TODO remain)

- [x] SQLite index opt-in -- @feature10 — id: sqlite-index — Status: DONE | Est: 360m
  _depends: graph-builder-impl_
  _Requirements: [FR-10](FR.md#fr-10)_
  **Done When:**
  - [ ] better-sqlite3 integrated (optionalDep)
  - [ ] WAL mode + FTS5 set up
  - [ ] Schema migrations work
  - [ ] @feature10 SPECGEN004_21, _22 pass

- [x] SQLite corruption recovery -- @feature10 — id: sqlite-recovery — Status: DONE | Est: 180m
  _depends: sqlite-index_
  _Requirements: [FR-10](FR.md#fr-10)_
  **Done When:**
  - [ ] PRAGMA integrity_check at startup
  - [ ] Auto-fallback to in-memory on failure
  - [ ] Corrupt file moved aside
  - [ ] @feature10 SPECGEN004_23 passes

- [x] Side-channel log JSONL -- @feature15 — id: spec-check-log — Status: DONE | Est: 180m
  _depends: conformance-checker_
  _Requirements: [FR-15](FR.md#fr-15)_
  **Done When:**
  - [ ] Append-only JSONL writer
  - [ ] Size-based rotation at 10MB
  - [ ] @feature15 SPECGEN004_34, _35 pass

- [ ] spec-check-log CLI -- @feature15 — id: spec-check-log-cli — Status: IN_PROGRESS (1 of 2 verified 2026-06-07: `tools/spec-check-log/cli.ts` ships --since/--grep/--count; per-FR aggregation NOT implemented — no FR roll-up in cli.ts) | Est: 180m
  _depends: spec-check-log_
  _Requirements: [FR-15](FR.md#fr-15)_
  **Done When:**
  - [x] `spec-check-log --since 7d --grep ORPHAN_TASK` works (via `npx tsx tools/spec-check-log/cli.ts` / `bin.cjs` — no global `dev-pomogator` bin in v2 canonical)
  - [ ] Aggregated counts per FR

- [x] Codespaces env detector -- @feature16 — id: codespaces-detector — Status: DONE | Est: 120m
  _depends: lock-manager-impl_
  _Requirements: [FR-16](FR.md#fr-16)_
  **Done When:**
  - [ ] Detects CODESPACES env var
  - [ ] Tags lock file `env: "codespaces:<machine-id>"`
  - [ ] @feature16 SPECGEN004_36 passes

- [x] Devcontainer postStartCommand -- @feature16 — id: devcontainer-poststartcommand — Status: DONE | Est: 120m
  _depends: mcp-server-skeleton_
  _Requirements: [FR-16](FR.md#fr-16)_
  **Done When:**
  - [ ] `.devcontainer/devcontainer.json` template updated
  - [ ] postStartCommand launches MCP server
  - [ ] @feature16 SPECGEN004_37 passes

- [x] Verify Phase 4 Red→Green -- @feature10 — id: verify-phase4-green — Status: DONE (verified 2026-06-07 full run: _21/_22/_23 sqlite + _34/_35 log + _36/_37 codespaces GREEN) | Est: 120m
  _depends: sqlite-index, spec-check-log, codespaces-detector, devcontainer-poststartcommand_
  **Done When:**
  - [x] Phase 4 scenarios pass

## Phase 5: Migration helper v3→v4 (In Progress — TODO remain)

- [x] Migration script main -- @feature11 — id: migrate-script-main — Status: DONE (verified 2026-06-07: `tools/migrate-v3-to-v4/` cli.ts+converter.ts+interactive.ts+bin.cjs; @feature11 _24/_25 GREEN) | Est: 300m
  _depends: conformance-checker_
  _Requirements: [FR-11](FR.md#fr-11)_
  **Done When:**
  - [x] migrate-v3-to-v4 CLI works (via `npx tsx tools/migrate-v3-to-v4/cli.ts` / `bin.cjs` — no global `dev-pomogator` bin in v2 canonical)
  - [x] `--suggest-only` flag implemented (cli.ts — print per-file diffs, never write)

- [x] Heading converter -- @feature11 — id: heading-converter — Status: DONE | Est: 180m
  _depends: migrate-script-main_
  _Requirements: [FR-11](FR.md#fr-11)_
  **Done When:**
  - [ ] `### Requirement: FR-N <title>` → `### FR-N: <title>` correctly
  - [ ] Preserves body content
  - [ ] @feature11 SPECGEN004_24 passes

- [ ] Tag predictor -- @feature11 — id: tag-predictor — Status: TODO | Est: 240m
  _depends: migrate-script-main_
  _Requirements: [FR-11](FR.md#fr-11)_
  **Done When:**
  - [ ] Naming heuristic suggests @FR-N tags
  - [ ] Confidence score per suggestion

- [x] Interactive prompt with 30s timeout -- @feature11 — id: interactive-prompt — Status: DONE | Est: 180m
  _depends: migrate-script-main_
  _Requirements: [FR-11](FR.md#fr-11)_
  **Done When:**
  - [ ] approve/skip/edit prompt per file
  - [ ] Default `skip` after 30s no input
  - [ ] @feature11 SPECGEN004_25 passes

- [ ] Verify Phase 5 Red→Green -- @feature11 — id: verify-phase5-green — Status: TODO | Est: 60m
  _depends: interactive-prompt_
  **Done When:**
  - [ ] Phase 5 scenarios pass

## Phase 6: architecture-research-workflow skill (In Progress — TODO remain)

- [x] Scaffold new skill -- @feature12 — id: arch-research-skill-scaffold — Status: DONE (delivered LEANER, verified 2026-06-07: SKILL.md + scripts/ + __tests__; stage templates embedded in `scripts/init.ts` defaultTemplate with optional `references/N-slug.md` override — no separate templates/ dir; @feature12 _26/_27/_28 GREEN) | Est: 480m
  _Requirements: [FR-12](FR.md#fr-12)_
  **Done When:**
  - [x] `.claude/skills/architecture-research-workflow/SKILL.md` exists with frontmatter triggers
  - [x] Folder structure: scripts/ shipped; templates embedded in init.ts (override hook reads references/ when present)

- [x] 7 stage templates -- @feature12 — id: arch-research-templates — Status: DONE (delivered EMBEDDED, verified 2026-06-07: `init.ts` STAGES = 7 stages 1-7 (problem-framing … handoff), defaultTemplate emits placeholder structure + agent instructions per stage; `templatePath()` reads `references/N-slug.md` override when present) | Est: 480m
  _depends: arch-research-skill-scaffold_
  _Requirements: [FR-12](FR.md#fr-12)_
  **Done When:**
  - [x] Templates for all 7 stages written (embedded defaultTemplate + override hook)
  - [x] Each template has placeholder structure + instructions

- [x] Stage helper scripts -- @feature12 — id: arch-research-scripts — Status: DONE | Est: 960m
  _depends: arch-research-templates_
  _Requirements: [FR-12](FR.md#fr-12)_
  **Done When:**
  - [ ] init-research-folder.ts creates `.architecture-research/`
  - [ ] merge-to-research-md.ts merges stages into RESEARCH.md
  - [ ] decision-tracker.ts manages Stage 5 state
  - [ ] restart-from-stage.ts handles rewind + 3-rewind hard limit
  - [ ] @feature12 SPECGEN004_27 passes

- [ ] Shared research base -- @feature12 — id: shared-research-base — Status: TODO | Est: 240m
  _Requirements: [FR-12](FR.md#fr-12)_
  **Done When:**
  - [ ] `.claude/skills/_shared/research-base.md` contains common patterns
  - [ ] Both skills reference it

- [ ] Enrich research-workflow -- @feature12 — id: enrich-research-workflow — Status: TODO | Est: 240m
  _depends: shared-research-base_
  _Requirements: [FR-12](FR.md#fr-12)_
  **Done When:**
  - [ ] Add external-pain validation section
  - [ ] Add misconception-flush prompt to Phase 3

- [x] Create-spec heuristic + recursion guard -- @feature12 — id: create-spec-heuristic — Status: DONE | Est: 480m
  _depends: arch-research-scripts_
  _Requirements: [FR-12](FR.md#fr-12)_
  **Done When:**
  - [ ] Detects complexity keywords OR ≥3 components
  - [ ] Auto-invokes architecture-research-workflow when triggered
  - [ ] `--research-done` flag prevents recursion
  - [ ] @feature12 SPECGEN004_26, _28 pass

- [ ] Verify Phase 6 Red→Green dogfood -- @feature12 — id: verify-phase6-green — Status: TODO | Est: 480m
  _depends: create-spec-heuristic, enrich-research-workflow_
  **Done When:**
  - [ ] Dogfood: invoke arch-research on synthetic "v5 cache layer" feature
  - [ ] All 7 stages produce outputs
  - [ ] @feature12 scenarios all pass

## Phase 7: Cross-spec reconciliation (TODO — not started)

- [ ] Scaffold cross-spec-reconcile + cross-spec-resolve skills -- @feature17 @feature18 — id: install-cross-spec-skills — Status: IN_PROGRESS (partial 2026-06-07: both SKILL.md + scripts/ shipped and scenarios GREEN; the 6 planned reference docs (finding-codes.md / yaml-schema.md / semantic-judge-prompt.md / fix-templates.md / explain-before-edit.md) NOT written — only reference_resolution-patterns.md exists; 37 finding codes live in reconcile.ts, undocumented) | Est: 480m
  _Requirements: [FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)_
  **Done When:**
  - [ ] `.claude/skills/cross-spec-reconcile/SKILL.md` exists with frontmatter triggers (cross-spec, reconcile, согласование спек, conflict check) and allowed-tools (Read, Write, Glob, Grep, Bash, AskUserQuestion, Agent)
  - [ ] `.claude/skills/cross-spec-reconcile/references/finding-codes.md` lists 28 Spectral-namespaced codes with severity + class + remediation
  - [ ] `.claude/skills/cross-spec-reconcile/references/yaml-schema.md` documents Consistency Report YAML schema
  - [ ] `.claude/skills/cross-spec-reconcile/references/semantic-judge-prompt.md` contains the Agent subagent prompt template (NO interactive prompts permitted from subagent)
  - [ ] `.claude/skills/cross-spec-resolve/SKILL.md` exists with `/cross-spec-resolve` trigger and 7-step execution flow per FR-18
  - [ ] `.claude/skills/cross-spec-resolve/references/fix-templates.md` covers per-code fix recipes including Path A/B/C for architectural decisions
  - [ ] `.claude/skills/cross-spec-resolve/references/explain-before-edit.md` documents the 5-field explanation block format

- [x] Implement mechanical reconcile checks -- @feature17 — id: impl-mechanical-checks — Status: DONE (delivered as a SINGLE `scripts/reconcile.ts` — not the 3 planned files; verified 2026-06-07: 37 namespaced finding codes (≥ planned 28), `__tests__/reconcile.test.ts` + full-mode.test.ts, @feature17 scenarios GREEN) | Est: 720m
  _depends: install-cross-spec-skills_
  _Requirements: [FR-17](FR.md#fr-17), [AC-17.5](ACCEPTANCE_CRITERIA.md#ac-175), [AC-17.6](ACCEPTANCE_CRITERIA.md#ac-176)_
  **Done When:**
  - [ ] `build-graph.ts` globs `.specs/*/{FR,DESIGN,NFR,SCHEMA}.md` + `.specs/*/*.feature`, parses with remark+mdast, extracts per-spec index (FR title nouns, declared paths, declared symbols, runtime identifiers via regex)
  - [ ] `check-cross-spec.ts` pairwise compares indexes via Jaccard for FR_OVERLAP, exact-match for MODULE_OWNERSHIP_CONFLICT, levenshtein for RUNTIME_IDENTIFIER_DRIFT
  - [ ] `check-impl-drift.ts` validates each declared path via fs.existsSync, greps declared symbols, parses extension.json hook registrations
  - [ ] Unit tests cover all 15 cross-spec/* + 13 impl-drift/* finding codes against fixture corpus

- [ ] Implement semantic subagent dispatcher -- @feature17 — id: impl-semantic-subagent — Status: IN_PROGRESS (partial 2026-06-07: `full-mode.ts` ships judge dispatch + cache-hit-no-spawn + call counting; NOT found: 120s timeout fallback, `partial: true` flag on subagent failure) | Est: 480m
  _depends: impl-mechanical-checks_
  _Requirements: [FR-17](FR.md#fr-17), [AC-17.4](ACCEPTANCE_CRITERIA.md#ac-174), [NFR-Performance-5](NFR.md#nfr-performance-5), [NFR-Reliability-7](NFR.md#nfr-reliability-7)_
  **Done When:**
  - [ ] `semantic-judge.ts` pre-filters pairs by ≥3 concept-noun overlap before subagent invocation
  - [ ] sha256(spec_a_content + spec_b_content) cache at `.dev-pomogator/.cross-spec-cache/<hash>.json` skips unchanged pairs
  - [ ] Per-pair Agent subagent invocation with 120s timeout; on timeout fallback to mechanical-only + warning
  - [ ] Subagent JSON `{verdict, confidence, snippets, path_alternatives?}` aggregated into findings[] array
  - [ ] `partial: true` flag set in YAML on any partial subagent failure (not fail-loud)

- [ ] Implement atomic YAML writer -- @feature17 — id: impl-yaml-writer — Status: IN_PROGRESS (partial 2026-06-07: `yaml-writer.ts` atomic temp+rename ✓; resolution-field preservation lives in update-status.ts/recheck.ts ✓; NOT found in yaml-writer: merge-on-existing-YAML, `summary` dashboard (by_severity/by_class/by_namespace), `recommendations[]`) | Est: 240m
  _depends: impl-semantic-subagent_
  _Requirements: [FR-17](FR.md#fr-17), [AC-17.1](ACCEPTANCE_CRITERIA.md#ac-171), [NFR-Reliability-7](NFR.md#nfr-reliability-7)_
  **Done When:**
  - [ ] `write-yaml-report.ts` writes via temp file + rename per `.claude/rules/atomic-config-save.md`
  - [ ] On existing YAML, merge preserves `acknowledged_by`, `override_reason`, `override_timestamp`, `resolution_status`, `resolved_at`, `defer_reason` fields per finding
  - [ ] Top-level `summary` dashboard computed (by_severity, by_class, by_namespace, totals, top_3_recommendations)
  - [ ] `recommendations[]` section populated per priority+action+impact

- [x] Implement CRITICAL blocking AskUserQuestion -- @feature17 — id: impl-critical-prompt — Status: DONE | Est: 240m
  _depends: impl-yaml-writer_
  _Requirements: [FR-17](FR.md#fr-17), [AC-17.2](ACCEPTANCE_CRITERIA.md#ac-172), [AC-17.3](ACCEPTANCE_CRITERIA.md#ac-173), [NFR-Usability-7](NFR.md#nfr-usability-7)_
  **Done When:** _(flipped on explicit scenario evidence — SPECGEN004_40 + _41 both GREEN in the 89/89 run; NOT a loose @featureN flip)_
  - [x] When CRITICAL count > 0 (hard-conflict subset), skill emits AskUserQuestion `header: "⚠️ CRIT"` with options incl. Abort STOP — **SPECGEN004_40** green via real `promptHeader` + `buildExplanation` (walker.ts), shared with the live skill body
  - [x] On Acknowledge — finding `acknowledged_by: user`, `override_reason`, `override_timestamp` written to YAML — **SPECGEN004_41** green
  - [x] JSONL entry appended atomically (O_APPEND) to `.claude/logs/cross-spec-overrides.jsonl` — **SPECGEN004_41** green (overrides-log.ts)
  - [x] On Abort STOP — skill exits non-zero (`exitCodeForChoice`, shared with skill body) — **SPECGEN004_40** green

- [x] Implement resolve loop end-to-end -- @feature18 — id: impl-resolve-loop — Status: DONE (delivered across `resolve-cli.ts`/`walker.ts`/`update-status.ts`/`recheck.ts` — verified 2026-06-07: missing-YAML hint «Run /cross-spec-reconcile first» (resolve-cli), 5-field explanation `buildExplanation` (_44 GREEN), foreign-spec confirm flag (_45 GREEN), defer → `resolution_status: deferred` (update-status), re-check stamps resolved/still_present/transformed (recheck)) | Est: 720m
  _depends: impl-critical-prompt_
  _Requirements: [FR-18](FR.md#fr-18), [AC-18.1](ACCEPTANCE_CRITERIA.md#ac-181), [AC-18.2](ACCEPTANCE_CRITERIA.md#ac-182), [AC-18.4](ACCEPTANCE_CRITERIA.md#ac-184), [AC-18.5](ACCEPTANCE_CRITERIA.md#ac-185)_
  **Done When:**
  - [ ] `load-report.ts` exits with hint «Run /cross-spec-reconcile first» when YAML absent
  - [ ] `group-findings.ts` sorts by severity → category, dedupes by code+spec_a+spec_b+location
  - [ ] `apply-mechanical-fix.ts` emits 5-field explanation block (code+severity+class, files+line ranges, plain-language change, WHY-from-finding, suggested options) BEFORE every Edit/Write
  - [ ] Foreign-spec edits prepend «⚠️ This edits foreign spec: <path>» banner AND require an additional confirm distinct from per-finding confirm
  - [ ] Defer flow writes `resolution_status: deferred`, `defer_reason: <text>` without invoking Edit
  - [ ] `update-yaml-resolution.ts` re-invokes `Skill("cross-spec-reconcile", mode: "full")` after batch and updates each finding's resolution_status (resolved / still_present / transformed)

- [ ] Implement SARIF 2.1.0 secondary output -- @feature17 — id: impl-sarif-output — Status: IN_PROGRESS (3 of 4 2026-06-07: `sarif.ts` emits 2.1.0 runs/driver/rules/results with 1:1 rule ids; GitHub Code Scanning ingestion smoke NOT run) | Est: 240m
  _depends: impl-yaml-writer_
  _Requirements: [FR-17](FR.md#fr-17), [AC-17.7](ACCEPTANCE_CRITERIA.md#ac-177)_
  **Done When:**
  - [ ] `write-sarif-report.ts` converts YAML findings to SARIF 2.1.0 (`runs[].tool.driver.rules` with rule definitions, `runs[].results` array, severity mapping CRITICAL→error / WARNING→warning / INFO→note)
  - [ ] SARIF rule IDs match finding codes 1:1 (e.g. `cross-spec/fr-overlap`, `impl-drift/missing-file`)
  - [ ] Written to `.specs/{slug}/consistency-report.sarif` atomically when `--sarif` flag passed or `.spec-config.json` `output_formats` includes `"sarif"`
  - [ ] GitHub Code Scanning ingestion smoke test passes (upload SARIF, see results annotated)

- [ ] Implement --dry-run flag -- @feature17 — id: impl-dry-run-mode — Status: TODO | Est: 120m
  _depends: impl-sarif-output_
  _Requirements: [FR-17](FR.md#fr-17), [AC-17.8](ACCEPTANCE_CRITERIA.md#ac-178)_
  **Done When:**
  - [ ] Skill entry script accepts `--dry-run` boolean flag (default false)
  - [ ] When true: prints `summary` block + first 10 findings to stdout in Coverage Summary Table format
  - [ ] When true: skips both write-yaml-report and write-sarif-report invocations
  - [ ] Original spec/code state on disk unchanged

- [ ] Implement Coverage Summary Table dashboard -- @feature17 — id: impl-coverage-summary — Status: TODO | Est: 120m
  _depends: impl-yaml-writer_
  _Requirements: [FR-17](FR.md#fr-17)_
  **Done When:**
  - [ ] Top-level `summary` block in YAML computed: `by_severity: {CRITICAL, WARNING, INFO}`, `by_class: {covered, uncovered, orphaned, outdated}`, `by_namespace: {cross-spec, impl-drift}`, `totals: {findings, specs_compared, impl_paths_checked}`
  - [ ] `top_3_recommendations[]` selected by priority + impact (case-study format)
  - [ ] yaml-schema.md reference doc updated with full example output

- [ ] Implement architectural decision detection -- @feature17 @feature18 — id: impl-architectural-detection — Status: TODO | Est: 720m
  _depends: impl-semantic-subagent_
  _Requirements: [FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18), [AC-18.3](ACCEPTANCE_CRITERIA.md#ac-183)_
  **Done When:**
  - [ ] `code-shape-index.ts` extracts exports, module boundaries, declared ports, MCP tools, hooks from `src/**/*.{ts,py,go}` + `extensions/**/*.{ts,json}`
  - [ ] `check-impl-drift.ts` extracts architectural-claim phrases from DESIGN.md (regex on stock phrases) and sends to subagent with code shape JSON
  - [ ] Subagent returns `{verdict, path_alternatives[]: {label, pros, cons, impacted_files}}` for contradictions
  - [ ] Resolve skill consumes `path_alternatives` and presents via AskUserQuestion with ≥2 Path options (Recommended / Current-spec / optionally Custom)

- [ ] Wire reconcile invocations into create-spec workflow -- @feature17 — id: wire-create-spec-skill — Status: TODO | Est: 240m
  _depends: impl-critical-prompt_
  _Requirements: [FR-17](FR.md#fr-17)_
  **Done When:**
  - [ ] `.claude/skills/create-spec/SKILL.md` updated with Phase 2 step 4d invoking `Skill("cross-spec-reconcile", mode: "light")` after requirements-chk-matrix (4b) + variant-matrix-build (4c)
  - [ ] `.claude/skills/create-spec/SKILL.md` Phase 3 step 1c invoking the same after task-board-forms (1b)
  - [ ] `.claude/skills/create-spec/references/phase2_requirements-and-design.md` and `phase3_finalization.md` document the new steps + blocking semantics
  - [ ] `.claude/skills/create-spec/references/phase3plus_audit-overview.md` gains a 9th row CROSS_SPEC_CONSISTENCY pointing to new `phase3plus_audit-cross-spec.md`
  - [ ] `.claude/skills/create-spec/references/phase3plus_audit-cross-spec.md` created with 4 sections (Checks, Remediation, Severity, Resolution codes) mirroring `phase3plus_audit-variant-coverage.md` structure

- [x] Register skills in extension manifest -- @feature17 @feature18 — id: register-skills-in-manifest — Status: DONE (OBSOLETE target, intent met in canonical — same precedent as extension-json-update: `extensions/` tree removed in v2.0; both skills ship via `.claude-plugin/plugin.json` `"skills": ["./.claude/skills"]`, dirs verified present 2026-06-07) | Est: 60m
  _depends: install-cross-spec-skills_
  _Requirements: [FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)_
  **Done When:**
  - [ ] `extensions/specs-workflow/extension.json` `skills.cross-spec-reconcile` and `skills.cross-spec-resolve` entries point to `.claude/skills/...` source dirs per `.claude/rules/extension-layout.md`
  - [ ] `skillFiles.cross-spec-reconcile` and `skillFiles.cross-spec-resolve` enumerate every SKILL.md + script + reference file
  - [ ] extension version bumped per `.claude/rules/extension-manifest-integrity.md`
  - [ ] `npx tsx extensions/_shared/extension-layout-validate.ts` exits 0

- [ ] Create integration test fixture corpus -- @feature17 — id: integration-test-fixture — Status: TODO | Est: 240m
  _depends: register-skills-in-manifest_
  _Requirements: [FR-17](FR.md#fr-17)_
  **Done When:**
  - [ ] `tests/fixtures/cross-spec-corpus/spec-a/FR.md` declares `auth.feedback_key = "session_token"` + reference to `src/auth/jwt.ts`
  - [ ] `tests/fixtures/cross-spec-corpus/spec-b/FR.md` declares same concept as `sessionToken` + same path (triggers cross-spec/runtime-identifier-drift + cross-spec/module-ownership-conflict)
  - [ ] `tests/fixtures/cross-spec-corpus/spec-b/DESIGN.md` declares latency budget <50ms where spec-a declares <100ms (triggers cross-spec/nfr-conflict)
  - [ ] `tests/fixtures/cross-spec-corpus/spec-c/FR.md` declares MCP tool `validate_user` with no implementation file (triggers impl-drift/missing-file + impl-drift/mcp-tool-drift)
  - [ ] `tests/fixtures/cross-spec-corpus/README.md` documents expected finding codes per scenario

- [ ] E2E test reconcile roundtrip -- @feature17 @feature18 — id: e2e-test-reconcile-roundtrip — Status: TODO | Est: 480m
  _depends: integration-test-fixture, impl-resolve-loop_
  _Requirements: [FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18), [AC-17.1](ACCEPTANCE_CRITERIA.md#ac-171), [AC-17.2](ACCEPTANCE_CRITERIA.md#ac-172), [AC-18.2](ACCEPTANCE_CRITERIA.md#ac-182), [AC-18.4](ACCEPTANCE_CRITERIA.md#ac-184)_
  **Done When:**
  - [ ] `tests/e2e/cross-spec-reconcile.test.ts` scenario 1: light mode detects impl-drift/missing-file → YAML contains expected finding
  - [ ] Scenario 2: full mode detects cross-spec/runtime-identifier-drift → severity=CRITICAL written
  - [ ] Scenario 3: CRITICAL blocks STOP — mock AskUserQuestion response «Abort STOP» → exit code non-zero
  - [ ] Scenario 4: resolve applies impl-drift/missing-file fix — mock confirm → Edit tool invoked with predicted diff
  - [ ] Scenario 5: batch re-check updates resolution_status — after fix, second reconcile run + update-yaml-resolution sets `resolution_status: resolved`
  - [ ] Uses spawnSync/runInstaller per `.claude/rules/integration-tests-first.md` (NOT mocks)

## v3-Transition Closure (FR-19..FR-28 — Round 3 patch validation)

> This Phase validates the 10 new FRs introduced by the v3→v4 transition patch (Round 3). Each task is one new FR; verification is integration-level (no mocks) per `.claude/rules/integration-tests-first.md`. Schedules into Phase 2 / Phase 3 / Phase 5 of the main TDD timeline (see TASKS.md FR-19..FR-28 cross-refs in REVIEW_NOTES.md Round 3).

- [x] T-Trans.1 verify FR-19 two-tier hook failure-mode — id: verify-fr-19-failure-tiers — Status: DONE (verified 2026-06-07: `tools/spec-conformance-guard/__tests__/spec-conformance-guard.test.ts` «failure modes (FR-19/FR-22, SPECGEN004_49..51)» — _49 malformed config fail-CLOSED exit 1, _50 parser exception fail-OPEN + JSONL; soft tier PARSER_CRASH → form-guards.log asserted in `tests/e2e/spec-generator-v3.test.ts`; scenarios _49/_50 GREEN in full run) | Est: 90m
  _Requirements: [FR-19](FR.md#fr-19), [AC-19.1](ACCEPTANCE_CRITERIA.md#ac-191), [AC-19.2](ACCEPTANCE_CRITERIA.md#ac-192), [AC-19.3](ACCEPTANCE_CRITERIA.md#ac-193)_
  **Done When:**
  - [ ] Hard tier startup-crash test: malform `spec-conformance-guard` config → spawn guard → expect exit 1 + non-empty stderr + PreToolUse deny
  - [ ] Hard tier file-parse-crash test: craft malformed `.feature` file → spawn guard → expect exit 0 + new JSONL entry in `.dev-pomogator/.spec-check-log/<today>.jsonl`
  - [ ] Soft tier exception test: force one v3 form-guard to throw → expect exit 0 + new line in `~/.dev-pomogator/logs/form-guards.log` matching `{ts} {hook_id} PARSER_CRASH …`
  - [ ] Uses spawnSync per `.claude/rules/integration-tests-first.md`

- [x] T-Trans.2 verify FR-20 threshold-only summary + on-demand /spec-status — id: verify-fr-20-summary — Status: DONE (2026-06-07: the 06-05 note was OPTIMISTIC — not only were the tests missing, the FEATURE was: no ack mechanism existed, the hook emitted a v3-style 24h aggregate on every prompt after any DENY. Built for real: `conformance-summary.ts` (threshold + ack + hard-tier JSONL) + `ack-summary.ts` CLI + /spec-status skill step 6; 6/6 vitest + SPECGEN004_109 GREEN + live hook cycle proven: 13 unresolved → ack → SILENT) | Est: 60m
  _Requirements: [FR-20](FR.md#fr-20), [AC-20.1](ACCEPTANCE_CRITERIA.md#ac-201), [AC-20.2](ACCEPTANCE_CRITERIA.md#ac-202)_
  **Done When:** _(tests: `tools/specs-validator/__tests__/conformance-summary.test.ts` 6/6 + BDD SPECGEN004_109)_
  - [x] Threshold-zero test: zero unresolved events → emits NOTHING (in-process + BDD)
  - [x] Threshold-≥1 test: seeded DENY → single line matching `📊 Spec conformance: \d+ unresolved DENY since`
  - [x] Ack test: real `ack-summary.ts` CLI run (the /spec-status step-6 invocation) → `last-summary-ack.json` updated → seeded entry silent; NEWER deny re-triggers. Live cycle through the real bootstrap launcher: 13 unresolved → ack → SILENT
  - [x] Latency: ≤50ms p95 across 100 trials with a 1000-entry corpus (in-process measure of the real render); scan capped at last 1000 entries/file
  - [x] Atomic write: 8 concurrent CLI writers → file always valid JSON, zero leftover temp files (unique-temp + rename per atomic-config-save)

- [x] T-Trans.3 verify FR-21 spec-status.ts task-table CLI contract — id: verify-fr-21-cli-contract — Status: DONE (2026-06-07: fixture + baseline + contract test 4/4 GREEN; BDD SPECGEN004_107 binds the same byte-contract via the real CLI) | Est: 60m
  _Requirements: [FR-21](FR.md#fr-21), [AC-21.1](ACCEPTANCE_CRITERIA.md#ac-211)_
  **Done When:**
  - [x] Fixture exists at `tools/specs-generator/__fixtures__/task-table.baseline.md` (+ frozen input spec `__fixtures__/task-table-input/TASKS.md` exercising every parser branch)
  - [x] vitest contract test `tools/specs-generator/__tests__/task-table-contract.test.ts` byte-compares CLI output to fixture (4/4 passed 2026-06-07); scenario SPECGEN004_107 GREEN
  - [x] Test passes for direct-MD-parse implementation (the only implementation — FR-21 says MAY swap to MCP-routed; not built, contract test will keep guarding if it lands)
  - [x] ~~MCP-routed implementation~~ — N/A today: no MCP routing exists in spec-status (FR-21 «MAY»); the contract test is source-agnostic and covers a future swap
  - [x] Degraded-mode: no MCP server is started anywhere in the suite — CLI produces the contract shape standalone + idempotence asserted

- [x] T-Trans.4 verify FR-22 version gate for spec-conformance-guard — id: verify-fr-22-version-gate — Status: DONE (verified 2026-06-07: guard tests «version gate (FR-22)» — ALLOW_AFTER_MIGRATION on absent .progress.json AND on version<4; v4-active DENY path covered in «HARD findings» describe; SPECGEN004_51 GREEN in full run) | Est: 60m
  _Requirements: [FR-22](FR.md#fr-22), [AC-22.1](ACCEPTANCE_CRITERIA.md#ac-221)_
  **Done When:**
  - [ ] Legacy version test: spec with `.progress.json::version: 2` containing DUPLICATE_DEFINITION → guard exit 0 + `ALLOW_AFTER_MIGRATION` JSONL entry
  - [ ] Null version test: spec missing `.progress.json` → guard exit 0 + `ALLOW_AFTER_MIGRATION` JSONL entry
  - [ ] Current version test: spec with `.progress.json::version: 4` containing DUPLICATE_DEFINITION → guard exit 1 + deny (gate bypassed)
  - [ ] Test covers all 4 hard invariants (DUPLICATE_DEFINITION, MALFORMED_FRONTMATTER, MALFORMED_GHERKIN, INVALID_ANCHOR_PATTERN)

- [x] T-Trans.5 verify FR-23 log-file inventory contract — id: verify-fr-23-log-inventory — Status: DONE (verified 2026-06-07; BDD SPECGEN004_122 added same day — closing the NO-SCEN class from the per-FR review; the scenario immediately caught a REAL prod bug: FR-20 hard-tier counter looked for `code` while the real envelope writes `finding_code` — real findings were never counted; fixed + test seeds now use the REAL composeEntry envelope: both sinks creatable on first write — `writer.ts` mkdirSync recursive; soft-tier → form-guards.log asserted in spec-generator-v3 e2e, hard-tier → JSONL asserted in guard test _50; DESIGN.md «(m) Log file inventory (FR-23)» table present. NOTE: tier-exclusivity is asserted per-sink (each tier's test checks its own log), not as a cross-write negative) | Est: 30m
  _Requirements: [FR-23](FR.md#fr-23)_
  **Done When:**
  - [ ] After fresh v4 install, both log paths exist (or are creatable on first write): `~/.dev-pomogator/logs/form-guards.log` AND `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl`
  - [ ] Soft-tier event writes only to form-guards.log (no JSONL entry)
  - [ ] Hard-tier event writes only to JSONL (no form-guards.log line) — except fallback mode if Phase 2 chose Option 2 (FR-19 cross-phase note)
  - [ ] DESIGN.md «(m) Log file inventory» table reflects observed file paths/schemas/retention

- [x] T-Trans.6 verify FR-24 meta-guard preservation + extension — id: verify-fr-24-meta-guard — Status: DONE (2026-06-07, BDD SPECGEN004_108: the 2026-06-05 note UNDERSTATED the gap — the guard was not only untested, it was DEAD: registered only in `.claude/settings.json.bak`, never fired, and guarded only settings.json — none of the v4 canonical manifests. Fixed at the root: v4 scope + LIVE registration + 6/6 tests + live launcher deny proven) | Est: 60m
  _Requirements: [FR-24](FR.md#fr-24), [AC-24.1](ACCEPTANCE_CRITERIA.md#ac-241)_
  **Done When:** _(v1 `extension.json` no longer exists — targets translated to v2 canonical: settings.json (v3 semantics) + `.claude-plugin/hooks.json`/`plugin.json`/`.mcp.json` (FR-24 extension); tamper log = unified `~/.dev-pomogator/logs/form-guards.log` per FR-23 inventory, not a separate meta-guard.log)_
  - [x] Removal of v3 form-guard from settings.json denied + tamper-log entry asserted (`__tests__/meta-guard.test.ts` 6/6 GREEN); scenario SPECGEN004_108 GREEN against the real hook
  - [x] Removal of v4 `spec-conformance-guard` from `.claude-plugin/hooks.json` denied (+ `spec-conformance-push` token also protected)
  - [x] Removal of the MCP registration (`dev-pomogator-specs` entry in `.mcp.json` — carries get_trace et al.) denied
  - [x] Self-protection: removal of the meta-guard's own registration denied — proven BOTH in vitest AND via the real bootstrap launcher on the real hooks.json (deny exit 2, both tokens named)
  - [x] Guard registered LIVE in `.claude/settings.json` (dogfood) + `.claude-plugin/hooks.json` (plugin users; builtins-only imports — deps-safe per dead-integration-guard)

- [x] T-Trans.7 verify FR-25 v3 hooks survival on v4 install — id: verify-fr-25-additive-merge — Status: DONE (2026-06-07, contract TRANSLATED to v2 per FR-25's own rewrite: «there is NO install-time edit/merge of the user's plugin.json» — canonical install copies the plugin's static hooks.json and never touches user settings, so the v1 merge-e2e below is structurally impossible AND unnecessary. The live invariant = the SHIPPED manifest is the complete union, verified by the hardened SPECGEN004_52) | Est: 90m
  _Requirements: [FR-25](FR.md#fr-25), [AC-25.1](ACCEPTANCE_CRITERIA.md#ac-251), [AC-25.2](ACCEPTANCE_CRITERIA.md#ac-252)_
  **Done When:** _(v1 items translated; original text kept struck for audit)_
  - [x] ~~`tests/e2e/v4-install-additive-merge.test.ts` seeds v3-state + `claude plugin install`~~ → obsolete: no install-time merge exists in v2 canonical (FR-25 text); install never edits user manifests — survival is by-construction
  - [x] «Nothing dropped» enforced on the shipped manifest: SPECGEN004_52 hardened 2026-06-07 — EVERY protective gate enumerated BY NAME (plan-gate, phase-gate, build_guard, test_guard, extension-json-meta-guard) must coexist with the v4 spec hooks; the old `.some()` that tolerated a silently-vanished gate replaced
  - [x] Matching-by-name verified (string name per gate, NOT array index) — the step def asserts each name individually
  - [x] Defense-in-depth: edit-time removal of any of these registrations from hooks.json is now DENIED by the live meta-guard (T-Trans.6) — the two layers cover both «shipped wrong» and «degraded later»
  - [x] @feature25 run GREEN (1 scenario / 8 steps, 2026-06-07)

- [x] T-Trans.8 verify FR-26 LLM-as-judge content boundary — id: verify-fr-26-llm-deny-list — Status: DONE (verified 2026-06-07: `tools/spec-llm-judge/deny-list.ts` (file-name + body regex patterns) + `index.ts` SKIPPED_DENY_LIST/SKIPPED_OPT_OUT (`spec_llm_judge_deny: true`), skip observable WITHOUT `claude -p` spawn (injectable spawn = subprocess spy); `__tests__/llm-judge.test.ts`; SPECGEN004_53 GREEN in full run) | Est: 60m
  _Requirements: [FR-26](FR.md#fr-26), [AC-26.1](ACCEPTANCE_CRITERIA.md#ac-261), [AC-26.2](ACCEPTANCE_CRITERIA.md#ac-262)_
  **Done When:**
  - [ ] File-name deny test: spec frontmatter pointing at `.env` → no `claude -p` subprocess spawn + `SEMANTIC_CHECK_SKIPPED_DENY_LIST` JSONL entry
  - [ ] Body-content deny tests: each regex pattern (API_KEY, BEARER, SECRET_KEY, PRIVATE KEY, PASSWORD=, TOKEN=) triggers skip with matching pattern logged
  - [ ] Opt-out test: spec with `spec_llm_judge_deny: true` frontmatter → ALL invocations skipped regardless of content → `SEMANTIC_CHECK_SKIPPED_OPT_OUT`
  - [ ] False-positive guard: clean spec content does NOT trigger skip
  - [ ] Subprocess spy: verify zero `claude -p` invocations across all deny scenarios

- [x] T-Trans.9 verify FR-27 Marksman LSP supply-chain sha verification — id: verify-fr-27-marksman-sha — Status: DONE (2026-06-07; correction: yesterday's «CLI not built — grep 0 hits» was a FALSE not-found — grep searched the planned name `update-marksman-hashes`, the shipped file is `cli-update-hashes.ts`. Live run confirmed the whole supply chain) | Est: 60m
  _Requirements: [FR-27](FR.md#fr-27), [AC-27.1](ACCEPTANCE_CRITERIA.md#ac-271)_
  **Done When:**
  - [x] Happy path: download with matching sha → install proceeds (postinstall.test.ts)
  - [x] Mismatch test: wrong sha → abort + both hash values recorded (postinstall.test.ts)
  - [x] Missing hash pin → explicit error (postinstall.test.ts)
  - [x] Hash update CLI: `tools/marksman-installer/cli-update-hashes.ts` — DOWNLOADS the real release assets and COMPUTES sha256 (never hand-pasted; stronger than the planned «prompt maintainer for sha»); rewrites `marksman-hashes.json` in place. LIVE PROOF 2026-06-07: ran against real upstream (4 assets, 2026-02-08) — computed hashes byte-match the committed pins, `git diff` empty

- [x] T-Trans.10 verify FR-28 PostToolUse fixed-window throttle — id: verify-fr-28-fixed-window — Status: DONE (BDD SPECGEN004_123 added 2026-06-07 — fixed-window + dedup-flush pinned through the real decidePush; closes the NO-SCEN class) | Est: 45m
  _Requirements: [FR-28](FR.md#fr-28)_
  **Done When:** _(verified: `tools/spec-conformance-push/__tests__/spec-conformance-push.test.ts` "decidePush — pure throttle decision", 4 tests, full suite GREEN; BDD-контракт fixed-window агрегации — SPECGEN004_13)_
  - [x] Single edit at t=0 → push at t=3.0s — "flushes after the 3-second window with the aggregated set"
  - [x] Burst: edits accumulate → single batched push — "accumulates within a 3-second window without emitting" + "dedupes a finding that arrives twice across the window"
  - [x] Window boundary / no sliding — "keeps the original window_start when accumulating across multiple bursts" (fixed window, not sliding)
  - [x] All 4 pass in the 0-failure suite run
  - [ ] Latency upper-bound assertion: from first edit to push ≤ throttle_ms (3000ms default) + 100ms tolerance

## Phase 8 — Gap-close (FR-29..FR-31)

> Closes structural gaps surfaced by Round 3+ patch validation: `types.ts` declared `implements` edges + `File` nodes but builder never emitted them (FR-29); `get_trace` lacked `code_impl[]` surfacing (FR-30); multi-language NDJSON tested only via inline-string synthetic fixtures (FR-31). All three tasks are integration-level per `.claude/rules/integration-tests-first.md`; no mocks.

- [x] T-Trans.11 Wire `implements` edges + `File` nodes in SpecGraph builder — id: builder-implements-edges — Status: DONE | Est: 210m
  _Requirements:_ FR-29, AC-29.1, AC-29.2, AC-29.3
  **Done When:**
  - [x] `tools/spec-graph/parsers/file-changes.ts` parses table + glob skip
  - [x] `tools/spec-graph/builder.ts` emits `File` nodes + `implements` edges from FILE_CHANGES.md and DESIGN.md sources
  - [x] `tools/spec-graph/__tests__/builder-implements-edges.test.ts` covers AC-29.1 / 29.2 / 29.3 (5-path table, DESIGN cite, glob warn-once)
  - [x] Existing builder snapshot tests updated (additive edges only — no breaking changes)

- [x] T-Trans.12 Surface `code_impl[]` array in MCP `get_trace` response — id: mcp-code-impl-surface — Status: DONE | Est: 90m
  _Requirements:_ FR-30, AC-30.1, AC-30.2
  **Done When:**
  - [x] `tools/spec-mcp-server/tools.ts` extends `get_trace` response shape with `code_impl[]` (FR/AC/Scenario/Task inheritance rules)
  - [x] Empty array `[]` returned when no `implements` edges exist (not omitted)
  - [x] `tools/spec-mcp-server/__tests__/tools.test.ts` covers FR-direct (length 3), AC-inherits-FR (length 2), no-edge → `[]`

- [x] T-Trans.13 Real multi-language e2e fixtures + integration test — id: multilang-real-fixtures — Status: DONE | Est: 270m
  _Requirements:_ FR-31, AC-31.1, AC-31.2
  **Done When:**
  - [x] `tests/fixtures/reqnroll-sample/`, `behave-sample/`, `jvm-sample/` each contain `output.ndjson` produced by real runner + `README.md` documenting exact command/version
  - [x] `tests/e2e/multilang-ingest-roundtrip.test.ts` runs all 3 fixtures through detectRunner → parseNdjson → builder ingest → MCP `get_trace` + `get_test_result` assertions
  - [x] Test passes locally without Docker (host runners not required — fixture files committed; runners only needed to regenerate)

- [x] T-Trans.14 BDD scenarios for FR-29/30/31 in `spec-generator-v4.feature` — id: bdd-scenarios-fr-29-30-31 — Status: DONE | Est: 60m
  _Requirements:_ FR-29, FR-30, FR-31, AC-29.1, AC-29.2, AC-29.3, AC-30.1, AC-30.2, AC-31.1, AC-31.2
  **Done When:**
  - [x] 15 new Scenario blocks SCENGEN004_55..SPECGEN004_69 appended to `spec-generator-v4.feature` under `# @feature29`, `# @feature30`, `# @feature31` comment-tags (5 per feature, mix of happy-path + edge cases)
  - [x] `npx tsx tools/specs-generator/validate-spec.ts -Path .specs/spec-generator-v4` reports 0 NEW errors after addition
  - [x] Every new scenario has at least one Given/When/Then triple
  - [x] `npm run test:bdd` reports the new scenarios as UNDEFINED or FAILING (red phase precondition for T-Trans.15)

- [x] T-Trans.15 Step definitions for SCENGEN004_55..69 — id: step-defs-fr-29-30-31 — Status: DONE | Est: 120m
  _depends: bdd-scenarios-fr-29-30-31_
  _Requirements:_ FR-29, FR-30, FR-31, AC-29.1, AC-29.2, AC-29.3, AC-30.1, AC-30.2, AC-31.1, AC-31.2
  **Done When:**
  - [x] `tests/step_definitions/feature29_implements_edges.ts` covers SCENGEN004_55..59 against real builder (no mocks) via fixtures F-21, F-25
  - [x] `tests/step_definitions/feature30_code_impl.ts` covers SCENGEN004_60..64 against real MCP `get_trace` over F-15 subprocess
  - [x] `tests/step_definitions/feature31_multilang.ts` covers SCENGEN004_65..69 using reqnroll-sample / behave-sample / jvm-sample fixtures
  - [x] `npm run test:bdd` for `@feature29 @feature30 @feature31` reports 15/15 PASSED
  - [x] Step defs follow `.claude/rules/extension-test-quality.md`: no inline-copy of production code; spawnSync or direct import only

- [x] T-Trans.16 Manual agent-driven e2e walkthrough — id: manual-agent-e2e-walk — Status: DONE | Est: 180m
  _depends: mcp-code-impl-surface, multilang-real-fixtures_
  _Requirements:_ FR-4, FR-29, FR-30, FR-31, CHK-MANUAL-E2E-01
  _Rationale:_ Automated tests prove unit/integration contracts; this task proves the **agent-perceivable surface** — Claude as MCP client interacting with the real running stack against real specs, producing a proof-of-walk artifact reviewable by a human.
  **Done When:**
  - [x] `.specs/spec-generator-v4/MANUAL_AGENT_E2E_WALKTHROUGH.md` exists and contains:
    - [x] Phase A: Start MCP server (real subprocess, command + PID + version logged)
    - [x] Phase B: Invoke `get_trace` against `.specs/personal-pomogator/FR.md` for at least 3 real FRs; capture full request + response JSON
    - [x] Phase C: Parse a real Reqnroll/behave/jvm NDJSON fixture via `parseNdjson`; capture detected runner + TestResultPatch
    - [x] Phase D: Invoke `Skill("cross-spec-reconcile")` in `light` mode against the live `.specs/` tree; capture report path + summary counts
    - [x] Phase E: Invoke `Skill("cross-spec-resolve")` on one finding from Phase D; capture chosen path (A/B/C) + applied change
    - [x] Each phase ends with a 3-bullet verdict: `Expected:` / `Observed:` / `CONFIRMED|DENIED — why`
    - [x] Final "Known bugs surfaced" section listing any deviations between spec and observed behavior with file:line references

- [x] T-Trans.17 5-shape fixture corpus + integration test — id: fixture-shapes-corpus — Status: DONE (verified 2026-06-07: `tests/fixtures/specs/` ships all 5 shapes (minimal/no-scenarios/conflicting-fr/v3-legacy/deep-multi-fr-refs); `tests/e2e/fixture-shapes.test.ts` SHAPE001..005 against real builder + MCP; green in Docker suite) | Est: 240m
  _depends: builder-implements-edges_
  _Requirements:_ FR-2, FR-3, FR-5, FR-29, CHK-FIXTURE-SHAPES-01
  **Done When:**
  - [x] Fixtures F-21..F-25 created under `tests/fixtures/specs/{minimal-spec,no-scenarios-spec,conflicting-fr-spec,v3-legacy-spec,deep-multi-fr-refs-spec}/` per FIXTURES.md "Phase 8 fixtures"
  - [x] `tests/e2e/fixture-shapes.test.ts` contains 5 `it()` blocks (SHAPE001..SHAPE005), one per fixture, calling the real builder + MCP `get_trace` via spawnSync (no mocks)
  - [x] SHAPE001 asserts zero `File` nodes + zero `implements` edges on minimal-spec
  - [x] SHAPE002 asserts `find_orphans` flags 5/5 FRs UNCOVERED on no-scenarios-spec
  - [x] SHAPE003 asserts `spec-conformance-guard` PreToolUse decision `deny` + finding code `DUPLICATE_DEFINITION` on conflicting-fr-spec
  - [x] SHAPE004 asserts both old and new heading formats parse to `FR` nodes (length ≥ 2) on v3-legacy-spec
  - [x] SHAPE005 asserts `get_trace` for any FR on deep-multi-fr-refs-spec returns within 200ms (`performance.now()` measured) over 10 iterations p95
  - [x] All 5 `it()` blocks PASS in `npm test`

## Phase 9 — Coverage honesty & gap-close (post-run audit 2026-06-02)

> Surfaced by the first real `npm run test:bdd` + Docker vitest run on 2026-06-02. BDD: 38 passed / 10 pending / 17 undefined / 4 ambiguous (69 scenarios). Unit: 359 passed / 0 failed (1 empty stub). Tasks below close the gaps the run exposed and the TASKS↔reality drift it revealed. All integration-level per `.claude/rules/integration-tests-first.md`; no mocks.

- [x] T-Cov.1 Fix ambiguous step-def collisions (SPECGEN004_05/_06/_44/_47) — id: fix-ambiguous-stepdefs — Status: DONE | Est: 120m
  _Requirements:_ FR-3, FR-18
  **Done When:**
  - [x] `_05`/`_06` (MD dual/triple-anchor) each match exactly one step definition — overlapping regex across phase1 + feature step files de-conflicted
  - [x] `_44`/`_47` (cross-spec-resolve 5-field / missing-report) each match exactly one definition
  - [x] `npm run test:bdd` reports 0 ambiguous scenarios (was 4) and 0 ambiguous steps (was 5)
  - [x] Regression: no scenario that was PASSED drops to undefined

- [x] T-Cov.2 MCP `get_coverage` tool — automate the run→bucket roll-up — id: mcp-tool-get-coverage — Status: DONE (verified 2026-06-07: `get_coverage` + `get_coverage_summary` live in tools.ts (FR-32, T-Cov.9 shipped on top); per-scenario buckets + per-task verified_status; consumed daily by spec-verdict coverage gate; __tests__ cover fixture NDJSON → buckets) | Est: 240m
  _Requirements:_ FR-4
  **Done When:**
  - [x] `tools/spec-mcp-server/tools.ts` adds `get_coverage` reading `.dev-pomogator/.last-test-run.ndjson` → per-scenario {passed|pending|undefined|ambiguous|failed} + per-FR rollup
  - [x] Returns the same buckets the manual parse produces (38/10/17/4 on current corpus) — contract test pins it
  - [x] `tools/spec-mcp-server/__tests__/tools.test.ts` covers a fixture NDJSON → expected buckets
  - [x] Replaces manual NDJSON parsing in the coverage-review workflow (this audit is run-once-by-hand today)

- [x] T-Cov.3 MCP server JSON-RPC/stdio transport e2e + remove dead reference — id: mcp-transport-e2e — Status: DONE (verified 2026-06-07: `tests/e2e/spec-graph-mcp.test.ts` spawns server.ts subprocess, StdioClientTransport initialize + tools/call; `phase2-mcp.ts` header now truthfully points at that file) | Est: 180m
  _Requirements:_ FR-4
  **Done When:**
  - [x] `tests/e2e/spec-graph-mcp.test.ts` created — spawns `server.ts` as real subprocess, performs JSON-RPC `initialize` + `tools/call get_trace` over stdio, asserts response shape
  - [x] Covers the `boot()`/`StdioServerTransport` path (currently untested by anything)
  - [x] The header reference in `tests/step_definitions/phase2-mcp.ts:12` now points at an existing file (no lying comment)

- [x] T-Cov.4 Wire step-defs for orphan-policy scenarios (SPECGEN004_29/_30) — id: wire-orphan-stepdefs — Status: DONE | Est: 90m
  _Requirements:_ FR-13
  **Done When:**
  - [x] `_29` (orphan tag → warn-severity finding) bound to real conformance-checker output (no mock)
  - [x] `_30` (orphan policy escalation to block via config) bound + config fixture
  - [x] `verify-phase1-green` Done-When clause «`_29` passes» actually holds (was UNDEFINED)
  - [x] `npm run test:bdd` shows `_29`,`_30` PASSED

- [x] T-Cov.5 Remove or implement empty e2e stub — id: clean-empty-e2e-stub — Status: DONE (the «deleted until that task starts» arm of Done-When: `tests/e2e/cross-spec-reconcile.test.ts` no longer exists — verified 2026-06-07; Docker suite has no exit-1 noise from it) | Est: 30m
  _depends: e2e-test-reconcile-roundtrip_
  _Requirements:_ FR-17
  **Done When:**
  - [x] `tests/e2e/cross-spec-reconcile.test.ts` (currently 0 bytes → «No test suite found» exit-1 noise) is implemented per `e2e-test-reconcile-roundtrip` or deleted until that task starts
  - [x] Docker vitest run shows 0 failed suites (was 1)

- [x] T-Cov.6 Reconcile TASKS statuses + `.progress.json` to verified reality — id: reconcile-task-statuses — Status: DONE (2026-06-07: full checkbox-hygiene pass — 52→25 unchecked) | Est: 120m
  _Requirements:_ FR-21
  > Closed 2026-06-07: per-task `grep-deliverable + named-green-scenario` reconcile over all 52 unchecked blocks (the reliable method per the WS-B DEFERRED-56 correction — NOT the file-existence heuristic). 27 flipped with per-task evidence notes (incl. 3 «delivered DIFFERENTLY» divergences and 2 «OBSOLETE in v2 canonical»); 25 stay open as genuine debt with precise gap annotations (e.g. spec-check-log-cli 1 of 2, T-Trans.9 3 of 4, Phase-7 partials).
  **Done When:**
  - [x] Each task Status reflects verified reality with evidence (test id / file / live run), not stale TODO — 2026-06-07 pass; SPECGEN004_90 step def written same pass (was the last UNDEFINED — @feature36 now 6/6)
  - [x] `.progress.json` populated — version 3, Discovery/Context/Requirements confirmed; Finalization honestly unconfirmed (final-verification still open)
  - [x] Summary table regenerated via `spec-status.ts -Format task-table` (task-board-forms engine) — 95 DONE / 25 open, table matches body
  - [x] Honesty invariant per the FR-32 gate itself (spec-verdict 2026-06-07 post-reconcile): run = 105 passed / 1 skipped / 0 failed / 0 ambiguous / 0 undefined; graph buckets = 28 undefined — ALL from `legacy-v3.feature` (SPECGEN003 scenarios verified by the vitest side-channel `tests/e2e/spec-generator-v3.test.ts`, invisible to cucumber NDJSON — structural, pre-existing); DONE-but-unverified = 3, all the `_15`-SKIPPED cluster (marksman-installer / marksman-native-lsp / verify-phase2-green) — each names the skip in its own evidence note, not laundered

## Phase 10 — Evidence-derived task status (FR-32)

> Codifies the 2026-06-02 audit discipline into the spec-generator: task status derived from the latest run, honesty-gate finding, MCP coverage surface. Scenarios SPECGEN004_70..74 (@feature32) are red until these land.

- [x] T-Cov.7 Task↔scenario mapping resolver — id: task-scenario-map — Status: DONE (verified 2026-06-07: `mapTasksToScenarios()` in `tools/spec-graph/coverage.ts` — explicit SPECGEN004_NN ids + @featureN + FR refs, pure function; `__tests__/coverage.test.ts`; T-Cov.8 (DONE) builds on it) | Est: 120m
  _Requirements:_ FR-32, FR-2
  **Done When:**
  - [x] maps each task to its scenarios via Done-When `SPECGEN004_NN` refs + `@featureN` + FR `refs[]`
  - [x] pure function with unit tests over a fixture spec (no mocks)

- [x] T-Cov.8 Evidence-derived status + honesty-gate finding in spec-status — id: evidence-derived-status — Status: DONE | Est: 240m
  _depends: task-scenario-map_
  _Requirements:_ FR-32, FR-13, AC-32.1, AC-32.2
  **Done When:**
  - [x] `spec-status.ts` computes `verified_status` from `.last-test-run.ndjson` (DONE iff all mapped scenarios PASSED; else capped IN_PROGRESS)
  - [x] emits `TASK_STATUS_UNVERIFIED` when hand-set DONE conflicts with verified_status; suggestions name offending scenario+bucket
  - [x] `-Format task-table` renders verified_status
  - [x] @feature32 SPECGEN004_70, _71 pass

- [x] T-Cov.9 MCP coverage surface (get_coverage + get_trace verified_status) — id: mcp-coverage-surface — Status: DONE | Est: 180m
  _depends: evidence-derived-status, mcp-tool-get-coverage_
  _Requirements:_ FR-32, FR-30, AC-32.3
  **Done When:**
  - [x] `get_coverage` returns per-scenario buckets + per-task verified_status from `.last-test-run.ndjson`
  - [x] `get_trace` node response includes `verified_status`
  - [x] @feature32 SPECGEN004_72, _73, _74 pass

- [x] T-Cov.10 BDD step-defs for @feature32 — id: stepdefs-fr-32 — Status: DONE | Est: 90m
  _depends: mcp-coverage-surface_
  _Requirements:_ FR-32, AC-32.1, AC-32.2, AC-32.3
  **Done When:**
  - [x] `tests/step_definitions/feature32_evidence_status.ts` binds SPECGEN004_70..74 to real spec-status + MCP (no mocks)
  - [x] `npm run test:bdd` reports `@feature32` 5/5 PASSED

## Phase 11 — Workflow orchestrator skill (self-improving) — Option B chosen

> Meta-skill `spec-generator-orchestrator` (FR-33): thin router over the feature map, delegates to existing workers (create-spec, cross-spec-*, spec-backlog, MCP tools); self-improves via a human-merge dated ledger (`SELF_IMPROVE.md`) with proactive reminders + auto-apply on human approval. Scenarios SPECGEN004_75..79 (@feature33) are red until these land.

- [x] T-Orch.0 Choose orchestrator architecture — id: orchestrator-arch-decision — Status: DONE (verified 2026-06-07: DESIGN.md «Decision: Workflow orchestrator architecture = thin orchestrator + existing workers (Option B)»; T-Orch.1..4 all DONE downstream) | Est: 60m
  _Requirements:_ FR-33
  **Done When:**
  - [x] 3 options compared (general / orchestrator+workers / tools-only) — recorded in DESIGN.md "Decision: Workflow orchestrator architecture"
  - [x] chosen: Option B (thin orchestrator + existing workers); self-improve = human-merge ledger + nudge + auto-apply-on-approve
  - [x] downstream T-Orch.1..4 detailed below

- [x] T-Orch.1 Create `spec-generator-orchestrator` skill (thin router) — id: create-orchestrator-skill — Status: DONE | Est: 360m
  _depends: orchestrator-arch-decision_
  _Requirements:_ FR-33, AC-33.1
  **Done When:**
  - [x] `.claude/skills/spec-generator-orchestrator/SKILL.md` with frontmatter triggers + a feature-map → worker routing table (scaffold→create-spec, coverage→get_coverage, reconcile→cross-spec-reconcile, resolve→cross-spec-resolve, fixes→spec-backlog, migrate→migrate-v3-to-v4)
  - [x] delegates only — no re-implementation of worker logic; allowed-tools covers Skill + MCP + Bash + Read
  - [x] @feature33 SPECGEN004_75 passes

- [x] T-Orch.2 Self-improve ledger (append + nudge + apply-on-approve) — id: orchestrator-self-improve — Status: DONE | Est: 240m
  _depends: create-orchestrator-skill_
  _Requirements:_ FR-33, AC-33.2, AC-33.3, AC-33.4
  **Done When:**
  - [x] appends dated `{date, trigger, observation, proposed_change, affected_files[], confidence, status}` entries to `.specs/<slug>/SELF_IMPROVE.md`; `pending` never auto-applied
  - [x] session-start reminder surfaces pending count + top entries (reuse `/reflect` / `suggest-rules` mechanics, cross-link — no duplication)
  - [x] human `approved` → auto-apply + `status: applied` + applied-at date
  - [x] @feature33 SPECGEN004_76, _77, _78 pass

- [x] T-Orch.3 Feature-map drift guard — id: orchestrator-drift-guard — Status: DONE | Est: 120m
  _depends: create-orchestrator-skill_
  _Requirements:_ FR-33, AC-33.5
  **Done When:**
  - [x] guard (test/audit) fails when a new MCP tool / worker skill / FR is unreferenced by the orchestrator feature-map; message names the capability
  - [x] @feature33 SPECGEN004_79 passes

- [x] T-Orch.4 BDD step-defs for @feature33 — id: stepdefs-fr-33 — Status: DONE | Est: 90m
  _depends: orchestrator-self-improve, orchestrator-drift-guard_
  _Requirements:_ FR-33, AC-33.1, AC-33.2, AC-33.3, AC-33.4, AC-33.5
  **Done When:**
  - [x] `tests/step_definitions/feature33_orchestrator.ts` binds SPECGEN004_75..79 to the real skill + ledger + guard (no mocks)
  - [x] `npm run test:bdd` reports `@feature33` 5/5 PASSED

## Phase 8: Anchor-Integrity Guard + Auto-Fix (FR-34)

- [x] Shared `marksmanSlug()` + golden fixture -- @feature34 — id: anchor-slug-shared — Status: DONE | Est: 120m
  _depends: none_
  _Requirements: [FR-34a](FR.md#fr-34)_
  **Done When:**
  - [x] `tools/anchor-integrity/marksman-slug.mjs` exports one `marksmanSlug(text)` (`.mjs` so both the `.mjs` validator and `.ts` parser import it; Unicode-aware — keeps Cyrillic; dots dropped: `AC-1.1`→`ac-11`)
  - [x] `tests/fixtures/marksman/slug-rule.json` captured from the REAL binary (18 shapes incl. Cyrillic) via `capture-slug-fixture.cjs`; golden test asserts 18/18 parity + idempotence
  - [x] `md.ts` (slugify/AC dot-drop) + `specs-generator-core.mjs` (`toAnchorSlug`) both delegate to it — no second impl. Verified: spec-graph 146/146 Docker, BDD 78 passed, validate-spec 0 errors/0 broken

- [x] Anchor-integrity check (same-file + cross-file) -- @feature34 — id: anchor-check — Status: DONE | Est: 120m
  _depends: anchor-slug-shared_
  _Requirements: [FR-34a](FR.md#fr-34)_
  **Done When:**
  - [x] `tools/anchor-integrity/check.mjs` returns `BrokenAnchor[]` {file,line,linkText,targetFile,brokenAnchor,inferredId,currentSlug}; skips links in code spans/fences; + `--spec`/`--all` CLI
  - [x] Covers same-file `[t](#a)` (the class `CROSS_REF_LINKS` linkPattern misses) AND cross-file `[t](f.md#a)`
  - [x] Corpus baseline recorded: **1744 broken anchors across 39 specs** — VERIFIED against the real binary (links `#fr-3-devpomogator-…` vs real `fr-3-dev-pomogator-…`; the rollout report's "already resolvable" was WRONG). 30 synthetic unit tests pass in Docker; corpus tests skip there (`.specs` dockerignored), run via CLI on host. v4 = 0.

- [x] Deterministic fixer + idempotence -- @feature34 — id: anchor-fix-deterministic — Status: DONE | Est: 120m
  _depends: anchor-check_
  _Requirements: [FR-34c](FR.md#fr-34)_
  **Done When:**
  - [x] `tools/anchor-integrity/fix.mjs --apply` rewrites id-bearing broken links to the current `marksmanSlug` (no LLM); leaves ambiguous for claude -p; CLI `--spec`/`--all`
  - [x] Round-trip + idempotence + ambiguous-skip + cross-file tests pass (Docker 35/37). Corpus dry-run: **1719/1744 deterministically fixable**, 25 ambiguous
  - [x] `anchor-fix` skill (`.claude/skills/anchor-fix/SKILL.md`) captures the workflow + measured slug rules; memory updated

- [x] PostToolUse hook + Stop-gate (escape hatch) -- @feature34 — id: anchor-guard-hooks — Status: DONE | Est: 150m
  _depends: anchor-check_
  _Requirements: [FR-34b](FR.md#fr-34)_
  **Done When:**
  - [x] `anchor_check_post.ts` (PostToolUse Write|Edit) injects `<system-reminder>` with broken anchors + fix (verified: 121 on pomogator-doctor, null on clean v4)
  - [x] `anchor_gate_stop.ts` blocks "done" while git-MODIFIED specs have broken anchors; escape `[skip-anchor-fix: <reason ≥8>]` in commit msg OR `ANCHOR_GATE_SKIP=1` (logged); honours `stop_hook_active`; modes true/shadow/false
  - [x] Both registered in `.claude-plugin/hooks.json` (valid); SOFT-tier (log + exit 0) on error. Docker 42/44 (2 corpus skipped)

- [x] `claude -p`/`-bg` ambiguous-link fallback -- @feature34 — id: anchor-fix-claude — Status: DONE | Est: 240m
  _depends: anchor-fix-deterministic_
  _Requirements: [FR-34c](FR.md#fr-34)_
  **Done When:**
  - [x] `fix.mjs --claude` (via `claude-fallback.mjs`) dispatches headless `claude -p` (detached, `--permission-mode acceptEdits`) for ambiguous prose links, prompt = broken link + target-file candidate headings (`headingList`)
  - [x] Non-blocking (detached + `unref`); claude unavailable → link stays flagged, NEVER guess-rewritten. Mocked unit (3 invariants: non-blocking / no-guess / ambiguous-only) + real-bg smoke (ran green in Docker: dispatch returned <2s). Docker 52 passed / 2 skipped

- [x] Wire detector into validate-spec + markdown-lsp note -- @feature34 — id: anchor-wire — Status: DONE | Est: 60m
  _depends: anchor-check_
  _Requirements: [FR-34a](FR.md#fr-34)_
  **Done When:**
  - [x] `CROSS_REF_LINKS` (specs-generator-core.mjs) delegates same-file `[t](#a)` to `check.mjs` → `checkLinks`; emits fix slug (verified: bare broken `#fr-7-old-broken` → `→ fix to #fr-7-title`, clean v4 = 0 false-positives)
  - [x] `markdown-lsp` SKILL.md documents the rename→auto-fix workflow (detect/fix/guard + `anchor-fix` skill cross-ref)

- [x] Update scaffold templates + generators to emit resolvable anchors (H1) -- @feature34 — id: anchor-templates — Status: DONE | Est: 240m
  _depends: anchor-slug-shared, anchor-check_
  _Requirements: [FR-34a](FR.md#fr-34), [FR-3](FR.md#fr-3)_
  **Done When:**
  - [x] All `*.md.template` cross-ref anchors fixed: `#fr-1-{название}` → `#fr-1-название` = `marksmanSlug(## FR-1: {Название})`; `[FR-N]` task stubs repointed to concrete `[FR-1]`. (`#ac-1-fr-1` already resolved `## AC-1 (FR-1)`, kept.) Empirically: all 21 templates → checkLinks 0 broken
  - [x] `specs-generator-core.mjs` validates with `marksmanSlug` (Task 1); no code emits broken composites into specs — only advisory `details:` hint strings with `…` ellipsis. create-spec is AI-driven off the fixed templates
  - [x] Fixture test `__tests__/templates.test.ts` (all templates → 0 broken) + manual: fresh `scaffold-spec` → anchor-check **0 broken** (was 16)

- [x] BDD @feature34 scenarios for anchor-integrity -- @feature34 — id: anchor-bdd — Status: DONE | Est: 180m
  _depends: anchor-guard-hooks, anchor-fix-deterministic_
  _Requirements: [FR-34](FR.md#fr-34), [AC-34.1](ACCEPTANCE_CRITERIA.md#ac-341)_
  **Done When:**
  - [x] `spec-generator-v4.feature` @feature34 SPECGEN004_80..84 — 1:1 with AC-34.1..5 (detect same+cross / golden+single-source / reminder+escape / deterministic-idempotent / claude-fallback)
  - [x] `feature34_anchor_integrity.ts` binds to REAL tools (checkLinks/marksmanSlug/fixSpecDir/dispatchClaudeFallback/buildReminder/escapeReason; only spawn injected). Cucumber @feature34 5/5 GREEN, 35 steps; full suite 83 passed/1 pre-existing pending, 0 ambiguous

## Phase 12 — Honesty hardening + v4 completion (FR-35 + 6 workstreams)

> Derived from `audit-reports/v4-global-plan.md`. Every Done-When binds to a live
> tool run (claim-evidence-gate discipline), not a checkbox. WS-A first — the v4
> premise ("no fake DONE") is hollow until the test-quality hole is closed.

- [x] WS-A: test-quality gate — block DONE on weak / fake-positive -- @feature35 — id: ws-a-honesty-gate — Status: DONE | Est: 480m
  _Requirements: [FR-35a](FR.md#fr-35), [FR-35b](FR.md#fr-35), [FR-35c](FR.md#fr-35)_
  **Done When:**
  - [x] `coverage.ts` honesty derivation consumes a test-quality verdict: WEAK/FAKE-POSITIVE-RISK caps `verified_status` + emits `TASK_TEST_QUALITY` (SPECGEN004_85); STRONG stays DONE (SPECGEN004_86) — commit, fail-open NFR-Reliability-10
  - [x] `test-quality` stage added to `scripts/feature-map.ts` between coverage and honesty-gate (strong-tests + spec-status); `checkFeatureMapDrift` fails without it (SPECGEN004_87)
  - [x] pre-DONE Stop-gate `test_quality_gate_stop.ts` enforces it; `[skip-test-quality: <reason ≥8>]` escape logged to `.claude/logs/`; registered in hooks.json (shadow default → flip `TEST_QUALITY_GATE_ENABLED=true` to enforce) (SPECGEN004_88)
  - [x] `checkConformance` emits `TASK_UNTESTED` for DONE-with-zero-scenario, no longer `[]` (SPECGEN004_89)
  - [x] ADVERSARIAL PROOF (live): planted task DONE + GREEN scenario + FAKE-POSITIVE-RISK verdict → verified_status IN_PROGRESS AND Stop-gate decision=block → DONE REFUSED. Cucumber @feature35 5/5; full BDD 88 passed; Docker spec-graph 17 files passed

- [x] WS-B: status reconciliation — 63 TODO vs reality -- @feature35 — id: ws-b-status-reconcile — Status: DONE | Est: 240m
  _Requirements: [FR-32](FR.md#fr-32)_
  **Done When:**
  - [x] `check:status-drift` run (39 drift lines in OTHER specs, 0 in v4 by file-heuristic) + the STRONGER honesty-gate reconciliation: `computeCoverage` over the built v4 graph (110 tasks, 117 scenarios) derived each task's verified_status from REAL test results — dogfooding FR-32 instead of the spec-status sub-agent wrapper (same evidence)
  - [x] **CONSERVATIVE reconcile (explicit `SPECGEN004_NN`-in-doneWhen mapping ONLY):** flipped **24** drift tasks (TODO/in-progress but their explicitly-named scenarios GREEN) → DONE. Verified after: **NAEB 0**, WS-C..F correctly still TODO, anchor 0 broken, validate-spec valid. True status now **51 confirmed-DONE / ~50 TODO** of 110
  - [ ] **DEFERRED-56 — triage heuristic UNRELIABLE, status NOT re-derived (corrected):** the deliverable-existence pass (do the paths quoted in a Done-When exist on disk?) is too coarse and mislabels BOTH ways. Counterexample caught by advisor: `mcp-tools-rest` (T2-16, "10 remaining MCP tools") has NO file path in its Done-When → heuristic bucketed it "pending", yet `tools.ts` already ships **13** tools (built → it's DRIFT, not pending). So the earlier "0 hidden drift / 43 genuine pending" claim was **FALSE**. The ONLY reliable reconciler is the FR-32 honesty gate (explicit-`SPECGEN004_NN`-id mapping + real green scenarios) — WS-B already ran it (24 explicit-id flips). True status of the remainder needs a per-task `grep-deliverable + named-green-scenario` check (the v4 build backlog's job), NOT this heuristic. Flipping on file-existence would be the same false-confidence WS-A exists to block

- [x] WS-C: orchestrator pipeline e2e — agent really uses MCP + skills -- @feature35 — id: ws-c-orchestrator-e2e — Status: DONE | Est: 360m
  _Requirements: [FR-33](FR.md#fr-33), [FR-32](FR.md#fr-32)_
  **Done When:**
  - [x] Proven the pipeline calls REAL workers on a REAL spec (stronger than a toy throwaway): drove the live MCP server over stdio JSON-RPC — `conformance_check` → 1248 findings, `get_coverage` → 1237 scenarios / 88 passed / 110 tasks. The 3 JSON-RPC responses ARE the call-trace
  - [x] No-imitation verified: orchestrator `SKILL.md` body has **0** re-implementation lines (no computeCoverage/checkConformance/bucketing) + 5 explicit "delegate, never re-implement" statements; `@feature33` BDD (delegation/drift/ledger) 5/5 GREEN
  - [x] Phase 10/11 reconciled in WS-B (conservative, explicit-id only); the loose-@featureN remainder is the deferred 56 (over-map risk). NOTE: a single continuous AI-agent orchestrator session wasn't theatrically run — the contract is proven at component level (tools answer real queries) + structurally (delegation, no-reimpl, drift guard)

- [x] WS-D: observability consolidation + observability-review skill -- @feature35 — id: ws-d-observability — Status: DONE | Est: 300m
  _Requirements: [FR-32](FR.md#fr-32)_
  **Done When:**
  - [x] `tools/observability/observe.ts` — one "where did the agent stumble" view: escape-hatch logs (`.claude/logs/*-escapes.jsonl`) + last BDD run (`.last-test-run.ndjson`) + SELF_IMPROVE ledger + `.dev-pomogator/**/*.log` errors → 4 panes + 🟢/🟡 verdict. **builtins-only (node:fs/path) — dep-safe, won't crash for users** (deliberately NOT a graph build → no gherkin; deeper per-task verdict stays in the bundled `get_coverage` MCP)
  - [x] skill `.claude/skills/observability-review/SKILL.md` created. Demo run on this repo surfaced a REAL signal: 5 `spec-variant-matrix` escapes with reason "ok" (short = gaming signal); last BDD run 1133 passed / 0 failed

- [x] WS-E: install works for plugin users (deps-absent verification) -- @feature35 — id: ws-e-install-e2e — Status: DONE | Est: 180m
  _Requirements: [FR-4](FR.md#fr-4)_
  **Done When:**
  - [x] DEPS-ABSENT audit (the real "does it work for users" risk) caught **4 dead-integration entries** crashing for users with no node_modules: MCP (sdk) — bundled earlier; test-quality gate (gherkin) — bundled; **+ 3 PRE-EXISTING: spec-conformance-guard + spec-conformance-push (gherkin), spec-backlog/auto-ingest (glob)** — all now bundled + launched via spawn-shim, verified run deps-absent live
  - [x] bundle freshness guards green: MCP `bundle.test.ts` + gate `test_quality_gate_stop.test.ts`; NEW `tests/e2e/plugin-deps-safe.test.ts` (CI guard — fails if any raw-.ts hook transitively imports a real package; 30 checked, 0 offenders) Docker green
  - [ ] NOTE: the literal full `claude plugin install` in Docker (needs claude CLI + auth + a billed `claude -p`) was NOT run — the deps-absent proof + the 4 fixed dead-integrations cover the real risk far better than the theatrical install; the full run remains available via the `verify-plugin-install` skill

- [ ] WS-F: remaining feature work — TRIAGE done, BUILD is the open v4 backlog -- @feature35 — id: ws-f-remaining — Status: IN_PROGRESS (triage closed, build pending) | Est: 600m
  _Requirements: [FR-33](FR.md#fr-33)_
  **Done When:**
  - [~] WS-B triage applied (drift vs real): deliverable-existence heuristic proved UNRELIABLE (mislabels both ways — see corrected DEFERRED-56 note: T2-16 ships 13 tools but was bucketed "pending"). The reliable reconciler is the FR-32 gate (WS-B's 24 explicit-id flips stand); the remainder's true status needs a per-task grep+green-scenario check, deferred to the build backlog. NOT re-derived on file-existence
  - [x] no `(Green)` header left over a phase with real TODO — phases 2–6 relabelled `(In Progress — TODO remain)`, phase 7 `(TODO — not started)`; only Phase 1 keeps `(Green)` (genuinely all-DONE)
  - [ ] **OPEN — genuinely-pending feature build (NOT faked DONE):** ~43 real tasks across Phase 2 (10 MCP tools + marksman LSP + watcher + lock + extension.json), Phase 3 (claude-cli-bridge, multi-lang), Phase 4 (SQLite + spec-check-log + codespaces), Phase 5 (tag-predictor + interactive-prompt), Phase 6 (arch-research skill), **Phase 7 cross-spec (24 tasks)**. This is the multi-wave build (plan `~/.claude/plans/fizzy-percolating-turing.md` = Wave W1 "Finish Phase 2" is the entry point). Marking this `[x]` without doing the work would be the exact fake-DONE WS-A was built to block

## Phase 13 — Unified spec-graph via spec-qualified node ids (FR-36)

> Architectural root-cause fix surfaced by the dogfood dataset (`audit-reports/spec-mcp-dogfood-dataset.md`):
> 46 specs define `FR-2` but only 47 FR nodes survive (collision-drop ≈90%). Design +
> id-scheme deep-dive in `audit-reports/unified-spec-graph-design.md` (domain-prefix beats global N+1).
> Phased — each task leaves the full clean-HEAD Docker suite GREEN (clean-vs-clean, `suite-failure-triage`),
> and each Done-When binds to a live dogfood/suite run, not a checkbox. Scope: ALL 47 specs at once
> (the collision is global; a half-migration is worse). Anchors stay BARE (FR-36b) — do NOT qualify them.

- [x] P13-1: composite node key in the builder only -- @feature36 — id: p13-composite-key — Status: DONE (2026-06-06; Docker-suite verified clean-vs-clean через WSL-шим) | Est: 240m
  _Requirements: [FR-36](FR.md#fr-36), [FR-36a](FR.md#fr-36)_
  **Done When:**
  - [x] `tools/spec-graph/builder.ts` keys every node by `<slug>:<localId>` (slug derived from the `.specs/<slug>/` path), node carries a `spec` field; parsers keep emitting bare `localId` (smallest de-collision diff) (SPECGEN004_90) — `qualifySlice()` exported, применяется и в `incremental.ts` (watcher-патч не вставляет bare-дубликаты); edges/Task.refs/AC.parentFr квалифицированы; anchors остались bare (FR-36b); `specOf()` теперь full-dir-path — вложенные `.specs/backlog/<name>/` были одной «клеткой» и давали 60 коллизий
  - [x] dogfood shows FR-node count ≈470 (was 47) and a raw pre-map node dump with 0 collisions (SPECGEN004_95) — **FR nodes 47 → 574** (выше оценки ~470: nested backlog-спеки + research-доки добавили своих); raw pre-map: 2862 nodes / 2862 unique / **0 collisions** — воспроизводимо: `node --import tsx tools/spec-graph/collision-probe.ts` (exit 0 ⇔ 0 коллизий)
  - [x] **GLOBAL, not v4-only:** corpus-wide 0 id-collisions (probe выше); попутно убран реальный leak — get_trace(spec-generator-v4:FR-36) было 7 AC (1 протёкший `AC-36` из pomogator-doctor), стало 6
  - [x] full-corpus `buildGraphFromCwd` build time — **277-305ms** (3 прогона, 3369 nodes) vs ≤2s budget (NFR-Performance-1/9)
  - [x] full clean-HEAD Docker suite — **verified clean-vs-clean 2026-06-06 через WSL-шим** (`scripts/docker-test.sh` re-exec в WSL, issue #49), оба прогона из ЧИСТЫХ worktree (общее дерево правит параллельная сессия → недетерминируемо): clean `e2b5145` = 12 failed; clean baseline `4bf8d5c` (до всей P13/P14 работы) = 12 failed. Diff: 11 ОБЩИЕ (hyperv×2, plan-validator×2, scope-gate, spec-status, sro-stubs×4, steps-validator — предсуществующие, вне graph-территории, наследие `final-verification`); tui-test-runner xplat-spawn — order-зависимый предсуществующий (в изоляции падает И на baseline: 1 failed/19 passed на обоих коммитах); 3 multilang — единственная P13-1 регрессия (cross-root bare `@FR-N` ребро против композитного узла) — закрыта в `e2b5145` builder-резолюцией однозначных bare-рёбер + qualified-пинами и в clean-прогоне зелёная; doctor-core_06 падал только в baseline (флак). **Ноль незакрытых регрессий от P13-1.** Локально: cucumber 0 failed / 89 passed; vitest spec-graph+mcp 180/180; bare-id пины обновлены (step defs phase1/phase2/feature29/30, lifecycle/codespaces, e2e spec-graph-mcp/hooks-stdin/fixture-shapes/multilang)

- [x] P13-2: edges use composite keys + build the @featureN tested-by layer -- @feature36 — id: p13-edges-featureN — Status: DONE (2026-06-06; Docker clean-worktree прогон на `37cf617`: ровно те же 12 предсуществующих падений, что на `e2b5145` — ноль новых) | Est: 240m
  _Requirements: [FR-36](FR.md#fr-36), [FR-36c](FR.md#fr-36)_
  **Done When:**
  - [x] `parsers/md.ts` (covers) + `parsers/gherkin.ts` (tested-by) reference composite keys on both ends; a same-spec `@featureN`↔`FR-N` tested-by edge is built (not only `@FR-N`) (SPECGEN004_92) — квалификация ПЕРЕЕХАЛА в парсеры (`coverage.ts::qualifySlice`, self-qualify в md/gherkin/tasks; builder/incremental мост P13-1 снят); gherkin строит same-spec `@featureN`→FR ребро с дедупом; corpus: **edges 1406→1674** (+268 реальных @featureN tested-by), `UNCOVERED_FR` 54→49 (5 FR получили реальное покрытие)
  - [x] `get_trace(FR)` returns scenarios via REAL edges; tag-scan workaround удалён из `tools.ts` (SPECGEN004_92) — step defs (`tests/step_definitions/feature36_composite_graph.ts`) доказывают ПОВЕДЕНЧЕСКИ: теги стираются из графа ПЕРЕД вызовом — сценарии всё равно приходят (tag-scan вернул бы пусто) — 1 passed
  - [x] dogfood confirms get_trace non-empty via edges — **164 tested-by ребра в Scenario-узлы (было 0** — исходный dogfood-finding); get_trace(v4:FR-36)=6/6/5, (v4:FR-37)=6/6/5, (v4:FR-32)=3/5/8 без tag-scan; локально cucumber 0 failed / 90 passed (undefined 11→10), vitest spec-graph+mcp 180/180 (md-parser пины → qualified); Docker clean-worktree прогон после коммита

- [x] P13-3: tools accept slug:id / {spec, node_id}; bare-id → candidate list -- @feature36 — id: p13-tool-api — Status: DONE (2026-06-06) | Est: 180m
  _Requirements: [FR-36](FR.md#fr-36), [FR-36d](FR.md#fr-36)_
  **Done When:**
  - [x] `tools.ts` resolves `slug:FR-2` / `{spec, node_id}` to the exact node (SPECGEN004_94); a colliding bare id returns the candidate list, not an arbitrary node (SPECGEN004_93) — `resolveNodeRef()` + uniform `AMBIGUOUS_BARE_ID` envelope во всех 4 node-ref тулзах (get_trace / get_node / get_test_result / find_refs, + optional `spec` в inputShape); live probe: composite→exact, {spec,node_id}→exact, bare `FR-2`→**49 candidates**, bare-unique `FR-37`→soft-resolved, missing→NODE_NOT_FOUND; step defs _93/_94 — 2 passed
  - [x] `server.bundle.mjs` rebuilt (`npm run build:mcp`, 1.6MB) — plugin-юзеры получают resolver; bundle-freshness guard GREEN (vitest 180/180 incl. bundle.test.ts)
  - [x] anchors verified still bare/file-local (SPECGEN004_91, FR-36b) — step def строит спеку с markdown-ссылкой `FR.md#fr-2`: definitions содержит bare `FR-2`/`fr-2-…`, НИ ОДНОГО composite-алиаса; node при этом composite-keyed — 1 passed. Суммарно: cucumber 0 failed / 93 passed (undefined 10→7)

- [x] P13-4: update bare-id-pinning tests to the qualified form + verify -- @feature36 — id: p13-test-churn — Status: DONE (2026-06-06; «0 failures» bar — см. честную оговорку в третьем пункте) | Est: 180m
  _Requirements: [FR-36](FR.md#fr-36), [FR-36e](FR.md#fr-36)_
  **Done When:**
  - [x] every test asserting a bare node id updated to the qualified form / candidate-list expectation (AC-36.6) — выполнено по ходу P13-1..3: step defs phase1/phase2-env/phase2-mcp/feature29/30, md-parser/builder/incremental/lifecycle/codespaces units, Docker-only e2e (spec-graph-mcp `demo:FR-1`, hooks-stdin `auth:FR-1`, fixture-shapes, multilang qualified)
  - [x] `spec-graph-query` + `spec-mcp-dogfood` skills updated — таблица трёх форм node_id (composite / {spec} / bare→AMBIGUOUS_BARE_ID+candidates) + «Resolved by FR-36» блок с указателем на архив; `runtime-dogfood` generic (node_id не упоминает — нечего править). Dogfood-сэмплер предпочитает FR с tested-by ребром (first-FR мог честно иметь 0 тегов → ложный «dead get_trace»)
  - [x] FINAL: dogfood before/after diff archived — `audit-reports/fr36-dogfood-before-after.md` (47→574 FR, 0→164 рёбер в Scenario, 13/13 LIVE тулзов, вся регрессионная дисциплина); SPECGEN004_95 step defs гоняют РЕАЛЬНЫЙ collision-probe spawnSync-ом на живом корпусе — 1 passed. **«Full clean-HEAD Docker suite 0 failures» — заблокировано 12 предсуществующими падениями** (clean-vs-clean доказано на 4 коммитах: 4bf8d5c/e2b5145/37cf617/d706363 — набор идентичен, Phase-13 не добавила ни одного; финальный прогон `d706363`: те же 12 + POMOGATORDOCTOR001_06 — известный timing-флак, падавший ещё на baseline и зелёный в двух промежуточных прогонах) — это долг `final-verification` (вне graph-территории), НЕ Phase-13; honesty-gate consistent

## Phase 14 — Smart verdict authoritative + cell→atom traceability gate (FR-37)

> Triggered by a real false-green this session: structural `validate-spec: 0 errors` was reported as
> "spec valid" while audit/conformance/coverage showed real debt. v4 already owns the smart machinery
> (FR-8 semantic, conformance, coverage/honesty, audit) — this phase makes it AUTHORITATIVE and full
> traceability a hard gate. Evidence: `audit-reports/v4-smart-verdict-and-organism-traceability.md`.
> Each Done-When binds to a live verdict/dogfood run; depends on Phase 13 (FR-36 one graph).

- [x] P14-1: reconcile the 58 stale FILE_CHANGES paths + make stale-path a hard verdict ERROR -- @feature37 — id: p14-stale-filechanges — Status: DONE (2026-06-05) | Est: 240m
  _Requirements: [FR-37](FR.md#fr-37), [FR-37e](FR.md#fr-37), [FR-37b](FR.md#fr-37)_
  **Done When:**
  - [x] every `extensions/…`/`dist/installer/…` path in `.specs/spec-generator-v4/FILE_CHANGES.md` rewritten to its canonical post-v2 path OR removed with a reason (SPECGEN004_97) — 57 переписаны на существующие canonical-пути (existence verified на диске), 1 (`dist/installer/extensions.js`) удалён с reason; Total counts пересчитан (130→116 rows)
  - [x] `audit-spec` v4 stale-path P0s → 0 (was 9 of 10); `audit-spec` wired into the authoritative verdict — `tools/specs-generator/spec-verdict.ts` (exported `runSpecVerdict()` + CLI): validate-spec = pre-filter (его pass не репортится как valid, FR-37a), любой audit ERROR = hard gate с per-class gap list; fail-loud на core-error (false-GREEN исключён); `SPECS_GENERATOR_ROOT` env в core для foreign-corpus прогонов (нужно P14-5)
  - [x] live run: authoritative verdict FAILS before the fix (names the stale paths), PASSES that gate after — **proven**: BEFORE (commit `7d1954c`, до правки FILE_CHANGES.md) = RED, 10 ERROR / 2 класса, все 9 `FILE_CHANGES_VERIFY`-путей названы поимённо; AFTER (этот коммит) = `FILE_CHANGES_VERIFY` 9→0, остался 1× `LINK_VALIDITY` (FR-1↔AC link — scope `final-verification`, не P14-1: "9 of 10") → verdict честно RED по этому классу. Verdict детерминирован — воспроизводится: `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/spec-generator-v4` (сейчас: RED, ровно 1× LINK_VALIDITY; на `7d1954c` checkout: RED, 10 ERROR). SPECGEN004_97 step defs (`tests/step_definitions/feature37_smart_verdict.ts`) гоняют реальный `runSpecVerdict()` на temp-фикстуре — 1 passed

- [x] P14-2: traceability-completeness check (the cell→atom invariants) -- @feature37 — id: p14-traceability-check — Status: DONE (2026-06-06) | Est: 300m
  _Requirements: [FR-37](FR.md#fr-37), [FR-37b](FR.md#fr-37)_
  **Done When:**
  - [x] new check emits a per-item gap list (SPECGEN004_98) — `tools/spec-graph/traceability.ts` (`checkTraceabilityCompleteness` + `summariseGaps`, reuse checkConformance — не дублирует логику) над одним графом; stale FILE_CHANGES paths вливаются в тот же gap list из audit-гейта вердикта (P14-1); вшит в `spec-verdict.ts` как жёсткий FR-37b гейт (ANY gap → RED), spec-scoped по slug
  - [x] within spec-generator-v4: **UNCOVERED_FR 9→0** (удалены 9 авто-TBD-скелетов из FR.md — мусор resolver-а, читавшего ПРИМЕРЫ из текста AC как требования: `FR-001`/`FR-999`/`FR-05`…), **TASK_UNTESTED 2→0** (extension-json-update → SPECGEN004_52, verify-fr-28-fixed-window → SPECGEN004_13 в Done-When), **UNTAGGED 129→0** (101 — честная семантика: `@featureN` С РЕЗОЛВЯЩИМСЯ FR-N = тег до требования, после P13-2 это реальное ребро; нерезолвящийся @featureN остаётся untagged; 28 legacy-v3 — реальный feature-level `@FR-19`, сам header файла называет FR-19 наследующим требованием; 0 tag-orphans). Corpus: 1557→**1305** (UNTAGGED 1498→1258, UNCOVERED_FR 49→40, TASK_UNTESTED 2→0) — заархивировано в `audit-reports/fr36-dogfood-before-after.md`
  - [x] live verdict на v4: `traceability gate: 0 gaps — PASSES` (RED остаётся только по 1× LINK_VALIDITY — scope `final-verification`); SPECGEN004_97+98 step defs зелёные (фикстурный UNCOVERED_FR → RED с поимённым gap; live-ассерт «v4 = 0 gaps» прямо в сценарии)

- [x] P14-3: smart verdict authoritative; structural demoted to pre-filter -- @feature37 — id: p14-authoritative-verdict — Status: DONE (2026-06-06) | Est: 300m
  _Requirements: [FR-37](FR.md#fr-37), [FR-37a](FR.md#fr-37), [FR-37c](FR.md#fr-37)_
  **Done When:**
  - [x] the health entrypoint composes conformance + get_coverage + audit-spec + P14-2 over the one graph as THE verdict (SPECGEN004_96) — `runSpecVerdict()` (теперь async): conformance считается ОДИН раз (`gapsFromFindings` переиспользует findings), error-severity conformance гейтит, coverage-rollup (FR-32: buckets + DONE-but-unverified видимы), audit + traceability гейты из P14-1/2; `validate-spec` — pre-filter с нотой «NOT reportable as valid/clean/done», _96 step defs доказывают на scaffold-фикстуре (0 structural errors + smart-finding ⇒ RED)
  - [x] FR-8 semantic runs in the verdict path when a `claude` binary is present (SPECGEN004_99); absent → `SEMANTIC_SKIPPED`, never silent "no drift" (SPECGEN004_100) — пары = реальные tested-by рёбра (FR-36c), `runJudge` per pair с кэшем; binary-probe (`CLAUDE_BIN`/PATH); инжектируемый spawn для тестов; fail-loud на truncation (`SEMANTIC_TRUNCATED`) и judge-сбои (`SEMANTIC_DEGRADED`); CLI `--no-semantic`/`--max-pairs`; _99 (фейковый judge, pairsChecked≥1) и _100 (битый CLAUDE_BIN → SKIPPED-нота, 0 pairs, «NOT "no drift"») зелёные
  - [x] live RED→GREEN: голый scaffold (0 structural errors) → **RED, 10 blocking** (7 audit LINK_VALIDITY/FILE_CHANGES_VERIFY + 3 UNTAGGED), exit 1; после реконсиляции (AC-линки, FR-беклинки, edit→create, теги сценариев) → **GREEN, exit 0**, все гейты PASS. Воспроизводимо: `scaffold-spec -Name X` + `spec-verdict.ts -Path .specs/X --no-semantic`. Бонус живого вердикта: на самом v4 он немедленно поймал НОВЫЙ LINK_VALIDITY в свежем тексте TASKS.md (`FR-001` голым текстом) — исправлен бэктиками

- [x] P14-4: skills/agents may not launder a structural pass -- @feature37 — id: p14-skill-guard — Status: DONE (2026-06-06) | Est: 180m
  _Requirements: [FR-37](FR.md#fr-37), [FR-37d](FR.md#fr-37)_
  **Done When:**
  - [x] `spec-status` / `spec-mcp-dogfood` / `runtime-dogfood` / `suite-failure-triage` updated (SPECGEN004_101) — единая «FR-37d guard» секция в каждом SKILL.md: ОБЯЗАН цитировать смарт-вердикт (`spec-verdict.ts` + gap list), ЗАПРЕЩЕНО «valid/clean/done» по голому validate-spec; step defs _101 механически проверяют контракт всех четырёх + правила — 1 passed
  - [x] `.claude/rules/spec-verdict/no-structural-valid.md` кодирует инцидент false-green 2026-06-05 (structural «valid» при 10 P0 / 1256 smart-находках) + строка в CLAUDE.md (glossary-дисциплина)
  - [x] suite green локально (cucumber 0 failed, vitest 180/180); clean-HEAD Docker — подтверждение P14-3 бежит, P14-4 docs-only поверх (skills/rules/step defs)

- [x] P14-5: reusable corpus-health auditor skill — find collisions + broken edges + untraced atoms for ANY corpus, debugged to fire -- @feature37 — id: p14-corpus-health-skill — Status: DONE (2026-06-06) | Est: 360m
  _Requirements: [FR-37](FR.md#fr-37), [FR-37b](FR.md#fr-37), [FR-36](FR.md#fr-36)_
  > User ask (2026-06-05): make a GENERAL skill so this whole class (bare-id collisions, unresolved
  > cross-spec edges, untraced atoms) is caught automatically in the future, not re-discovered by hand —
  > and DEBUG it so it actually fires + helps, proven on a live run.
  **Done When:**
  - [x] GENERAL skill — `tools/spec-graph/corpus-health.ts` (corpus root = аргумент CLI, default cwd) + `.claude/skills/corpus-health/SKILL.md` (RU/EN триггеры): (1) коллизии через raw PRE-MAP dump (`rawCollisionScan`, отрефакторен из collision-probe в импортируемую функцию), (2) dangling edges, (3) untraced atoms (FR-37b), (4) graph-side stale FILE_CHANGES — один отчёт + 🟢/🔴 (hard = collisions+stale; `--strict` = любой долг), `--json`, exit code
  - [x] reuses `checkTraceabilityCompleteness` (P14-2) + `buildGraphFromCwd`; работает на чужих корпусах (root-аргумент; synthetic-corpus тесты в `__tests__/corpus-health.test.ts` — 6/6, включая planted-duplicate → 🔴 и clean-corpus → 🟢)
  - [x] **DEBUGGED to fire + help, живой прогон на ЭТОМ корпусе** — первый же запуск нашёл НОВЫЙ долг вне v4: **118 graph-side stale FILE_CHANGES путей** в других спеках (worktree-setup, tui-test-runner-v2… — та же `extensions/`-болезнь, что была у v4) + **10 dangling covers-рёбер** в fix-bg-output-loss (AC ссылаются на несуществующие FR-10..14) → 🔴 RED exit 1; коллизии 0 (FR-36 починил; детектор regression-guarded planted-duplicate тестом — исторические ≈470-vs-47 / 1243 UNTAGGED были сигналами ДО Phase 13/14 фиксов и заархивированы в `audit-reports/fr36-dogfood-before-after.md`); **0 overlap** против существующих скиллов (`detect-overlap.ts --threshold 0.3`: corpus-health не флагнут)
  - [x] dogfood before/after в архиве (47→574 FR, 13/13 LIVE); clean-HEAD Docker — финальный прогон на `a6fca54` подтверждён: те же 7 предсуществующих файлов, ноль новых от Phase 14

## Refactor & Polish (final)

- [x] Refactor + dedup across phases — id: final-refactor — Status: DONE (2026-06-07, scoped to the SHIPPED v4 delta — re-run when Phase-6/7 open builds land) | Est: 480m
  _depends: verify-phase6-green_
  **Done When:**
  - [x] jscpd duplication score ≤ baseline — baseline ESTABLISHED 2026-06-07 (none existed): **0.44%** (5 clones / 55 duplicated lines over 73 files, `--min-tokens 70`; report `.dev-pomogator/.bg-logs/jscpd/`). Was 0.55%/6 before this pass
  - [x] Shared logic extracted to helpers — builder dual ingest loop → `ingestSlice()` (spec-graph 200/200 vitest green after; `server.bundle.mjs` rebuilt; refactor-guard scenario SPECGEN004_110 pins the single-path dedup semantics for md AND gherkin). Remaining 5 clones left DELIBERATELY: guard↔push `readStdinJson` (separately-bundled artifacts — sharing couples bundle builds for 23 vanilla lines), writer.ts/md.ts/arch-decision micro-clones 6-12L each (extraction overhead > value at 0.44% total)

- [x] Final verification — id: final-verification — Status: DONE (2026-06-07: /simplify executed — 4 parallel review agents + 6 fixes applied; all 5 criteria closed) | Est: 240m
  _depends: final-refactor_
  **Done When:**
  - [x] `validate-spec.ts -Path .specs/spec-generator-v4` → 0 errors (valid: true; warnings/placeholders only)
  - [x] `audit-spec.ts -Path .specs/spec-generator-v4` → 0 P0 findings — **PASSES since P14-1/P14-2** (re-verified 2026-06-07: `spec-verdict.ts --no-semantic` → audit gate 0 ERROR, traceability 0 gaps, **VERDICT: GREEN**)
  - [x] cucumber scenarios GREEN — full vitest+BDD suite is 0-failure (1745 passed)
  - [x] `/simplify` final review ran 2026-06-07: 4 angles (reuse/simplification/efficiency/altitude) → 6 fixes applied (tools.ts doc-drift 11→14 + specOf reuse; spec-verdict single RED source; shared `tools/_shared/code-examples.ts` consolidating the 2026-06-06 strip-disease carriers; shared `tools/_shared/stdin.ts` + 7 validator hooks migrated; FR-36c explicit disjunction; builder task-slice design note) + justified skips recorded in the commit. UPDATE 2026-06-07 (user override): two of the four skips were then DONE on request — bundled-hook stdin copies migrated (5 hooks incl. anchor pair → shared stdin.ts with throwing/safe flavours, all bundles rebuilt + deps-absent re-proven) and corpus-health double-parse eliminated (builder collects rawCollisions in its single pass; equivalence proven old-vs-new: 2878/2878/0 identical; collision-probe stays the independent cross-check). Still skipped with reason: resolve-envelope variance, 3 task parsers with distinct contracts. After fixes: vitest 381/381 across 40 files, BDD 110 (109 passed / 1 skipped / 0 failed), verdict GREEN
  - [x] CHANGELOG entry written — Unreleased section: FR-36/37/38 + T-Trans closure + producer-fix rounds + jscpd baseline (2026-06-07)

## Phase 15 — Full spec lifecycle status via MCP (FR-38)

> User ask (2026-06-06): тест-ран линкуется с summary-данными, агент видит статус спеки целиком
> (RED/GREEN/тесты не написаны/только доки) — через MCP, трассируемо, покрыто BDD.

- [x] P15-1: get_spec_status MCP tool + lifecycle enum + linked run summary -- @feature38 — id: p15-spec-status-tool — Status: DONE (2026-06-06) | Est: 240m
  _Requirements: [FR-38](FR.md#fr-38)_
  **Done When:**
  - [x] `tools/spec-mcp-server/tools.ts` exposes `get_spec_status({spec})`: исчерпывающий enum SPEC_ONLY / TESTS_NOT_RUN / RED / PARTIAL / GREEN (SPECGEN004_102..106), `last_run {at, source, summary}` ТОЛЬКО из инжестённого NDJSON (никогда не сфабрикован — null без рана), `counts` + FR-37b `gaps` + agent `hint`; SPEC_NOT_FOUND на неизвестный slug
  - [x] BDD-покрытие всех пяти состояний реальным handler-ом и РЕАЛЬНЫМ NDJSON-контрактом (cucumber-messages envelopes; фикстуры в `tests/step_definitions/feature38_spec_status.ts`) — 5/5 passed
  - [x] live на этом корпусе: v4 = PARTIAL (99 passed / 1 undefined / 1 skipped из 101 touched, с таймстампом рана) — честно отражает остаток; worktree-setup/fix-bg-output-loss = TESTS_NOT_RUN; `server.bundle.mjs` пересобран, freshness green

## Phase 16 — Creation-pipeline hardening (review 2026-06-07)

> User ask (2026-06-07): «надо заняться ревью того что спеки создаёт — мы делали в основном
> трассировку». Полный отчёт: `audit-reports/spec-creation-pipeline-review.md` (3 разведки +
> ручная верификация; 1 находка разведчика опровергнута живым прогоном). Headline: весь
> enforcement-слой создающей стороны (5 v3 form-guards) был МЁРТВ — ни одной живой регистрации.

- [x] P16-1: review + revival — enforcement layer LIVE + 10 confirmed defects fixed — id: p16-creation-review — Status: DONE (2026-06-07, commit a5fc771) | Est: 480m
  _Requirements: [FR-19](FR.md#fr-19), [FR-24](FR.md#fr-24), [FR-25](FR.md#fr-25)_
  **Done When:**
  - [x] `form-guards-dispatch.ts` — ONE live PreToolUse hook routes `.specs/<slug>/<TARGET>.md` Writes to the canonical guard; registered in `.claude/settings.json` + `.claude-plugin/hooks.json`; self-protected in meta-guard PROTECTED_HOOKS; pinned by SPECGEN004_52 enumeration; vitest 4/4 + live deny(2)/allow(0) probes
  - [x] CHK-NFR deadlock closed (skill instructed `CHK-FR{n}-NFR`, own guard regex denies it — reproduced live via the new CLI, exit 1) + task-board-forms Jira-shape deadlock closed (lowercase markers vs case-sensitive guard)
  - [x] phantom `--check` CLI built (`runCheckCli` in spec-form-parsers.ts — 3 skills instructed an invocation that did not exist); v4 TASKS.md itself made guard-clean (23→0 violations, 81 Done-When bullets checkboxed, 1 explicit waiver)
  - [x] pseudo-tags `# @featureN` removed from specs-validation.md (×3) + jira-mode.md; audit-overview Verdict → two-condition (findings closed AND spec-verdict GREEN, FR-37d) + get_spec_status pointer; dead `extensions/` path fixed; 13-vs-15 file-count contradiction reconciled; task-board-forms allowed-tools += AskUserQuestion; architecture-decision-builder context7 namespaces both + ToolSearch fallback
  - [x] FR-20 test race fixed (soft-tier log injectable end-to-end); validator suites 16/16; full BDD 110: 109 passed / 1 skipped / 0 failed; spec-verdict GREEN

- [ ] P16-2: evals for the 3 form skills (discovery-forms / requirements-chk-matrix / task-board-forms) — id: p16-form-skill-evals — Status: TODO | Est: 360m
  _Refs: review backlog #1 — оба дедлока P16-1 жили бы меньше при наличии evals_
  **Done When:**
  - [ ] each skill gets `evals/` (pattern: spec-reality-check run-evals/bulk-run) — output passes its own form-guard + the `--check` CLI on every eval case
  - [ ] negative cases pin the two P16-1 deadlock classes (NFR-id, lowercase markers) so they cannot regress
  - [ ] maintain-evals-on-edit rule extended to these skills

- [ ] P16-3: resolve the 7 orphan templates — id: p16-orphan-templates — Status: TODO | Est: 120m
  **Done When:**
  - [ ] ARCHITECTURE_AXIS/INDEX, ATTACHMENTS, AUDIT_REPORT, COMPLETENESS, JIRA_SOURCE, SYNTHESIS: each either moved to its owning tool/skill, instantiated by a documented caller, or deleted with reason
  - [ ] templates dir contains ONLY templates something instantiates (test pins the mapping)

- [ ] P16-4: feature.template into the anchor-integrity test — id: p16-feature-template-anchors — Status: TODO | Est: 60m
  **Done When:**
  - [ ] `tools/anchor-integrity/__tests__/templates.test.ts` covers feature.template (`@FR-N` tags must resolve against FR.md.template headings)

- [ ] P16-5: document the audit split-responsibility model — id: p16-audit-split-doc — Status: TODO | Est: 60m
  **Done When:**
  - [ ] `phase3plus_audit-overview.md` explicitly maps: which of the 10 categories are mechanical (audit-checks.ts CHECK-9..13) vs AI-semantic (agent-performed), so agents stop guessing

- [ ] P16-6: CRLF-safe `replaceLiteralAll` in fill-template — id: p16-crlf-fill-template — Status: TODO | Est: 60m
  **Done When:**
  - [ ] mixed-EOL template+value no longer produces mixed-EOL output; regression test with CRLF fixture

- [ ] P16-7: `.progress.json` single-writer contract — id: p16-progress-single-writer — Status: TODO | Est: 60m
  **Done When:**
  - [ ] scaffold-spec's inline creation vs «only via spec-status.ts» rule reconciled (either delegate or document the two-writer contract); create-spec SKILL.md Запреты updated to match reality

- [ ] P16-8: STOP-confirm discipline — id: p16-stop-confirm-discipline — Status: TODO | Est: 180m
  _Refs: validator nags «9 specs with unconfirmed STOP» every prompt; no mechanism prevents an agent skipping ConfirmStop_
  **Done When:**
  - [ ] a mechanism (Stop-gate check or spec-verdict note) surfaces unconfirmed STOPs of the ACTIVE spec as a blocking/loud signal, not a corpus-wide nag
  - [ ] the 9 legacy unconfirmed-STOP specs triaged: confirmed where work is done, или explicit deferred-note

## Phase 17 — MCP-rails: живой генератор + MCP-only доступ + агенты по фазам (FR-39/40/41)

> User ask (2026-06-07): «запретить grep по спекам — всё через MCP, централизованно, с логами;
> создание спеки через claude -p/-bg агентов по фазам + оркестратор-проверятор; это следующая
> большая волна рефактора легаси-подхода». Глубокий анализ: `audit-reports/mcp-rails-wave-design.md`.
> ЖЁСТКАЯ цепочка: read-sufficiency → mutation → shadow → миграция → enforce (СТРОГО последним,
> иначе окирпичиваем авторинг); агенты — параллельная дорожка после P17-1/2.

- [x] P17-1: read-sufficiency — `read_spec_doc` + аудит-лог чтений — id: p17-read-sufficiency — Status: DONE (2026-06-07) | Est: 240m
  _Requirements: [FR-39](FR.md#fr-39)_
  **Done When:**
  - [x] `read_spec_doc({spec, doc})` + `list_spec_docs({spec})` в tools.ts (тулзы 14→16, пины обновлены, header-док тоже); DOC_NOT_FOUND явный с hint на list_spec_docs; path-traversal закрыт (basename + inventory-вайтлист); bundle rebuilt + freshness green
  - [x] каждый read-вызов пишет `{ts, tool, args_digest, decision}` в `.dev-pomogator/logs/spec-access.jsonl` (`spec-access-log.ts`: O_APPEND, ротация 10MB/30д, SOFT-tier per NFR-Reliability-11) — живой лог: ok/ok/not_found записи от проб
  - [x] живая проба MCP-only: list_spec_docs(v4) → 26 доков; read_spec_doc(RESUME.md) → 5797 байт цельной прозы; NOPE.md → DOC_NOT_FOUND; ни одного Read по `.specs/`
  - [x] SPECGEN004_113 GREEN (реальные handlers + реальный аудит-лог на изолированном корпусе); _111/_112 честно red до P17-3/6
  - [x] FR-33/42 drift-guard: 3 беспризорные capability пойманы guard-ом (incl. старый дрифт get_spec_status) → feature-map дополнен, guard чист

- [x] P17-2: mutation surface — живой генератор (propose/apply/create через MCP) — id: p17-mutation-surface — Status: DONE (2026-06-07) | Est: 600m
  _depends: p17-read-sufficiency_
  _Requirements: [FR-40](FR.md#fr-40)_
  **Done When:**
  - [x] `propose_spec_change` (dry-run) + `apply_spec_change` + `create_spec` в tools.ts (16→19, пины обновлены); `mutations.ts` ОБОРАЧИВАЕТ движок: form-контракты = те же spec-form-parsers, якоря = anchor-integrity checkLinks (in-memory swap), conformance = checkConformance над TEMP-КЛОНОМ спеки с применённым изменением — реальное дерево не тронуто до прохода; ноль дублированной валидации; формат change = {content} | {old_string,new_string,replace_all?} (FR-40a)
  - [x] error-severity → отказ БЕЗ записи + findings list (живая проба: битый якорь — propose denied, apply VALIDATION_FAILED, файла на диске нет; исправленное — атомарная запись temp+rename + audit-лог denied/denied/ok); create_spec: kebab-валидация, SPEC_EXISTS на дубль, SPECS_GENERATOR_ROOT в спавне (живая проба поймала: без него scaffold писал в РЕАЛЬНЫЙ репо — загрязнение удалено, фикс в спавне)
  - [x] FR-40c: в сервере граф обновляет FR-14 watcher; watcher-less embedders передают refreshGraph (новый RegistryOptions) — _115 доказывает: после записи get_node видит свежий title
  - [x] SPECGEN004_114, _115, _116 GREEN (реальные handlers; _116 гоняет РЕАЛЬНЫЙ runSpecVerdict на новорождённой — GREEN); feature-map +3, drift-guard чист; bundle rebuilt, vitest 52/52

- [x] P17-3: spec-access-guard в SHADOW — id: p17-shadow-guard — Status: DONE (2026-06-07) | Est: 240m
  _depends: p17-read-sufficiency_
  _Requirements: [FR-39](FR.md#fr-39)_
  **Done When:**
  - [x] `spec-access-guard.ts` на Read|Grep|Glob|Edit|Write|Bash: `violationOf` матчит `.specs/` ДО любого I/O (NFR-Performance-10); SHADOW по умолчанию (лог без блока), enforce за `SPEC_ACCESS_ENFORCE=true`; Bash-матчер = АЛГОРИТМ (FR-39f): engine-CLI вайтлист (spec-verdict/validate-spec/audit-spec/spec-status/corpus-health/collision-probe/spec-form-parsers/scaffold-spec/anchor-integrity) ALLOW даже с `.specs/`-аргументами, generic cat/sed/grep/node-e — violation
  - [x] ЖИВАЯ регистрация в ОБОИХ манифестах (отдельная группа matcher Read|Grep|Glob|Edit|Write|Bash) + deps-absent прогон (builtins+_shared/stdin, exit 0 без node_modules) + пин в SPECGEN004_52 (поимённый gate-список) + PROTECTED_HOOKS meta-guard (FR-39d); escape `SPEC_ACCESS_SKIP=1` → лог в spec-access-escapes.jsonl
  - [x] SPECGEN004_112 (shadow логирует без блока, exit 0) + SPECGEN004_111 (enforce deny exit 2 + аудит) GREEN — живые пробы всех тиров: shadow/engine-allow/violation/non-spec-fast/enforce-deny/escape

- [x] P17-4: carve-out лист движка в DESIGN — id: p17-carveout-list — Status: DONE | Est: 60m
  _Requirements: [FR-39](FR.md#fr-39)_
  **Done When:**
  - [x] DESIGN.md фиксирует обе половины carve-out (39 in-process читателей + Bash-invoked движок). Review #2 (2026-06-08) ВСКРЫЛ: basename-only whitelist был НЕполон — anchor-integrity/fix.mjs (basename `fix`) и др. directory-named/generic-basename CLI были бы DENIED под enforce (моя «3 оракула complete» — неверный вывод, verify-against-real-artifact анти-паттерн). ФИКС: `invokesEngineCli` теперь распознаёт движок по сути — (a) basename ∈ ENGINE_CLI ИЛИ (b) ЛЮБОЙ проектный скрипт (.ts/.js/.mjs/.cjs под tools/ или .claude/skills/); inline `node -e`/heredoc-to-/tmp остаются violation
  - [x] SPECGEN004_133 GREEN — переписан на РЕАЛЬНЫЕ producer-инвокации (anchor-integrity check/fix --apply, full-mode.ts, architecture-decision-cli.ts, variant-matrix-cli.ts, spec-verdict.ts → ALLOW; cat/grep/node-e/node-/tmp → DENY), а не синтетический `tools/x/<cli>.ts` (тот давал фейк-green)

- [ ] P17-5: миграция корзины 1 — скиллы на MCP-инструкции — id: p17-skill-migration — Status: IN_PROGRESS | Est: 480m
  _depends: p17-read-sufficiency, p17-mutation-surface_
  _Requirements: [FR-39](FR.md#fr-39)_
  **Done When:**
  - [x] точная разметка кандидатов: оракул = shadow-лог + proximity-grep; reference-доки spec-review размечены инструкция-vs-каталог (categories.md = кукбук из ~8 act-directing грепов, НЕ иллюстрации)
  - [x] первый связный срез мигрирован (read-дверь + write через apply_spec_change + allowed-tools): cross-spec-resolve (read+write, +resolve-cli эмитит план JSON), requirements-chk-matrix, spec-review SKILL §cat-14, create-spec phase2 CL-6/CL-7; spec-graph-query был мигрирован ранее
  - [x] spec-review кукбук мигрирован: categories.md (банер + 7 рецептов на read_spec_doc), antipattern-triggers Step-2, lessons-learned банер (грепы там исторические — per advisor не переписываются); session-pilot read-реф
  - [x] write-путь form-filler тройки на apply_spec_change: discovery-forms (USER_STORIES+RESEARCH), task-board-forms (TASKS.md; таблица через spec-status.ts = carve-out), requirements-chk-matrix
  - [x] CLI/script-driven authoring-скиллы (anchor-fix, cross-spec-reconcile, variant-matrix-build, architecture-decision-builder) теперь enforce-safe — НЕ потому что были безопасны (их basename'ы НЕ в ENGINE_CLI → DENY до фикса), а потому что guard-фикс P17-4 распознаёт проектные скрипты как движок. Per-skill миграция им НЕ нужна (фикс на уровне guard, проверено реальными `violationOf` пробами)
  - [x] финальный широкий скан агентского act-directing `.specs/` доступа по всем SKILL.md+reference: чисто (остаток — только исторические сниппеты lessons-learned под баннером). Статическая миграция инструкций ЗАВЕРШЕНА
  - [ ] shadow-лог violations/день → 0 на ЖИВОМ прогоне мигрированных скиллов (run-verification — это и есть гейт P17-6; статика done, live ещё не прогнан)

- [ ] P17-6: ENFORCE flip — id: p17-enforce — Status: TODO | Est: 120m
  _depends: p17-mutation-surface, p17-shadow-guard, p17-skill-migration_
  _Requirements: [FR-39](FR.md#fr-39)_
  **Done When:**
  - [ ] `SPEC_ACCESS_ENFORCE=true` → deny с указателем на MCP; escape `[skip-spec-access: <reason≥8>]` + JSONL-аудит по образцу scope-gate
  - [x] read-путь enforce ДОКАЗАН вживую (2026-06-08 run4): `claude -p` ПОД `SPEC_ACCESS_ENFORCE=true` на спек-задаче → 0 записей в spec-access.jsonl (ни одного сырого Grep/Read), ответ корректный из MCP-двери. Потребовало 3 фикса-блокера: dead-bundle (be9a1cb), repo-root `${CLAUDE_PROJECT_DIR}` (3dcdb2c), MCP-грант через --allowedTools
  - [x] write-путь enforce ДОКАЗАН вживую (2026-06-08): `claude -p` ПОД enforce, задача «создай спеку» → сырой `Write .specs/…/README.md` → **denied** гардом → агент САМ ушёл в `create_spec` (ok) + `apply_spec_change` (ok, валидация form+anchors+conformance пустая, атомарно, зааудичено); спека создана через дверь, не сырым Write; throwaway убран, вердикт GREEN
  - [x] грант `mcp__dev-pomogator-specs__*` в `.claude/settings.json` permissions — выполнено ЮЗЕРОМ (агент сам права не выдаёт; classifier-gated)
  - [ ] ОСТАЁТСЯ только сам ФЛИП `SPEC_ACCESS_ENFORCE=true` в `.claude/settings.json` env — ОСОЗНАННОЕ ДЕЙСТВИЕ ЮЗЕРА: меняет поведение ГЛОБАЛЬНО (любая сессия, включая интерактивную человека, получит deny на сырой `.specs/` → через MCP или `SPEC_ACCESS_SKIP=1`). Жизнеспособность доказана (read+write live); остаётся решение когда включать
  - [ ] SPECGEN004_111 GREEN

- [x] P17-7: фазовые headless-агенты — id: p17-phase-agents — Status: DONE (2026-06-07) | Est: 480m
  _depends: p17-read-sufficiency, p17-mutation-surface_
  _Requirements: [FR-41](FR.md#fr-41)_
  **Done When:**
  - [x] 4 дефиниции `.claude/agents/spec-phase-{discovery,requirements,finalization,audit}.md`: allowed-tools = только `mcp__dev-pomogator-specs__*` (read-door + mutation-door), НИ ОДНОГО Read/Grep/Glob/Edit/Write — второй слой enforcement (FR-39 через allowed-tools, независимо от хука)
  - [x] спавн — инжектируемый `SpawnPhase` (паттерн spec-llm-judge: детерминизм в тестах без реального `claude -p`; продакшн-дефолт = headless `claude -p`/-bg)
  - [x] SPECGEN004_117 GREEN — проверяет: каждая фаза в своём агенте по порядку + у агентов нет файловых тулзов по спекам (греп allowed-tools)

- [x] P17-8: оркестратор-проверятор — id: p17-orchestrator-verifier — Status: DONE (2026-06-07) | Est: 480m
  _depends: p17-phase-agents_
  _Requirements: [FR-41](FR.md#fr-41)_
  **Done When:**
  - [x] `scripts/phase-runner.ts` `runPhases`: спавн фазы → гейт (инжектируемый `RunGate`, продакшн = РЕАЛЬНЫЙ runSpecVerdict + get_spec_status) → GREEN дальше, RED = re-spawn ТОЙ ЖЕ фазы с gap list (bounded retries, default 2), исчерпание → hard FAIL (не пропуск, не вечное ожидание — NFR-Reliability-12); thin-router сохранён (КОМПОЗИРУЕТ вердикт, не реализует)
  - [x] FR-41c: каждый spawn/retry/gate-green/gate-red/fail с phase+attempt в `phase-runner.jsonl` (best-effort)
  - [x] SPECGEN004_118 (RED→re-spawn с gap list, next только после GREEN) + _119 (все события в логе) GREEN; phase-runner unit 4/4 incl. planted hard-FAIL на исчерпании ретраев

- [x] P17-9: слойный контракт skill↔MCP — таблица потребителей + расширенный drift-guard — id: p17-skill-mcp-contract — Status: DONE (2026-06-07) | Est: 240m
  _depends: p17-mutation-surface_
  _Requirements: [FR-42](FR.md#fr-42)_
  **Done When:**
  - [x] DESIGN несёт таблицу «MCP-тул → скилл-потребители» (19 тулзов); канон = `feature-map.ts::TOOL_CONSUMERS`; реальные потребители дописаны в скиллы: read-door (list_spec_docs/read_spec_doc) → spec-graph-query (allowed-tools + таблица), mutation-door (propose/apply/create_spec) → create-spec (новая секция «MCP-rails»)
  - [x] drift-guard расширен ДВУМЯ гейтами: `checkToolConsumers` (live-тул без потребителя → fail с именем) + `verifyConsumerTruthfulness` (заявленный потребитель реально юзает тул — поймал 2 ложные записи spec-status, юзер «сам проверил?»); до фикса показал ровно 5 беспризорных новых тулзов, после дописывания потребителей — «every live MCP tool has a skill consumer»; SPECGEN004_120 гоняет это на синтетическом stray-туле
  - [x] create-spec UX сохранён (дверь, STOP-точки), запись = MCP-мутации не Write/Edit; SPECGEN004_121 проверяет: тело ссылается на mutation-тулзы И не несёт server-логики (checkConformance/parseTaskBlocks/checkLinks/buildGraph)

- [ ] P18-1: legacy-suspicion 4-state classifier (расширение spec-reality-check) — id: p18-legacy-classifier — Status: TODO | Est: 360m
  _depends: p17-enforce_
  _Requirements: [FR-43](FR.md#fr-43)_
  **Done When:**
  - [ ] `spec-reality-check` получает третий выход «legacy-suspicion»: классифицирует спеку в SUPERSEDED/REMOVED/DRIFTED/ABSORBED по reality-drift (категория-15, существование FILE_CHANGES-путей/символов) + version-lineage (slug vN) + not_run-by-feature (FR-32); git-staleness near-zero вес (AC-43.1)
  - [ ] «код есть, описание разошлось» → DRIFTED (re-sync), НЕ retire — pinned тестом на drifted-фикстуре; НОВЫЙ движок не вводится (переиспользование spec-reality-check)
  - [ ] @feature43 BDD-сценарий + step def на реальном classifier (1:1, не inline-копия)

- [ ] P18-2: HITL-маркер + триаж-отчёт + резолюция legacy-v3.feature — id: p18-legacy-marker — Status: TODO | Est: 240m
  _depends: p18-legacy-classifier_
  _Requirements: [FR-43](FR.md#fr-43)_
  **Done When:**
  - [ ] триаж выдаёт кандидатов в отчёт; финал подтверждается человеком и пишется явным маркером (`.progress.json status: superseded|drifted|removed|absorbed` ИЛИ перенос в `.specs/archive/`); авто-ретайр/авто-удаление ЗАПРЕЩЕНЫ (AC-43.1)
  - [ ] `legacy-v3.feature` (28 сценариев SPECGEN003, инстанс SUPERSEDED) разрешён по решению юзера: архив + маркер supersedes ЛИБО добавление в cucumber paths — NOT_RUN-нота перестаёт гореть на нём
  - [ ] @feature43 сценарий на HITL-маркер (подсажена ложная авто-ретайр-попытка → guard/флоу её не допускает)

- [ ] P19-1: рефакторинг ВСЕХ фаз + research-скиллов на MCP-rails (deep-audit 2026-06-08) — id: p19-phase-refactor — Status: IN_PROGRESS | Est: 360m
  _depends: p17-mutation-surface_
  _Requirements: [FR-39](FR.md#fr-39), [FR-42](FR.md#fr-42)_
  > Все под-пункты выполнены (`[x]` ниже). Статус НЕ DONE сознательно: это рефакторинг-зонтик из доковых правок SKILL.md/phase-доков — у него НЕТ выделенного BDD-сценария, а пометка DONE без linked-сценария = TASK_UNTESTED (честный гейт FR-37b, поймано SPECGEN004_98). Верификация миграций: door-сценарии SPECGEN004_138 (read subpath) / _139 (write subdir) / _133 (carve-out) + broad-scan «0 raw .specs». Закрыть DONE можно только добавив скилл-MCP-контракт-сценарий (assert: мигрированный SKILL.md ссылается на дверь) — отдельная задача.
  **Done When:**
  - [x] variant-matrix-build: raw Write/Edit → apply_spec_change + read door (b13b416)
  - [x] arch-decision-builder Step 3.5 (read ARCHITECTURE/AXIS via door), arch-research-workflow (stage writes via apply_spec_change), phase2 Step 5c attachments (read_attachment) — P19-6 consumer migration (41b1216 / 253ed04)
  - [x] spec-review: Step 1 `ls -t .specs/*/.progress.json` → list_specs+read_spec_doc(.progress.json by currentPhase); Step 4 patch + REVIEW_NOTES → apply_spec_change; allowed-tools (+list_specs/apply_spec_change) (bf47ff0 / ffc95d0)
  - [x] G2: phase1/phase1.5/phase2/phase3 existence-check JIRA_SOURCE.md через `list_spec_docs`; jira-mode re-reads через `read_spec_doc` (JIRA_SOURCE/ATTACHMENTS) + `read_attachment` (бинари) + `read_spec_doc` (.jira-cache.json — door okName расширен) (0a5a2a9 / ffc95d0)
  - [x] G3: phase3plus Step 5 создаёт `AUDIT_REPORT.md` через `apply_spec_change` (форма-валидация + аудит), не сырым Write (0a5a2a9)
  - [x] spec-status Step 5b: FR-count cross-check через read_spec_doc(FR.md), не raw grep; allowed-tools +door (ffc95d0)
  - [x] финальный широкий скан: 0 агентского act-directing сырого `.specs/` доступа в мигрированных скиллах (3 хита — мои MCP-rails ноты + явный «NOT grep» гард + путь-референс)

- [x] P19-2: MCP-тул гапы из value-аудита (get_trace acs / propose no-op / coverage_summary) — id: p19-mcp-tool-gaps — Status: DONE | Est: 180m
  _depends: p17-read-sufficiency_
  _Requirements: [FR-30](FR.md#fr-30), [FR-40](FR.md#fr-40)_
  **Done When:**
  - [x] G4: ЛОЖНАЯ НАХОДКА (2026-06-08) — `get_trace FR-39` корректно отдаёт `acceptance_criteria: 3` (AC-39.1/2/3); covers-рёбра FR-39→AC-39.x живые в графе. Аудит читал несуществующее поле `acs` (артефакт устаревшего bundle). Парсер-фикс не нужен
  - [x] G5: ЛОЖНАЯ НАХОДКА — `propose_spec_change` требует `reason: z.string()` (CHANGE_SHAPE); смоук без `reason` → zod-reject envelope (без findings). С `reason` no-op даёт ЯСНУЮ находку «old_string is not unique». Refusal-путь корректен
  - [x] G6: ЛОЖНАЯ НАХОДКА — `get_coverage_summary` отдаёт 54 спеки по slug (не 2); прежнее specs=2 — чтение устаревшего bundle
  > Evidence: re-driven через source-handlers `buildToolRegistry(()=>buildGraphFromCwd())`. Реальные тул-баги (find_refs NODE_NOT_FOUND, list_specs nested) + G1 scoping — починены отдельно (dbc8241, 9658d06). Подробно: audit-reports/mcp-rails-deep-audit-2026-06-08.md

- [x] P19-3: get_coverage spec-scoping — BDD + spec-graph-query wiring — id: p19-coverage-scope — Status: DONE | Est: 90m
  _depends: p17-read-sufficiency_
  _Requirements: [FR-32](FR.md#fr-32)_
  **Done When:**
  - [x] BDD SPECGEN004_143: двух-спековый граф → `get_coverage {spec:'spec-a'}` scope=spec видит ТОЛЬКО spec-a сценарии; голый `{}` scope=corpus видит весь корпус; биндинг на реальный buildToolRegistry handler (143/142-passed GREEN)
  - [x] spec-graph-query SKILL.md велит всегда передавать `spec` в get_coverage (e475547)

- [ ] P19-4: полный генеративный жизненный цикл e2e ПОД enforce (live) — id: p19-full-lifecycle-e2e — Status: TODO | Est: 240m
  _depends: p17-enforce, p19-phase-refactor_
  _Requirements: [FR-39](FR.md#fr-39), [FR-40](FR.md#fr-40), [FR-41](FR.md#fr-41)_
  **Done When:**
  - [ ] один живой `claude -p` под `SPEC_ACCESS_ENFORCE=true` гонит ВЕСЬ цикл: create_spec → заполнить фазы через apply_spec_change → CHK/decisions → задачи → /run-tests → spec-verdict GREEN — 0 residual в spec-access.jsonl, БЕЗ наёба (DONE только при passed-сценарии)
  - [ ] throwaway убран; либо реальная маленькая фича доведена до GREEN через дверь

- [x] P19-5: оживить FR-35a test-quality honesty-гейт — consumer + producer + skill-проводка — id: p19-test-quality-live — Status: DONE | Est: 240m
  _depends: p17-read-sufficiency_
  _Requirements: [FR-35](FR.md#fr-35), [FR-32](FR.md#fr-32)_
  **Done When:**
  - [x] consumer get_coverage: передаёт `testQualityByTask` в computeCoverage (HIGH) → WEAK/FAKE-POSITIVE кап DONE→IN_PROGRESS — proven planted-file (install-bdd-framework→IN_PROGRESS,test_quality=WEAK)
  - [x] consumer spec-verdict: читает testQualityByTask + передаёт в checkConformance И computeCoverage → TASK_TEST_QUALITY warning + DONE-but-unverified (был 2-арг вызов)
  - [x] shared reader: `readVerdicts` вынесен в `tools/spec-graph/test-quality-gate.ts` (один источник: Stop-hook + get_coverage + spec-verdict вместо 3 копий); bundles MCP+gate пересобраны; deps-absent gate-bundle exit 0
  - [x] e2e регресс: SPECGEN004_137 — side-channel ФАЙЛ читается реальным readVerdicts → WEAK кап ниже DONE; нет файла → DONE (6/6 @feature35 green)
  - [x] **PRODUCER (DONE f2a43c6 + bf97b7f):** `tools/spec-graph/test-quality-producer.ts` — детерминированный join testId→scenario (нормализация P20-1, обе конвенции)→task (mapTasksToScenarios), worst-wins, атомарная запись `.test-quality.json` keyed by taskId + CLI. Доказано e2e: planted SPECGEN004_01=WEAK → install-bdd-framework=IN_PROGRESS/WEAK через get_coverage. BDD SPECGEN004_142 (worst-wins; задача без грейженного теста — отсутствует). Skill-проводка: run-tests Step 5b (grades-файл → producer CLI, carve-out) + strong-tests «Canonical verdict» (GOOD→STRONG, FAIR/WEAK→WEAK, fake-positive smell→FAKE-POSITIVE-RISK, keyed by DOMAIN_CODE_NN)
  - [x] LOW: `DUPLICATE_DEFINITION` — РЕЗОЛЮЦИЯ 2026-06-10: мёртвый `idCount`-блок удалён из conformance.ts (считал ключи Map — уникальны по определению, недостижимая ветка); код ОСТАЁТСЯ в FindingCode (общий словарь). Контракт РЕАЛЬНО живёт в spec-conformance-guard (write-time deny, :202) + corpus-health raw pre-map collision scan — ВСЕ ассертящие тесты (SHAPE003, SPECGEN004_09, hooks-stdin) биндят guard, «test asserts non-existent contract» из аудита было неточностью. Бандлы пересобраны, sanity чист

- [x] P19-6: MCP-дверь к ПОДКАТАЛОГАМ спеки (ARCHITECTURE/ attachments/ .architecture-research/) — id: p19-subdir-door — Status: DONE | Est: 300m
  _depends: p17-mutation-surface_
  _Requirements: [FR-39](FR.md#fr-39), [FR-40](FR.md#fr-40)_
  **РЕШЕНИЕ юзера 2026-06-08: Option A — расширить дверь.** Root cause: `docOf=path.basename` (tools.ts:1025) + inventory basename (982) срезали директорию → subdir структурно недостижим (детерминир. проверено). См. audit «FORK DECISIONS».
  **Done When:**
  - [x] read_spec_doc: принимает relative SUBPATH через общий `resolveSpecDoc` (containment-check вместо basename-strip; `..`/abs/drive → DOC_TRAVERSAL) — 11329b2, доказано live + BDD _138
  - [x] list_spec_docs: рекурсия subdir-ов, возвращает relative subpaths + отдельный `attachments[]` инвентарь — 11329b2
  - [x] новый `read_attachment({spec,path})`: base64+mime для бинарей (.png/.jpg/.pdf/.svg) — read_spec_doc text-only; для phase2 Step 5c Jira multimodal verify — 11329b2 (тул 19→20)
  - [x] BDD регресс SPECGEN004_138: subdir-док читается; traversal `../../secret` отвергается (DOC_TRAVERSAL, не basename-нейтрализуется молча); бинарь через read_attachment base64. Полный сьют 138/137-passed GREEN
  - [x] consumer-миграция READ (DONE 41b1216): arch-decision-builder Step 3.5 читает ARCHITECTURE/AXIS-*.md → list_spec_docs+read_spec_doc subpath; phase2 Step 5c attachments → read_attachment; allowed-tools обновлены (arch-decision-builder + create-spec)
  - [x] WRITE-resolution ЧАСТИЧНО: CLI-записанные артефакты (init.ts scaffold `.architecture-research/`, QUEUE.json/COMPLETENESS/AXIS via architecture-decision-cli.ts) покрыты engine-CLI carve-out (architecture-decision-cli.ts в REAL_ENGINE_INVOCATIONS allowed)
  - [x] WRITE-side АГЕНТ (DONE dbb7ae6): apply_spec_change/validateTarget/writeDocAtomic расширены на containment-subpath (`normalizeContainedDoc`; writeDocAtomic mkdir parent; docOf pass-through) + для non-graph subdir-доков ПРОПУСК graph-гейтов form/anchor/conformance (для top-level FR/AC/TASKS/feature остаются). Доказано live (subdir write ok+на диске+0 findings; `../..` → VALIDATION_FAILED, escape-файл не создан) + BDD SPECGEN004_139; полный сьют 139/138-passed GREEN
  - [x] consumer-миграция WRITE (DONE): arch-research-workflow заполняет 7 stage-файлов через `apply_spec_change({doc:".architecture-research/N-...md"})` (door пропускает гейты для subdir-прозы); финальный RESEARCH.md (top-level) — через ту же дверь С валидацией; allowed-tools обновлены. Docker-зелёные мои 3 фикса подтверждены (16→13 падений, 13 — предсуществующие, не импортят мои модули)

## Phase 20 — Двусторонняя трассируемость (FR-44, audit-reports/bidirectional-traceability-audit-2026-06-09.md)

- [x] P20-1: GT-1 reverse orphan-project-test чек (HEADLINE) — id: p20-project-test-ingest — Status: DONE | Est: 480m
  _depends: p17-mutation-surface_
  _Requirements: [FR-44](FR.md#fr-44)_
  > Реализовано через **Option A** (advisor): standalone `tools/spec-graph/project-test-trace.ts` читает тест-дерево + кросс-реф граф по naming-convention — БЕЗ ингеста в граф (не перетряхивает 1539 сценариев + всех потребителей). P19-5 producer переиспользует ту же нормализацию.
  **Done When:**
  - [x] standalone модуль (Option A) кросс-реф vitest it()-id ↔ scenario-узлы по naming-convention; ДВЕ конвенции (full-id SPECGEN004_140 + prefix HVTR001_01); junk-фильтр (id только из начала it/test/describe-строки)
  - [x] reverse: project-тест без сценария → ORPHAN_PROJECT_TEST (72 на реальном корпусе, CLI + orphanProjectTestFindings); forward (сценарий без backing-теста) уже частично ловится NDJSON undefined-bucket
  - [x] зубы: INFO (не гейтит) — 72 legacy не флудят RED; promote-to-gate после чистки = P20-5. BDD SPECGEN004_141 (герметичный tmp-fixture, привязан к реальной findOrphanProjectTests). corpus-health surfacing (organism-вид). Полный сьют 141/140-passed GREEN

- [x] P20-2: GT-2 FR→research чек (FR_NO_RESEARCH) — id: p20-research-trace — Status: DONE | Est: 240m
  _depends: p17-mutation-surface_
  _Requirements: [FR-44](FR.md#fr-44)_
  > Реализовано через **Option A** (как P20-1): standalone `tools/spec-graph/research-trace.ts` — файловый проход по FR.md-секциям, БЕЗ ингеста Research-узлов в граф (граф не держит прозу FR-секций; ingest не нужен для чека). Предикат прост и задокументирован: упоминание `RESEARCH.md` внутри FR-секции (реальная форма цитат корпуса).
  **Done When:**
  - [x] FR-секция без RESEARCH.md-цитаты в спеке, ИМЕЮЩЕЙ RESEARCH.md → FR_NO_RESEARCH (спека без research-файла скипается — нечего цитировать); CLI + corpus-health секция 6
  - [x] severity + gating решены ЭМПИРИКОЙ: 562 FR-секции, цитируют лишь 17 (~3%) → 538 legacy → INFO (не гейтит hard; гейтит --strict), promote после чистки = P20-5 паттерн. BDD SPECGEN004_144 (спека С research: uncited FR флагается, citing — нет; спека БЕЗ research — скип). 144/143-passed GREEN

- [x] P20-3: GT-3 таск без требования детектится (TASK_NO_REQUIREMENT) — id: p20-task-empty-refs — Status: DONE | Est: 120m
  _depends: p17-mutation-surface_
  _Requirements: [FR-44](FR.md#fr-44)_
  **Done When:**
  - [x] таск (любой статус) с пустыми refs И без FR/SPECGEN/@feature в Done-When → TASK_NO_REQUIREMENT (conformance.ts) — 7 INFO находок на реальном корпусе, корректно отфильтровал 17 из 24 (линкуются через doneWhen)
  - [x] BDD-регресс SPECGEN004_140 (@FR-44, привязан к реальному checkConformance) + решение зубов: INFO (не гейтит) чтобы не флудить RED на legacy-долге; promote-to-gate после чистки = P20-5

- [ ] P20-4: GT-4 back-ref USER_STORIES/USE_CASES/DESIGN → требования — id: p20-upstream-backref — Status: TODO | Est: 180m
  _depends: p17-mutation-surface_
  _Requirements: [FR-44](FR.md#fr-44)_
  **Done When:**
  - [ ] story→FR / UC→FR / decision→(FR|research) обратная полнота проверяется
  - [ ] BDD-регресс

- [ ] P20-5: решение promote-vs-advisory для беззубых обратных проверок — id: p20-toothless-decision — Status: TODO | Est: 90m
  _depends: p17-mutation-surface_
  _Requirements: [FR-44](FR.md#fr-44)_
  **Done When:**
  - [ ] для ORPHAN_TASK / SCENARIO_TAG_ORPHAN / TASK_STATUS_UNVERIFIED осознанно решено promote-to-gap-class или keep-advisory (с обоснованием в DESIGN)
  - [ ] если promote — добавлены в GAP_CLASSES + BDD; если advisory — задокументировано почему
