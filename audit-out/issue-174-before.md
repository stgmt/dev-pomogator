Единый канонический вердикт здоровья спеки для всех поверхностей (CLI/MCP/TUI/statusline) — один расчёт, ноль drift
# Единый канонический вердикт здоровья спеки для всех поверхностей (CLI/MCP/TUI/statusline) — один расчёт, ноль drift

## Кратко (Summary)

Сегодня «здорова ли спека / готов ли FR / done ли задача» вычисляется **четырьмя независимыми кодовыми путями** с **четырьмя разными словарями итоговых меток**. Общие низкоуровневые примитивы (`computeCoverage`, `checkConformance`, `readVerdicts`, `buildReadinessInventory`) уже вынесены в `tools/spec-graph/`, но **итоговый rollup «done/не done» каждая поверхность пересчитывает сама**, своими руками и своими словами. Требуется **одна каноническая функция вердикта** в ядре spec-graph, которую CLI, MCP, TUI/statusline и audit **читают**, а не переизобретают; и один общий словарь итоговых меток (`SpecVerdict`) вместо четырёх расходящихся.

## Проблема сегодня (concrete workflow + verified refs)

Конкретный сценарий ложного расхождения: агент в чате спрашивает MCP `get_spec_status`, видит `lifecycle: PARTIAL`, а в терминале `spec-status` рисует `progress_percent: 87% / phase: Finalization`, и ни одно из них не равно тому, что напечатает `spec-verdict.ts` (`verdict: GREEN` + `readiness.overall: NOT_READY`). Три числа про одну спеку, ни одно не совпадает по словарю — и человек не может сказать, что на самом деле «готово».

Что проверено в коде (все ссылки — на текущее дерево):

1. **CLI `spec-status` — полностью отдельный путь, НЕ импортирует spec-graph.**
   - `tools/specs-generator/spec-status.ts` (L1–16) — 16-строчный exec-wrapper, который спавнит `node specs-generator-core.mjs spec-status …` (L10).
   - Настоящая логика — `commandSpecStatus` в `tools/specs-generator/specs-generator-core.mjs` (dispatch L3744–3745, тело ~L1359).
   - Импорты: только node-builtins (L1–4) + динамический `./acceptance-task-coverage.mjs` (L2029). **Ни одного модуля из `tools/spec-graph/`.**
   - Своя модель: `progress_percent`, `phase`/`sub_phase` (Discovery→…→Complete), per-file `status: 'complete'|'partial'|…`, `next_action`, `blockers` (рендер ~L361–400; парсинг TASKS по регекспу `parseTasksForTable` L296–360, статус-регексп L335 = `TODO|IN_PROGRESS|DONE|BLOCKED`). Это **структурный/placeholder-прогресс, а не тестовый вердикт**.

2. **MCP `get_spec_status` — локальный inline-rollup.**
   - `tools/spec-mcp-server/tools.ts`: `get_spec_status` (L1206), coverage — это **view** внутри него (L1300, «folds in former get_coverage»).
   - Использует общие примитивы: `readVerdicts` (L1316/1408/1415), `computeCoverage` (L1317/1324/1408/1415), `checkConformance`+`gapsFromFindings`+`summariseGaps` (L1448), `buildReadinessInventory`+`evaluateReadiness` (L1449–1450); плюс `compareBddSync`/`latestFilteredProof`, **импортированные из spec-verdict.ts** (L86).
   - **НО** итоговый вердикт — локальная inline-реderivация: `lifecycle: 'SPEC_ONLY'|'TESTS_NOT_RUN'|'RED'|'PARTIAL'|'GREEN'` считается прямо в хендлере (L1436–1445), отдельно от собираемого рядом блока `readiness` (L1450–1474).

