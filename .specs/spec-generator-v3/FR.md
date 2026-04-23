# Functional Requirements (FR)

## FR-1: `discovery-forms` skill @feature1

Skill в `extensions/specs-workflow/.claude/skills/discovery-forms/SKILL.md` SHALL при вызове заполнить `.specs/{slug}/USER_STORIES.md` блоками `### User Story N (Priority: P1|P2|P3)` + `**Why:**` + `**Independent Test:**` + `**Acceptance Scenarios:**` (inline Given/When/Then). SHALL also append `## Risk Assessment` с ≥2 строк в `.specs/{slug}/RESEARCH.md`. Description anti-pushy без trigger-фраз.

## FR-2: `requirements-chk-matrix` skill @feature2

Skill SHALL parse FR.md + ACCEPTANCE_CRITERIA.md → сгенерить CHK matrix в REQUIREMENTS.md (columns: CHK-ID, Requirement, Traces To, Verification Method, Status, Notes) с ID format `CHK-FR{n}-{nn}`. SHALL append Verification Process + Summary Counts секции. SHALL populate `## Key Decisions` в DESIGN.md с Decision/Rationale/Trade-off/Alternatives (≥2 alternatives per decision).

## FR-3: `task-board-forms` skill @feature3

Skill SHALL enrich TASKS.md — add `**Done When:**` с ≥1 checkbox per task, `Status: TODO|IN_PROGRESS|DONE|BLOCKED` + `Est: <minutes>` inline per task. SHALL invoke `spec-status.ts -Format task-table` → inject Task Summary Table в начало TASKS.md (idempotent, between `<!-- auto-generated -->` delimiters).

## FR-4: `user-story-form-guard.ts` hook @feature4

PreToolUse hook SHALL on Write|Edit USER_STORIES.md в v3 specs проверить наличие Priority+Why+IT+AC в каждом `### User Story`. At violation — exit 2 + JSON deny + actionable hint.

## FR-5: `task-form-guard.ts` hook @feature4

PreToolUse hook SHALL on Write|Edit TASKS.md в v3 specs проверить `**Done When:**` + ≥1 checkbox + `Status:` + `Est:` per task. At violation — exit 2 + hint (Phase -1 tasks relaxed to WARN only).

## FR-6: `design-decision-guard.ts` hook @feature4

PreToolUse hook SHALL on Write|Edit DESIGN.md проверить каждый `### Decision:` имеет Rationale + Trade-off + Alternatives (≥2 bullets). Файлы без `### Decision:` pass.

## FR-7: `requirements-chk-guard.ts` hook @feature4

PreToolUse hook SHALL validate CHK rows в REQUIREMENTS.md: ID matches `^CHK-FR\d+-\d{2}$`, Traces To references FR+(AC|@feature|UC), Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A}, Status ∈ {Draft, In Progress, Verified, Blocked}.

## FR-8: `risk-assessment-guard.ts` hook @feature4

PreToolUse hook SHALL at `## Risk Assessment` heading validate ≥2 non-placeholder rows с Likelihood ∈ {Low, Medium, High}, Impact ∈ {Low, Medium, High}, Mitigation non-empty.

## FR-9: Migration guard @feature5

All form-guard hooks SHALL на входе читать `.progress.json.version` через helper `getProgressVersion()` → if `< 3` or `null` → immediate exit 0 + audit log `ALLOW_AFTER_MIGRATION`. Guarantees zero impact on existing 30+ specs.

## FR-10: Fail-open @feature5

All form-guard hooks SHALL wrap `main()` в `.catch(() => logEvent('PARSER_CRASH', ...); exit(0))`. TTY mode (`process.stdin.isTTY`) → immediate exit 0.

## FR-11: `extension-json-meta-guard.ts` hook @feature7

Шестой PreToolUse hook SHALL on Write|Edit `extensions/specs-workflow/extension.json` (либо installed `.claude/settings.local.json`) проверять что `hooks.PreToolUse` array содержит ВСЕ 6 form-guards + phase-gate + meta-guard сам. IF diff удаляет любой protected form-guard entry THEN exit 2 + message "Meta-guard: cannot remove form-guards from manifest without human review". НЕТ env var bypass. Additive changes (new unrelated hooks) allowed.

## FR-12: Audit log @feature8

Все 6 hooks + validator SHALL append-only писать события в `~/.dev-pomogator/logs/form-guards.log` формат `{timestamp}Z {event} {hook} {filepath} {reason}`. События: `DENY` (блокировка), `ALLOW_AFTER_MIGRATION` (v1/v2 pass-through), `ALLOW_VALID` (проверка пройдена), `PARSER_CRASH` (fail-open). Log retention — 30 дней + 10MB cap, rotation через `validate-specs.ts`.

## FR-13: UserPromptSubmit summary @feature8

`validate-specs.ts` UserPromptSubmit hook SHALL при каждом prompt читать `~/.dev-pomogator/logs/form-guards.log` за последние 24ч AND вывести summary: `📊 Form guards (24h): N DENY, M PARSER_CRASH ({hooks}), K ALLOW_AFTER_MIGRATION`. Silent skip если log пуст или только ALLOW_VALID events.

## FR-14: spec-status.ts task-table format @feature3

`spec-status.ts -Format task-table -Path .specs/{slug}` SHALL output markdown table `| ID | Title | Status | Depends | Phase | Est. |` parsing existing TASKS.md blocks (both bullet and `### 📋` heading formats). Idempotent.

## FR-15: specs-management.md workflow update @feature6

Rule SHALL document Skill invocation points: Phase 1 step 3 → `discovery-forms`; Phase 2 step 4b → `requirements-chk-matrix`; Phase 3 step 1b → `task-board-forms`.

## FR-16: extension.json manifest update @feature6

`extensions/specs-workflow/extension.json` SHALL include 3 new skills in `skills` + `skillFiles`, 8 new toolFiles в `specs-validator` (5 form-guards + meta-guard + audit-logger + spec-form-parsers), hooks в array-of-groups format per `installer-hook-formats.md`.
