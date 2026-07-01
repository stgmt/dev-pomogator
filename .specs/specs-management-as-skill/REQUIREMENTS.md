# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1) | Skill structure with progressive disclosure | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-reference-file-naming-convention-phasenmdescriptive-feature2) | Reference file naming `phaseN[.M]_descriptive` | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3) | Phase 3+ Audit categories split | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-hard-cutover-migration-via-installer-feature4) | Hard cutover migration via installer | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-research-workflow-extracted-as-standalone-skill-and-invoked-by-create-spec-feature5) | research-workflow extracted as standalone skill | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4) | Source rule files removed atomically | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature4) | @feature4 | Draft |
| [FR-7](FR.md#fr-7-extensionjson-manifest-updated-atomically-feature4) | extension.json manifest updated atomically | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature4) | @feature4 | Draft |
| [FR-8](FR.md#fr-8-claudemd-glossary-synced-with-new-skill-layout-feature4) | CLAUDE.md glossary synced | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-feature4) | @feature4 | Draft |
| [FR-9](FR.md#fr-9-skill-description-preserves-all-trigger-phrases-feature5) | Skill description preserves trigger phrases | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-feature5) | @feature5 | Draft |
| [FR-10](FR.md#fr-10-allowed-tools-covers-full-workflow-feature5) | allowed-tools covers full workflow | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-feature5) | @feature5 | Draft |
| [FR-11](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4) | specs-validation hook unaffected | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-feature4) | @feature4 | Draft |
| [FR-12](FR.md#fr-12-cursor-support-out-of-scope) | Cursor support | — | — | OUT OF SCOPE |
| [FR-13](FR.md#fr-13-token-efficiency-floor-for-non-spec-sessions-feature1) | Token efficiency floor non-spec sessions | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-feature1) | @feature1 | Draft |

## Functional Requirements

- [FR-1: Skill structure with progressive disclosure](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1)
- [FR-2: Reference file naming convention](FR.md#fr-2-reference-file-naming-convention-phasenmdescriptive-feature2)
- [FR-3: Phase 3+ Audit categories split](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3)
- [FR-4: Hard cutover migration via installer](FR.md#fr-4-hard-cutover-migration-via-installer-feature4)
- [FR-5: research-workflow extracted as standalone skill](FR.md#fr-5-research-workflow-extracted-as-standalone-skill-and-invoked-by-create-spec-feature5)
- [FR-6: Source rule files removed atomically](FR.md#fr-6-source-rule-files-removed-atomically-feature4)
- [FR-7: extension.json manifest updated atomically](FR.md#fr-7-extensionjson-manifest-updated-atomically-feature4)
- [FR-8: CLAUDE.md glossary synced](FR.md#fr-8-claudemd-glossary-synced-with-new-skill-layout-feature4)
- [FR-9: Skill description preserves trigger phrases](FR.md#fr-9-skill-description-preserves-all-trigger-phrases-feature5)
- [FR-10: allowed-tools covers full workflow](FR.md#fr-10-allowed-tools-covers-full-workflow-feature5)
- [FR-11: specs-validation hook unaffected](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4)
- [FR-12: Cursor support — OUT OF SCOPE](FR.md#fr-12-cursor-support-out-of-scope)
- [FR-13: Token efficiency floor non-spec sessions](FR.md#fr-13-token-efficiency-floor-for-non-spec-sessions-feature1)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — NFR-P1..P5 (line limits, token budgets)
- [Security](NFR.md#security) — NFR-S1..S3 (no secrets, frontmatter constraints)
- [Reliability](NFR.md#reliability) — NFR-R1..R5 (atomic migration, hook stability, trigger reliability)
- [Usability](NFR.md#usability) — NFR-U1..U5 (naming convention, navigation, third-person description)
- [Maintainability](NFR.md#maintainability) — NFR-M1..M3 (linters for naming, references, future extensibility)
- [Migration](NFR.md#migration) — NFR-MG1..MG3 (atomic commit, version bump, user-overrides preserved)

## Acceptance Criteria

- [AC-1 (FR-1): Skill structure](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)
- [AC-2 (FR-2): Naming convention](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2)
- [AC-3 (FR-3): Audit category files](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature3)
- [AC-4 (FR-4): Hard cutover](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature4)
- [AC-5 (FR-5): research-workflow skill](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature5)
- [AC-6 (FR-6): Source files removed](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature4)
- [AC-7 (FR-7): Manifest updated](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature4)
- [AC-8 (FR-8): CLAUDE.md glossary](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-feature4)
- [AC-9 (FR-9): Description preserves triggers](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-feature5)
- [AC-10 (FR-10): allowed-tools complete](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-feature5)
- [AC-11 (FR-11): Hook unaffected](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-feature4)
- [AC-13 (FR-13): Token efficiency floor](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-feature1)

## Coverage Notes

- **FR-12 (Cursor)** is OUT OF SCOPE per user decision; no AC required.
- **AC-12 omitted** intentionally to keep AC numbers aligned with FR numbers (gap = OUT OF SCOPE marker).
- **@featureN coverage:** 5 features (@feature1..@feature5) span all in-scope FRs. Mapping:
  - @feature1: FR-1, FR-13 (skill structure + token budget)
  - @feature2: FR-2 (naming convention)
  - @feature3: FR-3 (audit category split)
  - @feature4: FR-4, FR-6, FR-7, FR-8, FR-11 (migration mechanics)
  - @feature5: FR-5, FR-9, FR-10 (research-workflow extraction + skill metadata)