3. **Audit `spec-verdict.ts` — «авторитетный», но со СВОИМ словарём и дублями типов.**
   - Заголовок: «the AUTHORITATIVE spec-health verdict entrypoint (FR-37)» (L3). `runSpecVerdict` (L413).
   - Зовёт те же примитивы: `checkConformance` (L445), `computeCoverage` (L497/504), `readVerdicts` (L444), `runJudge` (L544).
   - **Другой итоговый словарь**: `verdict: 'RED'|'GREEN'` (L100, выводится L586 = `gapList.length>0`) + `readiness.overall: 'READY'|'NOT_READY'`.
   - **Переобъявляет СОБСТВЕННЫЕ** `ReadinessLaneName` (L55, точная копия `readiness-inventory.ts` L472) и `ReadinessLaneStatus` (L64, расходящаяся копия канонического `SurfaceLaneStatus` из `readiness-inventory.ts` L507). Импортирует только `buildReadinessInventory, deriveExecutionLane` (L41), **не** `evaluateReadiness` — собирает lanes сам (обработка lanes L686–694).
   - Экспортирует `compareBddSync` (L275) и `latestFilteredProof` (L322) — **именно их импортирует MCP** (`tools.ts:86`): единственное реальное переиспользование между поверхностями.

4. **TUI / statusline — третий, вообще не связанный словарь тест-ранa.**
   - `tools/tui-test-runner/tui/widgets/compact_bar.py` — рендерит счётчики тест-рана (passed/failed/skipped, иконки `TestState` ~L21–48); **словаря spec-вердикта тут нет**.
   - Каноническая схема: `tools/test-statusline/status_types.ts` (L16–35) — `TestStatus.state: 'idle'|'running'|'passed'|'failed'|'error'`, читается из плос status-v2 YAML. **Связи с `spec-graph` нет.**

### Таблица словарей (одно понятие — разные метки)

| Понятие | Где определено | Значения |
|---|---|---|
| last-result сценария | `coverage.ts` `Bucket` (L23) | `passed\|stale\|pending\|undefined\|ambiguous\|failed\|skipped\|not_run` |
| здоровье FR | `fr-census.ts` `FrCensusVerdict` (L47) | `IMPLEMENTED\|DONE_UNTESTED\|IN_PROGRESS\|PLANNED\|UNIMPLEMENTED`; отчёт `verdict/strictVerdict: GREEN\|RED` (L102–104) |
| качество теста | `coverage.ts` `TestQualityVerdict` (L26) | `STRONG\|WEAK\|FAKE-POSITIVE-RISK` |
| done-rollup MCP | `tools.ts` `lifecycle` (L1436) | `SPEC_ONLY\|TESTS_NOT_RUN\|RED\|PARTIAL\|GREEN` |
| done в spec-verdict | `spec-verdict.ts` (L100, L586) | `verdict: RED\|GREEN` + `readiness.overall: READY\|NOT_READY` |
| done в CLI | `specs-generator-core.mjs` `commandSpecStatus` | `phase` + `progress_percent` + per-file `complete/partial` |
| done в TUI | `status_types.ts` `TestStatus.state` (L23) | `idle\|running\|passed\|failed\|error` |

### Доказуемые двойные определения

- (a) lane-типы определены **дважды** — `ReadinessLaneName` идентично в `readiness-inventory.ts` (L472) и `spec-verdict.ts` (L55); lane-status продублирован как канонический `SurfaceLaneStatus` (`readiness-inventory.ts` L507) и расходящийся `ReadinessLaneStatus` (`spec-verdict.ts` L64).
- (b) «тест прошёл/упал» живёт и как `coverage.ts Bucket` (8 состояний), и как `TestStatusV2.state` (5 состояний) **без общего типа**.
- (c) «спека done» существует в **четырёх** итоговых словарях.

### Что уже намекает на «единый источник» (но не доделано)

- `spec-verdict.ts:3` объявляет себя «AUTHORITATIVE»; правило `spec-verdict/no-structural-valid` (FR-37d) назначает его вердиктом здоровья.
- MCP-комментарий `tools.ts:1297–1299` отмечает, что coverage-view «folds in former get_coverage» — консолидация **перенесла данные, но не итоговый rollup**.
- MCP уже переиспользует `compareBddSync`/`latestFilteredProof` из spec-verdict (`tools.ts:86`) — **доказательство, что вынесение работает**; но итоговые `lifecycle`/`verdict` по-прежнему пишутся вручную на каждой поверхности.

**Итог:** примитивы общие, **итоговый вердикт — нет**. Это и есть drift, который надо схлопнуть.

## Before / after

