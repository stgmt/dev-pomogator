# spec-generator-v4: что осталось после PR #158

Дата среза: 2026-07-23  
Репозиторий: `stgmt/dev-pomogator`  
Проверенный `main`: `5e4dc4a0a3acb51cfc55ca68ea02c31f0653bafb`  
Предыдущий пользовательский отчёт сохранён отдельно и не изменён: `issue-triage-spec-generator-door-2026-07-22.md`.

## Короткий вердикт

PR [#158](https://github.com/stgmt/dev-pomogator/pull/158) закрыл свой scope полностью: live spec-граф хранит полный canonical Docker run из 526/526 зелёных сценариев, ноль execution gaps, зелёные traceability/BDD-sync/filtered-proof lanes и отдельно зелёный `SPECGEN004_565`. Но этот canonical snapshot сейчас считается stale относительно текущего HEAD, поэтому это сильный исторический proof PR, а не свежая SHA-bound переаттестация всей спеки.

Вся `spec-generator-v4` остаётся `NOT_READY` по двум классам старого backlog:

1. `TASK_TRUTH=RED`: 45 задач объявлены `Status: DONE`, но внутри осталось суммарно 147 unchecked-пунктов `Done When`.
2. Ещё 36 задач вообще не `DONE`: 2 `IN_PROGRESS` + 34 `TODO`.

Это не 81 доказанная регрессия PR #158. Независимая проверка не доказала ни одного нового implementation gap именно внутри группы 45; все они пока `CLAIMED_ONLY/checklist drift`, а не `VERIFIED`. Для группы 36 минимум 17 задач выглядят реально открытым старым scope; остальные 19 из Phases 33–37 имеют зелёные canonical scenarios, но формально всё ещё TODO и не могут быть bulk-closed из-за найденных live contract gaps.

Но и считать все 45 «просто забытыми галочками» нельзя:

- Все 45 имеют mapped BDD-сценарии в графе; 37 прямо называют полный `SPECGEN004_*` id в собственном task-блоке, а у 8 связь видна только через graph mapping/соседние ссылки.
- Canonical run зелёный, но отдельные пункты `Done When` могут быть шире сценария, а effective coverage на HEAD сейчас `0 passed / 526 stale`.
- минимум 5 записей сами признают непройденную live-проверку, устаревший backlog, сознательно не выполненный глобальный flip или требуемый corpus artifact. Это ещё не доказывает отсутствие кода, но запрещает автоматически считать task VERIFIED.
- некоторые `Done When` ссылаются на уже удалённую v1/v2 архитектуру (`extensions/`, `.claude/...`) и должны быть переписаны под каноническую структуру, а не механически отмечены.

После вчерашнего отчёта появились/остались шесть релевантных открытых issues: [#149](https://github.com/stgmt/dev-pomogator/issues/149), [#153](https://github.com/stgmt/dev-pomogator/issues/153), [#157](https://github.com/stgmt/dev-pomogator/issues/157), [#159](https://github.com/stgmt/dev-pomogator/issues/159), [#160](https://github.com/stgmt/dev-pomogator/issues/160), [#161](https://github.com/stgmt/dev-pomogator/issues/161). Из них #153, #157 и #161 — реальная новая работа; #159 надо сузить до отсутствующего `missingAll`; #160 в нынешней формулировке смешивает штатный policy-deny `exit(2)` с падением раннера; #149 и #161 надо проектировать одним workstream.

## 1. Найденная зависшая сессия

Основная сессия:

- id: `019f8a0f-fbc5-7b40-98ad-627d168a841b`;
- JSONL: `C:\Users\stigm\.codex\sessions\2026\07\22\rollout-2026-07-22T16-42-16-019f8a0f-fbc5-7b40-98ad-627d168a841b.jsonl`;
- рабочий каталог: `E:\repos\dev-pomogator`;
- связанная независимая проверка spec-status: `019f8bdd-c9d1-7102-b322-4ed8b0fc2f7a`, task `/root/independent_spec_status`.

Сессия не оборвалась внутри merge: её последний сохранённый ход успешно закончил PR #158 и записал финальный ответ. Последний сохранённый пользовательский запрос там — «фикси». Сообщения с вопросом «что дальше» в JSONL нет. Значит, завис интерфейс до персистентной записи нового вопроса; продолжать надо из текущей сессии, а не ждать восстановления потерянного хода.

## 2. Текущее состояние по живому spec-графу

| Сигнал | Фактическое состояние |
|---|---|
| Spec status | `active` |
| Lifecycle | `GREEN` |
| Граф | 65 FR, 175 AC, 526 scenarios, 243 tasks |
| Последний canonical run | `2026-07-22T21:52:13.089Z`, source `docker-bdd:full` |
| Canonical coverage snapshot | 526 passed, 0 failed/pending/undefined/skipped/stale |
| Effective coverage на HEAD | 0 passed, 526 stale |
| Execution gaps | 0 scenario-not-run, 0 FR-unverified |
| Readiness | `NOT_READY` |
| TRACEABILITY | `GREEN` |
| EXECUTION | `GREEN` |
| BDD_SYNC | `GREEN` |
| FILTERED_PROOF | `GREEN`, последний `SPECGEN004_565` passed |
| TASK_TRUTH | `RED`, ровно 45 debt entries |
| Явные non-DONE tasks | 36: 2 IN_PROGRESS + 34 TODO |
| Finalization STOP | не подтверждён |

Есть диагностический рассинхрон поверх данных: обычный `coverage` view показывает все 526 сценариев как `stale` и все 243 задачи как `IN_PROGRESS`, тогда как в том же ответе `canonical_coverage` содержит 526 passed, а readiness lane `EXECUTION` — `GREEN`. Smart verdict при этом инвентаризует 518 сценариев, а MCP — 526: восемь повторяющихся scenario keys (`471`, `472`, `480`, `507`, `531`, `532`, `553`, `560`) схлопываются.

Это не доказательство падения реализации, но это реальный status-contract gap: stale current evidence не должно одновременно выглядеть как безусловный зелёный execution verdict. До исправления наружу следует показывать canonical snapshot отдельно от effective HEAD coverage и не смешивать их в один «статус готовности».

## 3. Что именно входит в 45 старых task-truth долгов

### Расклад по старым фазам

| Старая фаза | Задач |
|---|---:|
| Phase 1 — graph builder + parsers | 8 |
| Phase 2 — MCP server + hooks | 8 |
| Phase 3 — LLM + multi-language | 2 |
| Phase 4 — SQLite/log/Codespaces | 5 |
| Phase 5 — migration helper | 2 |
| Phase 6 — architecture research | 1 |
| Phase 7 — cross-spec reconciliation | 4 |
| v3 transition closure | 4 |
| Phase 12 — honesty hardening | 2 |
| Phase 17 — MCP rails | 3 |
| Phase 26 — waived-close gate | 1 |
| Phase 30 — scaffold completeness | 5 |
| **Всего** | **45** |

### Полный список

- Phase 1: `graph-types`, `md-parser-impl`, `gherkin-parser-impl`, `ndjson-ingester-impl`, `graph-builder-impl`, `incremental-rebuild`, `conformance-checker`, `verify-phase1-green`.
- Phase 2: `mcp-tool-get-trace`, `mcp-tools-rest`, `pretooluse-hard-hook`, `posttooluse-push-hook`, `bash-post-test-hook`, `marksman-installer`, `file-watcher-impl`, `lock-manager-impl`.
- Phase 3: `semantic-drift-check`, `multi-lang-extractor`.
- Phase 4: `sqlite-index`, `sqlite-recovery`, `spec-check-log`, `codespaces-detector`, `devcontainer-poststartcommand`.
- Phase 5: `heading-converter`, `interactive-prompt`.
- Phase 6: `arch-research-scripts`.
- Phase 7: `impl-resolve-loop`, `impl-architectural-detection`, `register-skills-in-manifest`, `e2e-test-reconcile-roundtrip`.
- v3 transition: `verify-fr-19-failure-tiers`, `verify-fr-22-version-gate`, `verify-fr-23-log-inventory`, `verify-fr-26-llm-deny-list`.
- Phase 12: `ws-b-status-reconcile`, `ws-e-install-e2e`.
- Phase 17: `p17-skill-migration`, `p17-enforce`, `p18-legacy-classifier`.
- Phase 26: `p26-waived-close-gate`.
- Phase 30: `p30-sentinel-classifier`, `p30-audit-category`, `p30-fold-fixtures`, `p30-exclusions`, `p30-corpus-run`.

### Где точно нельзя просто поставить `[x]`

Независимый `get_trace` по всем 45 нашёл mapped scenarios для каждой задачи, поэтому в этой группе нет доказанных новых implementation gaps. Но effective coverage stale, а task-level checklist шире простого наличия связи со сценарием: ни одна из 45 пока не получила статус `VERIFIED`.

1. `ws-b-status-reconcile` сам говорит, что прежний file-existence heuristic ненадёжен, и требует per-task проверки «deliverable + named green scenario». Это мета-задача на честное закрытие остальных долгов.
2. `ws-e-install-e2e` говорит, что буквальный plugin-install e2e не запускался, и одновременно содержит старый текст про ещё не построенные Phase 6/7 slices. Надо отдельно решить, обязателен ли реальный install e2e, и удалить уже протухший backlog-текст.
3. `p17-skill-migration` оставляет непройденный live gate: ноль violations/day на живом прогоне мигрированных skills.
4. `p17-enforce` оставляет сознательно не выполненный глобальный `SPEC_ACCESS_ENFORCE=true` flip. Это решение владельца/политики; задача должна быть либо реально выполнена, либо честно оформлена как waived/blocked, а не `DONE` с unchecked условием.
5. `p30-corpus-run` требует приложенный corpus report и трассировку новых файлов; в блоке нет собственного scenario id.
6. `register-skills-in-manifest` объявлен obsolete, но его `Done When` всё ещё требует удалённый `extensions/specs-workflow/extension.json`. Здесь надо переписать контракт на канонический plugin manifest.
7. Восемь задач не содержат полного собственного scenario id в task-блоке: `graph-types`, `ndjson-ingester-impl`, `mcp-tools-rest`, `impl-architectural-detection`, `register-skills-in-manifest`, `ws-b-status-reconcile`, `p18-legacy-classifier`, `p30-corpus-run`. Graph mapping у них есть, но для каждого `Done When` нужна явная trace/evidence привязка, а не inference из зелёного общего прогона.

### Правильный способ закрытия 45

Для каждой задачи:

1. Сопоставить каждый из 147 `Done When` пунктов с текущим кодом/конфигом/артефактом.
2. Проверить, что названный BDD-сценарий действительно проверяет именно этот пункт, а не соседнюю часть FR.
3. Для runtime/install/corpus/policy пунктов получить live evidence либо перевести задачу в честное `BLOCKED`/waived-состояние с причиной.
4. Переписать устаревшие пути и obsolete-контракты под текущую canonical архитектуру.
5. Только после этого отмечать пункты через spec-door/task-status; blanket replace 147 галочек запрещён по смыслу task-truth gate.
6. После последней правки — новый полный Docker BDD через `/run-tests`, свежий `spec-verdict`, проверка всех readiness lanes и Finalization STOP.

## 4. Ещё 36 задач, которые не `DONE`

### Минимум 17 реально открытых старых задач

- Phase 12: `ws-f-remaining` (`IN_PROGRESS`).
- Phase 21: `p22-design-trace-rest`.
- Phase 27 — BDD rollout: `p27-rollout-local` (`IN_PROGRESS`), `p27-born-bdd`, `p27-gate-switch`, `p27-tail-spec-graph`, `p27-tail-spec-mcp-server`, `p27-tail-spec-backlog`, `p27-tail-anchor-integrity`, `p27-tail-marksman-installer`, `p27-tail-spec-graph-satellites`, `p27-tail-migration-gate-tooling`, `p27-tail-skills-scripts`.
- Phase 29: `p29-reader-merge-staleness`, `p29-graph-runtime-trace-edge`, `p29-feature56-bdd`, `p29-overlay-compaction`.

Это и есть наиболее вероятный реальный legacy implementation backlog. Его надо исследовать отдельно от 45 contradictory DONE-задач.

### 19 TODO-задач Phases 33–37 с canonical-green сценариями

- Phase 33: `p33-anchor-section-ops`, `p33-replace-diagnostics-rebase`, `p33-proposal-transaction`, `p33-domain-authoring-helpers`, `p33-authoring-api-bdd`.
- Phase 34: `p34-verdict-readiness-lanes`, `p34-status-gap-filtered-proof`, `p34-task-done-truth-guard`, `p34-bdd-source-executable-sync`, `p34-unified-readiness-bdd`.
- Phase 35: `p35-fr62-red-bdd`, `p35-fr62-implement-root`, `p35-fr62-docker-reconcile`.
- Phase 36: `p36-fr63-red-bdd`, `p36-fr63-implement-provenance`, `p36-fr63-docker-reconcile`.
- Phase 37: `p37-fr64-red-bdd`, `p37-fr64-implement-gate`, `p37-fr64-docker-operations`.

Они похожи на status drift после уже выполненных Phases 33–39, но bulk-close сейчас был бы false-green. Независимая live-проверка нашла нарушения связанных контрактов:

- `.agents/skills/spec-status/scripts/precheck.ts` возвращает повторяющиеся усечённые AC IDs (`AC-1` вместо `AC-1.1`);
- `test_paths=[]`;
- `git_sha=null`, поэтому evidence не привязана к текущему commit;
- Windows `docker ps failed` объявляется blocker, хотя тестовый путь репозитория WSL-only;
- MCP и smart-verdict расходятся по scenario inventory (526 против 518);
- effective coverage 526 stale, но execution lane остаётся GREEN.

Поэтому для этих 19 нужен не «поставить Status: DONE», а contract-by-contract reconciliation с FR-60..64 и свежим SHA-bound proof.

### Остальная финализация

- `spec-status` показывает Finalization 65%, `stopConfirmed=false`.
- Conformance даёт 279 предупреждений: `TASK_STATUS_UNVERIFIED=206`, `TASK_NO_OWN_SCENARIO=38`, `FR_NO_STORY=24`, `FR_NO_DESIGN=10` и остаточные категории.
- Независимый полный semantic verdict не завершился за разумное время; проверка выполнена с `--no-semantic`, поэтому semantic lane остаётся `SKIPPED`, а не VERIFIED.

## 5. Новые issues и их реальное отношение к spec-generator

### #153 — независимый adversarial review gate

**Вердикт: реальная новая крупная фича, не покрыта текущей спекой.**

Issue требует отдельного reviewer identity/context, machine-checkable artifact, stale-review invalidation, P0/P1 block, P2 waiver, ограниченный rerun loop и fail-closed readiness. Поиск в spec-графе и исходниках не нашёл реализации независимого adversarial artifact/gate.

Рекомендация: отдельная новая фаза/FR в `spec-generator-v4`, но не смешивать её с закрытием 45 старых task-truth записей.

### #157 — executable live verification и раздельные truth states

**Вердикт: реальная новая крупная фича, не покрыта текущей спекой.**

Нужны четыре состояния (`Spec ready`, `Implementation complete`, `Live verified`, `Production verified`), commit-bound evidence, генерация live-задач из поверхностей изменения и fail-closed gate в status/verdict/claim layer. Текущий зелёный BDD не доказывает существование такого lifecycle contract.

Рекомендация: проектировать после/вместе с #153, потому что independent reviewer должен проверять выполнимость live-verification plan.

### #159 — все missing fields + multi-document apply

**Вердикт: issue надо разделить; половина уже есть в main.**

- Реальный незакрытый slice: source parsers всё ещё возвращают только `missingFirst`, а MCP mutation показывает только его (`tools/specs-validator/spec-form-parsers.ts:35,58,71`; `tools/spec-mcp-server/mutations.ts:231-233`). `missingAll` в main отсутствует.
- Уже закрытый архитектурный slice: main уже содержит канонические `propose_patch` и `apply_spec_transaction` для multi-document all-or-nothing записи (`tools/spec-mcp-server/tools.ts:2034-2209`), усиленные PR #158. Добавлять параллельный `changes[]` режим в legacy single-doc API не надо.
- Локальный cache hotfix, описанный в issue, уже перезаписан: установленный cache также не содержит `missingAll`.

Рекомендация: сузить #159 до aggregate form diagnostics (`missingAll` + backward-compatible `missingFirst`) и тестов source/bundle/distribution; cross-doc часть закрыть ссылкой на существующий transaction API.

### #160 — `tsx-runner native:fail(2)` на Windows

**Вердикт: текущая формулировка смешивает controlled deny с loader crash; сначала воспроизведение на свежем plugin build.**

Текущий main уже различает штатный child exit 2 и resolver/runner failure: `tools/_shared/tsx-runner.js:622-627` пишет `exit(2)` и сохраняет deny. `bdd-only-test-guard` намеренно завершает процесс кодом 2, когда запрещает новый non-BDD test (`tools/bdd-only-test-guard/guard.ts:188`). `plan-gate` также использует exit 2 для отказа в невалидном плане.

Установленный cache `2.0.4` отстаёт от main и не содержит этого различения, поэтому лог `native:fail(2)` сам по себе не доказывает падение native loader. Переводить fail-closed policy hooks в fail-open опасно: это выключит сами запреты.

Рекомендация:

1. пересобрать/переустановить текущий plugin;
2. повторить каждый кейс и сохранить stderr самого child hook;
3. если denial ложный — исправлять конкретную проверку;
4. если падает resolver — заводить runner bug с resolver error, а не с одним лишь status 2;
5. переписать/закрыть #160 после воспроизведения на свежем runtime.

### #161 + #149 — carry-over evidence и нормативные blockers

**Вердикт: реальный gap; объединить в один claim-evidence workstream.**

Main сейчас проверяет `works-done` через `executorCount(tools) >= 1` только для текущего хода (`tools/claim-evidence-gate/claim_classifier.ts:185-189`; bundle `:372-376`). Полей `verifiedFresh`/`staleTurns`/`nextCarriedVerification` в source и bundle нет. Описанный в #161 cache hotfix уже потерян.

#149 показывает соседнюю часть того же state-machine дефекта: gate не умеет отличать технически исполнимый шаг от нормативно запрещённого без user approval и зацикливает агента. Отдельные точечные патчи дадут новые циклы.

Рекомендация: одна новая фаза со state machine:

- carry verification across turns, пока не было relevant mutator;
- invalidate evidence после code/config/spec mutation;
- persist normative blocker с ссылкой на owner rule и required actor;
- ограничить повтор одного verdict;
- запретить judge генерировать непроверенные task counts;
- проверить на реальных multi-turn transcript fixtures и живом Stop-hook, не только isolated unit logic.

## 6. Приоритетный порядок работ

### P0 — привести runtime и issue-триаж в правду

1. Выпустить/переустановить plugin из текущего main и повторно проверить #160.
2. Сузить #159 до `missingAll`; не дублировать transaction API.
3. Объединить design scope #149 + #161.

### P1 — отделить реальный legacy backlog от status drift

1. Разобрать 17 non-DONE задач Phases 12/21/27/29 как вероятный реальный implementation backlog.
2. Для 19 TODO-задач Phases 33–37 проверить каждый FR-60..64 contract и исправить найденные precheck/status/coverage defects до смены статуса.
3. Устранить `git_sha=null`, AC-id truncation, пустой `test_paths`, Windows/WSL Docker false blocker и inventory 526/518 split.

### P2 — закрыть 45 старых TASK_TRUTH долгов без fake-green

1. Автоматически построить таблицу 45 tasks × 147 Done When × artifact/scenario.
2. Отдельно прогнать восемь задач без явного полного scenario id в собственном блоке.
3. Разрешить пять явных live/policy/corpus долгов.
4. Переписать obsolete пути и протухшие phase labels.
5. Отметить только доказанные пункты; оставшееся перевести в честные статусы.

### P3 — новые product gates

1. Спроектировать #153 independent adversarial review.
2. Спроектировать #157 live verification lifecycle.
3. Связать их: reviewer проверяет выполнимость live plan, но артефакты и readiness lanes остаются раздельными.

### P4 — финальная переаттестация

1. Устранить рассинхрон обычного coverage overlay и canonical coverage.
2. Обновить Finalization prose/status metadata.
3. Полный Docker BDD через `/run-tests`.
4. Полный semantic verdict без `--no-semantic`.
5. `spec-verdict`: все обязательные lanes GREEN, `TASK_TRUTH` без долга, current SHA evidence fresh.
6. Только после этого подтверждать Finalization STOP и называть всю `spec-generator-v4` READY.

## 7. Итог

Сейчас правильная формулировка такая:

> PR #158 завершён и проверен. У текущих 65 FR есть зелёный canonical BDD snapshot 526/526, но он stale относительно HEAD, а вся историческая spec-generator-v4 ещё не READY. Остаток состоит из 45 contradictory DONE-задач с 147 недоказанными/неотмеченными Done When, 17 вероятно реально открытых legacy tasks, 19 TODO-задач со status/contract drift и незакрытой Finalization. Параллельно появились три настоящих новых feature workstreams (#153, #157, #149+#161), один узкий UX fix (#159/missingAll) и один issue, требующий повторного runtime-триажа на свежем runner (#160).
