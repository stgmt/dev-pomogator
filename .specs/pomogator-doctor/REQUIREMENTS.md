# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Reinstallable | Status |
|----|------|-----------|-----------|---------------|--------|
| [FR-1](FR.md#fr-1-node-version-check-feature1) | Node version check | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1) | @feature1 | no | Draft |
| [FR-2](FR.md#fr-2-git-presence-check-feature1) | Git presence check | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature1) | @feature1 | no | Draft |
| [FR-3](FR.md#fr-3-devpomogator-structure-check-feature2) | ~/.dev-pomogator/ structure | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature2) | @feature2 | yes | Draft |
| [FR-4](FR.md#fr-4-hooks-registry-sync-check-feature2) | Hooks registry sync | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature2) | @feature2 | yes | Draft |
| [FR-5](FR.md#fr-5-env-requirements-check-dual-location-feature3) | Env requirements (dual location) | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature3) | @feature3 | no | Draft |
| [FR-6](FR.md#fr-6-envexample-presence-check-feature2) | .env.example presence | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature2) | @feature2 | yes | Draft |
| [FR-7](FR.md#fr-7-bun-binary-check-extension-gated-feature11) | Bun binary (gated) | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature11) | @feature11 | no | Draft |
| [FR-8](FR.md#fr-8-python--perextension-packages-check-extension-gated-feature11) | Python + per-ext packages | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-feature11) | @feature11 | no | Draft |
| [FR-9](FR.md#fr-9-mcp-servers-parse-check-feature4) | MCP servers parse | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-feature4) | @feature4 | no | Draft |
| [FR-10](FR.md#fr-10-mcp-full-probe-check-feature4) | MCP Full probe | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-feature4) | @feature4 | no | Draft |
| [FR-11](FR.md#fr-11-version-match-check-feature2) | Version match | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-feature2) | @feature2 | yes | Draft |
| [FR-12](FR.md#fr-12-managed-gitignore-block-check-feature2) | Managed gitignore block | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-feature2) | @feature2 | yes | Draft |
| [FR-13](FR.md#fr-13-commandsskills-pluginloader-check-feature10) | Commands/Skills loader | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-feature10) | @feature10 | yes | Draft |
| [FR-14](FR.md#fr-14-docker--devcontainer-cli-check-extension-gated-feature11) | Docker + devcontainer CLI | [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14-feature11) | @feature11 | no | Draft |
| [FR-15](FR.md#fr-15-slash-command-pomogatordoctor-feature1) | Slash command | [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15-feature1) | @feature1 | n/a | Draft |
| [FR-16](FR.md#fr-16-cli-flag-devpomogator-doctor-feature8) | CLI --doctor flag | [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16-feature8) | @feature8 | n/a | Draft |
| [FR-17](FR.md#fr-17-sessionstart-hook-feature4) | SessionStart hook | [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17-feature4) | @feature4 | n/a | Draft |
| [FR-18](FR.md#fr-18-reinstall-integration-feature2) | Reinstall integration | [AC-18](ACCEPTANCE_CRITERIA.md#ac-18-fr-18-feature2) | @feature2 | n/a | Draft |
| [FR-19](FR.md#fr-19-reinstallable-classification-meta-feature2) | Reinstallable meta | [AC-19](ACCEPTANCE_CRITERIA.md#ac-19-fr-19-feature2) | @feature2 | n/a | Draft |
| [FR-20](FR.md#fr-20-trafficlight-grouped-output-feature9) | Traffic-light output | [AC-20](ACCEPTANCE_CRITERIA.md#ac-20-fr-20-feature9) | @feature9 | n/a | Draft |
| [FR-21](FR.md#fr-21-perextension-driving-feature11) | Per-extension driving | [AC-21](ACCEPTANCE_CRITERIA.md#ac-21-fr-21-feature11) | @feature11 | n/a | Draft |
| [FR-22](FR.md#fr-22-extensionjson-dependencies-schema-feature11) | extension.json dependencies field | [AC-22](ACCEPTANCE_CRITERIA.md#ac-22-fr-22-feature11) | @feature11 | n/a | Draft |
| [FR-23](FR.md#fr-23-exit-codes-feature8) | Exit codes | [AC-23](ACCEPTANCE_CRITERIA.md#ac-23-fr-23-feature8) | @feature8 | n/a | Draft |
| [FR-24](FR.md#fr-24-json-output-mode-feature8) | JSON output | [AC-24](ACCEPTANCE_CRITERIA.md#ac-24-fr-24-feature8) | @feature8 | n/a | Draft |
| [FR-25](FR.md#fr-25-env-values-redaction-in-json-feature8) | Env values redaction | [AC-25](ACCEPTANCE_CRITERIA.md#ac-25-fr-25-feature8) | @feature8 | n/a | Draft |

## @featureN Groups

- **@feature1** — Core detection + slash command: FR-1, FR-2, FR-15
- **@feature2** — Reinstall flow (broken install, hooks, version, gitignore): FR-3, FR-4, FR-6, FR-11, FR-12, FR-18, FR-19
- **@feature3** — Env vars validation (dual location): FR-5
- **@feature4** — MCP checks + SessionStart hook: FR-9, FR-10, FR-17
- **@feature8** — CLI + CI (JSON, exit codes, redaction): FR-16, FR-23, FR-24, FR-25
- **@feature9** — Traffic-light output: FR-20
- **@feature10** — Plugin-loader state detection: FR-13
- **@feature11** — Per-extension gating + schema: FR-7, FR-8, FR-14, FR-21, FR-22

## Functional Requirements

- [FR-1: Node version check](FR.md#fr-1-node-version-check-feature1)
- [FR-2: Git presence check](FR.md#fr-2-git-presence-check-feature1)
- [FR-3: ~/.dev-pomogator/ structure check](FR.md#fr-3-devpomogator-structure-check-feature2)
- [FR-4: Hooks registry sync check](FR.md#fr-4-hooks-registry-sync-check-feature2)
- [FR-5: Env requirements check (dual location)](FR.md#fr-5-env-requirements-check-dual-location-feature3)
- [FR-6: .env.example presence check](FR.md#fr-6-envexample-presence-check-feature2)
- [FR-7: Bun binary check (extension-gated)](FR.md#fr-7-bun-binary-check-extension-gated-feature11)
- [FR-8: Python + per-extension packages check](FR.md#fr-8-python--perextension-packages-check-extension-gated-feature11)
- [FR-9: MCP servers parse check](FR.md#fr-9-mcp-servers-parse-check-feature4)
- [FR-10: MCP Full probe check](FR.md#fr-10-mcp-full-probe-check-feature4)
- [FR-11: Version match check](FR.md#fr-11-version-match-check-feature2)
- [FR-12: Managed gitignore block check](FR.md#fr-12-managed-gitignore-block-check-feature2)
- [FR-13: Commands/Skills plugin-loader check](FR.md#fr-13-commandsskills-pluginloader-check-feature10)
- [FR-14: Docker + devcontainer CLI check (extension-gated)](FR.md#fr-14-docker--devcontainer-cli-check-extension-gated-feature11)
- [FR-15: Slash command /pomogator-doctor](FR.md#fr-15-slash-command-pomogatordoctor-feature1)
- [FR-16: CLI flag dev-pomogator --doctor](FR.md#fr-16-cli-flag-devpomogator-doctor-feature8)
- [FR-17: SessionStart hook](FR.md#fr-17-sessionstart-hook-feature4)
- [FR-18: Reinstall integration](FR.md#fr-18-reinstall-integration-feature2)
- [FR-19: Reinstallable classification meta](FR.md#fr-19-reinstallable-classification-meta-feature2)
- [FR-20: Traffic-light grouped output](FR.md#fr-20-trafficlight-grouped-output-feature9)
- [FR-21: Per-extension driving](FR.md#fr-21-perextension-driving-feature11)
- [FR-22: extension.json dependencies schema](FR.md#fr-22-extensionjson-dependencies-schema-feature11)
- [FR-23: Exit codes](FR.md#fr-23-exit-codes-feature8)
- [FR-24: JSON output mode](FR.md#fr-24-json-output-mode-feature8)
- [FR-25: Env values redaction in JSON](FR.md#fr-25-env-values-redaction-in-json-feature8)

## Non-Functional Requirements

- [Performance (P-1..P-5)](NFR.md#performance) — ≤5s total, ≤3s per check, concurrent, cold start <500ms
- [Security (S-1..S-6)](NFR.md#security) — no env values in logs, JSON redaction, shell:false spawn, path validation, fake fixtures
- [Reliability (R-1..R-6)](NFR.md#reliability) — fail-soft, silent SessionStart error, atomic progress writes, lock against 2 runs, SIGKILL at timeout, corrupt config handling
- [Usability (U-1..U-7)](NFR.md#usability) — actionable hints, chalk ✓⚠✗, NO_COLOR, exit codes, traffic-light groups, specific reinstall prompt, brief banner

## Acceptance Criteria

- [AC-1..AC-25](ACCEPTANCE_CRITERIA.md) — EARS формат, один AC на каждый FR-1..FR-25

## Check ID Mapping (FR ↔ Check ID из RESEARCH)

| FR | Check ID | RESEARCH section |
|----|----------|------------------|
| FR-1 | C1 | Critical: Node |
| FR-2 | C2 | Critical: Git |
| FR-3 | C3, C4, C5 | Critical: home structure |
| FR-4 | C6 | Self-healing: hooks |
| FR-5 | C7, C17 | Critical: env + fallback |
| FR-6 | C8 | Self-healing: .env.example |
| FR-7 | C9 | Medium: Bun |
| FR-8 | C10a, C10b | Medium: Python + packages |
| FR-9 | C11 | Medium: MCP parse |
| FR-10 | C12 | Medium: MCP probe |
| FR-11 | C13 | Critical: version |
| FR-12 | C14 | Self-healing: gitignore |
| FR-13 | C15 | New: plugin-loader |
| FR-14 | C16 | New: Docker |
