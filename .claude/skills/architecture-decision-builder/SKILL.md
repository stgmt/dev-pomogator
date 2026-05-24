---
name: architecture-decision-builder
description: >
  Greenfield architecture decisions — enumerates tech-stack axes from a PRD, generates
  per-axis multi-variant markdown + self-contained HTML (rendered in browser), auto-applies
  the recommendation (auto-mode default) with optional override, cascades dependent axes.
  Standalone triggers (RU): "выбери стек", "спроектируй архитектуру", "архитектура для",
  "варианты архитектуры"; (EN): "choose stack", "design architecture", "architecture decision",
  "stack options". Also invoked by create-spec Phase 1.75 (greenfield only) once for
  axis-enumeration plus once per axis. Do NOT use for brownfield refactors (existing build
  manifest), single-tech feature decisions, or post-implementation reviews.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebFetch, WebSearch
---

# architecture-decision-builder

## Mission

Для greenfield-проекта (только PRD-маркдауны, кода нет) разложить выбор стека на decision-axes (database / auth / hosting / email / ...), и по каждой оси выдать ≥3 варианта с pros/cons/cost/«когда выбрать»/рекомендацией — как markdown + self-contained HTML (открывается в браузере, markdown глазами читать тяжело). Helper-скрипты — детерминированная механика (detect/render/compile/audit); **проза-анализ вариантов (pros/cons с пруфами) — твоя работа как LLM**, mirror variant-matrix (helpers parse, skill fills content).

## Дисциплины (BLOCKING — из реальных провалов, см. memory feedback_design-research-discipline)

При генерации каждого варианта ОБЯЗАТЕЛЬНО:

1. **Re-research при challenge.** Если юзер усомнился («не убедил», «не уверен», «проебал») — СТОП защищать посылку, подними доки (context7/WebSearch), проверь саму посылку, честно скажи «был неправ потому что X». Не держись за гипотезу до второго пинка.
2. **Best-practice, не feasibility (R11).** Не «это работает», а «вендор сам так рекомендует [cite doc]»; отклонения от best-practice — явно обоснуй.
3. **Failure-modes per вариант (R10).** Перечисли: crash mid-operation / duplicate side-effect / poison-infinite-retry / race. «Exactly-once delivery» ≠ idempotent side-effect.
4. **External-integration timing (R12).** Для каждой внешней интеграции проверь: webhook timeout / required-response-time (respond-immediately если обработчик медленнее), sync-vs-async семантику, rate limits, per-resource queue limits.
5. **Anti-hallucination (R3, BLOCKING).** Каждое тех-заявление помечай `[VERIFIED via <source>]` или `[UNVERIFIED]`. Cost — cited или `[UNVERIFIED — knowledge cutoff]`, не голые уверенные числа.

## Commands (stateless RPC, state в QUEUE.json)

CLI: `extensions/specs-workflow/tools/specs-generator/architecture-decision/architecture-decision-cli.ts`

- **`detect-axes <prd-path>`** → `{axes_detected, axes[], skipped_reason?}`. 3-layer detection (BMAD seed + keyword + NEEDS CLARIFICATION). Brownfield build-manifest → axes_detected=0.
- **`generate-axis <axis-model.json> <outDir>`** → `{mdPath, htmlPath, wordBudgetOk}`. Рендерит AxisModel (варианты заполнены тобой) в md+html. Recommendation pinned top.
- **`open-browser <html-path>`** → `{launched, fallback?}`. Cross-platform, ENOENT-safe.
- **`compile-index <spec-dir>`** → `{axes_total, axes_pending, rows}`. Idempotent INDEX.md+html.
- **`audit <spec-dir>`** → `{findings[]}`. ARCHITECTURE_COVERAGE (FR-9, 9-я категория): pending axis→WARNING, accepted→MATRIX_COMPLETE, escape→ESCAPE_HATCH_USED/WARNING_REASON_TOO_SHORT.
- **`audit-completeness <spec-dir>`** → `{findings[]}`. COMPLETENESS_COVERAGE (FR-12, 10-я категория): читает `COMPLETENESS.md` ledger (8 dimensions) — pending/missing→DIMENSION_PENDING WARNING, all addressed/out-of-scope→COMPLETENESS_COMPLETE, escape `[skip-completeness-dimension:]`→WARNING_REASON_TOO_SHORT. **Отдельная команда** (не merged в audit — architecture audit unmixed для eval determinism).

## Workflow (auto-mode default — FR-4)

1. **Enumerate.** `detect-axes <prd>` → tier-grouped список (Critical/Important/Deferred). Если brownfield (axes_detected=0) → выйти, сообщить skipped_reason. Иначе показать оси, write QUEUE.json.
2. **Per axis (auto-mode):**
   - Построить AxisModel: ≥3 варианта, каждый с дисциплинами 1-5 выше (Y-statement, Good/Neutral/Bad, failure_modes, when/when-NOT, [VERIFIED] markers, cost chip). ≥1 вариант вне очевидного дефолта (R8).
   - `generate-axis` → md+html. `open-browser`.
   - **Auto-apply рекомендации** (status=accepted, chosen=recommended) — БЕЗ блокирующего AskUserQuestion. Cascading check: выбор открыл новую ось? → добавить в QUEUE (depth cap 2).
   - `compile-index`.
