# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Спецификация auto-capture layer для suggest-rules extension
- 10 функциональных требований (FR-1 через FR-10) с sub-variants (FR-1a, FR-1b)
- 26 нефункциональных требований (Performance, Security, Reliability, Usability)
- 10 acceptance criteria в EARS формате
- 27 BDD сценариев в Gherkin
- Архитектурный дизайн: 6 компонентов (capture.ts, queue.ts, semantic.ts, dedupe.ts, reflect.md, Phase -1.5)
- Queue schema v1 с TypeScript interfaces
- BDD Test Infrastructure: 7 fixtures, 2 hooks, cleanup strategy
- FR-10: Auto-Suggest Threshold — уведомление при N pending entries (Claudeception)
- Self-evaluation gates в FR-1b — 3 binary вопроса для LLM detection (Claudeception)
- Description optimization hint в FR-4 — retrieval-optimized descriptions (Claudeception)
- NFR-U7: Standalone capture без внешних зависимостей (Claudeception)
- NFR-P7: Threshold check < 50ms
- 4 новых BDD сценария (#24-#27)
- US-5, UC-7 для auto-suggest notification
- Claudeception comparative analysis в RESEARCH.md

### Added (claude-reflect-system gaps)
- Approval patterns в FR-1a — confidence booster для existing pending entries (claude-reflect-system)
- Signal fingerprinting (SHA-256[:16]) в FR-2/FR-3 — cross-session dedup с count tracking (claude-reflect-system)
- Scoring bonuses в FR-4 — ACCUMULATED_EVIDENCE (+15), CROSS_SESSION_REPEAT (+20) (claude-reflect-system)
- NFR-R8: Rule backup before Phase 6 merge (claude-reflect-system)
- US-6, UC-8 для approval boost flow
- 5 новых BDD сценариев (#28-#32)
- claude-reflect-system comparative analysis в RESEARCH.md

## [0.1.0] - 2026-03-08

### Added
- Initial spec structure scaffolded via `scaffold-spec.ps1`
- Research: сравнение с claude-reflect, project context analysis
- 4 user stories, 6 use cases
