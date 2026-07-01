# Research

## Контекст

В этой сессии 2026-05-23 при ручном аудите спеки `.specs/dev-pomogator-canonical-plugin/` обнаружено: FILE_CHANGES.md ссылается на ≥3 несуществующих файла (`bin/postinstall.js`, ~~`src/installer/install-user-scope.ts`~~ (removed in v2 migration), ~~`src/installer/git-exclude.ts`~~ (removed in v2 migration)); exhaustive grep по cursor-refs дал 59 vs заявленных в FILE_CHANGES 39 (undercount 51%). Существующий `audit-spec.ts FILE_CHANGES_VERIFY` покрывает только `action=edit` на missing file; нет покрытия `action=create` drift, `action=delete` drift, narrative refs, code-drift через git history, TASKS↔FILE_CHANGES consistency. Verify запускается только вручную — нет авто-триггера. Цель этой спеки — закрыть gap новым skill'ом который автоматически проверяет реальность утверждений спеки против файловой системы и git history.

## Источники

- План работ `C:\Users\stigm\.claude\plans\melodic-pondering-map.md` — основной source-of-truth для FR/AC/Use Cases/Risks; 17 FR + 10 AC EARS + 11 todos + 6 verification checks + 2 интеграции
- `extensions/specs-workflow/tools/specs-validator/audit-checks.ts:14` — exports `AuditFinding` interface; line 48 `checkPartialImpl`, line 89 `checkTaskAtomicity` — reusable check patterns
- Anthropic Claude Code plugin docs — skill auto-trigger via description matching (model-driven invocation)
- Existing skills как pattern: `.claude/skills/create-spec/SKILL.md` (multi-line EN+RU triggers), `.claude/skills/strong-tests/SKILL.md`, `.claude/skills/verify-generic-scope-fix/SKILL.md`
- Existing PreToolUse hook: `extensions/scope-gate/tools/scope-gate/scope-gate-guard.ts` (stdin JSON parsing, `permissionDecision: "deny"` output, fail-open exception handling)
- Existing host-safe test pattern: `tests/e2e/mcp-config.test.ts` (os.tmpdir() isolation)
- Existing locks: `extensions/_shared/scope-gate-marker-store.ts`, `.claude/skills/pomogator-doctor/scripts/engine/lock.ts`

## Технические находки

### Skill auto-trigger через description matching

Claude Code загружает skills из `.claude/skills/SLUG/SKILL.md` где SLUG — directory name skill-а, и читает frontmatter description. Когда user prompt или агентский контекст матчатся с keywords из description — skill auto-invokes. Multi-line description с EN+RU триггерами — established pattern в этом репо. Для spec-reality-check триггеры должны покрывать ВСЕ 4 lifecycle-операции спеки: создать / изменить / дополнить / реализовать + общие "проверь спеку" / "verify spec ready" / "сверить с реальностью".

### AuditFinding interface переиспользуется

`audit-checks.ts:14` exports `interface AuditFinding` со полями check, category, severity, message, details, опциональные file и line. Все 6 новых checks emit findings в том же shape для consistency и упрощения интеграции в spec-review (category 15 mapping ERROR→P0 / WARNING→P1 / INFO→P2).

### PreToolUse hook pattern

`scope-gate-guard.ts` — pattern: read stdin JSON `{tool_name, tool_input, cwd, session_id}` → validation → если deny → output `{hookSpecificOutput: {hookEventName, permissionDecision: "deny", permissionDecisionReason}}` + exit 0; fail-open на exception. Для verify-hook.ts: matcher `ExitPlanMode`, extract `.specs/{slug}/` references из `tool_input.plan` через regex, run verify.ts per spec, aggregate ERRORs → deny.

### Graceful FILE_CHANGES parser fallback

Существующие спеки имеют разные форматы FILE_CHANGES.md tables. Parser принимает любой format с минимальным required-set `Path` column. На unparseable row — emit INFO finding "row N unparseable", не crash. Action column опционален.

### Git log для code-drift detection

`git log --max-count=20 -S "FR-N" -- <FILE_CHANGES paths>` — git pickaxe search. Non-empty output → код уже коммитился с FR-N → спека stale. Graceful skip если `.git/` отсутствует (Docker test environment per `docker-no-git-repo` rule).

### Host-safe test pattern

`tests/e2e/mcp-config.test.ts` — тесты через `os.tmpdir()` isolation, не трогают реальный `.specs/`. Тот же pattern для spec-reality-check tests.

## Где лежит реализация

- App-код (новый): `.claude/skills/spec-reality-check/scripts/verify.ts` — main entry, 6 checks, 3 output formats
- App-код (новый): `.claude/skills/spec-reality-check/scripts/verify-hook.ts` — PreToolUse hook wrapper
- SKILL.md: `.claude/skills/spec-reality-check/SKILL.md`
- References: `.claude/skills/spec-reality-check/references/checks.md`
- Installed copies: `.dev-pomogator/tools/spec-reality-check/verify.ts` + `verify-hook.ts`
- Tests: `tests/e2e/spec-reality-check.test.ts` + `tests/e2e/spec-reality-check-hook.test.ts`
- Fixtures: `tests/fixtures/spec-reality-check/` — 5 directory: stale-create, missing-edit, narrative-drift, code-drift, task-orphan
- Extension wiring: `extensions/specs-workflow/extension.json` (add skill + hook, bump 1.20.0→1.21.0)
- Integrations: `.claude/skills/spec-review/SKILL.md` (category 15) + `.claude/skills/create-spec/SKILL.md` (Phase 3 step)

