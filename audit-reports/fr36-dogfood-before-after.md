# FR-36 (Phase 13) — dogfood before/after: одна композитная identity для всего корпуса

**Дата:** 2026-06-06 · **Коммиты:** P13-1 `7bad665`+`e2b5145` → P13-2 `37cf617` → P13-3 `19db813` ·
**Базлайн «before»:** `audit-reports/spec-mcp-dogfood-dataset.md` (2026-06-05, bare-id граф).

Каждое число ниже — снято живым прогоном, не выведено. Воспроизведение:

```bash
node --import tsx tools/spec-graph/collision-probe.ts          # raw pre-map коллизии (exit 0 ⇔ 0)
node --import tsx tools/spec-mcp-server/dogfood-dataset.ts     # 13 тулзов на реальном графе
```

## Сводка: до → после

| Метрика | BEFORE (bare ids) | AFTER (composite `<slug>:<localId>`) | Комментарий |
|---|---|---|---|
| FR-узлов в графе | **47** (~470 распарсено, ~90% молча схлопнуто last-writer-ом) | **574** | корень FR-36: map keyed by bare id |
| Raw pre-map коллизии | 60 после первого среза (nested `.specs/backlog/<name>/` = одна «клетка»), сотни до | **0** (2864 raw / 2864 unique) | `specOf` → полный путь директории |
| Рёбер всего | 1406 | **1674** | +268 реальных `@featureN` tested-by |
| tested-by рёбер В Scenario-узлы | **0** (исходный dogfood-finding) | **164** | конвенция `@featureN`↔FR-N стала рёбрами (FR-36c) |
| `get_trace` | `scenarios:[]` для ВСЕХ FR (жил только tag-scan костыль) | через РЕАЛЬНЫЕ рёбра; костыль удалён | поведенческое доказательство: теги стёрты до вызова — сценарии всё равно приходят (SPECGEN004_92) |
| Dogfood: live-тулзов | 12/13 (get_trace дохлый по сути) | **13/13 LIVE** | сэмплер теперь предпочитает FR с tested-by ребром |
| `UNCOVERED_FR` | 11 (на склеенном графе — недосчёт) → 54 сразу после де-коллизии | **49** | 54→49 — пять FR получили покрытие реальными @featureN-рёбрами |
| conformance total | 1256 (недосчёт на 47-узловом графе) | **1557** | рост ВЕРИФИЦИРОВАН как newly-visible узлы, не повисшие рёбра (`grep @FR- tests/features/` пуст) |
| Cross-spec утечка | get_trace(v4:FR-36) тянул ЧУЖОЙ `AC-36` из pomogator-doctor (7 AC) | 6 AC, все свои | де-коллизия закрыла межспековое слипание |
| Bare-id у тулзов | молча возвращался последний записанный узел | unique → soft-resolve; колл изия → `AMBIGUOUS_BARE_ID` + кандидаты (`FR-2` → 49 шт.) | FR-36d, все 4 node-ref тулзы + optional `spec` |
| Якоря (Marksman) | bare, file-local | bare, file-local — **не тронуты** | FR-36b, SPECGEN004_91 |
| Cold build | — | 277–387ms на 3350+ узлов | бюджет ≤2s (NFR-Performance-1/9) |

## Что НЕ изменилось (инварианты, проверены)

- Якорный слой (`graph.definitions`) — только bare-алиасы; ни один composite-ключ не утёк в
  Marksman/anchor-fix поверхность.
- NDJSON-ингест матчится по `file:line` — rekey-безопасен by construction.
- Файлы вне `.specs/` (tests/features) остаются bare; их повисшие bare-рёбра builder разрешает
  только при ОДНОЗНАЧНОМ совпадении localId (двусмысленные честно висят — иначе вернулась бы
  межспековая утечка).

## Регрессионная дисциплина (clean-vs-clean)

Каждая фаза подтверждена Docker-сьютом из ЧИСТОГО worktree (WSL-шим, issue #49): baseline
`4bf8d5c` = 12 failed; `e2b5145` (P13-1) = 12 failed; `37cf617` (P13-2) = ровно те же 12.
Единственная Phase-13 регрессия за всё время — 3× multilang (cross-root bare-ребро против
композитного узла) — закрыта builder-резолюцией в `e2b5145` и зелёная во всех clean-прогонах
после. 11 общих падений + 1 order-зависимый — предсуществующий долг `final-verification`
(вне graph-территории), задокументирован в TASKS.md.

## P14-2 update (2026-06-06): traceability-гейт включён, v4-долг = 0

`tools/spec-graph/traceability.ts` + FR-37b гейт в `spec-verdict.ts` (ANY gap → RED). Внутри v4
все классы добиты до нуля: UNCOVERED_FR 9→0 (удалены авто-TBD скелеты — resolver читал ПРИМЕРЫ из
текста AC как требования), TASK_UNTESTED 2→0 (линковка на SPECGEN004_52/_13), UNTAGGED 129→0
(101 — честная семантика `@featureN`-с-резолвящимся-FR = тег до требования, это реальное ребро
после P13-2; 28 legacy-v3 — реальный feature-level `@FR-19` по собственному header-у файла).
Корпус: 1557 → **1305** (UNTAGGED 1498→1258, UNCOVERED_FR 49→40, TASK_UNTESTED 2→0 corpus-wide).
Live verdict v4: `traceability gate: 0 gaps — PASSES`.

## Хвосты, переданные Phase 14

- `UNTAGGED_SCENARIO` (1500) всё ещё не считает `@featureN` спековым тегом — теперь это реальное
  ребро; пересмотр семантики в P14-2.
- `linkedScenarioIds` (FR-32 verified_status) маппит тегами — миграция на рёбра в P14-3.
- 49 `UNCOVERED_FR` + 2 `TASK_UNTESTED` — измеренный честный долг под FR-37b гейт.
