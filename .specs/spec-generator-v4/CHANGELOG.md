# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added (post-rc1, en route to v4.0.0 final)

- 11 more cross-spec finding codes in `reconcile.ts` across three batches:
  - Batch 1 (5): `spec-only/orphan-FR`, `spec-only/uncovered-AC`,
    `cross-spec/duplicate-fr-id`, `cross-spec/contradictory-fr`,
    `impl-drift/test-without-fr`.
  - Batch 2 (3): `spec-only/orphan-task`, `spec-only/missing-fr-section`,
    `schema-drift/missing-feature-heading`.
  - Batch 3 (3): `impl-drift/dead-link`, `spec-only/missing-acceptance`,
    `schema-drift/invalid-frontmatter`.
  - Batch 4 (5): `impl-drift/missing-symbol`,
    `cross-spec/url-shape-drift`, `cross-spec/cli-flag-drift`,
    `cross-spec/enum-divergence`, `cross-spec/module-ownership-conflict`.
  19 of the 28-code matrix now ship; 9 remain as small follow-ups.

### Fixed (batch-8 — 2nd adversarial-review pass closes 8 HIGH + 2 MEDIUM bugs)

Second workflow `w3au0fmaq` (5 skeptics + 1 integration auditor + 1
synthesizer) attacked all 28 codes. 36 raw findings → 14 retained → 8
HIGH. All 8 closed plus 2 MEDIUM with one-line fixes.

- **`impl-drift/missing-test` HIGH FN** — `@feature05` produced `FR-05`
  which never matched `FR-5`. `collectFeatureTags` now strips leading
  zeros via `parseInt(..., 10)`.
- **`cross-spec/cli-flag-drift` HIGH FP** — flags inside fenced
  ```bash``` blocks fired as real CLI declarations. Added
  `stripFencedBlocks(f.body)` before the regex scan.
- **`cross-spec/enum-divergence` HIGH FP** — enum values inside fenced
  blocks fired as real schema. Same `stripFencedBlocks` fix.
- **`spec-only/missing-fr-section` HIGH FP** — FR refs inside fenced
  blocks counted as citations. Same `stripFencedBlocks` fix.
- **`cross-spec/decision-locked-but-reality-diverges` HIGH FN** —
  `Chosen: jsonwebtoken library for signing tokens` matched the whole
  trailing prose, so the import comparison always failed. Tightened
  regex to `(@?[\\w./-]+)` so only the package id survives.
- **`impl-drift/dead-link` HIGH FP** — `path.isAbsolute('/GUIDE.md')`
  is true on POSIX, resolving from filesystem root. Now treats
  leading-`/` as repo-root relative on every OS.
- **`spec-only/orphan-FR` HIGH FN** — `## FR-1: See FR-1 for context`
  counted the heading-line ref as external, so a self-citation in the
  heading suppressed the orphan finding. Now counts FR-N occurrences
  **only on non-heading lines** (`^#{1,6}\\s` lines skipped).
- **`cross-spec/contradictory-nfr` MEDIUM FN** — `latency: 200ms` vs
  `latency: 2s` bucketed separately and never triggered. Now
  normalises seconds → milliseconds before composing the bucket key.
- **`schema-drift/json-shape-drift` MEDIUM FP** — heading match was
  too narrow (`Schema|Keys`). Widened to include `Shape|Fields|Structure`.
- **within-spec duplicate FR id rename** — was emitting under
  `cross-spec/duplicate-fr-id` even though both definitions live in
  the same spec. Renamed to `spec-only/duplicate-fr-id` so reports
  can distinguish orthogonal issues at a glance. The cross-spec code
  remains for genuinely-cross-spec collisions.

Integration auditor finding (decision-locked attribution): turned out
to be a false alarm — `findLockedDecisionDrift` is called from the
per-slug loop and pushed directly into `findings[]`, so it never
touches the cross-spec attribution loop. No `spec_a`/`spec_b` needed.

10 regression tests pinned in reconcile.test.ts (one per fix). Live
smoke `.dev-pomogator-tmp/smoke-b8.mjs` verifies all 10 on real tmpdir
fixtures.

