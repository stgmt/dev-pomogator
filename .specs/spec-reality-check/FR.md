# Functional Requirements (FR)

## FR-1: Skill bundle layout @feature1

Skill `spec-reality-check` создан в `.claude/skills/spec-reality-check/` с frontmatter содержащим auto-trigger description (EN+RU triggers) per repo convention. Тригеры покрывают все четыре lifecycle-операции спеки — создать ("создай спеку", "новая спека", "create spec"), изменить ("измени спеку", "modify spec", "update spec"), дополнить ("дополни спеку", "supplement", "extend spec", "добавь FR/AC"), реализовать ("реализуй спеку", "implement spec"). Плюс общие: "проверь спеку", "verify spec ready", "сверить с реальностью".

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path-drift-detected-before-implementation)

## FR-2: FILE_CHANGES verification checks @feature2

`scripts/verify.ts` реализует 3 FILE_CHANGES_VERIFY checks: `FC_CREATE_EXISTS` (action=create → файл НЕ должен существовать), `FC_DELETE_MISSING` (action=delete → должен существовать), `FC_EDIT_MISSING` (action=edit → должен существовать). Severity ERROR per check on detected drift. Импорт `AuditFinding` interface из `audit-checks.ts:14`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path-drift-detected-before-implementation)

## FR-3: Narrative path verification @feature3

`verify.ts` реализует `NARRATIVE_PATH_MISSING` check: regex выдёргивает пути из inline backticks в FR/DESIGN/TASKS.md (расширения ts/js/mjs/cjs/json/md/py/feature/yaml/yml/sh/ps1/bat), проверяет fs.existsSync, эмитит WARNING на missing paths. Skip paths внутри fenced code blocks (примеры).

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path-drift-detected-before-implementation)

## FR-4: Code-drift detection via git log @feature4

`verify.ts` реализует `CODE_DRIFT_FR_ALREADY_DONE` check: для каждого FR-N запускает `git log --max-count=20 -S "FR-N"` по FILE_CHANGES paths; если commits найдены — WARNING "spec stale, feature already shipped". Graceful skip с INFO finding если `.git/` отсутствует (Docker test env per `docker-no-git-repo` rule).

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path-drift-detected-before-implementation)

## FR-5: TASKS↔FILE_CHANGES consistency @feature5

`verify.ts` реализует `TASKS_FC_CONSISTENCY` check: каждый файл в TASKS `files` блоках должен быть в FILE_CHANGES таблице; orphan check в обе стороны; WARNING при mismatch. Skip paths помеченные `[OUT_OF_SCOPE: ...]` или `~~strikethrough~~`.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature5)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path-drift-detected-before-implementation)

## FR-6: Three output formats @feature6

`verify.ts` output поддерживает 3 форматa — `--format json` (CI/hook consumption), `--format human` (interactive, ANSI colors через chalk), `--format markdown` (report files, валидная markdown table). CLI dispatch per arg; default JSON.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature6)
**Use Case:** [UC-3](USE_CASES.md#uc-3-manual-invocation-через-проверь-спеку)

## FR-7: PreToolUse hook on ExitPlanMode @feature7

PreToolUse hook `verify-hook.ts` зарегистрирован в `extensions/specs-workflow/extension.json` под matcher `ExitPlanMode`; парсит `tool_input.plan` через stdin JSON, извлекает `.specs/{slug}/` references, запускает verify.ts на каждой, возвращает `permissionDecision: "deny"` если ≥1 ERROR. Output JSON со shape `hookSpecificOutput.permissionDecisionReason`.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature7)
**Use Case:** [UC-2](USE_CASES.md#uc-2-pretooluse-hook-denies-exitplanmode-на-drift)

## FR-8: Hook fail-open on exception @feature8

Hook fail-open — если verify.ts падает с unhandled exception → hook logs warning в stderr + permits ExitPlanMode (per `pomogator-doctor` fail-soft convention). AI не блокируется broken hook'ом. Все file reads через try/catch с graceful fallback.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-feature8)
**Use Case:** [Edge case 1](USE_CASES.md#edge-case-1-fail-open)

## FR-9: Extension manifest wiring @feature9

Skill добавлен в `extensions/specs-workflow/extension.json` под `skills` field + `skillFiles` (mirror pattern from `variant-matrix-build`); hook entry в `hooks.claude.PreToolUse` array (object format per `installer-hook-formats` rule); plugin version bump 1.20.0 → 1.21.0.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-feature9)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path-drift-detected-before-implementation)

