# Phase 3: Finalization

**Файлы:** TASKS.md, README.md, CHANGELOG.md
**Цель:** Сгенерировать TDD-структурированный план задач + overview/changelog. После STOP #3 автоматически запускается Phase 3+ Audit.

## Step 0 (Jira-mode)

Если `JIRA_SOURCE.md` присутствует (проверка через `list_spec_docs({spec})`; MCP-rails, не raw `ls`) — выполнить Step 0 из [`jira-mode.md`](jira-mode.md) для Phase 3: reproduction steps → mapping к implementation tasks (порядок tasks отражает порядок видео); error evidence → каждый task содержит `_Jira: <file>:<line>_`; directives enumeration → каждый scope-member-FR имеет green-task с `_Jira:_` reference.

**Каждая task в TASKS.md ОБЯЗАНА содержать `_Jira:_` строку** в теле блока (в пределах 20 строк после `### 📋 \`task-id\``). Format — см. [`jira-mode.md`](jira-mode.md).

## Алгоритм

0a. **Сначала построить acceptance-to-delivery coverage plan** для high-risk AC (FR-65):

   ```bash
   node tools/specs-generator/acceptance-task-coverage.mjs --spec ".specs/{feature}" --format json
   ```

   Для каждого найденного AC задача обязана ссылаться на сам `AC-N.N` (одной `_Requirements: FR-N_` недостаточно) и владеть всеми возвращёнными lanes: implementation/source mapping, contract regression, compatibility/UX/redaction decisions, auth/paid outcomes и semantic live status/content-type/body evidence. Если implementation surface пока неизвестен — создать AC-linked `Status: BLOCKED` investigation task; Finalization остаётся красной, пока investigation не превращена в конкретные implementation/test/evidence tasks. Повторить analyzer после заполнения TASKS.md; `ok: false` блокирует STOP #3.

1. **Заполнить TASKS.md по TDD-порядку**, затем на шаге 1b **вызвать `Skill("task-board-forms")`** — skill добавляет `**Done When:**` блок + `Status:` + `Est:` per task и регенерирует `## Task Summary Table` в начале файла через `spec-status.ts -Format task-table`. Hook `task-form-guard` блокирует TASKS.md без Done When/Status/Est (Phase -1 relaxed).

   **Step 1c: Optional strong-tests recommendation for test items** (compositional hint).

   После того как `task-board-forms` пополнил TASKS.md — AI SHALL grep TASKS.md по pattern `/write test|implement test|test for FR|add test scenario|test case for|test coverage|create.*test/i`. Если matches found — emit informational note в spec output (НЕ блокирует Phase 3, НЕ enforcement):

   ```
   ✅ Phase 3 completed: task-board-forms populated TASKS.md.

   💡 TASKS.md contains N test implementation items. When implementing those tests:
   - Invoke `Skill("strong-tests")` for invariant suggestions (cardinality / uniqueness / conservation / etc)
   - Use 12-point self-eval (mutation gutcheck, assertion specificity, negative:positive ratio ≥ 1:2)
   - Reference `.claude/skills/strong-tests/SKILL.md` §6 Greenfield mode for test scaffolding

   Why this matters: Coverage % alone не proof of test strength. Per Schäfer et al. arXiv 2406.18181,
   34-62% of LLM-generated tests are syntactically invalid; 75% of undetected defects stem from missing inputs.
   ```

   **Skip condition:** если TASKS.md НЕ содержит test items — этот hint skip (некоторые spec workflows покрывают только refactoring или infra, тестовые items появляются только при new feature work).

   **Why not enforced:** test extension может не быть установлен в target repo (per `.dev-pomogator/installed-extensions.json` selection). Recommendation soft-fails, не блокирует workflow.

   **Step 1d: Вызвать `Skill("cross-spec-reconcile")` (mode=light)** (FR-17) — повторный дешёвый mechanical проход на финализации (спека уже наполнена): file existence, terminology drift, RUNTIME_IDENTIFIER_DRIFT. Ловит расхождения с другими спеками + дрейф spec↔impl до STOP. CRITICAL hard-conflict subset → блокирующий AskUserQuestion; WARNING/INFO → `<system-reminder>`. Полный full-mode (LLM-semantic) — в Phase 3+ Audit (категория `CROSS_SPEC_CONSISTENCY`, см. `phase3plus_audit-cross-spec-consistency.md`).

   Структура TASKS.md:

   - **Phase -1 (Infrastructure):** Если DESIGN.md упоминает БД, docker, .env, secrets — добавить Phase -1: Infrastructure Prerequisites. Env vars пометить `[VERIFIED: source]`.
   - **Phase 0 (Red):** `.feature` файл + step definitions + hooks (заглушки) — ПЕРВЫЕ задачи. Все сценарии должны FAIL до реализации.
   - **Phase 1-N (Green):** Реализация бизнес-логики, где каждая группа задач привязана к `@featureN` сценариям.
   - **Последний Phase (Refactor):** Рефакторинг + финальная верификация всех сценариев.

   Правила:
   - Каждая задача реализации ОБЯЗАНА ссылаться на `@featureN` сценарий
   - Каждый Phase завершается verify-шагом: "сценарии `@featureN` переходят из Red в Green"
   - **Config dedup:** Задачи ССЫЛАЮТСЯ на секции DESIGN.md для конфигов, НЕ копируют блоки конфигов дословно. Формат: `_Config: см. DESIGN.md секция "..."_`

   **Phase 0 hooks enforcement (ОБЯЗАТЕЛЬНО):**
   - Если DESIGN.md содержит `TEST_DATA_ACTIVE` → Phase 0 ОБЯЗАН содержать:
     - Задачу для **каждого** hook из DESIGN.md секции "Новые hooks"
     - Задачу для **каждого** fixture из DESIGN.md секции "Test Data & Fixtures"
   - Формат hook-задачи: `- [ ] Создать hook: {путь} ({тип}, {scope}) — cleanup для {данные}`
     `_Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_`
   - Если DESIGN.md содержит `TEST_DATA_NONE` → hook-задачи не нужны
   - Если Phase 0 не содержит hook-задач при TEST_DATA_ACTIVE → ОШИБКА, исправить

   **Phase 0 bootstrap block (если framework not installed):**
   Если `Framework=null` в DESIGN.md BDD Test Infrastructure → Phase 0 ОБЯЗАН содержать 3 task в строгой последовательности (см. [`bdd-enforcement.md`](bdd-enforcement.md)): `install-bdd-framework` → `bootstrap-bdd-hooks` → `bootstrap-bdd-fixtures-config`. Все implementation tasks (Phase 1+) ОБЯЗАНЫ содержать `_depends: bootstrap-bdd-fixtures-config_`.