**Before** — три поверхности, три ответа про одну спеку:

```text
$ npx tsx tools/specs-generator/spec-status.ts -Path .specs/foo
phase: Finalization   progress_percent: 87   next_action: "закрыть P21-5"
# (свой регексп-парсинг TASKS.md, spec-graph не импортирован)

MCP get_spec_status({spec:"foo"})
{ "lifecycle": "PARTIAL", "readiness": { "overall": "NOT_READY", ... } }

$ npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/foo
verdict: GREEN        # gapList пуст
readiness.overall: NOT_READY   # ← противоречит verdict: GREEN
```

**After** — один канонический объект, все поверхности его читают:

```text
# spec-graph/verdict.ts — ЕДИНСТВЕННАЯ точка сборки
computeSpecVerdict(graph, {spec:"foo"}) →
{
  "spec": "foo",
  "verdict": "NOT_READY",          // один словарь SpecVerdict (см. ниже)
  "blocking": [                     // единый gap-список (истина для RED/NOT_READY)
    { "code": "UNVERIFIED_COMPLETION", "node": "foo:FR-7", "severity": "error",
      "message": "FR-7 помечен done, но ни один mapped-сценарий не PASSED" }
  ],
  "readiness": { "overall": "NOT_READY", "lanes": { "TASK_TRUTH": "red", ... } },
  "frs": { "foo:FR-7": "DONE_UNTESTED", "foo:FR-3": "IMPLEMENTED" }
}
```

CLI/MCP/TUI/audit получают **один и тот же объект** и лишь по-разному его рендерят (CLI — строкой, MCP — JSON, statusline — компактной строкой `foo: NOT_READY · 1 blocking`). `verdict: GREEN` при `readiness.overall: NOT_READY` **становится непредставимым** — это одно поле, а не два.

## Предлагаемое поведение (Proposed behavior)

1. **Новый модуль-агрегатор** `tools/spec-graph/verdict.ts` (или расширение `spec-verdict.ts` до библиотечной функции) с одной экспортируемой чистой функцией:
   ```ts
   export type SpecVerdict = 'GREEN' | 'RED' | 'NOT_READY';
   export function computeSpecVerdict(graph: SpecGraph, opts: { spec?: string; semantic?: boolean }): SpecVerdictResult;
   ```
   Функция композирует уже существующие примитивы (`readVerdicts` + `computeCoverage` + `checkConformance` + `buildReadinessInventory`/`evaluateReadiness` + `computeFrCensus` + semantic-судью) и возвращает **один объект** `{ verdict, blocking[], readiness, frs }`.

2. **Один словарь итоговых меток.** `SpecVerdict` = `GREEN | RED | NOT_READY` (или `GREEN/RED` + отдельное булево `ready`). Текущий MCP-`lifecycle` (`SPEC_ONLY|TESTS_NOT_RUN|...`) и CLI-`phase/progress_percent` становятся **производными view** этого объекта, а не самостоятельными rollup'ами.

3. **Все четыре поверхности — тонкие рендереры:**
   - `tools/specs-generator/spec-status.ts` → вызывает `computeSpecVerdict` вместо регексп-подсчёта (структурный `phase/progress` остаётся **дополнительным** view, но итоговый «done» берётся из вердикта).
   - `tools/spec-mcp-server/tools.ts::get_spec_status` → возвращает `computeSpecVerdict(...)`; inline-`lifecycle` (L1436–1445) удаляется/становится маппингом.
   - `tools/specs-generator/spec-verdict.ts` → CLI-обёртка над той же функцией; **удаляются** локальные дубли `ReadinessLaneName` (L55) и `ReadinessLaneStatus` (L64) — импорт `ReadinessLaneName`/`SurfaceLaneStatus` из `readiness-inventory.ts` (L472/L507).
   - statusline/TUI → читает кэшированный `SpecVerdictResult` (например, из `.dev-pomogator/.spec-verdict.json`), а не считает сам.

4. **Инвариант «одного поля»:** `verdict` и `readiness.overall` выводятся из одного `blocking[]`; состояние «GREEN, но NOT_READY» запрещено типом.

### Малый формат данных (API in/out)

