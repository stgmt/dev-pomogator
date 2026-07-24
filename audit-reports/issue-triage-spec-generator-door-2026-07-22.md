# Отчёт: триаж issues по спекам, spec-generator и spec-door

Дата среза: 2026-07-22  
Репозиторий: `stgmt/dev-pomogator`  
Проверенный `main`: `41a07084550b28da4864e397110600be342f10f6`

## Короткий ответ

Не надо реализовывать все 10 issues как 10 независимых фич.

- `#18` уже исправлен и доказан свежим полным Docker-BDD — закрыть без нового кода.
- `#140` перенести как конкретный regression fixture в `#142`, затем закрыть как duplicate.
- `#141` почти выполнен: transaction tools есть, доступны в текущей MCP-сессии и зелёные; остаток перенести в `#135`, после чего закрыть `#141`.
- `#144` разделить на три части: Windows/runtime → `#137`; legacy form-debt → `#135`; неверная атрибуция Stop-hook → новый узкий issue. После переноса закрыть исходный перегруженный `#144`.
- Самый простой настоящий фикс — `#64`.
- Самый важный ранний фикс — `#126`: недавно добавленный зелёный сценарий не запускает реальный `spec-status`, а значит маскирует незакрытый runtime-дефект.
- Заканчивать следует `#142`: это самый широкий semantic-coverage epic без готовой реализации.

Итоговая рабочая очередь после чистки: **6 самостоятельных потоков вместо 10**:

1. `#64` — plan validator.
2. `#126` — реальный spec-status/root/stdin runtime.
3. `#135` — canonical spec authoring UX + monotonic form validation.
4. `#137` — Windows/runtime + whole-tree enforcement.
5. `#134` — включение enforcement по умолчанию, только после `#137`.
6. `#142` — semantic acceptance/deploy-proof epic.

Отдельный новый маленький issue: provenance/атрибуция изменений для anchor Stop-hook (выделить из `#144`).

## Метод проверки

Для каждого вердикта сопоставлялись:

1. текущее тело issue и комментарии GitHub;
2. текущий код `main`;
3. BDD/step definitions, live MCP tool discovery, канонический test-result или git history.

Маркеры:

- `[VERIFIED]` — вывод подтверждён issue + текущим кодом + тестом/runtime/history;
- `[PARTIAL]` — часть acceptance уже реализована, часть остаётся;
- `[NEEDS_CONFIRMATION]` — структурная улика есть, но Windows runtime не воспроизводился заново в этом аудите.

## Матрица решений

