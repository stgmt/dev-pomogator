# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл и step definition stubs ПЕРЕД реализацией бизнес-логики.
> Все сценарии должны FAIL (Red) на этом этапе.

- [ ] Create suggest-rules-insights.feature with BDD scenarios @feature1 @feature2 @feature3 @feature4 @feature5
  _files: `.specs/suggest-rules-insights/suggest-rules-insights.feature` (replace)_
  _Requirements: [FR-1](FR.md#fr-1-чтение-отчёта-insights-feature1), [FR-2](FR.md#fr-2-проверка-свежести-отчёта-feature2), [FR-3](FR.md#fr-3-извлечение-friction-categories-feature3), [FR-8](FR.md#fr-8-unified-mode-display-feature8), [FR-9](FR.md#fr-9-маркер-источника-в-phase-3-feature9)_
  Scenarios:
  - PLUGIN008_01: Fresh report -- Phase -0.5 reads report.html and extracts sections @feature1
  - PLUGIN008_02: Stale report -- freshness check marks candidates with stale warning @feature2
  - PLUGIN008_03: Missing report -- graceful degradation when file not found @feature2
  - PLUGIN008_04: Unified mode display -- all mode combinations shown correctly @feature4
  - PLUGIN008_05: Source markers -- insights source markers in Phase 3 tables @feature5

- [ ] Create step definition stubs for insights-specific steps
  _files: `tests/features/plugins/suggest-rules/suggest-rules-insights.steps.md` (create)_
  _Requirements: cross-cutting_
  Step stubs to define:
  - `Given the insights report exists at ~/.claude/usage-data/report.html`
  - `Given the insights report has end_date within 3 days`
  - `Given the insights report has end_date older than 3 days`
  - `Given the insights report does not exist`
  - `When suggest-rules Phase -0.5 executes`
  - `Then friction categories should be extracted`
  - `Then CLAUDE.md suggestions should be extracted`
  - `Then insights_mode should be "fresh|stale|unavailable"`
  - `Then unified mode display should show "Full (memory + session + insights)"`
  - `Then Phase 3 source column should contain insights marker`

- [ ] Verify: all BDD scenarios FAIL (Red) at this stage

## Phase 1: Core Implementation (Green)

> Implement Phase -0.5 in the Claude version of suggest-rules.md.
> Each task targets specific @featureN scenarios.

- [ ] Add Phase -0.5 section to `extensions/suggest-rules/claude/commands/suggest-rules.md` @feature1
  _files: `extensions/suggest-rules/claude/commands/suggest-rules.md` (edit)_
  _Requirements: [FR-1](FR.md#fr-1-чтение-отчёта-insights-feature1), [FR-3](FR.md#fr-3-извлечение-friction-categories-feature3), [FR-4](FR.md#fr-4-извлечение-claudemd-suggestions-feature4), [FR-5](FR.md#fr-5-извлечение-big-wins-и-usage-patterns-feature5), [FR-6](FR.md#fr-6-извлечение-project-areas-для-обогащения-доменов-feature6), [FR-7](FR.md#fr-7-создание-pre-candidates-с-оценкой-релевантности-feature7)_
  _Leverage: Phase -1 section in same file (integration pattern)_
  Content:
  - Step 1: Locate report (Read ~/.claude/usage-data/report.html)
  - Step 3: Targeted extraction (CSS classes table)
  - Step 4: Pre-candidate output format
  - Step 5: Deduplication notes for Phase 1.5

- [ ] Add freshness check logic (3-day threshold) to Phase -0.5 Step 2 @feature2
  _files: `extensions/suggest-rules/claude/commands/suggest-rules.md` (edit)_
  _Requirements: [FR-2](FR.md#fr-2-проверка-свежести-отчёта-feature2), [FR-7](FR.md#fr-7-создание-pre-candidates-с-оценкой-релевантности-feature7)_
  Content:
  - Parse .subtitle date range
  - Compare end_date with current date
  - Fresh vs stale mode table
  - Unavailable fallback message with /insights hint

- [ ] Add unified mode display to Phase -0.5 Step 6 @feature4
  _files: `extensions/suggest-rules/claude/commands/suggest-rules.md` (edit)_
  _Requirements: [FR-5](FR.md#fr-5-извлечение-big-wins-и-usage-patterns-feature5), [FR-8](FR.md#fr-8-unified-mode-display-feature8)_
  Content:
  - Mode combination table (memory x insights = mode string)
  - Move final mode display from Phase -1 Step 3 to after Phase -0.5

- [ ] Update Execution Order section with Phase -0.5 steps @feature1
  _files: `extensions/suggest-rules/claude/commands/suggest-rules.md` (edit)_
  _Requirements: [FR-1](FR.md#fr-1-чтение-отчёта-insights-feature1)_
  Content:
  - Insert steps 5-6 (Read report, insights findings + unified display)
  - Renumber subsequent steps
  - Update "Begin" section to include Phase -0.5 in flow

- [ ] Update Phase 3 source markers to include insights @feature5
  _files: `extensions/suggest-rules/claude/commands/suggest-rules.md` (edit)_
  _Requirements: [FR-9](FR.md#fr-9-маркер-источника-в-phase-3-feature9), [FR-10](FR.md#fr-10-дедупликация-insights-с-session-findings-feature9)_
  Content:
  - Add `📊 insights` and `📊 insights ⚠️` to source column examples
  - Add `📍 turn #N + 📊` for merged candidates
  - Update Phase 1.5 to mention insights pre-candidates alongside session findings

- [ ] Verify: scenarios @feature1 @feature2 @feature4 @feature5 transition from Red to Green

## Phase 2: Sync & Version (Green)

> Ensure Cursor version is clean and extension metadata is updated.

- [ ] Update adaptation-report.md with Claude-only note for Phase -0.5 @feature3
  _files: `extensions/suggest-rules/adaptation-report.md` (edit)_
  _Requirements: [FR-9](FR.md#fr-9-маркер-источника-в-phase-3-feature9) (platform gate)_
  _Leverage: existing "Claude-only sections" table in adaptation-report.md_
  Content:
  - Verify Phase -0.5 is listed in "Claude-only секции" table
  - Add date and version reference (v1.4.0)

- [ ] Bump extension.json version to 1.4.0 @feature5
  _files: `extensions/suggest-rules/extension.json` (edit)_
  _Requirements: [FR-10 equivalent -- operational](FR.md#fr-10-дедупликация-insights-с-session-findings-feature9)_
  Content:
  - Change `"version": "1.3.0"` to `"version": "1.4.0"` (or current version to 1.4.0)

- [ ] Verify Cursor version has no insights references @feature3
  _files: `extensions/suggest-rules/cursor/commands/suggest-rules.md` (verify, no edit)_
  _Requirements: AC-10 (platform gate)_
  Verification:
  - Grep for "insights", "Phase -0.5", "report.html" in Cursor version
  - Confirm zero matches
  - Confirm Cursor mode display does NOT mention insights

- [ ] Verify: scenarios @feature3 pass (Cursor version clean)

## Phase 3: Refactor & Polish

> Final coherence check and spec validation after all scenarios Green.

- [ ] Validate full command coherence -- read suggest-rules.md top to bottom
  _files: `extensions/suggest-rules/claude/commands/suggest-rules.md` (verify)_
  Checks:
  - Phase numbering is sequential (-1 -> -0.5 -> 0 -> 0.5 -> 1 -> 1.5 -> 2 -> 2.5 -> 3 -> 4 -> 5)
  - Execution Order section matches actual phase sections
  - "Begin" section references all phases including -0.5
  - No broken internal references between phases
  - Phase -1 Step 3 deferred to after Phase -0.5

- [ ] Run validate-spec.ps1 on `.specs/suggest-rules-insights/`
  _files: `.specs/suggest-rules-insights/` (validate)_
  Command: `.\.dev-pomogator\tools\specs-generator\validate-spec.ps1 -Path ".specs/suggest-rules-insights"`
  Expected: all checks pass (STRUCTURE, PLACEHOLDER, FR_FORMAT, UC_FORMAT, EARS_FORMAT, NFR_SECTIONS, TDD_TASK_ORDER, CROSS_REF_LINKS)

- [ ] All BDD scenarios GREEN
- [ ] Full command reads coherently end-to-end
