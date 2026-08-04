# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи across 7 phases.

См. также: [README.md](README.md), [TASKS.md](TASKS.md), [DESIGN.md](DESIGN.md).

## Phase 0 — Cucumber-JS BDD migration (dev-pomogator self + target TS bootstrap)

| Path | Action | Reason |
|------|--------|--------|
| `package.json` | edit | Add `@cucumber/cucumber`, `@cucumber/messages`, `@cucumber/gherkin`, `@cucumber/gherkin-utils` deps + `test:bdd` script ([FR-1](FR.md#fr-1)) |
| `cucumber.json` | create | cucumber-js config: format=message NDJSON, paths to step_definitions ([FR-1](FR.md#fr-1)) |
| `tests/step_definitions/` | create | Directory for TS step impls migrated from vitest pseudo-BDD ([FR-1](FR.md#fr-1)) |
| `tests/step_definitions/common.ts` | create | Shared step defs (Given/When/Then for common assertions) ([FR-1](FR.md#fr-1)) |
| `tests/hooks/before-after.ts` | create | BeforeScenario/AfterScenario hooks (temp dir setup, MCP server spawn) ([FR-1](FR.md#fr-1)) |
| `tests/fixtures/v4-self-test/.specs/` | create | Copy of `.specs/personal-pomogator/` + `.specs/codex-cli-support/` (two real v3-format specs) + a minimal synthesized v3-format sample for self-test ([FR-1](FR.md#fr-1)). The former `.specs/spec-generator-v3/` was consolidated into this v4 spec on 2026-05-28; v3 BDD scenarios live in `.specs/spec-generator-v4/legacy-v3.feature`. |
| `tests/fixtures/v4-self-test/features/` | create | Real `.feature` files from existing specs for Gherkin parser tests ([FR-1](FR.md#fr-1)) |
| `tests/fixtures/ndjson/sample.ndjson` | create | Pre-recorded canonical NDJSON for ingester unit-tests ([FR-1](FR.md#fr-1)) |
| `tests/fixtures/error-cases/` | create | Negative-case fixtures (corrupt-frontmatter, duplicate-fr, orphan-tagged) ([FR-5](FR.md#fr-5), [FR-13](FR.md#fr-13)) |
| `.github/workflows/test.yml` | edit | Add `test:bdd` job alongside existing vitest job ([FR-1](FR.md#fr-1)) |
| `tools/specs-generator/bdd-framework-detector.ts` | edit | Detect TS project + warn "v4 requires cucumber-js bootstrap" ([FR-1](FR.md#fr-1)) — canonical post-v2: BDD detection живёт в specs-generator, не в onboard-repo step |

## Phase 1 — Graph builder + parsers (in-memory)

| Path | Action | Reason |
|------|--------|--------|
| `tools/spec-graph/types.ts` | create | TypeScript types: Node, Edge, SpecGraph, NodeType, EdgeType ([FR-2](FR.md#fr-2), SCHEMA.md Entity 1) |
| `tools/spec-graph/parsers/md.ts` | create | unified+remark+remark-frontmatter+remark-wiki-link MD parser with dual-anchor registration + default anchor regex patterns с config-driven override (поглотил planned `anchor-patterns.ts`) ([FR-3](FR.md#fr-3)) |
| `tools/spec-graph/parsers/gherkin.ts` | create | @cucumber/gherkin + @cucumber/gherkin-utils wrapper, tag inheritance ([FR-2](FR.md#fr-2)) |
| `tools/spec-graph/parsers/ndjson.ts` | create | @cucumber/messages stream parser, JOIN keys → graph edges ([FR-2](FR.md#fr-2), [FR-9](FR.md#fr-9)) |
| `tools/spec-graph/builder.ts` | create | Orchestrates parsers, merges trees → SpecGraph, in-memory store ([FR-2](FR.md#fr-2)) |
| `tools/spec-graph/incremental.ts` | create | Hash-based change detection, only affected subgraph re-parse ([FR-2](FR.md#fr-2), NFR-Performance-2) |
| `tools/spec-graph/conformance.ts` | create | All structural checks (UNCOVERED_FR/ORPHAN_TASK/BROKEN_REF/etc.) returning Finding[] ([FR-13](FR.md#fr-13), SCHEMA.md Entity 6) |
| `tools/spec-graph/__tests__/md-parser.test.ts` | create | vitest unit tests for parser regex + dual-anchor ([FR-3](FR.md#fr-3)) |
| `tools/spec-graph/__tests__/builder.test.ts` | create | vitest unit tests using fixture from Phase 0 ([FR-2](FR.md#fr-2)) |
| `tools/spec-graph/__tests__/conformance.test.ts` | create | vitest unit tests for each finding code ([FR-13](FR.md#fr-13)) |

## Phase 2 — MCP server + hooks + Marksman bundle

| Path | Action | Reason |
|------|--------|--------|
| `tools/spec-mcp-server/server.ts` | create | MCP server entry point, @modelcontextprotocol/sdk stdio ([FR-4](FR.md#fr-4)) |
| `tools/spec-mcp-server/tools.ts` | create | ВСЕ MCP tools в одном модуле: get_trace (primary, structured tree + explanation_for_agent, AC-4.1), get_node, find_by_tags (AND/OR), find_by_type, conformance_check (Finding[] + suggestions), blast_radius (SCHEMA Entity 7), list_orphans, broken_refs, git_diff_impact, search, overview — canonical post-v2 layout консолидировал 11 planned per-tool файлов в один ([FR-4](FR.md#fr-4), [FR-13](FR.md#fr-13)) |
| `tools/spec-mcp-server/lock-manager.ts` | create | .mcp-lock.json atomic create + pid+env check ([FR-14](FR.md#fr-14), NFR-Reliability-3) |
| `tools/spec-mcp-server/lifecycle.ts` | create | Lifecycle orchestrator: cold-start + chokidar watcher с polling auto-detect (поглотил planned `file-watcher.ts`) ([FR-14](FR.md#fr-14), NFR-Reliability-4) |
| `tools/marksman-installer/lsp-probe.ts` | create | Marksman LSP probe; subprocess-proxy `lsp-bridge.ts` заменён нативной LSP-регистрацией plugin-а ([FR-7](FR.md#fr-7)) |
| `tools/spec-conformance-guard/spec-conformance-guard.ts` | create | PreToolUse HARD hook (DUPLICATE_DEFINITION etc.) ([FR-5](FR.md#fr-5)) |
| `tools/spec-conformance-push/spec-conformance-push.ts` | create | PostToolUse hook with 3s throttle + aggregation + push ([FR-6](FR.md#fr-6)) |
| `tools/bash-post-test/ingest.ts` | create | PostToolUse on Bash — detect test run, invoke MCP ingest-ndjson ([FR-1](FR.md#fr-1)) |
| `tools/specs-validator/extension-json-meta-guard.ts` | create | Protects plugin manifest from tampering ([FR-5](FR.md#fr-5), NFR-Security-2) |
| `tools/marksman-installer/ensure-marksman.ts` | create | postInstall script: detect platform, download Marksman binary from GitHub releases, copy to `.dev-pomogator/bin/` ([FR-7](FR.md#fr-7)) |
| `.claude-plugin/plugin.json` | edit | Register new MCP server + meta-guard, bump version to 4.0.0 — canonical v2 manifest (бывший `extensions/specs-workflow/extension.json`); hook declarations живут в `.claude-plugin/hooks.json` ([FR-4](FR.md#fr-4), [FR-5](FR.md#fr-5), [FR-6](FR.md#fr-6)) |
| `package.json` | edit | Add `@modelcontextprotocol/sdk`, `unified`, `remark-parse`, `remark-frontmatter`, `remark-wiki-link`, `unist-util-visit`, `chokidar` deps + `postinstall` hook calling install-marksman ([FR-2](FR.md#fr-2), [FR-7](FR.md#fr-7)) |
| `tools/spec-mcp-server/__tests__/tools.test.ts` | create | End-to-end MCP server test ([FR-4](FR.md#fr-4)) |

## Phase 3 — LLM layer + multi-language support

| Path | Action | Reason |
|------|--------|--------|
| `tools/spec-llm-judge/index.ts` | create | LLM-as-judge orchestrator: spawn `claude -p` subprocess, parse JSON, semantic-drift compare FR text vs Scenario (поглотил planned `claude-cli-bridge.ts` + `semantic-drift-check.ts`) ([FR-8](FR.md#fr-8)) |
| `tools/spec-llm-judge/cache.ts` | create | hash(fr_text + scenario_text) → cached Finding ([FR-8](FR.md#fr-8)) |
| `tools/spec-graph/parsers/multilang.ts` | create | Per-language step binding extraction (C# Reqnroll, Python behave, Java cucumber-jvm) ([FR-9](FR.md#fr-9)) |
| `tools/spec-mcp-server/tools.ts` | edit | Add `semantic: true` flag handling + invoke spec-llm-judge ([FR-8](FR.md#fr-8)) |
| `tests/fixtures/multi-lang/` | create | Sample Reqnroll/behave/cucumber-jvm NDJSON outputs ([FR-9](FR.md#fr-9)) |

## Phase 4 — SQLite persistence + side-channel logs + Codespaces

| Path | Action | Reason |
|------|--------|--------|
| `tools/spec-mcp-server/sqlite/wrapper.ts` | create | better-sqlite3 wrapper: WAL mode, FTS5, embedded DDL schema, PRAGMA integrity_check + corruption fallback, meta-table versioning — canonical post-v2 layout консолидировал planned `sqlite-index.ts` + `sqlite-schema.sql` + `sqlite-migrations/` + `sqlite-recovery.ts` ([FR-10](FR.md#fr-10), NFR-Reliability-5) |
| `tools/spec-check-log/writer.ts` | create | Append-only JSONL logger with size-based rotation ([FR-15](FR.md#fr-15)) |
| `tools/spec-check-log/cli.ts` | create | `dev-pomogator spec-check-log --since --grep` CLI ([FR-15](FR.md#fr-15)) |
| `tools/spec-mcp-server/codespaces-autostart.ts` | create | Detect Codespaces env (CODESPACES env var), tag lock file ([FR-16](FR.md#fr-16)) |
| `tools/devcontainer/templates/devcontainer.json` | edit | Add `postStartCommand` for MCP server auto-start ([FR-16](FR.md#fr-16)) |
| `package.json` | edit | Add `better-sqlite3` to optionalDependencies ([FR-10](FR.md#fr-10)) |

## Phase 5 — Migration helper v3→v4

| Path | Action | Reason |
|------|--------|--------|
| `tools/migrate-v3-to-v4/cli.ts` | create | Main migration script, scan + diff + interactive prompt ([FR-11](FR.md#fr-11)) |
| `tools/migrate-v3-to-v4/converter.ts` | create | `### Requirement: FR-N <title>` → `### FR-N: <title>` ([FR-11](FR.md#fr-11)) |
| `tools/migrate-v3-to-v4/tag-predictor.ts` | create | Naming heuristic for untagged scenarios — planned, ещё не реализован ([FR-11](FR.md#fr-11)) |
| `tools/migrate-v3-to-v4/config-generator.ts` | create | Create `.spec-config.json` with defaults if absent — planned, ещё не реализован ([FR-11](FR.md#fr-11)) |
| `tools/migrate-v3-to-v4/interactive.ts` | create | Per-file approve/skip/edit with 30s timeout ([FR-11](FR.md#fr-11), AC-11.2) |
| `tools/migrate-v3-to-v4/__tests__/` | create | Tests: cli.test.ts + converter.test.ts + interactive.test.ts using v3 fixtures ([FR-11](FR.md#fr-11)) |

## Phase 6 — architecture-research-workflow skill + research-workflow enrichment + create-spec integration

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/architecture-research-workflow/SKILL.md` | create | New skill, 7-stage flow, frontmatter triggers ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/templates/0-problem-statement.md` | create | Stage 0 template ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/templates/1-pain-evidence.md` | create | Stage 1 template ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/templates/4-variants.md` | create | Stage 4 template (≥3 variants matrix) ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/templates/5-decisions-locked.md` | create | Stage 5 template with revision tracking ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/templates/6-phases.md` | create | Stage 6 template ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/scripts/init-research-folder.ts` | create | Creates `.specs/{slug}/.architecture-research/` structure ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/scripts/merge-to-research-md.ts` | create | Stage 7 hand-off: merge stages into RESEARCH.md ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/scripts/decision-tracker.ts` | create | JSON state for Stage 5 Q&A loop ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/scripts/restart-from-stage.ts` | create | Explicit rewind logic with audit trail + 3-rewind hard limit ([FR-12](FR.md#fr-12)) |
| `.claude/skills/architecture-research-workflow/references/anti-patterns.md` | create | AP-arch-1..AP-arch-8 from session learnings ([FR-12](FR.md#fr-12)) |
| `.claude/skills/_shared/research-base.md` | create | Shared patterns between research-workflow + architecture-research-workflow ([FR-12](FR.md#fr-12)) |
| `.claude/skills/research-workflow/SKILL.md` | edit | Enrich with external-pain + misconception-flush sections from shared base ([FR-12](FR.md#fr-12)) |
| `tests/step_definitions/phase6-arch-research.ts` | edit | Adds SPECGEN004_531/SPECGEN004_532 executable BDD pins for shared research base plus create-spec architecture routing/recursion guard ([FR-12](FR.md#fr-12)) |
| `.claude/skills/create-spec/SKILL.md` | edit | Add complexity heuristic + `--research-done` flag recursion guard ([FR-12](FR.md#fr-12)) |
| `.claude/skills/create-spec/references/phase1_discovery.md` | edit | Step 5 runs `detectComplexity(userPrompt)`, routes architecture prompts to `architecture-research-workflow`, small prompts to `research-workflow`, and honors `--research-done` before either skill ([FR-12](FR.md#fr-12)) |
| `.claude-plugin/plugin.json` | edit | Skill distribution через canonical `"skills": ".claude/skills"` dir override — отдельная регистрация per-skill не нужна в v2 ([FR-12](FR.md#fr-12)) |
| `CLAUDE.md` | edit | Update skill index table with `architecture-research-workflow` entry ([FR-12](FR.md#fr-12)) |

## Phase 7 — Cross-spec reconciliation

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/cross-spec-reconcile/SKILL.md` | create/edit | Reconcile skill entrypoint with execution flow + output contract; 2026-07-09 reconciled allowed-tools to include Agent per skill workflow ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/reconcile.ts` | create/edit | Single shipped light-mode engine: scans `.specs`, extracts path/symbol/runtime/feature-tag/schema inputs, and emits 29 mechanical finding codes; proof `check-cross-spec-mechanical-checks.mjs` pins `engine_codes=29`, `test_pinned_codes=29` ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/reconcile-cli.ts` | create/edit | Runnable CLI driver for light/full mode, slug filtering, dry-run, SARIF, and per-spec summary table ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/full-mode.ts` | create/edit | Semantic full-mode wrapper around `spec-llm-judge`, Meridian 120s timeout, `cross-spec/semantic-check-failed`, `cross-spec/semantic-drift`, and partial YAML fallback ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/yaml-writer.ts` | create/edit | Atomic consistency-report YAML writer used by reconcile CLI and tests ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/sarif.ts` | create/edit | SARIF 2.1.0 secondary output writer with rule-id mapping to finding codes ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/overrides-log.ts` | create/edit | JSONL audit log helper for acknowledged CRITICAL overrides ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/__tests__/reconcile.test.ts` | create/edit | Unit fixture corpus pins all 29 shipped mechanical `reconcile.ts` finding codes plus YAML/SARIF/override helpers ([FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-reconcile/references/finding-codes.md` | create/edit | Finding-code catalog with severity + class + remediation; focused proof saw 36 documented namespaced entries and the shipped engine pins 29 mechanical codes ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/references/yaml-schema.md` | create | Consistency Report YAML schema reference with full example output ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/references/semantic-judge-prompt.md` | create | Agent subagent prompt template (NO interactive prompts permitted; structured JSON output only) ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-resolve/SKILL.md` | create | Resolve skill entrypoint with 7-step explain-confirm-apply execution flow ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/scripts/walker.ts` | create/edit | Shipped resolver walker: report loading, finding grouping, AskUserQuestion header/explanation builder, and resolution planning in one module ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/scripts/resolve-cli.ts` | create/edit | Resolve CLI entrypoint wrapping the walker and documenting interactive AskUserQuestion execution boundaries ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/scripts/update-status.ts` | create/edit | Resolution-status updater preserving acknowledged/override fields while stamping per-finding `resolution_status` transitions ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/scripts/recheck.ts` | create/edit | Post-batch re-reconcile status recheck that marks findings resolved/still-open from fresh report output ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/scripts/__tests__/walker.test.ts` | create/edit | Unit coverage for resolver grouping, explanation format, prompt header, choice exit code, and resolution planning ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/references/fix-templates.md` | create | Per-finding-code fix recipe templates including Path A/B/C for architectural decisions ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/references/explain-before-edit.md` | create | 5-field explanation block pattern documentation ([FR-18](FR.md#fr-18)) |
| `.claude/skills/create-spec/SKILL.md` | edit | Add Phase 2 step 4d + Phase 3 step 1c reconcile invocations + Audit category dispatch ([FR-17](FR.md#fr-17)) |
| `.claude/skills/create-spec/references/phase2_requirements-and-design.md` | edit | Document new step 4d lightweight reconcile invocation + blocking semantics ([FR-17](FR.md#fr-17)) |
| `.claude/skills/create-spec/references/phase3_finalization.md` | edit | Document new step 1c lightweight reconcile re-check before STOP #3 ([FR-17](FR.md#fr-17)) |
| `.claude/skills/create-spec/references/phase3plus_audit-overview.md` | edit | Add 9th row CROSS_SPEC_CONSISTENCY to audit category table ([FR-17](FR.md#fr-17)) |
| `.claude/skills/create-spec/references/phase3plus_audit-cross-spec.md` | create | 9th audit category reference with Checks / Remediation / Severity / Resolution codes sections ([FR-17](FR.md#fr-17)) |
| `.claude-plugin/plugin.json` | edit | `cross-spec-reconcile` + `cross-spec-resolve` distributed через canonical `"skills": ".claude/skills"` dir override ([FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)) |
| `tests/step_definitions/phase7-cross-spec.ts` | create/edit | Executable BDD step definitions for SPECGEN004_38..48 and later Phase 7 regressions; imports the shipped reconcile/yaml/sarif/resolve modules instead of external fixture folders ([FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)) |
| `.dev-pomogator/.tmp/check-cross-spec-reference-docs.mjs` | create-on-demand | Focused proof script for shipped cross-spec reference docs and skill contracts (`CROSS_SPEC_REFERENCE_DOCS_PROOF PASS`, `finding_codes=36`, `checked=7_done_when_bullets`) ([FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)) |
| `.dev-pomogator/.tmp/check-cross-spec-mechanical-checks.mjs` | create-on-demand | Focused proof script for shipped mechanical engine/test-code parity (`CROSS_SPEC_MECHANICAL_CHECKS_PROOF PASS`, `engine_codes=29`, `test_pinned_codes=29`) ([FR-17](FR.md#fr-17)) |
| Removed planned cross-spec fixture/e2e paths | removed-from-plan | The planned cross-spec fixture corpus and e2e test file were not shipped; coverage is carried by `tests/step_definitions/phase7-cross-spec.ts`, `scripts/__tests__/reconcile.test.ts`, and the focused proof scripts above ([FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)) |
| `.claude/logs/cross-spec-overrides.jsonl` | create-on-write | JSONL audit log of acknowledged CRITICAL overrides ([FR-17](FR.md#fr-17)) |





## Spec / docs (cross-phase)

| Path | Action | Reason |
|------|--------|--------|
| spec-generator-v4 spec markdown docs | edit | Already filled (Phase 1-2 of spec workflow); concrete doc rows are tracked in the phase tables above and below ([FR-1](FR.md#fr-1)..[FR-16](FR.md#fr-16)) |
| `.specs/spec-generator-v4/.progress.json` | edit | Tracked by `spec-status.ts` automatically (DO NOT manually edit) ([FR-12](FR.md#fr-12)) |
| `CHANGELOG.md` | edit | v4.0.0 release notes — root-level в canonical v2 layout ([FR-1](FR.md#fr-1)..[FR-16](FR.md#fr-16)) |
| `README.md` | edit | Update with v4 features — root-level в canonical v2 layout ([FR-4](FR.md#fr-4)) |

> Removed (P14-1 reconcile, 2026-06-05): `dist/installer/extensions.js` — v2 canonical plugin не имеет installer-сборки (`npm install -g` flow deprecated); строка устарела вместе с v1 distribution. Остальные 57 stale `extensions/…`-путей выше переписаны на canonical post-v2 пути ([FR-37e](FR.md#fr-37)).

## Round 3 patch (v3→v4 transition — 10 closed gaps)

This block enumerates the spec-doc edits applied as part of the v3→v4 transition closure (FR-19..FR-28). All edits are markdown / SKILL.md frontmatter only — no production code is changed by this patch.

| Path | Action | Reason |
|------|--------|--------|
| `.specs/spec-generator-v4/FR.md` | edit | Append FR-19..FR-28 (10 new FR blocks) — hook failure tiers, summary surfacing, CLI compat, version gate, log inventory, meta-guard, manifest survival, LLM-as-judge boundary, LSP supply-chain, throttle semantics |
| `.specs/spec-generator-v4/NFR.md` | edit | Add NFR-Performance-6, NFR-Performance-7, NFR-Security-7, NFR-Security-8, NFR-Reliability-8 cross-linked to FR-19/20/26/27/28 |
| `.specs/spec-generator-v4/DESIGN.md` | edit | Add architecture paragraphs (l) Hook failure-mode tiers, (m) Log file inventory, (n) Conformance summary surfacing options |
| `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md` | edit | Add AC-19.1, AC-19.2, AC-19.3, AC-20.1, AC-20.2, AC-21.1, AC-22.1, AC-24.1, AC-25.1, AC-25.2, AC-26.1, AC-26.2, AC-27.1 (EARS form, paired to new FRs) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Add SPECGEN004_49..SPECGEN004_54 (6 new BDD scenarios tagged @feature19/@feature22/@feature25/@feature26/@feature27) |
| `.specs/spec-generator-v4/REVIEW_NOTES.md` | edit | Add Round 3 decision log: v3 FR → v4 FR mapping table + Key decisions in this patch + What this patch does NOT change |
| `.specs/spec-generator-v4/README.md` | edit | Add «v3 → v4 doc reorganization» section documenting `specs-management.md` as historical v3 planning artifact never shipped live |
| `.specs/spec-generator-v4/FILE_CHANGES.md` | edit | This block — record patch entries + bump Total counts |
| `.specs/spec-generator-v4/TASKS.md` | edit | Add Phase «v3-Transition Closure» with tasks T-Trans.1..T-Trans.10 (one per new FR) + regenerate Task Summary Table |
| `.claude/skills/discovery-forms/SKILL.md` | edit | Replace stale «Called by `specs-management.md` Phase 1 (Discovery) step 3» → «Called by `create-spec` Phase 1 (Discovery) step 3» |
| `.claude/skills/requirements-chk-matrix/SKILL.md` | edit | Replace stale «Called by `specs-management.md` Phase 2 (Requirements + Design) step 4b» → «Called by `create-spec` Phase 2 (Requirements + Design) step 4b» |
| `.claude/skills/task-board-forms/SKILL.md` | edit | Replace stale «Called by `specs-management.md` Phase 3 (Finalization) step 1b» → «Called by `create-spec` Phase 3 (Finalization) step 1b» |
| `tools/specs-generator/__fixtures__/task-table-input/TASKS.md` | create | Frozen input spec exercising every `parseTasksForTable` branch — FR-21 contract fixture (T-Trans.3) |
| `tools/specs-generator/__fixtures__/task-table.baseline.md` | create | Committed byte-baseline of the task-table CLI output on the frozen input ([FR-21](FR.md#fr-21)) |
| `tools/specs-generator/__tests__/task-table-contract.test.ts` | create | Byte-compare contract test + idempotence + degraded-mode (no MCP) + missing-TASKS error path ([FR-21](FR.md#fr-21), T-Trans.3) |
| `tools/specs-validator/extension-json-meta-guard.ts` | edit | FR-24 extension: guard v4 canonical manifests (`.claude-plugin/hooks.json`/`plugin.json`/`.mcp.json`) — spec-conformance-guard/push, dev-pomogator-specs MCP entry, self-protection (T-Trans.6) |
| `tools/specs-validator/__tests__/meta-guard.test.ts` | create | 4 removal-denied invariants + tamper-log + additive-allow, real subprocess + stdin ([FR-24](FR.md#fr-24), T-Trans.6) |
| `tools/specs-validator/conformance-summary.ts` | create | FR-20 threshold-only summary: ack state + soft/hard-tier unresolved-DENY counting, 1000-entry cap, path-injectable ([FR-20](FR.md#fr-20)) |
| `tools/specs-validator/ack-summary.ts` | create | /spec-status step-6 CLI: atomic ack stamp (temp+rename) silencing the prompt-time line ([FR-20](FR.md#fr-20)) |
| `tools/specs-validator/validate-specs.ts` | edit | renderFormGuardsSummary → FR-20 threshold semantics (v3 every-prompt 24h aggregate superseded) |
| `tools/specs-validator/__tests__/conformance-summary.test.ts` | create | T-Trans.2: threshold-zero/≥1, ack via real CLI, ≤50ms p95 latency, concurrent-atomic, scan cap ([FR-20](FR.md#fr-20)) |
| `.claude/skills/spec-status/SKILL.md` | edit | Step 6: run ack-summary.ts after rendering — viewing /spec-status acknowledges the backlog (FR-20 B4) |
| `tools/specs-validator/form-guards-dispatch.ts` | create | LIVE carrier of the five v3 form-guards (found DEAD in the 2026-06-07 creation review): one PreToolUse hook routes spec-file Writes to the canonical guard ([FR-19](FR.md#fr-19), [FR-24](FR.md#fr-24)) |
| `tools/specs-validator/__tests__/form-guards-dispatch.test.ts` | create | deny-propagation / allow / passthrough, real subprocess + stdin (P16-1) |
| `tools/specs-validator/spec-form-parsers.ts` | edit | `runCheckCli` — the `--check` dry-run CLI three form skills documented but which never existed (P16-1) |
| `tools/specs-validator/audit-logger.ts` | edit | `readRecentEvents` optional logFile param — soft-tier injectable for test isolation (FR-20 race fix) |
| `.claude/skills/create-spec/references/specs-validation.md` | edit | pseudo-tags → real Gherkin tags (×3) + 13-required/2-optional file-count wording (P16-1) |
| `.claude/skills/create-spec/references/jira-mode.md` | edit | example pseudo-tag → real tag (P16-1) |
| `.claude/skills/create-spec/references/phase3plus_audit-overview.md` | edit | Verdict → two-condition: findings closed AND spec-verdict GREEN (FR-37d) + get_spec_status pointer (P16-1) |
| `.claude/skills/create-spec/references/phase3plus_audit-variant-coverage.md` | edit | dead extensions/ path → canonical skill path (P16-1) |
| `audit-reports/spec-creation-pipeline-review.md` | create | the full review: findings table, refuted scout claim, backlog → Phase 16 (P16-1) |
| `audit-reports/mcp-rails-wave-design.md` | create | глубокий анализ волны MCP-rails: граница агент/движок, цепочка read→write→shadow→enforce, инвентарь трёх корзин ([FR-39](FR.md#fr-39)) |
| `tools/spec-mcp-server/tools.ts` | edit | P17-1/2: read_spec_doc + list_spec_docs + propose/apply_spec_change + create_spec, аудит-лог spec-access.jsonl ([FR-39](FR.md#fr-39), [FR-40](FR.md#fr-40)) |
| `tools/specs-validator/spec-access-guard.ts` | create | P17-3/6: shadow→enforce PreToolUse-хук на агентские файловые вызовы по `.specs/**` ([FR-39](FR.md#fr-39)) |
| `.claude/agents/spec-phase-discovery.md` | create | P17-7: фазовый headless-агент Discovery, MCP-only allowed-tools ([FR-41](FR.md#fr-41)) |
| `.claude/agents/spec-phase-requirements.md` | create | P17-7: фазовый агент Requirements+Design ([FR-41](FR.md#fr-41)) |
| `.claude/agents/spec-phase-finalization.md` | create | P17-7: фазовый агент Finalization ([FR-41](FR.md#fr-41)) |
| `.claude/agents/spec-phase-audit.md` | create | P17-7: фазовый агент Phase-3+ Audit ([FR-41](FR.md#fr-41)) |
| `.claude/skills/spec-generator-orchestrator/SKILL.md` | edit | P17-8: оркестратор-проверятор — спавн фаз + verdict-гейты между ними ([FR-41](FR.md#fr-41)) |
| `.claude/settings.json` | edit | Register extension-json-meta-guard LIVE (PreToolUse Write|Edit) — was dead code, only in .bak (T-Trans.6 finding) |
| `.claude-plugin/hooks.json` | edit | Same live registration for plugin users (bootstrap launcher; builtins-only imports — deps-safe) |
| `tools/specs-generator/legacy-triage.ts` | create | P18-1 legacy/drift SUSPICION classifier — composer over not_run-by-feature + version-lineage + FILE_CHANGES reality; 4 states; never auto-retires ([FR-43](FR.md#fr-43)) |
| `tools/specs-generator/legacy-judge.ts` | create | P18-1 LLM-judge escalation (claude -p) resolving moved/removed/absorbed, grep-grounded, degrade-honest (FR-8 idiom) ([FR-43](FR.md#fr-43)) |
| `tools/specs-generator/evals/legacy-triage-dogfood.ts` | create | Dogfood: drives the classifier on the live corpus, reconciles output vs disk ([FR-43](FR.md#fr-43)) |
| `tools/specs-generator/__tests__/legacy-triage.test.ts` | create | Unit on REAL captured fixtures + judge mapping ([FR-43](FR.md#fr-43)) |
| `tools/specs-generator/__tests__/legacy-judge.test.ts` | create | Unit on the LLM judge — injected spawn, every branch + honest degrade ([FR-43](FR.md#fr-43)) |
| `tests/step_definitions/feature43_legacy_triage.ts` | create | SPECGEN004_156 binds the real computeLegacyTriage ([FR-43](FR.md#fr-43)) |
| `tools/spec-graph/builder.ts` | edit | P18-2: skipDirs += `archive` so `.specs/archive/` retired specs leave the live graph ([FR-43](FR.md#fr-43)) |

## Phase 28 — FR-52 session dogfood hardening (2026-07-09)

| Path | Action | Reason |
|------|--------|--------|
| `tools/anchor-integrity/fix.mjs` | edit | P28-2 / FR-52b: add `--door`/enforce mode that applies deterministic anchor rewrites through `scripts/spec-door.ts` + `apply_spec_change`, with temp instruction files outside `.specs/` ([FR-52](FR.md#fr-52)) |
| `tools/anchor-integrity/anchor_gate_stop.ts` | edit | P28-2 / FR-52b: Stop-gate fix hint now prescribes `--apply --door` and names the enforce-safe path ([FR-52](FR.md#fr-52)) |
| `tools/anchor-integrity/anchor_check_post.ts` | edit | P28-2 / FR-52b: PostToolUse reminder now prescribes the same door-safe anchor-fix command ([FR-52](FR.md#fr-52)) |
| `tools/anchor-integrity/__tests__/fix.test.ts` | edit | P28-2 / FR-52b unit regression proves door instructions stay outside `.specs/` and carry rewritten content to the door ([FR-52](FR.md#fr-52)) |
| `tools/anchor-integrity/__tests__/hooks.test.ts` | edit | P28-2 / FR-52b hook regression asserts enforce-safe `--door` guidance in reminders ([FR-52](FR.md#fr-52)) |
| `tools/spec-mcp-server/tools.ts` | edit | P28-3 / FR-52c: clarify `validate_anchor` domains and add `DOC.md#heading-slug` Marksman-slug validation via shared `marksman-slug.mjs` ([FR-52](FR.md#fr-52)) |
| `tools/spec-mcp-server/__tests__/tools.test.ts` | edit | Unit regression: compact-id alias still resolves; `FR.md#fr-34-marksman-v20-anchors` resolves with Marksman punctuation rules ([FR-52](FR.md#fr-52)) |
| `tests/step_definitions/feature52_dogfood_hardening.ts` | edit | BDD regressions for SPECGEN004_514 (`validate_anchor`), SPECGEN004_515 (anchor-fix via door), and SPECGEN004_517 (guarded v1-layout FILE_CHANGES drift) on real code paths ([FR-52](FR.md#fr-52)) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Add @feature52 scenarios SPECGEN004_514, SPECGEN004_515, and SPECGEN004_517 for compact-vs-heading anchors, enforce-safe anchor-fix, and guarded v1-layout FILE_CHANGES drift ([FR-52](FR.md#fr-52)) |
| `tools/spec-mcp-server/server.bundle.mjs` | edit | Rebuilt distributed MCP bundle so plugin users receive FR-52c behavior ([FR-52](FR.md#fr-52)) |
| `.claude/skills/spec-reality-check/scripts/verify.ts` | edit | P28-4 / FR-52d: classify missing `edit` rows under removed v1 prefixes as `FC_V1_LAYOUT_DRIFT` only for canonical plugin repos where that prefix directory is gone, preserving generic `FC_EDIT_MISSING` elsewhere ([FR-52](FR.md#fr-52)) |
| `.claude/skills/spec-reality-check/evals/evals.json` | edit | P28-4 / FR-52d eval pins the positive canonical-plugin v1-layout drift case and forbids generic `FC_EDIT_MISSING` in that branch ([FR-52](FR.md#fr-52)) |
| `.claude/skills/spec-reality-check/references/checks.md` | edit | Documents `FC_V1_LAYOUT_DRIFT` trigger, guard conditions, and remap guidance ([FR-52](FR.md#fr-52)) |
| `tests/fixtures/spec-reality-check/v2/fc-v1-layout-drift/` | create | Fixture with missing `src/` edit row used by spec-reality-check evals for the guarded v1-layout drift detector ([FR-52](FR.md#fr-52)) |
| `.dockerignore` | edit | Exclude `.dev-pomogator/.tmp` runtime scratch from Docker build context so focused Docker BDD builds do not stream stale temp worktrees/logs into the image; verified during SPECGEN004_517 rerun ([FR-52](FR.md#fr-52)) |
| `scripts/docker-bdd.sh` | edit | Make the writable `.specs` copy per-run and copy `.specs/.` contents into it so stale `.dev-pomogator/.tmp/specs-docker-rw` directories cannot nest the mounted corpus and make filtered BDD runs select 0 scenarios ([FR-52](FR.md#fr-52)) |
| `.claude/skills/cross-spec-reconcile/scripts/full-mode.ts` | edit | P28-WS-F / FR-17: raise semantic dispatcher timeout to 120s and surface `SUBPROCESS_FAILED` as mechanical-only partial report with `cross-spec/semantic-check-failed` warning ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/reconcile.ts` | edit | P28-WS-F / FR-17: extend report typing for `mode: full`, `partial`, `partialReasons`, and semantic finding class ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/yaml-writer.ts` | edit | P28-WS-F / FR-17: emit `partial: true` and `partial_reasons[]` for degraded full-mode reports ([FR-17](FR.md#fr-17)) |
| `tests/step_definitions/feature17_full_mode.ts` | edit | P28-WS-F / FR-17: BDD regression SPECGEN004_516 drives real runFullMode + emitYaml partial fallback path ([FR-17](FR.md#fr-17)) |
| `scripts/wire-feature.mjs` | edit | P28-7 / FR-51d: validate same-spec `@featureN` tags, promote immediate `# @featureN`/control tag comments to real Gherkin tag lines, and write the feature plus `cucumber.json` under the existing lock ([FR-51](FR.md#fr-51)) |
| `tools/bdd-migrator/__tests__/migrate.test.ts` | edit | P28-7 / FR-51d unit regression for promotion, idempotence, wrong-feature-number refusal, graph `tested-by` edge creation, and full `wireFeature` temp-corpus writes ([FR-51](FR.md#fr-51)) |
| `tests/step_definitions/feature51_bdd_migrator.ts` | edit | P28-7 / FR-51d BDD steps drive the real wire-feature promotion helper and graph parser on a temp feature fixture ([FR-51](FR.md#fr-51)) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Add @feature51 scenario SPECGEN004_518 for wire-time comment-tag promotion ([FR-51](FR.md#fr-51)) |
| `tools/spec-graph/conformance.ts` | edit | P28-8 / FR-52g: relax `TASK_NO_OWN_SCENARIO` for migrated many→few task↔scenario consolidation when at least one mapped covering scenario passed; leave `TASK_STATUS_UNVERIFIED` to surface non-green siblings ([FR-52](FR.md#fr-52)) |
| `tools/spec-graph/__tests__/conformance.test.ts` | edit | Regression pins accepted many→few consolidation with a green scenario plus not-run sibling, and still flags all-non-green consolidation ([FR-52](FR.md#fr-52)) |
| `tests/step_definitions/feature46_task_traceability.ts` | edit | BDD steps for SPECGEN004_519 drive real `checkConformance` over the many→few graph and assert the narrow relaxation ([FR-52](FR.md#fr-52)) |
| `.specs/spec-generator-v4/FR.md` | edit | FR-46/FR-52g document the chosen cardinality policy: consolidated green proof can satisfy the no-own-scenario rule for migrations ([FR-52](FR.md#fr-52)) |
| `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md` | edit | AC-46.1 / AC-52.1 capture that green many→few covering proof suppresses `TASK_NO_OWN_SCENARIO` while non-green siblings remain surfaced ([FR-52](FR.md#fr-52)) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Add @feature52 scenario SPECGEN004_519 for the many→few `TASK_NO_OWN_SCENARIO` cardinality policy ([FR-52](FR.md#fr-52)) |
| `tools/spec-mcp-server/server.bundle.mjs` | edit | Rebuilt distributed MCP bundle after conformance policy change so plugin users receive P28-8 behavior ([FR-52](FR.md#fr-52)) |

## Phase 29 — FR-56 scenario-result overlay freshness

| Path | Action | Reason |
|------|--------|--------|
| `scripts/bdd-overlay.mjs` | create | P29-1 / FR-56b,d: parse Cucumber message NDJSON and append one atomic `.scenario-results.ndjson` row per executed scenario with `{scenario_id,result,time,run_id,source,trace_id}` ([FR-56](FR.md#fr-56)) |
| `scripts/run-bdd.mjs` | edit | P29-1 / FR-56b,d: after archiving full/filtered/explicit-config runs, write the per-scenario overlay while keeping canonical `.last-test-run.ndjson` clobber-safe ([FR-56](FR.md#fr-56)) |
| `scripts/docker-bdd.sh` | edit | P29-1 / FR-56b,d: archive Docker full/filtered/`-c` outputs from the actual message target and write host-side overlay rows for every sanctioned Docker BDD path ([FR-56](FR.md#fr-56)) |
| `tools/spec-graph/__tests__/ndjson-ingester.test.ts` | edit | Focused unit coverage for overlay row extraction and append-only behavior on real Cucumber message envelopes ([FR-56](FR.md#fr-56)) |
| `tests/step_definitions/feature23_28_log_inventory_throttle.ts` | edit | Add @feature56 BDD steps that drive the real overlay parser/writer and assert append-only rows retain trace identity ([FR-56](FR.md#fr-56)) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Add @feature56 scenario SPECGEN004_529 for P29-1 overlay writer behavior ([FR-56](FR.md#fr-56)) |
| `.specs/spec-generator-v4/FILE_CHANGES.md` | edit | Track Phase 29 implementation file changes for FR-56 ([FR-56](FR.md#fr-56)) |

## Phase 30 — FR-57 scaffold-completeness audit (stub-detection gate, 2026-07-01)

| Path | Action | Reason |
|------|--------|--------|
| `tools/specs-generator/scaffold-sentinels.mjs` | create | Единый классификатор scaffold-сентинелов (builtins-only, co-located с `.mjs`-движком), извлекаемых дословно из `templates/*.template` (вырез fenced+inline кода + отсев строчных токенов/JSON-скобок + номера строк); ЕДИНСТВЕННЫЙ источник для validate-spec PLACEHOLDER и новой audit-категории ([FR-57](FR.md#fr-57)) |
| `tools/specs-generator/specs-generator-core.mjs` | edit | Новая audit-категория `SCAFFOLD_INCOMPLETE` (phase-gated ERROR/INFO) через классификатор; `validate-spec` PLACEHOLDER и FIXTURES_CONSISTENCY-плейсхолдер-ветка сведены на тот же классификатор ([FR-57](FR.md#fr-57)) |
| `tools/spec-graph/__tests__/scaffold-sentinels.test.ts` | create | Юнит: сентинел-матч + вырез кода + строчные токены + дрейф-регресс (сентинелы ⊇ шаблонных) + исключения templates/__fixtures__/backlog ([FR-57](FR.md#fr-57)) |
| `tests/step_definitions/feature57_scaffold_completeness.ts` | create | Биндит SPECGEN004_470..477 на реальный классификатор + audit-spec + spec-verdict (real-engine, без моков) ([FR-57](FR.md#fr-57)) |

## Phase 31 — FR-59 bounded conformance-push reminder (2026-07-09)

| Path | Action | Reason |
|------|--------|--------|
| `tools/spec-conformance-push/spec-conformance-push.ts` | edit | Cap Claude-facing `<system-reminder>` output at 6000 bytes with count/severity/sample/omitted summary while preserving full `appendFindings(...)` logging ([FR-59](FR.md#fr-59)) |
| `tools/spec-conformance-push/__tests__/spec-conformance-push.test.ts` | edit | Focused vitest regression for large finding batches, byte cap, omitted count, and durable log completeness ([FR-59](FR.md#fr-59)) |
| `tests/step_definitions/feature23_28_log_inventory_throttle.ts` | edit | Add @feature59 BDD steps that drive real `decidePush` and `appendFindings` for bounded reminder + complete log proof ([FR-59](FR.md#fr-59)) |
| `tools/spec-conformance-push/spec-conformance-push.bundle.mjs` | edit | Rebuilt distributed hook artifact so plugin users receive bounded stdout behavior ([FR-59](FR.md#fr-59)) |

## Phase 32 — FR-49a scope-aware next-step router hardening

| Path | Action | Reason |
|------|--------|--------|
| `tools/specs-validator/validate-specs.ts` | edit | Resolve task-census data root from hook payload `cwd` / `workspace_roots[0]`, not plugin/process root, preventing cross-project `WS-F` leakage ([FR-49](FR.md#fr-49)) |
| `tools/specs-validator/conformance-summary.ts` | edit | Replace global/busiest-spec next-step rendering with scope-aware next router input/output while preserving health-count summary ([FR-49](FR.md#fr-49)) |
| `tools/spec-graph/task-census.ts` | edit | Expose/reuse transcript-derived agent todo/current-spec helpers for the shared next-step router and tests ([FR-49](FR.md#fr-49)) |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.ts` | edit | Use the same router for Stop-gate `nextLine`/`nextOpenTask` so agent todos/async/current spec outrank unrelated spec backlog ([FR-49](FR.md#fr-49)) |
| `tools/claim-evidence-gate/turn_window.ts` | edit | Ensure background Bash/Agent/subagent in-flight facts are available to router decisions without relying on agent prose ([FR-49](FR.md#fr-49)) |
| `tools/specs-validator/__tests__/conformance-summary.test.ts` | edit | Unit regressions for agent todo priority, current-spec-only next, no foreign next when scope unknown, and hook cwd root isolation ([FR-49](FR.md#fr-49)) |
| `tests/step_definitions/feature49_autosurface.ts` | edit | Update SPECGEN004_178 and add @feature49 BDD steps for scope-aware next routing and cross-project leak prevention ([FR-49](FR.md#fr-49)) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Update @feature49 scenarios to pin agent-todo/async/current-spec/root-isolation routing instead of busiest-spec routing ([FR-49](FR.md#fr-49)) |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs` | edit | Rebuilt distributed Stop-gate artifact so plugin users receive scope-aware next routing ([FR-49](FR.md#fr-49)) |

## Phase 32b — FR-49h transcript todo replay reconciliation

| Path | Action | Reason |
|------|--------|--------|
| `tools/spec-graph/task-census.ts` | edit | Reconcile transcript-derived `TaskCreate` / `TaskUpdate` agent todos by real task id instead of positional array index, collapse duplicate stale subjects, and demote ambiguous clusters ([FR-49](FR.md#fr-49)) |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.ts` | edit | Include selected next-step source, real task id, transcript location/range, selected subject, and reconciliation reason in Pinator fire logs ([FR-49](FR.md#fr-49)) |
| `tests/step_definitions/feature49_autosurface.ts` | edit | BDD/API coverage for the captured CARL stale-agent-todo replay shape and enriched Stop-gate fire logging ([FR-49](FR.md#fr-49)) |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs` | edit | Rebuilt distributed Stop-gate artifact so plugin users receive transcript todo replay reconciliation and diagnostics ([FR-49](FR.md#fr-49)) |
| `.specs/spec-generator-v4/FR.md` | edit | Add FR-49h amendment documenting the proven Pinator stale `agentOpenTodo` root cause and canonical replay behavior ([FR-49](FR.md#fr-49)) |
| `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md` | edit | Add AC-49.4 for real-id replay, duplicate suppression, ambiguity demotion, and captured CARL incident regression ([FR-49](FR.md#fr-49)) |
| `.specs/spec-generator-v4/TASKS.md` | edit | Add Phase 32b backlog tasks P32-5..P32-7 for implementation, dedupe, captured regression, logging, bundle rebuild, and proof ([FR-49](FR.md#fr-49)) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Add executable @feature49 BDD regressions SPECGEN004_526..528 and SPECGEN004_533 for transcript replay, duplicate demotion, fire-log diagnostics, and umbrella routing behavior ([FR-49](FR.md#fr-49)) |

## Phase 33 — FR-60 high-level MCP authoring API

| Path | Action | Reason |
|------|--------|--------|
| `tools/spec-mcp-server/mutations.ts` | edit | Add high-level section/anchor mutation primitives plus FR-40 delta validation: pre-existing staged conformance/task-truth debt does not wedge unrelated edits, while net-new debt is refused; EOL-normalized diagnostics, transaction validation, and CAS behavior stay on the same validation-before-write pipeline ([FR-40](FR.md#fr-40), [FR-60](FR.md#fr-60)) |
| `tools/spec-mcp-server/tools.ts` | edit | Expose MCP schemas/handlers for `read_for_edit`, anchor/section insert operations, `propose_patch`, `apply_proposed_patch`, `apply_spec_transaction`, and domain authoring helpers ([FR-60](FR.md#fr-60)) |
| `tools/spec-mcp-server/__tests__/mutations-high-level-authoring.test.ts` | create | Regression coverage for section insert, EOL-normalized replace, diagnostic miss categories, multi-doc rollback, proposal apply, and CAS auto-rebase/refusal ([FR-60](FR.md#fr-60)) |
| `tests/step_definitions/feature60_high_level_authoring.ts` | create | BDD step definitions for SPECGEN004_520..525 once the high-level authoring API is implemented; must drive the real MCP mutation layer, not mocks ([FR-60](FR.md#fr-60)) |
| `tools/spec-mcp-server/server.bundle.mjs` | edit | Rebuild distributed MCP bundle so plugin users receive the high-level authoring API ([FR-60](FR.md#fr-60)) |
| `.specs/spec-generator-v4/FR.md` | edit | Add FR-60 high-level MCP authoring API requirement from live dogfood pain ([FR-60](FR.md#fr-60)) |
| `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md` | edit | Add AC-60.1..AC-60.4 for anchor ops, diagnostics, transactions/CAS, and domain helper safety ([FR-60](FR.md#fr-60)) |
| `.specs/spec-generator-v4/TASKS.md` | edit | Add Phase 33 implementation backlog P33-1..P33-5 ([FR-60](FR.md#fr-60)) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Add @feature60 @wip acceptance scenarios SPECGEN004_520..525 as pending executable pins ([FR-60](FR.md#fr-60)) |
| `.specs/spec-generator-v4/FILE_CHANGES.md` | edit | Track Phase 33 planned implementation and spec-document changes ([FR-60](FR.md#fr-60)) |

## Phase 34 — FR-61 unified readiness UX

| Path | Action | Reason |
|------|--------|--------|
| `tools/specs-generator/spec-verdict.ts` | edit | Add readiness lanes and OVERALL NOT_READY semantics so structural success cannot hide execution/task/BDD-sync debt ([FR-61](FR.md#fr-61)) |
| `tools/spec-mcp-server/tools.ts` | edit | Align get_spec_status gap vocabulary and expose filtered proof/readiness next-action data through the MCP status surface ([FR-61](FR.md#fr-61)) |
| `tools/spec-graph/coverage.ts` | edit | Separate traceability coverage from execution verification and surface filtered-run proof without updating canonical full-run coverage ([FR-61](FR.md#fr-61)) |
| `tools/spec-graph/conformance.ts` | edit | Add task DONE truth and source/executable BDD sync findings used by verdict/status/census ([FR-61](FR.md#fr-61)) |
| `tools/spec-graph/parsers/gherkin.ts` | edit | Preserve source/executable feature origin and scenario ids/tags needed for BDD sync drift checks ([FR-61](FR.md#fr-61)) |
| `tools/spec-graph/task-census.ts` | edit | Show evidence-derived IN_PROGRESS / DONE-but-unverified task truth in prompt-time census ([FR-61](FR.md#fr-61)) |
| `tests/step_definitions/feature61_unified_readiness.ts` | create | BDD steps for SPECGEN004_534..538 using real verdict/status/task/BDD-sync surfaces ([FR-61](FR.md#fr-61)) |
| `.claude/skills/spec-generator-dev/SKILL.md` | edit | Require spec-generator-dev runs to compare truth surfaces, detect split-brain UX, and propose/add upstream improvements through the MCP spec door ([FR-61](FR.md#fr-61)) |
| `.specs/spec-generator-v4/FR.md` | edit | Add FR-61 unified readiness UX requirement from CARL/spec-generator dogfood evidence ([FR-61](FR.md#fr-61)) |
| `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md` | edit | Add AC-61.1..AC-61.5 for readiness lanes, status vocabulary, task truth, BDD sync, and filtered proof ([FR-61](FR.md#fr-61)) |
| `.specs/spec-generator-v4/USER_STORIES.md` | edit | Add US-24 describing one honest readiness surface for spec health ([FR-61](FR.md#fr-61)) |
| `.specs/spec-generator-v4/USE_CASES.md` | edit | Add UC-24 unified readiness answer flow and next-action behavior ([FR-61](FR.md#fr-61)) |
| `.specs/spec-generator-v4/REQUIREMENTS.md` | edit | Add FR-61 matrix and CHK-FR61-01..05 verification rows ([FR-61](FR.md#fr-61)) |
| `.specs/spec-generator-v4/DESIGN.md` | edit | Add lane-based readiness design decision and rejected alternatives ([FR-61](FR.md#fr-61)) |
| `.specs/spec-generator-v4/TASKS.md` | edit | Add Phase 34 backlog P34-1..P34-5 for implementation and regressions ([FR-61](FR.md#fr-61)) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Add @feature61 @wip scenarios SPECGEN004_539..543 as pending executable pins ([FR-61](FR.md#fr-61)) |
| `.specs/spec-generator-v4/FILE_CHANGES.md` | edit | Track Phase 34 planned implementation and spec-document changes ([FR-61](FR.md#fr-61)) |

## Phase 35 — FR-62/FR-63/FR-64 integration-first readiness evidence

| Path | Action | Requirement and verification |
|---|---|---|
| `tools/specs-generator/specs-generator-core.mjs` | edit | Root precedence `SPECS_GENERATOR_ROOT` → caller project cwd → `SCRIPT_DIR`; inherited/closed/noninteractive `stdin_mode` with timeout; reject Windows-host Code-to-WSL plugin cache, `C:\Windows`, and invalid UNC roots. [FR-62](FR.md#fr-62), [AC-62.1](ACCEPTANCE_CRITERIA.md#ac-621) |
| `tools/specs-generator/spec-status.ts` | edit | Shared root precheck; reject `C:\Windows` CWD collapse, UNC-relative, plugin-cache, cross-worktree, and untracked inputs with remediation. [FR-62](FR.md#fr-62), [AC-62.2](ACCEPTANCE_CRITERIA.md#ac-622) |
| `.claude/skills/spec-status/scripts/precheck.ts` | edit | Graph-derived FR/AC/scenario snapshot, full-run source/time/recency, baseline/run identity, passed/unknown/not_recorded/stale/filtered taxonomy, AND readiness, and next action. [FR-63](FR.md#fr-63), [AC-63.1](ACCEPTANCE_CRITERIA.md#ac-631), [AC-63.2](ACCEPTANCE_CRITERIA.md#ac-632) |
| `tools/specs-generator/spec-verdict.ts` | edit | Consume the canonical precheck snapshot and preserve FR/AC/scenario provenance, recency, mandatory lanes, and remediation. [FR-63](FR.md#fr-63) |
| `tools/spec-mcp-server/tools.ts` | edit | Expose the canonical precheck, trace/test-result identity, runtime root, and remediation through MCP. [FR-63](FR.md#fr-63) |
| `tools/spec-graph/conformance.ts` | edit | Classify evidence and preserve all-unit outcomes for inventory decisions. [FR-64](FR.md#fr-64), [AC-64.1](ACCEPTANCE_CRITERIA.md#ac-641), [AC-64.2](ACCEPTANCE_CRITERIA.md#ac-642) |
| `tools/spec-graph/coverage.ts` | edit | Surface evidence provenance without treating mock-only or filtered evidence as ready. [FR-64](FR.md#fr-64), [AC-64.1](ACCEPTANCE_CRITERIA.md#ac-641) |
| `tools/spec-graph/task-census.ts` | edit | Report evidence-derived task truth to the release inventory. [FR-64](FR.md#fr-64) |
| `tools/specs-generator/audit-spec.ts` | edit | Include graph-native evidence classifications in audit inventory output. [FR-64](FR.md#fr-64), [AC-64.1](ACCEPTANCE_CRITERIA.md#ac-641) |
| `tools/specs-generator/spec-status.ts` | edit | Expose classified inventory through the CLI status surface. [FR-64](FR.md#fr-64), [AC-64.2](ACCEPTANCE_CRITERIA.md#ac-642) |
| `tools/specs-generator/spec-verdict.ts` | edit | Expose classified inventory through the verdict surface. [FR-64](FR.md#fr-64), [AC-64.2](ACCEPTANCE_CRITERIA.md#ac-642) |
| `tools/spec-mcp-server/tools.ts` | edit | Expose classified inventory through MCP. [FR-64](FR.md#fr-64), [AC-64.2](ACCEPTANCE_CRITERIA.md#ac-642) |
| `tools/specs-generator/release-inventory.ts` | create | Compare tracked files path-by-path, classify or disposition silent junk, and record dependency-absent results, owner, signal, rollback, and follow-up. [FR-64](FR.md#fr-64), [AC-64.2](ACCEPTANCE_CRITERIA.md#ac-642), [AC-64.3](ACCEPTANCE_CRITERIA.md#ac-643), [AC-64.4](ACCEPTANCE_CRITERIA.md#ac-644) |
| `tests/step_definitions/feature62_cross_host_readiness.ts` | create | Bind collision-free real BDD contracts for cross-host root handling. [FR-62](FR.md#fr-62) |
| `tests/step_definitions/feature63_canonical_precheck.ts` | create | Bind real BDD contracts for canonical precheck evidence and NOT_READY states. [FR-63](FR.md#fr-63) |
| `tests/step_definitions/feature64_release_inventory.ts` | create | Bind real BDD contracts for tracked-file conservation and release inventory. [FR-64](FR.md#fr-64) |
| `tests/fixtures/specgen004-readiness/root-resolution.json` | create | Provide producer-faithful root and unsafe-host fixtures. [FR-62](FR.md#fr-62) |
| `tests/fixtures/specgen004-readiness/precheck-evidence.ndjson` | create | Provide full-run, filtered, stale, and dependency-absent evidence fixtures. [FR-63](FR.md#fr-63) |
| `tests/fixtures/specgen004-readiness/release-inventory.json` | create | Provide current tracked-file, owner, rollback, and monitoring fixtures. [FR-64](FR.md#fr-64) |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Define collision-free `SPECGEN004_553..561` Docker BDD contracts. [FR-62](FR.md#fr-62), [FR-63](FR.md#fr-63), [FR-64](FR.md#fr-64) |
| `cucumber.json` | edit | Register the Docker BDD contracts and message output. [FR-62](FR.md#fr-62), [FR-63](FR.md#fr-63), [FR-64](FR.md#fr-64) |
| `.specs/spec-generator-v4/README.md` | edit | Document the release-candidate evidence invocation and owner handoff. [FR-64](FR.md#fr-64), [AC-64.4](ACCEPTANCE_CRITERIA.md#ac-644) |
| `.specs/spec-generator-v4/TASKS.md` | edit | Track implementation and integration-first verification work. [FR-62](FR.md#fr-62), [FR-63](FR.md#fr-63), [FR-64](FR.md#fr-64) |
| `.specs/spec-generator-v4/CHANGELOG.md` | edit | Record the release-facing readiness behavior. [FR-64](FR.md#fr-64), [AC-64.4](ACCEPTANCE_CRITERIA.md#ac-644) |
| `.specs/spec-generator-v4/FR.md` | edit | Define FR-62 through FR-64 and their traceability links. [FR-62](FR.md#fr-62), [FR-63](FR.md#fr-63), [FR-64](FR.md#fr-64) |
| `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md` | edit | Define EARS AC-62.1 through AC-64.4. [FR-62](FR.md#fr-62), [FR-63](FR.md#fr-63), [FR-64](FR.md#fr-64) |
| `.specs/spec-generator-v4/REQUIREMENTS.md` | edit | Add the CHK matrix and explicit `not_recorded` readiness evidence. [FR-62](FR.md#fr-62), [FR-63](FR.md#fr-63), [FR-64](FR.md#fr-64) |
| `.specs/spec-generator-v4/DESIGN.md` | edit | Record root handoff, canonical-precheck, and release-inventory trade-offs. [FR-62](FR.md#fr-62), [FR-63](FR.md#fr-63), [FR-64](FR.md#fr-64) |
| `.specs/spec-generator-v4/FILE_CHANGES.md` | edit | Maintain this implementation-first, one-row-per-file inventory. [FR-62](FR.md#fr-62), [FR-63](FR.md#fr-63), [FR-64](FR.md#fr-64) |

| `.specs/spec-generator-v4/spec-generator-v4_SCHEMA.md` | edit | Define root-resolution, canonical-precheck, and release-inventory records. [FR-62](FR.md#fr-62), [FR-63](FR.md#fr-63), [FR-64](FR.md#fr-64) |

## Total counts

| Phase | Files |
|-------|-------|
| Phase 0 | 11 (8 create + 3 edit) |
| Phase 1 | 10 (all create; `anchor-patterns.ts` поглощён `parsers/md.ts`) |
| Phase 2 | 13 (11 create + 2 edit; 11 per-tool файлов консолидированы в `tools.ts`) |
| Phase 3 | 5 (4 create + 1 edit; bridge + drift-check консолидированы в `spec-llm-judge/index.ts`) |
| Phase 4 | 6 (4 create + 2 edit; sqlite schema/migrations/recovery консолидированы в `sqlite/wrapper.ts`) |
| Phase 5 | 6 (all create) |
| Phase 6 | 18 (12 create + 6 edit) |
| Phase 7 | 32 (27 create + 5 edit) |
| Cross-phase docs | 4 (all edit; `dist/installer/extensions.js` удалён — v2 без installer) |
| Round 3 patch (v3→v4 transition) | 12 (all edit; 9 v4-spec files + 3 SKILL.md frontmatter) |
| Phase 18 (FR-43 legacy-triage) | 7 (6 create + 1 edit; classifier + LLM judge + dogfood + 2 unit + BDD step; legacy-v3 archived) |
| Phase 30 (FR-57 scaffold-completeness) | 4 (3 create + 1 edit; classifier + engine edit + unit + BDD step) |
| Phase 31 (FR-59 bounded conformance push) | 4 (all edit) |
| Phase 32 (FR-49a scope-aware next router) | 8 (all edit) |
| Phase 32b (FR-49h transcript todo replay reconciliation) | 8 (all edit) |
| Phase 33 (FR-60 high-level MCP authoring API) | 10 (2 create + 8 edit) |
| Phase 34 (FR-61 unified readiness UX) | 17 (1 create + 16 edit) |
| **Total** | **175 rows (~95 create + 80 edit; Phase 31/32/32b/33/34 plus T6-45 BDD evidence traced through 2026-07-09)** |

## Phase 38 — Acceptance-to-delivery coverage (FR-65)

| Path | Action | Requirement and verification |
|---|---|---|
<!-- shipped 2026-07-22; retained as implementation history, excluded from active create-plan drift checks
| `tools/specs-generator/acceptance-task-coverage.mjs` | create | Text-driven AC classifier, task-plan lanes, CLI, and reusable audit analysis. [FR-65](FR.md#fr-65) |
-->
| `tools/specs-generator/specs-generator-core.mjs` | edit | Emit blocking audit findings for missing/unresolved acceptance delivery lanes. [AC-65.3](ACCEPTANCE_CRITERIA.md#ac-653) |
<!-- shipped 2026-07-22; retained as implementation history, excluded from active create-plan drift checks
| `tests/fixtures/specgen004-acceptance-coverage/paid-spa-corpus.json` | create | Synthetic #140 root/prefix, HTML/JSON auth/billing, registry/settlement/readback corpus. [AC-65.4](ACCEPTANCE_CRITERIA.md#ac-654) |
-->
<!-- shipped 2026-07-22; retained as implementation history, excluded from active create-plan drift checks
| `tests/step_definitions/feature65_acceptance_task_coverage.ts` | create | Real analyzer plus audit integration BDD binding for SPECGEN004_565. [FR-65](FR.md#fr-65) |
-->
| `.claude/skills/create-spec/references/phase3_finalization.md` | edit | Require analyzer plan before task authoring and Finalization STOP. [FR-65d](FR.md#fr-65) |
| `.claude/skills/task-board-forms/SKILL.md` | edit | Generate AC-linked implementation/test/deploy tasks or blocking investigation from shared lanes. [FR-65c](FR.md#fr-65) |
| `.claude/skills/spec-review/SKILL.md` | edit | Treat deterministic acceptance-delivery findings as P0. [FR-65d](FR.md#fr-65) |
| `.claude/skills/spec-review/references/categories.md` | edit | Document acceptance-delivery category and remediation. [FR-65d](FR.md#fr-65) |
| `.specs/spec-generator-v4/FR.md` | edit | Trace FR-65 requirement. |
| `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md` | edit | Trace FR-65 acceptance. |
| `.specs/spec-generator-v4/USER_STORIES.md` | edit | Trace FR-65 story. |
| `.specs/spec-generator-v4/USE_CASES.md` | edit | Trace FR-65 use case. |
| `.specs/spec-generator-v4/DESIGN.md` | edit | Trace FR-65 design. |
| `.specs/spec-generator-v4/REQUIREMENTS.md` | edit | Trace FR-65 checklist. |
| `.specs/spec-generator-v4/TASKS.md` | edit | Trace FR-65 delivery tasks. |
| `.specs/spec-generator-v4/FILE_CHANGES.md` | edit | Trace FR-65 implementation surfaces. |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Trace FR-65 executable scenario. |

## Phase 39 — Review hardening (FR-60, FR-65)

| Path | Action | Requirement and verification |
|---|---|---|
| `tools/spec-mcp-server/mutations.ts` | edit | Restore batch destructive-guard parity. [AC-60.3](ACCEPTANCE_CRITERIA.md#ac-603) |
| `tools/spec-mcp-server/section-ops.ts` | edit | Compensate earlier writes after a later I/O failure. [AC-60.3](ACCEPTANCE_CRITERIA.md#ac-603) |
| `tools/spec-mcp-server/tools.ts` | edit | Return honest write and rollback diagnostics. [AC-60.3](ACCEPTANCE_CRITERIA.md#ac-603) |
| `tools/spec-mcp-server/server.bundle.mjs` | edit | Ship the transaction hardening in the distributed MCP artifact. [AC-60.3](ACCEPTANCE_CRITERIA.md#ac-603) |
| `tools/specs-generator/acceptance-task-coverage.mjs` | edit | Exact AC ownership, H1-H6 parsing, and complete contextual auth/result vocabulary. [FR-65](FR.md#fr-65) |
| `tools/specs-generator/specs-generator-core.mjs` | edit | Empty-TASKS and analyzer-unavailable fail-closed audit behavior. [FR-65d](FR.md#fr-65) |
| `tests/step_definitions/feature60_proposal_transaction.ts` | edit | Strengthen `SPECGEN004_523` with destructive replacement and I/O rollback assertions. |
| `tests/step_definitions/feature65_acceptance_task_coverage.ts` | edit | Strengthen `SPECGEN004_565` with identifier-boundary, vocabulary, empty-plan, and analyzer-outage assertions. |
| `.agents/skills/create-spec/references/phase3_finalization.md` | edit | Gate active Codex Finalization on acceptance-delivery coverage. [FR-65d](FR.md#fr-65) |
| `.agents/skills/task-board-forms/SKILL.md` | edit | Generate AC-linked lane ownership in active Codex task plans. [FR-65d](FR.md#fr-65) |
| `.agents/skills/spec-review/SKILL.md` | edit | Register acceptance-delivery category 16 in active Codex review. [FR-65d](FR.md#fr-65) |
| `.agents/skills/spec-review/references/categories.md` | edit | Document category 16 triggers, severity, and remediation. [FR-65d](FR.md#fr-65) |
| `.specs/spec-generator-v4/USER_STORIES.md` | edit | Add the missing FR-60 author story for atomic write-failure recovery. [FR-60](FR.md#fr-60) |
| `.specs/spec-generator-v4/TASKS.md` | edit | Trace Phase 39 review-hardening tasks. |
| `.specs/spec-generator-v4/FILE_CHANGES.md` | edit | Trace concrete Phase 39 files and retain shipped create rows as inactive history. |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | Make fail-closed edge behavior explicit in `SPECGEN004_565`. |

- FR.md: amend FR-36

- ACCEPTANCE_CRITERIA.md: add AC-36.7 (FR-36)

- ACCEPTANCE_CRITERIA.md: add AC-36.8 (FR-36)

- ACCEPTANCE_CRITERIA.md: add AC-36.9 (FR-36)

- ACCEPTANCE_CRITERIA.md: add AC-36.10 (FR-36)

## Phase 13 follow-up — first-class identity (#172)

| Path | Change | Requirement |
|---|---|---|
| `tools/spec-graph/identity.ts` | Create the canonical namespace/localId parse, format, local-id and normalization-collision helpers. | [FR-36](FR.md#fr-36), [AC-36.7](ACCEPTANCE_CRITERIA.md#ac-367), [AC-36.9](ACCEPTANCE_CRITERIA.md#ac-369) |
| `tools/spec-graph/types.ts`, `coverage.ts`, `builder.ts`, `conformance.ts`, `collision-probe.ts`, `corpus-health.ts`, `readiness-inventory.ts` | Replace ad-hoc identity string handling and expose blocking exact/case/NFKC collision evidence without merging cross-namespace IDs. | [FR-36](FR.md#fr-36), [AC-36.8](ACCEPTANCE_CRITERIA.md#ac-368), [AC-36.9](ACCEPTANCE_CRITERIA.md#ac-369) |
| `tools/spec-mcp-server/tools.ts`, `tools/spec-mcp-server/server.bundle.mjs` | Preserve qualified and `{spec,node_id}` lookup; keep `AMBIGUOUS_BARE_ID` wire compatibility and add `local_id` plus sorted candidates. | [FR-36](FR.md#fr-36), [AC-36.8](ACCEPTANCE_CRITERIA.md#ac-368) |
| `tests/step_definitions/feature36_composite_graph.ts`, `.specs/spec-generator-v4/spec-generator-v4.feature` | BDD-first RED/GREEN scenarios over the real identity, graph, collision probe and MCP registry; no new non-BDD test file. | [AC-36.10](ACCEPTANCE_CRITERIA.md#ac-3610) |


- TASKS.md: add backlog task `P13-5` (FR-36)

## Phase 40 — typed requirement metadata and delivery demands (#171, #169)

| Path | Change | Requirement |
|---|---|---|
| `tools/spec-graph/metadata-schema.ts` | Typed schema, validator, parser and renderer. | [FR-66](FR.md#fr-66), [AC-66.1](ACCEPTANCE_CRITERIA.md#ac-661), [AC-66.2](ACCEPTANCE_CRITERIA.md#ac-662) |
| `tools/spec-graph/delivery-demands.ts` | Closed registry, evidence resolution, forwarding and non-empty ALL. | [AC-66.3](ACCEPTANCE_CRITERIA.md#ac-663), [AC-66.4](ACCEPTANCE_CRITERIA.md#ac-664), [AC-66.5](ACCEPTANCE_CRITERIA.md#ac-665) |
| `tools/spec-graph/migrate-requirement-metadata.ts` | Schema-version dry-run/apply report. | [AC-66.6](ACCEPTANCE_CRITERIA.md#ac-666) |
| `tools/spec-graph/types.ts`, `parsers/md.ts`, `fr-census.ts`, `conformance.ts` | Attach declarations and additive delivery truth to the existing graph. | [FR-66](FR.md#fr-66) |
| `tools/spec-mcp-server/tools.ts`, `server.bundle.mjs` | Validated authoring, policy query and distributed runtime. | [AC-66.6](ACCEPTANCE_CRITERIA.md#ac-666) |
| `tests/step_definitions/feature37_fr_census.ts`, `.specs/spec-generator-v4/spec-generator-v4.feature` | Real-code Docker BDD RED/GREEN. | [FR-66](FR.md#fr-66) |


- TASKS.md: add Phase 40 — Typed requirement metadata and delivery demands

- TASKS.md: add backlog task `P40-1` (FR-66)


## FR-67 — Typed edge endpoint contract (#181/#182)

| Action | Path | Reason | FRs |
|---|---|---|---|
| CREATE | `tools/spec-graph/edge-schema.ts` | Exhaustive endpoint rules and diagnostics | FR-67 |
| MODIFY | `tools/spec-graph/types.ts` | Add verifies, entitles, and endpoint diagnostics | FR-67 |
| MODIFY | `tools/spec-graph/builder.ts` | Validate full-build and generated edges | FR-67 |
| MODIFY | `tools/spec-graph/incremental.ts` | Validate incremental generated edges | FR-67 |
| MODIFY | `tools/spec-graph/conformance.ts` | Emit ENDPOINT_VIOLATION errors | FR-67 |
| MODIFY | `tools/spec-graph/corpus-health.ts` | Report endpoint violations | FR-67 |
| MODIFY | `tools/spec-mcp-server/tools.ts` | Traverse new semantic edge types | FR-67 |
| MODIFY | `tools/spec-mcp-server/sqlite/persist.ts` | Preserve and validate warm graphs | FR-67 |
| MODIFY | `tools/spec-mcp-server/server.bundle.mjs` | Ship the contract in distributed MCP | FR-67 |
| CREATE | `tests/step_definitions/feature67_edge_contracts.ts` | Real-code schema, MCP, and SQLite BDD | FR-67 |


- ACCEPTANCE_CRITERIA.md: add AC-67.7 (FR-67)


## FR-68..FR-71 — Completion evidence hardening

| Path | Action | Requirement | Planned change |
|---|---|---|---|
| `tools/spec-graph/types.ts` | MODIFY | FR-68, FR-69, FR-70, FR-71 | Add AC/NFR satisfaction records, `Evidence` node, manifest/review verdict types and new finding codes. |
| `tools/spec-graph/edge-schema.ts` | MODIFY | FR-70 | Add `evidenced-by` endpoints and preserve exhaustive endpoint validation. |
| `tools/spec-graph/parsers/md.ts` | MODIFY | FR-70 | Parse evidence manifests into graph nodes/edges through the same metadata validation path. |
| `tools/spec-graph/readiness-inventory.ts` | MODIFY | FR-68, FR-69 | Build own AC evidence, retain NFR evidence and evaluate mandatory `AC_SATISFACTION` / `NFR_SATISFACTION` lanes. |
| `tools/spec-graph/conformance.ts` | MODIFY | FR-68, FR-69, FR-70 | Emit blocking uncovered/unverified AC/NFR findings, reject bulk-tag laundering and invalid operational proof. |
| `tools/spec-graph/delivery-demands.ts` | MODIFY | FR-69, FR-70, FR-71 | Evaluate NFR demands, derive operational proof from live evidence state and independent review; forbid hand-authored PRESENT. |
| `tools/spec-graph/metadata-schema.ts` | MODIFY | FR-70 | Make demonstration/inspection imply operational proof and validate manifest/reference constraints. |
| `tools/spec-graph/verdict.ts` | MODIFY | FR-68, FR-69 | Include AC/NFR completion debt and mandatory lane results in one smart verdict. |
| `tools/spec-graph/builder.ts` | MODIFY | FR-70 | Ingest evidence manifests and preserve full/incremental parity. |
| `tools/spec-mcp-server/tools.ts` | MODIFY | FR-70, FR-71 | Expose evidence/review details and refuse invalid evidence-bearing transactions before write. |
| `tools/spec-mcp-server/mutations.ts` | MODIFY | FR-70 | Validate evidence graph changes atomically. |
| `tools/spec-mcp-server/sqlite/persist.ts` | MODIFY | FR-70, FR-71 | Persist/restore Evidence nodes, edges, manifests and independent review verdicts losslessly. |
| `tools/spec-llm-judge/` | MODIFY | FR-71 | Add digest-bound media review with distinct producer/reviewer identities and structured per-criterion outcomes. |
| `.claude/skills/` demonstration workflow | CREATE | FR-71 | Drive live exercise, finalized recording, manifest generation, independent judge invocation and evidence registration. |
| `tests/step_definitions/feature68_completion_evidence.ts` | CREATE | FR-68, FR-69, FR-70, FR-71 | Real integration step definitions for SPECGEN004_596..615; no inline duplicate fixtures/helpers. |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | MODIFY | FR-68, FR-69, FR-70, FR-71 | BDD scenarios with both FR and AC tags, including invariant and counterfeit-artifact cases. |
| `.specs/spec-generator-v4/attachments/` | CREATE | FR-71 | Dogfood MP4, manifest and independent review record for FR-71's own demonstration obligation. |


## FR-72..FR-79 — Execution-aware task creation and planning

| Action | Path | FRs | Planned responsibility |
|---|---|---|---|
| MODIFY | `tools/spec-graph/types.ts` | FR-72..FR-79 | Canonical task, dependency, surface, conflict, plan, evidence, discovery-patch, and report types. |
| MODIFY | `tools/spec-graph/parsers/tasks.ts` | FR-72, FR-73, FR-74, FR-77, FR-78 | Strict TASKS.md compatibility parser, lossless renderer, legacy findings, and typed-task validation input. |
| MODIFY | `tools/spec-graph/builder.ts` | FR-72, FR-73, FR-74, FR-77, FR-78 | Build/incrementally refresh typed task nodes, edges, claims, evidence, and proposal state. |
| MODIFY | `tools/spec-graph/edge-schema.ts` | FR-73, FR-77 | Typed dependency and task-owned evidence endpoint contracts. |
| MODIFY | `tools/spec-graph/task-lifecycle.ts` | FR-72, FR-73, FR-77 | READY/current-success evaluation, stale recovery, and evidence-policy completion. |
| MODIFY | `tools/spec-graph/coverage.ts` | FR-77 | Task-owned scenario/evidence coverage and filtered-versus-full proof evaluation. |
| MODIFY | `tools/spec-graph/conformance.ts` | FR-72..FR-79 | Typed task, DAG, surface, discovery, rollout, and stale-completion findings. |
| MODIFY | `tools/spec-graph/task-census.ts` | FR-72, FR-79 | Canonical summary/census projection, migration counts, and rollout reports. |
| CREATE | `tools/spec-graph/task-plan.ts` | FR-72, FR-73, FR-76 | Canonical plan input/result contracts and deterministic scheduling primitives. |
| CREATE | `tools/spec-graph/task-conflicts.ts` | FR-74, FR-75 | Surface normalization, semantic overlap, conflict derivation, explanations, and expiring overrides. |
| CREATE | `tools/spec-graph/task-planner.ts` | FR-73, FR-75, FR-76 | Selected-subgraph topological waves, conflict-free batches, critical path, slack, and blocked impact. |
| CREATE | `tools/spec-graph/task-impact.ts` | FR-74, FR-77 | Direct/transitive blast radius, planned-vs-actual reconciliation, and stale closure explanations. |
| MODIFY | `tools/spec-mcp-server/tools.ts` | FR-72..FR-79 | Execution-plan query and typed task/graph-patch dry-run/apply MCP contracts. |
| MODIFY | `tools/spec-mcp-server/server.ts` | FR-79 | Register planning, report, and CAS/all-or-nothing mutation routes. |
| MODIFY | `tools/spec-mcp-server/sqlite/persist.ts` | FR-72..FR-79 | Persist/restore canonical tasks, typed edges, claims, evidence, stale state, and plans. |
| MODIFY | `tools/spec-mcp-server/server.bundle.mjs` | FR-79 | Rebuild installed runtime and prove dependency-absent behavior. |
| MODIFY | `tools/specs-generator/specs-generator-core.mjs` | FR-72, FR-79 | Generator compatibility, observe/warn/enforce migration, and task projection integration. |
| MODIFY | `tools/specs-generator/spec-verdict.ts` | FR-73, FR-77, FR-79 | Fail-closed cycle/stale-completion truth plus planning-quality report integration. |
| MODIFY | `.claude/skills/task-board-forms/SKILL.md` | FR-72, FR-79 | Authoring guidance for canonical task fields and migration-safe summary generation. |
| MODIFY | `.claude/skills/create-spec/references/phase3_finalization.md` | FR-72..FR-79 | Finalization workflow for typed task planning, evidence, discovery, reports, and rollout. |
| CREATE | `tests/step_definitions/feature72_task_planning.ts` | FR-72..FR-79 | Real-engine BDD step definitions for SPECGEN004_616..656; no new non-BDD test file. |
| MODIFY | `.specs/spec-generator-v4/spec-generator-v4.feature` | FR-72..FR-79 | Behavioral BDD scenarios SPECGEN004_616..656. |



## FR-72..FR-79 file-change completeness amendment

This table is the explicit implementation inventory for the execution-aware task-planning slice; every existing path is MODIFY and only the planner/conflict/impact modules plus BDD step definition are CREATE.

| Action | Path | FR/AC responsibility |
|---|---|---|
| MODIFY | `tools/spec-graph/types.ts` | FR-72; AC-72.1..72.5 — versioned canonical task representation and preservation fields. |
| MODIFY | `tools/spec-graph/parsers/tasks.ts` | FR-72; AC-72.1..72.5 — Markdown mapping, unknown/comment retention, diagnostics, and duplicate IDs. |
| MODIFY | `tools/spec-graph/task-census.ts` | FR-72, FR-79; AC-72.3, AC-79.6 — source-preserving census and rollout counts. |
| MODIFY | `tools/spec-graph/incremental.ts` | FR-72, FR-73, FR-76; AC-72.4, AC-73.5, AC-76.5 — deterministic incremental projection invalidation. |
| MODIFY | `tools/spec-graph/coverage.ts` | FR-77; AC-77.1..77.5 — task-owned proof and full-proof evaluation. |
| MODIFY | `tools/spec-graph/conformance.ts` | FR-72..FR-79; AC-72.3, AC-73.2, AC-74.2, AC-77.4, AC-78.4, AC-79.6 — named fail-closed diagnostics. |
| MODIFY | `tools/spec-graph/builder.ts` | FR-72, FR-73, FR-74, FR-77, FR-78; AC-72.4, AC-73.1, AC-74.1, AC-77.1, AC-78.1 — typed graph construction. |
| MODIFY | `tools/spec-graph/edge-schema.ts` | FR-73, FR-77; AC-73.1, AC-77.1 — dependency/evidence endpoints. |
| MODIFY | `tools/spec-mcp-server/tools.ts` | FR-74..FR-79; AC-74.4, AC-75.3, AC-76.5, AC-79.1..79.6 — versioned query, redaction, CAS, and reports. |
| MODIFY | `tools/spec-mcp-server/server.ts` | FR-79; AC-79.1, AC-79.2, AC-79.4 — actual source server route registration and dependency-absent error path. |
| MODIFY | `tools/spec-mcp-server/sqlite/persist.ts` | FR-72, FR-73, FR-76, FR-77, FR-79; AC-73.5, AC-76.5, AC-77.5, AC-79.3 — canonical persistence/cold-warm parity. |
| MODIFY | `tools/specs-generator/specs-generator-core.mjs` | FR-72, FR-79; AC-72.4, AC-79.6 — core task-summary renderer and staged migration output. |
| MODIFY | `tools/specs-generator/spec-status.ts` | FR-72, FR-76, FR-79; AC-72.4, AC-76.4, AC-79.5 — human summary rendering and planning-risk status. |
| MODIFY | `tools/specs-generator/spec-verdict.ts` | FR-73, FR-77, FR-79; AC-73.2, AC-77.4, AC-79.5 — cycle/stale fail-closed verdict integration. |
| MODIFY | `tools/spec-mcp-server/server.bundle.mjs` | FR-79; AC-79.4 — bundled installed runtime. |
| MODIFY | `.claude/skills/task-board-forms/SKILL.md` | FR-72, FR-79 — typed task authoring/summary workflow. |
| MODIFY | `.claude/skills/create-spec/references/phase3_finalization.md` | FR-72..FR-79 — finalization and rollout workflow. |
| CREATE | `tools/spec-graph/task-plan.ts` | FR-72, FR-73, FR-76; AC-72.4, AC-73.5, AC-76.1..76.5 — plan contract. |
| CREATE | `tools/spec-graph/task-conflicts.ts` | FR-74, FR-75; AC-74.2, AC-75.1..75.5 — claim normalization/conflict derivation. |
| CREATE | `tools/spec-graph/task-planner.ts` | FR-73, FR-75, FR-76; AC-73.4, AC-75.5, AC-76.1..76.5 — waves/batches/schedule. |
| CREATE | `tools/spec-graph/task-impact.ts` | FR-74, FR-77; AC-74.3..74.5, AC-77.2 — reconciliation and stale impact. |
| CREATE | `tests/step_definitions/feature72_task_planning.ts` | FR-72..FR-79; SPECGEN004_616..656 — real-engine BDD step definitions only. |
| MODIFY | `.specs/spec-generator-v4/spec-generator-v4.feature` | FR-72..FR-79; SPECGEN004_616..656 — behavioral BDD contracts. |



## Phase 45 prior-art reference

| Action | Path | Requirement / purpose |
|---|---|---|
| CREATE | `.specs/spec-generator-v4/TASK_PLANNING_PRIOR_ART.md` | [FR-72](FR.md#fr-72)–[FR-79](FR.md#fr-79); canonical Russian prior-art reference for Phase 45 algorithms, original source URLs, licenses, adoption boundaries, local P45 mapping, and first-increment exclusions. |



## FR-80 pre-scheduling task-synthesis implementation inventory

| Action | Path | FR/AC responsibility |
|---|---|---|
| MODIFY | `tools/spec-graph/types.ts` | FR-80; AC-80.1..80.10 — canonical synthesis inputs, `domainMode`, acceptance-lane ownership, causal edge, investigation, surface, and conservation types. |
| CREATE | `tools/spec-graph/task-synthesis.ts` | FR-80; AC-80.1..80.10 — pure deterministic FR/AC/DESIGN/BDD/repository-reality to `task/v1` synthesis, stable ordering, conditional DDD classification, conservation, and named diagnostics. |
| MODIFY | `tools/spec-graph/builder.ts` | FR-80; AC-80.1, AC-80.10 — invoke synthesis into the existing stored SpecGraph before FR-72..FR-79 planning consumers. |
| MODIFY | `tools/spec-graph/edge-schema.ts` | FR-80; AC-80.6, AC-80.7, AC-80.10 — validate vertical-slice ownership and typed `RED -> GREEN -> REFACTOR` causal edges without a second graph. |
| MODIFY | `tools/spec-graph/conformance.ts` | FR-80; AC-80.4, AC-80.5, AC-80.7, AC-80.9 — fail closed for lane conservation, unknown-surface investigations, causal ordering, loss, and duplication. |
| MODIFY | `tools/spec-graph/task-census.ts` | FR-80; AC-80.4, AC-80.9 — deterministic source-claim and acceptance-lane conservation census. |
| MODIFY | `tools/spec-graph/task-lifecycle.ts` | FR-80; AC-80.5 — prevent finalization while a synthesis-owned `BLOCKED` investigation remains unresolved. |
| CREATE | `tools/spec-graph/task-plan.ts` | FR-80; AC-80.10 — consume existing synthesized canonical nodes and edges as the planner input contract. |
| MODIFY | `tools/spec-mcp-server/tools.ts` | FR-80; AC-80.1, AC-80.5, AC-80.9, AC-80.10 — return deterministic synthesis records and named diagnostics from the stored graph. |
| CREATE | `tests/step_definitions/feature80_task_synthesis.ts` | FR-80; SPECGEN004_657..661 — real-engine BDD step definitions for domain, no-domain, blocked, conservation, and causal-order lanes. |
| MODIFY | `.specs/spec-generator-v4/spec-generator-v4.feature` | FR-80; SPECGEN004_657..661 — traceable BDD scenarios. |




### FR-80 agent-execution-plan amendment

| Action | Path | FR/AC responsibility |
|---|---|---|
| MODIFY | `tools/spec-graph/types.ts` | FR-80; AC-80.10 — approved-design and responsibility-map input, canonical-vs-micro-step types, `TaskBrief`, `ExecutionOutcome`, `SafeBatch` and machine-checkable independence proof. |
| MODIFY | `tools/spec-graph/task-synthesis.ts` | FR-80; AC-80.10 — deterministic synthesis, embedded 2–5-minute steps, pre-planner review gate, named findings, and outcome follow-up proposals. |
| MODIFY | `tools/spec-graph/task-plan.ts` | FR-80; AC-80.10 — self-contained `TaskPlanResult` canonical-data projection with no second authority or executor. |
| MODIFY | `tools/spec-graph/task-planner.ts` | FR-80; AC-80.10 — safe-batch calculation and pairwise no-path/no-conflict proof. |
| MODIFY | `tools/spec-graph/task-lifecycle.ts` | FR-80; AC-80.10 — evidence-backed `DONE` completion and diagnostic/follow-up handling for `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, and `BLOCKED`. |
| MODIFY | `tools/spec-mcp-server/tools.ts` | FR-80; AC-80.10 — agent-consumable brief, outcome diagnostics, and safe-batch proof projection. |
| MODIFY | `tests/step_definitions/feature80_task_synthesis.ts` | FR-80; SPECGEN004_662..664 — real-engine BDD steps for inputs/step granularity, review gate, and plan handoff/outcomes/batch proof. |
| MODIFY | `.specs/spec-generator-v4/spec-generator-v4.feature` | FR-80; SPECGEN004_662..664 — traceable BDD contracts for the amendment. |

- FR.md: amend FR-49 (+4 AC link(s))


## Phase 46 — Cursor compat-first (FR-81)

| Path | Action | Reason |
|------|--------|--------|
| `.cursor/mcp.json` | create | Cursor path-layout twin of root door ([FR-81](FR.md#fr-81)) |
| `tools/spec-mcp-server/ensure-cursor-mcp.ts` | create | Sync/check twin vs root ([FR-81](FR.md#fr-81) e/g) |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/cursor-mcp-twin.ts` | create | Doctor C33 warn + apply hint ([FR-81](FR.md#fr-81) g) |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` | edit | Register C33 |
| `tests/step_definitions/feature81_cursor_compat.ts` | create | Deterministic SPECGEN004_665–667 steps |
| `README.md` (spec) | edit | Host note + Cursor install checklist |


## Phase 47 — Bounded MCP query contracts (FR-82)

| Action | Path | Reason |
|---|---|---|
| EDIT | `tools/spec-graph/types.ts` | FR-82; task query nodes carry explicit comment, blocker, and GitHub-issue evidence fields. |
| EDIT | `tools/spec-graph/parsers/tasks.ts` | FR-82; parse only authored task comments/blockers and linked GitHub issue references. |
| EDIT | `tools/spec-mcp-server/tools.ts` | FR-82; add bounded `list_tasks`, truthful `list_phase_tasks`, spec-scoped complete `search`, compact `get_spec_status` summary, bounded `read_spec_doc`, and filtered-proof next-action contracts. |
| EDIT | `tools/spec-mcp-server/lifecycle.ts` | FR-82; reuse unchanged graph/census state instead of an unnecessary read-side global census recomputation. |
| EDIT | `tools/spec-mcp-server/server.ts` | FR-82; distributed stdio server treats stdin EOF as a clean session shutdown for real bundle verification. |
| EDIT | `tools/spec-mcp-server/server.bundle.mjs` | FR-82; rebuilt user-distributed MCP artifact containing the bounded query contracts. |
| EDIT | `tools/spec-mcp-server/__tests__/tools.test.ts` | FR-82; real-handler regressions for pagination, phase states, summary reuse, filtered proof, and canonical registry shape. |
| EDIT | `tools/spec-mcp-server/dogfood-dataset.ts` | FR-82; live probes for bounded task and phase inventory. |
| CREATE | `tests/step_definitions/feature82_bounded_queries.ts` | FR-82; integration BDD steps drive real MCP handlers and the captured incident acceptance target. |
| EDIT | `tests/step_definitions/feature_spec_hooks_stdin.ts` | FR-82; real bundle stdin tool-set smoke includes `list_tasks` and the canonical registry. |
| EDIT | `.claude/skills/spec-graph-query/SKILL.md` | FR-82; user-facing query workflow documents bounded task inventory and allowed tools. |
| EDIT | `.claude/skills/spec-generator-orchestrator/scripts/feature-map.ts` | FR-82; capability/consumer drift maps reference the new task query tool. |
| EDIT | `.specs/spec-generator-v4/spec-generator-v4.feature` | FR-82; SPECGEN004_670..677 source scenarios with real-handler and invariant contracts. |
| CREATE | `audit-reports/wf-0315d03b-28f-mcp-incident.json` | FR-82; captured six-attempt/695-call incident baseline and bounded acceptance target with journal provenance. |
| EDIT | `tools/specs-generator/specs-generator-core.mjs` | FR-82; authoritative audit matches exact top-level task FR claims and ignores checked Done-When evidence for deferred siblings. |
| EDIT | `tools/specs-validator/audit-checks.ts` | FR-82; typed partial-implementation audit shares the exact top-level FR-token contract. |
| EDIT | `tests/step_definitions/feature3_spec_quality_audit.ts` | FR-82; regression fixture for FR-82 completion evidence beside deferred FR-83. |
| EDIT | `.specs/spec-phase-gate/spec-phase-gate.feature` | FR-82; PLUGIN008_35 regression for deferred-sibling false positives. |
| EDIT | `NFR.md` | FR-82; explicit page, response-byte, latency, call-count, and no-N×M budgets. |

- ACCEPTANCE_CRITERIA.md: add AC-77.6 (FR-77)

- ACCEPTANCE_CRITERIA.md: add AC-78.6 (FR-78)

- ACCEPTANCE_CRITERIA.md: add AC-79.7 (FR-79)

| `tools/spec-graph/task-evidence.ts` | edit | FR-77 / AC-77.6: revalidate restored task evidence and derive completion eligibility |
| `tools/spec-graph/task-discovery.ts` | edit | FR-78 / AC-78.6: recompute proposal integrity and approval state before apply |
| `tools/spec-graph/task-plan-integration.ts` | edit | FR-79 / AC-79.7: stale evidence blocks completeness and explicit conflicts survive patches |
| `tools/spec-graph/task-plan-integration.bundle.mjs` | edit | FR-79 / AC-79.7: ship corrected dependency-absent planning behavior |
| `tests/step_definitions/feature77_task_evidence.ts` | edit | SPECGEN004_678 regression against invalid restored-evidence completion |
| `tests/step_definitions/feature78_task_discovery.ts` | edit | SPECGEN004_679 regression against modified approval state |
| `tests/step_definitions/feature79_task_plan_integration.ts` | edit | SPECGEN004_680–681 regressions for stale completion and conflict conservation |
| `tests/step_definitions/feature63_precheck_inventory.ts` | edit | SPECGEN004_566: derive stale fixture time from canonical producer timestamp and assert the real graph evidence state |
| `tools/spec-graph/readiness-inventory.ts` | edit | FR-63 / SPECGEN004_566: classify a stale canonical pass as execution debt while retaining canonical provenance |

- TASKS.md: register incident `incident-2026-08-03-green-ci-allowed-completion-without-task` (FR-80, FR-71, FR-77)

- TASKS.md: add Phase 48 — Verification-bearing generated tasks

- FR.md: amend FR-80

- ACCEPTANCE_CRITERIA.md: add AC-80.11 (FR-80)

- TASKS.md: add backlog task `p48-verification-contract-schema` (FR-80)

- TASKS.md: add backlog task `p48-independent-verifier-attestation` (FR-80, FR-71, FR-77)

- TASKS.md: add backlog task `p48-bounded-verification-workflow` (FR-80)

- TASKS.md: add backlog task `p48-runtime-mutation-regressions` (FR-80, FR-53, FR-71, FR-77)

- ACCEPTANCE_CRITERIA.md: add AC-81.7 (FR-81)

- ACCEPTANCE_CRITERIA.md: add AC-79.8 (FR-79)

- ACCEPTANCE_CRITERIA.md: add AC-80.12 (FR-80)

| `tools/live-evidence/schema.mjs` | edit | [FR-81](FR.md#fr-81) — v2 manifest requires workspace inputs, exact producer identity, and trace-event digest binding. |
| `tools/live-evidence/validator.mjs` | edit | [FR-81](FR.md#fr-81) — recompute checkout/workspace provenance and reject missing expected scenarios/profiles. |
| `tools/live-evidence/validator.d.mts` | edit | [FR-81](FR.md#fr-81) — exported strict live-evidence validation contract. |
| `tools/spec-graph/task-plan-integration.ts` | edit | [FR-79](FR.md#fr-79) — retain canonical diagnostics and require persistence-level compare-and-swap. |
| `tools/spec-graph/task-plan-integration.bundle.mjs` | edit | [FR-79](FR.md#fr-79) — rebuilt shipped dependency-absent planning runtime. |
| `tools/spec-graph/task-synthesis.ts` | edit | [FR-80](FR.md#fr-80) — validate registries, dependency targets, and non-blank causal work. |
| `tests/step_definitions/feature79_task_plan_integration.ts` | edit | [FR-79](FR.md#fr-79) — real-function invalid-task and competing-writer regressions. |
| `tests/step_definitions/feature80_task_synthesis.ts` | edit | [FR-80](FR.md#fr-80) — real strict-synthesis reference and causal-step regression. |
| `tests/step_definitions/feature81_cursor_compat.ts` | edit | [FR-81](FR.md#fr-81) — real temporary Git/workspace/trace artifacts exercise the validator. |
| `package.json` | edit | [FR-79](FR.md#fr-79) — deterministic task-plan bundle rebuild is part of the canonical bundle build. |

- ACCEPTANCE_CRITERIA.md: add AC-63.4 (FR-63)

| `tools/spec-graph/readiness-inventory.ts` | edit | [FR-63](FR.md#fr-63) AC-63.4 — scenario execution-ownership scope: proven retired-historical, fail-closed unproven debt, external-live lane, LIVE_EVIDENCE mandatory lane. |
| `tools/specs-generator/spec-verdict.ts` | edit | [FR-63](FR.md#fr-63) AC-63.4 — LIVE_EVIDENCE lane rendering and scope-aware NOT_RUN/LIVE_EVIDENCE/HISTORICAL_RETIRED notes. |
| `tools/spec-mcp-server/tools.ts` | edit | [FR-63](FR.md#fr-63) AC-63.4 — scope-aware execution gaps, lifecycle, and hint on the status views. |
| `tests/step_definitions/feature63_precheck_inventory.ts` | edit | SPECGEN004_686..687 — scope classifier regressions over real readiness fixtures; mandatory-lane pins updated. |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | [FR-63](FR.md#fr-63) — SPECGEN004_686..687 traceable scenarios for AC-63.4. |
| `tools/spec-graph/coverage.ts` | edit | [FR-81](FR.md#fr-81) AC-63.4 — owner-attested live scenarios (`@live-evidence @live-attested`) satisfy DONE task evidence explicitly and auditably. |
| `tools/spec-graph/readiness-inventory.ts` | edit | [FR-81](FR.md#fr-81) AC-63.4 — `@live-attested` recognized in the scope classifier and LIVE_EVIDENCE lane. |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | [FR-81](FR.md#fr-81) — SPECGEN004_668/_669 owner attestation tags + dated comments (2026-08-04). |
| `.specs/spec-generator-v4/TASKS.md` | edit | [FR-81](FR.md#fr-81) — p46-cursor-live-dogfood closed with the attestation evidence note. |
| `.specs/spec-generator-v4/CHANGELOG.md` | edit | 2026-08-04 readiness-debt closure + owner attestation record. |
| `tools/spec-graph/readiness-inventory.ts` | edit | FR-68 AC_SATISFACTION producer fix — AC satisfaction computed from OWN tested-by scenarios + current outcomes (fresh PASSED or owner attestation); the graph never emits verifies edges targeting ACs, so the old verifies-only formula could structurally never satisfy the lane. |
| `tools/spec-graph/coverage.ts` | edit | FR-68 — isLiveAttestedScenario shared helper consumed by verifiedStatus/task truth. |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | FR-68 AC-SATISFACTION wave 1 — 33 ACs (FR-1..FR-14) mapped to their own verifying scenarios via @AC-N.N tags; 5 ACs flagged no-candidate. |
| `audit-reports/ac-mapping-spec-generator-v4.md` | create | Audited mapping journal (AC → scenario → quoted justification step) for all waves. |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | FR-68 AC-SATISFACTION wave 2 — 29 ACs (FR-15..FR-28) mapped to their own verifying scenarios via @AC-N.N tags; 3 ACs flagged no-candidate. |

- ACCEPTANCE_CRITERIA.md: add AC-81.8 (FR-81)

- ACCEPTANCE_CRITERIA.md: add AC-81.9 (FR-81)

- ACCEPTANCE_CRITERIA.md: add AC-81.10 (FR-81)

- FR.md: amend FR-81

- TASKS.md: add Phase 49 — Live-evidence containment, atomic CAS proof, and strict-synthesis guards (2026-08-03)

- TASKS.md: add backlog task `p49-live-evidence-containment` (FR-81)

- TASKS.md: add backlog task `p49-two-sided-completeness` (FR-81)

- TASKS.md: add backlog task `p49-ground-truth-fixture` (FR-81)

- TASKS.md: add backlog task `p49-storage-cas-concurrency-proof` (FR-79)

- TASKS.md: add backlog task `p49-invalid-task-scheduling-guard` (FR-79)

- TASKS.md: add backlog task `p49-synthesis-mismatch-rejection` (FR-80)

Phase 49 — Live-evidence containment, atomic CAS proof, strict-synthesis guards

| Path | Action | Reason |
|---|---|---|
| `tools/live-evidence/validator.mjs` | EDIT | [FR-81](FR.md#fr-81) AC-81.8/AC-81.9 — canonical realpath containment and two-sided expected-record completeness. |
| `tests/fixtures/live-evidence/manifest.json` | CREATE | [FR-81](FR.md#fr-81) AC-81.10 — captured live-evidence manifest for SPECGEN004_688. |
| `tests/fixtures/live-evidence/trace.json` | CREATE | [FR-81](FR.md#fr-81) AC-81.10 — captured trace artifact for SPECGEN004_688. |
| `tests/fixtures/live-evidence/workspace.txt` | CREATE | [FR-81](FR.md#fr-81) AC-81.10 — captured workspace input for SPECGEN004_688. |
| `tests/fixtures/live-evidence/ground-truth.json` | CREATE | [FR-81](FR.md#fr-81) AC-81.10 — independently precomputed digest constants. |
| `tests/fixtures/live-evidence/PROVENANCE.md` | CREATE | [FR-81](FR.md#fr-81) AC-81.10 — capture commands, tools, and byte-stability contract. |
| `tests/step_definitions/feature81_cursor_compat.ts` | EDIT | [FR-81](FR.md#fr-81) AC-81.8/AC-81.9/AC-81.10 — SPECGEN004_688-690 steps and full-expectation live validation. |
| `tools/spec-graph/task-plan-integration.ts` | EDIT | [FR-79](FR.md#fr-79) AC-79.8 — createFileCasAdapter storage-level CAS and invalid-task scheduling guard. |
| `tools/spec-graph/task-plan-integration.bundle.mjs` | EDIT | [FR-79](FR.md#fr-79) AC-79.8 — rebuilt dependency-absent planning runtime. |
| `tests/fixtures/task-plan-cas-writer.mjs` | CREATE | [FR-79](FR.md#fr-79) AC-79.8 — concurrent child writer for the SPECGEN004_684 barrier race. |
| `tests/step_definitions/feature79_task_plan_integration.ts` | EDIT | [FR-79](FR.md#fr-79) AC-79.8 — real simultaneous CAS race and SPECGEN004_691 invalid-task proof. |
| `tests/step_definitions/feature80_task_synthesis.ts` | EDIT | [FR-80](FR.md#fr-80) AC-80.12 — SPECGEN004_692 mismatched/inapplicable rejection proof. |
| `tools/codex-plugin-support/verify-whitelist.ts` | EDIT | codex-init FR-5 — remove production test-only probe override; PATH is the only resolution path. |
| `tests/step_definitions/feature_codex_init.ts` | EDIT | codex-init FR-5 — PATH-shim positive proof and env-override self-challenge. |
| `.gitattributes` | EDIT | FR-81 AC-81.10 — force LF for live-evidence ground-truth fixtures so digests stay byte-stable. |
