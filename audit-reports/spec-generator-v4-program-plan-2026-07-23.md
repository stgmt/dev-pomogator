# Program plan: честно завершить spec-generator-v4 и взять новые gaps в работу

Дата: 2026-07-23  
Baseline: `main` @ `5e4dc4a0a3acb51cfc55ca68ea02c31f0653bafb`  
Статус документа: implementation-ready plan; код и spec-status этим документом не меняются.
Tracking issue: [#162](https://github.com/stgmt/dev-pomogator/issues/162).

## 💬 Простыми словами

### Сейчас (как работает)

Последний PR исправил свою часть и оставил зелёный canonical snapshot, но общий проект всё ещё выглядит готовым и неготовым одновременно. В старой спеке 45 задач названы готовыми с незакрытыми условиями, ещё 36 задач не закончены, а разные status-инструменты спорят о том, свежи ли 526 сценариев. Параллельно появились шесть новых issues.

### Как должно быть (как я понял)

Нужно взять весь остаток в одну управляемую программу: сначала починить источник правды и ownership, затем закрыть реальный legacy backlog, отдельно реализовать новые product gates и в конце получить один непротиворечивый READY-вердикт на текущем commit.

### Правильно понял?

Понимаю мандат так: ничего не выбрасывать, но и не превращать 81 статусную запись в 81 фиктивную фичу. Каждый workstream получает владельца, отдельный PR boundary, BDD-доказательство и явную зависимость; `spec-generator-v4` после этого закрывается, а новые большие функции живут в новых спеках.

## 🎯 Context

### Extracted Requirements

1. Взять в работу все 45 task-truth долгов, 36 non-DONE задач, status/precheck defects и issues #149/#153/#157/#159/#160/#161.
2. Разделить документальный drift, реальный implementation backlog и новую продуктовую работу.
3. Не добавлять бесконечно новый scope в историческую `spec-generator-v4`.
4. Для каждого workstream определить owning spec, исходники, BDD, порядок PR и объективный Done.
5. Завершить программу свежим SHA-bound Docker proof, semantic verdict и Finalization STOP.

### Hypotheses and verification

| H | Гипотеза | Вердикт |
|---|---|---|
| H1 | 81 статусная запись сводится к ограниченному числу независимых workstreams | **[VERIFIED]**: MCP TASKS/status, source ownership и GitHub issues дают 10 bounded packages |
| H2 | Сначала нужен provenance/status foundation | **[VERIFIED]**: effective coverage = 526 stale, canonical = 526 passed, EXECUTION при этом GREEN |
| H3 | 45 DONE-долгов — не 45 доказанных code gaps | **[VERIFIED]**: все имеют graph mappings; canonical scenarios green; unchecked `Done When` остаются недоказанными |
| H4 | Phase 27 должен принадлежать `bdd-only-migration` | **[VERIFIED]**: её FR-5..7 требуют full rollout; MCP считает spec READY; git всё ещё содержит 121 non-BDD test file |
| H5 | #149 и #161 — одна state-machine проблема | **[VERIFIED]**: incident history, current-turn-only `evidenceSatisfied`, отсутствующий carried state |
| H6 | #160 требует runtime triage, а не немедленного fail-open | **[NEEDS_CONFIRMATION]**: main различает controlled `exit(2)`, но свежий installed-runtime repro ещё не выполнен |
| H7 | #153/#157 нельзя добавлять в giant v4 | **[VERIFIED]**: это самостоятельные lifecycle/artifact gates, а v4 уже имеет 65 FR и незакрытый Finalization |

### 🔎 Источники / Пруфы

- [cmd:`git rev-parse HEAD`] → `5e4dc4a0a3acb51cfc55ca68ea02c31f0653bafb`.
- [cmd:MCP `get_spec_status(spec-generator-v4)`] → 526 scenarios, readiness NOT_READY, TASK_TRUTH debt 45.
- [cmd:MCP `read_spec_doc(TASKS.md)`] → 207 DONE, 2 IN_PROGRESS, 34 TODO.
- [cmd:MCP coverage] → effective 526 stale, canonical snapshot 526 passed.
- [cmd:`git ls-files` inventory] → 121 tracked non-BDD test-like files before classifier exclusions.
- [ref:`tools/spec-graph/coverage.ts`] — effective/canonical scenario and task coverage calculation.
- [ref:`.agents/skills/spec-status/scripts/precheck.ts`] — AC/test path/git provenance producer.
- [ref:`tools/claim-evidence-gate/claim_classifier.ts:185`] — current-turn executor requirement.
- [ref:`tools/specs-validator/spec-form-parsers.ts:35`] — `missingFirst`-only form contract.
- [ref:`tools/spec-mcp-server/tools.ts:2034`] — existing multi-document transaction API.
- [src:https://github.com/stgmt/dev-pomogator/issues/149] — normative blocker incident and repeated Stop loop.
- [src:https://github.com/stgmt/dev-pomogator/issues/153] — independent adversarial review requirement.
- [src:https://github.com/stgmt/dev-pomogator/issues/157] — executable live-verification requirement.
- [src:https://github.com/stgmt/dev-pomogator/issues/159] — aggregate form diagnostics pain report.
- [src:https://github.com/stgmt/dev-pomogator/issues/160] — Windows runner/runtime report requiring fresh reproduction.
- [src:https://github.com/stgmt/dev-pomogator/issues/161] — carry-over evidence incident and proposed semantics.
- [src:https://github.com/stgmt/dev-pomogator/issues/162] — umbrella tracking checklist и ownership decisions этой программы.

## Existing-Spec Inventory

### Domain/Lifecycle

- `spec-generator-v4`: active, lifecycle GREEN, readiness NOT_READY; 65 FR / 175 AC / 526 scenarios / 243 tasks; 45 TASK_TRUTH debts; 2 IN_PROGRESS + 34 TODO; Finalization STOP не подтверждён.
- `bdd-only-migration`: active, readiness READY, но FR-5 требует миграцию всех vitest-тестов; tracked tail = **121** файлов **[SINGLE_SOURCE: `git ls-files`]**. READY противоречит реальности.
- `claim-evidence-gate`: active, SPEC_ONLY, 0 FR / 0 AC / 0 source scenarios / 2 tasks; executable CEGATE scenarios существуют, но BDD_SYNC RED. Сначала требуется нормализация спеки.
- `dev-pomogator-canonical-plugin`: active, lifecycle RED, readiness NOT_READY; естественный owner runtime/distribution issue #160.
- `create-specs-bdd-enforcement`: READY и описывает существующий BDD bootstrap, но не покрывает independent adversarial review или live-verification lifecycle.
- Новые owning specs: `spec-door-form-diagnostics`, `independent-adversarial-spec-review`, `live-verification-readiness`, `spec-corpus-trace-retrofit`.

### Installation/Runtime

- Canonical source runner: `tools/_shared/tsx-runner.js`; main уже отличает controlled child `exit(2)`.
- Installed plugin cache может отставать от main; #160 нельзя закрывать без reinstall + live Windows reproduction.
- Docker/BDD путь репозитория WSL-only; host `docker ps` не является достаточным blocker probe.
- Plugin-distributed изменения требуют rebuild bundle, deps-absent launch и reinstall/reload proof.

### Verification

- Последний canonical run: 526/526 passed at `2026-07-22T21:52:13.089Z`, но effective coverage текущего HEAD показывает 526 stale.
- Full BDD запускается только в Docker через `/run-tests`; host cucumber запрещён.
- Bugfix/new behavior получает собственный `@featureN` scenario, real engine, collision dry-run и mutation-style proof.
- Final acceptance использует smart `spec-verdict`, а не голый structural validator.

### Repository Baseline

- HEAD/origin main: `5e4dc4a0a3acb51cfc55ca68ea02c31f0653bafb`.
- До этого плана были два пользовательских untracked отчёта; они не должны попасть в случайный commit.
- PR #158 уже merged; его scope не открывается повторно.

## 👤 User Stories

1. Как владелец, я хочу один честный program backlog, чтобы понимать, что реально осталось, а что является status drift.
2. Как разработчик, я хочу, чтобы effective coverage и readiness использовали один SHA/freshness contract, чтобы зелёный verdict нельзя было получить на stale evidence.
3. Как сопровождающий spec-generator, я хочу закрыть v4 без добавления бесконечных новых FR.
4. Как автор тестов, я хочу завершить BDD rollout в его owning spec, чтобы READY означал отсутствие non-BDD tail.
5. Как пользователь claim gate, я хочу перенос свежей evidence и уважение нормативных blockers без бесконечных повторов.
6. Как автор спеки, я хочу независимое adversarial review и отдельную live verification, чтобы spec-ready не выдавался за implemented/live-verified.
7. Как Windows-пользователь, я хочу отличать policy deny от runner crash и получать исправленный установленный runtime.

## 🔀 Use Cases

1. **UC-1 — Current-SHA verdict:** после изменения кода старый canonical pass становится stale и EXECUTION не остаётся безусловно GREEN.
2. **UC-2 — Historical task reconciliation:** DONE-задача закрывается только после проверки каждого Done When и собственного evidence mapping.
3. **UC-3 — BDD migration:** каждая группа non-BDD tests получает real-code feature/steps, mutation proof и только затем удаляется.
4. **UC-4 — Claim gate across turns:** успешный executor proof переносится через неизменные ходы и инвалидируется relevant mutation.
5. **UC-5 — Normative blocker:** owner rule/user approval фиксируется как legitimate stop, не fake hand-off.
6. **UC-6 — Form diagnostics:** дверь возвращает все missing fields за один отказ, сохраняя backward-compatible `missingFirst`.
7. **UC-7 — Independent review:** author identity не может сам принять собственный adversarial artifact.
8. **UC-8 — Live verification:** spec-ready, implementation-complete и live-verified имеют разные evidence и статусы.
9. **UC-9 — Windows runner:** fresh installed plugin показывает controlled deny отдельно от loader failure.

## 📐 Requirements

### FR (Functional Requirements)

1. **FR-P1 — Unified evidence provenance.** Coverage, precheck, MCP status и spec-verdict SHALL сохранять полный AC id, current git SHA, test paths и один effective freshness result.
2. **FR-P2 — Honest legacy reconciliation.** 45 contradictory DONE tasks и 19 Phase 33–37 TODO tasks SHALL быть проверены contract-by-contract; blanket status flip запрещён.
3. **FR-P3 — Ownership transfer.** Phase 27 SHALL быть перенесена/связана с `bdd-only-migration`; P22 corpus retrofit SHALL иметь отдельный backlog owner; stale `ws-f-remaining` SHALL быть переписан или закрыт.
4. **FR-P4 — BDD-only completion.** `bdd-only-migration` SHALL перестать быть READY, пока tracked target tail не мигрирован или явно исключён по проверяемой политике.
5. **FR-P5 — FR-56 completion.** Effective overlay merge, runtime trace edge, real BDD и bounded compaction SHALL быть реализованы до миграции их собственных reader tests.
6. **FR-P6 — Claim gate state machine.** #149/#161 SHALL быть реализованы одним design: carried evidence, mutation invalidation, normative blockers, bounded repeated verdict и grounded counts.
7. **FR-P7 — Aggregate form errors.** #159 SHALL добавить `missingAll` без дублирования уже существующего multi-document transaction API.
8. **FR-P8 — Runtime triage.** #160 SHALL воспроизводиться на freshly installed main; controlled deny не считается crash; real resolver failure получает отдельный fix.
9. **FR-P9 — Independent review.** #153 SHALL иметь отдельную spec/artifact/identity/readiness lane и fail-closed stale-review semantics.
10. **FR-P10 — Live verification lifecycle.** #157 SHALL иметь отдельные spec-ready / implementation / live / production states и commit-bound evidence.
11. **FR-P11 — Bounded v4 closure.** Новые FR-P7/P9/P10 не добавляются в giant v4; v4 закрывает только уже принадлежащие ей contracts и cross-spec links.

### Acceptance Criteria (EARS)

1. WHEN current SHA differs from evidence SHA THEN effective execution SHALL be stale/not-ready, независимо от historical canonical snapshot.
2. WHEN all task Done When items have explicit current evidence THEN task status MAY become DONE; OTHERWISE it SHALL remain non-verified.
3. WHEN `bdd-only-migration` claims READY AND target non-BDD files remain THEN verdict SHALL be NOT_READY with exact inventory.
4. WHEN a Phase 27 test is migrated THEN its BDD SHALL fail under a production mutation before the old test is deleted.
5. WHEN an executor ran on an earlier turn AND no relevant mutator followed THEN works-done MAY use carried evidence.
6. WHEN a repository rule requires owner approval THEN claim gate SHALL accept a persisted normative blocker and SHALL NOT demand the prohibited action.
7. WHEN a form block misses N fields THEN MCP mutation SHALL report all N fields in one response while legacy guards still receive `missingFirst`.
8. WHEN a child hook intentionally exits 2 THEN runner diagnostics SHALL say controlled exit/deny; WHEN resolver loading fails THEN diagnostics SHALL name the failed strategy and resolver error.
9. WHEN the same run identity authored and reviewed a spec THEN adversarial readiness SHALL remain RED.
10. WHEN implementation lacks runtime/browser evidence THEN it SHALL NOT become live-verified even if build and BDD are green.
11. WHEN the program finishes THEN every owning spec SHALL have a fresh smart verdict and v4 Finalization STOP SHALL be confirmed.

### NFR (Non-Functional Requirements)

#### Performance

- Coverage/overlay scan remains bounded; compaction keeps at most the configured latest-per-scenario/window state.
- UserPromptSubmit/Stop hot paths do not add unbounded filesystem scans or repeated test executions.

#### Security

- Normative approval cannot be synthesized by a gate or reviewer agent.
- Adversarial-review and live-evidence artifacts contain hashes/paths, not secrets or auth material.

#### Reliability

- Status writes remain atomic/CAS-safe; bundle/source/runtime versions are proven aligned.
- Every workstream has mutation-resistant BDD and a current-SHA acceptance record.

#### Usability

- Status output distinguishes historical canonical proof, effective current proof and missing human decision.
- Form errors arrive as one actionable list; runner output distinguishes deny from crash.

### Assumptions

- Existing public issues remain the authoritative pain records; no issue is closed merely by planning.
- The 121-file count is a current git inventory and must be regenerated at execution start.
- P22 corpus retrofit is incremental and should not silently block v4 forever; ownership must be made explicit.

### Risks

- Migrating spec-graph reader tests before FR-56 stabilizes can validate a moving implementation and create fake parity.
- Bulk-editing TASKS can falsely close real live/policy obligations.
- #153 and #157 share readiness infrastructure but can become one oversized coupled artifact if boundaries are not enforced.
- Installed cache may overwrite local hotfix evidence; source+bundle+runtime must be verified together.
- Full semantic verdict may be slow; timeout is a failure to investigate, not permission to call semantic VERIFIED.

### Out of Scope

- Reopening or rewriting the merged PR #158 implementation.
- Direct production deployment or force-push.
- Treating all 121 tracked test-like files as migration targets without classifier/exclusion inventory.
- Committing the user's existing untracked reports without an explicit commit scope.

## 🔧 Implementation Plan

1. **WP-0 — Tracking and ownership freeze.** Umbrella GitHub issue #162 создан; link existing issues, assign owning specs, and prohibit further feature additions to v4 outside already-owned FR-56/61–64 corrections.
2. **WP-1 — Evidence/status foundation (PR 1).** Fix AC-id preservation, test path discovery, git SHA provenance, WSL-aware Docker blocker logic, duplicate scenario-key inventory and effective/canonical readiness alignment. This PR must land before any mass task reconciliation.
3. **WP-2 — FR-56 coverage completion (PR 2).** Finish Phase 29 reader merge, trace edge, real `@feature56` BDD and overlay compaction against the corrected provenance model.
4. **WP-3 — Historical truth reconciliation (PR 3).** Audit 45 DONE tasks × 147 Done When plus Phase 33/35 status drift; rewrite obsolete paths, preserve unresolved live decisions, close stale `ws-f` umbrella, and leave honest non-DONE statuses.
5. **WP-4 — Ownership extraction (PR 4, spec-only).** Move/link Phase 27 to `bdd-only-migration`, move P22 to `spec-corpus-trace-retrofit`, and make cross-spec dependencies explicit so v4 has a bounded completion set.
6. **WP-5 — BDD migration rollout (series of one-area PRs).** Reopen `bdd-only-migration` readiness, regenerate classifier inventory, migrate spec-graph only after WP-2, then spec-mcp, backlog, anchor, marksman, satellites, gate tooling and skill scripts; execute final gate switch last.
7. **WP-6 — Claim gate hardening (one feature PR).** Normalize the existing claim spec, author source BDD for executable CEGATE scenarios, then implement #149+#161 as one state-machine change with transcript fixtures and live Stop proof.
8. **WP-7 — Small corrective issues.** Implement #159 as one narrow form-diagnostics PR; separately reinstall/reproduce #160 and either close it as stale-runtime misdiagnosis or fix the proven runner defect in canonical-plugin ownership.
9. **WP-8 — Independent adversarial review (one feature PR).** Create a new spec, machine artifact and independent reviewer gate; integrate with orchestrator/status/verdict without reusing author identity.
10. **WP-9 — Live verification lifecycle (one feature PR).** Create a separate spec and evidence state machine; depend on WP-8 for review of feasibility but keep live artifact/status independent.
11. **WP-10 — Final v4 attestation (final PR).** Re-run task reconciliation on fresh HEAD, full Docker BDD, semantic verdict, corpus cross-check and Finalization STOP; publish final report only after all mandatory lanes agree.

### Dependency order

`WP-0 → WP-1 → WP-2 → WP-3/WP-4 → WP-5 → WP-10`

`WP-0 → WP-6`

`WP-0 → WP-7`

`WP-1 → WP-8 → WP-9`

WP-6/WP-7/WP-8/WP-9 may proceed in parallel after their prerequisites, but they do not block the bounded v4 closure unless a cross-spec dependency is explicitly promoted to mandatory.

## 💥 Impact Analysis

| Area | Impact | Action |
|---|---|---|
| Readiness semantics | Behavioral change: stale current proof can no longer look execution-GREEN | Add BDD before changing rollup logic; verify MCP and CLI agreement |
| Existing statuses | Many task rows may change without code changes | Require per-item evidence ledger and MCP-door mutation |
| BDD suite | Up to 121 tracked non-BDD candidates; actual target set smaller after classification | Migrate area-by-area, delete only after mutation proof |
| Plugin runtime | Source/cache mismatch can invalidate #160 conclusions | Rebuild, reinstall, restart/reload and capture live diagnostics |
| Claim Stop hook | Stateful cross-turn behavior affects every agent stop | Transcript fixtures, bounded state, fail-open on corruption |
| create-spec workflow | New review/live phases add latency and artifacts | Separate gates, capped review loop, explicit not-applicable surface classification |
| Cross-spec corpus | P22 may touch hundreds of FRs | Move to incremental corpus owner; do not bulk-edit all specs in v4 PR |

## 📋 Todos

### 📋 `wp1-evidence-foundation`

> Сделать один источник правды для current-SHA evidence и readiness.

- **files:** `tools/spec-graph/coverage.ts`, `tools/spec-graph/readiness-inventory.ts`, `tools/spec-graph/release-inventory.ts`, `tools/specs-generator/spec-verdict.ts`, `.agents/skills/spec-status/scripts/precheck.ts`, `.agents/skills/spec-status/scripts/env-blockers.ts`, `tools/spec-mcp-server/tools.ts`, BDD feature/steps.
- **changes:**
  - Сохранить полные AC identifiers, обнаруживать test paths и прикреплять evidence к resolved commit SHA.
  - Сделать Docker probe WSL-aware и отделить environment blocker от host-only false negative.
  - Устранить duplicate-key inventory 526/518 и согласовать effective/canonical execution lanes между MCP и CLI.
- **refs:** Phase 34/36/37, FR-61..64, report finding `effective 526 stale`.
- **deps:** WP-0.

---

### 📋 `wp2-fr56-coverage`

> Завершить Phase 29 до миграции тестов самого coverage reader.

- **files:** `tools/spec-graph/coverage.ts`, `tools/spec-graph/task-census.ts`, `tools/spec-graph/types.ts`, `tools/spec-graph/parsers/scenario-overlay.ts`, `tools/spec-mcp-server/tools.ts`, `tests/features/plugins/spec-generator-v4.feature`, matching step definitions.
- **changes:**
  - Merge latest canonical/overlay result with feature+step freshness guard and production-code follow-up contract.
  - Add trace pointer/result/log chain and bounded latest-per-scenario overlay compaction mechanism.
  - Prove stale/pass/not-run buckets and `get_scenario_trace` through real-engine Docker BDD scenarios.
- **refs:** `p29-reader-merge-staleness`, `p29-graph-runtime-trace-edge`, `p29-feature56-bdd`, `p29-overlay-compaction`.
- **deps:** wp1-evidence-foundation.

---

### 📋 `wp3-task-truth-reconcile`

> Закрыть status drift без blanket checkbox flips.

- **files:** `.specs/spec-generator-v4/TASKS.md`, `.specs/spec-generator-v4/README.md`, `.specs/spec-generator-v4/CHANGELOG.md`, reconciliation evidence report.
- **changes:**
  - Построить 45×147 evidence ledger и проверить каждый Done When по коду, mapped scenario и live obligation.
  - Переписать obsolete `extensions/`/`.claude/` contracts на canonical layout или отметить waived/blocked.
  - Сверить Phase 33/35 TODO с merged implementation; Phase 34/36/37 закрывать только после WP-1 proof.
- **refs:** TASK_TRUTH debt 45; P33–P37; `ws-f-remaining` stale umbrella.
- **deps:** wp1-evidence-foundation, wp2-fr56-coverage.

---

### 📋 `wp4-cross-spec-ownership`

> Убрать program work из giant v4 в правильные owning specs.

- **files:** `.specs/spec-generator-v4/TASKS.md`, `.specs/bdd-only-migration/*`, `.specs/spec-corpus-trace-retrofit/*`, cross-spec ownership records.
- **changes:**
  - Перенести/связать Phase 27 tasks с FR-5..7 `bdd-only-migration` и снять её false READY.
  - Вынести P22 design/story retrofit в отдельную incremental backlog spec с delta-scope policy.
  - Оставить v4 только обязательные собственные completion contracts и cross-spec links.
- **refs:** Phase 27, `p22-design-trace-rest`, `bdd-only-migration` FR-5..7.
- **deps:** wp1-evidence-foundation.

---

### 📋 `wp5-bdd-rollout`

> Мигрировать реальный non-BDD tail сериями one-area PR.

- **files:** `tools/**/__tests__/*.test.ts`, `.agents/skills/**/__tests__/*.test.ts`, `.claude/skills/**/__tests__/*.test.ts`, `tests/features/plugins/**`, `tests/step_definitions/**`, `cucumber.json`.
- **changes:**
  - Regenerate target/exclusion inventory and migrate only after real BDD parity plus mutation proof.
  - Sequence spec-graph after WP-2; wire each feature only when every scenario has step definitions.
  - Delete old tests after green Docker equivalence; perform final cucumber gate switch last.
- **refs:** P27-2/P27-4..13, `bdd-only-migration` FR-5..7.
- **deps:** wp4-cross-spec-ownership; wp2-fr56-coverage before spec-graph slice.

---

### 📋 `wp6-claim-state-machine`

> Реализовать #149+#161 в существующей claim-evidence-gate ownership.

- **files:** `.specs/claim-evidence-gate/*`, `tools/claim-evidence-gate/claim_classifier.ts`, `tools/claim-evidence-gate/claim_evidence_gate_stop.ts`, `tools/claim-evidence-gate/meridian-judge.ts`, bundle, CEGATE feature/steps/fixtures.
- **changes:**
  - Нормализовать FR/AC/source scenarios и убрать текущий BDD_SYNC split между исходником и executable suite.
  - Persist carried verification with mutation invalidation and normative blocker ownership.
  - Bound identical verdict loops and ground all task counts in observed inputs.
- **refs:** issues #149 and #161.
- **deps:** WP-0.

---

### 📋 `wp7-small-corrections`

> Закрыть #159 и честно переоценить #160 отдельными PR/issue outcomes.

- **files:** `tools/specs-validator/spec-form-parsers.ts`, form guards, `tools/spec-mcp-server/mutations.ts`, bundles, `tools/_shared/tsx-runner.js`, `.specs/spec-door-form-diagnostics/*`, `.specs/dev-pomogator-canonical-plugin/*`.
- **changes:**
  - Добавить `missingAll[]`, оставить `missingFirst` совместимым и использовать существующий transaction API.
  - Rebuild/reinstall current plugin, reproduce three hooks on Windows and distinguish controlled deny from resolver crash.
  - Исправлять runner только при доказанном loader failure; policy hooks не переводить массово в fail-open.
- **refs:** issues #159 and #160; PR #155/#158 transaction work.
- **deps:** WP-0.

---

### 📋 `wp8-independent-review`

> Реализовать самостоятельный adversarial readiness gate.

- **files:** `.specs/independent-adversarial-spec-review/*`, `.agents/skills/create-spec/**`, `.agents/skills/spec-generator-orchestrator/**`, status/verdict engine, BDD feature/steps.
- **changes:**
  - Persist author/reviewer identities, revision hash, P0–P3 findings, waivers and residual risks.
  - Запретить self-review, stale artifact и unresolved P0/P1; ограничить remediation loop тремя раундами.
  - Prove detection and clean false-positive control against real repository fixtures.
- **refs:** issue #153.
- **deps:** wp1-evidence-foundation.

---

### 📋 `wp9-live-verification`

> Ввести отдельный executable live-verification lifecycle.

- **files:** `.specs/live-verification-readiness/*`, create-spec templates/workflow, status/verdict/claim integration, BDD feature/steps.
- **changes:**
  - Derive required live task from every affected UI/API/runtime/infra/auth/billing/deploy surface deterministically.
  - Persist startup, health, auth, journey, viewport, logs, evidence paths and tested commit.
  - Keep spec-ready, implementation-complete, live-verified and production-verified as four separate persisted states.
- **refs:** issue #157; independent review #153.
- **deps:** wp8-independent-review for plan-feasibility review; wp1-evidence-foundation for commit-bound evidence.

---

### 📋 `wp10-final-attestation`

> Закрыть v4 только после согласованного полного доказательства.

- **files:** `.specs/spec-generator-v4/.progress.json`, `.specs/spec-generator-v4/TASKS.md`, `.specs/spec-generator-v4/README.md`, `.specs/spec-generator-v4/CHANGELOG.md`, final audit report.
- **changes:**
  - Rebuild graph on final HEAD, run full Docker BDD and semantic verdict without skipped mandatory lane.
  - Confirm every mandatory readiness lane, reconcile cross-spec dependencies and confirm Finalization STOP.
  - Record exact SHA, scenario inventory, task census, issue outcomes and residual backlog.
- **refs:** spec-generator-v4 Finalization; all previous work packages.
- **deps:** wp1–wp5 complete; v4-owned mandatory blockers resolved.

## Definition of Done

### Verification Plan

Automated Tests:

- `/run-tests` — полный Docker suite без host BDD.
- `/run-tests --name SPECGEN004` — focused v4 scenarios через централизованный runner.
- `/run-tests --name CEGATE001` — real claim-gate transcript scenarios.
- `/run-tests --tags @feature56` — coverage overlay/trace/compaction proof.
- `/run-tests --tags <new-feature-tag>` — отдельный focused proof для #153/#157/#159.
- `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/spec-generator-v4` — smart final verdict.
- `npx tsx tools/specs-generator/audit-spec.ts -Path .specs/spec-generator-v4` — structural/conformance pre-filter.
- `npx tsx tools/plan-pomogator/validate-plan.ts audit-reports/spec-generator-v4-program-plan-2026-07-23.md` — план структурно валиден.

Program Done означает одновременно:

- v4 current-SHA coverage fresh и все mandatory lanes GREEN;
- 45 task-truth debts отсутствуют;
- 36 non-DONE записей либо выполнены, либо перенесены в owning spec с честным status;
- `bdd-only-migration` больше не false-READY и имеет проверяемый remaining inventory;
- #149/#153/#157/#159/#160/#161 имеют merged outcome или явно доказанный закрывающий verdict;
- source, bundles, installed runtime и GitHub CI согласованы;
- Finalization STOP подтверждён независимой проверкой.

## 📁 File Changes

| Path | Action | Reason |
|---|---|---|
| `audit-reports/spec-generator-v4-program-plan-2026-07-23.md` | create | Зафиксировать полный program backlog, зависимости, PR boundaries и доказательства |
| `audit-reports/spec-generator-v4-remaining-work-2026-07-23.md` | edit | Исправить пересчитанный split 2 IN_PROGRESS плюс 34 TODO |
| `.specs/spec-generator-v4/TASKS.md` | edit | Reconcile task truth, status drift, ownership links и bounded v4 scope |
| `.specs/spec-generator-v4/README.md` | edit | Обновить честный lifecycle и remaining ownership после программы |
| `.specs/spec-generator-v4/CHANGELOG.md` | edit | Записать closure phases и итоговую переаттестацию |
| `.specs/bdd-only-migration/*` | edit | Принять Phase 27 ownership и убрать false READY до завершения tail |
| `.specs/claim-evidence-gate/*` | edit | Нормализовать FR/AC/source BDD и описать #149+#161 state machine |
| `.specs/dev-pomogator-canonical-plugin/*` | edit | Трассировать свежий runtime verdict и возможное исправление issue #160 |
| `.specs/spec-door-form-diagnostics/*` | create | Отдельно специфицировать узкий `missingAll` bugfix #159 |
| `.specs/independent-adversarial-spec-review/*` | create | Специфицировать independent reviewer artifact и readiness gate #153 |
| `.specs/live-verification-readiness/*` | create | Специфицировать commit-bound live verification lifecycle #157 |
| `.specs/spec-corpus-trace-retrofit/*` | create | Вынести инкрементальный P22 corpus retrofit из giant v4 |
| `.agents/skills/spec-status/scripts/precheck.ts` | edit | Сохранить полные AC ids, test paths и git SHA provenance |
| `.agents/skills/spec-status/scripts/env-blockers.ts` | edit | Сделать Docker blocker проверку WSL-aware |
| `tools/spec-graph/coverage.ts` | edit | Согласовать effective/canonical freshness и task verification |
| `tools/spec-graph/task-census.ts` | edit | Использовать тот же effective result и bounded overlay inventory |
| `tools/spec-graph/readiness-inventory.ts` | edit | Устранить scenario inventory и mandatory-lane disagreement |
| `tools/spec-graph/release-inventory.ts` | edit | Привязать release evidence к resolved current SHA |
| `tools/spec-graph/types.ts` | edit | Добавить runtime trace/provenance поля при необходимости |
| `tools/spec-graph/parsers/scenario-overlay.ts` | edit | Merge, dedupe и compaction semantics для scenario overlay |
| `tools/specs-generator/spec-verdict.ts` | edit | Свести smart verdict с effective evidence и cross-spec blockers |
| `tools/spec-mcp-server/tools.ts` | edit | Выдать согласованные status, trace и form diagnostics через MCP API |
| `tools/spec-mcp-server/mutations.ts` | edit | Возвращать все form findings без дублирования transaction engine |
| `tools/specs-validator/spec-form-parsers.ts` | edit | Добавить backward-compatible `missingAll` во все form parsers |
| `tools/claim-evidence-gate/claim_classifier.ts` | edit | Поддержать carried evidence и scoped invalidation |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.ts` | edit | Persist blocker/evidence state и bounded loop semantics |
| `tools/claim-evidence-gate/meridian-judge.ts` | edit | Ground normative blockers и запретить выдуманные counts |
| `tools/_shared/tsx-runner.js` | edit | Исправлять только доказанный resolver/runtime defect #160 |
| `tools/**/__tests__/*.test.ts` | delete | Удалять classified migration targets только после BDD parity и mutation proof |
| `.agents/skills/**/__tests__/*.test.ts` | delete | Завершить skill-script tail через real-code BDD |
| `tests/features/plugins/**` | create | Добавить traceable source BDD для каждого workstream |
| `tests/features/plugins/spec-door-form-diagnostics.feature` | create | Добавить регрессионный BDD сценарий для aggregate missing-fields bugfix |
| `tests/step_definitions/**` | create | Драйвить реальные engines/hooks без inline-копий и mocks |
| `tools/spec-mcp-server/server.bundle.mjs` | edit | Синхронизировать distributed MCP runtime с source changes |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs` | edit | Синхронизировать distributed Stop hook с source state machine |
