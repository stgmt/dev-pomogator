# План: удалить procurement-контаминацию из dev-pomogator

## 💬 Простыми словами

### Сейчас (как работает)

Сообщение про камеру и лимит €200 относилось к соседнему проекту, но из него в dev-pomogator попали товарные триггеры, правила отбора, спеки и тесты. В том же уже отправленном коммите находятся полезные и отдельно запрошенные исправления миграции Haiku → DeepSeek для установленных пользователей.

### Как должно быть (как я понял)

Из dev-pomogator нужно точечно удалить только закупочную логику и её тестовые/спековые следы. Миграция DeepSeek/AiPomogator, credential precedence, версия 2.0.6 и универсальная проверка provider-контракта должны остаться.

### Правильно понял?

Да: граница cleanup определяется происхождением изменения, а не общим коммитом. Поэтому целый коммит откатывать нельзя; нужен отдельный точечный cleanup поверх текущей ветки.

## 🎯 Context

Пользователь уточнил, что сообщение про камеру, товары и потолок €200 относилось к соседнему проекту закупок. На основании ошибочно приписанного контекста в mixed commit `05c8109b` были добавлены product/buying-триггеры, hard-gate логика товаров, BDD и правки спеки `specs-management-as-skill`. Одновременно этот коммит содержит полезную миграцию Haiku → DeepSeek и исправления реального provider/credential-контракта claude-mem. [cmd:`git show --stat --oneline 05c8109b` и path-scoped diff показали оба класса изменений]

### Extracted Requirements

1. Удалить из dev-pomogator всё, что появилось из ошибочно присланного procurement/€200 контекста.
2. Сначала подготовить анализ и план, а не делать blanket revert.
3. Сохранить миграцию существующих пользователей с Haiku на DeepSeek через корректный AiPomogator/OpenRouter provider contract.
4. Не затронуть unrelated изменения общего рабочего дерева.
5. Спеки менять только через spec-door; BDD запускать только в Docker.

## 📚 Existing-Spec Inventory

### Domain/Lifecycle

- `.specs/specs-management-as-skill/` — ошибочная procurement-семантика попала в `FR.md`, `ACCEPTANCE_CRITERIA.md`, `DESIGN.md`, `FILE_CHANGES.md` и canonical feature; её нужно точечно убрать через spec-door. [cmd:`node --import tsx scripts/spec-door.ts search "SPECMGT001_15"` и сохранённые baseline artifacts]
- `.specs/claude-mem-integration/claude-mem-integration.feature` — владеет полезными сценариями installed-user migration `CMEM001_28..33`; cleanup её не меняет. [ref:.specs/claude-mem-integration/claude-mem-integration.feature:136-180]
- Новая отдельная feature-spec для cleanup не нужна: это исправление ошибочно внесённых изменений в существующий skill/spec contract, а не новая пользовательская функция.

### Installation/Runtime

