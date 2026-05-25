# Phase 1.75: Architecture Decisions (greenfield only)

**Когда:** между Phase 1.5 (Project Context) и Phase 2 (Requirements). **Greenfield only.**
**Цель:** зафиксировать стек ДО написания FR/DESIGN, чтобы они опирались на выбранную архитектуру, а не писались в вакууме.

> **Auto-фаза без блокирующего STOP, НО механически гарантирована (FR-21).** В отличие от STOP #1/#1.5/#2/#3, Phase 1.75 НЕ имеет `ConfirmStop` gate в `core.mjs` PHASE_ORDER — это workflow-step (auto-mode, паттерн «делай/начинай», FR-4). Гарантия не через STOP, а через `architecture-gate.ts` (PreToolUse Write|Edit hook): для greenfield-спеки запись Requirements-артефактов (`FR.md`/`DESIGN.md`/...) ЗАБЛОКИРОВАНА пока `ARCHITECTURE/` не создан (1.75 отработал) или нет явного skip (`[skip-architecture-axis:]` / `ARCHITECTURE/.skip`). То есть нельзя проскочить 1.75 и писать FR/DESIGN в стек-вакууме — hook не даст. brownfield/version<4 не гейтятся; fail-open.

## Когда пропустить (full hard-OUT) vs completeness-only

**Full skip (hard-OUT):**
- Repo содержит build-manifest в корне (`package.json`/`*.csproj`/`pyproject.toml`/`Cargo.toml`/`go.mod`) → true brownfield (код уже есть).
- `architecture-decision-cli.ts detect-axes` вернул `axes_detected: 0`.
- Спека `.progress.json` version < 4 → Phase 1.75 no-op (migration guard).

**Completeness-only (НЕ full skip):** если `detect-axes` вернул `stack_locked: true` (стек зафиксирован в PRD-прозе — «Stack locked» / «existing stack» — но кода/манифеста ещё нет) → **НЕ пропускать фазу целиком**. Пропустить только variant-picking (стек выбран, сравнивать нечего), НО всё равно построить `ARCHITECTURE/COMPLETENESS.md` ledger и прогнать `audit-completeness`. Иначе completeness-gate (FR-12) никогда не срабатывает для locked-stack проектов — ровно там, где он нужен (реальный провал: bhph с «Stack locked» пропускал весь скил вместе с completeness-проверкой; `detect-axes` теперь возвращает 14 осей + `stack_locked`, не `0`).

При full skip — записать в RESEARCH.md: `## Architecture Decisions\n> Skipped: {brownfield|single-tech}`.

## Алгоритм

1. **Enumerate:** `Skill("architecture-decision-builder")` command `enumerate` → читает PRD (USER_STORIES + RESEARCH + PRD.md если есть) → `detect-axes` → tier-grouped оси → write QUEUE.json. Если `axes_detected: 0` (manifest brownfield) → skip фазу. Если `stack_locked: true` → пропустить variant loop (step 2), перейти сразу к completeness ledger (step 3.5).
1.5. **Policy selection (FR-16):** ОДИН AskUserQuestion «под какую цель выбираем стек?» — опция `[MVP / прототип]` первой (Recommended), `[Production]` второй. Default `mvp-poc` если нет ответа (auto-mode не блокируется). Записать `selected_policy` в QUEUE.json — прокидывается во все оси. Политика глобальна (не per-axis).
2. **Loop (auto-mode):** для каждой `pending` оси в QUEUE — `Skill("architecture-decision-builder")` command `next-axis`. Loop оркеструется ЗДЕСЬ (create-spec), subskill stateless через QUEUE.json. Каждый вызов: skill строит варианты (≥3, дисциплины R3/R10/R11/R12/R15, `policy_fit[]`), live-context7 пруфы, генерит md+html (recommended policy-aware + demonstration-таблица), открывает в браузере, авто-применяет рекомендацию, cascading check (depth cap 2).
3. **Synthesis (FR-13):** когда все оси resolved — `synthesis <ARCHITECTURE-dir> insights.json` → SYNTHESIS.md (cross-axis emergent insights, каждый ≥2 axis-id). 0 insights валидно.
3.5. **Completeness ledger (FR-12) — ВСЕГДА, в т.ч. stack_locked.** Построить `ARCHITECTURE/COMPLETENESS.md` (8 измерений) ОТДЕЛЬНЫМ свежим под-агентом (см. SKILL.md step 3 — fresh reviewer, не self-grade) → прогнать `audit-completeness`. Для stack_locked-проектов это единственная content-фаза (variant loop пропущен). Любой `DIMENSION_PENDING` блокирует STOP #3.
4. **Финал:** `compile-index` → открыть INDEX.html → одним сообщением показать все авто-выборы (+ policy под которую рекомендовано). Юзер переопределяет любую ось / политику в свободной форме.
5. **Продолжить в Phase 2** автоматически (без ConfirmStop). FR/DESIGN теперь ссылаются на зафиксированный стек.

## Связь с Phase 3+ Audit

Phase 3+ audit category `ARCHITECTURE_COVERAGE` (9-я) проверяет что нет осей в статусе `pending` на момент STOP #3. См. [phase3plus_audit-architecture-coverage.md](phase3plus_audit-architecture-coverage.md).

`COMPLETENESS_COVERAGE` (10-я) проверяет 8 system-completeness измерений через `audit-completeness` (FR-12). Применяется ВСЕГДА когда есть `ARCHITECTURE/` — **включая stack_locked-проекты** (variant loop пропущен, но ledger построен). Без этого locked-stack проекты молча проходили STOP с непокрытыми flow/secrets/compliance/cost. См. [phase3plus_audit-completeness-coverage.md](phase3plus_audit-completeness-coverage.md).

## Related

- Skill: `.claude/skills/architecture-decision-builder/SKILL.md`
- Trigger rule: `.claude/rules/specs-workflow/architecture-decision/when-to-build-architecture.md`
- Next phase: [phase2_requirements-and-design.md](phase2_requirements-and-design.md)
