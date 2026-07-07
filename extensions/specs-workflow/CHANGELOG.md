# Changelog

All notable changes to the `specs-workflow` extension are documented here.

## [1.17.0] - 2026-04-23

### Added

- **spec-generator-v3 feature** (`.specs/spec-generator-v3/`) — 7 artifacts imported from github.com/github/spec-kit + custom preset: Done When per task, Task Summary Table, Status/Est fields, CHK traceability matrix (`CHK-FR{n}-{nn}`), Independent Test + Priority + Why inline in User Story blocks, Risk Assessment table, Key Decisions with Alternatives considered.
- **3 private child skills** (anti-pushy descriptions, invoked only via `Skill(...)` from parent create-spec):
  - `discovery-forms` — populates USER_STORIES.md v3-form blocks + appends RESEARCH.md `## Risk Assessment` (Phase 1).
  - `requirements-chk-matrix` — builds CHK matrix in REQUIREMENTS.md + populates DESIGN.md `## Key Decisions` (Phase 2).
  - `task-board-forms` — enriches TASKS.md with Done When/Status/Est + regenerates Task Summary Table (Phase 3).
- **6 blocking PreToolUse hooks** (exit 2 on violation, audit log on every event):
  - `user-story-form-guard.ts` — enforces Priority + Why + Independent Test + Acceptance Scenarios per User Story.
  - `task-form-guard.ts` — enforces `**Done When:**` + ≥1 checkbox + Status + Est per task (Phase -1 relaxed).
  - `design-decision-guard.ts` — enforces Rationale + Trade-off + Alternatives (≥2 bullets) per `### Decision:`.
  - `requirements-chk-guard.ts` — enforces CHK ID format, Traces To linkage, allowed Verification Method + Status.
  - `risk-assessment-guard.ts` — enforces ≥2 valid rows when `## Risk Assessment` heading present.
  - `extension-json-meta-guard.ts` — **meta-guard**: blocks removal of form-guards from `extension.json`/`settings.local.json`. No env var bypass; human-in-the-loop only.
- **`audit-logger.ts`** — append-only writer for `~/.dev-pomogator/logs/form-guards.log`. Events: DENY / ALLOW_VALID / ALLOW_AFTER_MIGRATION / PARSER_CRASH. 30-day retention + 10MB cap rotation.
- **`validate-specs.ts` UserPromptSubmit summary** — `📊 Form guards (24h): N DENY, M PARSER_CRASH, K ALLOW_AFTER_MIGRATION` shown at the start of each prompt so bypass attempts are visible to the user.
- **`spec-status.ts -Format task-table`** — new format renders Task Summary Table from TASKS.md blocks (idempotent; used by task-board-forms skill).
- **`spec-form-parsers.ts`** — shared regex parsers (parseUserStoryBlocks, parseTaskBlocks, parseDecisionBlocks, parseChkRows, parseRiskRows) + extractSpecInfo helpers.
- **`phase-constants.ts` v3 helpers**: `getProgressVersion()`, `isV3Spec()`, `PROGRESS_SCHEMA_VERSION` constant.

### Changed

- **`.progress.json` schema v3**: `version: 3` stamped by `scaffold-spec.ts` for new specs. Migration guard (`isV3Spec`) — form-guards activate ONLY when `version >= 3`. Existing v1/v2 specs pass unblocked (`ALLOW_AFTER_MIGRATION` audit log entry).
- **Templates** — v3 form fields baked in:
  - `USER_STORIES.md.template`: Priority heading + Why + Independent Test + Acceptance Scenarios block.
  - `TASKS.md.template`: `## Task Summary Table` auto-generated section + Done When/Status/Est on example tasks.
  - `REQUIREMENTS.md.template`: `## Verification Matrix (CHK)` + Verification Process + Summary Counts sections.
  - `DESIGN.md.template`: `## Key Decisions` section with example Rationale/Trade-off/Alternatives block.
  - `RESEARCH.md.template`: `## Risk Assessment` table with 2 placeholder rows.
- **`extension.json`**: hooks.PreToolUse switched from object to array-of-groups format per `installer-hook-formats.md`. All 7 PreToolUse hooks (phase-gate + 6 form-guards) wired.

### Security / hallucination-proofing