```jsonc
// OUT: computeSpecVerdict / MCP get_spec_status / файл .dev-pomogator/.spec-verdict.json
{
  "spec": "foo",
  "schema": "spec-verdict@1",
  "verdict": "NOT_READY",
  "blocking": [
    { "code": "UNCOVERED_FR",        "node": "foo:FR-11", "severity": "error" },
    { "code": "UNVERIFIED_COMPLETION","node": "foo:FR-7", "severity": "error" }
  ],
  "readiness": { "overall": "NOT_READY", "firstBlocking": "TASK_TRUTH" },
  "frs": { "foo:FR-7": "DONE_UNTESTED", "foo:FR-3": "IMPLEMENTED", "foo:FR-11": "PLANNED" }
}
```

## Scope

**In scope:**
- Одна функция `computeSpecVerdict` + один тип `SpecVerdictResult`/`SpecVerdict` в `tools/spec-graph/`.
- Перевод 4 поверхностей на чтение этой функции (CLI, MCP, spec-verdict CLI, statusline/TUI).
- Удаление дублей lane-типов из `spec-verdict.ts` (`ReadinessLaneName` L55, `ReadinessLaneStatus` L64 → импорт `ReadinessLaneName`/`SurfaceLaneStatus` из `readiness-inventory.ts`); единый словарь итоговых меток.
- Инвариант «verdict и readiness.overall из одного blocking[]».
- BDD-сценарии на совпадение вердикта между CLI/MCP/audit для одной спеки.

