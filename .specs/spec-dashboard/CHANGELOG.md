# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Defined a kanban-first, read-only dashboard over the canonical spec-generator-v4 MCP graph.
- Added a Phase 3 task board covering Docker BDD foundation, producer-shaped fixtures, typed DTOs, allowlisted stdio adapter, same-origin routes, browser views, runtime evidence, accessibility, security, performance, and final verification.
- Recorded implementation targets under `tools/spec-dashboard/` and BDD integration targets under `tests/features/spec-dashboard/` and `tests/step_definitions/`.

### Changed
- Defined the kanban cards as canonical Task nodes from bounded `list_tasks`, with authored status separate from evidence-derived verification/readiness.
- Added bounded `find_refs` for complete incoming/outgoing relationships; history is explicitly unavailable until the provider exposes it.
- Specified Node 20 `server.bundle.mjs`, browser `app.bundle.js`, loopback launcher, package-lock and Docker Playwright/Chromium wiring, and deps-absent distribution proof.
- Expanded BDD from six API-oriented scenarios to nine API/browser scenarios with dedicated performance, deps-absent startup, and browser security/cleanup proof.
- Assigned guaranteed browser/adapter/MCP cleanup to the existing `tests/hooks/before-after.ts` `After` hook and preserved the clean-room Plane policy.

### Fixed
- Removed placeholder task, README, and changelog content from the Phase 3 finalization artifacts.
- Made lifecycle, scenario-result, freshness, availability, redaction, allowlist, path, and provider-error semantics explicit in the implementation checklist.

## [0.1.0] - TBD

### Added
- Initial implementation