- **No env var bypass.** `SPEC_FORM_GUARDS_DISABLE` does not exist. Agents cannot disable form-guards from stdin/config.
- **Meta-guard protects the manifest itself.** Attempts to remove form-guards from `extension.json` or `settings.local.json` → exit 2 with human-review message.
- **Audit log surfaces bypass attempts.** Every DENY/PARSER_CRASH event lands in `~/.dev-pomogator/logs/form-guards.log`; UserPromptSubmit summary shows counts to the user on every prompt.
- **Fail-open on parser exceptions.** Regex bugs never block Write/Edit — PARSER_CRASH event logged, hook exits 0.

## [1.15.0] - 2026-04-21

### Added

- **BDD Enforcement — везде BDD default.** Phase 2 Step 6 теперь классифицирует фичу по двум осям: TEST_DATA (существующая) + TEST_FORMAT (новая; BDD default, UNIT escape hatch с Risks justification) + Framework + Install Command + Evidence. (FR-1, FR-7)
- **Non-skippable Phase 2 Step 6.** State machine `commandConfirmStop(Requirements)` pre-check DESIGN.md — exit code 1 + actionable blocker без BDD Test Infrastructure Classification. (FR-5)
- **`bdd-framework-detector.ts` shared module** — детектит BDD framework в target test-projects (6 пар: C#/Reqnroll|SpecFlow, TS/Cucumber.js|Playwright BDD, Python/Behave|pytest-bdd) + возвращает installCommand + hookFileHints + configFileHint + fixturesFolderHint + evidence + suggestedFrameworks. Переиспользует логику `steps-validator/detector.ts`. (FR-8)
- **Phase 1.5 Project Context Analysis** — новый шаг 4a: детект framework в target test-projects из FILE_CHANGES, запись DetectionResult в RESEARCH.md `### Existing Patterns & Extensions`. (FR-2)
- **`scaffold-spec.ts -TestFormat [bdd|unit|auto]`** — новый флаг (default `auto`). `unit` создаёт `SCENARIOS.md` (doc-only) вместо `.feature`. (FR-4)
- **TASKS.md Phase 0 bootstrap block** — conditional: если Framework отсутствует в target, generator ставит 3 task в строгой последовательности (install-bdd-framework → bootstrap-bdd-hooks → bootstrap-bdd-fixtures-config), все implementation tasks зависят от последней. (FR-6)
- **`.claude/rules/specs-workflow/bdd-enforcement.md`** — новое правило: BDD default principle, framework decision tree (language→framework matrix), install + bootstrap recipes per framework, escape hatch semantics. (FR-6)
- **`analyze-features.ts` multi-folder recursive scan** — сканит `**/*.feature` от repoRoot с ignore `node_modules`/`dist`/`build`/`bin`/`obj`/`.git`/`.dev-pomogator`. Cap 10000 files. Находит BDD в non-default layouts (`Cloud/server/*/Features/`, `src/apps/Tests/Features/` и т.д.). (FR-3)
- **Validator `BDD_INFRA_CLASSIFICATION_COMPLETE` rule** — severity ERROR (было WARNING). Проверяет TEST_DATA + TEST_FORMAT поля; если TEST_FORMAT=BDD → требует Framework + Install Command + Evidence; если TEST_FORMAT=UNIT → требует Risks ≥30 символов. (FR-7)

### Changed

- **`.progress.json` schema v2**: `phases.Requirements` получил новые поля `bddInfraClassificationComplete: false` и `bddFrameworkSelected: null`. Graceful fallback для старых `.progress.json` файлов через `ensureProgressStateSchema()`.
- **DESIGN.md template**: `## BDD Test Infrastructure` секция переписана — вместо единственного `**Classification:**` поля теперь 6 полей (TEST_DATA, TEST_FORMAT, Framework, Install Command, Evidence, Verdict) + Step 6.1a/b/c guidance.
- **TASKS.md template**: Phase 0 получил conditional bootstrap block (3 обязательных task когда Framework missing) с `depends:` chain.
- **`.claude/rules/specs-workflow/specs-management.md`**: Phase 1.5 Шаг 4a (BDD detect), Phase 2 Step 6.1 разделён на 6.1a (TEST_DATA) + 6.1b (TEST_FORMAT) + 6.1c (Framework).

### Fixed

- **analyze-features.ts больше не пропускает BDD в нестандартных папках** (регрессия из MS-18177: Reqnroll в `Cloud/server/Cleverence.Server.Tests/Features/` был невидим для инструмента).
- **Validator BDD_INFRA severity — теперь ERROR** (ранее WARNING не блокировал validate-spec exit code).

## [1.14.0] — предыдущая версия

См. commit history.
