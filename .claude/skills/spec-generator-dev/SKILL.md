---
name: spec-generator-dev
description: >
  Maintenance & development discipline for the spec-generator-v4 subsystem (the spec-graph,
  its parsers, the MCP server, the authoritative verdict, the judge, the backlog resolvers and
  the auditors). INVOKE when: fixing ANY defect found in spec docs or graph output («почини
  спеку/граф/вердикт», «откуда этот мусор в FR.md», «false positive у audit/conformance»),
  extending the subsystem (new MCP tool, new check, new resolver), or reviewing a change that
  touches tools/spec-graph / tools/spec-mcp-server / tools/specs-generator / tools/spec-backlog /
  tools/spec-llm-judge. Triggers (RU): «поддержка спек-генератора», «разработка спек-плагина»,
  «почини генератор спек», «producer-фикс», «кто породил этот дефект», «ревью спек-генератора», «почини вердикт/счётчик/граф/хук спек», «оживи guard», «ложная находка», «шум в счётчике». Triggers (EN): "spec
  generator dev", "maintain the spec plugin", "producer fix", "what produced this defect", "review the spec generator", "false finding", "noisy counter".
  Do NOT use for authoring a spec's CONTENT (create-spec), per-spec health (spec-status /
  spec-verdict), or corpus hygiene runs (corpus-health).
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
---

# spec-generator-dev — миссия и дисциплина развития спек-генератора

## МИССИЯ

**Чинить ПРОИЗВОДИТЕЛЕЙ дефектов, а не симптомы.** Каждый мусорный артефакт в спеках
(фантомный FR, ложная находка аудита, шумное ребро графа, повисший статус) был кем-то
ПОРОЖДЁН — скриптом, резолвером, парсером, чекером или воркфлоу-привычкой агента. Удалить
артефакт = симптоматика; обязанность этого скилла — найти генератор и закрыть класс:

1. **Найди производителя.** Грепни уникальную сигнатуру артефакта («[TBD title]», «### Citations»,
   формат сообщения находки) по `tools/` и `.claude/skills/*/scripts/` — у каждого генератора
   есть отпечаток.
2. **Почини класс у источника** — и у каждого ПОТРЕБИТЕЛЯ той же сырой логики (инцидент
   2026-06-06: `FR-(\d+)`-харвестинг без выреза код-спанов жил в ТРЁХ местах — fr-author,
   tasks-парсер, LINK_VALIDITY-чек; одна болезнь, три носителя).
3. **Регрессия на инцидент** — тест, воспроизводящий именно тот случай, который прорвался.
4. **Симптом убери последним** — и в коммите назови оба: производителя и класс.

## Карта подсистемы (где что порождается)

| Слой | Файлы | Порождает | Типовая болезнь |
|---|---|---|---|
| Парсеры | `tools/spec-graph/parsers/{md,gherkin,tasks,ndjson,…}.ts` | узлы/рёбра/refs/anchors | харвестинг id из прозы/примеров; небрежная квалификация (FR-36) |
| Builder | `tools/spec-graph/builder.ts` | один граф, implements-рёбра, bare-edge резолюция | last-writer схлопывание при коллизии ключей |
| Чекеры | `conformance.ts`, `traceability.ts`, `corpus-health.ts` | findings/gaps | неякорённые regex (false positives), несвязанная с рёбрами семантика тегов |
| Audit | `tools/specs-generator/specs-generator-core.mjs` | P0/warnings | `## FR-N:` без `^…m` ловит примеры в прозе |
| Вердикт | `tools/specs-generator/spec-verdict.ts` | RED/GREEN + gap list | пропущенный слой = тихое false-green (всегда fail-loud ноты) |
| MCP | `tools/spec-mcp-server/{tools,server}.ts` + `server.bundle.mjs` | 14 тулзов | забытый rebuild бандла = юзеры без фикса; bare-id двусмысленность |
| Judge | `tools/spec-llm-judge/` | DRIFT-вердикты | трактовать SUBPROCESS_FAILED как «no drift» |
| Резолверы | `tools/spec-backlog/resolvers/*.ts` | ПИШУТ В СПЕКИ | главный риск мусора: создают артефакты из ошибочно-понятых цитат |

## Верификационная батарея (после ЛЮБОЙ правки слоя)

