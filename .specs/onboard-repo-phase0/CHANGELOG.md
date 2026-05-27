# Changelog

All notable changes to this feature will be documented in this file.

Формат: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), семантика версий: [SemVer](https://semver.org/).

## [0.1.0] — 2026-05-23

> Shipped via `extensions/onboard-repo/` (package v0.1.0, full layout: tools/onboard-repo/{lib,renderers,schemas,steps,templates}). 7 step modules (archetype-triage, baseline-tests, finalize, ingestion, parallel-recon, scratch-findings, text-gate) + 2 renderers (compile-hook, render-rule). Schema `onboarding.schema.json` Draft 2020-12 enforces 30+ required AI-centric fields. Cross-extension dependencies declared via `crossExtensionModifies` in extension.json.
>
> Two enforcement rules: `.claude/rules/onboard-repo/onboarding-artifact-ai-centric.md` (AI-specific sections required, not generic metadata) + `commands-via-skill-reference.md` (skill-wrapping over hardcoded raw commands).
>
> 12 e2e test files in `tests/e2e/onboard-repo/` cover archetype detection, baseline tests, cache invalidation, coexistence with existing setups, finalize, ignore patterns + redaction, ingestion, parallel recon + helpers.
>
> Phase 0 integration with create-spec lives in `.claude/skills/create-spec/SKILL.md` (originally planned as a separate `.claude/rules/specs-workflow/specs-management.md` edit — consolidated into the skill bundle).
>
> Audit-spec: 0 ERRORS / 5 WARNINGS (cosmetic).

## [Unreleased]

### Added
- Спецификация `onboard-repo-phase0` — Phase 1 Discovery (USER_STORIES 15, USE_CASES 13 + 6 EC, RESEARCH с 40+ URL-pruf SOTA обзора)
- Phase 1.5 Context Analysis — Project Context & Constraints table (14 релевантных правил, 9 existing extensions, BDD framework detection result для target test-projects)
- Phase 2 Requirements + Design:
  - 20 FR (14 functional + 5 infrastructure + 1 OUT OF SCOPE)
  - NFR sections: Performance, Security, Reliability, Usability, Maintainability, Observability, Compatibility, Assumptions, Risks, Out of Scope
  - 20 Acceptance Criteria в EARS формате
  - DESIGN.md с архитектурным обзором, 7-step алгоритмом, BDD Test Infrastructure (TEST_DATA_ACTIVE + TEST_FORMAT BDD), design decisions (DD-1..DD-7), reuse table
  - onboard-repo-phase0_SCHEMA.md — JSON Schema v1.0 Draft 2020-12 для `.onboarding.json` (17 блоков + метаданные + validation rules)
  - 34 BDD сценария в `.feature` файле (ONBOARD001..ONBOARD034) с @feature1..@feature15 tags
  - FIXTURES.md — 20 fixtures (F-1..F-20), dependencies graph, gap analysis по @featureN scenarios
  - FILE_CHANGES.md — 52 create + 6 edit файлов
- Phase 3 Finalization:
  - TASKS.md — TDD-ordered phases (Phase -1 infrastructure → Phase 0 BDD foundation → Phase 1-13 green → Refactor), 90+ задач с ссылками на FR + @featureN
  - README.md — overview, ключевые идеи, навигация
- Новая memory запись: `feedback_onboarding-artifact-must-be-ai-centric.md` — fix constraints для FR/AC (AI-first content + commands via skill reference, не hardcode)

### Changed
- n/a (no previous versions)

### Fixed
- n/a

## [0.1.0] - TBD

### Added
- Initial implementation Phase 0 Repo Onboarding
- Extension `extensions/onboard-repo/` с полным manifest
- 7-step pipeline: archetype-triage → parallel-recon → ingestion → baseline-tests → scratch-findings → text-gate → finalize
- 2 renderer скрипта: `render-rule.ts` (prose) + `compile-hook.ts` (PreToolUse hook)
- 5 lib helpers: git-sha-cache, schema-validator, subagent-merge, ignore-parser, secret-redaction
- JSON Schema v1.0 для `.onboarding.json`
- 6-секционный template для `.onboarding.md` (порт rpa-init дословно)
- 2 новых rules: `onboarding-artifact-ai-centric.md`, `commands-via-skill-reference.md`
- Cross-extension edits: Phase 0 добавлена в `specs-management.md`, trigger logic в `create-spec` SKILL, state `Onboarding` в `spec-status.ts`
- 20 test fixtures (F-1..F-20) + 3 hooks (before-each, after-each, mock-subagent) + helpers
- Integration tests для всех UC/EC через `/run-tests`
- BDD .feature файл с 34 сценариями (ONBOARD001..ONBOARD034)
- Docker E2E verification
