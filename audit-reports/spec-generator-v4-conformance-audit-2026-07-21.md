# Spec-Conformance Audit — `spec-generator-v4` — 2026-07-21

**Overall: `NOT_READY`** (smart-verdict `gates.overall`; exit 1)
Метод: `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/spec-generator-v4 --json --no-semantic` (канонический смарт-вердикт, FR-37d — не голый структурный pass) + прямой разбор canonical `.test-results.ndjson` (32 141 cucumber-envelope) и filtered-артефакта.
Выбор цели: HEAD `dfc0ceae` и `6e3e00b6` правят доки именно этой спеки (release-track, rework FR-25) — активная спека на момент аудита.

> Верхнеуровневое `"verdict": "GREEN"` в JSON — НЕ вердикт готовности: по контракту поля это «RED, пока держится любой hard graph/traceability gate; GREEN is NOT the readiness verdict» `[ref:tools/specs-generator/spec-verdict.ts:98]`. Готовность = `gates.overall`.

## Findings (строгость ↓)

### F1 — Canonical coverage RED: 2 сценария FAILED (blocking) — но фикс уже есть, canonical устарел
Из 522 canonical test-case ровно 2 не-green:

| ID | Сценарий | Assertion |
|----|----------|-----------|
| `SPECGEN004_52` | canonical plugin ships a complete static hooks.json (additive, nothing dropped) | `hooks.json must declare the spec-conformance-guard hook` |
| `SPECGEN004_372` | the committed registry-parity snapshot stays in sync with the live settings.json | `Registry-parity snapshot is stale: Stop: snapshot drifted — live=[] snap=[anchor_gate_stop, answer_simple_stop, auto-ingest-hook, …]` |

`[cmd: разбор .specs/spec-generator-v4/.test-results.ndjson, 2 FAILED testStepFinished из 522 кейсов]`

При этом **HEAD-фикс уже верифицирован**: filtered Docker-прогон `run-1784649138074` (2026-07-21T15:52, после `dfc0ceae` «rework FR-25 hook-parity + snapshot checks») — **7/7 GREEN, включая оба красных сценария** `[cmd: разбор .dev-pomogator/.test-history/run-1784649138074-filtered.ndjson]`. Но `acceptedAttachment: false`, `canonicalCoverageUnchanged: true` — по FR-32 canonical coverage меняется только full-прогоном. Отсюда честный статус спеки: **не GREEN, пока не прошёл полный Docker BDD suite**.

### F2 — Honesty gate: 50 задач DONE без зелёных улик (blocking)
`TASK_STATUS_UNVERIFIED` — крупнейший вклад в NOT_READY. Два класса:
- большинство: «Status: DONE but Done When contains unchecked checkbox item(s)» — DONE задекларирован с невычеркнутым Done-When чеклистом (прямое нарушение дисциплины честного DONE);
- 4 задачи упёрты в красный `specgen004-52`: `verify-fr-25-additive-merge`, `p14-traceability-check`, `p16-creation-review`, `p17-shadow-guard`.

### F3 — Off-by-one в самом verdict-producer (defect вердикта)
`conformance.byCode.TASK_STATUS_UNVERIFIED = 49`, но `coverage.unverifiedDoneTasks.length = 50` — два слоя одного вердикта расходятся в счёте одного и того же множества. `[cmd: повторный прогон verdict + parse]`. Дефект `spec-verdict.ts`/task-census: чинить или явно документировать расхождение (анти-класс `rollup-completeness-all-not-any`).

### F4 — Conformance warnings: 85 (не blocking, долг)
- `FR_NO_STORY` ×25 — FR без user-story обоснования;
- `FR_NO_DESIGN` ×10 — FR без трассировки в DESIGN;
- `TAG_BULK_SUSPECT` ×2 — массовое тегирование сценариев (риск фиктивного @featureN-покрытия);
- `TASK_STARTED_WITHOUT_CHAIN` ×1.

Item-level детализация в этой сессии недоступна: MCP `conformance_check` не выдан, а verdict JSON несёт только счётчики (`errorCount,warningCount,byCode`), без items — сам по себе observability-gap вердикта.

### F5 — Структурный pre-filter: 0 errors / 30 warnings
Не является вердиктом здоровья (FR-37a), но 30 структурных предупреждений — долг.

### F6 — Семантический дрифт НЕ проверен
`SEMANTIC_SKIPPED — no claude binary available`. Вердикт честно помечает (FR-37c), но полный conformance-аудит без семантической ноги неполон.

### F7 — FILE_CHANGES: glob на чужую спеку → implements-рёбра пропущены
`FILE_CHANGES.md` содержит `.specs/pomogator-doctor/*.md` (glob + чужая спека) — graph-builder пропускает implements-edges `[cmd: stderr вердикта: "FILE_CHANGES.md contains glob path(s); implements edges skipped"]`. Дыра в traceability + smell cross-spec дисциплины.

## Что green (проверено)
- audit gate: 0 errors; traceability: 0 gap (UNCOVERED_FR / TASK_UNTESTED / UNTAGGED_SCENARIO = 0);
- BDD sync debt: 0; filtered proof: 7/7 (сегодня);
- 520/522 canonical кейсов green; semantic fail-loud (не замалчивается).

## Next actions (порядок)
1. **Full Docker BDD suite** через `scripts/docker-bdd.sh` (никогда на хосте — `no-host-bdd-runs`) → обновить canonical. Если 52/372 пройдут — canonical red закрывается, 4 задачи из F2 получают улики.
2. Триаж 50 DONE-без-улик: либо вычеркнуть Done-When с реальными уликами, либо понизить статус через дверь `task-status` (FR-48). DONE с невычеркнутым чеклистом = false-green.
3. Починить off-by-one 49/50 в `spec-verdict.ts` (F3).
4. Снять item-level по `TAG_BULK_SUSPECT` ×2 / `TASK_STARTED_WITHOUT_CHAIN` ×1 через `conformance_check` (MCP-дверь).
5. Прогнать semantic-ногу, когда появится claude binary.
6. FILE_CHANGES: заменить glob `.specs/pomogator-doctor/*.md` явными путями или убрать чужую спеку.
