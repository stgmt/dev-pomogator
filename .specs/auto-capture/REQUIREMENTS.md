# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | BDD Scenario | @featureN | Status |
|----|------|-----------|--------------|-----------|--------|
| [FR-1](FR.md#fr-1-capture-hook-script) | Capture Hook Script | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-capture-hook-script) | Scenario 1, 2 | @feature1 | Draft |
| [FR-1a](FR.md#fr-1a-regex-based-detection) | Regex-based Detection | [AC-1a](ACCEPTANCE_CRITERIA.md#ac-1a-fr-1a-regex-based-detection) | Scenario 3, 4, 5, 6, 30, 31 | @feature1a | Draft |
| [FR-1b](FR.md#fr-1b-ai-powered-semantic-detection) | AI-powered Semantic Detection | [AC-1b](ACCEPTANCE_CRITERIA.md#ac-1b-fr-1b-ai-powered-semantic-detection) | Scenario 7, 8 | @feature1b | Draft |
| [FR-2](FR.md#fr-2-queue-schema) | Queue Schema | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-queue-schema) | Scenario 9 | @feature2 | Draft |
| [FR-3](FR.md#fr-3-atomic-queue-operations) | Atomic Queue Operations | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-atomic-queue-operations) | Scenario 10, 11 | @feature3 | Draft |
| [FR-4](FR.md#fr-4-suggest-rules-phase--15-integration) | Phase -1.5 Integration | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-suggest-rules-phase--15-integration) | Scenario 12, 13, 32 | @feature4 | Draft |
| [FR-5](FR.md#fr-5-auto-dedupe-in-phase-25-feature3) | Auto-Dedupe | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-auto-dedupe-in-phase-25-feature3) | Scenario 14, 15 | @feature3 | Draft |
| [FR-6](FR.md#fr-6-reflect-command) | /reflect Command | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-reflect-command) | Scenario 16, 17, 18 | @feature2 | Draft |
| [FR-7](FR.md#fr-7-auto-dedupe-rules-in-phase-6-feature3) | Auto-Dedupe Rules Phase 6 | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-auto-dedupe-rules-in-phase-6-feature3) | Scenario 19, 20 | @feature3 | Draft |
| [FR-8](FR.md#fr-8-extension-manifest-update) | Extension Manifest | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-extension-manifest-update) | Scenario 21, 22 | @feature4 | Draft |
| [FR-9](FR.md#fr-9-installation-verification) | Installation Verification | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-installation-verification) | Scenario 23 | @feature4 | Draft |
| [FR-10](FR.md#fr-10-auto-suggest-threshold-feature5) | Auto-Suggest Threshold | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-auto-suggest-threshold-feature5) | Scenario 24, 25 | @feature5 | Draft |
| — | Approval Boost (FR-1a ext) | AC-1a (ext) | Scenario 28, 29 | @feature6 | Draft |

## Functional Requirements

- [FR-1: Capture Hook Script](FR.md#fr-1-capture-hook-script) @feature1
- [FR-1a: Regex-based Detection](FR.md#fr-1a-regex-based-detection) @feature1a — включает approval patterns (claude-reflect-system)
- [FR-1b: AI-powered Semantic Detection](FR.md#fr-1b-ai-powered-semantic-detection) @feature1b
- [FR-2: Queue Schema](FR.md#fr-2-queue-schema) @feature2 — включает fingerprint, count, lastSeen (claude-reflect-system)
- [FR-3: Atomic Queue Operations](FR.md#fr-3-atomic-queue-operations) @feature3 — включает fingerprint dedup (claude-reflect-system)
- [FR-4: /suggest-rules Phase -1.5](FR.md#fr-4-suggest-rules-phase--15-integration) @feature4 — включает scoring bonuses (claude-reflect-system)
- [FR-5: Auto-Dedupe](FR.md#fr-5-auto-dedupe-in-phase-25-feature3) @feature3
- [FR-6: /reflect Command](FR.md#fr-6-reflect-command) @feature2
- [FR-7: Auto-Dedupe Rules Phase 6](FR.md#fr-7-auto-dedupe-rules-in-phase-6-feature3) @feature3
- [FR-8: Extension Manifest](FR.md#fr-8-extension-manifest-update) @feature4
- [FR-9: Installation Verification](FR.md#fr-9-installation-verification) @feature4
- [FR-10: Auto-Suggest Threshold](FR.md#fr-10-auto-suggest-threshold-feature5) @feature5

## Non-Functional Requirements

- [Performance](NFR.md#performance) (NFR-P1..P7)
- [Security](NFR.md#security) (NFR-S1..S5)
- [Reliability](NFR.md#reliability) (NFR-R1..R8)
- [Usability](NFR.md#usability) (NFR-U1..U7)

## Acceptance Criteria

- [AC-1 (FR-1): Capture Hook Script](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-capture-hook-script)
- [AC-1a (FR-1a): Regex-based Detection](ACCEPTANCE_CRITERIA.md#ac-1a-fr-1a-regex-based-detection)
- [AC-1b (FR-1b): AI-powered Semantic Detection](ACCEPTANCE_CRITERIA.md#ac-1b-fr-1b-ai-powered-semantic-detection)
- [AC-2 (FR-2): Queue Schema](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-queue-schema)
- [AC-3 (FR-3): Atomic Queue Operations](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-atomic-queue-operations)
- [AC-4 (FR-4): Phase -1.5 Integration](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-suggest-rules-phase--15-integration)
- [AC-5 (FR-5): Auto-Dedupe](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-auto-dedupe-in-phase-25-feature3)
- [AC-6 (FR-6): /reflect Command](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-reflect-command)
- [AC-7 (FR-7): Auto-Dedupe Rules Phase 6](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-auto-dedupe-rules-in-phase-6-feature3)
- [AC-8 (FR-8): Extension Manifest](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-extension-manifest-update)
- [AC-9 (FR-9): Installation Verification](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-installation-verification)
- [AC-10 (FR-10): Auto-Suggest Threshold](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-auto-suggest-threshold-feature5)
