# Research

## Контекст

spec-generator-v3 импортирует 7 artifacts из github.com/github/spec-kit (71k⭐ Python CLI `specify` + slash commands `/speckit.*`) + wiki custom preset.

## Источники

- github.com/github/spec-kit v0.7.0 (upstream templates spec.md/plan.md/tasks.md)
- wiki archive с custom preset (Done When, Task Summary Table, CHK matrix, Risk Assessment, Key Decisions) — поверх upstream, не в стоке
- dev-pomogator existing hooks: `phase-gate.ts`, `reqnroll-ce-guard`, `pre-edit-skill-guard` (pattern reference)
- Anthropic skill-creator: anti-pushy description pattern (rules-optimizer, deep-insights — proven нет auto-trigger)

## Технические находки

### Upstream vs custom preset

- Upstream v0.7.0 has: `User Story N (Priority: Pn)` + Why + Independent Test + Acceptance Scenarios inline; `Success Criteria SC-N`; `Complexity Tracking` (не Risk Assessment).
- Wiki preset adds (не в upstream): Done When per task, Task Summary Table, CHK traceability matrix `CHK-FR{n}-{nn}`, `## Risk Assessment` таблица с Likelihood/Impact/Mitigation, Key Decisions с Rationale/Trade-off/Alternatives considered.

### Hidden skills pattern (no native API)

- Claude Code SKILL.md frontmatter НЕТ полей `internal: true`, `private: true`, `visibility: parent-only`.
- Proven pattern — anti-pushy description: описание ЧТО skill делает + кто вызывает, БЕЗ trigger phrases "when the user", "whenever".
- Example: `rules-optimizer` description = "Optimizes .claude/rules/... Called automatically from suggest-rules Phase 6". Auto-trigger не происходит.

### Hallucination-proof hooks architecture

- Pattern `phase-gate.ts`: stdin JSON parse → matcher filter → validation → exit 0/2 с `hookSpecificOutput.permissionDecision: 'deny'` JSON + `process.stderr.write` human-readable message.
- Fail-open: `main().catch(e => exit(0))` — bug hook'а никогда не блокирует.
- Exit 2 означает deny; exit 0 означает allow.

### Migration guard via `.progress.version`

- `readProgressState` + новый `getProgressVersion` + `isV3Spec`: v3-only specs → enforcement; v1/v2 → pass-through.
- `scaffold-spec.ts` stamps `version: 3` для новых specs.
- Форвард-совместимо: `readProgressState` ignores unknown fields.

## Где лежит реализация

- App-код: `extensions/specs-workflow/tools/specs-validator/` (6 new hooks + spec-form-parsers.ts + audit-logger.ts)
- Skills: `extensions/specs-workflow/.claude/skills/{discovery-forms,requirements-chk-matrix,task-board-forms}/SKILL.md`
- Templates: `extensions/specs-workflow/tools/specs-generator/templates/*.template` (5 updated)
- Manifest: `extensions/specs-workflow/extension.json` (v1.17.0)
- Workflow rule: `.claude/rules/specs-workflow/specs-management.md` (Skill invocations wired)

## Выводы

- Native "private skill" API в Claude Code отсутствует; anti-pushy description — proven workaround.
- PreToolUse hook pattern уже используется (phase-gate, reqnroll-ce-guard) — адаптация тривиальна.
- Migration guard через `.progress.version` изолирует v3 enforcement от 30+ existing specs без ручной миграции.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | CLAUDE.md = index/glossary для rules; при добавлении rule обновить таблицу | rule creation | Phase 5 manifest update |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json = source of truth для installer | manifest edit | FR-16 |
| installer-hook-formats | `.claude/rules/gotchas/installer-hook-formats.md` | hooks имеют 3 формата (string, object, array) | manifest edit | FR-16 array-of-groups |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты через runInstaller/spawnSync, не unit | test writing | All e2e tests |
| centralized-test-runner | `.claude/rules/tui-test-runner/centralized-test-runner.md` | Тесты только через /run-tests | test execution | Phase 7 regression |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| `phase-gate.ts` | `extensions/specs-workflow/tools/specs-validator/` | PreToolUse skeleton + stdin parse + exit code 2 + fail-open wrapper | Copied pattern into 6 new hooks |
| `rules-optimizer/SKILL.md` | `.claude/skills/rules-optimizer/` | anti-pushy description example (Called automatically from suggest-rules) | 3 new skills follow same form |
| `reqnroll-ce-guard` | `extensions/reqnroll-ce-guard/` | PreToolUse на Write/Edit `.cs` с actionable multi-line error | Error message format reference |
| `validate-specs.ts` | `extensions/specs-workflow/tools/specs-validator/` | UserPromptSubmit hook printing warnings | Extended with renderFormGuardsSummary |
| `readProgressState` / phase-constants | same dir | `.progress.json` reader | Extended with getProgressVersion + isV3Spec |

### Architectural Constraints Summary

- **Hooks обязаны fail-open.** `main().catch(() => exit(0))` — bug не может блокировать Write.
- **No env var bypass.** `SPEC_FORM_GUARDS_DISABLE` не существует; только human-in-the-loop через редактирование `extension.json` снаружи Claude Code.
- **Migration guard first.** `isV3Spec()` check сразу после matcher filter — минимум overhead на existing specs.
- **Installer format**: `hooks.PreToolUse` должен быть array-of-groups согласно `installer-hook-formats.md`.
- **13-файловая структура не меняется.** Новые поля — в existing файлах (REQUIREMENTS.md get CHK matrix append, DESIGN.md get Key Decisions).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Parser regex false-positive на emoji/unicode в titles | High | High | Fail-open wrapper + audit log PARSER_CRASH для telemetry; unit-test парсеров на 28+ existing specs ДО активации |
| Child skills auto-trigger несмотря на anti-pushy description | Medium | Medium | Copy description verbatim из rules-optimizer (proven no auto-trigger); SPECGEN003_24 negative test |
| Serial chain 7 PreToolUse hooks замедляет Write/Edit | Medium | Low | Short-circuit на filename в первых 3 строках каждого hook; benchmark ≤ 180ms budget |
| Dogfood спека блокируется собственными guards при создании | High | Medium | В worktree `.dev-pomogator/` не установлен → form-guards неактивны. В target проекте bootstrap commit order: code → dogfood → manifest activation |
| `.progress.version` bump breaks existing installer readers | Low | High | readProgressState ignores unknown fields; additive schema change |
| Jira-mode traces теряются при skill rewrite | Medium | High | Skills read-first patch-second (Edit, не Write целого файла); SPECGEN003_21 round-trip test |
| Meta-guard false-DENY на legit manifest add-new-extension | Medium | Medium | Additive-only policy: meta-guard денит ТОЛЬКО при удалении protected hooks; SPECGEN003_26 allow test |
| Agent обходит meta-guard через settings.local.json | Medium | High | Meta-guard проверяет и source extension.json и installed settings.local.json; audit log с UserPromptSubmit summary |
| Audit log растёт без bound | Low | Low | rotateLog() удаляет >30 дней + truncate >10MB; вызывается validate-specs.ts once per session |
