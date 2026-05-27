# claude-in-chrome-multisession

Multi-session safety wrapper для официального `claude-in-chrome` Chrome extension MCP. Когда 2+ Claude Code сессий гонят один Chrome browser, этот extension's PreToolUse + PostToolUse hooks изолируют tabs каждой сессии через ownership tracking — без модификации upstream extension и без потери real залогиненного browser профиля + extensions.

## Ключевые идеи

- **Workaround upstream gap.** Anthropic знает (Issues [#15173](https://github.com/anthropics/claude-code/issues/15173), [#15193](https://github.com/anthropics/claude-code/issues/15193), [#20100](https://github.com/anthropics/claude-code/issues/20100), [#26120](https://github.com/anthropics/claude-code/issues/26120), [#39637](https://github.com/anthropics/claude-code/issues/39637)). ETA fix unknown.

- **Defense-in-depth: skill (soft) + hook (hard).** Skill инструктирует Claude на protocol; hook MECHANICALLY enforce'ит. Когда LLM discipline lapses, hook compensates.

- **First-touch ownership for orphans.** Bootstrap-friendly. Hook не ломает single-session use из коробки.

- **Foundation verified end-to-end на Windows.** Урок mux — все архитектурные предположения доказаны через real Claude Code → MCP path POC до написания 10 FR.

- **No new installer code.** Используем existing `extension.json.hooks.claude` flow.

## Где лежит реализация

- **Manifest:** `extensions/claude-in-chrome-multisession/extension.json`
- **Hook:** `extensions/claude-in-chrome-multisession/tools/claude-in-chrome-multisession/cims-guard.ts`
- **CLI:** `extensions/claude-in-chrome-multisession/tools/claude-in-chrome-multisession/claim-tab.mjs`
- **Skill:** `.claude/skills/claude-in-chrome-multisession/SKILL.md`
- **Tests:** `tests/e2e/claude-in-chrome-multisession-{guard,claim,skill,installer}.test.ts`
- **Runtime state:** `~/.dev-pomogator/cdmm-sessions/<sid>/owned-tabs.json` + `~/.dev-pomogator/logs/cims-guard.log`
- **Wiring:** existing `src/installer/extensions.ts` + `src/installer/settings-local.ts` (no edits)

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 10 stories
- [USE_CASES.md](USE_CASES.md) — 8 кейсов
- [RESEARCH.md](RESEARCH.md) — Anthropic upstream context + foundation verification + Risk Assessment
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix
- [FR.md](FR.md) — 10 functional requirements
- [NFR.md](NFR.md) — Performance / Security / Reliability / Usability
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS AC-1..AC-10
- [DESIGN.md](DESIGN.md) — components + algorithms + 4 Key Decisions
- [FILE_CHANGES.md](FILE_CHANGES.md) — file inventory
- [TASKS.md](TASKS.md) — TDD-ordered tasks
- [claude-in-chrome-multisession.feature](claude-in-chrome-multisession.feature) — 10 BDD scenarios
- [claude-in-chrome-multisession_SCHEMA.md](claude-in-chrome-multisession_SCHEMA.md) — JSON shapes
- [FIXTURES.md](FIXTURES.md) — fixture pattern
- [CHANGELOG.md](CHANGELOG.md) — spec history
