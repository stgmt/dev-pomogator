# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Scope: PoC — FR-1 через FR-6, без hook автоматизации.

## Phase 0: BDD Foundation (Red)

### 📋 `bdd-feature`
> Создать .feature файл с BDD сценариями для skill

- **files:** `tests/features/plugins/test-quality/PLUGIN016_tests-create-update.feature` *(create)*
- **changes:**
  - Скопировать из `.specs/tests-create-update/tests-create-update.feature`
  - Добавить сценарии PLUGIN016_10 (bugfix mode) и PLUGIN016_11 (no-args prompt) для полного покрытия UC-3 и AC-1
- **refs:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
- **deps:** *none*

---

### 📋 `bdd-stubs`
> Создать заглушки тестов matching все Scenarios

- **files:** `tests/e2e/tests-create-update.test.ts` *(create)*
- **changes:**
  - Import из helpers.ts (runInstaller, appPath, homePath)
  - describe `PLUGIN016: Tests Create Update Skill`
  - it блоки PLUGIN016_01 через PLUGIN016_11, все throwing `new Error('not implemented')`
- **refs:** FR-4, FR-5
- **deps:** `bdd-feature`

---

## Phase 1: SKILL.md (@feature1 @feature2 @feature3 @feature4)

### 📋 `skill-md`
> Создать SKILL.md с frontmatter и 6-step workflow

- **files:** `.claude/skills/tests-create-update/SKILL.md` *(create)*
- **changes:**
  - Frontmatter: name, description с trigger phrases (create/update/bugfix test), argument-hint `[create|update|bugfix] [target]`, allowed-tools
  - Step 0: Parse `$ARGUMENTS` → decision table (create/update/bugfix/ask)
  - Step 1: Glob `tests/features/**/*.feature` + Grep `Feature: DOMAIN` → extract codes → propose next free
  - Step 2: Glob existing .feature by domain → Read → reuse Scenarios; если нет → Bash analyze-features.ts → Write new .feature
  - Step 3: Grep helpers.ts → list available exports → build import candidates
  - Step 4: Write .test.ts с правильным naming (DOMAIN_CODE_NN), imports, @featureN, integration assertions
  - Step 5: Read created test → check 8 rules → output PASS/FAIL table. Step 5 is AI-internal analysis — no additional tools beyond Read/Grep for verification
  - Target: 1,500-2,000 words (verify: `wc -w SKILL.md`)
  - Style: imperative ("Scan for domain codes"), not "You should..."
- **refs:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
- **deps:** *none*

---

## Phase 2: Extension manifest (@feature1)

### 📋 `manifest-update`
> Добавить skill в extension.json

- **files:** `extensions/test-quality/extension.json` *(edit)*
- **changes:**
  - В `skills` добавить: `"tests-create-update": ".claude/skills/tests-create-update"` (рядом с existing `dedup-tests`)
  - В `skillFiles` добавить: `"tests-create-update": [".claude/skills/tests-create-update/SKILL.md"]`
- **refs:** FR-1
- **deps:** `skill-md`

---

## Phase 3: Tests (@feature5 @feature6)

### 📋 `tests-impl`
> Реализовать тесты — проверка SKILL.md structure, manifest, compliance

- **files:** `tests/e2e/tests-create-update.test.ts` *(edit)*
- **changes:**
  - PLUGIN016_01-04: проверить что SKILL.md exists, parseable frontmatter, содержит decision table, domain scan step
  - PLUGIN016_05-06: проверить что SKILL.md содержит helpers.ts grep step и naming convention
  - PLUGIN016_07-08: проверить что SKILL.md содержит compliance check step с PASS/FAIL table
  - PLUGIN016_09: проверить что helpers.ts audit step упоминает grep
  - PLUGIN016_10-11: проверить bugfix mode и no-args case в SKILL.md
  - Все тесты integration: Read реальный SKILL.md, не mock
- **refs:** FR-5, FR-6
- **deps:** `skill-md`, `manifest-update`

---

## Phase 4: Refactor

### 📋 `refactor`
> Финальная проверка качества

- **files:** `.claude/skills/tests-create-update/SKILL.md` *(edit)*
- **changes:**
  - `/simplify` на SKILL.md
  - Verify `wc -w` между 1500-2000
  - Verify все тесты GREEN
- **refs:** NFR-Performance
- **deps:** `tests-impl`
