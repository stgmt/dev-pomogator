# Use Cases

## UC-1: Happy path — drift detected before implementation

Пользователь/AI решил реализовать существующую спеку. Skill ловит drift до того как реализация началась, AI чинит drift в spec docs, потом продолжает реализацию.

- AI читает запрос "реализуй спеку canonical-plugin" (или любой другой lifecycle-триггер)
- skill `spec-reality-check` auto-invokes через description matching
- запускается `verify.ts .specs/dev-pomogator-canonical-plugin --format human`
- output показывает findings (3+ ERRORs FC_EDIT_MISSING на несуществующие файлы)
- AI приостанавливает реализацию, чинит FILE_CHANGES.md paths в спеке
- повторный verify → 0 ERRORs
- AI продолжает к Phase 0 implementation

Связан с US-1, US-2.

## UC-2: PreToolUse hook denies ExitPlanMode на drift

AI написал план implementation который ссылается на спеку с drift. ExitPlanMode попадает в hook, hook блокирует.

- AI пишет план в plan file, упоминает `.specs/{slug}/` в File Changes / Implementation Plan
- AI вызывает ExitPlanMode tool
- PreToolUse hook `verify-hook.ts` читает stdin JSON, извлекает spec slug
- запускается `verify.ts <spec-path> --format json`
- агрегирует findings; если ≥1 ERROR → output `{hookSpecificOutput: {permissionDecision: "deny", permissionDecisionReason: "<formatted findings>"}}`
- AI читает feedback, чинит план или спеку, повторяет ExitPlanMode

Связан с US-3.

## UC-3: Manual invocation через "проверь спеку"

Пользователь хочет провести pre-flight check на конкретной спеке без планирования implementation.

- User: "проверь готова ли спека canonical-plugin к реализации"
- skill auto-triggers по description match (триггер "проверь спеку")
- AI запускает `verify.ts .specs/dev-pomogator-canonical-plugin --format human`
- output выводится в чат как human-readable report
- AI комментирует findings, предлагает фиксы

Связан с US-2, US-6.

## UC-4: Negative test на shipped spec (clean baseline)

Pre-prod validation что skill не даёт false-positives на корректной shipped спеке.

- запуск `verify.ts .specs/spec-workflow-md-validation` (известно shipped 0 ERRORs)
- output: `findings: []` или только cosmetic WARNs (count ≤5)
- exit code 0
- проверяет что skill не over-triggers на чистых спецах

Связан с US-1, US-4.

## UC-5: Cleanup canonical-plugin spec после shipping skill

После того как skill готов — прогоняем его на спеке canonical-plugin для cleanup её drift.

- запускается `verify.ts .specs/dev-pomogator-canonical-plugin --format markdown`
- output сохраняется в `.specs/dev-pomogator-canonical-plugin/REALITY_CHECK_REPORT.md`
- для каждого ERROR finding — обновляются spec docs (`FILE_CHANGES.md`, `FR.md`)
- повторный run → 0 ERRORs
- разблокирует canonical-plugin Phase 0 implementation

Связан с US-1, US-4.

## UC-6: spec-review category 15 integration

spec-review skill при pre-stop check включает category 15 "Reality Drift" в общий report.

- запускается `Skill("spec-review")` перед ConfirmStop Discovery/Requirements/Finalization
- spec-review pipeline доходит до Category 15 шага
- invokes `Skill("spec-reality-check")` для current spec slug
- парсит JSON findings
- маппит severity ERROR→P0, WARNING→P1, INFO→P2
- включает в общий 15-категорийный report

Связан с US-4.

## UC-7: create-spec Phase 3 Finalization preventative check

create-spec workflow на Phase 3 Finalization step "validation" перед ConfirmStop Finalization сам вызывает spec-reality-check.

- workflow завершает scaffold tasks (TASKS.md, FILE_CHANGES.md, README.md)
- step "validation" перед ConfirmStop Finalization
- workflow invokes `Skill("spec-reality-check")` на текущей spec
- если ERRORs — Phase 3 не confirm-ится пока drift не починен в spec docs
- preventative: drift не возникает в новых спецах

Связан с US-5.

## Edge case 1: Fail-open на exception в hook

- hook `verify-hook.ts` падает с unhandled exception (например, git binary не найден на пути)
- exception caught в outer try/catch
- `console.error("[spec-reality-check] hook execution failed: ...")` в stderr
- output JSON НЕ содержит deny — permits ExitPlanMode
- AI не блокируется broken hook'ом

Связан с US-3 acceptance scenario 2.

## Edge case 2: Spec без FILE_CHANGES.md (rare)

- `.specs/{slug}/` существует но FILE_CHANGES.md отсутствует
- verify.ts читает spec dir
- FC checks skip с INFO finding "FILE_CHANGES.md not found, skipping FC checks"
- narrative + code-drift + TASKS↔FC checks продолжают если их источники есть
- exit 0 — не crash

Связан с US-2 (universality across spec states).

## Edge case 3: `.git/` отсутствует (Docker test env)

- verify запускается в Docker test environment где `.dockerignore` исключает `.git/`
- code-drift check (`git log -S "FR-N"`) падает с ENOENT
- check skip с INFO finding "git unavailable, code-drift check skipped"
- остальные 5 checks работают
- exit 0

Связан с US-1 (Docker compatibility per `docker-no-git-repo` rule).
