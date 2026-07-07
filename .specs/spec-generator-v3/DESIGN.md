# Design

## Реализуемые требования

- [FR-1: discovery-forms skill](FR.md#fr-1-discovery-forms-skill-feature1)
- [FR-2: requirements-chk-matrix skill](FR.md#fr-2-requirements-chk-matrix-skill-feature2)
- [FR-3: task-board-forms skill](FR.md#fr-3-task-board-forms-skill-feature3)
- [FR-4..8: 5 form-guards](FR.md)
- [FR-9: migration guard](FR.md#fr-9-migration-guard-feature5)
- [FR-10: fail-open](FR.md#fr-10-fail-open-feature5)
- [FR-11: meta-guard](FR.md#fr-11-extension-json-meta-guardts-hook-feature7)
- [FR-12: audit log](FR.md#fr-12-audit-log-feature8)
- [FR-13: UserPromptSubmit summary](FR.md#fr-13-userpromptsubmit-summary-feature8)
- [FR-14: task-table format](FR.md#fr-14-spec-statusts-task-table-format-feature3)

## Компоненты

- `spec-form-parsers.ts` — 5 regex-based parser functions (module-cached).
- `audit-logger.ts` — append-only writer + rotation.
- `phase-constants.ts` (extended) — `getProgressVersion()`, `isV3Spec()`, `PROGRESS_SCHEMA_VERSION`.
- 6 PreToolUse hooks в `extensions/specs-workflow/tools/specs-validator/`:
  - `user-story-form-guard.ts`
  - `task-form-guard.ts`
  - `design-decision-guard.ts`
  - `requirements-chk-guard.ts`
  - `risk-assessment-guard.ts`
  - `extension-json-meta-guard.ts`
- 3 child skills в `extensions/specs-workflow/.claude/skills/`:
  - `discovery-forms/SKILL.md`
  - `requirements-chk-matrix/SKILL.md`
  - `task-board-forms/SKILL.md`
- `validate-specs.ts` (extended) — `renderFormGuardsSummary()` для UserPromptSubmit.
- `specs-generator-core.mjs` (extended) — `task-table` format + `parseTasksForTable` + `renderTaskTable`.
- `scaffold-spec.ts` через core.mjs (extended) — stamps `version: 3` в новых `.progress.json`.

## Где лежит реализация

- App-код: `extensions/specs-workflow/tools/specs-validator/` + `extensions/specs-workflow/tools/specs-generator/`
- Skills: `extensions/specs-workflow/.claude/skills/`
- Manifest: `extensions/specs-workflow/extension.json` v1.17.0
- Templates: `extensions/specs-workflow/tools/specs-generator/templates/*.template`
- Workflow rule: `.claude/rules/specs-workflow/specs-management.md`

## Директории и файлы

- `extensions/specs-workflow/.claude/skills/discovery-forms/SKILL.md`
- `extensions/specs-workflow/.claude/skills/requirements-chk-matrix/SKILL.md`
- `extensions/specs-workflow/.claude/skills/task-board-forms/SKILL.md`
- `extensions/specs-workflow/tools/specs-validator/spec-form-parsers.ts`
- `extensions/specs-workflow/tools/specs-validator/audit-logger.ts`
- `extensions/specs-workflow/tools/specs-validator/user-story-form-guard.ts`
- `extensions/specs-workflow/tools/specs-validator/task-form-guard.ts`
- `extensions/specs-workflow/tools/specs-validator/design-decision-guard.ts`
- `extensions/specs-workflow/tools/specs-validator/requirements-chk-guard.ts`
- `extensions/specs-workflow/tools/specs-validator/risk-assessment-guard.ts`
- `extensions/specs-workflow/tools/specs-validator/extension-json-meta-guard.ts`
- `extensions/specs-workflow/tools/specs-validator/phase-constants.ts` (edit)
- `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` (edit)
- `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` (edit)
- `extensions/specs-workflow/tools/specs-generator/templates/*.template` (5 edits)
- `extensions/specs-workflow/extension.json` (edit v1.17.0)
- `extensions/specs-workflow/CHANGELOG.md` (edit)
- `.claude/rules/specs-workflow/specs-management.md` (edit)
- `tests/e2e/spec-generator-v3.test.ts`

## Алгоритм

### Form-guard flow (все 6 hooks)

1. Если stdin TTY → exit 0.
2. Parse stdin JSON → extract `tool_name`, `tool_input.file_path`, content.
3. Если tool_name не Write/Edit → exit 0.
4. Если file_path не ends with TARGET_FILE → exit 0.
5. `extractSpecInfo(filePath)` → если не `.specs/` path → exit 0.
6. `isV3Spec(specDir)` → если false → logEvent ALLOW_AFTER_MIGRATION + exit 0.
7. Parse content через shared parser → найти violations.
8. Если violations === 0 → logEvent ALLOW_VALID + exit 0.
9. Else → logEvent DENY + stderr multi-line + stdout JSON `permissionDecision: deny` + exit 2.
10. Wrapper `main().catch()` → logEvent PARSER_CRASH + exit 0.

### Meta-guard flow

1-5 как в form-guard.
6. Target file endsWith `extension.json` OR `settings.local.json` OR `.claude/settings.json`.
7. Read current on-disk content.
8. Compute new content (Write: content field; Edit: old_string + new_string patch).
9. Extract `protected hooks` names present в current vs new.
10. Если removed.length > 0 → DENY с list of removed.
11. Else → ALLOW_VALID.

### Audit-logger rotate

1. `logEvent(hookName, event, filepath, reason?)` — appendFileSync to `~/.dev-pomogator/logs/form-guards.log`.
2. Format: `{ISO-8601}Z {event} {hookName} {filepath} {reason}\n`.
3. `rotateLog()` вызывается validate-specs.ts once per session:
   - Parse all lines, filter within 30 days.
   - If size > 10MB, keep tail half.
   - Atomic write через tmp file + rename.

## API

### Skill invocation contract

Все 3 skills emit structured JSON to stdout после выполнения:

```json
{
  "stories_written": 4,
  "files_touched": ["USER_STORIES.md", "RESEARCH.md"],
  "jira_mode": false
}
```

### `spec-status.ts -Format task-table`

- Input: `-Path .specs/{slug}`
- Output: markdown table `| ID | Title | Status | Depends | Phase | Est. |` to stdout.
- Exit: 0 success, 1 if TASKS.md not found.

## Key Decisions

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2. Hook `design-decision-guard` enforces format.

### Decision: Anti-pushy description pattern для 3 child skills

**Rationale:** Claude Code не имеет native `internal: true` frontmatter field. Единственный proven способ сделать skill non-auto-triggered — написать description без trigger phrases ("when the user", "whenever"). Pattern подтверждён `rules-optimizer` и `deep-insights` skills.

**Trade-off:** Нет гарантии что Claude's skill-selector не surface-ит skill на edge-case prompt; mitigating — SPECGEN003_24 negative test проверяет это на реальных prompts типа "optimize my tasks".

**Alternatives considered:**
- `internal: true` frontmatter field — rejected: не существует в Claude Code API, патч upstream outside scope.
- Placement in `plugin-dev/` subdirectory — rejected: не меняет auto-trigger behavior, только organizational.
- Monolith skill — rejected: раздувает description, нарушает anti-pushy principle, усложняет maintenance.

### Decision: Meta-guard protects `extension.json` and `.claude/settings.local.json`

**Rationale:** Агенты находят env var bypass (`SPEC_FORM_GUARDS_DISABLE`) и забывают его снять. Env var bypass удалён. Вместо — meta-guard блокирует попытки удалить form-guard entries из самого manifest. Агент физически не может выключить защиту.

**Trade-off:** Legitimate манифест-изменения (переименование, консолидация extensions) требуют human editing снаружи Claude Code. Для дев-воркфлоу это приемлемо — такие операции редки.

**Alternatives considered:**
- Keep `SPEC_FORM_GUARDS_DISABLE=1` env var — rejected: агенты обходят тривиально.
- Read-only filesystem flag on extension.json — rejected: блокирует install-time updates installer'ом.
- Require cryptographic signature on manifest — rejected: gross over-engineering, нет infra for key management.

### Decision: Migration guard через `.progress.json.version >= 3`

**Rationale:** 30+ existing specs (v1/v2) не готовы к enforcement новой формы. Нужна миграционная изоляция без dev-компании по apgrade. `scaffold-spec.ts` stamps v3 для новых; hooks проверяют version в первую очередь после matcher filter.

**Trade-off:** Existing specs остаются в v1/v2 навсегда (или до manual migration). Нельзя enforce form-guards retroactively.

**Alternatives considered:**
- WARNING-only период 2 недели с последующим переключением на ERROR — rejected: агент игнорирует warnings (доказано `validate-specs.ts` рекорд 1.5 года).
- Bulk migration всех existing specs — rejected: days of manual work + risk breaking completed specs.
- Opt-in via explicit env var — rejected: `.progress.version` — естественный версионный маркер, никаких новых конфигов.

### Decision: 3 skills по фазам, не 7 atomic или 1 monolith

**Rationale:** Каждый skill = одна ментальная единица + одна фаза workflow. Совпадает со STOP-gates в specs-management.md. Claude переключается между skills один раз per phase.

**Trade-off:** Risk Assessment + User Stories объединены в discovery-forms (Phase 1) — не чистое single-responsibility. CHK matrix + Key Decisions объединены в requirements-chk-matrix — аналогично.

**Alternatives considered:**
- 7 atomic skills (1 per artifact) — rejected: overhead Skill invocations, parent делает 7 calls подряд = дорого.
- 1 monolith skill — rejected: раздутое SKILL.md, pushy description, нарушение skill-creator best practices.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** vitest (existing dev-pomogator pattern — `.feature` doc + `.test.ts` execution via vitest; no separate Gherkin parser). `[VERIFIED: grep tests/e2e/*.test.ts]`
**Install Command:** already installed (vitest в devDependencies)
**Evidence:** `tests/e2e/create-specs-bdd-enforcement.test.ts` — existing pattern, comment-tagged scenarios
**Verdict:** Нужны hooks для temp spec creation + audit log cleanup + snapshot existing .specs/ state.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` | runInstaller wrapper | per-test | Setup/teardown temp project | Да — для integration tests |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `makeTempSpec()` в `spec-generator-v3.test.ts` | BeforeEach | @feature4 @feature5 @feature7 | Создаёт temp `.specs/foo/` с `.progress.json` заданной версии + sample files | Inline pattern like bdd-enforcement.test.ts |
| `cleanup()` callback | AfterEach | любой | `rmSync(specDir, recursive: true)` — removes temp dir | Aналогично existing fixture cleanup |
| Audit log reset | BeforeEach (optional) | @feature8 | Read log before test → compare tail after test для verification DENY/ALLOW events | New — специфично для audit log tests |

### Cleanup Strategy

1. AfterEach: removeSync temp spec dir.
2. NO cleanup of `~/.dev-pomogator/logs/form-guards.log` — tests читают tail (idempotent), write-only события аккумулируются.
3. В CI env: set `DEV_POMOGATOR_LOG_DIR` to test-specific path чтобы изолировать local dev logs от CI runs (future enhancement).

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Inline sample content strings | inline in test | USER_STORIES/TASKS/REQUIREMENTS/DESIGN/RESEARCH valid/invalid | per-test |
| `.progress.json` variants | inline JSON | version: 3 / no version / version: 2 | per-test via makeTempSpec |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `specDir` | string | makeTempSpec() | test body | temp spec path |
| `cleanup` | function | makeTempSpec() | try/finally | AfterEach removal |