## Выводы

1. Gap real: audit-spec НЕ проверяет реальность файлов — только internal consistency. Новый skill закрывает gap.
2. Auto-trigger possible: description matching + PreToolUse hook = двойная гарантия, оба shipping одновременно.
3. Reuse infrastructure: AuditFinding interface, scope-gate-guard.ts hook pattern, mcp-config.test.ts host-safe pattern — всё existing.
4. Integration two points: spec-review (curative, category 15) + create-spec (preventative, Phase 3 step) — pre-stop coverage на ВСЕ ConfirmStop события.
5. Sequential dependency: canonical-plugin implementation blocked пока skill shipped + applied + drift cleaned.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-layout | `.claude/rules/extension-layout.md` | Skills живут в `.claude/skills/{name}/` корня dev-pomogator | Создание skill | FR-1, FR-9 |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json source of truth; обновлять skills/skillFiles/hooks | Registration | FR-9 |
| installer-hook-formats | `.claude/rules/gotchas/installer-hook-formats.md` | Hooks 3 формата (string, object, array) | Hook registration | FR-7 |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | Relative imports ОБЯЗАНЫ `.ts` расширение | verify.ts imports | FR-2..6 |
| docker-no-git-repo | `.claude/rules/gotchas/docker-no-git-repo.md` | Docker test env без `.git/` | code-drift check | NFR-Reliability, Edge case 3 |
| atomic-update-lock | `.claude/rules/atomic-update-lock.md` | Lock через `flag: 'wx'` | Shared state writes | NFR-Reliability |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| audit-checks.ts | `extensions/specs-workflow/tools/specs-validator/audit-checks.ts:14` | `AuditFinding` interface + 5 existing checks | Reuse interface; 6 new checks emit в том же shape |
| scope-gate-guard.ts | `extensions/scope-gate/tools/scope-gate/scope-gate-guard.ts` | PreToolUse hook pattern: stdin JSON → deny + fail-open | Template для verify-hook.ts |
| create-spec SKILL.md | `.claude/skills/create-spec/SKILL.md` | Multi-line EN+RU description trigger pattern | Template для SKILL.md description |
| variant-matrix-build | `.claude/skills/variant-matrix-build/SKILL.md` | Skill bundle + skillFiles registration layout | Template для extension.json |
| mcp-config.test.ts | `tests/e2e/mcp-config.test.ts` | Host-safe tmpdir test pattern | Template для verify.ts tests |
| spec-review | `.claude/skills/spec-review/SKILL.md` (14 категорий, P0..P3) | Aggregation surface для pre-stop checks | Integration target (category 15) |

### Architectural Constraints Summary

Skill ships как часть `extensions/specs-workflow` plugin (bump 1.20.0 → 1.21.0). Файлы skill живут в `.claude/skills/spec-reality-check/` (per `extension-layout` rule), installed copy в `.dev-pomogator/tools/spec-reality-check/` для dogfood. PreToolUse hook регистрируется в `extension.json hooks.claude.PreToolUse` массиве в array-with-object формате per `installer-hook-formats` rule. Relative imports в TS файлах используют `.ts` extension per `ts-import-extensions` rule. Тесты host-safe через `os.tmpdir()` per `mcp-config.test.ts` pattern. Code-drift check graceful skip если `.git/` отсутствует (Docker test environment).

## Risk Assessment

> Auto-populated by Skill `discovery-forms` during Phase 1. Hook `risk-assessment-guard` enforces:
> when `## Risk Assessment` heading is present, the table below must have ≥2 non-placeholder rows
> with Likelihood ∈ `{Low, Medium, High}`, Impact ∈ `{Low, Medium, High}`, and non-empty Mitigation.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Description matching не детерминистический — auto-trigger пропустится в edge case (terse фраза без ключевого триггера) | Medium | High | PreToolUse hook на ExitPlanMode как mechanical backup (FR-7). Two-mechanism защита: model invocation + hook gate. |
| False-positive deny на пустой FILE_CHANGES в новой спеке — hook блокирует свежий scaffold | Medium | Medium | Special-case: empty FILE_CHANGES → emit INFO finding "spec scaffold detected", не ERROR. Не denyAndExit на новой спеке. |
| Git log slow на больших репозиториях с длинной историей (1000+ commits) — verify timeout | Low | Medium | Limit `--max-count=20` per git log call; cache results per FR ID в session. Graceful skip если git недоступен (`.git/` отсутствует в Docker test env). |
| Skill не покрывает все типы drift — описание текста в спеке может содержать устаревшие утверждения которые ни один из 6 checks не отлавливает | Medium | Low | 6 checks — MVP; будущие итерации расширяют. Не лечит-всё. Документация явно говорит о scope. |
| FILE_CHANGES.md нестандартный формат таблицы (отсутствует Action column, разный column order) — parser crash | Medium | Medium | Graceful fallback: required-set Path; Action опционален. На unparseable row — INFO finding "row N unparseable", continue. |
| Hook сам падает с unhandled exception (parser bug, git path issue на Windows) — блокирует ExitPlanMode постоянно | Low | High | Fail-open: на любой exception в hook code — log warning + permit. AI не блокируется broken hook'ом. |