3. **Completeness ledger (R13-R20, FR-12) — горизонталь полноты системы.** ПЕРЕД финалом запиши `COMPLETENESS.md` рядом с INDEX — markdown-таблица `| Dimension | Status | Pointer / Reason |` из 8 system-completeness измерений: `internal-consistency`, `flow-completeness`, `compliance-privacy`, `auth-secrets`, `observability`, `data-lifecycle`, `cost-quota`, `deploy-ops`. Каждое: `addressed` (+ где в дизайне) / `out-of-scope` (`[skip-completeness-dimension: <reason ≥12>]`) / `pending`. **`cost-quota` оцени ДО lock осей** — единственное измерение, которое может изменить axis-решение (напр. poll-cadence выбивает invocation-quota → переключись на event-driven ДО фиксации стека). Per-axis качество (R1-R12) ≠ полнота системы (R13-R20): ось может быть «выбрана отлично», а флоу/секрет/комплаенс/стоимость — пропущены. Маппинг измерений ← 12 реальных дыр scenario-bhph → AWS Well-Architected.
4. **Audit перед STOP.** `audit <spec-dir>` → `ARCHITECTURE_COVERAGE` (нет pending осей) + `COMPLETENESS_COVERAGE` (все 8 измерений addressed/out-of-scope). Любой `DIMENSION_PENDING`/`AXIS_PENDING` WARNING блокирует STOP — закрой измерение, отметь `out-of-scope` с reason, или escape.
5. **Финал:** открыть INDEX.html, одним сообщением показать все авто-выборы. Юзер переопределяет в свободной форме («ось hosting — возьми Variant B»).
6. **Interactive-mode** (`--interactive`): на каждой оси AskUserQuestion `[Беру рекомендацию] / [Variant B] / [Variant C] / [Отложить]`.

## Output location

- create-spec mode: `.specs/{slug}/ARCHITECTURE/AXIS-NN-{id}.md|.html` + `INDEX.md|.html` + `COMPLETENESS.md`
- standalone: `./architecture-decisions/{slug}/` (incl. `COMPLETENESS.md`)

## Hard-OUT (НЕ запускать)

- Repo содержит build-manifest (`package.json`/`*.csproj`/`pyproject.toml`/`Cargo.toml`/`go.mod`) — brownfield.
- PRD фиксирует стек / «existing stack» / «locked» / «not being reconsidered».
- Single-tech feature decision (одна технология, нет выбора).
См. rule `.claude/rules/specs-workflow/architecture-decision/when-to-build-architecture.md`.

## Escape hatch

`[skip-architecture-axis: <reason ≥12 chars>]` в PRD/axis frontmatter — пропустить ось. Логируется в `.claude/logs/spec-architecture-escapes.jsonl`. reason <12 chars → WARNING_REASON_TOO_SHORT. См. `.claude/rules/specs-workflow/architecture-decision/escape-hatch-audit.md`.

## Eval / debug

`evals/` — deterministic eval-runner (`tools/eval-runner-adb.py`, host, no Docker) + qualitative rubric R1-R20 (`evals/rubric.json`; R1-R9 per-axis decision quality, R10-R12 per-variant design discipline, R13-R20 system-completeness layer). Golden bench `evals/artifact-bench/scenario-bhph/`. Прогон: `python tools/eval-runner-adb.py`. Completeness gate (R13-R20) enforced deterministically via `audit-completeness` COMPLETENESS_COVERAGE (FR-12, отдельная команда), tested via eval-7/8 (`eval-runner-adb.py`).

## Contract (JSON returns)

| Command | Returns |
|---------|---------|
| detect-axes | `{axes_detected, axes[], skipped_reason?}` |
| generate-axis | `{axis_id, mdPath, htmlPath, wordsPerVariant[], wordBudgetOk}` |
| open-browser | `{launched, fallback?}` |
| compile-index | `{axes_total, axes_pending, rows[]}` |
| audit | `{findings[]}` (ARCHITECTURE_COVERAGE) |
| audit-completeness | `{findings[]}` (COMPLETENESS_COVERAGE, FR-12) |

## Related

- Spec: `.specs/architecture-decision-builder/`
- Mirror reference: `.claude/skills/variant-matrix-build/SKILL.md`
- Trigger rule: `.claude/rules/specs-workflow/architecture-decision/when-to-build-architecture.md`
- Escape audit: `.claude/rules/specs-workflow/architecture-decision/escape-hatch-audit.md`
- create-spec Phase 1.75: `.claude/skills/create-spec/references/phase1.75_architecture-decisions.md`