**Out of scope:**
- Новые виды находок (UNVERIFIED_COMPLETION и пр.) — это Tier-1 #4; здесь лишь **единая точка**, куда они стекаются.
- Сам расчёт evidence-состояний (Tier-1 #3), fail-closed rollup зависимостей (Tier-1 #2), reverse-аннотации (Tier-1 #5) — используют ту же единую точку, но не реализуются здесь.
- Переписывание semantic-судьи (FR-8) и BDD-миграция (FR-51).

## Вероятные точки реализации (verified paths)

- `tools/spec-graph/verdict.ts` — **новый** модуль-агрегатор (чистая функция над графом).
- `tools/spec-graph/coverage.ts` (`computeCoverage`, `Bucket` L23, `TestQualityVerdict` L26) — вход, не менять.
- `tools/spec-graph/fr-census.ts` (`computeFrCensus` L121, `FrCensusVerdict` L47) — вход для `frs`.
- `tools/spec-graph/conformance.ts` (`checkConformance`, `FindingCode`) — вход для `blocking[]`.
- `tools/spec-graph/readiness-inventory.ts` (`buildReadinessInventory`/`evaluateReadiness`, `ReadinessLaneName` L472 / `SurfaceLaneStatus` L507) — **единственный** владелец типов lanes.
- `tools/specs-generator/spec-verdict.ts` (L3, L55/L64 дубли, L413 `runSpecVerdict`, L586 `verdict`) — перевести на `computeSpecVerdict`, удалить дубли типов.
- `tools/specs-generator/spec-status.ts` (L1–16 wrapper) + `specs-generator-core.mjs` (`commandSpecStatus` ~L1359, dispatch L3744) — заменить регексп-rollup на чтение вердикта.
- `tools/spec-mcp-server/tools.ts` (`get_spec_status` L1206, coverage-view L1300, inline `lifecycle` L1436–1474) — вернуть `computeSpecVerdict`.
- `tools/test-statusline/status_types.ts` (L16–35) + `tools/tui-test-runner/tui/widgets/compact_bar.py` — читать кэшированный `SpecVerdictResult`.

## Наблюдаемый end-to-end acceptance (включая BDD и реальные артефакты)

- [ ] `computeSpecVerdict(graph,{spec})` — единственная функция, которую зовут CLI/MCP/spec-verdict/statusline; grep подтверждает отсутствие второго итогового rollup'а (нет inline `lifecycle` в `tools.ts`, нет дублей `ReadinessLaneName`).
- [ ] На **одной реальной спеке** `.specs/spec-generator-v4/`: вывод CLI `spec-status`, MCP `get_spec_status` и `spec-verdict --json` дают **один и тот же** `verdict` и `blocking[]` (сверка `jq` по полю `verdict`).
- [ ] Состояние «`verdict: GREEN` при `readiness.overall: NOT_READY`» **невозможно** (проверка типа + negative-pin тест).
- [ ] Удалены дубли lane-типов из `spec-verdict.ts` (`ReadinessLaneName` L55, `ReadinessLaneStatus` L64); один источник — `ReadinessLaneName`/`SurfaceLaneStatus` в `readiness-inventory.ts`.
- [ ] **BDD**: сценарий(и) в `.specs/spec-generator-v4/spec-generator-v4.feature` (новые slug-id, напр. `SPECGEN004_1xx`) — «verdict идентичен между CLI/MCP/audit для спеки X» и «GREEN⇒READY инвариант»; прогон **только в Docker** (`scripts/docker-bdd.sh`), `lastResult===PASSED` по slug-id, не по отсутствию в fail-list (правило `cucumber-expression-parens`).
- [ ] Реальный артефакт: `.dev-pomogator/.spec-verdict.json` пишется и читается statusline; фикстура зеркалирует реальный вывод (правило `verify-against-real-artifact`).

## Совместимость / миграция

- **MCP-контракт**: поле `lifecycle` в `get_spec_status` — оставить как **производное** (маппинг из `verdict`+состояния тестов) на один релиз, пометить deprecated; consumers (скилы `spec-status`, `spec-mcp-dogfood`, `runtime-dogfood`) переводятся на `verdict`.
- **CLI `spec-status`**: `phase`/`progress_percent`/`next_action` остаются (это структурный UX), но итоговый «done» берётся из вердикта; формат вывода расширяется, не ломается.
- **spec-verdict CLI**: флаг `--json` сохраняет форму, добавляется единое поле `verdict`; существующие gate-скрипты (exit 1 на RED) продолжают работать.
- **Удаление дублей типов** — внутреннее, на публичный API не влияет.
- Миграция по шагам: (1) добавить `computeSpecVerdict`; (2) перевести spec-verdict CLI; (3) перевести MCP; (4) перевести CLI/statusline; (5) удалить дубли + deprecated-маппинг.

## Связанные issue

- **#162** — spec-generator-v4 closure program (evidence truth, BDD rollout, post-#158 gaps): **зонтик**; этот issue — его подзадача «один вердикт».
- **#167** — traceability matrix/graph views **из авторитетного графа**: тот же принцип «один источник — много view».
- **#171** — schema-validated requirement metadata: метаданные верификации будут читаться тем же вердиктом.
- **#169** — требование декларирует нужные типы артефактов: вход для blocking-находок вердикта.
- Внутренние предшественники: правило `spec-verdict/no-structural-valid` (FR-37d), FR-37 (smart verdict authoritative), FR-32 (evidence-derived status).

## Prior art (прямые ссылки + заимствуемая механика)

1. **StrictDoc — `TraceabilityIndex` как единственный авторитетный индекс, собираемый ОДИН раз и читаемый всеми поверхностями.**
   `strictdoc/core/traceability_index.py`, `class TraceabilityIndex` (L51): https://github.com/strictdoc-project/strictdoc/blob/main/strictdoc/core/traceability_index.py#L51
   Индекс строится один раз при загрузке проекта, а HTML-экспорт, web-сервер и CLI **читают его**, не пересчитывая трассируемость. **Заимствуем механику:** spec-graph собирает `SpecVerdictResult` один раз, а CLI/MCP/TUI/audit — лишь разные рендереры одного объекта.

2. **Kubernetes — одно условие `PodReady`, вычисляемое kubelet'ом и читаемое всеми потребителями (kubectl / API / scheduler / controllers).**
   `kubernetes/kubernetes/pkg/api/v1/pod/util.go`, `func IsPodReady` (L297): https://github.com/kubernetes/kubernetes/blob/master/pkg/api/v1/pod/util.go#L297
   `IsPodReady` → `IsPodReadyConditionTrue(pod.Status)`: готовность — это **одно вычисленное условие** в `status`, а не пересчёт на каждом потребителе. **Заимствуем механику:** «готовность» спеки — одно поле, вычисленное ядром; все поверхности его читают, и ни одна не имеет права пересчитать «done» по-своему.

