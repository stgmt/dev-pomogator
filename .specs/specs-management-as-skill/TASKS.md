# Tasks

## TDD Workflow

> TDD-порядок: Phase 0 (Red — тесты падают) → Phase 1-7 (Green — миграция, тесты зелёные) → Phase 8 (Refactor).

## Phase -1: Infrastructure Prerequisites

N/A — рефактор не требует новых сервисов / БД / docker / .env / secrets. Только filesystem changes.

---

## Phase 0: BDD Foundation (Red)

> Создать `.feature` сценарии и integration test ДО реализации. Тесты должны FAIL до выполнения миграции.
>
> TEST_DATA_ACTIVE — фикстуры из FIXTURES.md создаются в test beforeEach inline. Новые hooks НЕ требуются (используем существующие helpers).

### 📋 `extend-plugin003-feature`

> Добавить SPECMGT001_* сценарии в существующий PLUGIN003_specs-workflow.feature; добавить scenarios для hard-cutover (FR-4), research-workflow registration (FR-5), token efficiency (FR-13), user-overrides backup (FR-4 + updater-managed-cleanup).

- **files:** `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature` *(edit)*
- **changes:**
  - Добавить 14 новых сценариев с тегами `# @feature1` через `# @feature5`, copy-paste из `.specs/specs-management-as-skill/specs-management-as-skill.feature`
  - Использовать существующий Background `Given dev-pomogator is installed / And specs-workflow extension is enabled`
  - НЕ трогать stale Cursor scenarios на lines 22-25 (FR-12 OUT OF SCOPE)
