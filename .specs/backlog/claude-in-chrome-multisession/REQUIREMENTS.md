# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-extension-package-claude-in-chrome-multisession) | Extension package | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature3 | Verified |
| [FR-2](FR.md#fr-2-pretooluse-hook-denies-cross-session-tab-access) | PreToolUse DENY cross-session | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature1 | Verified |
| [FR-3](FR.md#fr-3-posttooluse-hook-auto-records-new-tabids) | PostToolUse auto-record | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature2 | Verified |
| [FR-4](FR.md#fr-4-skill-instructs-claude-on-protocol) | Skill | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature2 | Verified |
| [FR-5](FR.md#fr-5-manual-claimrelease-cli-helper) | claim-tab CLI | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 @feature6 | Verified |
| [FR-6](FR.md#fr-6-bootstrap-mode--orphan-auto-claim) | Orphan auto-claim | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature7 | Verified |
| [FR-7](FR.md#fr-7-hook-event-log) | JSONL event log | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature8 | Verified |
| [FR-8](FR.md#fr-8-fail-open-on-errors) | Fail-open | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature9 | Verified |
| [FR-9](FR.md#fr-9-installer-integration-via-standard-hook-flow) | Installer integration | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature4 | Verified |
| [FR-10](FR.md#fr-10-sunset-path) | Sunset | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature10 | Verified |

## Functional Requirements

- [FR-1: Extension package](FR.md#fr-1-extension-package-claude-in-chrome-multisession)
- [FR-2: PreToolUse hook DENY](FR.md#fr-2-pretooluse-hook-denies-cross-session-tab-access)
- [FR-3: PostToolUse auto-record](FR.md#fr-3-posttooluse-hook-auto-records-new-tabids)
- [FR-4: Skill](FR.md#fr-4-skill-instructs-claude-on-protocol)
- [FR-5: CLI helper](FR.md#fr-5-manual-claimrelease-cli-helper)
- [FR-6: Orphan auto-claim](FR.md#fr-6-bootstrap-mode--orphan-auto-claim)
- [FR-7: Event log](FR.md#fr-7-hook-event-log)
- [FR-8: Fail-open](FR.md#fr-8-fail-open-on-errors)
- [FR-9: Installer integration](FR.md#fr-9-installer-integration-via-standard-hook-flow)
- [FR-10: Sunset](FR.md#fr-10-sunset-path)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1)](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2)](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3)](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4)](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5)](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6)](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7)](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8)](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9)](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
- [AC-10 (FR-10)](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)

## Reuse from existing dev-pomogator code

| Source | Path | Reused for |
|--------|------|------------|
| plan-gate.ts | `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:30-40, :310` | Hook stdin parse + DENY response shape |
| writeHooksToSettingsLocal | `src/installer/settings-local.ts:145-209` | Smart-merge (NO new src/installer/ code) |
| edge-debug-port skill | `extensions/edge-debug-port/.claude/skills/edge-debug-port/SKILL.md` | SKILL.md structure template |
| chrome-devtools-mcp-mux helpers | `tests/e2e/chrome-devtools-mcp-mux-helpers.ts` | Pattern для tmpdir-based fixture tests |

## Out of Scope (v0)

- Doctor checks (CIMS-1..) — P1 follow-up.
- SessionStart auto-cleanup hook — P1.
- Cross-machine sync.
- Native Messaging Host multiplexer — deferred indefinitely.
- Modification claude-in-chrome extension itself.
