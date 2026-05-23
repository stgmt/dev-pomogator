# Changelog

All notable changes to this feature will be documented in this file.

## [0.1.0] - 2026-05-11

### Added — Spec-only artifacts (no implementation)

- **USER_STORIES.md**: 4 user stories v3 form — sub-agent delegation (P1), auto-detect active spec (P1), fake-positive test audit (P1), environmental blockers разделение (P2)
- **USE_CASES.md**: UC-1 AI honest pre-claim check, UC-2 user explicit /spec-status <slug>, UC-3 environmental block detection, UC-4 sub-agent flags weak tests
- **RESEARCH.md**: incident 2026-05-10 background, 5 sources (incident transcript, strong-tests skill, tests-create-update skill, yaml_writer.ts, spec-status.ts, Anthropic Agent docs), технические находки про reuse + sub-agent context + test quality detection + YAML staleness, project context table (4 rules + 5 patterns + BDD framework vitest), 5 risks с mitigation
- **FR.md**: FR-1..FR-10 функциональные требования (invocation, autodetect, sub-agent delegation, AC evidence classification, test recency, test quality, git state, env blockers, output format, reuse)
- **NFR.md**: Performance (sub-agent timeout 60s, end-to-end ≤90s), Security (credentials filter, path traversal protection, no external network), Reliability (fail-open, idempotent, graceful degradation), Usability (emoji-coded output, structured JSON + markdown render)
- **ACCEPTANCE_CRITERIA.md**: AC-1..AC-10 EARS format с 28 sub-criteria (AC-1.1, AC-2.1 etc.)
- **REQUIREMENTS.md**: traceability matrix + 35 CHK rows (CHK-FR1-01..CHK-FR10-03) с verification methods
- **DESIGN.md**: sub-agent architecture, data flow ASCII diagram, reuse map, algorithm pseudocode, sub-agent prompt structure draft, 5 Key Decisions (sub-agent delegation, reuse spec-status.ts, dual output format JSON+markdown, credentials filter, read-only skill)
- **honest-status-command.feature**: 4 BDD scenarios HSCMD001_01..04 (1:1 с UC-1..UC-4), tagged @feature1..@feature4
- **FIXTURES.md**: 10 fixtures F-1..F-10 (3 mock specs, 3 sample tests, 3 YAML samples, 1 docker mock) с detailed setup/teardown
- **FILE_CHANGES.md**: planned implementation files (skill SKILL.md, sub-agent prompt template, integration test, 10 fixture files, BDD .feature mirror)
- **TASKS.md**: TDD-порядок tasks Phase 0 (BDD Red) → Phase 1 (skill skeleton) → Phase 2 (sub-agent) → Phase 3 (AC evidence + test quality) → Phase 4 (recency + env blockers + git) → Phase 5 (output renderer + refactor + verify)
- **honest-status-command_SCHEMA.md**: 3 JSON schemas (context bundle ≤4KB, sub-agent return JSON, full skill output)
- **README.md**: TL;DR overview, 5 ключевые идеи (sub-agent delegation, evidence-backed AC, test quality audit, env blockers separation, reuse-not-rebuild), planned implementation paths

### Out of Scope для v0.1.0

- Implementation `.claude/skills/spec-status/SKILL.md` — отдельная сессия после spec approval
- Sub-agent prompt template файл — implementation
- Integration tests + fixtures — implementation
- BDD .feature mirror в tests/features/ — implementation
- Verification log persistent storage (`.dev-pomogator/.verification-log.jsonl`) — future feature, отдельный spec
- WSL fallback documentation — environment-level recommendation, не код
