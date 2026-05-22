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
| `tests/fixtures/v4-self-test/.specs/` | create | Copy of `.specs/personal-pomogator/`, `.specs/codex-cli-support/`, `.specs/spec-generator-v3/` for self-test ([FR-1](FR.md#fr-1)) |
| `tests/fixtures/v4-self-test/features/` | create | Real `.feature` files from existing specs for Gherkin parser tests ([FR-1](FR.md#fr-1)) |
| `tests/fixtures/ndjson/sample.ndjson` | create | Pre-recorded canonical NDJSON for ingester unit-tests ([FR-1](FR.md#fr-1)) |
| `tests/fixtures/error-cases/` | create | Negative-case fixtures (corrupt-frontmatter, duplicate-fr, orphan-tagged) ([FR-5](FR.md#fr-5), [FR-13](FR.md#fr-13)) |
| `.github/workflows/test.yml` | edit | Add `test:bdd` job alongside existing vitest job ([FR-1](FR.md#fr-1)) |
| `extensions/onboard-repo/tools/onboard-repo/steps/detect-bdd.ts` | edit | Detect TS project + warn "v4 requires cucumber-js bootstrap" ([FR-1](FR.md#fr-1)) |

## Phase 1 — Graph builder + parsers (in-memory)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/tools/spec-graph/types.ts` | create | TypeScript types: Node, Edge, SpecGraph, NodeType, EdgeType ([FR-2](FR.md#fr-2), SCHEMA.md Entity 1) |
| `extensions/specs-workflow/tools/spec-graph/md-parser.ts` | create | unified+remark+remark-frontmatter+remark-wiki-link MD parser with dual-anchor registration ([FR-3](FR.md#fr-3)) |
| `extensions/specs-workflow/tools/spec-graph/anchor-patterns.ts` | create | Default regex patterns + config-driven override ([FR-3](FR.md#fr-3)) |
| `extensions/specs-workflow/tools/spec-graph/gherkin-parser.ts` | create | @cucumber/gherkin + @cucumber/gherkin-utils wrapper, tag inheritance ([FR-2](FR.md#fr-2)) |
| `extensions/specs-workflow/tools/spec-graph/ndjson-ingester.ts` | create | @cucumber/messages stream parser, JOIN keys → graph edges ([FR-2](FR.md#fr-2), [FR-9](FR.md#fr-9)) |
| `extensions/specs-workflow/tools/spec-graph/graph-builder.ts` | create | Orchestrates parsers, merges trees → SpecGraph, in-memory store ([FR-2](FR.md#fr-2)) |
| `extensions/specs-workflow/tools/spec-graph/incremental-rebuild.ts` | create | Hash-based change detection, only affected subgraph re-parse ([FR-2](FR.md#fr-2), NFR-Performance-2) |
| `extensions/specs-workflow/tools/spec-graph/conformance-checker.ts` | create | All structural checks (UNCOVERED_FR/ORPHAN_TASK/BROKEN_REF/etc.) returning Finding[] ([FR-13](FR.md#fr-13), SCHEMA.md Entity 6) |
| `extensions/specs-workflow/tools/spec-graph/__tests__/md-parser.test.ts` | create | vitest unit tests for parser regex + dual-anchor ([FR-3](FR.md#fr-3)) |
| `extensions/specs-workflow/tools/spec-graph/__tests__/graph-builder.test.ts` | create | vitest unit tests using fixture from Phase 0 ([FR-2](FR.md#fr-2)) |
| `extensions/specs-workflow/tools/spec-graph/__tests__/conformance.test.ts` | create | vitest unit tests for each finding code ([FR-13](FR.md#fr-13)) |

## Phase 2 — MCP server + hooks + Marksman bundle

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/tools/spec-mcp-server/index.ts` | create | MCP server entry point, @modelcontextprotocol/sdk stdio ([FR-4](FR.md#fr-4)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/get-trace.ts` | create | Primary tool — structured tree + explanation_for_agent ([FR-4](FR.md#fr-4), AC-4.1) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/get-node.ts` | create | Generic node lookup by id, type-aware payload ([FR-4](FR.md#fr-4)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/find-by-tags.ts` | create | Tag combinator (AND/OR) ([FR-4](FR.md#fr-4)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/find-by-type.ts` | create | Filter by node type ([FR-4](FR.md#fr-4)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/conformance-check.ts` | create | Run all enabled checks, return Finding[] with suggestions ([FR-4](FR.md#fr-4), [FR-13](FR.md#fr-13)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/blast-radius.ts` | create | Graph traversal for change impact ([FR-4](FR.md#fr-4), SCHEMA Entity 7) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/list-orphans.ts` | create | Orphan node detection ([FR-13](FR.md#fr-13)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/broken-refs.ts` | create | Wiki-link / inline-link validator ([FR-4](FR.md#fr-4)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/git-diff-impact.ts` | create | Git plumbing + graph traversal ([FR-4](FR.md#fr-4)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/search.ts` | create | FTS5/BM25 + semantic embeddings (Phase 2: text only, Phase 4: + semantic) ([FR-4](FR.md#fr-4)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/overview.ts` | create | Per-spec or global summary ([FR-4](FR.md#fr-4)) |
| `extensions/specs-workflow/tools/spec-mcp-server/lock-manager.ts` | create | .mcp-lock.json atomic create + pid+env check ([FR-14](FR.md#fr-14), NFR-Reliability-3) |
| `extensions/specs-workflow/tools/spec-mcp-server/file-watcher.ts` | create | chokidar wrapper with polling auto-detect (touch test) ([FR-14](FR.md#fr-14), NFR-Reliability-4) |
| `extensions/specs-workflow/tools/spec-mcp-server/lsp-bridge.ts` | create | Optional Marksman LSP subprocess proxy ([FR-7](FR.md#fr-7)) |
| `extensions/specs-workflow/tools/spec-conformance-guard/spec-conformance-guard.ts` | create | PreToolUse HARD hook (DUPLICATE_DEFINITION etc.) ([FR-5](FR.md#fr-5)) |
| `extensions/specs-workflow/tools/spec-conformance-push/spec-conformance-push.ts` | create | PostToolUse hook with 3s throttle + aggregation + push ([FR-6](FR.md#fr-6)) |
| `extensions/specs-workflow/tools/bash-post-test-ingest/bash-post-test-ingest.ts` | create | PostToolUse on Bash — detect test run, invoke MCP ingest-ndjson ([FR-1](FR.md#fr-1)) |
| `extensions/specs-workflow/tools/spec-mcp-server/meta-guard.ts` | create | Protects extension.json from tampering ([FR-5](FR.md#fr-5), NFR-Security-2) |
| `extensions/specs-workflow/scripts/install-marksman.ts` | create | postInstall script: detect platform, download Marksman binary from GitHub releases, copy to `.dev-pomogator/bin/` ([FR-7](FR.md#fr-7)) |
| `extensions/specs-workflow/extension.json` | edit | Register new MCP server + 3 hooks + meta-guard, bump version to 4.0.0 ([FR-4](FR.md#fr-4), [FR-5](FR.md#fr-5), [FR-6](FR.md#fr-6)) |
| `package.json` | edit | Add `@modelcontextprotocol/sdk`, `unified`, `remark-parse`, `remark-frontmatter`, `remark-wiki-link`, `unist-util-visit`, `chokidar` deps + `postinstall` hook calling install-marksman ([FR-2](FR.md#fr-2), [FR-7](FR.md#fr-7)) |
| `extensions/specs-workflow/tools/spec-mcp-server/__tests__/integration.test.ts` | create | End-to-end MCP server test using cucumber-js BDD ([FR-4](FR.md#fr-4)) |

## Phase 3 — LLM layer + multi-language support

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/tools/claude-cli-bridge/claude-cli-bridge.ts` | create | Spawn `claude -p` subprocess, parse JSON output ([FR-8](FR.md#fr-8)) |
| `extensions/specs-workflow/tools/claude-cli-bridge/semantic-drift-check.ts` | create | Compare FR text vs Scenario via Haiku subagent, cache by hash ([FR-8](FR.md#fr-8)) |
| `extensions/specs-workflow/tools/claude-cli-bridge/cache.ts` | create | hash(fr_text + scenario_text) → cached Finding ([FR-8](FR.md#fr-8)) |
| `extensions/specs-workflow/tools/spec-graph/multi-lang-binding-extractor.ts` | create | Per-language step binding extraction (C# Reqnroll, Python behave, Java cucumber-jvm) ([FR-9](FR.md#fr-9)) |
| `extensions/specs-workflow/tools/spec-mcp-server/tools/conformance-check.ts` | edit | Add `semantic: true` flag handling + invoke claude-cli-bridge ([FR-8](FR.md#fr-8)) |
| `tests/fixtures/multi-lang/` | create | Sample Reqnroll/behave/cucumber-jvm NDJSON outputs ([FR-9](FR.md#fr-9)) |

## Phase 4 — SQLite persistence + side-channel logs + Codespaces

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/tools/spec-mcp-server/sqlite-index.ts` | create | better-sqlite3 wrapper, WAL mode, FTS5 setup, schema migrations ([FR-10](FR.md#fr-10)) |
| `extensions/specs-workflow/tools/spec-mcp-server/sqlite-schema.sql` | create | DDL for nodes/edges/definitions/backlinks tables + FTS5 virtual table ([FR-10](FR.md#fr-10)) |
| `extensions/specs-workflow/tools/spec-mcp-server/sqlite-migrations/` | create | Versioned migration scripts ([FR-10](FR.md#fr-10)) |
| `extensions/specs-workflow/tools/spec-mcp-server/sqlite-recovery.ts` | create | PRAGMA integrity_check + corruption fallback ([FR-10](FR.md#fr-10), NFR-Reliability-5) |
| `extensions/specs-workflow/tools/spec-check-log/append-logger.ts` | create | Append-only JSONL logger with size-based rotation ([FR-15](FR.md#fr-15)) |
| `extensions/specs-workflow/tools/spec-check-log/cli.ts` | create | `dev-pomogator spec-check-log --since --grep` CLI ([FR-15](FR.md#fr-15)) |
| `extensions/specs-workflow/tools/spec-mcp-server/codespaces-detector.ts` | create | Detect Codespaces env (CODESPACES env var), tag lock file ([FR-16](FR.md#fr-16)) |
| `extensions/devcontainer/templates/devcontainer.json` | edit | Add `postStartCommand` for MCP server auto-start ([FR-16](FR.md#fr-16)) |
| `package.json` | edit | Add `better-sqlite3` to optionalDependencies ([FR-10](FR.md#fr-10)) |

## Phase 5 — Migration helper v3→v4

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/tools/migrate-v3-to-v4/migrate.ts` | create | Main migration script, scan + diff + interactive prompt ([FR-11](FR.md#fr-11)) |
| `extensions/specs-workflow/tools/migrate-v3-to-v4/heading-converter.ts` | create | `### Requirement: FR-N <title>` → `### FR-N: <title>` ([FR-11](FR.md#fr-11)) |
| `extensions/specs-workflow/tools/migrate-v3-to-v4/tag-predictor.ts` | create | Naming heuristic for untagged scenarios ([FR-11](FR.md#fr-11)) |
| `extensions/specs-workflow/tools/migrate-v3-to-v4/config-generator.ts` | create | Create `.spec-config.json` with defaults if absent ([FR-11](FR.md#fr-11)) |
| `extensions/specs-workflow/tools/migrate-v3-to-v4/interactive-prompt.ts` | create | Per-file approve/skip/edit with 30s timeout ([FR-11](FR.md#fr-11), AC-11.2) |
| `extensions/specs-workflow/tools/migrate-v3-to-v4/__tests__/migration.test.ts` | create | BDD tests using v3 fixtures ([FR-11](FR.md#fr-11)) |

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
| `extensions/specs-workflow/extension.json` | edit | Register new skill in `skills.{}` map ([FR-12](FR.md#fr-12)) |
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
| `extensions/specs-workflow/extension.json` | edit | Register `skills.cross-spec-reconcile` + `skills.cross-spec-resolve` + skillFiles entries ([FR-17](FR.md#fr-17), [FR-18](FR.md#fr-18)) |
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
| `extensions/specs-workflow/CHANGELOG.md` | edit | v4.0.0 release notes ([FR-1](FR.md#fr-1)..[FR-16](FR.md#fr-16)) |
| `extensions/specs-workflow/README.md` | edit | Update with v4 features ([FR-4](FR.md#fr-4)) |
| `dist/installer/extensions.js` | edit | Recompiled after extension.json change (automated by `npm run build`) ([FR-7](FR.md#fr-7)) |

## Total counts

| Phase | Files |
|-------|-------|
| Phase 0 | 11 (10 create + 1 edit) |
| Phase 1 | 11 (all create) |
| Phase 2 | 22 (20 create + 2 edit) |
| Phase 3 | 6 (5 create + 1 edit) |
| Phase 4 | 9 (8 create + 1 edit) |
| Phase 5 | 6 (all create) |
| Phase 6 | 17 (13 create + 4 edit) |
| Phase 7 | 31 (26 create + 5 edit) |
| Cross-phase docs | 5 (all edit) |
| **Total** | **118 files (~101 create + 17 edit)** |
