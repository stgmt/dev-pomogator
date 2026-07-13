# Changelog

All notable changes to this feature are documented in this file.

## [Unreleased]

### Added

- Statusline render script with progress bar, ANSI colors, and multi-state display (FR-1, FR-1a).
- YAML status-file protocol and atomic runner updates (FR-2, FR-3, FR-4).
- Session initialization, cleanup, isolation, extension registration, and Docker test isolation (FR-5 through FR-9).
- StatusLine coexistence resolution and fail-open wrapper behavior (FR-11).
- FR-12 finalization plan for issue #106: the canonical `tools/test-statusline/test_runner_wrapper.cjs` must preserve valid framework and post-`--` arguments, resolve only installed canonical targets, and fail closed for validation, target, loader, bootstrap, dependency, and WSL UNC failures.
- FR-12 BDD plan: seven one-to-one scenarios `PLUGIN011_36` through `PLUGIN011_42` will assert forwarding and every acceptance failure path; expected failures require both stderr diagnostics and non-zero exit status.

### Planned

- FR-10 Hooks Integrity Guard SessionStart validation and restoration.
- FR-12 Docker BDD evidence for canonical-plugin, plugin-cache, dependencies-absent, and UNC-safe runtime artifacts.

## [0.1.0] - TBD

### Added

- Initial implementation.
