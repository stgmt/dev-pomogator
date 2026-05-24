# Phase 1.75: Architecture Decisions (greenfield only)

**Когда:** между Phase 1.5 (Project Context) и Phase 2 (Requirements). **Greenfield only.**
**Цель:** зафиксировать стек ДО написания FR/DESIGN, чтобы они опирались на выбранную архитектуру, а не писались в вакууме.

> **Auto-фаза без блокирующего STOP.** В отличие от STOP #1/#1.5/#2/#3, Phase 1.75 НЕ имеет `ConfirmStop` gate в `core.mjs` PHASE_ORDER. Это workflow-step: skill авто-применяет рекомендации по осям, показывает финальный INDEX, и create-spec продолжает в Phase 2. Юзер переопределяет в свободной форме. Паттерн «делай / начинай» (FR-4 auto-mode).

## Когда пропустить (hard-OUT)

- Repo содержит build-manifest в корне (`package.json`/`*.csproj`/`pyproject.toml`/`Cargo.toml`/`go.mod`) → brownfield, стек выбран.
- PRD фиксирует стек / «existing stack» / «locked».
- `architecture-decision-cli.ts detect-axes` вернул `axes_detected: 0`.
- Спека `.progress.json` version < 4 → Phase 1.75 no-op (migration guard).

При пропуске — записать в RESEARCH.md: `## Architecture Decisions\n> Skipped: {brownfield|stack-locked|single-tech}`.

## Алгоритм

1. **Enumerate:** `Skill("architecture-decision-builder")` command `enumerate` → читает PRD (USER_STORIES + RESEARCH + PRD.md если есть) → `detect-axes` → tier-grouped оси → write QUEUE.json. Если brownfield → skip фазу.
2. **Loop (auto-mode):** для каждой `pending` оси в QUEUE — `Skill("architecture-decision-builder")` command `next-axis`. Loop оркеструется ЗДЕСЬ (create-spec), subskill stateless через QUEUE.json. Каждый вызов: skill строит варианты (≥3, дисциплины R3/R10/R11/R12), генерит md+html, открывает в браузере, авто-применяет рекомендацию, cascading check (depth cap 2).
3. **Финал:** `compile-index` → открыть INDEX.html → одним сообщением показать все авто-выборы. Юзер переопределяет любую ось в свободной форме.
4. **Продолжить в Phase 2** автоматически (без ConfirmStop). FR/DESIGN теперь ссылаются на зафиксированный стек.

## Связь с Phase 3+ Audit

Phase 3+ audit category `ARCHITECTURE_COVERAGE` (9-я) проверяет что нет осей в статусе `pending` на момент STOP #3. См. [phase3plus_audit-architecture-coverage.md](phase3plus_audit-architecture-coverage.md).

## Related

- Skill: `.claude/skills/architecture-decision-builder/SKILL.md`
- Trigger rule: `.claude/rules/specs-workflow/architecture-decision/when-to-build-architecture.md`
- Next phase: [phase2_requirements-and-design.md](phase2_requirements-and-design.md)
