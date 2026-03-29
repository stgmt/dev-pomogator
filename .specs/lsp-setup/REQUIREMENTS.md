# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-extension-manifest-feature1) | Extension Manifest | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-extension-manifest-valid-feature1), [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-enable_lsp_tool-env-var-feature1), [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-idempotent-installation-feature1), [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-update-adds-new-servers-feature1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-lsp-server-installation-feature2-feature3-feature4) | LSP Server Installation | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-lsp-servers-installed-feature2-feature3-feature4), [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-verification-report-feature2-feature3-feature4) | @feature2 @feature3 @feature4 | Draft |
| [FR-3](FR.md#fr-3-runtime-detection-feature5) | Runtime Detection | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-missing-runtime-handling-feature5) | @feature5 | Draft |
| [FR-4](FR.md#fr-4-claude-code-plugin-installation-feature7) | Plugin Installation | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-plugin-installation-with-fallback-feature7) | @feature7 | Draft |
| [FR-5](FR.md#fr-5-lsp-usage-rule-feature6) | LSP Usage Rule | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-lsp-usage-rule-installed-feature6) | @feature6 | Draft |
| [FR-6](FR.md#fr-6-enable_lsp_tool-environment-variable-feature1) | ENABLE_LSP_TOOL Env Var | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-enable_lsp_tool-env-var-feature1) | @feature1 | Draft |
| [FR-7](FR.md#fr-7-verification-report-feature2-feature3-feature4) | Verification Report | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-verification-report-feature2-feature3-feature4) | @feature2 @feature3 @feature4 | Draft |
| [FR-8](FR.md#fr-8-idempotent-installation-feature1) | Idempotent Installation | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-idempotent-installation-feature1) | @feature1 | Draft |
| [FR-9](FR.md#fr-9-update-support-feature1) | Update Support | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-update-adds-new-servers-feature1) | @feature1 | Draft |

## Non-Functional Requirements

| Category | Linked NFR |
|----------|------------|
| [Performance](NFR.md#performance) | postInstall <= 120s, binary check < 1s |
| [Security](NFR.md#security) | npm registry only, no tweakcc without consent |
| [Reliability](NFR.md#reliability) | Partial install, network failure handling, idempotent |
| [Usability](NFR.md#usability) | Report table, warnings, clear rule instructions |
