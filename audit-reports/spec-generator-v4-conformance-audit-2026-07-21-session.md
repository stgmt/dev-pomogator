# Spec-Conformance Audit — `.specs/spec-generator-v4/`

- **Дата**: 2026-07-21 · **Аудитор**: strict spec-conformance auditor (Claude Code session)
- **Канонические источники**: `spec-verdict.ts` (FR-37, `--no-semantic`) · conformance-checker на том же графе (`checkConformance`) · cucumber full-run `run-1784646700495-full.ndjson` (2026-07-21T15:11Z, 1816 сценариев, exit=1) · filtered-run `run-1784661433945-filtered.ndjson` (19:17Z, SPECGEN004_521/523 passed)

## Вердикт: `GRAPH_GREEN` / **OVERALL: NOT_READY**

| Lane | Статус | Суть |
|---|---|---|
| STRUCTURE | 🟢 GREEN | validate-spec 0 errors/30 warnings · audit 0 ERROR · conformance 0 error |
| TRACEABILITY | 🟢 GREEN | 0 cell→atom gaps (FR-37b) |
| EXECUTION | 🔴 RED (blocking) | 2 failed + 15 not_run (spec-scoped) |
| TASK_TRUTH | 🔴 RED (blocking) | 50 DONE-but-unverified · 45 DONE с незачёркнутыми Done When |
| BDD_SYNC | 🟢 GREEN | — |
| SEMANTIC | ⚪ SKIPPED | нет claude binary → FR-8 drift НЕ проверен («не проверено» ≠ «нет дрифта», FR-37c) |
| FILTERED_PROOF | 🟢 GREEN | 2 passed / 0 non-passed (521, 523) — канон не меняет до полного прогона |

Coverage: effective `{passed:2, stale:510, not_run:9}` vs canonical `{passed:504, failed:2, not_run:15}` — effective почти полностью STALE, т.к. последний принятый прогон был filtered. Вердикт честно НЕ зачитывает filtered как канон (FR-32) — расхождение ожидаемое, не дефект.

## Блокирующие находки

### B1 — 2 FAILED сценария, оба `@feature25` (FR-25 hook-parity)
| Сценарий | Assertion |
|---|---|
| SPECGEN004_52 «canonical plugin ships a complete static hooks.json (additive, nothing dropped)» | `hooks.json must declare the spec-conformance-guard hook` |
| SPECGEN004_372 «the committed registry-parity snapshot stays in sync with the live settings.json» | `Registry-parity snapshot is stale: Stop: snapshot drifted — live=[] snap=[anchor…]` |

Сегодняшний коммит `dfc0ceae` (rework FR-25 parity) красноту не снял — full-run 15:11 всё ещё красный.

### B2 — 15 NOT_RUN в `spec-generator-v4.feature` (канонический full-run)
- **FR-60 P33 (активная разработка, коммиты P33-1…3)**: SPECGEN004_520, 521, 522, 523, 524. Filtered-run доказал только 521+523; 520/522/524 без канонических улик.
- **Будущие release-tracks `@wip`**: FR-62 (553, 554) · FR-63 (555, 556, 557) · FR-64 (558, 559, 560, 561).
- Кандидат №16 SPECGEN004_377 — артефакт сверки имён (`Scenario Outline` c `<runner>`), фактически not_run = 15 = вердикт ✓.

### B3 — TASK_TRUTH: 50 DONE-but-unverified + 45 DONE с unchecked Done When
DONE заявлен без закрытых чекбоксов-Done-When — нарушение анти-fake-green (rollup-completeness-all-not-any). Примеры: graph-types, md-parser-impl, gherkin-parser-impl, ndjson-ingester-impl, graph-builder-impl, incremental-rebuild, conformance-checker, verify-phase1-green, … (+42).

## Conformance-долг (warnings/info, spec-scoped)

