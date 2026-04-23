# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | Linked UC | @featureN | Status |
|----|------|-----------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-auto-trigger-phase-0-при-первом-create-spec-в-репо-feature1) | Auto-trigger Phase 0 | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-auto-trigger-phase-0-feature1) | [UC-1](USE_CASES.md#uc-1-первый-create-spec-в-новом-репо--auto-trigger-phase-0-feature1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-typed-artifact-specsonboardingjson-ai-first-schema-feature2-feature10) | .onboarding.json typed schema | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-onboardingjson-schema-feature2-feature10) | [UC-1](USE_CASES.md#uc-1-первый-create-spec-в-новом-репо--auto-trigger-phase-0-feature1), [UC-2](USE_CASES.md#uc-2-последующий-create-spec-с-валидным-cache-feature4) | @feature2, @feature10 | Draft |
| [FR-3](FR.md#fr-3-pretooluse-hook-compiled-из-commands-блока-feature3) | PreToolUse hook compile | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-pretooluse-hook-compile-feature3) | [UC-9](USE_CASES.md#uc-9-рендеринг-в-dual-artifact-после-text-gate-feature15) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-git-sha-cache-invalidation-feature4) | Git-SHA cache invalidation | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-git-sha-cache-invalidation-feature4) | [UC-2](USE_CASES.md#uc-2-последующий-create-spec-с-валидным-cache-feature4), [UC-3](USE_CASES.md#uc-3-git-sha-изменился--prompt-refresh-feature4), [UC-4](USE_CASES.md#uc-4-manual-refresh-через---refresh-onboarding-feature4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-baseline-test-run-через-run-tests-feature5) | Baseline test run через /run-tests | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-baseline-test-run-feature5) | [UC-7](USE_CASES.md#uc-7-repo-без-тестов-feature5), [UC-13](USE_CASES.md#uc-13-partial-onboarding-skip-baseline-tests-feature5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-text-gate-перед-phase-1-discovery-feature6) | Text gate | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-text-gate-feature6) | [UC-8](USE_CASES.md#uc-8-text-gate-не-пройден--итеративное-уточнение-feature6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-parallel-explore-subagents-для-recon-feature7) | Parallel Explore subagents | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-parallel-subagents-feature7) | [UC-11](USE_CASES.md#uc-11-scratch-file-при-крупном-repo-feature14) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-archetype-triage-2-min-перед-deep-scan-feature8) | Archetype triage | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-archetype-triage-feature8) | [UC-12](USE_CASES.md#uc-12-archetype-routing--frontend-spa-feature8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-prose-artifact-specsonboardingmd-6-секционный-отчёт-feature9) | .onboarding.md 6-section report | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-onboardingmd-prose-report-feature9) | US-11 (support) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-ai-specific-секции-обязательны-не-только-generic-metadata-feature10) | AI-specific sections mandatory | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-ai-specific-sections-mandatory-feature10) | US-10 (primary) | @feature10 | Draft |
| [FR-11](FR.md#fr-11-developer-onboarding-checklist-из-onboardingmd-feature11) | Developer onboarding checklist | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-developer-onboarding-checklist-feature11) | US-11 (primary) | @feature11 | Draft |
| [FR-12](FR.md#fr-12-coexistence-с-anthropic-init-без-конфликта-feature12) | Coexistence с /init | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-coexistence-с-init-feature12) | [UC-10](USE_CASES.md#uc-10-coexistence-с-anthropic-init-feature12) | @feature12 | Draft |
| [FR-13](FR.md#fr-13-delivered-as-dev-pomogator-extension-feature13) | Delivered as extension | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-delivered-as-extension-feature13) | [UC-5](USE_CASES.md#uc-5-target-repo-не-имеет-установленного-dev-pomogator-feature13) | @feature13 | Draft |
| [FR-14](FR.md#fr-14-scratch-file-для-крупных-репо-feature14) | Scratch file | [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14-scratch-file-feature14) | [UC-11](USE_CASES.md#uc-11-scratch-file-при-крупном-repo-feature14) | @feature14 | Draft |
| [FR-15](FR.md#fr-15-dual-render-из-single-source-of-truth-feature15) | Dual-render single source | [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15-dual-render-feature15) | [UC-9](USE_CASES.md#uc-9-рендеринг-в-dual-artifact-после-text-gate-feature15) | @feature15 | Draft |
| [FR-16](FR.md#fr-16-manual-refresh-через---refresh-onboarding-feature4) | Manual refresh flag | [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16-manual-refresh-feature4) | [UC-4](USE_CASES.md#uc-4-manual-refresh-через---refresh-onboarding-feature4) | @feature4 | Draft |
| [FR-17](FR.md#fr-17-respect-cursorignore--aiderignore--gitignore-feature2) | Respect ignore files | [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17-ignore-files-respect-feature2) | [EC-3](USE_CASES.md#ec-3-cursorignore--aiderignore-в-репо) | @feature2 | Draft |
| [FR-18](FR.md#fr-18-commands-via-skill-reference-не-hardcode-feature3-feature15) | Commands via skill reference | [AC-18](ACCEPTANCE_CRITERIA.md#ac-18-fr-18-commands-via-skill-reference-feature3-feature15) | [UC-9](USE_CASES.md#uc-9-рендеринг-в-dual-artifact-после-text-gate-feature15) | @feature3, @feature15 | Draft |
| [FR-19](FR.md#fr-19-managed-files-tracking-через-sha-256) | SHA-256 managed tracking | [AC-19](ACCEPTANCE_CRITERIA.md#ac-19-fr-19-sha-256-managed-tracking) | — (infrastructure) | — | Draft |
| [FR-20](FR.md#fr-20-json-schema-validation-onboardingjson) | JSON Schema validation | [AC-20](ACCEPTANCE_CRITERIA.md#ac-20-fr-20-json-schema-validation) | — (infrastructure) | — | Draft |

## Functional Requirements

- [FR-1: Auto-trigger Phase 0 при первом /create-spec в репо](FR.md#fr-1-auto-trigger-phase-0-при-первом-create-spec-в-репо-feature1)
- [FR-2: Typed artifact .onboarding.json (AI-first schema)](FR.md#fr-2-typed-artifact-specsonboardingjson-ai-first-schema-feature2-feature10)
- [FR-3: PreToolUse hook compiled из commands блока](FR.md#fr-3-pretooluse-hook-compiled-из-commands-блока-feature3)
- [FR-4: Git-SHA cache invalidation](FR.md#fr-4-git-sha-cache-invalidation-feature4)
- [FR-5: Baseline test run через /run-tests](FR.md#fr-5-baseline-test-run-через-run-tests-feature5)
- [FR-6: Text gate перед Phase 1 Discovery](FR.md#fr-6-text-gate-перед-phase-1-discovery-feature6)
- [FR-7: Parallel Explore subagents для recon](FR.md#fr-7-parallel-explore-subagents-для-recon-feature7)
- [FR-8: Archetype triage (2-min) перед deep scan](FR.md#fr-8-archetype-triage-2-min-перед-deep-scan-feature8)
- [FR-9: Prose artifact .onboarding.md](FR.md#fr-9-prose-artifact-specsonboardingmd-6-секционный-отчёт-feature9)
- [FR-10: AI-specific секции обязательны](FR.md#fr-10-ai-specific-секции-обязательны-не-только-generic-metadata-feature10)
- [FR-11: Developer onboarding checklist](FR.md#fr-11-developer-onboarding-checklist-из-onboardingmd-feature11)
- [FR-12: Coexistence с Anthropic /init](FR.md#fr-12-coexistence-с-anthropic-init-без-конфликта-feature12)
- [FR-13: Delivered as dev-pomogator extension](FR.md#fr-13-delivered-as-dev-pomogator-extension-feature13)
- [FR-14: Scratch file для крупных репо](FR.md#fr-14-scratch-file-для-крупных-репо-feature14)
- [FR-15: Dual-render из single source of truth](FR.md#fr-15-dual-render-из-single-source-of-truth-feature15)
- [FR-16: Manual refresh через --refresh-onboarding](FR.md#fr-16-manual-refresh-через---refresh-onboarding-feature4)
- [FR-17: Respect .cursorignore / .aiderignore / .gitignore](FR.md#fr-17-respect-cursorignore--aiderignore--gitignore-feature2)
- [FR-18: Commands via skill-reference, не hardcode](FR.md#fr-18-commands-via-skill-reference-не-hardcode-feature3-feature15)
- [FR-19: Managed files tracking через SHA-256](FR.md#fr-19-managed-files-tracking-через-sha-256)
- [FR-20: JSON Schema validation](FR.md#fr-20-json-schema-validation-onboardingjson)
- [FR-N: Tree-sitter PageRank repomap](FR.md#fr-n-full-tree-sitter-pagerank-repomap-aider-style--out-of-scope) — OUT OF SCOPE

## Non-Functional Requirements

- [Performance (NFR-P1..P6)](NFR.md#performance)
- [Security (NFR-S1..S5)](NFR.md#security)
- [Reliability (NFR-R1..R7)](NFR.md#reliability)
- [Usability (NFR-U1..U5)](NFR.md#usability)
- [Maintainability (NFR-M1..M4)](NFR.md#maintainability)
- [Observability (NFR-O1..O3)](NFR.md#observability)
- [Compatibility (NFR-C1..C4)](NFR.md#compatibility)
- [Assumptions (A-1..A-5)](NFR.md#assumptions)
- [Risks (Risk-1..Risk-5)](NFR.md#risks)
- [Out of Scope (OoS-1..OoS-6)](NFR.md#out-of-scope)

## Acceptance Criteria

- [AC-1 (FR-1): Auto-trigger Phase 0](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-auto-trigger-phase-0-feature1)
- [AC-2 (FR-2): .onboarding.json schema](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-onboardingjson-schema-feature2-feature10)
- [AC-3 (FR-3): PreToolUse hook compile](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-pretooluse-hook-compile-feature3)
- [AC-4 (FR-4): Git-SHA cache invalidation](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-git-sha-cache-invalidation-feature4)
- [AC-5 (FR-5): Baseline test run](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-baseline-test-run-feature5)
- [AC-6 (FR-6): Text gate](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-text-gate-feature6)
- [AC-7 (FR-7): Parallel subagents](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-parallel-subagents-feature7)
- [AC-8 (FR-8): Archetype triage](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-archetype-triage-feature8)
- [AC-9 (FR-9): .onboarding.md prose report](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-onboardingmd-prose-report-feature9)
- [AC-10 (FR-10): AI-specific sections mandatory](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-ai-specific-sections-mandatory-feature10)
- [AC-11 (FR-11): Developer onboarding checklist](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-developer-onboarding-checklist-feature11)
- [AC-12 (FR-12): Coexistence с /init](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-coexistence-с-init-feature12)
- [AC-13 (FR-13): Delivered as extension](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-delivered-as-extension-feature13)
- [AC-14 (FR-14): Scratch file](ACCEPTANCE_CRITERIA.md#ac-14-fr-14-scratch-file-feature14)
- [AC-15 (FR-15): Dual-render](ACCEPTANCE_CRITERIA.md#ac-15-fr-15-dual-render-feature15)
- [AC-16 (FR-16): Manual refresh](ACCEPTANCE_CRITERIA.md#ac-16-fr-16-manual-refresh-feature4)
- [AC-17 (FR-17): Ignore files respect](ACCEPTANCE_CRITERIA.md#ac-17-fr-17-ignore-files-respect-feature2)
- [AC-18 (FR-18): Commands via skill reference](ACCEPTANCE_CRITERIA.md#ac-18-fr-18-commands-via-skill-reference-feature3-feature15)
- [AC-19 (FR-19): SHA-256 managed tracking](ACCEPTANCE_CRITERIA.md#ac-19-fr-19-sha-256-managed-tracking)
- [AC-20 (FR-20): JSON Schema validation](ACCEPTANCE_CRITERIA.md#ac-20-fr-20-json-schema-validation)
