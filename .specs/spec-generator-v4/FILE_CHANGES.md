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
| `.claude/skills/create-spec/SKILL.md` | edit | Add complexity heuristic + `--research-done` flag recursion guard ([FR-12](FR.md#fr-12)) |
| `.claude/skills/create-spec/references/phase1_discovery.md` | edit | Update Step 5 to invoke `architecture-research-workflow` when heuristic triggers ([FR-12](FR.md#fr-12)) |
| `.claude-plugin/plugin.json` | edit | Skill distribution через canonical `"skills": ".claude/skills"` dir override — отдельная регистрация per-skill не нужна в v2 ([FR-12](FR.md#fr-12)) |
| `CLAUDE.md` | edit | Update skill index table with `architecture-research-workflow` entry ([FR-12](FR.md#fr-12)) |

## Phase 7 — Cross-spec reconciliation

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/cross-spec-reconcile/SKILL.md` | create | Reconcile skill entrypoint with 6-step execution flow + output contract ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/build-graph.ts` | create | Parse `.specs/*/{FR,DESIGN,NFR,SCHEMA}.md` + `.feature` into per-spec concept index via remark + mdast ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/check-cross-spec.ts` | create | Pairwise terminology / FR overlap / ownership / runtime identifier mechanical checks ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/check-impl-drift.ts` | create | File existence / symbol grep / MCP tool exports / hook registration validation ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/code-shape-index.ts` | create | Pre-index code exports / module boundaries / ports / MCP tools / hooks for architectural decision detection ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/semantic-judge.ts` | create | Agent subagent dispatcher with concept-overlap pre-filter + sha256 content-hash cache ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/write-yaml-report.ts` | create | Atomic YAML writer with merge preserving acknowledged/resolution fields + Coverage Summary dashboard ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/scripts/write-sarif-report.ts` | create | SARIF 2.1.0 secondary output writer with 1:1 rule-id mapping to finding codes ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/references/finding-codes.md` | create | All 28 finding codes (15 cross-spec/* + 13 impl-drift/*) with severity + class + remediation snippet ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/references/yaml-schema.md` | create | Consistency Report YAML schema reference with full example output ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-reconcile/references/semantic-judge-prompt.md` | create | Agent subagent prompt template (NO interactive prompts permitted; structured JSON output only) ([FR-17](FR.md#fr-17)) |
| `.claude/skills/cross-spec-resolve/SKILL.md` | create | Resolve skill entrypoint with 7-step explain-confirm-apply execution flow ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/scripts/load-report.ts` | create | YAML loader with schema validation and missing-file hint ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/scripts/group-findings.ts` | create | Sort findings by severity + category, deduplicate by code+spec+location ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/scripts/apply-mechanical-fix.ts` | create | Explain-then-confirm-then-Edit pipeline with foreign-spec guard banner ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/scripts/update-yaml-resolution.ts` | create | Post-batch re-reconcile invocation + per-finding resolution_status update ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/references/fix-templates.md` | create | Per-finding-code fix recipe templates including Path A/B/C for architectural decisions ([FR-18](FR.md#fr-18)) |
| `.claude/skills/cross-spec-resolve/references/explain-before-edit.md` | create | 5-field explanation block pattern documentation ([FR-18](FR.md#fr-18)) |
| `.claude/skills/create-spec/SKILL.md` | edit | Add Phase 2 step 4d + Phase 3 step 1c reconcile invocations + Audit category dispatch ([FR-17](FR.md#fr-17)) |
| `.claude/skills/create-spec/references/phase2_requirements-and-design.md` | edit | Document new step 4d lightweight reconcile invocation + blocking semantics ([FR-17](FR.md#fr-17)) |
| `.claude/skills/create-spec/references/phase3_finalization.md` | edit | Document new step 1c lightweight reconcile re-check before STOP #3 ([FR-17](FR.md#fr-17)) |
| `.claude/skills/create-spec/references/phase3plus_audit-overview.md` | edit | Add 9th row CROSS_SPEC_CONSISTENCY to audit category table ([FR-17](FR.md#fr-17)) |
| `.claude/skills/create-spec/references/phase3plus_audit-cross-spec.md` | create | 9th audit category reference with Checks / Remediation / Severity / Resolution codes sections ([FR-17](FR.md#fr-17)) |
| `.claude-plugin/plugin.json` | edit | `cross-spec-reconcile` + `cross-spec-resolve` distributed через canonical `"skills": ".claude/skills"` dir override ([FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)) |
| `tests/fixtures/cross-spec-corpus/spec-a/FR.md` | create | Fixture spec A declaring session_token + src/auth/jwt.ts baseline ([FR-17](FR.md#fr-17)) |
| `tests/fixtures/cross-spec-corpus/spec-a/DESIGN.md` | create | Fixture spec A declaring latency budget <100ms on /api/auth ([FR-17](FR.md#fr-17)) |
| `tests/fixtures/cross-spec-corpus/spec-b/FR.md` | create | Fixture spec B declaring sessionToken + same path triggering runtime-identifier-drift + module-ownership-conflict ([FR-17](FR.md#fr-17)) |
| `tests/fixtures/cross-spec-corpus/spec-b/DESIGN.md` | create | Fixture spec B declaring latency <50ms conflicting with spec-a ([FR-17](FR.md#fr-17)) |
| `tests/fixtures/cross-spec-corpus/spec-c/FR.md` | create | Fixture spec C declaring MCP tool validate_user with no implementation file ([FR-17](FR.md#fr-17)) |
| `tests/fixtures/cross-spec-corpus/README.md` | create | Document intentional conflicts + expected finding codes per scenario ([FR-17](FR.md#fr-17)) |
| `tests/e2e/cross-spec-reconcile.test.ts` | create | E2E roundtrip 5 scenarios using spawnSync per integration-tests-first ([FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)) |
| `.claude/logs/cross-spec-overrides.jsonl` | create-on-write | JSONL audit log of acknowledged CRITICAL overrides ([FR-17](FR.md#fr-17)) |

## Spec / docs (cross-phase)

| Path | Action | Reason |
|------|--------|--------|
| `.specs/spec-generator-v4/*.md` | edit | Already filled (Phase 1-2 of spec workflow) ([FR-1](FR.md#fr-1)..[FR-16](FR.md#fr-16)) |
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

## Phase 30 — FR-57 scaffold-completeness audit (stub-detection gate, 2026-07-01)

| Path | Action | Reason |
|------|--------|--------|
| `tools/specs-generator/scaffold-sentinels.mjs` | create | Единый классификатор scaffold-сентинелов (builtins-only, co-located с `.mjs`-движком), извлекаемых дословно из `templates/*.template` (вырез fenced+inline кода + отсев строчных токенов/JSON-скобок + номера строк); ЕДИНСТВЕННЫЙ источник для validate-spec PLACEHOLDER и новой audit-категории ([FR-57](FR.md#fr-57)) |
| `tools/specs-generator/specs-generator-core.mjs` | edit | Новая audit-категория `SCAFFOLD_INCOMPLETE` (phase-gated ERROR/INFO) через классификатор; `validate-spec` PLACEHOLDER и FIXTURES_CONSISTENCY-плейсхолдер-ветка сведены на тот же классификатор ([FR-57](FR.md#fr-57)) |
| `tools/spec-graph/__tests__/scaffold-sentinels.test.ts` | create | Юнит: сентинел-матч + вырез кода + строчные токены + дрейф-регресс (сентинелы ⊇ шаблонных) + исключения templates/__fixtures__/backlog ([FR-57](FR.md#fr-57)) |
| `tests/step_definitions/feature57_scaffold_completeness.ts` | create | Биндит SPECGEN004_470..477 на реальный классификатор + audit-spec + spec-verdict (real-engine, без моков) ([FR-57](FR.md#fr-57)) |

## Total counts

| Phase | Files |
|-------|-------|
| Phase 0 | 11 (8 create + 3 edit) |
| Phase 1 | 10 (all create; `anchor-patterns.ts` поглощён `parsers/md.ts`) |
| Phase 2 | 13 (11 create + 2 edit; 11 per-tool файлов консолидированы в `tools.ts`) |
| Phase 3 | 5 (4 create + 1 edit; bridge + drift-check консолидированы в `spec-llm-judge/index.ts`) |
| Phase 4 | 6 (4 create + 2 edit; sqlite schema/migrations/recovery консолидированы в `sqlite/wrapper.ts`) |
| Phase 5 | 6 (all create) |
| Phase 6 | 17 (12 create + 5 edit) |
| Phase 7 | 32 (27 create + 5 edit) |
| Cross-phase docs | 4 (all edit; `dist/installer/extensions.js` удалён — v2 без installer) |
| Round 3 patch (v3→v4 transition) | 12 (all edit; 9 v4-spec files + 3 SKILL.md frontmatter) |
| Phase 18 (FR-43 legacy-triage) | 7 (6 create + 1 edit; classifier + LLM judge + dogfood + 2 unit + BDD step; legacy-v3 archived) |
| Phase 30 (FR-57 scaffold-completeness) | 4 (3 create + 1 edit; classifier + engine edit + unit + BDD step) |
| **Total** | **127 rows (~92 create + 35 edit; +4 Phase-30 FR-57 traced 2026-07-01)** |