## FR-10: Test coverage @feature10

Тесты — `tests/e2e/spec-reality-check.test.ts` (vitest, 5+ fixture-based test cases по одному per check) + `tests/e2e/spec-reality-check-hook.test.ts` (hook integration: allow / deny / fail-open scenarios). Host-safe через `os.tmpdir()` per `tests/e2e/mcp-config.test.ts` pattern.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-feature10)
**Use Case:** [UC-4](USE_CASES.md#uc-4-negative-test-на-shipped-spec-clean-baseline)

## FR-11: Applied on canonical-plugin spec @feature11

Skill применён на `.specs/dev-pomogator-canonical-plugin/` — обнаружен полный список drift'ов (≥3 ERRORs известных из manual audit); spec docs обновлены; повторный run → 0 ERRORs (≤2 cosmetic WARNs допустимо).

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-feature11)
**Use Case:** [UC-5](USE_CASES.md#uc-5-cleanup-canonical-plugin-spec-после-shipping-skill)

## FR-12: spec-review category 15 integration @feature12

`.claude/skills/spec-review/SKILL.md` обновлён — добавлена Category 15 "Reality Drift" в trigger таблицу + раздел; spec-review pipeline явно вызывает `Skill("spec-reality-check")` в pre-stop workflow; findings агрегируются в общий 15-категорийный report; severity ERROR→P0, WARNING→P1, INFO→P2 mapping. Reference doc `references/category-15-reality-drift.md` создан.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-feature12)
**Use Case:** [UC-6](USE_CASES.md#uc-6-spec-review-category-15-integration)

## FR-13: create-spec Phase 3 integration @feature13

`.claude/skills/create-spec/SKILL.md` или `references/phase3plus_audit-overview.md` обновлён — Phase 3 Finalization workflow явно вызывает `Skill("spec-reality-check")` перед `ConfirmStop Finalization`. Preventative: drift не возникает в новых спецах на стадии создания. Если skill returns ERRORs — Phase 3 не confirm-ится пока drift не починен.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-feature13)
**Use Case:** [UC-7](USE_CASES.md#uc-7-create-spec-phase-3-finalization-preventative-check)

## FR-14: Graceful FILE_CHANGES parser fallback @feature14

Парсер `FILE_CHANGES.md` в `verify.ts` имеет graceful fallback на нестандартный формат таблицы (отсутствует column `Action`, разная order columns, embedded markdown в Reason). При unparseable rows — emit INFO finding "FILE_CHANGES row N unparseable" вместо crash. Минимальный required-set — `Path` column обязателен; `Action` опционален.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14-feature14)
**Use Case:** [Edge case 2](USE_CASES.md#edge-case-2-spec-без-file_changes)

## FR-15: Bug fix plan-gate Phase 2.5 — ALREADY SHIPPED @feature15

Bug fix в `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts` Phase 2.5 — `denyAndExit` принимает `ValidationError[]` объекты, но Phase 2.5 вызывал его с `string[]`. Printer выводил "line undefined: undefined" вместо реального сообщения. Fix — конвертировать array в `[{line: 0, message, hint}]` перед `denyAndExit` (строки 308-311). **Shipped в commit b8a2bca 2026-05-23**.

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15-feature15)
**Use Case:** [Edge case 1](USE_CASES.md#edge-case-1-fail-open)
