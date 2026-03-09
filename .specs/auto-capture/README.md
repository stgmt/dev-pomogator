# Auto-Capture Layer (PLUGIN009)

Автоматический захват learning-сигналов (T1-T6) при работе с AI-агентом и их интеграция в pipeline /suggest-rules.

## Ключевые идеи

- **Real-time capture**: UserPromptSubmit hook ловит коррекции (T2), workaround-ы (T6), повторяющиеся проблемы (T3) через regex
- **Semantic analysis**: Stop hook анализирует transcript через LLM (Haiku) для глубокого T1-T6 detection
- **Queue pipeline**: захваченные сигналы попадают в `.dev-pomogator/learnings-queue.json` и потребляются Phase -1.5 в /suggest-rules
- **Auto-dedupe**: автоматическая дедупликация queue candidates с existing rules в Phase 2.5 и Phase 6
- **Cross-platform**: работает в Claude Code (UserPromptSubmit + Stop) и Cursor (beforeSubmitPrompt + stop)

## Где лежит реализация

- **Hook scripts**: `.dev-pomogator/tools/learnings-capture/` (capture.ts, queue.ts, semantic.ts, dedupe.ts, types.ts)
- **Queue data**: `.dev-pomogator/learnings-queue.json` (runtime, per-project)
- **Commands**: `extensions/suggest-rules/{claude,cursor}/commands/reflect.md`
- **Pipeline**: `extensions/suggest-rules/{claude,cursor}/commands/suggest-rules.md` (Phase -1.5)
- **Manifest**: `extensions/suggest-rules/extension.json`

## Навигация

| Файл | Содержимое |
|------|------------|
| [USER_STORIES.md](USER_STORIES.md) | 6 user stories (auto-capture, /reflect, auto-dedupe, cross-platform, auto-suggest, approval boost) |
| [USE_CASES.md](USE_CASES.md) | 8 use cases (UC-1..UC-8) |
| [RESEARCH.md](RESEARCH.md) | Сравнение с claude-reflect, Claudeception analysis, claude-reflect-system analysis, project context |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Traceability matrix (FR/AC/BDD/Tasks) |
| [FR.md](FR.md) | 10 functional requirements (FR-1..FR-10, sub-variants FR-1a/FR-1b) + approval, fingerprint, scoring extensions |
| [NFR.md](NFR.md) | 27 non-functional requirements (Performance, Security, Reliability, Usability) |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | 10 acceptance criteria в EARS формате + расширения из claude-reflect-system |
| [DESIGN.md](DESIGN.md) | Архитектура, компоненты, TypeScript interfaces (с fingerprint), BDD infrastructure |
| [FILE_CHANGES.md](FILE_CHANGES.md) | 21 файл (5 create tools, 3 edit extension, 2 create commands, 11 create tests) |
| [TASKS.md](TASKS.md) | TDD phases (Phase 0 Red, Phases 1-6 Green, Phase 7 Refactor) |
| [CHANGELOG.md](CHANGELOG.md) | Changelog |
| [auto-capture.feature](auto-capture.feature) | 32 BDD сценария (21 testable + 11 @agent-behavior documentation) |

## Trigger Taxonomy

| Trigger | Описание | Пример |
|---------|----------|--------|
| T1 | New utility/pattern created | "I just built a helper for..." |
| T2 | User corrected AI | "no, use bun instead of npm" |
| T3 | Repeated confusion | "same issue again" |
| T4 | AI violated existing rule | Agent ignored a rule |
| T5 | Convention discovered | Found undocumented pattern |
| T6 | Workaround applied | "let's use this workaround" |

## Источники идей

- **claude-reflect** (BayramAnnakov) — двухстадийная capture+reflect система
- **Claudeception** (blader, https://github.com/blader/claudeception) — auto-suggest threshold, self-evaluation gates, description optimization, zero-friction setup
- **claude-reflect-system** (haddock-development) — fingerprint dedup, approval signals, cross-session scoring, rule backups

## Связанные правила

- `.claude/rules/atomic-config-save.md` — паттерн atomic write
- `.claude/rules/atomic-update-lock.md` — паттерн file lock
- `.claude/rules/extension-manifest-integrity.md` — manifest update rules
- `.claude/rules/pomogator/self-improving.md` — real-time T2/T3/T4/T6 hints (дополняет auto-capture)
