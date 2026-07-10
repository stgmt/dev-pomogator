# Tasks

## Task Summary Table

| ID | Title | Status | Depends | Phase | Est. |
|----|-------|--------|---------|-------|------|
| jira-source-preserved | Preserve Jira source tracing checks | DONE | — | Phase 1 | 30m |
| jira-fr-trace-suppression | Suppress FR warning when Jira imperative trace exists | DONE | jira-source-preserved | Phase 1 | 30m |
| jira-source-absent-noop | Keep JIRA_SOURCE absence as no-op | DONE | jira-source-preserved | Phase 1 | 20m |
| jira-ac-trace-warning | Warn on AC sections without Jira trace evidence | DONE | jira-source-preserved | Phase 1 | 30m |
| jira-feature-trace-warning | Warn on scenarios without Jira trace comment | DONE | jira-source-preserved | Phase 1 | 30m |
| jira-drift-check | Check Jira cache/live drift fail-open behaviour | DONE | jira-source-preserved | Phase 2 | 45m |
| jira-template-distribution | Verify Jira-mode templates ship in canonical plugin layout | DONE | — | Phase 2 | 30m |

## TDD Workflow

Tasks are ordered by observable BDD behaviour: feature scenarios first, then implementation/verification against the real validator and canonical plugin layout.

## Phase 1: Jira source preservation checks

- [x] Preserve Jira source tracing checks — id: jira-source-preserved — Status: DONE | Est: 30m
  _Requirements: [FR-1](FR.md#fr-1-jirasourcemd-presence-triggers-jirasourcepreserved-tracing-checks-feature100)_
  **Done When:**
  - [x] @feature100 scenario verifies `JIRA_SOURCE.md` triggers `JIRA_SOURCE_PRESERVED` warnings for untraced FR/AC/feature content.

- [x] Suppress FR warning when Jira imperative trace exists — id: jira-fr-trace-suppression — Status: DONE | Est: 30m
  _depends: jira-source-preserved_
  _Requirements: [FR-2](FR.md#fr-2-jira-imperative-trace-in-frmd-section-suppresses-the-jirasourcepreserved-warning-for-that-section-feature101)_
  **Done When:**
  - [x] @feature101 scenario verifies `Jira imperative:` suppresses the FR.md warning for that section.

- [x] Keep JIRA_SOURCE absence as no-op — id: jira-source-absent-noop — Status: DONE | Est: 20m
  _depends: jira-source-preserved_
  _Requirements: [FR-3](FR.md#fr-3-absence-of-jirasourcemd-makes-jirasourcepreserved-rule-a-no-op-feature102)_
  **Done When:**
  - [x] @feature102 scenario verifies specs without `JIRA_SOURCE.md` produce zero `JIRA_SOURCE_PRESERVED` warnings.

- [x] Warn on AC sections without Jira trace evidence — id: jira-ac-trace-warning — Status: DONE | Est: 30m
  _depends: jira-source-preserved_
  _Requirements: [FR-4](FR.md#fr-4-ac-sections-without-jira-acceptance-or-evidence-emit-jirasourcepreserved-warning-feature103)_
  **Done When:**
  - [x] @feature103 scenario verifies AC sections lacking `Jira acceptance:` or `Evidence:` emit the expected warning.

- [x] Warn on scenarios without Jira trace comment — id: jira-feature-trace-warning — Status: DONE | Est: 30m
  _depends: jira-source-preserved_
  _Requirements: [FR-5](FR.md#fr-5-feature-scenarios-without-jira-trace-comment-emit-jirasourcepreserved-warning-feature104)_
  **Done When:**
  - [x] @feature104 scenario verifies feature scenarios lacking `# Jira trace:` emit the expected warning.

## Phase 2: Jira drift and distribution checks

- [x] Check Jira cache/live drift fail-open behaviour — id: jira-drift-check — Status: DONE | Est: 45m
  _Requirements: [FR-6](FR.md#fr-6-checkjiradrift-detects-cache-vs-live-state-divergence-and-fail-opens-when-mcp-unavailable-feature105)_
  **Done When:**
  - [x] @feature105 scenarios verify no-cache, MCP-unavailable, issue-updated, and new-comment outcomes.

- [x] Verify Jira-mode templates ship in canonical plugin layout — id: jira-template-distribution — Status: DONE | Est: 30m
  _Requirements: [FR-7](FR.md#fr-7-jira-mode-template-files-are-distributed-with-the-spec-generator-feature106)_
  **Done When:**
  - [x] @feature106 scenario verifies `JIRA_SOURCE.md.template` and `ATTACHMENTS.md.template` under `.claude/skills/create-spec/references/templates/`, `JIRA_CACHE.schema.json` under `tools/specs-generator/templates/`, and `.claude-plugin/plugin.json` exporting `./.claude/skills`.

## Phase 3: Final verification

- [x] Final Docker BDD verification — id: jira-final-bdd-verification — Status: DONE | Est: 15m
  _Requirements: [FR-1](FR.md#fr-1-jirasourcemd-presence-triggers-jirasourcepreserved-tracing-checks-feature100), [FR-7](FR.md#fr-7-jira-mode-template-files-are-distributed-with-the-spec-generator-feature106)_
  **Done When:**
  - [x] `SPECJIRA001_01` passed in Docker and drives the real `validate-spec` CLI; a temporary `JIRA_SOURCE_PRESERVED` rule mutation made the scenario fail, and restoring the implementation made it pass.
  - [x] Canonical full Docker BDD run `1783648212042` passed: `1726 scenarios (1726 passed)`, `10180 steps (10180 passed)`; `SPECJIRA001_01` is fresh `docker-bdd:full` evidence.
