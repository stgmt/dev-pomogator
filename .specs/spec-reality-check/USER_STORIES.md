# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Skill `discovery-forms` auto-populates this file during Phase 1. Hook `user-story-form-guard` enforces the form at Write/Edit time.

### User Story 1: Drift detected before implementation start (Priority: P1)

As a разработчик dev-pomogator, I want чтобы расхождения между документами спеки и реальным кодом ловились автоматически до старта реализации, чтобы не работать против устаревшей спеки и не терять часы на переделку.

**Why:** Реальный инцидент 2026-05-23 — спека `dev-pomogator-canonical-plugin` ссылалась в FILE_CHANGES.md на 3+ несуществующих файла (`bin/postinstall.js`, `src/installer/install-user-scope.ts`, `src/installer/git-exclude.ts`); это вскрылось только при ручной проверке после нескольких часов планирования. Без автомата эта проверка не делается.

**Independent Test:** Запустить `npx tsx .claude/skills/spec-reality-check/scripts/verify.ts .specs/dev-pomogator-canonical-plugin --format json` — output должен содержать ≥3 findings severity=ERROR check=FC_EDIT_MISSING с указанными file paths.

**Acceptance Scenarios:**

Given спека с FILE_CHANGES.md row `action=edit` на путь несуществующий в репозитории
When запущен verify.ts
Then output содержит finding `FC_EDIT_MISSING` severity=ERROR с file path в `details`

Given спека где все FILE_CHANGES пути соответствуют реальности
When запущен verify.ts
Then output содержит 0 findings severity=ERROR

---

### User Story 2: Auto-trigger on all four spec lifecycle operations (Priority: P1)

As an AI агент работающий со специациями, I want чтобы skill сам запускался когда я собираюсь создавать, изменять, дополнять или реализовывать спеку, чтобы не упустить расхождения видные грепом и не задавать одни и те же ручные проверки каждый раз.

**Why:** Пользователь явно сказал "тригерился сам когда надо тебе". Manual invocation пропускается в edge case (агент забыл вспомнить про audit-spec.ts). Description matching покрывает 4 lifecycle-операции: create / modify / supplement / implement плюс explicit triggers ("проверь спеку", "verify spec").

**Independent Test:** В свежей сессии Claude Code написать "реализуй спеку spec-workflow-md-validation" — session log должен содержать `Skill("spec-reality-check")` invocation в первых 10 ходах.

**Acceptance Scenarios:**

Given пользователь пишет запрос содержащий триггер любой lifecycle-операции (создай/измени/дополни/реализуй спеку)
When AI обрабатывает запрос
Then skill `spec-reality-check` auto-invokes ДО того как AI начнёт соответствующую operation

Given в SKILL.md description содержатся EN+RU триггеры всех 4 lifecycle-операций
When skill registry загружается Claude Code-ом
Then description matching катит на каждом из 4 типов запросов

---

### User Story 3: PreToolUse hook blocks ExitPlanMode on drift (Priority: P1)

As a maintainer dev-pomogator, I want механически блокировать ExitPlanMode когда план ссылается на спеку с drift, чтобы AI не мог обойти проверку даже если description matching сработал нестабильно.

**Why:** Description matching — модельно-зависимый механизм, недетерминистический. PreToolUse hook даёт mechanical guarantee. Два независимых механизма — двойная защита от ошибки одного из них.

**Independent Test:** Запустить test fixture план содержащий `.specs/dev-pomogator-canonical-plugin/` ссылку через ExitPlanMode hook; ожидаем `permissionDecision: "deny"` с конкретным findings list в `permissionDecisionReason`.

**Acceptance Scenarios:**

Given план содержит references на `.specs/{slug}/` где spec-reality-check найдёт ≥1 finding severity=ERROR
When AI вызывает ExitPlanMode tool
Then PreToolUse hook возвращает JSON `{hookSpecificOutput: {permissionDecision: "deny", permissionDecisionReason: "<findings>"}}`

Given hook сам падает с unhandled exception (git недоступен, парсинг сломан)
When AI вызывает ExitPlanMode
Then hook эмитит warning в stderr AND permits ExitPlanMode (fail-open per pomogator-doctor convention)

---

### User Story 4: Integration into spec-review category 15 (Priority: P1)

As a ревьюер запускающий spec-review перед каждым ConfirmStop, I want видеть category 15 "Reality Drift" в общем review report, чтобы все типы pre-stop проверок были на одной поверхности и не приходилось помнить отдельный skill.

**Why:** Существующий spec-review уже агрегирует 14 категорий. Добавление как 15-й категории даёт единый user-facing surface; ERROR/WARNING/INFO маппятся на existing P0/P1/P2 severity scale spec-review.

**Independent Test:** Запустить `Skill("spec-review")` на спеке с drift; output должен содержать секцию `## Category 15: Reality Drift` с findings и severity mapping.

**Acceptance Scenarios:**

Given spec-review pipeline доходит до pre-stop check
When workflow выполняет step "Category 15"
Then spec-review invokes `Skill("spec-reality-check")` AND включает findings в общий report с severity ERROR→P0, WARNING→P1, INFO→P2

---

### User Story 5: Integration into create-spec Phase 3 Finalization (Priority: P1)

As a spec-author создающий новую спеку, I want чтобы Phase 3 Finalization сам проверил FILE_CHANGES paths перед ConfirmStop, чтобы drift не возникал в новых спеках на стадии создания (preventative, не curative).

**Why:** spec-review запускается перед ConfirmStop любой фазы — но он может catch drift который уже существует. create-spec Phase 3 integration делает то же на этапе scaffold-а новой спеки — drift не появляется изначально.

**Independent Test:** Запустить `Skill("create-spec")` workflow, дойти до Phase 3 ConfirmStop; в session log должен быть видимый `Skill("spec-reality-check")` invocation перед confirm.

**Acceptance Scenarios:**

Given create-spec workflow на Phase 3 Finalization шаге validation перед ConfirmStop
When workflow завершает scaffold tasks
Then `Skill("spec-reality-check")` invokes автоматически

Given spec-reality-check returns ERRORs во время Phase 3 validation
When AI пытается ConfirmStop Finalization
Then Phase 3 не confirm-ится пока drift не починен в spec docs

---

### User Story 6: Three output formats (JSON / human / markdown) (Priority: P2)

As a CI script / interactive user / report generator, I want три формата вывода findings (JSON для машинного потребления, human с цветами для интерактивного чтения, markdown для report files), чтобы один skill служил всем consumer scenarios без дублирования.

**Why:** JSON нужен hook'у и spec-review aggregation; human нужен dev'у при manual invocation; markdown нужен для REALITY_CHECK_REPORT.md и git-committed reports.

**Independent Test:** Запустить `verify.ts <spec> --format json` / `--format human` / `--format markdown` на одной спеке; каждый output структурно валиден per формат.

**Acceptance Scenarios:**

Given verify.ts вызвана с `--format json`
When skill завершается
Then stdout содержит valid JSON парсимый через `JSON.parse` со shape `AuditFinding[]`

Given verify.ts вызвана с `--format human`
When skill завершается
Then stdout содержит ANSI-colored output через chalk package с file:line clickable references

Given verify.ts вызвана с `--format markdown`
When skill завершается
Then stdout содержит валидную markdown table со столбцами Check / Severity / File / Message / Suggested fix
