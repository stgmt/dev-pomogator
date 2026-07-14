# Changelog

## 2026-07-10

- Created initial Headroom beta integration spec from GitHub issues #84/#88 and
  live Headroom 0.31.0 observations.
- Scoped the first beta to Headroom install, topology selection, doctor,
  verification, rollback, and packaging.
- Deferred context-mode/force-ctx installation to a later spec phase.
- Added the first installer/configurator slice under `tools/headroom-beta/`:
  runtime detection, install planning, supported Headroom flag filtering,
  Claude settings patching, Windows wrapper/startup templates, Docker runtime
  templates, a skill/command surface, and focused Docker-run unit coverage.
