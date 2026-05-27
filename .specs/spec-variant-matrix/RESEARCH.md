# Research

## Контекст

Incident driver — Stocktaking MR / Warehouse Transfer (QA Лилия Михайлова, 2026-04-27): спека требовала валидацию stock в 4 местах (USER_STORIES, AC-5, FR-3, RESEARCH.md), реализация — одна строка `formData.warehouseId || undefined` на shared call-site `validateStockForItems`. Из 7 доктайпов в одном (WarehouseTransfer) поле называется `sourceWarehouseId` — `'' || undefined → undefined` → фильтр снят → баг до production. Тесты прошли (enum membership only). QA словил blocker, потратили время на доработку. Класс факапа структурно повторяется → нужна универсальная prevention механизм при составлении спеки.

## Источники

- Cucumber Scenario Outline + Examples — https://cucumber.io/docs/gherkin/reference/
- Reqnroll Gherkin Reference — https://docs.reqnroll.net/latest/gherkin/gherkin-reference.html
- Decision Table Testing Guide (Katalon) — https://katalon.com/resources-center/blog/decision-table-testing-guide
- Decision Table Based Testing (GeeksforGeeks) — https://www.geeksforgeeks.org/software-engineering/decision-table-based-testing-in-software-testing/
- Software Testing: Decision Table (Baeldung) — https://www.baeldung.com/cs/software-testing-decision-table
- Introducing Example Mapping (Matt Wynne, Cucumber) — https://cucumber.io/blog/bdd/example-mapping-introduction/
- Mutation Testing: Missing Safety Net for AI-Generated Code (DEV.to 2026) — https://dev.to/rsri/mutation-testing-the-missing-safety-net-for-ai-generated-code-54kn
- Stryker Mutator (JS/TS/C#) — https://stryker-mutator.io/
- Practical Combinatorial Testing (NIST SP 800-142) — https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-142.pdf
- Specmatic Contract Testing — https://specmatic.io/updates/types-of-contract-testing/
- Pact Consumer Driven Contract Testing — https://docs.pact.io/consumer

## Технические находки

### Cucumber Scenario Outline + Examples — best fit для variant coverage

Стандарт BDD (Gherkin), language-agnostic. Один сценарий параметризуется через таблицу `Examples:`, runner прогоняет сценарий для каждой строки. Уже совместим с проектным BDD-first подходом (memory `feedback_bdd-everywhere.md`). Применимо к Cucumber.js, Reqnroll, SpecFlow, Behave, pytest-bdd, Playwright BDD.

### Decision Tables (ISTQB classical) — для AC documentation

Систематическая enumeration условий → колонки = тест-кейсы. Гарантирует 100% decision coverage. Markdown-table compatible — fits в ACCEPTANCE_CRITERIA.md без extra tooling. Idiomatic для requirements documents.

### Mutation Testing (Stryker/PIT/Mutmut) — complementary post-hoc verifier

Меняет production code, проверяет что тесты ловят. Cited DEV.to article (2026) "Missing Safety Net for AI-Generated Code". Полезно как complement к spec-time prevention, не replacement. Out of scope для v0.1.0 — separate spec.

### NIST ACTS Combinatorial Testing — overkill для single-axis

Generates t-way (pairwise) test sets. Применимо когда ≥2 axes (combinatorial explosion). Наш case — single polymorphic axis (один enumerator), ACTS избыточен.

### Pact / Specmatic Contract Testing — только для cross-service

API contract per consumer/provider. Specmatic explicitly отмечает polymorphic payloads (anyOf/oneOf) как сложную область. Релевантно для API specs, но incident Лилии — in-process call-site, не cross-service.

### Existing dev-pomogator infrastructure mapping

| Existing tool | Coverage | Gap для нашего класса |
|---|---|---|
| `cross-scope-coverage.md` rule | Plan-time multi-scope matrix | Spec-time не enforce-ит — поздно |
| `verify-generic-scope-fix` skill (scope-gate) | Commit-time enum/switch expansion | Не call-site mapping case |
| `requirements-chk-matrix` skill | Phase 2 CHK traceability | Не variant decomposition для polymorphic FRs |
| Phase 3+ Audit (7 categories) | Errors, Logic Gaps, Inconsistency, Rudiments, Fantasies, Undefined Behavior, Jira Drift | Variant coverage gap не покрыт |

## Где лежит реализация

- App-код tools: `tools/specs-generator/variant-matrix/`
- Skill: `extensions/specs-workflow/.claude/skills/variant-matrix-build/`
- Rules: `.claude/rules/specs-workflow/variant-matrix/`
- Wiring: `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` (commandAuditSpec ~line 1611, categoryCount ~line 2676)
- Manifest: `extensions/specs-workflow/extension.json` (version 1.18.0 → 1.19.0)

## Выводы

Top-2 industry methodology (Cucumber Scenario Outline + Decision Tables) применимы universally к любому polymorphism axis. Combination — defense in depth: Decision Table для AC (machine-checkable + human-readable) + Scenario Outline для test execution + per-variant tasks для implementation tracking. Hybrid enforcement: soft Phase 2 hint (skill suggests matrix) + hard Phase 3+ block (audit). Mechanical regex detection без LLM (H2 mitigation). Hard-OUT signals для anti-over-application (H1 mitigation). Escape hatch с reason ≥8 chars (H3 mitigation).

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-layout | `.claude/rules/extension-layout.md` | Rules/skills MUST live в `.claude/` repo root, не `extensions/{ext}/rules\|skills/` | Write/Edit в extensions/*/rules\|skills/ | FR-1, FR-8 (paths) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Manifest = source of truth для апдейтера | Любое изменение extension files | FR-6, FR-8 (manifest registration) |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | В extensions/**/*.ts relative imports MUST использовать .ts extension | TS imports | FR-1, FR-3, FR-6, FR-7 |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Configs через temp file + atomic move | FR-7 (escape log) | NFR-Reliability |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты MUST быть интеграционными | FR-1, FR-6 tests | NFR-Reliability |
| cross-scope-coverage | `.claude/rules/plan-pomogator/cross-scope-coverage.md` | Plan-time scope×variant matrix | Будет extended Step 0 spec-time | FR-3, FR-4, FR-5 |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker tests background, never block | E2E test run | T17 task |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| scope-gate extension | `extensions/scope-gate/` | Architectural mirror: skill + tools + hooks + rules | Template для variant-matrix structure |
| scope-gate hook | `extensions/scope-gate/tools/scope-gate/scope-gate-guard.ts` | Stdin/exit fail-open pattern | Reuse pattern для escape-log helper |
| requirements-chk-matrix skill | `extensions/specs-workflow/.claude/skills/requirements-chk-matrix/SKILL.md` | Phase 2 sub-skill template | Mirror structure для variant-matrix-build SKILL.md |
| specs-generator-core.mjs | `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs:1611` | Audit dispatcher c 7 categories | Insert 8th category dispatch here |
| existing FR/AC regex | `specs-generator-core.mjs:505-520` | `/^##\s+FR-(\d+)[:\s]/` parsers | Reuse в parsers.ts |

### Architectural Constraints Summary

extension-layout rule diktiert чтобы skill жил в `extensions/specs-workflow/.claude/skills/variant-matrix-build/` (sub-skill private к specs-workflow), rules в `.claude/rules/specs-workflow/variant-matrix/` (repo-root namespace). extension-manifest-integrity требует регистрации каждого нового файла в `extension.json` toolFiles/skillFiles/ruleFiles. ts-import-extensions требует `.ts` extension в imports (Node 22.6+ native strip-types compatibility). atomic-config-save — JSONL log writes через atomic O_APPEND.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| H1 over-application — single-incident rule generalizes too aggressively, blocks every multi-variant feature | High | High | Hard-OUT signals в trigger map + threshold-2 + dedicated H1 regression test (T24) на fixture polymorphic-fr-hard-out |
| H2 semantic interpretation drift — detection logic accidentally calls LLM | Medium | High | Pure regex в trigger-phrases.ts, no LLM в detection module; closed list axis nouns |
| H3 escape-hatch gaming — users type `[skip: ok]` everywhere | Medium | Medium | Reason ≥8 chars enforced + JSONL audit log + repeated-reason red flag в escape-hatch-audit.md |
| Cross-extension drift — duplicate regex sets между скalls и audit module | Low | Medium | Single source of truth — все callers import trigger-phrases.ts; T05 unit-тесты verify single module |
