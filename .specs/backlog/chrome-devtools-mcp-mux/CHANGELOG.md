# Changelog

All notable changes to this feature spec will be documented in this file.

## [0.2.0] - 2026-04-28

### Added
- **FR-9: First-run browser preference prompt.** Skill triggers a 5-option conversational prompt (Edge / Chrome / bundled-isolated Chromium / custom path / don't-ask-again) when installer's auto-injected default doesn't match user preference. Choice persists in `~/.dev-pomogator/.cdmm-browser-choice.json`. New helper script `configure-browser.mjs` performs atomic `.mcp.json` update + marker write.
- New AC-9 + two new BDD scenarios extending the suite to 13 total (PLUGIN017_12, PLUGIN017_13).
- New US-7 (developer with non-default browser preferences).
- New UC-8 (first-run browser preference prompt) with concrete dialogue example + Chrome auto-detect fallback edge case.
- BrowserChoiceMarker JSON schema in chrome-devtools-mcp-mux_SCHEMA.md.

### Changed
- DESIGN.md: added "Алгоритм first-run browser prompt" section + Browser config helper component + browser choice marker file.

### Fixed
- N/A (new feature, no regressions).

### Motivation
User feedback: "это не сломается у юзеров других? мб добавить микроскил который будет спрашивать у юзера какой нужен ему браузер? мб другим пользуется типа хрмом, или вообще предпочитает пустой браузер чтоб изолированно было каждый раз." Auto-inject Edge default in installer is good for out-of-box DX but silently overrides legitimate user preferences (Chrome users / isolated-session users). Skill-driven conversational prompt resolves this without making install opaque.

## [0.1.0] - 2026-04-28

### Added
- Initial 4-phase spec scaffold для chrome-devtools-mcp-mux extension.
- Discovery (Phase 1): 6 user stories (developer parallel sessions, maintainer, AI agent, end user, claude-in-chrome conflict, cleanup); 7 use cases (happy path, install, conflict, skill direction, daemon outlive, doctor, uninstall); RESEARCH.md с npm verification (`chrome-devtools-mcp-mux@0.2.2` published 2026-04-22, Apache-2.0, by ochen1, single dep `chrome-devtools-mcp@0.22.0`), three-layer architecture (shim/daemon/Chromium), Risk Assessment (R1..R7), Project Context & Constraints.
- Project Context (Phase 1.5): BDD framework detection — vitest 4.1.0 + custom 1:1 `.feature` mapping per `extension-test-quality` rule (override automatic detector которое ошибочно ловит csharp/Reqnroll через fixture).
- Requirements + Design (Phase 2): 8 FR (extension package, MCP server registration, skill DEFAULT, doctor checks, conflict detection, uninstall, pinned version, Windows smoke test), 8 AC в EARS format, NFR (Performance/Security/Reliability/Usability), DESIGN с 4 Key Decisions (KD-1 npx vs npm i -g, KD-2 skill DEFAULT not alternative, KD-3 project-scoped .mcp.json, KD-4 interactive conflict prompt), 11 initial BDD scenarios `PLUGIN017_01..11` (extended to 13 in v0.2.0), FILE_CHANGES для 23 файлов, SCHEMA с 5 JSON shapes, FIXTURES с 3 artifacts.
- Finalization (Phase 3): TASKS.md TDD-ordered с 6 phases (Phase 0 Red → Phases 1-5 Green → Phase 6 Refactor); README.md summary.

### Changed
- US-3 + UC-4 + RESEARCH conclusion #6 переписаны после user feedback: skill направляет Claude к mux как **DEFAULT** (priority-1), не как один из равных вариантов. Vanilla `chrome-devtools-mcp` запрещён при наличии mux в `.mcp.json` (unsafe в multi-session). Fallback paths (`claude-in-chrome`, `edge-debug-port`) — opt-out для узких hard-OUT scenarios.

### Fixed
- N/A (initial spec).
