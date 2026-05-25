# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-axis-enumeration-из-prd)

WHEN PRD без build-manifest И содержит trigger phrase THEN skill SHALL вернуть ≥1 detected axis, сгруппированный по tier (Critical/Important/Deferred).

WHEN repo содержит build-manifest (`package.json`/`*.csproj`/`pyproject.toml`/`Cargo.toml`/`go.mod`) THEN skill SHALL вернуть `axes_detected=0` с `skipped_reason="brownfield-signals"`.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html)

WHEN команда next-axis выполняется для оси THEN skill SHALL сгенерить markdown И self-contained HTML с ≥3 вариантами, каждый содержит Y-summary, Good/Neutral/Bad буллеты, cost chip и When-NOT-to-choose.

IF два запуска для одной axis.id THEN порядок вариантов SHALL быть детерминирован (seeded Fisher-Yates) но рекомендация SHALL быть pinned top в обоих.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-browser-auto-open-cross-platform-enoent-safe)

WHEN HTML сгенерирован AND платформа win32/darwin/linux THEN skill SHALL вызвать соответственно `start`/`open`/`xdg-open`.

WHEN browser launch fails (ENOENT) THEN skill SHALL вернуть `launched=false` с fallback-путём И НЕ SHALL бросать исключение.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-auto-apply-рекомендации-default-с-опциональным-override)

WHEN auto-mode (default) И ось обработана THEN skill SHALL авто-применить рекомендованный вариант (status=accepted, chosen=recommended) И продолжить к следующей оси БЕЗ блокирующего AskUserQuestion.

WHEN все оси обработаны в auto-mode THEN skill SHALL открыть финальный INDEX.html И одним сообщением показать все авто-выборы для override.

IF запущен с флагом `--interactive` THEN skill SHALL вызвать AskUserQuestion на каждой оси с опцией `[Беру рекомендацию]` первой.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-index-compile-idempotent-status-matrix)

IF compile-index вызван повторно THEN skill SHALL заменить контент между AUTOGEN-маркерами И сохранить user-контент вне маркеров.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-cascading-implications-bmad-pattern)

WHEN выбранный вариант имеет cascading-маппинг THEN skill SHALL добавить новую ось в QUEUE.json.

IF cascading depth достигает 2 THEN skill SHALL вызвать AskUserQuestion «расширить дальше?» вместо авто-добавления.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175)

WHEN create-spec доходит до Phase 1.75 на greenfield-спеке THEN create-spec SHALL вызвать skill командой enumerate, затем loop next-axis в auto-mode, затем АВТОМАТИЧЕСКИ перейти в Phase 2 БЕЗ блокирующего ConfirmStop.

IF спека `.progress.json` version < 4 THEN Phase 1.75 SHALL быть пропущена no-op (migration guard).

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-anti-bias-guardrails)

WHEN артефакт оси генерируется THEN skill SHALL включить ≥1 вариант вне очевидного дефолта И пометить версии `[VERIFIED]` (live-fetch) или `[UNVERIFIED]`.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-audit-category-architecture_coverage)

WHEN ось остаётся в статусе `pending` на момент Phase 2 STOP THEN audit SHALL emit ARCHITECTURE_COVERAGE finding severity WARNING (блокирует STOP).

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-escape-hatch-с-audit-trail)

WHEN ось содержит `[skip-architecture-axis: <reason>]` THEN skill SHALL записать запись в `.claude/logs/spec-architecture-escapes.jsonl`.

IF reason < 12 chars THEN audit SHALL emit WARNING_REASON_TOO_SHORT finding.

## AC-11 (FR-11)

