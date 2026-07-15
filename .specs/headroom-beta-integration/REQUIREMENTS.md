# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-beta-opt-in-gate) | Beta opt-in gate | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-topology-selection) | Topology selection | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-docker-first-runtime) | Docker-first runtime | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-host-headless-fallback) | Host headless fallback | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-peak-headroom-configuration) | Peak Headroom configuration | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-verification-and-doctor) | Verification and doctor | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-safe-claude-settings-management) | Safe Claude settings | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-honest-savings-reporting) | Honest savings reporting | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-packaged-skills-and-user-docs) | Packaged skills and docs | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-regression-coverage) | Regression coverage | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature10 | Draft |

## Verification Matrix

| CHK-ID | Requirement | Verification Method | Status | Notes |
|--------|-------------|---------------------|--------|-------|
| CHK-FR1-01 | Beta does not install unless opted in | BDD scenario | Draft | Check install flags/config. |
| CHK-FR2-01 | User can choose Codex-sub2api or Anthropic-direct | BDD scenario | Draft | Mutually exclusive topology. |
| CHK-FR3-01 | Docker profile is selected when Docker works | Integration test | Draft | Host and WSL probes. |
| CHK-FR4-01 | Host fallback creates autostart | Integration test | Draft | Task Scheduler/systemd/LaunchAgent fixtures. |
| CHK-FR5-01 | Headroom runs in token mode with supported flags | Integration test | Draft | Help-derived flag plan. |
| CHK-FR6-01 | Doctor proves savings path or explains zero | BDD scenario | Draft | `/stats` fixture. |
| CHK-FR7-01 | Settings backup and rollback work | Integration test | Draft | JSON fixture with unknown keys. |
| CHK-FR8-01 | Report separates compression/cache/tool-search | Unit test | Draft | No inflated claims. |
| CHK-FR9-01 | Skill/command docs are shipped | Manifest drift test | Draft | Plugin packaging. |
| CHK-FR10-01 | Regression suite covers major failures | BDD + unit tests | Draft | Docker missing, cache mode, unsupported flag. |