2. **Сгенерировать README.md** (Краткое описание + Ключевые идеи + Где лежит реализация + Где читать дальше).

3. **Independent Adversarial Review — обязательный отдельный контекст (#153).** После полного FR/AC/DESIGN/TASKS/BDD draft и до `Spec ready` автор фиксирует свой `author_run_id`, затем dispatches a **fresh reviewer agent/context**. Автор НЕ вызывает `Skill("spec-review")` сам для выполнения этой фазы и НЕ может принять собственный verdict.

   Reviewer получает user request, текущий draft diff и repository evidence — но не hidden author rationale. Он сначала выдаёт findings severity-descending (P0→P3), проверяя actual target code/API contracts/routes/data ownership/test tooling/runtime constraints: compatibility, source-of-truth, metrics, auth/IDOR/secrets, query bounds/N+1, executable BDD, response envelopes, scope creep and unstated product decisions. Каждый repository-dependent finding имеет `{ evidence: { file, line } }`; при unavailable evidence reviewer writes `unverified_blocker: true`.

   Reviewer записывает через MCP-door `.specs/{feature}/ADVERSARIAL_REVIEW.md`: machine JSON record inside `<!-- adversarial-review … -->` with schema `adversarial-review@1`, `reviewed_spec_sha256`, distinct `author_run_id`/`reviewer_run_id`, `reviewer_execution: "independent-agent"`, capability, round (1–3), findings, P2 waivers, resolution evidence, verdict and residual risks. No findings is valid only as `findings: []` plus explicit `residual_risks`.

   P0/P1 block; P2 needs `RESOLVED` or `WAIVED` with non-empty `waiver.approved_by` and `waiver.rationale`; P3 may remain backlog. After each remediation rerun the independent reviewer against the new diff. Maximum three rounds: unresolved issues after round 3 are surfaced to the user, never downgraded or looped silently. Missing reviewer capability/repository evidence/artifact fails closed.

4. **Финальная валидация** — ТРИ уровня (FR-37a/d + #153):
   - pre-filter: `validate-spec.ts -Path ".specs/{feature}"` — 0 errors (структура/ссылки);
   - **вердикт**: `npx tsx tools/specs-generator/spec-verdict.ts -Path ".specs/{feature}" --no-semantic` —
     GREEN, including the mandatory `INDEPENDENT_REVIEW` lane;
   - `ADVERSARIAL_REVIEW.md` digest MUST equal the current draft. A changed spec, missing artifact, self-authored review, unresolved P0/P1, invalid P2 waiver, or unavailable evidence leaves readiness RED.

   Голый «validate-spec: 0 errors» НЕ репортится как «спека валидна» — это pre-filter, не здоровье.

## Правила TDD-порядка в TASKS.md

- `.feature`, step definitions, и hooks — ВСЕГДА Phase 0 (первые задачи)
- Зависимости реализации: implementation задачи зависят от Phase 0
- Каждая implementation задача содержит `@featureN` тег
- Каждый Phase содержит verify-шаг (Red→Green проверка)
- Рефакторинг — ПОСЛЕДНИЙ Phase (после всех Green)

## STOP #3

`spec-status.ts -ConfirmStop Finalization` independently validates the current review artifact before mutating `.progress.json`; it refuses the transition on every red `INDEPENDENT_REVIEW` state. Implementation handoff is therefore prohibited until this command succeeds.

Финальный отчёт со summary (Executive Summary с key decisions Phase 3).

После подтверждения:

```
tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Finalization
```

## Next phase (автоматически)

После STOP #3 АВТОМАТИЧЕСКИ запускается Phase 3+ Audit — см. [`phase3plus_audit-overview.md`](phase3plus_audit-overview.md). Это НЕ STOP-точка — пользователь уже дал подтверждение на STOP #3.
