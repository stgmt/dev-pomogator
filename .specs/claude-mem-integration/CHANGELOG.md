# Changelog

## Unreleased — claude-mem integration v2

### Added

- Defined a non-interactive, built-ins-only SessionStart bootstrap with ordered install decisions, opt-out, effective-home resolution, six-hour backoff, detached launch provenance, and fail-open behavior ([FR-1](FR.md#fr-1-bootstrap-decision-feature1)–[FR-4](FR.md#fr-4-fail-open-builtins-only-feature4)).
- Defined doctor checks for canonical installed-state evidence, worker diagnosis, and global MCP parsing from `~/.claude.json`; installation, configuration, reachability, port, and version evidence remain distinct ([FR-5](FR.md#fr-5-doctor-detection-feature5), [FR-6](FR.md#fr-6-doctor-reads-the-canonical-global-mcp-config-feature6)).
- Defined a native-Windows-only reaper boundary that targets only orphaned claude-mem-signature holders on a wedged port and resets the failure counter only after a reap ([FR-7](FR.md#fr-7-worker-reaper-heals-a-wedged-port-feature7)).
- Added graph-visible TDD task sequencing for bootstrap, doctor/configuration, and reaper/release proof in [TASKS.md](TASKS.md).

### Verification contract

- Default Docker BDD uses recorded/local seams and is offline: it must not perform a real package download or installation.
- The real-install BDD profile is separately selected, network-enabled only by explicit opt-in, and uses isolated `HOME`/`USERPROFILE`.
- Real-install evidence reports manifest, MCP registration, worker reachability, and version independently. No failed component may be reported as verified.
- This release record does not claim execution success. Canonical run evidence is required before any mapped task is `DONE`.