- **refs:** [FR-4](FR.md#fr-4-hard-cutover-migration-via-installer-feature4), [FR-5](FR.md#fr-5-research-workflow-extracted-as-standalone-skill-and-invoked-by-create-spec-feature5), [FR-13](FR.md#fr-13-token-efficiency-floor-for-non-spec-sessions-feature1)
- **deps:** *none*
- **_features:_** @feature1, @feature4, @feature5

---

### 📋 `create-integration-test`

> Создать ~~`tests/e2e/specs-management-skill-migration.test.ts`~~ → skill `.claude/skills/create-spec/` + `tests/e2e/create-specs-bdd-enforcement.test.ts` — integration test driving FR-4/FR-6/FR-7/FR-11 verification через `runInstaller(updateMode=true)` + filesystem assertions.

- **files:** ~~`tests/e2e/specs-management-skill-migration.test.ts`~~ → skill `.claude/skills/create-spec/` + `tests/e2e/create-specs-bdd-enforcement.test.ts` *(create)*
- **changes:**
  - Импортировать `runInstaller`, `appPath`, `homePath`, `setupCleanState` из `tests/e2e/helpers.ts`
  - Реализовать SPECMGT001_06 (hard cutover removes 4 rules), SPECMGT001_07 (manifest empty), SPECMGT001_08 (CLAUDE.md cleaned), SPECMGT001_09 (hook produces identical findings — diff fixture sample-spec before/after), SPECMGT001_14 (user-overrides backup)
  - Использовать F-1, F-2, F-3 фикстуры из FIXTURES.md
- **refs:** [FR-4](FR.md#fr-4-hard-cutover-migration-via-installer-feature4), [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4), [FR-7](FR.md#fr-7-extensionjson-manifest-updated-atomically-feature4), [FR-11](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4)
- **deps:** `extend-plugin003-feature`
- **_features:_** @feature4

---

### 📋 `create-sample-spec-fixture`

> Создать static фикстуру F-2 — sample spec folder с валидными @featureN тегами для SPECMGT001_09 hook validation теста.

- **files:** `tests/fixtures/specs-management-as-skill/sample-spec/USER_STORIES.md`, `tests/fixtures/specs-management-as-skill/sample-spec/FR.md`, `tests/fixtures/specs-management-as-skill/sample-spec/ACCEPTANCE_CRITERIA.md`, `tests/fixtures/specs-management-as-skill/sample-spec/sample-feature.feature` *(create)*
- **changes:**
  - Скопировать из существующей реальной спеки (например, `.specs/scope-gate/`) минимальный валидный набор файлов
  - Заменить content на 1 FR + 1 AC + 1 BDD scenario с @feature1 тегом
- **refs:** [FR-11](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4)
- **deps:** *none*
- **_features:_** @feature4

---

### 📋 `verify-red-state`

> Запустить новые тесты — должны FAIL (skill не существует, manifest не обновлён, файлы не удалены).

- **files:** N/A
- **changes:**
  - Run `npm test -- specs-management-skill-migration` (or via `/run-tests`)
  - Подтвердить: SPECMGT001_06..14 fail с ожидаемыми ошибками (file not found / unexpected file present)
- **refs:** все @feature1..@feature5
- **deps:** `extend-plugin003-feature`, `create-integration-test`, `create-sample-spec-fixture`
- **_features:_** все

---

## Phase 1: SKILL.md scaffold (Green)

### 📋 `write-create-spec-skill-md`

> Переписать `.claude/skills/create-spec/SKILL.md` (был 66-line scaffold-only) — overview ≤200 строк + navigation table + frontmatter с description ≤1024 chars + allowed-tools.

- **files:** `.claude/skills/create-spec/SKILL.md` *(edit — full replacement)*
- **changes:**
  - Frontmatter: `name: create-spec`, `description` ≤1024 chars с trigger phrases (создай/сделай/набросай/напиши/опиши + create/make/draft/write/sketch/outline + обнови/покажи + update/show + negative scope "NOT for plan-pomogator")
  - `allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, WebFetch, WebSearch`
  - Body: overview (1 параграф), Trigger явно, navigation table (Phase | Reference | One-liner), Step 1 (scaffold), Step 2 (delegate to Phase reference), Skill composition (когда вызывать `Skill("research-workflow")`, `Skill("discovery-forms")`, etc.)
  - Body length ≤200 строк
- **refs:** [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1), [FR-9](FR.md#fr-9-skill-description-preserves-all-trigger-phrases-feature5), [FR-10](FR.md#fr-10-allowed-tools-covers-full-workflow-feature5)
- **deps:** `verify-red-state`
- **_features:_** @feature1, @feature5

---

## Phase 2: Phase reference files (Green)

### 📋 `migrate-phase1-discovery`

> Перенести Phase 1 алгоритм + Step 0 Jira-mode reference + Skill("research-workflow") invocation point из старого `specs-management.md` в новый файл.

- **files:** `.claude/skills/create-spec/references/phase1_discovery.md` *(create)*
- **changes:**
  - Скопировать секцию `### PHASE 1: Discovery` (lines 144-167 of old specs-management.md) — алгоритм 6 шагов
  - Step 5 (RESEARCH.md) ОБЯЗАН явно содержать `Skill("research-workflow")` invocation point — текстом "После сбора целей и ролей вызвать `Skill("research-workflow")` если требуется ресерч технических находок"
  - Step 0 Jira → ссылка на `jira-mode.md` (не дублировать)
  - Step 3 (USER_STORIES) → reference на existing `discovery-forms` skill
  - TOC если файл >100 строк
- **refs:** [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1), [FR-2](FR.md#fr-2-reference-file-naming-convention-phasenmdescriptive-feature2), [FR-5](FR.md#fr-5-research-workflow-extracted-as-standalone-skill-and-invoked-by-create-spec-feature5)
- **deps:** `write-create-spec-skill-md`
- **_features:_** @feature1, @feature2, @feature5

---

### 📋 `migrate-phase1.5-context`

> Перенести Phase 1.5 Project Context Analysis алгоритм.

- **files:** `.claude/skills/create-spec/references/phase1.5_project-context.md` *(create)*
- **changes:**
  - Скопировать секцию `### PHASE 1.5: Project Context Analysis` (lines 169-224)
  - Step 4a BDD framework detector — ссылка на `phase2_bdd-test-infrastructure.md` (не дублировать всю BDD логику тут)
  - Skip conditions: фича greenfield / <2 правил / тривиальная / явный skip
- **refs:** [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1)
- **deps:** `write-create-spec-skill-md`
- **_features:_** @feature1, @feature2

---

### 📋 `migrate-phase2-requirements`

> Phase 2 алгоритм без BDD subsection (вынесена в отдельный файл).

- **files:** `.claude/skills/create-spec/references/phase2_requirements-and-design.md` *(create)*
- **changes:**
  - Скопировать `### PHASE 2: Requirements + Design` (lines 227-389), но БЕЗ Step 6 BDD Test Infrastructure (он в отдельном файле)
  - Step 4b → reference на `requirements-chk-matrix` skill
  - Step 6 → "См. [phase2_bdd-test-infrastructure.md](phase2_bdd-test-infrastructure.md)"
  - TOC сверху
- **refs:** [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1)
- **deps:** `write-create-spec-skill-md`
- **_features:_** @feature1

---

### 📋 `migrate-phase2-bdd-infra`

> Перенести BDD Test Infrastructure Step 6.1-6.5 как отдельный reference (~95 строк).

- **files:** `.claude/skills/create-spec/references/phase2_bdd-test-infrastructure.md` *(create)*
- **changes:**
  - Скопировать Step 6.1a (TEST_DATA Classification 4 вопроса) + Step 6.1b (TEST_FORMAT) + Step 6.1c (Framework Choice) + Step 6.2 (existing hooks scan) + Step 6.3 (new hooks design) + Step 6.4 (validation self-check) + Step 6.5 (FIXTURES.md)
  - Reference на bdd-enforcement.md для default policy
- **refs:** [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1)
- **deps:** `write-create-spec-skill-md`
- **_features:_** @feature1, @feature2

---

### 📋 `migrate-phase3-finalization`

> Phase 3 алгоритм (TASKS.md TDD-порядок + README + CHANGELOG).

- **files:** `.claude/skills/create-spec/references/phase3_finalization.md` *(create)*
- **changes:**
  - Скопировать `### PHASE 3: Finalization` (lines 444-495)
  - Step 1b → reference на `task-board-forms` skill
  - Phase 0 hooks enforcement правило (TEST_DATA_ACTIVE → Phase 0 ОБЯЗАН содержать hook tasks)
- **refs:** [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1)
- **deps:** `write-create-spec-skill-md`
- **_features:_** @feature1

---

## Phase 3: Audit references (Green)

### 📋 `write-audit-overview`

> Audit workflow overview + category dispatch table + remediation cycle.

- **files:** `.claude/skills/create-spec/references/phase3plus_audit-overview.md` *(create)*
- **changes:**
  - Step 1 (auto checks via audit-spec.ts), Step 2 dispatch table (link to 7 category siblings), Step 3 remediation, Step 4 re-audit loop, Step 5 AUDIT_REPORT.md gen, Step 6 final /simplify
  - Category dispatch table: 7 rows linking to siblings — phase3plus_audit-errors.md, phase3plus_audit-logic-gaps.md, phase3plus_audit-inconsistency.md, phase3plus_audit-rudiments.md, phase3plus_audit-fantasies.md, phase3plus_audit-undefined-behavior.md, phase3plus_audit-jira-drift.md
- **refs:** [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3)
- **deps:** `write-create-spec-skill-md`
- **_features:_** @feature3

---

### 📋 `write-audit-category-files`

> 7 per-category audit files. Каждый: краткое описание категории + 3-5 проверок + что делать при findings.

- **files:** 7 audit category files in `.claude/skills/create-spec/references/` — `phase3plus_audit-errors.md`, `phase3plus_audit-logic-gaps.md`, `phase3plus_audit-inconsistency.md`, `phase3plus_audit-rudiments.md`, `phase3plus_audit-fantasies.md`, `phase3plus_audit-undefined-behavior.md`, `phase3plus_audit-jira-drift.md` *(create — 7 files)*
- **changes:**
  - Each file: H1 title + Description + Checks (numbered list from old specs-management.md Step 2 categories) + Remediation guidance
  - `phase3plus_audit-undefined-behavior.md`: ИНЛАЙН содержимое старого `undefined-behavior-taxonomy.md` (170 строк) — TOC сверху, 9 категорий + BVA values + 12 combined failures
- **refs:** [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3), [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4) (taxonomy inlined)
- **deps:** `write-audit-overview`
- **_features:_** @feature3

---

## Phase 4: Non-phase references (Green)

### 📋 `write-non-phase-references`

> Топик-bound references: feature creation rules, jira-mode, validation rules.

- **files:** `.claude/skills/create-spec/references/feature-creation-rules.md`, `.../jira-mode.md`, `.../validation-rules.md` *(create — 3 files)*
- **changes:**
  - `feature-creation-rules.md`: Скопировать `## Правила создания .feature` секцию (lines 393-441) — сначала искать существующие .feature, Background hook-фикстура, Data Table правила
  - `jira-mode.md`: Консолидировать ВСЕ Jira Step 0 параграфы из Phases 1, 1.5, 2, 3, 3+ (повторяются в исходнике) + format Jira trace в FR/AC/BDD/TASKS
  - `validation-rules.md`: Скопировать таблицу Правила валидации (lines 626-658)
- **refs:** [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1)
- **deps:** `write-create-spec-skill-md`
- **_features:_** @feature1

---

### 📋 `move-3-managed-rules-to-references`

> Переместить 3 unmanaged-but-existing rules в `references/` (физический mv content):
> - bdd-enforcement.md (57 lines)
> - no-mocks-fallbacks.md (25 lines)
> - specs-validation.md (68 lines)

- **files:** `.claude/skills/create-spec/references/bdd-enforcement.md`, `.../no-mocks-fallbacks.md`, `.../specs-validation.md` *(create — 3 files)*
- **changes:**
  - Скопировать содержимое 1:1 из 3 source файлов: `.claude/rules/specs-workflow/bdd-enforcement.md`, `.claude/rules/specs-workflow/no-mocks-fallbacks.md`, `.claude/rules/specs-workflow/specs-validation.md`
  - Удалить любые ссылки на пути `.claude/rules/specs-workflow/` внутри этих файлов (заменить на относительные)
- **refs:** [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4)
- **deps:** `write-create-spec-skill-md`
- **_features:_** @feature4

---

## Phase 5: research-workflow standalone skill (Green)

### 📋 `create-research-workflow-skill`

> Новый стандалоне skill `.claude/skills/research-workflow/SKILL.md` с trigger phrases для "исследуй/найди/погугли/ресерч".

- **files:** `.claude/skills/research-workflow/SKILL.md` *(create)*
- **changes:**
  - Frontmatter: `name: research-workflow`, `description` ≤1024 chars с trigger phrases ("исследуй / найди / погугли / ресерч / research / find / google"), `allowed-tools: Read, Glob, Grep, WebFetch, WebSearch`
  - Body: 4 фазы из старого research-workflow.md (Уточнение / Исследование / Верификация / Отчёт), весь контент
  - Note внизу: "Этот skill также вызывается create-spec во время Phase 1 step 5 через Skill('research-workflow')"
- **refs:** [FR-5](FR.md#fr-5-research-workflow-extracted-as-standalone-skill-and-invoked-by-create-spec-feature5), [FR-9](FR.md#fr-9-skill-description-preserves-all-trigger-phrases-feature5), [FR-10](FR.md#fr-10-allowed-tools-covers-full-workflow-feature5)
- **deps:** *none*
- **_features:_** @feature5

---

## Phase 6: Manifest + glossary + cleanup (Green)

### 📋 `update-extension-json`

> Атомарный Write extensions/specs-workflow/extension.json с полным новым layout.

- **files:** `extensions/specs-workflow/extension.json` *(edit — atomic Write)*
- **changes:**
  - `ruleFiles.claude` → `[]` (пустой массив)
  - `skills` → добавить ключ `"research-workflow": ".claude/skills/research-workflow"`; `"create-spec"` уже есть, оставить
  - `skillFiles["create-spec"]` → массив с SKILL.md + 19 references (полный список путей)
  - `skillFiles["research-workflow"]` → `[".claude/skills/research-workflow/SKILL.md"]`
  - `version` → bump (current 1.17.0 → 1.18.0)
  - Запустить `npx tsx .dev-pomogator/tools/specs-validator/extension-json-meta-guard.ts` — должен PASS
- **refs:** [FR-7](FR.md#fr-7-extensionjson-manifest-updated-atomically-feature4)
- **deps:** `migrate-phase1-discovery`, `migrate-phase1.5-context`, `migrate-phase2-requirements`, `migrate-phase2-bdd-infra`, `migrate-phase3-finalization`, `write-audit-overview`, `write-audit-category-files`, `write-non-phase-references`, `move-3-managed-rules-to-references`, `create-research-workflow-skill`
- **_features:_** @feature4

---

### 📋 `update-claude-md-glossary`

> Удалить 4 строки из CLAUDE.md "Triggered" таблицы.

- **files:** `CLAUDE.md` *(edit)*
- **changes:**
  - Найти и удалить строки таблицы Triggered содержащие пути `.claude/rules/specs-workflow/specs-management.md`, `no-mocks-fallbacks.md`, `research-workflow.md`, `specs-validation.md`
  - Не добавлять новых строк (skills не индексируются в CLAUDE.md per claude-md-glossary rule)
- **refs:** [FR-8](FR.md#fr-8-claudemd-glossary-synced-with-new-skill-layout-feature4)
- **deps:** `update-extension-json`
- **_features:_** @feature4

---

### 📋 `delete-source-rules`

> Физическое удаление 6 source файлов через `git rm`.

- **files:** `.claude/rules/specs-workflow/specs-management.md`, `.claude/rules/specs-workflow/no-mocks-fallbacks.md`, `.claude/rules/specs-workflow/research-workflow.md`, `.claude/rules/specs-workflow/specs-validation.md`, `.claude/rules/specs-workflow/bdd-enforcement.md`, `.claude/rules/specs-workflow/undefined-behavior-taxonomy.md` *(delete — 6 files)*
- **changes:**
  - `git rm` каждый файл
  - Verify: `ls .claude/rules/specs-workflow/` — пусто или только non-managed файлов нет
- **refs:** [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4)
- **deps:** `update-extension-json`, `update-claude-md-glossary`, `migrate-phase1-discovery` (контент сохранён до удаления)
- **_features:_** @feature4

---

## Phase 7: Verify Green

### 📋 `run-spec-validation`

> Validate this very spec, then validate the migration result.

- **files:** N/A (validation runs)
- **changes:**
  - `npx tsx .dev-pomogator/tools/specs-generator/validate-spec.ts -Path .specs/specs-management-as-skill` — 0 errors
  - Verify все referenced пути в FILE_CHANGES.md существуют
- **refs:** все
- **deps:** `delete-source-rules`
- **_features:_** все

---

### 📋 `run-integration-tests`

> Run integration tests — should now PASS (Green).

- **files:** N/A
- **changes:**
  - `/run-tests` или `npm test -- specs-management-skill-migration`
  - Все SPECMGT001_01..14 → GREEN
  - Hook smoke tests (CORE020) → PASS
- **refs:** все @feature1..@feature5
- **deps:** `delete-source-rules`
- **_features:_** все

---

### 📋 `verify-token-budget`

> Measure actual token cost on cold session start (FR-13 / NFR-P3 / NFR-P4 / NFR-P5).

- **files:** N/A
- **changes:**
  - Run dev-pomogator update on test project
  - Open new Claude Code session — measure system prompt tokens for skill metadata
  - Assert ≤500 tokens for combined create-spec + research-workflow + 3 child skills metadata
  - Активная Phase 2 session → ≤4000 tokens
- **refs:** [FR-13](FR.md#fr-13-token-efficiency-floor-for-non-spec-sessions-feature1)
- **deps:** `run-integration-tests`
- **_features:_** @feature1

---

## Phase 8: Refactor & Polish

### 📋 `final-cleanup`

> Финальный refactor пройти после всех зелёных тестов.

- **files:** any of `.claude/skills/create-spec/SKILL.md` or `.claude/skills/create-spec/references/*.md` per findings from Phase 7 verification *(edit)*
- **changes:**
  - Если в SKILL.md или references обнаружены повторы → выделить в shared file
  - Verify все `references/*.md` файлы >100 строк имеют TOC (NFR-P2)
  - Run `/simplify` ОДИН раз для финального review (per simplify-once-at-end memory)
- **refs:** все NFRs
- **deps:** `verify-token-budget`
- **_features:_** все

---

## Verify (cross-phase)

- [ ] Все @feature1..@feature5 сценарии переходят из Red в Green после Phase 7
- [ ] `extension-json-meta-guard` PASS на post-migration manifest
- [ ] `specs-validator` UserPromptSubmit hook PASS на sample spec до и после migration (identical findings)
- [ ] `wc -l .claude/skills/create-spec/SKILL.md` ≤ 200
- [ ] Token budget ≤500 на cold session, ≤4000 в Phase 2, ≤5500 в Phase 3+ Audit