Honest take from the synthesizer (verbatim): "Solid 7/10 — fixable in
an afternoon, not a rewrite. About a third of skeptic claims dissolved
on close reading (code already does the right thing). However, a
clear systemic gap remains: `stripFencedBlocks` is applied in some
collectors (identifiers) but forgotten in CLI flags, enums, FR refs,
JSON schema — every fenced-block-blindness FP traces back to that
inconsistency. Single grep-and-wrap pass would close 4 findings." —
fixed in this batch.

### Added (batch-7 — final 9 finding codes, 28-code matrix COMPLETE)

Designed via parallel workflow `wzbmwybag` (3 research agents + 1
synthesizer, 9 design specs returned). All 9 mechanical-only:

- **`impl-drift/missing-test`** — INFO. Stricter sibling of
  `orphan-FR`: every defined FR-N MUST have a matching `@featureN`
  tag in the spec's .feature corpus. Reuses `collectFrDefinitions`
  + `collectFeatureTags`.
- **`spec-only/orphan-AC`** — INFO. AC heading references FR-N via
  `(FR-N)` or `**Requirement:** [FR-N]` body, but the FR is not
  defined in this spec. New `AC_TO_FR_RE`.
- **`impl-drift/test-result-stale`** — WARNING. `.feature` mtime
  predates the latest FR.md/ACCEPTANCE_CRITERIA.md/REQUIREMENTS.md/
  DESIGN.md mtime (1-minute skew tolerance). Hint warns about CI
  git-clone mtime gotcha.
- **`spec-only/unreachable-task`** — INFO. Task row in TASKS.md
  Summary Table targets a Phase higher than `.progress.json::phase_index`.
  Header-driven column lookup (no hardcoded indices). DONE tasks
  skipped.
- **`schema-drift/json-shape-drift`** — WARNING. JSON fixture file
  in spec dir has top-level keys diverging from `SCHEMA.md`
  bullet-list declarations. Skips `.progress.json` (too volatile).
- **`cross-spec/missing-cross-ref`** — INFO. Spec mentions another
  slug by bare name but has no markdown link `](.../specs/<other>/...)`
  anywhere in its files. Dynamic regex per slug pair.
- **`cross-spec/contradictory-nfr`** — CRITICAL. Same NFR budget
  (latency / throughput / availability / uptime / error-rate / cpu /
  memory / storage / response-time) with values that differ by >10%.
  `response-time` normalised to `latency`.
