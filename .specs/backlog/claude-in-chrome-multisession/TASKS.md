# Tasks

## TDD Workflow

Foundation **уже верифицирована** через POC end-to-end (см. RESEARCH.md). Этот TASKS.md — productionization того POC.

## Phase -1: Infrastructure Prerequisites

> Не требуется.

## Phase 0: BDD Foundation @feature1 @feature2

- [x] **task-bdd-feature** — `tests/features/plugins/claude-in-chrome-multisession/PLUGIN018_*.feature` (10 scenarios).
- [ ] **task-bdd-helpers** — `tests/e2e/claude-in-chrome-multisession-helpers.ts` (makeFakeHome, runHookSync, runClaimTabSync, writeOwned, readOwned).

## Phase 1: Hook + CLI helper (Green) @feature1 @feature2 @feature5 @feature6 @feature7 @feature8 @feature9

- [x] **task-cims-guard** — `extensions/.../cims-guard.ts` (~190 строк, production-ready POC v3 derivative).
  _Requirements: [FR-2](FR.md#fr-2-pretooluse-hook-denies-cross-session-tab-access), [FR-3](FR.md#fr-3-posttooluse-hook-auto-records-new-tabids), [FR-6](FR.md#fr-6-bootstrap-mode--orphan-auto-claim), [FR-7](FR.md#fr-7-hook-event-log), [FR-8](FR.md#fr-8-fail-open-on-errors)_
- [x] **task-claim-tab** — `claim-tab.mjs` (subcommands add/release/list/clean/reset).
  _Requirements: [FR-5](FR.md#fr-5-manual-claimrelease-cli-helper)_
- [x] **task-extension-tools-readme** — tools README.

## Phase 2: Manifest + skill (Green) @feature3 @feature4

- [x] **task-extension-manifest** — `extension.json` с tools/toolFiles/skills/skillFiles/hooks.
  _Requirements: [FR-1](FR.md#fr-1-extension-package-claude-in-chrome-multisession), [FR-9](FR.md#fr-9-installer-integration-via-standard-hook-flow)_
- [x] **task-skill-md** — `SKILL.md` с 9 mandatory sections + frontmatter.
  _Requirements: [FR-4](FR.md#fr-4-skill-instructs-claude-on-protocol)_
- [x] **task-extension-readme** — README с install + upstream refs.
  _Requirements: [FR-10](FR.md#fr-10-sunset-path)_
- [x] **task-extension-changelog** — CHANGELOG v0.1.0.
  _Requirements: [FR-10](FR.md#fr-10-sunset-path)_

## Phase 3: Tests (Green) @feature1 @feature2 @feature4 @feature5 @feature6 @feature7 @feature8 @feature9

- [ ] **task-test-guard** — `claude-in-chrome-multisession-guard.test.ts`: PLUGIN018_01..06.
  _Requirements: AC-2, AC-3, AC-6, AC-7, AC-8_
- [ ] **task-test-claim** — `claude-in-chrome-multisession-claim.test.ts`: PLUGIN018_07..09 + edge cases.
  _Requirements: AC-5_
- [ ] **task-test-skill** — `claude-in-chrome-multisession-skill.test.ts`: SKILL.md content per AC-4.
  _Requirements: AC-4_
- [ ] **task-test-installer** — `claude-in-chrome-multisession-installer.test.ts`: PLUGIN018_10 (Docker tier).
  _Requirements: AC-9_

## Phase 4: Refactor & Polish @feature10

- [ ] **task-claude-md** — Edit CLAUDE.md: add to Key extensions list.
- [ ] **task-demote-mux** — Edit `extensions/chrome-devtools-mcp-mux/extension.json`: `stability: "beta"` + Windows blocked warning.
- [ ] **task-mcp-config-cleanup** — Edit `.mcp.json`: remove broken mux entry.
- [ ] **task-spec-changelog** — Finalize CHANGELOG.md.
- [ ] **task-spec-readme** — Finalize README.md.
- [ ] **task-final-verify** — `/run-tests claude-in-chrome-multisession` — все scenarios GREEN.
- [ ] **task-validate-spec** — `validate-spec.ts` — 0 errors.
- [ ] **task-spec-audit** — `audit-spec.ts` — 0 ERRORS.
