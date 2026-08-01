# Design

## Реализуемые требования

- [FR-1: Skill structure with progressive disclosure](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1)
- [FR-2: Reference file naming convention](FR.md#fr-2-reference-file-naming-convention-phasenmdescriptive-feature2)
- [FR-3: Phase 3+ Audit categories split](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3)
- [FR-4: Hard cutover migration via installer](FR.md#fr-4-hard-cutover-migration-via-installer-feature4)
- [FR-5: research-workflow extracted as standalone skill](FR.md#fr-5-research-workflow-extracted-as-standalone-skill-and-invoked-by-create-spec-feature5)
- [FR-6: Source rule files removed atomically](FR.md#fr-6-source-rule-files-removed-atomically-feature4)
- [FR-7: extension.json manifest updated atomically](FR.md#fr-7-extensionjson-manifest-updated-atomically-feature4)
- [FR-8: CLAUDE.md glossary synced](FR.md#fr-8-claudemd-glossary-synced-with-new-skill-layout-feature4)
- [FR-9: Skill description preserves trigger phrases](FR.md#fr-9-skill-description-preserves-all-trigger-phrases-feature5)
- [FR-10: allowed-tools covers full workflow](FR.md#fr-10-allowed-tools-covers-full-workflow-feature5)
- [FR-11: specs-validation hook unaffected](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4)
- [FR-13: Token efficiency floor](FR.md#fr-13-token-efficiency-floor-for-non-spec-sessions-feature1)

## Компоненты

- **`create-spec` skill (expanded)** — primary skill at `.claude/skills/create-spec/`. Holds `SKILL.md` (overview + navigation) + `references/` (per-phase + per-category content). Replaces existing 66-line scaffold-only skill.
- **`research-workflow` skill (new)** — standalone skill at `.claude/skills/research-workflow/`. Holds entire research workflow body (Уточнение / Исследование / Верификация / Отчёт) extracted from `research-workflow.md`. Has independent triggers (`исследуй / найди / погугли / ресерч`) AND is invoked by `create-spec` via `Skill("research-workflow")` during Phase 1 step 5 (RESEARCH.md filling).
- **`extensions/specs-workflow/extension.json`** — updated manifest. `ruleFiles.claude` becomes `[]`. `skills` and `skillFiles` extended to register new skills + their files.
- **`CLAUDE.md`** — glossary updated. 4 manifest-managed rule rows removed from "Triggered" table.
- **Source rule files** — 6 files deleted from `.claude/rules/specs-workflow/`.

## Где лежит реализация

- App-код: N/A (refactor — no new TypeScript code)
- Skill content (new): `.claude/skills/create-spec/SKILL.md` + `.claude/skills/create-spec/references/*.md` + `.claude/skills/research-workflow/SKILL.md`
- Manifest wiring: `extensions/specs-workflow/extension.json`
- Glossary: `CLAUDE.md` (project root)
- Tests: `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature` (extended) + corresponding test file (probably `tests/e2e/specs-workflow-installer.test.ts` or extend existing)
- Reference patterns: `tests/e2e/helpers.ts` (`runInstaller`, `appPath`, `setupCleanState`); `tests/e2e/installer-hook-smoke.test.ts` (dynamic manifest iteration template)

## Директории и файлы (final state)

```
.claude/
├── skills/
│   ├── create-spec/
│   │   ├── SKILL.md                                  # ≤200 lines: overview + navigation
│   │   └── references/
│   │       ├── phase1_discovery.md                   # Phase 1 algorithm
│   │       ├── phase1.5_project-context.md           # Phase 1.5 algorithm
│   │       ├── phase2_requirements-and-design.md     # Phase 2 (without BDD subsection)
│   │       ├── phase2_bdd-test-infrastructure.md     # Step 6.1-6.5 BDD infra assessment
│   │       ├── phase3_finalization.md                # Phase 3 algorithm
│   │       ├── phase3plus_audit-overview.md          # Audit workflow + category dispatch
│   │       ├── phase3plus_audit-errors.md            # Category 1
│   │       ├── phase3plus_audit-logic-gaps.md        # Category 2
│   │       ├── phase3plus_audit-inconsistency.md     # Category 3
│   │       ├── phase3plus_audit-rudiments.md         # Category 4
│   │       ├── phase3plus_audit-fantasies.md         # Category 5
│   │       ├── phase3plus_audit-undefined-behavior.md # Category 6 (taxonomy inlined here)
│   │       ├── phase3plus_audit-jira-drift.md        # Jira-only category
│   │       ├── feature-creation-rules.md             # .feature creation guidelines
│   │       ├── jira-mode.md                          # Jira-first workflow Step 0 + trace format
│   │       ├── validation-rules.md                   # Validation rules table reference
│   │       ├── bdd-enforcement.md                    # BDD-default policy
│   │       ├── no-mocks-fallbacks.md                 # No-mocks policy
│   │       └── specs-validation.md                   # @featureN sync rules
│   └── research-workflow/
│       └── SKILL.md                                  # Standalone (~180 lines)
├── rules/
│   └── specs-workflow/                               # FOLDER REMAINS but EMPTY (or removed if empty allowed)
│       (specs-management.md DELETED)
│       (no-mocks-fallbacks.md DELETED)
│       (research-workflow.md DELETED)
│       (specs-validation.md DELETED)
│       (bdd-enforcement.md DELETED)
│       (undefined-behavior-taxonomy.md DELETED)
extensions/specs-workflow/
└── extension.json                                    # ruleFiles.claude=[]; skills+skillFiles extended
CLAUDE.md                                              # 4 rule rows removed from Triggered table
```

19 references in `create-spec/`. Total content ~1100-1200 lines preserved (modulo restructuring).

## Алгоритм миграции

1. **Pre-flight audit** — verify `specs-validator` hook code (`extensions/specs-workflow/tools/specs-validator/*.ts`) does NOT read `.claude/rules/specs-workflow/specs-validation.md`. Grep for that path; expected: zero matches.
2. **Create skill scaffolding** — make `.claude/skills/create-spec/references/` dir; create empty placeholder files for the 19 references.
3. **Write SKILL.md** — overview + navigation table + trigger description ≤1024 chars + allowed-tools full list.
4. **Migrate phase content** — for each phase, copy relevant section from old `specs-management.md` into matching `phaseN_*.md` reference. Add TOC if file >100 lines. Consolidate duplicate Jira Step 0 (currently repeated across phases) into single `jira-mode.md`.
5. **Split Phase 3+ Audit categories** — `phase3plus_audit-overview.md` contains workflow steps + dispatch table; per-category files contain category-specific finding rules + remediation guidance. Inline `undefined-behavior-taxonomy.md` (170 lines) into `phase3plus_audit-undefined-behavior.md` to avoid 2-level nesting.
6. **Move 4 standalone rules** — copy `bdd-enforcement.md`, `no-mocks-fallbacks.md`, `specs-validation.md` content directly to `references/` (filenames preserved). `undefined-behavior-taxonomy.md` content merged into audit-undefined-behavior reference.
7. **Create `research-workflow` skill** — copy `research-workflow.md` content into `.claude/skills/research-workflow/SKILL.md` (with frontmatter). Preserve all trigger phrases.
8. **Update extension.json (atomic Write)** — set `ruleFiles.claude=[]`; add `skills["research-workflow"]`; populate `skillFiles["create-spec"]` with all 20 paths (SKILL.md + 19 references); populate `skillFiles["research-workflow"]` with `SKILL.md`. Bump `version`. Run `extension-json-meta-guard.ts` to verify.
9. **Delete 6 source rule files** — `git rm` against `.claude/rules/specs-workflow/specs-management.md`, `no-mocks-fallbacks.md`, `research-workflow.md`, `specs-validation.md`, `bdd-enforcement.md`, `undefined-behavior-taxonomy.md`.
10. **Update CLAUDE.md glossary** — remove 4 rows from "Triggered" rules table.
11. **Update `PLUGIN003_specs-workflow.feature`** — add scenarios for FR-4 (hard cutover) and FR-5 (research-workflow skill). Adjust line 11-15 scenario to reflect `references/` files installed, not just SKILL.md.
12. **Run validation** — `npx tsx .dev-pomogator/tools/specs-generator/validate-spec.ts` against this spec; `npm test` for installer integration.
13. **Atomic commit** — single commit containing all above changes.

## Key Decisions

### Decision 1: Single `create-spec` skill (vs split into multiple)

**Choice:** One skill (`create-spec`) absorbs the entire workflow (Q1A user decision).

**Rationale:** The 4-phase workflow is one cohesive process — agent moves linearly Phase 1 → 1.5 → 2 → 3 → 3+ for any spec. Splitting into per-phase skills would multiply skill metadata costs (5 phases × ~200 tokens metadata = 1000 tokens always-on, vs 250 for one skill) and confuse trigger selection. Anthropic guidance "one skill, one job" is satisfied — the job is "create/manage a feature spec".

**Trade-off:** SKILL.md must serve as router (~200 lines navigation). Mitigation: clear phase navigation table at top of SKILL.md.

**Alternatives considered:**
- (a) Per-phase skills (`spec-phase-1`, `spec-phase-2`, ...) — rejected: metadata cost + trigger fragmentation
- (b) Path-scoped rules — rejected: triggering by file path doesn't cover natural-language entry; user starts spec via prompt before any file edit
- (c) Compress monolithic rule below 200 lines — rejected: loses essential detail

### Decision 2: `phaseN[.M]_descriptive-name.md` naming

**Choice:** Phase prefix + kebab-case descriptor (Q4C user decision).

**Rationale:** `ls references/` reads naturally as workflow order. Filename alone identifies phase + topic. Future contributors writing new references follow obvious pattern.

**Trade-off:** Slightly longer filenames. Negligible for CLI/editor use.

**Alternatives considered:**
- (a) Just descriptive name (`discovery.md`) — rejected: ambiguous which phase
- (b) Just phase number (`phase1.md`) — rejected: no topic info, breaks if phase has multiple aspects (e.g., Phase 2 has BDD subsection)
- (c) Numbered prefix `01_discovery.md` — rejected: doesn't match user-explicit `фаза1_такая-то` request

### Decision 3: Audit categories as separate files (vs single audit reference)

**Choice:** 8 audit files (overview + 7 categories) (Q4C user decision).

**Rationale:** When agent works on category "Errors" in audit, it loads only relevant ~30-line file instead of full 112-line audit block. Token saving + cognitive isolation.

**Trade-off:** 7 small files (~25-50 lines each) vs one big file. Tiny per-file token overhead from headers/metadata.

**Alternatives considered:**
- (a) One audit file with category sections — rejected: agent loads all 6+ categories even when working one
- (b) Audit categories inlined in SKILL.md — rejected: blows SKILL.md past 200-line target

### Decision 4: research-workflow as separate skill, invoked by create-spec via Skill tool (vs inline in references/)

**Choice:** Standalone skill `.claude/skills/research-workflow/SKILL.md` AND invoked by `create-spec` via `Skill("research-workflow")` during Phase 1 step 5 (Q2C with edge-case handling + composition pattern).

**Rationale:** Two-layer design. (1) `research-workflow` has independent triggers ("исследуй / найди / погугли / ресерч") — needs to fire when user asks for research outside spec context. (2) When agent is mid-spec and reaches Phase 1 RESEARCH.md filling, the `create-spec` SKILL.md explicitly delegates to `research-workflow` via the `Skill` tool — preserves the workflow composition that existed in the original `specs-management.md` rule (where research-workflow was referenced as a related rule). Anthropic "one skill, one job" satisfied — each skill has its own job, but skills compose through `Skill` tool just like discovery-forms / requirements-chk-matrix / task-board-forms already do.

**Trade-off:** One more skill in metadata (~150 tokens). Negligible. Skill composition adds one extra tool call hop during Phase 1, but produces identical research behavior.

**Alternatives considered:**
- (a) Inline in `create-spec/references/research-workflow.md` only — rejected: triggers won't fire outside spec context
- (b) Path-scoped rule — rejected: research not bound to file path
- (c) Standalone skill only, no `create-spec` invocation — rejected: agent would have to manually choose to call research mid-spec; explicit delegation in SKILL.md ensures consistency

### Decision 5: Inline `undefined-behavior-taxonomy` into category file (vs separate)

**Choice:** Merge taxonomy content into `phase3plus_audit-undefined-behavior.md` (single file, ~200 lines including taxonomy).

**Rationale:** Anthropic best practice: avoid 2-level reference nesting. SKILL.md → audit-overview → audit-undefined-behavior is already 2 levels (acceptable since overview is a phase entry-point). Adding 3rd level (taxonomy as sibling reference) would push agent to do `head -100` previews and miss content.

**Trade-off:** `phase3plus_audit-undefined-behavior.md` will be largest reference (~200 lines). Mitigation: TOC at top per NFR-P2.

**Alternatives considered:**
- (a) Keep `undefined-behavior-taxonomy.md` as separate sibling reference — rejected: 2-level nesting from SKILL.md
- (b) Move taxonomy to top-level reference linked from SKILL.md directly — rejected: SKILL.md becomes too cluttered with audit details

### Decision 6: Hard cutover (vs soft transition with deprecation)

**Choice:** Hard cutover in single release (Q3A user decision).

**Rationale:** dev-pomogator distributes via installer with managed-file tracking; updater already handles file additions/removals atomically per `updater-managed-cleanup`. Soft transition (rule + skill coexist for one release) doubles maintenance burden and creates ambiguity for AI agent (which to follow?).

**Trade-off:** Users with stale dev-pomogator versions miss workflow until they update. Acceptable: update cadence is short, and the skill is a strict superset of rule functionality.

**Alternatives considered:**
- (a) Soft transition (rule deprecated for 1 release) — rejected per user; avoid duplication
- (b) Rule-stub redirect — rejected per "фолебков не делать"

### Decision 7: Cursor support — OUT OF SCOPE

**Choice:** Migration is Claude Code only. No `.cursor/` paths or `.mdc` artifacts created (FR-12).

**Rationale:** Cursor support was previously removed from dev-pomogator. Stale Cursor scenarios in `PLUGIN003_specs-workflow.feature:22-25` are pre-existing tech debt, separate cleanup.

**Trade-off:** None — Cursor branch already not maintained.

## API

N/A — this refactor introduces no API surface, no script changes, no new tools. Pure documentation/manifest restructure.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD `[VERIFIED: bdd-enforcement.md default + analysis of tests/e2e/installer-hook-smoke.test.ts:26 import { describe, it, beforeAll, expect } from 'vitest']`
**Framework:** vitest with custom `.feature` loader (existing dev-pomogator pattern; `tests/e2e/*.test.ts` files mirror `tests/features/**/*.feature` scenario IDs)
**Install Command:** N/A — vitest already installed via `package.json`
**Evidence:** `tests/e2e/installer-hook-smoke.test.ts:26 import {... from 'vitest'`; `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature` exists with Given/When/Then scenarios; existing pattern matches helpers from `tests/e2e/helpers.ts`
**Verdict:** TEST_DATA_ACTIVE — installer integration tests create files in target project (skill artifacts, deleted rule files) and need teardown. Use existing `setupCleanState` helper for cleanup. No new BDD framework install needed.

### Existing hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` (function `setupCleanState`) | beforeEach equivalent | per-scenario | Resets target project state to known baseline | Да — directly reusable |
| `tests/e2e/helpers.ts` (function `runInstaller`) | when-step driver | per-scenario | Executes installer with given mode (install/update) | Да — directly reusable |
| `tests/e2e/helpers.ts` (functions `appPath`, `homePath`) | path resolvers | per-scenario | Returns sandboxed paths for assertions | Да |

Не найдено: dedicated `BeforeAll`/`AfterAll` cucumber-style hooks (vitest pattern uses `beforeEach` + `afterEach` inline).

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| (none — pattern uses inline beforeEach in test file) | — | — | — | — |

> Каждый существующий helper уже покрывает нужды этого refactor — новые hooks не требуются. Test file для миграции (extension or new file) использует `setupCleanState` + `runInstaller` directly.

### Cleanup Strategy

1. `beforeEach`: call `setupCleanState()` — wipes target project sandbox, recreates baseline. Existing helper.
2. Test body: pre-populate target with old layout (`writeFile` to `.claude/rules/specs-workflow/specs-management.md` etc) → call `runInstaller(updateMode=true)` → assert post-state.
3. `afterEach`: implicit cleanup via next `setupCleanState()` on next test.
4. No cascading dependencies — each test self-contained.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Pre-migration layout | inline in test (no fixture file) | Old `.claude/rules/specs-workflow/*.md` files seeded before update | per-scenario |
| Reference snapshot | `tests/fixtures/specs-management-as-skill/` (created if needed) | Expected `references/*.md` filenames + sizes for assertion | shared (read-only) |
| Empty manifest test data | inline | Verify `ruleFiles.claude=[]` after update | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `appPath()` (existing helper) | string | helpers.ts | every test | Sandboxed project root for installer target |
| `homePath()` (existing helper) | string | helpers.ts | every test | Sandboxed home dir for `~/.dev-pomogator/` mocking |

> No new shared keys. All state managed via existing helpers + per-test local vars.

## Risks (для TEST_FORMAT validator)

N/A — TEST_FORMAT is BDD (default), no escape hatch. This section intentionally empty per workflow.
