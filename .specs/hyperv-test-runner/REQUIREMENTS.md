# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-hyper-v-vm-lifecycle-scripts) | Hyper-V VM Lifecycle Scripts | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-snapshot-versioning) | Snapshot Versioning | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-gui-access-via-vmconnect-enhanced-session-mode) | GUI Access (VMConnect Enhanced Session) | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-native-rdp-access-via-mstsc) | Native RDP Access (mstsc) | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-test-fixture-mounting-in-vm) | Test Fixture Mounting | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-ai-agent-skill-hyperv-test-runner) | AI Agent Skill `hyperv-test-runner` | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-visual-verification-via-screenshots) | Visual Verification (Screenshots) | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-test-scenario-catalog) | Test Scenario Catalog | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-run-artifacts-logging) | Run Artifacts Logging | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-catalog-extension-workflow) | Catalog Extension Workflow | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature10 | Draft |
| [FR-11](FR.md#fr-11-documentation-includes-evolution-roadmap) | Evolution Roadmap Documentation | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11) | @feature11 | Draft |
| [FR-12](FR.md#fr-12-vm-cleanup) | VM Cleanup | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12) | @feature12 | Draft |

## Functional Requirements

- [FR-1: Hyper-V VM Lifecycle Scripts](FR.md#fr-1-hyper-v-vm-lifecycle-scripts)
- [FR-2: Snapshot Versioning](FR.md#fr-2-snapshot-versioning)
- [FR-3: GUI Access via VMConnect Enhanced Session Mode](FR.md#fr-3-gui-access-via-vmconnect-enhanced-session-mode)
- [FR-4: Native RDP Access via mstsc](FR.md#fr-4-native-rdp-access-via-mstsc)
- [FR-5: Test Fixture Mounting in VM](FR.md#fr-5-test-fixture-mounting-in-vm)
- [FR-6: AI Agent Skill `hyperv-test-runner`](FR.md#fr-6-ai-agent-skill-hyperv-test-runner)
- [FR-7: Visual Verification via Screenshots](FR.md#fr-7-visual-verification-via-screenshots)
- [FR-8: Test Scenario Catalog](FR.md#fr-8-test-scenario-catalog)
- [FR-9: Run Artifacts Logging](FR.md#fr-9-run-artifacts-logging)
- [FR-10: Catalog Extension Workflow](FR.md#fr-10-catalog-extension-workflow)
- [FR-11: Documentation Includes Evolution Roadmap](FR.md#fr-11-documentation-includes-evolution-roadmap)
- [FR-12: VM Cleanup](FR.md#fr-12-vm-cleanup)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Hyper-V VM Lifecycle Scripts](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): Snapshot Versioning](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): GUI Access](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Native RDP](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): Test Fixture Mounting](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): AI Agent Skill](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): Visual Verification](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8): Test Scenario Catalog](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9): Run Artifacts Logging](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
- [AC-10 (FR-10): Catalog Extension Workflow](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
- [AC-11 (FR-11): Roadmap Documentation](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
- [AC-12 (FR-12): VM Cleanup](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)

## Use Cases

- [UC-1: Initial VM Setup](USE_CASES.md#uc-1-initial-vm-setup-human-one-time)
- [UC-2: Daily revert + launch](USE_CASES.md#uc-2-daily-revert-launch-human-or-ai-agent)
- [UC-3: AI agent runs scenario from catalog](USE_CASES.md#uc-3-ai-agent-runs-scenario-from-catalog-full-automation)
- [UC-4: AI visual verification of GUI state](USE_CASES.md#uc-4-ai-visual-verification-of-gui-state)
- [UC-5: AI extends test catalog after new feature](USE_CASES.md#uc-5-ai-extends-test-catalog-after-new-feature)
- [UC-6: Human investigates failure](USE_CASES.md#uc-6-human-investigates-failure-manual-override)
- [UC-7: Multi-baseline regression matrix](USE_CASES.md#uc-7-multi-baseline-regression-matrix)
- [UC-8: Cleanup](USE_CASES.md#uc-8-cleanup-human-rare)
