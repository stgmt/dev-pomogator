# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | Linked UC | @featureN | Status |
|----|------|-----------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-managed-gitignore-block-feature1) | Managed gitignore block | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1) | [UC-1](USE_CASES.md#uc-1-fresh-install-в-чистый-target-проект-feature1-feature2-feature3), [UC-2](USE_CASES.md#uc-2-re-install-после-удаления-extension-feature1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-settingslocaljson-target-для-hooksenv-feature2) | settings.local.json target | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2) | [UC-1](USE_CASES.md#uc-1-fresh-install-в-чистый-target-проект-feature1-feature2-feature3) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-legacy-migration-из-settingsjson-feature2) | Legacy migration | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature2) | [UC-1](USE_CASES.md#uc-1-fresh-install-в-чистый-target-проект-feature1-feature2-feature3) | @feature2 | Draft |
| [FR-4](FR.md#fr-4-self-guard-для-dev-pomogator-репо-feature3) | Self-guard | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature3) | [UC-3](USE_CASES.md#uc-3-install-в-dev-pomogator-репо-dogfooding-feature3), [UC-8](USE_CASES.md#uc-8-uninstall-в-dev-pomogator-репо-feature7) | @feature3 | Draft |
| [FR-5](FR.md#fr-5-loud-fail-setupglobalscripts-feature4) | Loud-fail setupGlobalScripts | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature4) | [UC-4](USE_CASES.md#uc-4-broken-dist-dkorotkov-repro-feature4) | @feature4 | Draft |
| [FR-6](FR.md#fr-6-fail-soft-hook-wrapper-feature5) | Fail-soft hook wrapper | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature5) | [UC-5](USE_CASES.md#uc-5-runner-исчез-после-успешной-установки-feature5) | @feature5 | Draft |
| [FR-7](FR.md#fr-7-collision-detection-через-git-ls-files-feature6) | Collision detection | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature6) | [UC-6](USE_CASES.md#uc-6-collision-с-user-committed-command-feature6) | @feature6 | Draft |
| [FR-8](FR.md#fr-8-per-project-uninstall-command-feature7) | Per-project uninstall | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-feature7) | [UC-7](USE_CASES.md#uc-7-per-project-uninstall-feature7), [UC-8](USE_CASES.md#uc-8-uninstall-в-dev-pomogator-репо-feature7) | @feature7 | Draft |
| [FR-9](FR.md#fr-9-force-global-mcp-writes-feature8) | Force-global MCP writes | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-feature8) | [UC-9](USE_CASES.md#uc-9-setup-mcppy-с-существующим-project-mcpjson-feature8), [UC-11](USE_CASES.md#uc-11-claude-mem-mcp-registration-invariant-feature8) | @feature8 | Draft |
| [FR-10](FR.md#fr-10-secret-detection-в-project-mcpjson-feature8) | Secret detection | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-feature8) | [UC-10](USE_CASES.md#uc-10-install-с-secrets-в-project-mcpjson-feature8) | @feature8 | Draft |
| [FR-11](FR.md#fr-11-ai-agent-uninstall-skill-feature9) | AI agent uninstall skill | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-feature9) | [UC-12](USE_CASES.md#uc-12-user-просит-ai-удалить-dev-pomogator-feature9) | @feature9 | Draft |

## Functional Requirements

- [FR-1: Managed gitignore block](FR.md#fr-1-managed-gitignore-block-feature1)
- [FR-2: settings.local.json target для hooks/env](FR.md#fr-2-settingslocaljson-target-для-hooksenv-feature2)
- [FR-3: Legacy migration из settings.json](FR.md#fr-3-legacy-migration-из-settingsjson-feature2)
- [FR-4: Self-guard для dev-pomogator репо](FR.md#fr-4-self-guard-для-dev-pomogator-репо-feature3)
- [FR-5: Loud-fail setupGlobalScripts](FR.md#fr-5-loud-fail-setupglobalscripts-feature4)
- [FR-6: Fail-soft hook wrapper](FR.md#fr-6-fail-soft-hook-wrapper-feature5)
- [FR-7: Collision detection через git ls-files](FR.md#fr-7-collision-detection-через-git-ls-files-feature6)
- [FR-8: Per-project uninstall command](FR.md#fr-8-per-project-uninstall-command-feature7)
- [FR-9: Force-global MCP writes](FR.md#fr-9-force-global-mcp-writes-feature8)
- [FR-10: Secret detection в project .mcp.json](FR.md#fr-10-secret-detection-в-project-mcpjson-feature8)
- [FR-11: AI agent uninstall skill](FR.md#fr-11-ai-agent-uninstall-skill-feature9)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Managed gitignore block](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)
- [AC-2 (FR-2): settings.local.json target](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2)
- [AC-3 (FR-3): Legacy migration](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature2)
- [AC-4 (FR-4): Self-guard](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature3)
- [AC-5 (FR-5): Loud-fail setupGlobalScripts](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature4)
- [AC-6 (FR-6): Fail-soft hook wrapper](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature5)
- [AC-7 (FR-7): Collision detection](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature6)
- [AC-8 (FR-8): Per-project uninstall](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-feature7)
- [AC-9 (FR-9): Force-global MCP writes](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-feature8)
- [AC-10 (FR-10): Secret detection](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-feature8)
- [AC-11 (FR-11): AI agent uninstall skill](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-feature9)
