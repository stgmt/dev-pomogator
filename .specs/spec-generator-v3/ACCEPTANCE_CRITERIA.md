# Acceptance Criteria (EARS)

## AC-1 (FR-1): discovery-forms skill populates USER_STORIES + Risk Assessment @feature1

**Требование:** [FR-1](FR.md#fr-1-discovery-forms-skill-feature1)

WHEN `Skill("discovery-forms")` invoked в v3 spec AND USER_STORIES.md пустой THEN system SHALL заполнить ≥1 User Story блок с Priority+Why+IT+AC AND записать Risk Assessment table в RESEARCH.md с ≥2 строк.

## AC-2 (FR-2): requirements-chk-matrix generates CHK + Key Decisions @feature2

**Требование:** [FR-2](FR.md#fr-2-requirements-chk-matrix-skill-feature2)

WHEN `Skill("requirements-chk-matrix")` invoked AND FR.md содержит FR-1..FR-N THEN system SHALL сгенерить N или более CHK rows в REQUIREMENTS.md AND populate DESIGN.md Key Decisions секцию с ≥1 block с Rationale/Trade-off/Alternatives.

## AC-3 (FR-3): task-board-forms enriches tasks + Summary Table @feature3

**Требование:** [FR-3](FR.md#fr-3-task-board-forms-skill-feature3)

WHEN `Skill("task-board-forms")` invoked AND TASKS.md содержит M task blocks THEN system SHALL обогатить каждый task с Done When (≥1 checkbox) + Status + Est AND inject Task Summary Table в начало файла между `<!-- auto-generated -->` markers.

## AC-4 (FR-4): user-story-form-guard denies missing fields @feature4

**Требование:** [FR-4](FR.md#fr-4-user-story-form-guardts-hook-feature4)

WHEN Write USER_STORIES.md в v3 spec AND content содержит `### User Story 1:` без `(Priority: P1|P2|P3)` THEN hook SHALL exit 2 AND emit JSON `hookSpecificOutput.permissionDecision: 'deny'` AND stderr содержит actionable fix AND stderr does NOT mention "SPEC_FORM_GUARDS_DISABLE".

## AC-5 (FR-9): migration guard passes existing specs @feature5

**Требование:** [FR-9](FR.md#fr-9-migration-guard-feature5)

WHEN Write USER_STORIES.md в `.specs/{slug}/` где `.progress.json` не существует OR `.progress.json.version < 3` THEN hook SHALL exit 0 regardless of content AND audit log has `ALLOW_AFTER_MIGRATION` entry.

## AC-6 (FR-10): fail-open на exception @feature5

**Требование:** [FR-10](FR.md#fr-10-fail-open-feature5)

WHEN hook receives malformed stdin OR parser throws exception THEN `main().catch()` SHALL exit 0, non-blocking AND audit log has `PARSER_CRASH` entry with error message.

## AC-7 (FR-11): meta-guard blocks form-guard removal @feature7

**Требование:** [FR-11](FR.md#fr-11-extension-json-meta-guardts-hook-feature7)

WHEN Write/Edit `extension.json` AND diff удаляет any form-guard entry из `hooks.PreToolUse` THEN meta-guard SHALL exit 2 AND stderr содержит `Meta-guard: cannot remove form-guards from manifest without human review`. WHEN diff добавляет новый entry OR сохраняет существующие — meta-guard SHALL exit 0.

## AC-8 (FR-12): audit-logger appends with ISO timestamp @feature8

**Требование:** [FR-12](FR.md#fr-12-audit-log-feature8)

WHEN любой form-guard (6 штук) DENY-ит OR ALLOW-ит OR fail-open-ится THEN event SHALL append к `~/.dev-pomogator/logs/form-guards.log` format `{ISO-8601}Z {DENY|ALLOW_VALID|ALLOW_AFTER_MIGRATION|PARSER_CRASH} {hookName} {filepath} {reason}`.

## AC-9 (FR-13): UserPromptSubmit summary counts @feature8

**Требование:** [FR-13](FR.md#fr-13-userpromptsubmit-summary-feature8)

WHEN UserPromptSubmit hook validate-specs.ts выполняется AND лог form-guards.log содержит события за 24ч THEN system SHALL вывести summary строку `📊 Form guards (24h): X DENY, Y PARSER_CRASH ({hooks}), Z ALLOW_AFTER_MIGRATION`. IF log пуст OR only ALLOW_VALID events THEN summary skipped silently.

## AC-10 (FR-14): spec-status task-table renders markdown @feature3

**Требование:** [FR-14](FR.md#fr-14-spec-statusts-task-table-format-feature3)

WHEN `spec-status.ts -Format task-table -Path .specs/foo` invoked AND TASKS.md содержит task blocks THEN stdout SHALL valid markdown table с row per task AND repeated invocation SHALL produce identical output (idempotent).