| Issue | Текущее состояние | Усилие остатка | Решение |
|---|---|---:|---|
| [#18](https://github.com/stgmt/dev-pomogator/issues/18) | `[VERIFIED: DONE]` | XS, 10–20 мин на закрытие | Закрыть сейчас, код не писать |
| [#64](https://github.com/stgmt/dev-pomogator/issues/64) | `[VERIFIED: OPEN]` | XS, 30–60 мин | Первый простой code fix, отдельный PR |
| [#126](https://github.com/stgmt/dev-pomogator/issues/126) | `[VERIFIED: OPEN + FALSE-GREEN]` | M, 0.5–1 день | Первый по риску; реальный integration fix |
| [#141](https://github.com/stgmt/dev-pomogator/issues/141) | `[PARTIAL: engine done, routing parity open]` | S, 1–3 ч | Доделать остаток, перенести в `#135`, закрыть |
| [#135](https://github.com/stgmt/dev-pomogator/issues/135) | `[PARTIAL]` | M/L, 1–2 дня | Оставить canonical umbrella authoring UX |
| [#134](https://github.com/stgmt/dev-pomogator/issues/134) | `[VERIFIED: OPEN; patch exists off-main]` | S/M, 3–6 ч | Не объединять; ставить после `#137` |
| [#137](https://github.com/stgmt/dev-pomogator/issues/137) | `[VERIFIED: whole-tree open]`, runtime `[NEEDS_CONFIRMATION]` | M/L, 1–2 дня | Canonical Windows/enforcement runtime issue |
| [#144](https://github.com/stgmt/dev-pomogator/issues/144) | `[VERIFIED: three unrelated defects]` | L как монолит | Разнести в `#137`, `#135` и новый provenance issue; затем закрыть |
| [#140](https://github.com/stgmt/dev-pomogator/issues/140) | `[VERIFIED: concrete instance of #142]` | 0 отдельно | Перенести regression fixture в `#142`, закрыть duplicate |
| [#142](https://github.com/stgmt/dev-pomogator/issues/142) | `[VERIFIED: OPEN]` | XL, 3–5+ дней | Оставить canonical epic и делать последним |

## Подробные вердикты

### #18 — закрыть без нового кода

`[VERIFIED: DONE]`

Требуемая реконструкция post-edit content уже реализована: `extractWriteContent()` читает текущий файл, применяет `old_string → new_string`, поддерживает `replace_all` и сохраняет fail-safe fallback. [ref:tools/specs-validator/spec-form-parsers.ts:445] [ref:tools/specs-validator/spec-form-parsers.ts:475]

Все шесть сценариев `SPECGEN004_385..390` имеют свежий `PASSED`, `stale=false`, источник `docker-bdd:full`, run `1784677094671` от 2026-07-21 23:26Z. Они покрывают оба guard-а, incomplete-file deny, Write compatibility, replace-all и absent-old-string fallback. [ref:tests/step_definitions/feature19_spec_form_extract.ts:144] [ref:tests/step_definitions/feature19_spec_form_extract.ts:205]

Решение: добавить в issue короткий evidence-comment с SHA/BDD run и закрыть `completed`.

### #64 — самый простой настоящий фикс

`[VERIFIED: OPEN]`

Валидатор по-прежнему ищет только `^##\s+Impact Analysis`, поэтому `## 💥 Impact Analysis` не матчится. [ref:tools/plan-pomogator/validate-plan.ts:374] [ref:tools/plan-pomogator/validate-plan.ts:384]

Тестовый код прямо документирует баг и обходит его: удаляет emoji-heading и вставляет plain `## Impact Analysis`. [ref:tests/step_definitions/feature_plan_validator.ts:914] [ref:tests/step_definitions/feature_plan_validator.ts:927]

Минимальный scope:

1. использовать общую heading-normalization/emoji tolerance вместо отдельного regex;
2. добавить positive BDD на destructive File Changes + `## 💥 Impact Analysis`;
3. сохранить negative BDD для отсутствующей секции и `N/A`.

Не объединять с другими issues: это независимый one-line parser defect с малым blast radius.

### #126 — приоритетный runtime false-green

`[VERIFIED: OPEN + FALSE-GREEN]`

Реальный wrapper всё ещё запускает core с `stdio: 'inherit'`. [ref:tools/specs-generator/spec-status.ts:9] [ref:tools/specs-generator/spec-status.ts:13]

Core без env override всё ещё ищет repo от `SCRIPT_DIR`, а не от caller cwd: `findRepoRoot(SCRIPT_DIR)`. [ref:tools/specs-generator/specs-generator-core.mjs:251] [ref:tools/specs-generator/specs-generator-core.mjs:258]

Новый FR-62 resolver существует, но `spec-status.ts` и `specs-generator-core.mjs` его не импортируют. Он подключён к MCP и skill-precheck, а не к проблемному entrypoint. [ref:tools/spec-graph/root-resolution.ts:67] [ref:tools/spec-mcp-server/server.ts:99]

Сценарий `SPECGEN004_553 inherited, closed, and noninteractive stdin...` зелёный в полном Docker run, но step definition явно говорит «Call the real resolver only» и вызывает `precheck()`/`resolveMcpRoot()` вместо spawn реального `spec-status.ts`. [ref:tests/step_definitions/feature62_root_resolution.ts:32] [ref:tests/step_definitions/feature62_root_resolution.ts:45]

Поэтому зелёный сценарий не доказывает исправление issue. Это важнее `#64`, хотя сложнее.

Done-When для реального фикса:

- spawn установленного/реального `spec-status` из foreign cwd;
- три stdin режима: inherited, closed, noninteractive;
- доказанный timeout budget без зависания;
- одинаковый root для env override и caller cwd;
- plugin-cache/SCRIPT_DIR не принимается как target project.

### #141 + #135 — объединить остаток в #135

`[VERIFIED: #141 PARTIAL]`

Уже сделано:

- `propose_patch`, `apply_proposed_patch`, `apply_spec_transaction` зарегистрированы сервером. [ref:tools/spec-mcp-server/tools.ts:2027] [ref:tools/spec-mcp-server/tools.ts:2167]
- Все три tools реально видны в текущей MCP-сессии.
- `SPECGEN004_523` — `PASSED`, `stale=false`, `docker-bdd:full`; сценарий доказывает five-doc atomic write и rollback без частичной записи. [ref:tests/step_definitions/feature60_proposal_transaction.ts:184] [ref:tests/step_definitions/feature60_proposal_transaction.ts:205]
- `.claude/skills/create-spec/SKILL.md` уже описывает transaction workflow. [ref:.claude/skills/create-spec/SKILL.md:42] [ref:.claude/skills/create-spec/SKILL.md:46]

Осталось:

- активная в Codex `.agents/skills/create-spec/SKILL.md` всё ещё заканчивает таблицу на single-doc tools и не перечисляет transaction/domain tools; это реальный routing drift. [ref:.agents/skills/create-spec/SKILL.md:34] [ref:.agents/skills/create-spec/SKILL.md:43]
- rejection hint для cross-document inconsistency должен направлять к transaction tool;
- `#135` сохраняет отдельную проблему показа полного form contract и legacy-debt handling.

Решение:

1. синхронизировать `.agents` skill/allowed-tools с canonical skill;
2. добавить live skill-consumer regression, а не только server tools/list;
3. перенести оставшиеся acceptance пункты `#141` в checklist `#135`;
4. закрыть `#141`, оставить `#135` canonical authoring UX issue.

### #144 — не реализовывать монолитом

`[VERIFIED: SPLIT REQUIRED]`

Issue содержит три разных механизма.

#### A. Windows door runner/resolution

Fixer по-прежнему запускает bootstrap через `node -e require(BOOTSTRAP) -- spec-door instruction`; это ровно reported failure surface. [ref:tools/anchor-integrity/fix.mjs:95] [ref:tools/anchor-integrity/fix.mjs:128]

Перенести в `#137`, потому что там уже canonical Windows/tsx-runner/hook runtime problem. Повторить на installed plugin без `node_modules`, а не только source checkout. Runtime failure в этом аудите заново не воспроизводился: `[NEEDS_CONFIRMATION]`.

#### B. Чужой form debt блокирует локальную правку

Anchor и conformance проверки уже delta-only, но `formFindings(doc, next)` всё ещё проверяет весь итоговый документ без before/after delta. [ref:tools/spec-mcp-server/mutations.ts:278] [ref:tools/spec-mcp-server/mutations.ts:305] [ref:tools/spec-mcp-server/mutations.ts:503] [ref:tools/spec-mcp-server/mutations.ts:513]

Сценарий с названием «gates only debt introduced» проверяет staged FR/task-truth debt, но не legacy form findings вроде 110 отсутствующих Done When. Поэтому он не закрывает reported case.

Перенести в `#135` как monotonic form validation: разрешать правку, если multiset form findings не ухудшился.

#### C. Неверная атрибуция чужих правок

Stop-hook определяет «редактировавшиеся спеки» через общий `git status --porcelain -- .specs`, то есть по shared worktree, а не по transcript/session provenance. [ref:tools/anchor-integrity/anchor_gate_stop.ts:37] [ref:tools/anchor-integrity/anchor_gate_stop.ts:55] [ref:tools/anchor-integrity/anchor_gate_stop.ts:108]

Это отдельная задача. Создать узкий issue: session-owned spec mutation provenance для Stop gates. Не смешивать с resolver или validation semantics.

После переноса трёх частей исходный `#144` закрыть как decomposed, иначе он всегда будет «частично сделан».

### #137 → #134 — сохранить два issue и порядок зависимости

#### #137

`[VERIFIED: whole-tree bypass OPEN]`

Guard немедленно возвращает `null`, если текст Bash-команды не содержит `.specs`; поэтому `git add -A`/`git commit -am` не могут быть обнаружены текущей моделью. [ref:tools/specs-validator/spec-access-guard.ts:296] [ref:tools/specs-validator/spec-access-guard.ts:306]

Windows crash требует повторного installed-runtime replay после нового hook-service слоя: `[NEEDS_CONFIRMATION]`. В этот issue также перенести resolver-часть `#144`.

#### #134

`[VERIFIED: default enforcement still OPEN]`

`enforceEnabled()` на `main` возвращает true только при явно on-ish env/plugin option; отсутствие экспортированной опции остаётся false. [ref:tools/specs-validator/spec-access-guard.ts:384] [ref:tools/specs-validator/spec-access-guard.ts:390]

Готовый reapply commit `19ccac4f` существует на `origin/fix/spec-access-enforce-default-on`, но не входит в `main`. Его нельзя просто cherry-pick: рядом лежит legacy non-BDD test, а rollout enforcement-default опасен до починки Windows/runtime и repair path.

Правильная зависимость:

`#137 + #144(A) runtime-safe` → installed-runtime BDD → `#134 enforcement default-on`.

Не объединять `#134` и `#137`: первый — rollout/default semantics; второй — execution and bypass correctness. У них разные rollback risks.

### #140 → #142 — один epic, не две реализации

`[VERIFIED: OVERLAP]`

`#142` сам называет `#140` related symptom и формулирует generic root defect: acceptance claim без implementation owner, test и deploy evidence. `#140` — ценный concrete marketplace/deployment-auth incident.

В текущем implementation/test surface нет `deployment-auth`, `prod-smoke`, `insufficient-balance`, `acceptance-to-task` или semantic response-shape checks. Проверка `git grep` по `tools`, `.claude`, `.agents`, `tests` вернула `NO_MATCHES_IN_IMPLEMENTATION_OR_TESTS`.

Новый readiness inventory решает другой слой: provenance/canonical evidence и mandatory-lane AND, но не выводит DTO/API/status/paid-flow tasks из acceptance semantics. [ref:tools/spec-graph/readiness-inventory.ts:15] [ref:tools/spec-graph/readiness-inventory.ts:25]

Решение:

1. оставить `#142` canonical epic;
2. перенести из `#140` production fixture: `/api` vs `/go/api`, 401/402/content-type, registry publication, slug vs settlement identity;
3. оформить fixture как generic red BDD, без product-specific hardcode в engine;
4. закрыть `#140` как duplicate/absorbed;
5. реализовывать `#142` последним, после стабилизации spec-door authoring и evidence runtime.

## Рекомендуемый порядок работ

### Шаг 0 — административная чистка

1. Закрыть `#18` с Docker-BDD evidence.
2. Перенести `#140` в `#142`, пометить duplicate.
3. Разложить `#144` по трём владельцам scope.

### Шаг 1 — быстрый независимый фикс

`#64` — matcher normalization + один positive BDD.

Почему здесь: минимальный риск, быстрый законченный PR, не зависит от spec-door runtime.

### Шаг 2 — убрать свежий false-green

`#126` — подключить root resolver к реальному spec-status/core entrypoint и заменить pure-function proof реальным spawn proof.

Почему рано: текущий зелёный сценарий создаёт ложное ощущение, что release-prep root/stdin contract уже работает.

### Шаг 3 — закончить authoring transaction UX

`#141` residual → `#135`: active skill parity, actionable transaction hint, monotonic form findings.

Почему до enforcement: дверь должна быть реально проходимой до того, как обходы начнут жёстко блокироваться.

### Шаг 4 — сделать enforcement безопасным

1. `#137` + Windows/resolver часть `#144`;
2. installed-plugin/deps-absent/runtime BDD;
3. whole-tree mutation detection;
4. отдельный provenance issue из `#144(C)`.

### Шаг 5 — только теперь включать default-on

`#134`: портировать patch `19ccac4f` в актуальную архитектуру, заменить legacy tests на BDD, проверить upgrade/opt-out.

Почему не раньше: default-on при сломанном repair/runtime path превращает наблюдаемую проблему в массовый блокер.

### Шаг 6 — закончить самым широким epic

`#142` с поглощённым fixture из `#140`.

Почему последний: это classifier + traceability + reviewer + deploy-evidence policy, то есть самый большой blast radius и самый высокий риск overfitting на один marketplace incident.

## Что точно не делать

- Не брать `#144` одним PR: там три root cause и три независимых критерия готовности.
- Не cherry-pick `19ccac4f` сразу в `main`: сначала runtime safety и BDD migration.
- Не считать `#126` закрытым по `SPECGEN004_553`: сценарий не запускает проблемный CLI.
- Не писать второй transaction engine для `#135/#141`: engine уже существует и зелёный; проблема теперь в routing/UX/parity.
- Не реализовывать `#140` и `#142` параллельно: получится два эвристических анализатора одного semantic gap.
- Не оставлять `#18` открытым «на всякий случай»: это искажает backlog, когда код и шесть канонических сценариев уже зелёные.

## Misconception flush

| Исходное предположение | Проверка | Итог |
|---|---|---|
| Все 10 open issues требуют кода | `#18` имеет implementation + 6 fresh Docker-BDD passes | Опровергнуто |
| FR-62/root-resolution уже закрыл `#126` | real wrapper/core не используют новый resolver; BDD вызывает pure functions | Опровергнуто |
| `#144`, `#137`, `#134` можно слить в один issue | runtime correctness, attribution и rollout-default имеют разные механизмы/риски | Опровергнуто |
| `#141` всё ещё требует transaction engine | tools live-discoverable + atomic BDD green | Опровергнуто; остался skill/routing UX |
| readiness inventory уже покрывает `#142` | inventory классифицирует evidence, но semantic API/task inference отсутствует | Опровергнуто |

## Финальный целевой backlog

После административного триажа:

- закрыты: `#18`, `#140`, позднее `#141`, исходный `#144`;
- остаются самостоятельными: `#64`, `#126`, `#135`, `#137`, `#134`, `#142`;
- создаётся один узкий issue: Stop-hook session provenance/атрибуция.

Это уменьшает backlog с 10 размытых/пересекающихся issues до 6 исполнимых потоков + 1 узкого provenance fix и задаёт безопасную зависимость: **проходимая дверь → надёжный runtime → default enforcement → semantic coverage**.