```bash
node --import tsx tools/spec-graph/collision-probe.ts                       # 0 коллизий
node --import tsx tools/spec-graph/corpus-health.ts                        # организм
npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/<slug> [--no-semantic]
node --import tsx tools/spec-mcp-server/dogfood-dataset.ts                 # 14/14 LIVE
node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js          # BDD 0 failed
# vitest по слою (через wrapper): tools/spec-graph/__tests__ + tools/spec-mcp-server/__tests__
npm run build:mcp   # ОБЯЗАТЕЛЬНО при правке tools.ts/server.ts — иначе юзеры плагина без фикса
```

Вердиктные прогоны Docker-сьюта — только из ЧИСТОГО worktree (`git worktree add ../confirm <sha>`),
общее дерево мутируют параллельные сессии (issue #49).

## САМОПРОВЕРКА перед «готово» (не жди вопроса «сам проверил?»)

После ЛЮБОЙ правки — прогони проверку В ЭТОМ ЖЕ ходе и процитируй вывод; «готово» без улики = факап.
Особые классы, которые ОБЯЗАН проверять активно (горьким опытом):

1. **Guard/чек, доверяющий ДЕКЛАРАЦИИ (таблица/список/мапа), ОБЯЗАН проверять, что декларация ПРАВДИВА против реальности.** «Запись в таблице непуста» ≠ «запись истинна». Инцидент 2026-06-07 (поймал юзер «сам проверил?»): `checkToolConsumers` проверял, что у тула ЕСТЬ потребитель в `TOOL_CONSUMERS`, но не что скилл-потребитель РЕАЛЬНО использует тул — 2 ложные записи (spec-status за get_coverage/get_spec_status) прошли. Фикс: `verifyConsumerTruthfulness` грепает SKILL.md каждого заявленного потребителя; в drift-check как третий гейт. **Паттерн фикса универсален: на каждую trust-таблицу — companion-чек «декларация == реальность», и тест на ЛОЖНУЮ запись.**
2. **Новый guard/чек ОБЯЗАН падать на ПОДСАженном нарушении** (planted-violation тест), иначе он inert (см. конформанс-инцидент: гейт фильтровал severity, которой не бывает).
3. **Хук — registered LIVE в обоих манифестах + deps-absent + пин** (класс пяти мёртвых стражей).

## Реестр инцидентов → producer-фиксов (пополняй при каждом новом классе)

| Инцидент | Производитель | Фикс |
|---|---|---|
| 9 авто-[TBD] FR-скелетов из примеров в AC | `spec-backlog/resolvers/fr-author.ts` — голый `FR-(\d+)` харвест | вырез код-спанов/fence + plausibility (zero-padded twin, numbering range) + регрессия в `__tests__/fr-author.test.ts` |
| LINK_VALIDITY false positives на прозе | `core.mjs` — `## FR-N:` без `^…m` | ^-якоря (TASKS-link + AC-link чеки) |
| ORPHAN_TASK из evidence-прозы | `parsers/tasks.ts` — refs из всего тела | вырез код-спанов перед харвестом |
| 47-из-470 FR (last-writer) | `builder.ts` bare-ключи | композитные `<slug>:<localId>` (FR-36, P13) |
| get_trace мёртв при зелёном сьюте | рёбра не строились, сьют ходил side-channel-ом | @featureN → реальные рёбра + dogfood-сэмплер предпочитает FR с ребром |
| blanket-тег ≠ семантика (11 дрифтов @FR-19) | агентская привычка «закрыть гейт одним тегом» | механический страж `TAG_BULK_SUSPECT` в conformance (≥10 сценариев под одним req-тегом в файле → INFO с указателем на judge) + FR-8 semantic в вердикте; пере-тег по-сценарно |
| missing-fr из inline-примеров (upstream) | `cross-spec-reconcile/reconcile.ts` стрипал fence, но не inline-спаны | `stripCodeExamples()` (fence + inline) в citation-пути |
| PARTIAL_IMPL false positive | core.mjs: неякорённый heading-трекер + маркеры в бэктиках (`PARTIAL` как enum-литерал) | ^-якорь + fence-skip + вырез код-спанов перед маркер-матчем |
| Структурный pass = «valid» | привычка агента | правило `no-structural-valid.md` + FR-37d гарды в скиллах |
| Свежий scaffold рождался RED (7 audit ERROR + 3 UNTAGGED из коробки) | `tools/specs-generator/templates/` — FR-3/4/5 без AC/UC-ссылок, edit-row на несуществующий путь, сценарии без тегов | FR/AC-шаблоны с полными перекрёстными ссылками, FILE_CHANGES placeholder → create + warning, feature.template с реальными @FR-N; live-proof: scaffold → verdict GREEN at birth |
| Псевдо-тег `# @featureN` (комментарий — парсер не видит → UNTAGGED, рёбер нет) | ПРОМПТЫ-учителя: `extension-test-quality.md` (root), `feature-creation-rules.md`, `phase3plus_audit-logic-gaps.md`, `requirements-chk-matrix` | все 4 носителя переписаны на НАСТОЯЩИЙ Gherkin-тег (читать оба формата, ПИСАТЬ только реальный) |
| «validate-spec: 0 errors» как финальная валидация в workflow | `phase3_finalization.md` шаг 3 | двухуровневая финализация: pre-filter + `spec-verdict --no-semantic` GREEN (FR-37a/d) |
| Весь enforcement-слой создающей стороны мёртв (5 form-guards без единой живой регистрации; meta-guard охранял несуществующее; скиллы обещали «guard will deny») | регистрация терялась при v1→v2 миграции манифестов; ни один тест не проверял ЖИВОСТЬ регистрации (только прямой спавн) | `form-guards-dispatch.ts` live в обоих манифестах + самозащита в meta-guard + пин в SPECGEN004_52 + дисциплина: для каждого hook-артефакта проверять «registered in a LIVE manifest», не только «код+тест есть» |
| Скилл инструктирует формат, который его же guard режет (CHK-NFR id; lowercase Jira-маркеры) | SKILL.md и guard-регекс эволюционировали независимо, evals нет | скиллы переписаны под guard-контракт + построен `--check` CLI (был фантомом в 3 скиллах) + P16-2: evals с negative-кейсами на оба класса |
| Счётчик читает СВОЙ выдуманный envelope, а не producer-овский (FR-20 hard-tier искал `code`, реальный writer пишет `finding_code` — реальные находки не считались никогда; тесты сеяли рукодельный конверт) | новый потребитель лога написан без чтения composeEntry соседнего модуля | поле из producer-а (`finding_code ?? code`), тест-сидер через РЕАЛЬНЫЙ composeEntry; пойман SPECGEN004_122 на первом прогоне |
| «Unresolved DENY» считал НЕ-denies (фикс выше открыл глаза счётчику → 1401 push-info-находка → 1052 в шапке) | общий JSONL-шард делят DENY-продюсер и side-channel push; счётчик не фильтровал source | фильтр `source !== 'spec-conformance-push'` + дисциплина: новый потребитель ОБЩЕГО лога перечисляет считаемые source-ы |
| Класс NO-SCEN: FR реализован+vitest, но 0 BDD-сценариев → невидим tested-by слою (FR-23/28) | vitest-only верификация проходит все гейты задач | per-FR срез в spec-status (шаг 5b) детектит класс; закрытие = сценарий на РЕАЛЬНОМ коде |
| Guard доверяет ДЕКЛАРАЦИИ, не проверяя её правдивость (FR-42a `checkToolConsumers`: «потребитель есть в таблице» ≠ «скилл реально юзает тул»; 2 ложные записи прошли — поймал юзер «сам проверил?») | trust-таблица без companion-чека «декларация == реальность» | `verifyConsumerTruthfulness` (грепает SKILL.md заявленного потребителя) третьим гейтом drift-check + unit на ЛОЖНУЮ запись; самопроверка-класс №1 выше |

## Связанные

- Правило: `.claude/rules/spec-verdict/no-structural-valid.md` (FR-37d)
- Скиллы-соседи: `corpus-health` (организм), `spec-graph-query` (читать граф),
  `spec-mcp-dogfood` (рантайм-перепись тулзов), `spec-status` (per-spec вердикт)
- Спека: `.specs/spec-generator-v4/` (FR-36/37/38 — identity, вердикт, lifecycle)
- Архивы: `audit-reports/fr36-dogfood-before-after.md`, `audit-reports/fr8-semantic-drift-inventory.md`
