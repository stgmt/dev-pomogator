# Design

## Реализуемые требования

- [FR-1: Skill bundle layout](FR.md#fr-1-skill-bundle-layout-feature1)
- [FR-2: FILE_CHANGES verification checks](FR.md#fr-2-filechanges-verification-checks-feature2)
- [FR-3: Narrative path verification](FR.md#fr-3-narrative-path-verification-feature3)
- [FR-4: Code-drift detection via git log](FR.md#fr-4-code-drift-detection-via-git-log-feature4)
- [FR-5: TASKS↔FC consistency](FR.md#fr-5-tasksfilechanges-consistency-feature5)
- [FR-6: Three output formats](FR.md#fr-6-three-output-formats-feature6)
- [FR-7: PreToolUse hook on ExitPlanMode](FR.md#fr-7-pretooluse-hook-on-exitplanmode-feature7)
- [FR-8: Hook fail-open](FR.md#fr-8-hook-fail-open-on-exception-feature8)
- [FR-9: Extension manifest wiring](FR.md#fr-9-extension-manifest-wiring-feature9)
- [FR-10: Test coverage](FR.md#fr-10-test-coverage-feature10)
- [FR-11: Applied on canonical-plugin](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11)
- [FR-12: spec-review integration](FR.md#fr-12-spec-review-category-15-integration-feature12)
- [FR-13: create-spec integration](FR.md#fr-13-create-spec-phase-3-integration-feature13)
- [FR-14: Parser fallback](FR.md#fr-14-graceful-filechanges-parser-fallback-feature14)
- [FR-15: plan-gate bug fix](FR.md#fr-15-bug-fix-plan-gate-phase-25-already-shipped-feature15)

## Компоненты

- `scripts/verify.ts` — main entry, 6 check functions, 3 output formatters, CLI arg parsing
- `scripts/verify-hook.ts` — PreToolUse hook wrapper, stdin JSON parsing, spec refs extraction, ERRORs aggregation, deny output
- `SKILL.md` — auto-trigger description (EN+RU triggers covering 4 lifecycle ops), 5-step workflow narrative
- `references/checks.md` — 6-check reference doc с примерами findings + root causes
- Integration patches: `.claude/skills/spec-review/SKILL.md` (Category 15) + `.claude/skills/create-spec/SKILL.md` (Phase 3 step)

## Где лежит реализация

- App-код: `.claude/skills/spec-reality-check/scripts/verify.ts` + `verify-hook.ts`
- Wiring: `extensions/specs-workflow/extension.json` (skill + hook registration, version bump)
- Installed dogfood: `.dev-pomogator/tools/spec-reality-check/`

## Директории и файлы

- `.claude/skills/spec-reality-check/SKILL.md`
- `.claude/skills/spec-reality-check/scripts/verify.ts`
- `.claude/skills/spec-reality-check/scripts/verify-hook.ts`
- `.claude/skills/spec-reality-check/references/checks.md`
- `.dev-pomogator/tools/spec-reality-check/verify.ts`
- `.dev-pomogator/tools/spec-reality-check/verify-hook.ts`
- `tests/e2e/spec-reality-check.test.ts`
- `tests/e2e/spec-reality-check-hook.test.ts`
- `tests/fixtures/spec-reality-check/stale-create/`
- `tests/fixtures/spec-reality-check/missing-edit/`
- `tests/fixtures/spec-reality-check/narrative-drift/`
- `tests/fixtures/spec-reality-check/code-drift/`
- `tests/fixtures/spec-reality-check/task-orphan/`

## Алгоритм

### verify.ts main flow

1. Парс CLI args — `spec-path` (required), `--format` (default `json`)
2. Resolve spec dir → assert `.specs/{slug}/` exists; иначе exit 1 с error message
3. Загрузить файлы спеки: FR.md, ACCEPTANCE_CRITERIA.md (для FR list), DESIGN.md, TASKS.md, FILE_CHANGES.md (для path table)
4. Запустить 6 checks параллельно, собрать `AuditFinding[]`:
   - FC parser (с graceful fallback на missing Action column)
   - FC_CREATE_EXISTS / FC_EDIT_MISSING / FC_DELETE_MISSING per row
   - NARRATIVE_PATH_MISSING — regex extract inline backtick paths из FR/DESIGN/TASKS, skip fenced blocks
   - CODE_DRIFT_FR_ALREADY_DONE — git log -S per FR-N (skip if .git missing)
   - TASKS_FC_CONSISTENCY — orphan check в обе стороны
5. Sort findings по severity (ERROR / WARNING / INFO)
6. Format output per `--format` (JSON / human / markdown)
7. Exit 0 (findings ≠ error)

### verify-hook.ts main flow

1. Read stdin JSON: `{tool_name, tool_input: {plan, planFilePath}, cwd, session_id}`
2. Extract `.specs/{slug}/` references из `tool_input.plan` + optional planFilePath content через regex `/\.specs\/(backlog\/)?([^\/\s)`*]+)/g`
3. Dedup paths
4. Per spec path: spawnSync `verify.ts <spec-path> --format json`, parse JSON output
5. Aggregate ERROR-severity findings
6. If ≥1 ERROR — output `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "<formatted>"}}` + exit 0
7. Else — empty output (permit) + exit 0
8. Outer try/catch — на любой exception log warning в stderr + exit 0 (fail-open)

### Integration points algorithm

- spec-review (curative): pre-stop pipeline step "Category 15" — `Skill("spec-reality-check")`; map severity ERROR→P0, WARNING→P1, INFO→P2; aggregate в общий 15-категорийный report
- create-spec (preventative): Phase 3 Finalization step "validation" перед `ConfirmStop Finalization` — `Skill("spec-reality-check")`; если ERRORs — Phase 3 не confirm-ится

## API

### verify.ts CLI

- Command: `npx tsx .claude/skills/spec-reality-check/scripts/verify.ts <spec-path> [--format <json|human|markdown>]`
- Args:
  - `spec-path` (positional, required): `.specs/{slug}/` directory
  - `--format` (optional, default `json`): output format
- Exit codes: 0 (always — findings ≠ error), 1 (unparseable args / IO error)
- Output stdout: per `--format`

### verify-hook.ts hook protocol

- Input stdin JSON: per Anthropic PreToolUse hook spec — `{hook_event_name: "PreToolUse", tool_name: "ExitPlanMode", tool_input: {plan, planFilePath?}, cwd, session_id}`
- Output stdout JSON (deny): `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "<formatted findings>"}}`
- Output stdout (permit): empty (no output)
- Exit code: 0 always (even on internal exception per fail-open)

## Key Decisions

### Decision: Two-mechanism auto-trigger (description matching + PreToolUse hook)

**Rationale:** Description matching недетерминистический — может пропустить edge cases (terse user prompts, контекст не упоминает spec). PreToolUse hook даёт mechanical guarantee на `ExitPlanMode`. Двойная защита от ошибки одного механизма.

**Trade-off:** Двойная инфраструктура — две точки maintenance (skill description + hook entry). Если оба нужно обновлять при изменении triggers — дополнительная работа.

**Alternatives considered:**
- Только description matching — rejected потому что non-deterministic, может пропустить edge cases где модель не сматчила trigger
- Только PreToolUse hook — rejected потому что срабатывает только на ExitPlanMode; manual workflows (user пишет "проверь спеку" без планирования) не покрываются

### Decision: Reuse AuditFinding interface

**Rationale:** `extensions/specs-workflow/tools/specs-validator/audit-checks.ts:14` уже exports `AuditFinding` со полями check, category, severity, message, details, опциональные file и line. Reuse даёт consistency между spec-reality-check и existing audit-spec.ts; упрощает интеграцию в spec-review (один shape — одна сериализация).

**Trade-off:** Lock-step coupling с audit-checks.ts — если interface там меняется, нужно sync. Mitigation: import напрямую, не дублировать определение.

**Alternatives considered:**
- Define новый `RealityFinding` interface — rejected потому что добавляет конверсию при agg в spec-review; ничего нового по семантике не даёт
- Inline anonymous type — rejected потому что hard для type-checking + reuse в hook code

### Decision: Three output formats (JSON / human / markdown)

**Rationale:** JSON — для CI/hook consumption (машинно-парсимый); human — для interactive run через chalk ANSI colors; markdown — для report files которые коммитятся (REALITY_CHECK_REPORT.md). Один skill служит всем consumer scenarios.

**Trade-off:** Три formatter функции = больше кода и тестов. Без markdown можно жить (генерировать post-hoc); без human можно жить (JSON тоже читаемо).

**Alternatives considered:**
- Только JSON — rejected потому что interactive workflow требует читаемый output без external pretty-print
- Только human + JSON — rejected потому что markdown reports часто нужны (commit-able artifacts)

### Decision: Graceful FILE_CHANGES parser fallback

**Rationale:** Существующие спеки имеют разные форматы FILE_CHANGES tables. Strict parser failing на нестандартном формате — fragile. Fallback на missing Action column + INFO finding для unparseable rows позволяет skill работать на legacy specs.

**Trade-off:** Невалидный row может silently pass (INFO finding не остановит, ERRORs не emit-ятся). User должен проверить INFO findings в output если ожидает strict validation.

**Alternatives considered:**
- Strict parser fail on unknown format — rejected потому что блокирует skill на legacy specs
- Auto-fix table format — rejected potому что добавляет complexity и может разрушить user-edited table

### Decision: Fail-open hook на exception

**Rationale:** Hook bugs (parser crash, git binary missing, encoding issue) не должны блокировать legitimate workflows. Per `pomogator-doctor` fail-soft convention — hook падает gracefully, AI продолжает.

**Trade-off:** Bug в hook code может silently pass drift до user'а. Mitigation: log warning в stderr (видно в session output если что-то не так).

**Alternatives considered:**
- Fail-closed (block on hook exception) — rejected потому что bad UX, AI заблокирован broken infrastructure
- No try/catch (let process crash) — rejected потому что Claude Code intercepts process exit codes; crash может cascade в session-killing

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** vitest (existing, не Cucumber — этот repo использует vitest для всех e2e через `extension-test-quality` rule с 1:1 mapping describe↔Scenario)
**Install Command:** already installed (devDeps `vitest` exists)
**Evidence:** `package.json:devDependencies.vitest` + existing pattern `tests/e2e/mcp-config.test.ts` (host-safe tmpdir + describe/it match BDD scenarios)
**Verdict:** Используем vitest как BDD-style runner; fixtures в `tests/fixtures/spec-reality-check/` per-scenario + cleanup в afterEach; hooks NOT cucumber-style, а vitest beforeEach/afterEach inline в тестах

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/mcp-config.test.ts` beforeEach/afterEach | inline vitest hooks | per-test | mkdtempSync tmpdir + rmSync cleanup | Да — template pattern для всех новых тестов |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/spec-reality-check.test.ts` beforeEach | vitest inline | per-test | Создаёт tmpdir со скаффолд spec dir + копирует fixture spec into tmpdir | mcp-config.test.ts |
| `tests/e2e/spec-reality-check.test.ts` afterEach | vitest inline | per-test | rmSync tmpdir cleanup | mcp-config.test.ts |
| `tests/e2e/spec-reality-check-hook.test.ts` beforeEach | vitest inline | per-test | Создаёт tmpdir + tmp git repo (для code-drift tests) | mcp-config.test.ts + git init |

### Cleanup Strategy

После каждого теста — `fs.rmSync(tmpDir, {recursive: true, force: true})`. Никаких shared state между tests. Если git repo создан — удаляется вместе с parent tmpdir. Failed cleanup не блокирует — Windows file locks могут потребовать retry, но это edge case.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| stale-create | `tests/fixtures/spec-reality-check/stale-create/` | Minimal spec с `action=create` row на existing file | per-test |
| missing-edit | `tests/fixtures/spec-reality-check/missing-edit/` | Spec с `action=edit` row на missing file (classic case) | per-test |
| narrative-drift | `tests/fixtures/spec-reality-check/narrative-drift/` | FR.md с inline backtick path на missing file | per-test |
| code-drift | `tests/fixtures/spec-reality-check/code-drift/` | Spec где FR-1 имеет git commit history | per-test |
| task-orphan | `tests/fixtures/spec-reality-check/task-orphan/` | TASKS.md упоминает файл которого нет в FILE_CHANGES | per-test |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tmpDir` | string | beforeEach | каждый it() и afterEach | Изолированный path для fixture copying + verify.ts cwd |
| `findings` | AuditFinding[] | runVerify helper | assertion в it() | Parsed verify.ts output |