**Требование:** [FR-11](FR.md#fr-11-eval-suite--debug--benchmark-качества-2-слоя)

WHEN deterministic eval прогоняется на fixture THEN результат SHALL содержать grading.json с expectations[] (passed + evidence) И aggregate.json roll-up.

WHEN qualitative artifact-bench оценивается THEN каждый сгенерированный артефакт SHALL проходить rubric R1-R20, где R3 (каждое тех-заявление имеет [VERIFIED] или [UNVERIFIED] marker) — блокирующий anti-hallucination критерий; R10 (failure-modes), R11 (best-practice-verified), R12 (integration-timing) — per-variant design discipline; R13-R20 (internal-consistency, flow-completeness, compliance-privacy, auth-secrets, observability, data-lifecycle, cost-quota, deploy-ops) — system-completeness layer из реальных 12 провалов scenario-bhph.

IF тех-заявление в артефакте не имеет [VERIFIED]/[UNVERIFIED] marker THEN rubric R3 SHALL fail с указанием строки.

## AC-12 (FR-12)

**Требование:** [FR-12](FR.md#fr-12-audit-category-completeness_coverage--completeness-ledger)

WHEN команда `audit-completeness` выполняется AND хотя бы одно из 8 completeness-измерений в `COMPLETENESS.md` имеет status `pending` (или ledger-файл отсутствует) THEN audit-completeness SHALL emit `COMPLETENESS_COVERAGE` finding с code `DIMENSION_PENDING` severity WARNING (блокирует STOP) для каждого незакрытого измерения.

WHEN все 8 измерений имеют status `addressed` или `out-of-scope` THEN audit SHALL emit ровно один `COMPLETENESS_COMPLETE` finding severity INFO.

WHEN измерение содержит `[skip-completeness-dimension: <reason>]` THEN skill SHALL записать запись в `.claude/logs/spec-completeness-escapes.jsonl`.

IF reason < 12 chars THEN audit SHALL emit `WARNING_REASON_TOO_SHORT` finding severity INFO.

WHEN измерение имеет status `addressed` но колонка-указатель пустая или placeholder (`—`) THEN audit-completeness SHALL emit `ADDRESSED_WITHOUT_POINTER` finding severity INFO (non-blocking — не мешает `COMPLETENESS_COMPLETE`).

## AC-13 (FR-13)

**Требование:** [FR-13](FR.md#fr-13-cross-axis-synthesis)

WHEN per-axis loop завершён AND команда `synthesis <spec-dir>` выполняется THEN skill SHALL создать `SYNTHESIS.md` со списком cross-axis insights (≥0; 0 допустимо для 1-axis spec).

WHEN insight сформирован THEN он SHALL ссылаться на ≥2 axis-id в поле `axes[]` (cross-axis по определению).

## AC-14 (FR-14)

**Требование:** [FR-14](FR.md#fr-14-correction-log-reasoning-journey)

WHEN вариант имеет непустой `correction_log` THEN axis md/html SHALL содержать секцию `## Corrections` с записями.

IF `correction_log` пуст/отсутствует THEN секция Corrections SHALL отсутствовать (не ломает render).

## AC-15 (FR-15)

**Требование:** [FR-15](FR.md#fr-15-live-context7-пруфы)

WHEN skill строит тех-заявление варианта AND библиотека резолвится в context7 THEN маркер SHALL быть `[VERIFIED via context7:<lib> <ver>]`.

IF context7 не нашёл библиотеку THEN маркер SHALL быть `[UNVERIFIED — Context7 no match]`, НЕ fabricated claim.

## AC-16 (FR-16)

**Требование:** [FR-16](FR.md#fr-16-selection-policy-default-mvp-poc)

WHEN политика не выбрана THEN skill SHALL применить `mvp-poc` по умолчанию.

WHEN selected_policy = X AND вариант V имеет X в policy_fit THEN renderAxisMarkdown SHALL пометить V как recommended (pinned top + policy-badge «Recommended under X»).

WHEN ось имеет варианты с разными policy_fit THEN артефакт SHALL содержать demonstration-таблицу (вариант × 5 политик).

IF ни один вариант не имеет selected_policy в policy_fit THEN recommended SHALL fallback на is_recommended.

## AC-17 (FR-17)

**Требование:** [FR-17](FR.md#fr-17-две-линзы--scorecard--reality-check-r24-blocking)

WHEN вариант рендерится THEN артефакт SHALL содержать `business_summary` (gets/time_to_market/cost/risk) бизнес-лентой.

WHEN ≥2 варианта оси имеют scorecard с разными verdict'ами THEN артефакт SHALL рендерить матрицу критерии×варианты (Стоимость/Лёгкость интеграции/Кривая обучения/Ops/SSL-HTTPS/Масштаб/Vendor lock-in/Экосистема), ячейка цветная по verdict.

WHEN вариант имеет непустой `reality_check` THEN артефакт SHALL содержать секцию «Реальность — что руками» (SSL/HTTPS, бэкапы+restore, мониторинг, secrets, обновления ОС, склейка).

IF вариант несёт только good/bad буллеты без `reality_check` THEN rubric R24 SHALL fail.

## AC-18 (FR-18)

**Требование:** [FR-18](FR.md#fr-18-экономика-решения--деньги-время-обратимость-r25-blocking)

WHEN вариант рендерится THEN артефакт SHALL содержать `cost_at_scale` (≥2 tier-точки, не одна) И `time_costs` (to_market + to_feature + to_test + to_support) И `exit_cost`.

WHEN ось рендерится THEN артефакт SHALL показать `door_type` (one-way/two-way баннер) И `sensitivity[]` («рекомендация меняется если…») если заданы.

WHEN вариант имеет `real_world_precedent` THEN каждый precedent SHALL нести `relevance` (почему релевантен проекту), не только звёзды.

IF вариант costed точечно (cost без cost_at_scale) ИЛИ без time_costs THEN rubric R25 SHALL fail.
