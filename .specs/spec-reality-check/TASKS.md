# Tasks

## TDD Workflow

Задачи организованы по TDD: Red → Green → Refactor. Phase 0 — BDD fixtures + test stubs (Red); Phase 1-4 — implementation (Green); Phase 5 — apply + cleanup. BDD framework: vitest (already installed per DESIGN.md "BDD Test Infrastructure"; не Cucumber — repo использует vitest для всех e2e per `extension-test-quality` rule).

## Phase 0: BDD Foundation (Red)

(BDD foundation already in place, verified in DESIGN.md "## BDD Test Infrastructure" > Evidence: `package.json:devDependencies.vitest` + `tests/e2e/mcp-config.test.ts` host-safe pattern.)

- [ ] Создать 5 fixture spec директорий в `tests/fixtures/spec-reality-check/` -- @feature10 — Status: TODO | Est: 30m
  _Source: DESIGN.md "## BDD Test Infrastructure" > Test Data & Fixtures_
  _Requirements: [FR-10](FR.md#fr-10-test-coverage-feature10)_
  **Done When:**
  - [ ] Создан `stale-create/` с FR.md + FILE_CHANGES.md row action=create на путь существующий относительно tmpdir
  - [ ] Создан `missing-edit/` с action=edit на отсутствующий путь
  - [ ] Создан `narrative-drift/` с inline backtick path в FR.md на missing file
  - [ ] Создан `code-drift/` plus tmp git init helper в beforeEach
  - [ ] Создан `task-orphan/` с TASKS.md `**files:**` block с путём не в FILE_CHANGES

- [ ] Создать `tests/e2e/spec-reality-check.test.ts` с test stubs SRC001_01..10 (all RED) -- @feature10 — Status: TODO | Est: 45m
  _Requirements: [FR-10](FR.md#fr-10-test-coverage-feature10)_
  _Reuse: tests/e2e/mcp-config.test.ts (host-safe tmpdir pattern)_
  **Done When:**
  - [ ] 10 it() блоков с `expect.fail('PendingStep')`
  - [ ] beforeEach mkdtempSync + afterEach rmSync per `mcp-config.test.ts` pattern
  - [ ] `npx vitest run tests/e2e/spec-reality-check.test.ts` показывает 10 RED

- [ ] Создать `tests/e2e/spec-reality-check-hook.test.ts` с test stubs SRCHOOK001_01..03 (all RED) -- @feature10 — Status: TODO | Est: 30m
  _Requirements: [FR-10](FR.md#fr-10-test-coverage-feature10)_
  **Done When:**
  - [ ] 3 it() блока с PendingStepException pattern
  - [ ] vitest output показывает 3 RED

## Phase 1: verify.ts MVP (Green @feature2,3,6,14)

Реализовать verify.ts shell + 3 FC checks + 3 output formats + narrative path check.

- [ ] Реализовать `verify.ts` shell: AuditFinding import, FILE_CHANGES parser с graceful fallback, CLI args -- @feature1 @feature2 @feature14 — Status: TODO | Est: 60m
  _Requirements: [FR-1](FR.md#fr-1-skill-bundle-layout-feature1), [FR-2](FR.md#fr-2-filechanges-verification-checks-feature2), [FR-14](FR.md#fr-14-graceful-filechanges-parser-fallback-feature14)_
  _Reuse: `extensions/specs-workflow/tools/specs-validator/audit-checks.ts:14` (AuditFinding interface), `src/utils/path-safety.ts` (resolveWithinProject)_
  **Done When:**
  - [ ] Файл `.claude/skills/spec-reality-check/scripts/verify.ts` существует
  - [ ] Парсит FILE_CHANGES table с graceful fallback (Action column опционален)
  - [ ] Unparseable rows → INFO finding, continue, не crash
  - [ ] CLI `--format <json|human|markdown>` arg parsing
  - [ ] path-traversal guard через resolveWithinProject

- [ ] Добавить 3 FC checks в verify.ts -- @feature2 — Status: TODO | Est: 45m
  _Requirements: [FR-2](FR.md#fr-2-filechanges-verification-checks-feature2)_
  **Done When:**
  - [ ] FC_CREATE_EXISTS emit-ит ERROR при existing file для action=create
  - [ ] FC_EDIT_MISSING emit-ит ERROR при missing file для action=edit
  - [ ] FC_DELETE_MISSING emit-ит ERROR при missing file для action=delete
  - [ ] SRC001_01..03 scenarios переходят Red → Green

- [ ] Добавить narrative path check -- @feature3 — Status: TODO | Est: 45m
  _Requirements: [FR-3](FR.md#fr-3-narrative-path-verification-feature3)_
  **Done When:**
  - [ ] Regex extract inline backtick paths из FR/DESIGN/TASKS
  - [ ] Skip paths внутри fenced code blocks
  - [ ] WARNING emit на missing paths
  - [ ] SRC001_04 scenario Green

- [ ] Добавить 3 output formats -- @feature6 — Status: TODO | Est: 45m
  _Requirements: [FR-6](FR.md#fr-6-three-output-formats-feature6)_
  _Reuse: `chalk` package (existing devDep)_
  **Done When:**
  - [ ] JSON format outputs valid JSON parsable through JSON.parse
  - [ ] Human format uses chalk ANSI colors с file:line refs
  - [ ] Markdown format outputs валидная markdown table
  - [ ] SRC001_08..10 scenarios Green

## Phase 2: Git + TASKS checks (Green @feature4,5)

- [ ] Добавить code-drift check через git log -- @feature4 — Status: TODO | Est: 45m
  _Requirements: [FR-4](FR.md#fr-4-code-drift-detection-via-git-log-feature4)_
  _Reuse: spawnSync pattern из `extensions/_shared/scope-gate-marker-store.ts`_
  **Done When:**
  - [ ] `git log --max-count=20 -S "FR-N"` per FR
  - [ ] CODE_DRIFT_FR_ALREADY_DONE WARNING на non-empty output
  - [ ] Graceful skip if .git/ missing → INFO finding (per `docker-no-git-repo` rule)
  - [ ] SRC001_05 scenario Green

- [ ] Добавить TASKS↔FC consistency check -- @feature5 — Status: TODO | Est: 30m
  _Requirements: [FR-5](FR.md#fr-5-tasksfilechanges-consistency-feature5)_
  **Done When:**
  - [ ] Парс TASKS.md `**files:**` blocks
  - [ ] Symmetric diff vs FILE_CHANGES paths
  - [ ] WARNING на orphan TASK files, INFO на orphan FC files
  - [ ] Skip paths помеченные `[OUT_OF_SCOPE:]` или `~~strikethrough~~`
  - [ ] SRC001_06 scenario Green

- [ ] Negative test verification — verify.ts на shipped clean spec → 0 ERRORs -- @feature10 — Status: TODO | Est: 15m
  _Requirements: [FR-10](FR.md#fr-10-test-coverage-feature10)_
  **Done When:**
  - [ ] SRC001_07 scenario Green
  - [ ] Запуск на `.specs/spec-workflow-md-validation/` → 0 ERRORs

## Phase 3: Hook + SKILL.md (Green @feature7,8)

- [ ] Реализовать verify-hook.ts -- @feature7 @feature8 — Status: TODO | Est: 60m
  _Requirements: [FR-7](FR.md#fr-7-pretooluse-hook-on-exitplanmode-feature7), [FR-8](FR.md#fr-8-hook-fail-open-on-exception-feature8)_
  _Reuse: `extensions/scope-gate/tools/scope-gate/scope-gate-guard.ts` (PreToolUse hook pattern, stdin JSON, fail-open)_
  **Done When:**
  - [ ] Stdin JSON parsing с tool_input.plan + tool_input.planFilePath
  - [ ] Regex extract `.specs/{slug}/` refs (dedup)
  - [ ] Spawn verify.ts per spec, aggregate ERRORs
  - [ ] Deny output JSON shape при ≥1 ERROR
  - [ ] Fail-open на exception → stderr warning + permit
  - [ ] SRCHOOK001_01..03 scenarios Green

- [ ] Создать SKILL.md с auto-trigger description -- @feature1 — Status: TODO | Est: 30m
  _Requirements: [FR-1](FR.md#fr-1-skill-bundle-layout-feature1)_
  _Reuse: `.claude/skills/create-spec/SKILL.md` (multi-line EN+RU trigger pattern)_
  **Done When:**
  - [ ] Frontmatter description содержит 4 lifecycle triggers (create/modify/supplement/implement) + общие
  - [ ] 5-step workflow body
  - [ ] references/checks.md создан с 6-check reference

## Phase 4: Wiring + Integrations (Green @feature9,12,13)

- [ ] Добавить skill + hook в extension.json -- @feature9 — Status: TODO | Est: 30m
  _Requirements: [FR-9](FR.md#fr-9-extension-manifest-wiring-feature9)_
  _Reuse: `extensions/specs-workflow/extension.json` существующая Stop hook entry как template_
  **Done When:**
  - [ ] `extensions/specs-workflow/extension.json` обновлён: skills + skillFiles entries
  - [ ] hooks.claude.PreToolUse array entry с matcher ExitPlanMode
  - [ ] version 1.20.0 → 1.21.0
  - [ ] `npm run build` green

- [ ] Создать installed copies в `.dev-pomogator/tools/spec-reality-check/` -- @feature9 — Status: TODO | Est: 10m
  _Requirements: [FR-9](FR.md#fr-9-extension-manifest-wiring-feature9)_
  **Done When:**
  - [ ] verify.ts copied
  - [ ] verify-hook.ts copied

- [ ] Интегрировать в spec-review category 15 -- @feature12 — Status: TODO | Est: 45m
  _Requirements: [FR-12](FR.md#fr-12-spec-review-category-15-integration-feature12)_
  _Reuse: `.claude/skills/spec-review/references/category-14-memory-constraints.md` (existing reference doc layout)_
  **Done When:**
  - [ ] `.claude/skills/spec-review/SKILL.md` обновлён — Category 15 row в trigger таблице + раздел
  - [ ] `references/category-15-reality-drift.md` создан с 6 sub-checks + severity mapping (ERROR→P0, WARNING→P1, INFO→P2)

- [ ] Интегрировать в create-spec Phase 3 -- @feature13 — Status: TODO | Est: 30m
  _Requirements: [FR-13](FR.md#fr-13-create-spec-phase-3-integration-feature13)_
  **Done When:**
  - [ ] `.claude/skills/create-spec/references/phase3plus_audit-overview.md` обновлён — Phase 3 step вызывает `Skill("spec-reality-check")`
  - [ ] Если ERRORs — Phase 3 не confirm-ится

## Phase 5: Apply + Cleanup + Final Verify (Green @feature11)

- [ ] Запустить skill на canonical-plugin spec -- @feature11 — Status: TODO | Est: 15m
  _Requirements: [FR-11](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11)_
  **Done When:**
  - [ ] `verify.ts .specs/dev-pomogator-canonical-plugin --format markdown` сохранён в `.specs/dev-pomogator-canonical-plugin/REALITY_CHECK_REPORT.md`
  - [ ] Output содержит ≥3 ERRORs (известных из manual audit)

- [ ] Починить drift в canonical-plugin spec docs -- @feature11 — Status: TODO | Est: 45m
  _Requirements: [FR-11](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11)_
  **Done When:**
  - [ ] FILE_CHANGES.md paths обновлены
  - [ ] Narrative refs починены если skill flag-нёт
  - [ ] CHANGELOG.md содержит cleanup entry
  - [ ] Повторный verify.ts → 0 ERRORs

- [ ] Final verification — Status: TODO | Est: 30m
  **Done When:**
  - [ ] Все 13 BDD сценариев (SRC001_01..10 + SRCHOOK001_01..03) GREEN
  - [ ] `validate-spec.ts -Path .specs/spec-reality-check` → 0 errors
  - [ ] `audit-spec.ts -Path .specs/spec-reality-check` → 0 ERRORs
  - [ ] Запуск `verify.ts .specs/spec-workflow-md-validation` → 0 ERRORs (clean baseline)
  - [ ] Запуск `verify.ts .specs/spec-reality-check` (self-test) → 0 ERRORs

## Phase 6: Plan-gate bug fix verification — ALREADY SHIPPED

- [x] Bug fix в plan-gate.ts Phase 2.5 — string array → ValidationError objects -- @feature15 — Status: DONE | Est: 15m
  _Requirements: [FR-15](FR.md#fr-15-bug-fix-plan-gate-phase-25-already-shipped-feature15)_
  **Done When:**
  - [x] `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:308-311` исправлен
  - [x] Phase 2.5 deny errors теперь читаемые (не "line undefined: undefined")
  - [x] Committed as `b8a2bca`
