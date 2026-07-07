# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added

- **Phase 0 (BDD Foundation):** `.feature` с 28 scenarios SPECGEN003_01..28 + vitest e2e test translator
- **Phase 1 (shared):** `spec-form-parsers.ts` (5 parsers), `audit-logger.ts` (30d retention), `phase-constants.ts` v3 helpers (`getProgressVersion`, `isV3Spec`, `PROGRESS_SCHEMA_VERSION`), `scaffold-spec.ts` stamps `version: 3`
- **Phase 2 (form-guards):** 6 PreToolUse hooks — user-story-form-guard, task-form-guard, design-decision-guard, requirements-chk-guard, risk-assessment-guard, extension-json-meta-guard
- **Phase 3 (child skills):** discovery-forms, requirements-chk-matrix, task-board-forms (anti-pushy descriptions)
- **Phase 4 (templates + runtime):** 5 templates updated, `spec-status.ts -Format task-table`, `validate-specs.ts` UserPromptSubmit summary
- **Phase 5 (manifest + docs):** extension.json v1.17.0 с array-of-groups hooks, CHANGELOG 1.17.0 entry, specs-management.md Skill wiring
- **Phase 6 (dogfood):** `.specs/spec-generator-v3/` в v3 формате

### Security

- **No env var bypass.** `SPEC_FORM_GUARDS_DISABLE` не существует; агенты физически не могут выключить form-guards.
- **Meta-guard protects manifest.** Удаление form-guard из extension.json / settings.local.json → DENY с human-review message.
- **Audit log surfaces bypass attempts.** Каждое DENY / PARSER_CRASH event записано в `~/.dev-pomogator/logs/form-guards.log`; UserPromptSubmit summary показывает counts maintainer'у.
- **Fail-open на parser exception.** Bug regex не блокирует legit Write — PARSER_CRASH event logged, hook exits 0.