- **`cross-spec/schema-mismatch`** — CRITICAL. Same TS
  `interface`/`type` name with divergent field sets across specs
  (DESIGN.md / SCHEMA.md fenced ```ts blocks). Symmetric diff in
  hint.
- **`cross-spec/decision-locked-but-reality-diverges`** — CRITICAL.
  DECISIONS.md block with `Status: LOCKED` + `Chosen: <pkg>` +
  `Implemented in: \`<path>\`` — the referenced impl file's import
  statements don't include the chosen package. Strips version
  suffix (`jsonwebtoken@9` → `jsonwebtoken`).

**28 of 28 mechanical finding codes shipped.** Future work is full-mode
semantic checks (already partial in `full-mode.ts`) and the unbounded
semantic catalogue (the 28 codes are the structural matrix; semantic
drift is its sibling system).

10 regression tests pinned. Live smoke via
`.dev-pomogator-tmp/smoke-b7.mjs` verifies all 9 on real tmpdirs.

### Fixed (post-rc1 batch-6 — adversarial-review pass)

An automated 4-skeptic / 1-synthesizer workflow attacked the 19
finding codes with hand-crafted false-positive + false-negative
fixtures. 28 raw suspect-findings → 14 retained → 8 HIGH-severity
bugs surfaced, all 8 closed in this batch:

- `impl-drift/missing-symbol` — `export default <ident>` now
  recognised (new `TS_DEFAULT_EXPORT_RE` + `default` alias); `export
  * from '...'` short-circuits the symbol-presence check so star
  re-exports never produce false positives.
- `impl-drift/missing-file` — when a glob path's prefix directory
  doesn't exist (e.g. `tools/removed_dir/foo*.ts`), the hint now
  appends `(Glob prefix dir does not exist — was the parent
  directory removed or renamed?)`. New `pathExistsResolvingDetail`
  return shape.
- `cross-spec/runtime-identifier-drift` — assignments inside
  ```` ```ts ``` ```` fenced blocks are now stripped before regex
  scan (HIGH FP closed); `snake_case` and `camelCase` identifier
  keys collapse to the same lemma via `normalizeIdentifierKey`, so
  `session_token = "v1"` in spec A and `sessionToken = "v2"` in
  spec B register as drift (HIGH FN closed). `IDENTIFIER_LINE_RE`
  broadened to catch the camelCase suffixes (`Key/Id/Token/Path`).
- `cross-spec/url-shape-drift` — generic terminal segments
  (`/list`, `/get`, `/add`, ...) are excluded from suffix matching,
  so `/api/users/list` vs `/admin/groups/list` no longer collide;
  domain-noun terminals (`/orders`, `/customers`) still fire.
- `cross-spec/duplicate-fr-id` — new `findWithinSpecDuplicateFRs`
  flags two `## FR-N` headings WITHIN the same spec (HIGH FN: the
  previous `collectFrDefinitions` silently kept only the first).
- `cross-spec/module-ownership-conflict` — embedded glob characters
  now stripped globally (`.replace(/\*/g, '')`), so two specs
  claiming `tools/foo*.ts` collide on the normalised
  `tools/foo.ts`.
- `cross-spec/contradictory-fr` — Jaccard-overlap suppression
  threshold raised 0.4 → 0.55. Generic domain vocabulary alone
  no longer hides genuine contradictions.

10 regression tests pin each fix (11th smoke run on batch.mjs).
- `.claude/skills/cross-spec-reconcile/scripts/full-mode.ts` — full-mode
  wrapper that pipes same-FR pairs through `tools/spec-llm-judge` for
  `cross-spec/semantic-drift` findings beyond the mechanical heuristics.
  Honours FR-26 deny-list (subprocess never spawns), caches verdicts
  via the existing `cache.ts` (no double-call), bounded by `maxCalls`
  (default 50), suppresses pairs already flagged by mechanical
  `cross-spec/contradictory-fr` (no double-count).
- `.claude/skills/cross-spec-resolve/SKILL.md` — executable workflow
  body. The 7-step loop now ships as an agent-runnable TypeScript
  sketch (planResolution → AskUserQuestion → Path A/B/C dispatch →
  foreign-spec banner → updateStatus) so the live skill body doesn't
  have to re-infer the AskUserQuestion shape, header lengths, or
  override-log call signature on every invocation.
- `.claude/skills/cross-spec-resolve/scripts/update-status.ts` —
  step-7 closer for the interactive walker. Atomic temp + rename
  YAML mutation that stamps `resolution_status` + `resolved_at`
  (+ `override_reason` for CRITICAL acknowledgments) onto each
  matching `findings:` block. Reports matched / unmatched counters so
  the caller can warn on stale-batch drift.
- `.devcontainer/scripts/post-start.sh` — FR-16 idempotent Codespaces
  MCP autostart. Only fires when `$CODESPACES=true`, respects stale
  lock files (dead PID → clean restart), logs to
  `.dev-pomogator/.spec-mcp-server.log`.

## [4.0.0-rc1] — 2026-05-30

Phases 0..7 shipped on `feat/phase-2a-mcp-server-and-hooks`, single PR
(#32). 248 vitest unit tests + e2e + ≥15 BDD scenarios across
`SPECGEN004_03..43` go GREEN. v3 regression (28 scenarios) stays GREEN
— the soft tier survived FR-25 additive merge into
`.claude-plugin/hooks.json`.

### Added — tools

- `tools/spec-graph/` — in-memory SpecGraph: types + MD parser
  (dual + triple-anchor legacy) + Gherkin parser + NDJSON ingester +
  builder + conformance checker + chokidar incremental rebuild.
  Cold-start p95 ≤2s on 30 specs; incremental ≤100ms p95.
- `tools/spec-mcp-server/` — stdio MCP server + 11 tools (`get_trace`
  primary) + lock-manager + lifecycle. SQLite WAL backend behind opt-in
  config (FR-10) with PRAGMA integrity_check + quarantine recovery.
- `tools/spec-conformance-guard/` — PreToolUse hard hook (FR-5/19/22).
- `tools/spec-conformance-push/` — PostToolUse soft hook with 3s
  fixed-window throttle (FR-6/28) + write-through to
  `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl`.
- `tools/spec-check-log/` — append-only JSONL writer + reader CLI
  (`dev-pomogator-spec-check-log` bin entry) + 10MB rotation (FR-15).
- `tools/spec-llm-judge/` — `claude -p` subprocess bridge with FR-26
  deny-list + sha256-keyed cache.
- `tools/marksman-installer/` — Marksman LSP postinstall + sha256
  verify per FR-7 / FR-27.
- `tools/migrate-v3-to-v4/` — `dev-pomogator-migrate-v3-to-v4` bin
  entry: `--suggest-only` + apply mode + atomic write +
  `.progress.json` 3 → 4 bump + interactive per-file prompt with 30s
  default-skip timeout (FR-11 / SPECGEN004_25).
- `tools/_shared/manifest-merge.ts` — additive merge helper preserving
  the 5 v3 form-guard hook entries (FR-25 invariant).

### Added — `.claude/skills/`

- `architecture-research-workflow/` — 7-stage greenfield architecture
  research skill (FR-12). Stage 7 merges into `RESEARCH.md` + writes a
  `.done` sentinel. 3-rewind hard limit prevents infinite Q&A loops
  (SPECGEN004_27).
- `cross-spec-reconcile/` — light + (planned) full mode consistency
  analyzer (FR-17). Ships 3 of 28 finding codes (impl-drift/missing-
  file, cross-spec/runtime-identifier-drift, cross-spec/concept-
  overlap) + YAML report + SARIF 2.1.0 secondary output + JSONL audit
  log for CRITICAL overrides.
- `cross-spec-resolve/` — interactive 7-step explain → confirm →
  Path A/B/C → foreign-spec confirm walker (FR-18). Planner +
  explanation builder + dedup + severity ordering ship; the live
  AskUserQuestion loop is the skill body.
- `create-spec/scripts/complexity-heuristic.ts` — Phase 1.5 router
  picking between `architecture-research-workflow` and
  `research-workflow` (SPECGEN004_28).

### Tests

- 248 vitest unit tests across `tools/` + `.claude/skills/`.
- `tests/e2e/hooks-stdin-e2e.test.ts` — every hook + MCP server driven
  via real subprocess stdin pipe (5 tests).
- `tests/e2e/package-bin-smoke.test.ts` — `npm pack` tarball unpacked
  + bin script invoked end-to-end.
- BDD coverage (`tests/step_definitions/`) — `SPECGEN004_01..28` +
  `_34..43` exercised. Remaining pending scenarios documented per-step.
- v3 regression (28 scenarios) — GREEN.

### Distribution

- `package.json::bin` ships two CLI entries: `dev-pomogator-spec-check-
  log` + `dev-pomogator-migrate-v3-to-v4`.
- `.mcp.json` registers `dev-pomogator-specs` MCP server.
- `.claude-plugin/hooks.json` carries 5 v3 form-guards + 2 v4 hooks
  (additive merge — no v3 regression).

### Closed FR (20 of 28)

3 (dual + triple anchor), 4 (MCP server), 5 (PreToolUse hard), 6
(PostToolUse soft), 7 (Marksman bundle), 8 (LLM-as-judge), 9 (multi-
lang NDJSON), 10 (SQLite), 11 (migrate-v3-to-v4), 12 (architecture-
research-workflow), 15 (spec-check-log), 17 (cross-spec-reconcile
light), 18 (cross-spec-resolve planner), 19 (two-tier failure mode),
22 (version gate), 24 (suggest-only mode), 25 (interactive 30s
timeout), 26 (FR-26 deny-list), 27 (Marksman sha256), 28 (fixed-
window throttle).

### Deferred to v4.0.0 final (small follow-ups, same branch)

- Remaining 25 finding codes from the 28-code matrix (3 ship in rc1)
- Live cross-spec-resolve interactive AskUserQuestion prompts
  (planner ships in rc1)
- Codespaces lifecycle FR-16 postStart wiring
- Full-mode cross-spec-reconcile (LLM-judge wrapper)
- README + user-facing docs refresh

## [0.1.0-v3] — Production form-guards (consolidated from spec-generator-v3 on 2026-05-28)

> Predecessor release. This entry consolidates the v3 release history from `.specs/spec-generator-v3/CHANGELOG.md` (now deleted) so that v4 carries the institutional record forward. The code described below shipped in PR #14 (specs-workflow v1.17.0) and remains in production as the **soft tier** of v4's hook system (see FR-19, FR-22, FR-24, FR-25 + DESIGN paragraph (o)).

### Added

- **Phase 0 (BDD Foundation):** `.feature` with 28 scenarios `SPECGEN003_01..28` + vitest e2e test translator. The scenarios are preserved in v4 as `.specs/spec-generator-v4/legacy-v3.feature` and continue to be tested by `tests/e2e/spec-generator-v3.test.ts`.
- **Phase 1 (shared):** `spec-form-parsers.ts` (5 parsers), `audit-logger.ts` (30d retention + 10MB rotation), `phase-constants.ts` v3 helpers (`getProgressVersion`, `isV3Spec`, `PROGRESS_SCHEMA_VERSION`), `scaffold-spec.ts` stamps `version: 3`.
- **Phase 2 (form-guards):** 6 PreToolUse hooks — `user-story-form-guard`, `task-form-guard`, `design-decision-guard`, `requirements-chk-guard`, `risk-assessment-guard`, `extension-json-meta-guard`. These are the SOFT TIER preserved verbatim by v4 (FR-19).
- **Phase 3 (child skills):** `discovery-forms`, `requirements-chk-matrix`, `task-board-forms` with anti-pushy descriptions (per DESIGN paragraph (o)).
- **Phase 4 (templates + runtime):** 5 templates updated, `spec-status.ts -Format task-table` (locked as backward-compat contract in v4 FR-21), `validate-specs.ts` UserPromptSubmit summary (v4 FR-20 replaces with threshold-only B3 + on-demand B4).
- **Phase 5 (manifest + docs):** `extension.json` v1.17.0 with array-of-groups hooks, `CHANGELOG` 1.17.0 entry, `specs-management.md` Skill wiring (v4 distributes this across `create-spec` SKILL.md per README «v3 → v4 doc reorganization»).
- **Phase 6 (dogfood):** `.specs/spec-generator-v3/` itself, authored in v3 format (now consolidated into this v4 spec and removed).

### Security

- **No env-var bypass.** `SPEC_FORM_GUARDS_DISABLE` does not exist; agents cannot disable form-guards. v4 NFR-Security-1 preserves this for the hard tier too.
- **Meta-guard protects manifest.** Removing a form-guard from `extension.json` / `.claude/settings.local.json` → DENY with a human-review message. v4 FR-24 extends the protection to `plugin.json` MCP-tool registrations.
- **Audit log surfaces bypass attempts.** Every DENY / PARSER_CRASH event is recorded in `~/.dev-pomogator/logs/form-guards.log`; the UserPromptSubmit summary shows counts to the maintainer. v4 FR-23 keeps this log file alive alongside the new `.dev-pomogator/.spec-check-log/<DATE>.jsonl`.
- **Fail-open on parser exception.** A regex bug does not block a legitimate Write — PARSER_CRASH is logged and the hook exits 0. v4 FR-19 preserves this verbatim for the soft tier.

## v0.2.0 — 2026-05-20 — Cross-spec reconciliation (spec-only update)

**This release is a spec-only update.** Implementation deferred to Phase 7 of `TASKS.md`.

### Added

- **FR-17** (Phase 7 — `cross-spec-reconcile` skill) — scans all `.specs/*/` + implementation tree, writes findings to `.specs/{slug}/consistency-report.yaml`. Supports `light` and `full` modes; CRITICAL findings (hard-conflict subset in light mode, full set in full mode) block STOP via AskUserQuestion `header: "⚠️ CRIT"` with «Fix now / Acknowledge & override / Abort STOP» options. WARNING/INFO findings push to agent context. Secondary SARIF 2.1.0 output via `--sarif`. `--dry-run` flag skips writes.
- **FR-18** (Phase 7 — `cross-spec-resolve` skill) — explicit `/cross-spec-resolve` user invocation. Reads YAML, groups findings, emits 5-field explanation block before each Edit/Write (code+severity, files+lines, plain-language change, WHY rationale, options). Mechanical fixes apply via Edit/Write after confirm. Architectural decisions present Path A/B/C alternatives. Foreign-spec edits fire extra «⚠️ This edits foreign spec» banner + additional confirm. Batch re-invokes reconcile and updates `resolution_status` per finding.
- **AC-17.1..AC-17.8** + **AC-18.1..AC-18.5** EARS scenarios in `ACCEPTANCE_CRITERIA.md`.
- **US-17..US-20** v3-form blocks in `USER_STORIES.md` per discovery-forms convention.
- **UC-17..UC-21** use cases in `USE_CASES.md` covering lightweight invocation, heavyweight audit, resolve loop, architectural fork, foreign-spec correction.
- **DESIGN.md** new section «Cross-spec reconciliation architecture» with 11 sub-points covering skill flow diagram, subagent isolation (R-4), ARCHITECTURAL_DECISION_VS_REALITY detection algorithm, CAPS prompt rendering caveat, lightweight CRITICAL hard-conflict subset, partial reconciliation, Spectral namespace convention, OpenFastTrace 4-class summary grouping, SARIF mapping, concurrency semantics (resolve vs reconcile), prior-art adoption rationale.
- **NFR-Performance-5**, **NFR-Security-6**, **NFR-Reliability-7**, **NFR-Usability-7** in `NFR.md`.
- **Phase 7 «Cross-spec reconciliation»** in `TASKS.md` with 14 implementation tasks: `install-cross-spec-skills`, `impl-mechanical-checks`, `impl-semantic-subagent`, `impl-yaml-writer`, `impl-critical-prompt`, `impl-resolve-loop`, `impl-sarif-output`, `impl-dry-run-mode`, `impl-coverage-summary`, `impl-architectural-detection`, `wire-create-spec-skill`, `register-skills-in-manifest`, `integration-test-fixture`, `e2e-test-reconcile-roundtrip`.
- **Consistency Report YAML schema** + **Cross-Spec Finding Codes** table (28 codes: 15 `cross-spec/*` + 13 `impl-drift/*`) + **SARIF mapping** in `spec-generator-v4_SCHEMA.md`.
- **`@feature17`** + **`@feature18`** Gherkin scenarios (SPECGEN004_38..48) in `spec-generator-v4.feature`.
- **`cross-spec-corpus/` fixture entry** in `FIXTURES.md` describing 3 fixture specs (spec-a, spec-b, spec-c) with intentional conflicts + expected finding codes.
- **CHK-FR17-01..08** + **CHK-FR18-01..05** rows (13 new) in `REQUIREMENTS.md` traceability matrix. Total CHK count: 41 → 54.
- **README.md** bumped: 16 FRs → 18 FRs, 7 phases → 8 phases. New «cross-spec reconciliation» bullet in «Ключевые идеи». Path references to `.claude/skills/cross-spec-reconcile/` + `.claude/skills/cross-spec-resolve/` in «Где лежит реализация».
- **RESEARCH.md** new section «Related sprint work / cross-impact analysis pattern» (post-render-eval ↔ closed-loop-hardening case study) + «Prior art» subsection (spec-kit, mex, OpenFastTrace, Spectral, oasdiff with gap analysis + adopted/avoided patterns).

### Resolved

- **REVIEW_NOTES P2-3** (AC count 38/39 off-by-one) — automatically closed by recompute including new AC-17.1..8 + AC-18.1..5. New AC total: 51.
- **REVIEW_NOTES P2-4** (FILE_CHANGES count discrepancy) — automatically closed by recompute.

### Spec status

- **2026-05-18 — Spec APPROVED, ready for implementation.** All 4 workflow phases confirmed (Discovery + Context + Requirements + Finalization + Audit). Final spec-review: 0 P0/P1 blockers. Implementation not yet started; awaiting kickoff of Phase 0 (`install-bdd-framework` task, Est: 20m).

### Added

- **Spec authored 2026-05-16 → 2026-05-18** (this v4 spec itself):
  - 28 FRs + 30 NFRs + 65 ACs + 41 CHKs + 54 BDD scenarios (Round 3 patch: +10 FR / +5 NFR / +15 AC / +6 scenarios)
  - 7 phases planned (Phase 0 cucumber-js migration → Phase 6 architecture-research-workflow skill)
  - RESEARCH.md 1300+ lines / 17 appendices documenting: external pain validation (OpenSpec issue #901), variant analysis (4 architectures), decision history (in-memory vs SQLite, MCP vs LSP layering, throttling), devcontainer constraints, anchor convention evolution
  - Spec workflow took 30+ turns → motivated Phase 6 meta-deliverable (architecture-research-workflow skill)

### Planned Phase 0 — Cucumber-JS BDD migration

- Migrate dev-pomogator from vitest pseudo-BDD (`.feature` as documentation only, tests in vitest) to `@cucumber/cucumber` real BDD runner with canonical NDJSON output
- Target TS projects installing v4 must also adopt cucumber-js (additive to existing vitest unit tests)

### Planned Phase 1 — Graph builder + parsers

- `extensions/specs-workflow/tools/spec-graph/` new module with `unified+remark` MD parser (dual-anchor), `@cucumber/gherkin` Gherkin parser, `@cucumber/messages` NDJSON ingester
- In-memory SpecGraph with typed nodes/edges
- Conformance checker (all structural rules: UNCOVERED_FR / ORPHAN_TASK / BROKEN_REF / SCENARIO_TAG_ORPHAN / etc.)
- Backward compat: legacy v3 `### Requirement: FR-N` headings work via triple-anchor

### Planned Phase 2 — MCP server + hooks + Marksman

- New extension `dev-pomogator-specs` MCP server (`@modelcontextprotocol/sdk`) with 11 tools
- Primary tool `get_trace(node_id)` returns structured tree + natural-language explanation in one call
- PreToolUse HARD hook `spec-conformance-guard` for syntax invariants
- PostToolUse hook `spec-conformance-push` with 3s throttle + aggregation + dedup
- Bash post-test hook for NDJSON ingest after test runs
- Marksman LSP binary bundled (silent install, +15MB) for IDE wiki-link navigation
- chokidar file watcher with auto-polling fallback (devcontainer bind-mount safe)
- .mcp-lock.json with env+pid tracking for multi-session protection

### Planned Phase 3 — LLM layer + multi-language

- Opt-in semantic drift check via `claude` CLI subprocess (Haiku)
- Multi-language step binding extractor (Reqnroll C#, behave Python, Cucumber-JVM Java)

### Planned Phase 4 — SQLite + side-channel logs + Codespaces

- Optional SQLite FTS5 persistence (cross-session sharing)
- Side-channel JSONL log `.dev-pomogator/.spec-check-log/<date>.jsonl` for audit + analytics
- GitHub Codespaces lifecycle integration (postStartCommand)

### Planned Phase 5 — Migration helper v3→v4

- `dev-pomogator migrate-v3-to-v4 [--suggest-only]` interactive script
- Converts legacy headings, predicts tags for untagged scenarios, generates `.spec-config.json`

### Planned Phase 6 — architecture-research-workflow skill (meta-deliverable)

- New skill `architecture-research-workflow` (7 stages)
- Enriches existing `research-workflow` with shared base patterns
- `create-spec` heuristic auto-invokes new skill for complex features
- Goal: 5-8 turns for future major architecture features (vs 30+ for v4)

### Security

- **No env-var bypass** for HARD hooks. Pattern from v3 (`SPEC_FORM_GUARDS_DISABLE` doesn't exist)
- **Meta-guard** protects `extension.json` and `.claude/settings.local.json` from tampering
- **No hardcoded user identifiers** — all derived at runtime (`git remote`, `gh api user`, `git rev-parse`)
- **Env-first config resolution** for all config-derivable values
- **SQLite file mode 0600** when persistence enabled (Phase 4)

## [4.0.0] - TBD (after Phase 0-6 implementation complete)

### Added

- Initial v4 implementation across 7 phases
