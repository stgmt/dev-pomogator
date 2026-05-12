# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-auto-prune-stale-allow-entries-в-checkpy) | Auto-prune stale allow entries в check.py | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-1), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-user-configurable-trash-classification) | User-configurable trash classification | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-2), [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-2), [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-llm-driven-classification-через-claude-code-cli-subscription) | LLM-driven classification (Claude CLI subscription) | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-3), [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-3), [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-shared-classifier-module--extended-yaml-config) | Shared classifier module + extended yaml config | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-4), [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-4), [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-out-of-scope-migration-helper-для-существующих-stale-yaml-в-downstream-repos) | Migration helper | OUT OF SCOPE | — | OUT OF SCOPE |
| [FR-6](FR.md#fr-6-out-of-scope-multi-llm-provider-support-openai-local-etc) | Multi-LLM provider support | OUT OF SCOPE | — | OUT OF SCOPE |

## Functional Requirements

- [FR-1: Auto-prune stale allow entries в check.py](FR.md#fr-1-auto-prune-stale-allow-entries-в-checkpy)
- [FR-2: User-configurable trash classification](FR.md#fr-2-user-configurable-trash-classification)
- [FR-3: LLM-driven classification через Claude Code CLI subscription](FR.md#fr-3-llm-driven-classification-через-claude-code-cli-subscription)
- [FR-4: Shared classifier module + extended yaml config](FR.md#fr-4-shared-classifier-module--extended-yaml-config)
- ~~FR-5~~ (OUT OF SCOPE)
- ~~FR-6~~ (OUT OF SCOPE)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — overhead bounds (<100ms check, <5ms classify, ~500-2000ms LLM)
- [Security](NFR.md#security) — path traversal, atomic save, no API keys, no file content в LLM prompt
- [Reliability](NFR.md#reliability) — graceful fallback, idempotent prune, format preservation, LLM isolation, cache corruption tolerance
- [Usability](NFR.md#usability) — actionable hook messages, settings migrator hint, README documentation, atomic commit workflow

## Acceptance Criteria

- [AC-1 (FR-1): auto-prune переписывает yaml + signal commit fail](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-1): auto_prune.enabled=false disables prune entirely](ACCEPTANCE_CRITERIA.md#ac-2-fr-1)
- [AC-3 (FR-1): path traversal entries skipped with WARN](ACCEPTANCE_CRITERIA.md#ac-3-fr-1)
- [AC-4 (FR-2): user trash_patterns в yaml применяется](ACCEPTANCE_CRITERIA.md#ac-4-fr-2)
- [AC-5 (FR-2): use_default_trash_patterns toggle activates plugin defaults](ACCEPTANCE_CRITERIA.md#ac-5-fr-2)
- [AC-6 (FR-2): специализированный hint для *.testsettings → SettingsMigrator](ACCEPTANCE_CRITERIA.md#ac-6-fr-2)
- [AC-7 (FR-3): hybrid mode вызывает claude -p для unknown files](ACCEPTANCE_CRITERIA.md#ac-7-fr-3)
- [AC-8 (FR-3): claude CLI отсутствие → graceful fallback unknown](ACCEPTANCE_CRITERIA.md#ac-8-fr-3)
- [AC-9 (FR-3): cache hit avoids subprocess call](ACCEPTANCE_CRITERIA.md#ac-9-fr-3)
- [AC-10 (FR-4): no hardcoded TRASH_PATTERNS в .py (кроме _FALLBACK)](ACCEPTANCE_CRITERIA.md#ac-10-fr-4)
- [AC-11 (FR-4): новые patterns в default-whitelist.yaml применяются без code changes](ACCEPTANCE_CRITERIA.md#ac-11-fr-4)
- [AC-12 (FR-4): graceful fallback при отсутствии _classifier.py](ACCEPTANCE_CRITERIA.md#ac-12-fr-4)
- [AC-13: cross-cutting verification](ACCEPTANCE_CRITERIA.md#ac-13-cross-cutting-verification)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 covered by AC-1 via @feature1 (auto-prune переписывает yaml) | FR-1, AC-1, @feature1, UC-3 | Integration test | Draft | PLUGIN004_AUTOPRUNE_01 |
| CHK-FR1-02 | FR-1 covered by AC-2 via @feature1 (disabled=false skip) | FR-1, AC-2, @feature1 | Integration test | Draft | PLUGIN004_AUTOPRUNE_02 |
| CHK-FR1-03 | FR-1 covered by AC-3 via @feature1 (path traversal protection) | FR-1, AC-3, @feature1 | Integration test | Draft | PLUGIN004_AUTOPRUNE_03; пересечение с NFR-Security-2 |
| CHK-FR2-01 | FR-2 covered by AC-4 via @feature2 (user trash_patterns) | FR-2, AC-4, @feature2, UC-1 | Integration test | Draft | PLUGIN004_TRASH_01 |
| CHK-FR2-02 | FR-2 covered by AC-5 via @feature2 (default trash toggle) | FR-2, AC-5, @feature2, UC-2 | Integration test | Draft | PLUGIN004_TRASH_02 |
| CHK-FR2-03 | FR-2 covered by AC-6 via @feature2 (specialized testsettings hint) | FR-2, AC-6, @feature2 | Integration test | Draft | PLUGIN004_TRASH_03; пересечение с NFR-Usability-2 |
| CHK-FR3-01 | FR-3 covered by AC-7 via @feature3 (hybrid mode вызывает CLI) | FR-3, AC-7, @feature3, UC-9 | Integration test | Draft | PLUGIN004_LLM_01; mock claude CLI через PATH override |
| CHK-FR3-02 | FR-3 covered by AC-8 via @feature3 (graceful fallback no claude) | FR-3, AC-8, @feature3, UC-10 | Integration test | Draft | PLUGIN004_LLM_02; пересечение с NFR-Reliability-5 |
| CHK-FR3-03 | FR-3 covered by AC-9 via @feature3 (cache hit) | FR-3, AC-9, @feature3 | Integration test | Draft | PLUGIN004_LLM_03 |
| CHK-FR4-01 | FR-4 covered by AC-10 via @feature4 (no hardcoded TRASH_PATTERNS) | FR-4, AC-10, @feature4 | Unit test | Draft | PLUGIN004_CLASS_01; grep-based верификация |
| CHK-FR4-02 | FR-4 covered by AC-11 via @feature4 (yaml-driven hot reload) | FR-4, AC-11, @feature4 | Integration test | Draft | PLUGIN004_CLASS_02 |
| CHK-FR4-03 | FR-4 covered by AC-12 via @feature4 (graceful fallback no module) | FR-4, AC-12, @feature4, UC-7 | Integration test | Draft | PLUGIN004_CLASS_03; пересечение с NFR-Reliability-1 |

## Verification Process

### How CHKs are verified

1. Each CHK is attached to at least one BDD scenario or unit test by its Traces To.
2. Status transitions only when the linked test passes (manual review records its result in Notes).

### Status lifecycle

`Draft → In Progress → Verified → Blocked` (regression takes Verified → Blocked with issue link in Notes).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or `Blocked` with issue link.

## Summary Counts

- Total CHKs: 12
- Verified: 0
- In Progress: 0
- Draft: 12
- Blocked: 0
