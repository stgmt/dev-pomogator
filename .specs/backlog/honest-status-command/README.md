# Honest Status Command

Slash command `/spec-status [slug]` который делегирует verification текущей спеки **независимому sub-agent** (через Agent tool subagent_type=general-purpose) — fresh context = нет goal-completion bias главного AI который вёл implementation. Решает incident pattern 2026-05-10: AI overclaim "всё проверено" когда часть проверок blocked environmental issues.

## Ключевые идеи

- **Sub-agent delegation** — verification logic выполняется в isolated Agent context, не в main AI session (фиксирует FR-3). Main AI не может "приукрасить" output потому что sub-agent физически не видит prior conversation.
- **Evidence-backed AC classification** — каждый AC classified `✓ verified` (с file:line evidence path), `⏸ blocked` (с reason), `❌ claimed_only` (marked done но no evidence). Запрещено помечать verified без evidence.
- **Test body quality audit** — sub-agent применяет patterns из `strong-tests` + `tests-create-update` skills для каждого test file в scope; flag WEAK / FAKE-POSITIVE-RISK / STRONG с line numbers. "6/6 green" не считается достаточным если тесты — fake-positive.
- **Environmental blockers разделены** — отдельная секция в output для Docker down / WSL hang / stale YAML heartbeat — не путать с test failures (incident 2026-05-10 lesson).
- **Reuse, not rebuild** — wraps existing `.dev-pomogator/tools/specs-generator/spec-status.ts` для базовой spec progress info; добавляет sub-agent layer для AC audit + test quality + env blockers. Никаких parallel scripts (no bg-log.sh-style duplicates).

## Где лежит реализация

> **Текущая сессия — spec-only**, implementation НЕ создаётся. Paths ниже = planned для будущей implementation сессии.

- **App-код (planned)**: `.claude/skills/spec-status/SKILL.md`
- **Sub-agent template (planned)**: `.claude/skills/spec-status/references/sub-agent-prompt.md`
- **Integration tests (planned)**: `tests/e2e/spec-status.test.ts`
- **Test fixtures (planned)**: `tests/fixtures/spec-status/` (10 fixtures F-1..F-10 — mock specs, sample tests, YAML samples, docker mock)
- **BDD .feature (planned)**: `tests/features/spec-status.feature`
- **Reused**: `.dev-pomogator/tools/specs-generator/spec-status.ts` (wrap, не modify), `.claude/skills/strong-tests/`, `.claude/skills/tests-create-update/`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 4 stories (3×P1 + 1×P2) v3 form
- [USE_CASES.md](USE_CASES.md) — UC-1 AI honest pre-claim, UC-2 user explicit, UC-3 env block, UC-4 weak tests
- [RESEARCH.md](RESEARCH.md) — incident background, 5 sources, технические находки, project context, 5 risks
- [FR.md](FR.md) — FR-1..FR-10 функциональные требования
- [NFR.md](NFR.md) — Performance / Security / Reliability / Usability
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — AC-1..AC-10 EARS format с sub-criteria
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix + 35 CHK rows
- [DESIGN.md](DESIGN.md) — sub-agent architecture, data flow diagram, reuse map, 5 Key Decisions
- [TASKS.md](TASKS.md) — TDD-порядок implementation tasks (Phase 0..5)
- [FILE_CHANGES.md](FILE_CHANGES.md) — planned implementation files
- [FIXTURES.md](FIXTURES.md) — 10 fixtures для integration tests
- [honest-status-command_SCHEMA.md](honest-status-command_SCHEMA.md) — JSON schemas (context bundle, sub-agent return, full output)
- [honest-status-command.feature](honest-status-command.feature) — 4 BDD scenarios HSCMD001_01..04
- [CHANGELOG.md](CHANGELOG.md) — version history
