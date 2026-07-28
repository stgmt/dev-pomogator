# Execution-aware task planning: сравнительный анализ и решение

**Дата проверки:** 2026-07-28  
**Область:** [FR-72](FR.md#fr-72)–[FR-79](FR.md#fr-79)  
**Цель отчёта:** решить, как из FR/AC/DESIGN/BDD синтезировать задачи, а затем безопасно планировать их поверх существующего SpecGraph; определить, что переиспользовать, адаптировать или реализовать. Это не каталог workflow/build-систем.

## Решение

Новый графовый runtime и новый источник истины не нужны. Каноническим остаётся существующий `SpecGraph`: `TASKS.md` разбирается в task-узлы, а типизированные dependency/evidence edges и task-owned execution surfaces хранятся в той же модели. Конфликты, readiness, волны, безопасные batches, critical path, slack, impact и stale-reason chains являются **вычисляемыми представлениями**, а не отдельными сохраняемыми графами.

Готового TypeScript-компонента, который закрыл бы эту предметную модель без второго task store и тяжёлого runtime, среди проверенных кандидатов не найдено. Итог: **BUILD ON EXISTING**. Из внешнего кода полезны только два узких механизма:

1. BuildXL-подобное разделение declared read/write accesses;
2. Dagster-подобная структурированная цепочка причин устаревания.

Код этих проектов и их runtime не переносятся.

## Критерии решения

Единицей сравнения был механизм, а не бренд. Кандидат на `ADOPT` должен одновременно:

1. работать внутри bundled TypeScript-плагина без пользовательского `node_modules`, БД или отдельного сервера;
2. расширять существующий `SpecGraph`, а не заводить второй task/DAG store;
3. сохранять typed edges, source spans, `TASKS.md` round-trip, MCP CAS и SQLite cold/warm equivalence;
4. закрывать существенную часть FR-72..FR-79, а не заменять 30–80 строк стандартного DAG-кода зависимостью;
5. иметь совместимую лицензию и проверяемый installed/deps-absent путь.

Ни один проверенный компонент не прошёл все пять условий.

### Явно исключено

- **Rush** — critical path является стандартным DAG-проходом и не оправдывает донора или зависимость.
- **Wireit** — command-cache fingerprinting не является нашей моделью task-owned evidence.
- **Temporal** — durable workflow server/replay не относится к планированию внутри SpecGraph.
- BullMQ, Graphile Worker, Airflow, Tekton, Argo, Nextflow и Lage не рассматриваются как кандидаты: они добавляют queue/database/Kubernetes/JVM/runtime-модель, но не закрывают spec-native семантику.

## Одна каноническая модель, а не «много графов»

```text
TASKS.md
   │ parse / round-trip
   ▼
SpecGraph (единственный сохраняемый source of truth)
   ├─ TaskNode / TaskPlanNode fields
   ├─ depends-on edges
   ├─ validates / tested-by / evidenced-by edges
   └─ declared execution surfaces: read | write | exclusive
            │
            ▼ pure deterministic projections
      ┌─────┼──────────┬──────────────┬──────────────┐
      │     │          │              │              │
 readiness conflicts  waves/batches  critical path  stale/impact reasons
```

| Представление | Хранится отдельно? | Почему |
|---|---:|---|
| Task nodes, dependency/evidence edges, declared surfaces | Да, в SpecGraph/SQLite | Это авторские и наблюдаемые факты |
| Conflict relation | Нет | Детерминированно выводится из нормализованных surfaces |
| Waves и batches | Нет | Детерминированно выводятся из dependency DAG + conflicts |
| Critical path и slack | Нет | Детерминированно выводятся из DAG + estimates |
| Stale/impact explanation | Текущий результат можно кешировать, но источник — факты и evidence history | Причина пересчитывается после изменения графа или доказательства |

Термин «conflict graph» означает только вычисленную relation/view. Это не второй канонический граф и не отдельный формат данных.


### Зонтичный алгоритм: сначала синтез задач, затем безопасное расписание

Исходный запрос относится не только к scheduling уже написанных задач. Нужен верхнеуровневый конвейер, который **сначала создаёт правильные задачи из спеки**, а уже потом строит dependency/conflict views и параллельные партии.

Это не известный внешний продукт с названием «umbrella algorithm». Для dev-pomogator зонтичный алгоритм — композиция четырёх дисциплин:

| Дисциплина | На какой вопрос отвечает | Что даёт плану |
|---|---|---|
| **DDD** | Где проходит смысловая и владетельная граница? | bounded context/aggregate/contract/invariant или, если домена нет, явная module/adapter boundary |
| **BDD** | Какое наблюдаемое поведение доказывает ценность? | AC-linked scenario, включая positive/negative/contract outcomes |
| **TDD** | В каком порядке получать доказанный код? | `RED → GREEN → REFACTOR`, причём в BDD-only репозитории RED — реальный cucumber-сценарий, а не новый vitest-файл |
| **Blast radius + DAG** | Что затронет задача, что она ждёт и с чем конфликтует? | typed dependencies, read/write/exclusive surfaces, waves и safe batches |

DDD, BDD и TDD не являются тремя конкурирующими способами нарезки:

```text
DDD определяет ГРАНИЦУ владения
        ↓
BDD определяет ВЕРТИКАЛЬНОЕ поведение внутри/между границами
        ↓
TDD определяет ПОРЯДОК реализации и доказательства этого поведения
        ↓
blast radius определяет БЕЗОПАСНУЮ параллельность получившихся задач
```

#### Вход зонтичного алгоритма

- FR/AC/UC и связанные риски;
- `DESIGN.md`: компоненты, доменные границы, контракты, данные и инварианты;
- реальные BDD-сценарии или обязательные scenario gaps;
- repository reality: существующие файлы, API, schema, hooks и test infrastructure;
- rollout/compatibility/security constraints.

#### Стадия A — синтез и декомпозиция задач

1. **Построить acceptance lanes.** Для каждого AC перечислить implementation, contract/regression, compatibility/redaction/security и live-evidence outcomes. Неизвестная implementation surface создаёт `BLOCKED investigation`, а не выдуманный implementation task.
2. **Определить boundary.** Если feature доменная — назначить bounded context, aggregate/domain service, invariant и межконтекстные contracts. Если feature инфраструктурная — явно поставить `domainMode: none` и использовать module/adapter/contract boundary; не выдумывать DDD-сущности ради формы.
3. **Нарезать вертикальные BDD-срезы.** Единица среза — одно самостоятельно наблюдаемое поведение/AC outcome, а не горизонтальные «сначала все types, потом все services, потом все tests».
4. **Развернуть TDD-цепочку каждого среза.** Сначала RED scenario/step на реальном producer, затем минимальный GREEN production change, затем REFACTOR только после зелёного доказательства. Несколько независимых outcomes получают собственные scenario IDs, а не делят одно расплывчатое доказательство.
5. **Назначить task ownership.** Каждая implementation task получает primary boundary, AC, собственный scenario/evidence owner, measurable `Done When`, estimate и declared surfaces.
6. **Провести conservation checks.** Каждый обязательный AC lane принадлежит хотя бы одной задаче; каждая задача трассируется назад к AC/FR; ни один scenario/task не потерян и не продублирован молча.

#### Стадия B — построение и проверка execution graph

1. Сохранить task nodes и authored causal dependencies в едином SpecGraph.
2. Добавить обязательные причинные рёбра: contract-before-consumer, RED-before-GREEN, GREEN-before-REFACTOR, context integration после участвующих контекстов.
3. Проверить missing IDs, self-edges и cycle path.
4. Нормализовать task-owned `read | write | exclusive` surfaces.
5. Вычислить conflicts как view; конфликт **не** превращать в причинную dependency.
6. Вычислить readiness, topological waves, conflict-free batches, critical path/slack и explicit unscheduled remainder.
7. После изменения контракта, invariant, scenario или owned surface инвалидировать task evidence и зависимый хвост с causal reason chain.

#### Выход

Зонтичный алгоритм возвращает не только расписание, а полный `TaskPlanResult`:

```text
synthesized/retained tasks
acceptance-lane coverage
boundary and scenario ownership
RED → GREEN → REFACTOR chains
typed causal edges
surface claims and conflicts
waves / batches / critical path
stale reasons / unscheduled remainder / diagnostics
```

**Важный gap текущей Phase 45:** FR-72..FR-79 подробно описывают модель и scheduling после появления task records, а существующая Phase 3 finalization задаёт общий TDD/BDD-порядок. Но отдельный детерминированный шаг **DDD/BDD/TDD synthesis из FR/AC/DESIGN в task graph** пока не выделен как собственный planner contract. Без него система улучшит раскладку уже написанных задач, но не гарантирует качественную постановку задач. Этот gap должен быть закрыт до реализации wave planner.


### Сверка с Superpowers v6.2.0

Проверен canonical upstream [`obra/superpowers`](https://github.com/obra/superpowers/tree/3dcbd5c4b48e02263fbf4a3c01e3fe4f81d584d9), release `v6.2.0` от 2026-07-24, MIT. Это полезный workflow prior art, но **не готовый planning engine**.

#### Что в Superpowers реально есть

| Механизм | Проверенный контракт | Решение для FR-80 / FR-72..79 |
|---|---|---|
| Design before implementation | `brainstorming` запрещает implementation до показанного и одобренного design; большие независимые subsystems предлагается разделять на отдельные specs | **ADAPT:** synthesis запускается только после согласованного design snapshot; независимые subsystems не смешиваются в один task graph patch |
| File-responsibility decomposition | `writing-plans` сначала фиксирует file structure, responsibility и interfaces, затем делает self-contained tasks | **ADAPT:** добавить явный `component/interface responsibility map` как вход synthesis, но не считать file boundary заменой DDD/contract ownership |
| Bite-sized TDD plan | Каждая task содержит exact paths, interface contract и 2–5-минутные шаги: failing test, подтверждение RED, minimal implementation, подтверждение GREEN, commit | **ADAPT:** сохранить task-level RED/GREEN proof contract; в dev-pomogator заменить generic unit-test assumption на BDD-only scenario/step и не делать обязательный commit частью canonical task semantics |
| Plan self-review | План проверяется секция-за-секцией на полноту, ambiguity, feasibility и затем re-review | **ADAPT:** независимый synthesis review должен проверять acceptance-lane conservation, ownership, surface completeness и typed causal order до planner admission |
| Fresh context + task briefs | SDD создаёт per-task brief, передаёт summaries предыдущих задач, получает `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`, затем task-scoped и whole-branch reviews | **ADAPT:** формализовать execution handoff projection из `TaskPlanNode`, а concerns/blockers возвращать в canonical diagnostics/evidence; не копировать ad-hoc workspace ledger как второй store |
| Fresh verification before completion | `verification-before-completion` запрещает completion claim без свежего полного command output | **ALREADY STRONGER LOCALLY:** FR-77 task-owned evidence, canonical-vs-filtered proof и stale invalidation должны остаться authority |
| Parallel investigations | `dispatching-parallel-agents` разрешает parallel dispatch только для вручную признанных независимыми domains и запрещает shared-state/overlapping work | **ADAPT ONLY AS UX:** человекочитаемое объяснение independence; сам heuristic заменить FR-74..76 typed surfaces, derived conflicts и deterministic batches |

#### Чего в Superpowers нет

Bounded exhaustive search по девяти canonical workflow-файлам `v6.2.0` (73,505 bytes) вернул 0 совпадений по BDD/Gherkin/Cucumber, DDD/bounded-context/aggregate и DAG/topological/read-write/exclusive/conflict-path словарям; следовательно, в проверенном snapshot эти first-class contracts не обнаружены. Открытый upstream issue [`#374`](https://github.com/obra/superpowers/issues/374) отдельно просит добавить BDD/E2E workflow; issue [`#1917`](https://github.com/obra/superpowers/issues/1917) обсуждает нерешённую границу inline-vs-dispatch для tightly-coupled fan-out. Следовательно:

- generic TDD в Superpowers нельзя выдавать за BDD acceptance ownership;
- generic «clear boundaries/interfaces» нельзя выдавать за DDD;
- parallel-agent skill нельзя выдавать за blast-radius planner;
- plan Markdown и `.superpowers/sdd` workspace нельзя делать вторым task/evidence store рядом со SpecGraph.

#### Gap matrix

| Область | Superpowers v6.2.0 | Наша цель | Verdict |
|---|---|---|---|
| Requirements/design → plan | Одобренный design → prose implementation plan | FR/AC/DESIGN/BDD/repo reality → canonical `task/v1` graph records | **ADAPT workflow gates; BUILD typed synthesis** |
| DDD | Нет first-class contracts | Conditional `domainMode: ddd|none`, ownership/invariants/contracts | **BUILD** |
| BDD | Нет first-class contracts; BDD запрошен в issue #374 | AC/scenario/evidence ownership и BDD-only RED | **BUILD** |
| TDD | Сильный strict RED→GREEN→REFACTOR | Typed causal chain с реальным BDD proof | **ADAPT** |
| Task granularity | 2–5-minute prose steps, exact files/interfaces | independently valuable vertical slice + executable subtasks | **ADAPT carefully:** micro-steps остаются Done-When/actions, не раздувают graph node count |
| Dependency model | Порядок плана и summaries предыдущих tasks | Typed causal edges, missing/cycle validation | **BUILD** |
| Blast radius/conflicts | Ручное «independent domain / no shared state» | typed read/write/exclusive surfaces + derived conflict relation | **BUILD** |
| Parallel batches | Ручной simultaneous dispatch независимых investigations | deterministic waves/batches, remainder, critical path/slack | **BUILD** |
| Evidence | Fresh command output и reviews | content-addressed task-owned evidence + stale reason chain | **REUSE EXISTING; ADAPT review UX** |
| Persistence | Plan Markdown + plan-scoped workspace ledger | One SpecGraph/SQLite authority, projections only | **REJECT second store** |

#### Конкретные изменения для спеки

1. FR-80 synthesis input должен включать approved design revision и `component/interface responsibility map`; generic file list недостаточен.
2. FR-80 task granularity должна различать **graph task** (самостоятельный BDD/AC vertical outcome) и **execution steps** (малые RED/GREEN действия внутри task). Иначе Superpowers-style 2–5-minute steps создадут сотни бессмысленных graph nodes.
3. Synthesis review обязан быть отдельным deterministic gate до FR-72..79 planner admission: no placeholders, lane conservation, boundary/ownership, exact files/interfaces, feasibility, typed causal order и surface completeness.
4. `TaskPlanResult` должен уметь отдать self-contained execution brief: exact files/source locations, interfaces, full task text, dependencies and relevant predecessor summaries, scenario/evidence commands — без нового authoritative ledger.
5. Execution result vocabulary может принять `DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`, но только `DONE` с FR-77 current full proof влияет на completion; остальные состояния становятся diagnostics/follow-up patch proposals.
6. Parallel-dispatch explanation должна показывать, **почему** задачи независимы (нет causal path и conflict pair), а не просто утверждать «independent».

#### Источники и статус проверки

- Canonical lifecycle и task template: [`brainstorming`](https://github.com/obra/superpowers/blob/3dcbd5c4b48e02263fbf4a3c01e3fe4f81d584d9/skills/brainstorming/SKILL.md), [`writing-plans`](https://github.com/obra/superpowers/blob/3dcbd5c4b48e02263fbf4a3c01e3fe4f81d584d9/skills/writing-plans/SKILL.md), [`test-driven-development`](https://github.com/obra/superpowers/blob/3dcbd5c4b48e02263fbf4a3c01e3fe4f81d584d9/skills/test-driven-development/SKILL.md), [`subagent-driven-development`](https://github.com/obra/superpowers/blob/3dcbd5c4b48e02263fbf4a3c01e3fe4f81d584d9/skills/subagent-driven-development/SKILL.md), [`dispatching-parallel-agents`](https://github.com/obra/superpowers/blob/3dcbd5c4b48e02263fbf4a3c01e3fe4f81d584d9/skills/dispatching-parallel-agents/SKILL.md), [`verification-before-completion`](https://github.com/obra/superpowers/blob/3dcbd5c4b48e02263fbf4a3c01e3fe4f81d584d9/skills/verification-before-completion/SKILL.md). `[VERIFIED]`
- Independent behavioral eval angle: [`prime-radiant-inc/superpowers-evals` checks](https://github.com/prime-radiant-inc/superpowers-evals/tree/11ffd999c9bc16e4b757b84482b5b65358d11599/scenarios) проверяют ранний вызов `writing-plans`, `test-driven-development` и `dispatching-parallel-agents`, но не проверяют DAG/blast-radius/BDD/DDD semantics. `[VERIFIED]`
- Community gap angle: upstream issues [`#374`](https://github.com/obra/superpowers/issues/374) и [`#1917`](https://github.com/obra/superpowers/issues/1917). `[NEEDS_CONFIRMATION: issue #374 остаётся открытым; maintainer согласился с направлением, но implementation не найден в v6.2.0]`

**Итог:** Superpowers стоит использовать как UX/process prior art для design gate, self-contained task brief, strict TDD, fresh-agent context и layered review. Он не заменяет FR-80 synthesis и FR-72..79 planner, потому что не имеет typed acceptance ownership, DDD/BDD contract, dependency DAG, blast-radius surfaces, derived conflicts, deterministic waves или task-owned stale evidence.


#### Системный planner для AI-агентов

Здесь целевой продукт шире Superpowers `writing-plans`: это системный planner, который одновременно обслуживает spec-generator и AI-исполнителя. Он не только создаёт task graph, но и выдаёт следующему агенту **самодостаточный execution packet**, вычисленный из того же SpecGraph snapshot.

```text
AgentExecutionPacket
  planRevision / taskId / batchId
  full canonical task text + Done When
  FR / AC / BDD ownership
  exact files + source ranges + interface contracts
  typed predecessors + relevant predecessor summaries
  read/write/exclusive surfaces
  RED/GREEN/REFACTOR step sequence
  exact verification/evidence commands
  blockers + stale reasons + follow-up proposal contract
  independence proof: no causal path AND no conflict pair
```

Это закрывает две стороны одной системы:

1. **Spec-generator** детерминированно синтезирует, валидирует и пересчитывает план.
2. **AI-агент** получает ограниченный task-scoped контекст, исполняет понятный следующий шаг и возвращает структурированный outcome/evidence без повторного чтения всей спеки и без собственного ad-hoc плана.

Superpowers подтверждает практическую ценность exact paths/interfaces, маленьких execution steps, fresh task context и task/branch review. Наше отличие — packet и его next action не живут отдельным Markdown-ledger: это версия `TaskPlanResult`, производная от canonical SpecGraph. Только MCP mutation/evidence ingestion меняют факты; агентский packet сам ничего не мутирует.

## Gap matrix: механизм → решение

| Механизм | Что уже есть в dev-pomogator | Сильнейший внешний сигнал | Вердикт | Почему |
|---|---|---|---|---|
| Канонический task node и round-trip | `TaskNode`, parser `TASKS.md`, builder, task lifecycle, MCP authoring | Подходящего внешнего компонента нет | **BUILD ON EXISTING** | Внешняя task-модель потеряет source spans, unknown fields, graph edges и миграционную семантику FR-72 |
| Typed dependencies, missing IDs, self-edge, cycles | Общий typed-edge schema и endpoint validation | Graphlib `topsort` корректен, но имеет 43 строки и общий `CycleException` без нашего diagnostic path | **BUILD** | Нужны qualified IDs, полный cycle path, strict/warn rollout и SpecGraph diagnostics; адаптер будет сложнее локального DFS/Kahn pass |
| Read/write/exclusive surfaces | Есть requirement-scoped `FILE_CHANGES`, но нет task-scoped access modes | BuildXL переводит outputs в `Write`, dependencies в `Read` | **ADAPT CONCEPT** | Сильная модель доступа; сам BuildXL — C#/engine runtime, поэтому переносим инварианты и тестовые случаи, не код |
| Derived conflicts | Есть runtime CAS/section locks, но нет pre-execution forecast | Из declared accesses следует матрица совместимости | **BUILD** | После нормализации это маленький pure predicate с доменными правилами path/API/schema/resource overlap |
| Dependency waves и conflict-free batches | Нет planner projection | Стандартные Kahn layers + deterministic packing | **BUILD** | Внешний scheduler не знает наши INVALID/STALE/BLOCKED состояния и semantic resources; runtime scheduler не нужен |
| Critical path и slack | Нет | Стандартный longest-path pass по DAG | **BUILD** | Нужен pure local pass с нашими estimates и tie-breaks |
| Task-owned evidence | Есть scenario evidence, coverage, provenance, recency и lifecycle gates | Внешние cache/workflow stores не совпадают с AC/scenario/spec evidence | **EXTEND EXISTING** | Источник истины уже здесь; добавляются ownership, run/digest policy и compatibility fallback |
| Stale reason chain | Есть scenario-centric stale detection, но нет task-level causal tree | Dagster `StaleCause {key, category, reason, dependency, children}` | **ADAPT SHAPE** | Полезна рекурсивная объяснимая причина; Apache-2.0 runtime и asset model не переносятся |
| Bounded discovery expansion | Есть атомарный `add_backlog_task`, uniqueness/FR/phase checks | Stable child IDs + budget-before-materialization | **BUILD ON AUTHORING DOOR** | Нужны наши CAS, graph patch, surface validation и all-or-nothing semantics |
| Stable report/MCP/persistence | Есть MCP lifecycle, SQLite graph persistence, query/report patterns, bundle | Внешний build report не знает SpecGraph | **EXTEND EXISTING API** | Добавляется одна JSON projection и graph-patch mutation; отдельный reporting framework не нужен |

## Анализ механизмов

### 1. Каноническая задача: расширять существующий TaskNode

Репозиторий уже имеет task-узлы, parser `TASKS.md`, builder, lifecycle, task census и MCP authoring. `TaskPlanNode` должен быть расширением `TaskNode` либо plan projection над ним. Второй parser, renderer или внешняя graph object model создадут расхождение между `TASKS.md`, SpecGraph, SQLite и MCP.

Нужно добавить к существующей модели:

- typed `depends-on` edges;
- `estimateMinutes` и нормализованную duration policy;
- task-scoped declared surfaces;
- явные task-owned evidence references;
- source-preserving unknown/comment fields для round-trip;
- derived readiness/diagnostics, не ручной planner status.

**Решение:** локальная эволюция `tools/spec-graph/types.ts`, `parsers/tasks.ts`, builder и renderer.

### 2. Dependency DAG: библиотека не окупается

Graphlib предоставляет generic graph container и `topsort`. Проверенная реализация имеет сложность `O(V+E)`, но сообщает цикл только общим `CycleException`. Для FR-73 дополнительно нужны:

- missing dependency IDs;
- self-dependency;
- qualified/case/Unicode ID policy;
- полный детерминированный cycle path;
- hard/soft edge semantics;
- source locations и conformance findings;
- сохранение invalid/legacy tasks в observe/warn режимах.

Это всё равно пришлось бы писать вокруг библиотеки. Сам алгоритм DFS/Kahn мал, а существующий SpecGraph уже хранит nodes/edges.

**Решение:** Graphlib не подключать. Реализовать pure `validateTaskDag`, `topologicalLayers` и predecessor/successor indexes над существующими типами.

**Источник:** [`dagrejs/graphlib/lib/alg/topsort.ts`](https://github.com/dagrejs/graphlib/blob/808bd95d395feeee9b67f91228390779027c2082/lib/alg/topsort.ts), MIT; проверено 2026-07-28.

### 3. Execution surfaces: адаптировать declared-access модель

Сильнейшая находка — не «ещё один граф», а разделение доступов. BuildXL в `LockManager` добавляет process outputs как `Write`, а dependencies как `Read`. Этот принцип напрямую переносится на task planning:

```text
read/read             → совместимо
read/write            → конфликт
write/write           → конфликт
exclusive/anything    → конфликт
```

У нас surface шире файловой системы:

```text
kind: file | glob | symbol | api-contract | schema | data |
      config | generated-artifact | test-resource |
      runtime-resource | external-contract
mode: read | write | exclusive
locator: normalized repository-relative or semantic key
```

Нормализация и overlap должны быть нашими, потому что BuildXL path locks не знают `api-contract`, `schema`, Docker resource, test fixture и redaction rules. `FILE_CHANGES.md` годится для reconciliation/diagnostics, но он requirement-scoped и не заменяет task declarations.

**Решение:** адаптировать модель и отрицательные случаи, реализовать локально. Никакой зависимости от BuildXL.

**Источники:**

- [`microsoft/BuildXL/.../Graph/LockManager.cs#L230-L233`](https://github.com/microsoft/BuildXL/blob/90c1407490bd0bb5c2133fc4a8ed40649f36af69/Public/Src/Pips/Dll/Graph/LockManager.cs#L230-L233) — outputs как `Write`, dependencies как `Read`;
- [`microsoft/BuildXL/.../Operations/Process.cs`](https://github.com/microsoft/BuildXL/blob/90c1407490bd0bb5c2133fc4a8ed40649f36af69/Public/Src/Pips/Dll/Operations/Process.cs) — declared dependencies/outputs;
- лицензия BuildXL: MIT.

### 4. Conflict relation: вычислять, не хранить

Conflict relation строится для выбранного task set после нормализации surfaces:

```ts
interface TaskConflict {
  leftTaskId: string;
  rightTaskId: string;
  reason: 'write-write' | 'read-write' | 'exclusive' | 'semantic-overlap';
  leftSurface: NormalizedSurface;
  rightSurface: NormalizedSurface;
}
```

Persisted conflict edges не нужны: после изменения task surface сохранённый conflict graph сразу устареет. Для небольших планов подходит детерминированный pairwise pass; при доказанной необходимости его можно индексировать по `kind + normalized locator` без изменения внешнего контракта.

**Решение:** pure local derivation в `task-conflicts.ts`.

### 5. Waves, batches, critical path и slack: запросы над одним DAG

Это не дополнительные graph engines.

1. **Wave:** Kahn layer из задач, чьи hard predecessors завершены или включены раньше.
2. **Batch:** детерминированная упаковка задач одной wave без conflict pair внутри.
3. **Critical path/slack:** longest forward/backward pass по тому же DAG с `estimateMinutes`.

Qualified task ID — окончательный tie-break. `BLOCKED`, `STALE` и `INVALID` не исчезают: они попадают в explicit unscheduled remainder с объяснением. `complete=true` допустим только при пустом remainder.

**Решение:** локальные pure projections в `task-planner.ts`; без Rush, Nx scheduler, Snakemake или другого runtime.

### 6. Evidence и staleness: расширить существующий контур

В проекте уже есть scenario evidence, canonical/filtered provenance, coverage, recency classification и stale overlay detection. Новый cache/fingerprint subsystem был бы второй истиной.

Нужен task-owned record/edge, связывающий задачу с evidence и состоянием входов:

```text
taskId
run/evidence ID
proof policy (full vs selected)
subject revision / digest
owned-surface digest
predecessor evidence digests
result + recordedAt
```

Staleness возвращает не boolean, а дерево причин. Полезная форма из Dagster:

```text
key + category + reason + dependency + children[]
```

Наши категории:

- `INPUT_CHANGED`;
- `SURFACE_CHANGED`;
- `DEPENDENCY_EVIDENCE_CHANGED`;
- `GRAPH_CHANGED`;
- `FULL_PROOF_REQUIRED`;
- `OBSERVED_MISMATCH`;
- `EVIDENCE_MISSING_OR_EXPIRED`.

**Решение:** адаптировать форму causal explanation, но вычислять её из SpecGraph, task evidence и существующей test provenance. Dagster не подключать.

**Источник:** [`dagster-io/dagster/.../data_version.py#L272-L350`](https://github.com/dagster-io/dagster/blob/935eb4e3361b39002867d1c24645699065c868e5/python_modules/dagster/dagster/_core/definitions/data_version.py#L272-L350), `StaleStatus`, `StaleCauseCategory`, `StaleCause`; Apache-2.0.

### 7. Discovery expansion: graph patch через существующую дверь

Discovery не должна мутировать `TASKS.md` по одному ребёнку. Она предлагает bounded graph patch:

```text
parentTaskId
baseRevision
children[] with stable IDs
new dependency/evidence edges
new declared surfaces
budget: maxChildren, maxDepth, maxTotalNodes, maxWriteClaims
proposalDigest
```

Порядок:

1. проверить budget **до** материализации;
2. вычислить стабильные child IDs из parent ID + semantic key, не из позиции;
3. валидировать весь будущий DAG, IDs, surfaces и conflicts;
4. показать dry-run и impact;
5. применить через CAS/all-or-nothing;
6. при повторе того же digest вернуть no-op;
7. high-impact write/exclusive expansion не auto-apply.

Существующий `add_backlog_task` даёт атомарную authoring основу; его надо обобщить до graph-patch, а не заменять external dynamic-mapping engine.

**Решение:** BUILD ON EXISTING AUTHORING DOOR.

### 8. API и report: одна JSON projection

Нужна одна каноническая `TaskPlanResult`, от которой форматируются MCP и CLI/report views:

```text
selected task nodes and dependency edges
validation diagnostics
ready frontier
conflicts with explanations
waves and conflict-free batches
critical path and per-task slack
impact and stale reason chains
unscheduled remainder
complete
revision / generatedFrom
```

SQLite сохраняет canonical graph/evidence/history; вычисленную projection можно кешировать по graph revision, но нельзя превращать в новый authority. MCP query и human report используют один serializer. Mutation API принимает только validated graph patches с dry-run/CAS/all-or-nothing semantics.

**Решение:** расширить текущие MCP lifecycle, tools, SQLite persistence и report formatters; отдельный reporting framework не нужен.

## Рекомендуемая архитектура

```text
Task authoring
  TASKS.md + MCP mutations
        │
        ▼
Existing SpecGraph builder
  task fields + typed dependencies + evidence edges + declared surfaces
        │
        ├── validation: IDs, endpoints, cycles, surface normalization
        ├── evidence projection: current / stale + causal reasons
        ├── conflict projection: overlap + explanation
        └── planner projection:
              readiness → waves → safe batches → critical path/slack
        │
        ▼
One TaskPlanResult serializer
  MCP query + CLI/report + SQLite cold/warm equivalence
```

### Модульные границы

| Модуль | Ответственность | Не должен делать |
|---|---|---|
| `types.ts` / `edge-schema.ts` | canonical fields и typed edges | планировать или обращаться к MCP |
| `parsers/tasks.ts` + renderer | source-preserving parse/round-trip | вычислять conflicts/readiness |
| `task-plan.ts` | вход/выход pure planning API | мутировать graph/SQLite |
| `task-conflicts.ts` | normalize/overlap/explain | хранить второй граф |
| `task-planner.ts` | readiness, waves, batches, critical path/slack | исполнять задачи |
| `task-impact.ts` | direct/transitive impact и stale reasons | владеть test results |
| MCP/SQLite | query, CAS mutation, persistence/history | дублировать algorithms |

## Build/adapt/adopt verdict

| Решение | Что входит |
|---|---|
| **ADOPT** | Ничего. Новая runtime/library dependency не оправдана |
| **ADAPT** | BuildXL declared read/write separation; Dagster recursive stale-cause shape; только концепты, инварианты и тест-кейсы |
| **BUILD ON EXISTING** | Task model, DAG validation, conflict derivation, waves/batches, critical path/slack, task-owned evidence integration, bounded graph patch, MCP/report projection |
| **REJECT** | Второй graph store; generic orchestrator/scheduler; Redis/PostgreSQL/Kubernetes/JVM/service dependency; command-cache fingerprint subsystem; persisted conflict graph |

## Риски и обязательные проверки

| Риск | Защита |
|---|---|
| Вторая истина между `TASKS.md`, SpecGraph и planner | Один parser/builder; parse-render-parse equivalence; projection-only planner |
| Ложно безопасный parallel batch из-за path alias/symlink/case | Repository-root normalization, case/Unicode policy, symlink/junction escape checks, semantic resource keys |
| `DONE` остаётся зелёным после изменения входа | Task-owned evidence + predecessor/surface digests + fail-closed stale reason |
| Invalid/legacy task пропадает из плана | Observe/warn/enforce сохраняет source count; explicit diagnostics и unscheduled remainder |
| `complete=true` при непомещённых задачах | AND-инвариант: complete только при пустом remainder |
| Discovery создаёт тысячи задач или частичный граф | Budget-before-materialization, stable IDs, dry-run, CAS/all-or-nothing |
| Bundle работает только рядом с `node_modules` | Installed `server.bundle.mjs` deps-absent BDD обязателен |

## Привязка к Phase 45

| Task | Решение из отчёта |
|---|---|
| P45-1 `p45-task-v1-contract` | расширить существующий TaskNode/parser/renderer; один canonical model |
| P45-2 `p45-dependency-dag` | local typed edges + deterministic DAG diagnostics |
| P45-3 `p45-execution-surfaces` | BuildXL-inspired declared access modes, local normalization |
| P45-4 `p45-conflict-graph` | derived relation, не persisted graph |
| P45-5 `p45-wave-planner` | pure readiness/waves/batches/critical-path projection |
| P45-6 `p45-owned-evidence-staleness` | reuse coverage/provenance; adapt recursive reason shape |
| P45-7 `p45-bounded-discovery` | graph patch поверх existing MCP authoring door |
| P45-8 `p45-mcp-persistence-reports` | один `TaskPlanResult` serializer для MCP/CLI/SQLite proof |
| P45-9 `p45-installed-rollout-proof` | observe/warn/enforce + deps-absent bundle proof |
| P45-10 `p45-full-verification` | real-engine BDD и corpus/invariant coverage |

## Проверенные первоисточники

| Механизм | Источник | Лицензия | Как используется |
|---|---|---|---|
| Generic topological sort | [`dagrejs/graphlib/lib/alg/topsort.ts`](https://github.com/dagrejs/graphlib/blob/808bd95d395feeee9b67f91228390779027c2082/lib/alg/topsort.ts) | MIT | Подтверждает, что алгоритм мал; зависимость отклонена |
| Declared read/write accesses | [`microsoft/BuildXL/.../LockManager.cs#L230-L233`](https://github.com/microsoft/BuildXL/blob/90c1407490bd0bb5c2133fc4a8ed40649f36af69/Public/Src/Pips/Dll/Graph/LockManager.cs#L230-L233), [`Process.cs`](https://github.com/microsoft/BuildXL/blob/90c1407490bd0bb5c2133fc4a8ed40649f36af69/Public/Src/Pips/Dll/Operations/Process.cs) | MIT | Адаптируется модель и инварианты, не код/runtime |
| Recursive stale reasons | [`dagster-io/dagster/.../data_version.py#L272-L350`](https://github.com/dagster-io/dagster/blob/935eb4e3361b39002867d1c24645699065c868e5/python_modules/dagster/dagster/_core/definitions/data_version.py#L272-L350) | Apache-2.0 | Адаптируется shape причин, не asset/runtime model |

Остальные ранее перечисленные проекты удалены из решения: они не меняют build-vs-adopt verdict и только дублировали DAG/scheduler/cache/runtime идеи.

## Финальная рекомендация

**Реализовать FR-72..FR-79 как planning projection существующего SpecGraph. Не подключать Graphlib и не внедрять внешний orchestrator.**

Первый вертикальный срез должен пройти через одну реальную цепочку:

1. `TASKS.md` task с typed dependency, estimate и surfaces;
2. parse/build в существующий SpecGraph;
3. cycle/readiness/conflict validation;
4. deterministic wave + safe batch + critical path;
5. task-owned BDD evidence;
6. изменение owned input делает задачу и зависимый хвост stale с reason chain;
7. тот же `TaskPlanResult` доступен через MCP, сохраняется/restores byte-equivalently и работает в installed deps-absent bundle.

Если этот вертикальный срез требует второй task store или отдельный scheduler runtime, архитектура неверна.

## 4. Алгоритмы первого инкремента

Совместимый якорь для существующей ссылки в DESIGN. Канонический анализ: [Анализ механизмов](#анализ-механизмов).

## 4.5 Safe parallel waves и batches

Совместимый якорь для существующей ссылки в DESIGN. Канонический анализ: [Waves, batches, critical path и slack](#5-waves-batches-critical-path-и-slack-запросы-над-одним-dag).

## Research snapshot and link stability

Совместимый якорь для существующей ссылки в DESIGN. Актуальный verdict: [Build/adapt/adopt verdict](#buildadaptadopt-verdict).