| Класс | Кол-во | Детали |
|---|---|---|
| TASK_STARTED_WITHOUT_CHAIN | 1 | `p27-rollout-local` (TASKS.md:1685) — in-progress при несобранной цепи: нет `FR-51:design`. Задачу начали до сборки требовательной цепи |
| FR_NO_DESIGN | 10 | FR-28, 40, 41, 42, 51, 52, 53, 54, 55, 58 — нет `### Decision` c `**Требование:** [FR-N]` |
| FR_NO_STORY | 25 | FR-19…29, 40…47, 51, 53, 54, 55, 58, 60 — нет `### User Story` c `**Требование:** [FR-N]` |
| TASK_NO_OWN_SCENARIO | 36 | DONE-задачи без собственного scenario id в Done-When (bootstrap-bdd-hooks, graph-types, ndjson-ingester-impl, mcp-server-skeleton, mcp-tools-rest, marksman-native-lsp, spec-check-log-cli, enrich-research-workflow, verify-phase6-green, install-cross-spec-skills, impl-architectural-detection, wire-create-spec-skill, register-skills-in-manifest, manual-agent-e2e-walk, mcp-transport-e2e, clean-empty-e2e-stub, anchor-wire, anchor-templates, ws-b-status-reconcile, ws-d-observability, ws-e-install-e2e, p14-corpus-health-skill, final-verification, p16-crlf-fill-template, p18-legacy-classifier, p19-mcp-tool-gaps, p21-burndown-owner, p23-rebuild-verify, p25-cache-refresh, p27-tail-other-language-runners, p30-corpus-run, p31-bounded-reminder, p31-bundle-probe, p32-hook-root-isolation, p32-next-router-bundle-probe, p32-carl-stale-agent-todo-regression) |
| TAG_BULK_SUSPECT (info) | 2 | `@FR-39` blanket на 12 сценариев (feature:978) · `@FR-40` blanket на 16 (feature:999) — semantic fit НЕ проверен (FR-8 judge был SKIPPED) |
| TASK_STATUS_UNVERIFIED | 201 | задачи без verified_status-улик |
| prefilter warnings | 30 | структурные (validate-spec), pre-filter only |

Связка W1↔W2: `p27-rollout-local` упирается в FR-51, у которого нет design-ветви (FR_NO_DESIGN) — корень один.

## Corpus-level наблюдения (вне v4-скоупа)

1. **28 дополнительных failed-сценариев** в чужих фичах: answer-simple (PLUGIN017_05), tests-create-update (PLUGIN016_06), tui-test-runner (GUARD001_12, GUARD002_13/14), auto-capture ×2, dev-pomogator-canonical-plugin (CANON001_12/90, HOOKSCWD001_02, CORE024_01/02), bg-task-guard (GUARD002_07), spec-workflow-md-validation, codex-init (CODEXINIT001_05), claude-mem-midsession-reaper (CMEMMID004), claude-mem-integration (CMEM001_27), carl-integration ×7, reqnroll-ce-guard (CEGUARD001_13), plan-validator (PLUGIN007_52_01). **Системный паттерн**: дрейф `.claude-plugin/hooks.json` — десятки сценариев утверждают «мой хук объявлен в hooks.json», статический файл записей не содержит. Нужна corpus-wide сверка hooks.json ↔ сценарные ожидания.
2. FILE_CHANGES.md (pomogator-doctor) содержит glob `.specs/pomogator-doctor/*.md` → implements-рёбра скипаются при сборке графа.

## NEXT (порядок аудитора)

1. **FR-25**: объявить `spec-conformance-guard` в `.claude-plugin/hooks.json`; перегенерировать registry-parity snapshot из живого `settings.json` (live=[] говорит, что live-файл прочитан пустым — проверить путь/якорь CLAUDE_PROJECT_DIR).
2. Полный Docker BDD-прогон → зачёт 520/522/524 в канон, снятие not_run для не-wip.
3. TASK_TRUTH: по 50 DONE-but-unverified — закрыть Done-When чекбоксы с id сценариев-улик ИЛИ честно понизить статус.
4. Собрать цепь FR-51 (`### Decision` + `**Требование:** [FR-51]`) до продолжения `p27-rollout-local`; затем design/story-ветви для остальных 10/25 FR.
5. Прогнать FR-8 semantic judge по `@FR-39`/`@FR-40` (нужен claude binary/Meridian) — сейчас bulk-теги НЕ верифицированы.

**Заключение**: спека структурно здорова (GRAPH_GREEN), но заявлять её готовой нельзя — две блокирующие полосы RED. Фильтрованные улики 521/523 вердикт справедливо не засчитывает как канон.
