# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).

### User Story 1: AI agent detects polymorphic FR at spec time (Priority: P1)

As an AI agent composing a feature spec, I want the system to automatically detect when an FR describes shared-pipeline polymorphic dispatch, чтобы variant matrix не пропускалась в тасках и тестах.

**Why:** Incident Stocktaking MR / Warehouse Transfer 2026-04-27 — спека требовала валидацию stock в 4 местах, но agent не построил матрицу `вариант × поле`, в результате тесты прошли зелёные а реализация имела пробел для одного из 7 доктайпов. Прямые потери времени на доработку blocker-а.

**Independent Test:** Run `audit-spec.ts -Path .specs/<spec-with-polymorphic-FR-no-matrix>` — assert finding с category VARIANT_COVERAGE emit-нут.

**Acceptance Scenarios:**

Given agent пишет FR содержащую фразу "validation runs for each adapter"
When detection module trigger-phrases.ts сканирует FR.md
Then detection SHALL flag FR as polymorphic с указанием matched phrase + line number

---

### User Story 2: Per-variant tasks в TASKS.md (Priority: P1)

As a developer реализующий фичу, I want видеть в TASKS.md задачу на верификацию call-site mapping для каждого варианта, чтобы не повторился факап с `formData.X || undefined` shadowing missing field.

**Why:** Без явных per-variant задач в TASKS.md разработчик имплементит shared codepath один раз, тесты проверяют enum membership, и баг для одного из вариантов уезжает в production.

**Independent Test:** Manual review TASKS.md после Phase 2 — для polymorphic FR должны быть задачи с tracer `_Variant: {axis}={value}_` per variant row.

**Acceptance Scenarios:**

Given polymorphic FR enumerates 5 doctype variants
When skill variant-matrix-build executes Phase 2 step 4c
Then TASKS.md SHALL contain 5 atomic tasks (one per variant) with `@featureN` tag и tracer line

---

### User Story 3: Gherkin Examples для QA review (Priority: P2)

As a QA reviewer, I want что .feature файл содержал Scenario Outline с Examples-таблицей вариантов, чтобы тесты автоматом прогнались для каждого variant без manual scenario duplication.

**Why:** Manual scenario duplication приводит к drift between variants. Gherkin Examples table — стандартный mechanism для variant coverage в BDD.

**Independent Test:** Open .feature file в QA review — assert `Scenario Outline` block с `Examples:` table containing variant rows matching AC Decision Table.

**Acceptance Scenarios:**

Given AC Decision Table содержит 5 variant rows
When skill emits .feature artifact
Then .feature SHALL contain Scenario Outline + Examples block с 4 covered rows (1 OUT_OF_SCOPE skipped)

---

### User Story 4: Audit blocks STOP #3 при пробеле (Priority: P1)

As a product owner, I want что AUDIT_REPORT.md показывал какие polymorphic FRs не покрыты variant matrix, чтобы знать готовность спеки до Implementation kick-off.

**Why:** Если matrix incomplete не блокирует переход в Implementation — feature shipped с covered gap (повторение incident Лилии).

**Independent Test:** Run audit on spec без matrix → spec-status.ts -ConfirmStop Audit refuses advancement.

**Acceptance Scenarios:**

Given polymorphic FR-3 lacks AC Decision Table
When audit-spec.ts runs Phase 3+ Audit
Then category VARIANT_COVERAGE SHALL emit finding с severity WARNING
And spec-status.ts -ConfirmStop Audit SHALL refuse advancement

---

### User Story 5: Hard-OUT signals предотвращают over-application (Priority: P1)

As an AI agent, I want что detection НЕ срабатывало на single-variant FRs (FR explicitly scoped к одному варианту), чтобы prevention rule не превратился в noise.

**Why:** Single-incident rule generalizes too aggressively → blocks every multi-variant feature → users learn to escape-hatch every commit → gate becomes useless. Mirror H1 risk из memory `feedback_single-incident-rules-over-generalize.md`.

**Independent Test:** Fixture polymorphic-fr-hard-out (FR с "только для warehouse-transfer") → audit emit zero VARIANT_COVERAGE findings.

**Acceptance Scenarios:**

Given FR.md содержит "validate format только для receiving"
When detection module sсканирует FR
Then detection SHALL skip (hard-OUT word "только" wins over polymorphic-trigger)
And audit SHALL emit zero findings
