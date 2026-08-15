# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Defined the browser shell as a forked, vendored, and adapted `makeplane/plane` `v1.4.1` tree at commit `5662b761062b0b2f9d42a6578b55481b5b069792`, retaining the board, UI, design-system, and runtime boundary rather than merely referencing Plane.
- Replaced or bypassed Plane backend, domain, authentication, workspace, and project data with the read-only spec-generator-v4 SpecGraph MCP provider and documented the runtime no-Plane-service boundary.
- Added finalization tasks for vendor import and provenance, retained-shell/adaptation boundaries, manual upstream synchronization and conflict review, AGPL notices, unauthenticated corresponding-source links, proprietary-component exclusion, Node `>=22.18`/pnpm `11.3.0` fork builds, packaged runtime and dependency-absent proof, and executable SPECDASH001_10 through SPECDASH001_13 checks.

### Changed
- Preserved the prior full UX scope: kanban-first status review, typed trace, coverage gaps, directed impact, evidence and freshness, keyboard/focus, reduced motion, lazy loading, bounded 1,000-task performance, read-only security, typed failures, cleanup, and Docker BDD evidence.
- Updated README and final verification planning to require real fork, source, license, upstream-sync, build, runtime, and deps-absent artifacts; synthetic assertions and silent skips do not satisfy these checks.

## [0.1.0] - TBD

### Added
- Initial implementation