- `tools/claude-mem-bootstrap/install-claude-mem.ts` и `tools/claude-mem-bootstrap/claude-mem-state.ts` — реализуют persistent settings migration, provider precedence и atomic rewrite; сохранить без изменений. [ref:tools/claude-mem-bootstrap/install-claude-mem.ts:204-289]
- `.claude/skills/research-workflow/SKILL.md` — содержит ошибочно добавленные product triggers, €200 hard gates и procurement checklist; восстановить technical-only baseline `e0ecebb8`.
- `.claude/skills/meridian-model-call/SKILL.md` — содержит релевантный provider-contract proof gate; сохранить без изменений. [ref:.claude/skills/meridian-model-call/SKILL.md:47-64]
- `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — версия `2.0.6` доставляет migration existing users; сохранить.

### Verification

- `tests/step_definitions/feature_research_workflow_constraints.ts`, `SPECMGT001_15/16` и их PLUGIN003 mirror — существуют только для ошибочной procurement-фичи; удалить.
- `tests/step_definitions/feature_claude_mem_bootstrap.ts` и `tests/step_definitions/feature_haiku_to_deepseek.ts` — проверяют полезную migration/provider behavior; сохранить и повторно прогнать.
- `cucumber.json` получил путь `specs-management-as-skill.feature` только ради ошибочных сценариев; убрать только этот путь, сохранив `haiku-to-deepseek-migration.feature`.
- Canonical checks: Docker BDD через `bash scripts/docker-bdd.sh ...`, lint через `npm run lint`, structural spec validation отдельно от health verdict. [ref:CLAUDE.md:14-16] [ref:CLAUDE.md:78-79]

### Repository Baseline

- Branch: `feat/haiku-to-deepseek-migration`; SHA: `05c8109ba584ea5124e44bdb448632f888fe9bd5`. [cmd:`git branch --show-current`; `git rev-parse HEAD`]
- Ветка синхронизирована с `origin/feat/haiku-to-deepseek-migration` на момент планирования.
- Shared tree содержит unrelated modified `.specs/bdd-only-migration/**`, `.specs/spec-generator-v4/**`, `.claude/settings.local.json` и много untracked `audit-out/**`; staging разрешён только явными cleanup paths. [cmd:`git status --short --branch`]
- Ошибочная project memory про €200 и её строка индекса уже удалены; перед завершением требуется только absence check. Provider-contract memory остаётся.

## 👤 User Stories

- Как владелец dev-pomogator, я хочу удалить чужой procurement-контекст, чтобы plugin не содержал нерелевантную товарную политику.
- Как установленный пользователь, я хочу сохранить миграцию Haiku → DeepSeek, чтобы cleanup не вернул старую модель и не сломал мои credentials.
- Как сопровождающий, я хочу отдельный изолированный cleanup commit, чтобы его можно было проверить и откатить без потери provider-фикса.

## 🔀 Use Cases

- **UC-1 — Cleanup:** владелец удаляет из skill/spec/tests/config всё, что появилось исключительно из сообщения про товар и €200.
- **UC-2 — Existing user:** legacy claude-mem settings по-прежнему безопасно мигрируют на DeepSeek через AiPomogator или прямой OpenRouter согласно активному provider и credential precedence.
- **UC-3 — Custom/no-key:** custom model и рабочая конфигурация без совместимого credential по-прежнему сохраняются, а не перезаписываются.
- **UC-4 — Future agent:** project memory больше не навязывает закупочную политику, но сохраняет урок, что credential mismatch не доказывает model unavailability.
- **Edge case — Mixed commit:** cleanup не откатывает весь `05c8109b`, потому что тот содержит оба независимых класса изменений.
- **Edge case — Shared tree:** unrelated modified/untracked paths не редактируются и не попадают в commit.

## 📐 Requirements

### FR (Functional Requirements)

- **FR-1:** Восстановить `.claude/skills/research-workflow/SKILL.md` до technical-only research contract без product/buying triggers, €200, price/currency/availability gates, AP-9 и procurement output/checklist.
- **FR-2:** Через spec-door удалить из `specs-management-as-skill` только procurement/provider additions, включая `SPECMGT001_15/16`, не меняя baseline остальных сценариев.
- **FR-3:** Удалить contamination-only executable surfaces: `feature_research_workflow_constraints.ts`, зеркальные `SPECMGT001_15/16` в PLUGIN003 и добавленный ради них путь в `cucumber.json`.
- **FR-4:** Сохранить provider migration: claude-mem implementation/state, `CMEM001_28..33`, direct/routed DeepSeek IDs, provider precedence, version `2.0.6` и provider-contract gate в `meridian-model-call`.
- **FR-5:** Сохранить удалённой project memory `hard-product-constraints-are-eligibility-gates` и сохранить memory `provider-support-needs-consumer-contract-proof`.
- **FR-6:** После cleanup scoped search не должен находить project-introduced procurement markers или удалённые scenario/step IDs в целевых dev-pomogator surfaces.

### Acceptance Criteria (EARS)

- **AC-1:** WHEN cleanup применяется THEN `research-workflow` SHALL содержать прежние technical research triggers и SHALL NOT содержать product recommendation/€200 semantics.
- **AC-2:** WHEN `specs-management-as-skill` читается после cleanup THEN его FR/AC/Design/File Changes/feature SHALL NOT описывать procurement hard gates или provider-availability matrix, добавленные из соседнего проекта.
- **AC-3:** WHEN BDD registry и mirrors проверяются THEN `SPECMGT001_15`, `SPECMGT001_16`, `feature_research_workflow_constraints` и лишний specs-management feature path SHALL отсутствовать.
- **AC-4:** WHEN installed-user migration scenarios `CMEM001_28..33` запускаются в Docker THEN все SHALL pass после cleanup.
- **AC-5:** WHEN release/provider surfaces проверяются THEN DeepSeek direct/routed IDs, AiPomogator base URL, credential precedence and version `2.0.6` SHALL remain present.
- **AC-6:** WHEN cleanup commit готовится THEN только явно перечисленные cleanup paths SHALL быть staged, а unrelated shared-tree changes SHALL остаться нетронутыми.

### NFR (Non-Functional Requirements)

- **Safety:** запретить blanket revert `05c8109b`, `git add -A` и перезапись unrelated shared-tree state.
- **Reliability:** settings migration behavior и atomic permission-preserving update не должны измениться.
- **Traceability:** все `.specs/**` изменения проходят через spec-door; structural validator output сообщается отдельно от executable verdict.
- **Regression:** Docker BDD для provider migration, lint, production import, version consistency и scoped absence assertions должны пройти.
- **Performance:** N/A — cleanup не меняет runtime request path или latency.
- **Security:** не читать и не выводить реальные API keys; проверять только имена credential sources и поведение precedence.
- **Usability:** research skill возвращается к прежнему generic technical scope без чужих procurement-триггеров.

### Assumptions

- Baseline `e0ecebb8` является последним состоянием целевых procurement-contaminated surfaces до ошибочного сообщения; это проверяется path-scoped diff перед применением.
- Provider-specific guidance из mixed commit должна остаться только в `meridian-model-call` и executable claude-mem migration surfaces; generic `research-workflow` восстанавливается целиком к baseline.
- Удалённая procurement memory и уже очищенный индекс не требуют повторного редактирования, только проверки отсутствия.

### Risks

- Полный revert удалит installed-user migration и версию 2.0.6 — применять только explicit hunks/paths.
- Raw spec restoration может обойти anchors/form guards — использовать spec-door proposal/transaction.
- Mirror или cucumber registration может остаться сиротой — искать canonical feature, PLUGIN003, step-def и config вместе.
- Zero-scenario filtered run может быть ложно назван тестовым успехом — absence доказывать search/assertion, а regression отдельными существующими CMEM/HDS scenarios.
- Unrelated shared-tree paths могут случайно попасть в commit — stage только explicit paths и проверить cached diff.

### Out of Scope

- Изменение цен, качества или выбора DeepSeek V4 Flash.
- Новая procurement/product recommendation feature для dev-pomogator.
- Переписывание уже работающей claude-mem migration архитектуры.
- Исправление unrelated spec-generator-v4/bdd-only worktree changes.

## 🔧 Implementation Plan

1. Зафиксировать REMOVE/KEEP/MIXED inventory по path-scoped diff `e0ecebb8..05c8109b`; подтвердить, что generic research skill полностью возвращается к baseline, а `meridian-model-call` остаётся.
2. Восстановить `.claude/skills/research-workflow/SKILL.md` из проверенного baseline без добавления новой procurement-абстракции.
3. Через spec-door transaction/proposals удалить внесённые paragraph/scenario/row hunks из пяти документов `specs-management-as-skill`.
4. Удалить contamination-only step definition, два mirrored PLUGIN003 scenarios и один `cucumber.json` path.
5. Проверить отсутствие project memory и procurement markers; отдельно проверить presence provider migration constants/scenarios/version.
6. Запустить Docker BDD `CMEM001_28..33` и relevant Haiku→DeepSeek scenarios в background, затем lint/import/version/spec structural checks.
7. Stage только cleanup paths, проверить cached diff, сделать отдельный cleanup commit и push на feature branch.

### 🔎 Источники / Пруфы

- Mixed commit содержит одновременно procurement contamination и provider migration. [cmd:`git show --stat --oneline 05c8109b`]
- Technical-only `research-workflow` baseline сохранён из `e0ecebb8`. [ref:audit-out/research-workflow-e0ecebb8.md:1-300]
- Current skill содержит €200/product additions. [ref:.claude/skills/research-workflow/SKILL.md:1-60]
- Existing-user migration и atomic settings rewrite находятся в `install-claude-mem.ts`. [ref:tools/claude-mem-bootstrap/install-claude-mem.ts:204-289]
- Provider proof gate, который нужно сохранить, находится в `meridian-model-call`. [ref:.claude/skills/meridian-model-call/SKILL.md:47-64]
- Earlier executable evidence before cleanup: procurement scenarios passed only because contamination was wired; это доказательство границы удаления, не причина сохранять feature. [ref:audit-out/research-hard-gates-wired-bdd-retry.log:31-38]
- Earlier lint baseline passed at version 2.0.6. [ref:audit-out/research-hard-gates-wired-lint-final.out:2-14]

## 💥 Impact Analysis

| Keyword | Files Found | Action in Plan |
|---------|-------------|----------------|
| `€200` / `EUR 200` | research skill, specs-management docs/scenarios/tests | Remove incident-introduced hunks |
| `product/buying` / product triggers | research skill and BDD assertions | Restore technical-only skill; delete test |
| `SPECMGT001_15/16` | canonical spec feature, PLUGIN003 mirror, step-def | Delete all three surfaces |
| `feature_research_workflow_constraints` | step-def and cucumber wiring context | Delete file and registry dependency |
| `openrouter/deepseek/deepseek-v4-flash` | provider migration constants/tests | Preserve and assert presence |
| `CMEM001_28..33` | claude-mem feature/step-def | Preserve and execute in Docker |
| `hard-product-constraints-are-eligibility-gates` | project memory/index | Already removed; verify absent |

## 📋 Todos

---

### 📋 `pin-cleanup-boundary`

> Классифицировать каждый затронутый mixed-commit surface, чтобы cleanup не удалил provider migration.

- **files:** `05c8109b path-scoped diff`, `audit-out/*-e0ecebb8.*` *(inspect)*
- **changes:**
  - Зафиксировать REMOVE/KEEP/MIXED inventory.
  - Подтвердить baseline hashes/current HEAD и disjoint keep/remove lists.
- **refs:** FR-1, FR-2, FR-3, FR-4, NFR-Safety
- **leverage:** `e0ecebb8`, existing baseline artifacts
- **deps:** *none*

---

### 📋 `remove-procurement-skill-contract`

> Вернуть generic research skill к technical-only baseline, не заменяя ошибочную политику новой абстракцией.

- **files:** `.claude/skills/research-workflow/SKILL.md` *(edit)*
- **changes:**
  - Restore exact relevant baseline content from `e0ecebb8`.
  - Verify standard technical triggers, hypothesis-first flow and three-source discipline remain.
- **refs:** FR-1, FR-6, AC-1
- **leverage:** `audit-out/research-workflow-e0ecebb8.md`
- **deps:** `pin-cleanup-boundary`

---

### 📋 `restore-specs-management-contract`

> Удалить ошибочную procurement/provider семантику из существующей спеки через разрешённую дверь.

- **files:** `.specs/specs-management-as-skill/{FR.md,ACCEPTANCE_CRITERIA.md,DESIGN.md,FILE_CHANGES.md,specs-management-as-skill.feature}` *(edit via spec-door)*
- **changes:**
  - Remove added product/provider paragraphs, rows and `SPECMGT001_15/16`.
  - Preserve every unrelated baseline scenario/document section.
- **refs:** FR-2, AC-2, NFR-Traceability
- **leverage:** `audit-out/specmgt-*-e0ecebb8.*`, spec-door proposal/transaction
- **deps:** `pin-cleanup-boundary`

---

### 📋 `delete-procurement-bdd-surfaces`

> Удалить executable mirrors и registry entry, существующие только для ошибочной feature.

- **files:** `tests/step_definitions/feature_research_workflow_constraints.ts` *(delete)*; `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature` *(edit)*; `cucumber.json` *(edit)*
- **changes:**
  - Delete the contamination-only step definition.
  - Delete mirrored `SPECMGT001_15/16`.
  - Remove only the added specs-management feature path; retain Haiku→DeepSeek path.
- **refs:** FR-3, FR-6, AC-3
- **leverage:** baseline files from `e0ecebb8`
- **deps:** `restore-specs-management-contract`

---

### 📋 `verify-provider-migration-preserved`

> Доказать, что cleanup убрал чужой контекст, но не повредил установленным пользователям.

- **files:** claude-mem migration/spec/tests/version manifests *(verify only)*
- **changes:**
  - Assert procurement marker/scenario absence and provider constant/scenario presence.
  - Run Docker BDD `CMEM001_28..33` plus relevant HDS scenarios; run lint/import/version/spec checks.
  - Report structural spec validation separately from executable health.
- **refs:** FR-4, FR-5, FR-6, AC-4, AC-5, NFR-Regression
- **leverage:** `feature_claude_mem_bootstrap.ts`, `feature_haiku_to_deepseek.ts`
- **deps:** `remove-procurement-skill-contract`, `delete-procurement-bdd-surfaces`

---

### 📋 `commit-cleanup`

> Доставить cleanup отдельным commit без захвата чужих изменений рабочего дерева.

- **files:** explicit cleanup paths only *(stage/commit/push)*
- **changes:**
  - Inspect explicit working and cached diffs; never use `git add -A`.
  - Commit and push cleanup on `feat/haiku-to-deepseek-migration`.
- **refs:** FR-1..FR-6, AC-6, NFR-Safety
- **leverage:** explicit-path staging policy
- **deps:** `verify-provider-migration-preserved`

---

## ✅ Definition of Done (DoD)

- Procurement/product/€200 additions from the mistaken message are absent from the listed dev-pomogator skill, spec, tests, cucumber config and project memory.
- Provider-contract/claude-mem migration behavior, DeepSeek IDs, version 2.0.6 and `CMEM001_28..33` remain present.
- All six installed-user migration scenarios pass in Docker after cleanup.
- Lint exits 0; production migration module imports; manifest versions remain consistent.
- Spec edits went through spec-door and structural output is not mislabeled as a full health verdict.
- Only explicit cleanup paths are committed; unrelated working-tree state remains untouched.

### Verification Plan

- Automated Tests:
  - `bash scripts/docker-bdd.sh --name "CMEM001_28|CMEM001_29|CMEM001_30|CMEM001_31|CMEM001_32|CMEM001_33"`
  - `bash scripts/docker-bdd.sh --name "HDS006"`
  - `npm run lint`
  - `node --import tsx -e "await import('./tools/claude-mem-bootstrap/install-claude-mem.ts')"`
  - `npx tsx tools/specs-generator/validate-spec.ts -Path ".specs/specs-management-as-skill"`
- Manual Verification:
  - Scoped search confirms zero `€200`, `EUR 200`, product triggers, `SPECMGT001_15/16` and deleted step-def references in target surfaces.
  - Presence assertions confirm AiPomogator base URL, direct/routed DeepSeek IDs, `AUTO_COMMIT_API_KEY` plumbing and `CMEM001_33` remain.
  - Compare explicit cleanup diff against `e0ecebb8` baselines and inspect `git diff --cached --name-only` before commit.
  - Treat a zero-scenario filter only as expected absence, never as passing coverage.

## 📁 File Changes

| Path | Action | Reason |
|---|---|---|
| `.claude/skills/research-workflow/SKILL.md` | `edit` | Restore technical-only baseline; remove product triggers, €200 hard gates, AP-9 and procurement checklist |
| `.specs/specs-management-as-skill/FR.md` | `edit` | Via spec-door, remove added product/provider paragraph |
| `.specs/specs-management-as-skill/ACCEPTANCE_CRITERIA.md` | `edit` | Via spec-door, remove three incident-added WHEN clauses |
| `.specs/specs-management-as-skill/DESIGN.md` | `edit` | Via spec-door, remove hard-gate pipeline paragraph |
| `.specs/specs-management-as-skill/FILE_CHANGES.md` | `edit` | Via spec-door, restore original research skill row and remove contamination step-def row |
| `.specs/specs-management-as-skill/specs-management-as-skill.feature` | `edit` | Via spec-door, delete `SPECMGT001_15/16` |
| `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature` | `edit` | Delete mirrored `SPECMGT001_15/16` |
| `tests/step_definitions/feature_research_workflow_constraints.ts` | `delete` | File exists only to assert the wrong-project policy |
| `cucumber.json` | `edit` | Remove only the specs-management feature path added for deleted scenarios |
