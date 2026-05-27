# Architecture Decision Builder

Subskill для dev-pomogator: для greenfield-проектов (PRD-маркдауны без кода) генерирует multi-variant tech-stack decision артефакты по одной оси за раз. Каждая ось → markdown + self-contained HTML (открывается в браузере) с ≥3 вариантами, явно выделенной рекомендацией и итеративным выбором через AskUserQuestion.

## Ключевые идеи

- **Multi-axis итеративно** — реальный greenfield = 4-6 связанных decision-axes (email/LLM/hosting/compliance); skill обрабатывает по одной за раз, отдельный файл на ось + INDEX
- **HTML-визуализация** — recommended-card pinned top, цветовая кодировка ✅/◐/❌, открывается в браузере (markdown читать тяжело)
- **Формат-синтез** — Y-statement (Zimmermann) + Good/Neutral/Bad (MADR v4) + When-NOT-to-choose (KEP Non-Goals) + maturity ring (Tech Radar) + real-world precedent (live octocode grep — наша новизна)
- **Anti-bias guardrails** — randomized variant order (position bias), ≥1 вариант вне дефолта (popular-stack bias), live-fetch версий + качественные cost-чипы
- **Два режима** — standalone auto-trigger + create-spec Phase 1.75 (stateless RPC через QUEUE.json, loop в create-spec)

## Где лежит реализация

- **Skill**: `.claude/skills/architecture-decision-builder/SKILL.md` + `references/`
- **Helpers**: `tools/specs-generator/architecture-decision/*.ts`
- **Rules**: `.claude/rules/specs-workflow/architecture-decision/`
- **create-spec integration**: `.claude/skills/create-spec/references/phase1.75_architecture-decisions.md`
- **Mirror reference**: `.claude/skills/variant-matrix-build/`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
