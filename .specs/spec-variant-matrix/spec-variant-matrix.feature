Feature: spec-variant-matrix

  # Migrated to traceable BDD (FR-51). Each scenario drives the REAL variant-matrix engine
  # (tools/specs-generator/variant-matrix/) in-process — no mock, no inline copy. Step
  # definitions: tests/step_definitions/feature_spec_variant_matrix.ts. The 17 vitest tests
  # in tests/e2e/specs-generator-variant-matrix.test.ts are preserved here 1:1, grouped under
  # the @feature1..@feature9 tags, plus an exactly-8-char escape boundary and FR-8/FR-9 artifacts.

  @feature1
  Scenario: FR-1 — EN polymorphic trigger flags an FR via mechanical regex
    Given FR.md fixture `polymorphic-fr-no-matrix/` загружен для detectPolymorphicFRs
    When запущен detectPolymorphicFRs над содержимым FR.md
    Then detectPolymorphicFRs возвращает ровно 1 polymorphic FR с hardOut=false и >=2 triggers

  @feature1
  Scenario: FR-1 — RU polymorphic trigger flags an FR (bilingual)
    Given FR.md fixture `polymorphic-fr-ru-mixed/` загружен для detectPolymorphicFRs
    When запущен detectPolymorphicFRs над содержимым FR.md
    Then среди triggers detectPolymorphicFRs есть RU фраза (для каждого|переиспользуем|общая)

  @feature2
  Scenario: FR-2 — Hard-OUT signal marks the FR hardOut=true (H1 anti-over-application)
    Given FR.md fixture `polymorphic-fr-hard-out/` загружен для detectPolymorphicFRs
    When запущен detectPolymorphicFRs над содержимым FR.md
    Then каждый detectPolymorphicFRs результат имеет hardOut=true

  @feature2
  Scenario: FR-2 — Hard-OUT spec produces zero VARIANT_COVERAGE WARNINGs
    Given spec fixture `polymorphic-fr-hard-out/` передан в checkVariantCoverage
    When запущен checkVariantCoverage над spec директорией
    Then checkVariantCoverage не выдаёт ни одного WARNING (hard-OUT)

  @feature3
  Scenario: FR-3 — parseDecisionTable extracts rows from a valid AC table
    Given ACCEPTANCE_CRITERIA.md fixture `polymorphic-fr-complete/` загружен для parseDecisionTable FR-1
    When запущен parseDecisionTable над AC содержимым
    Then parseDecisionTable возвращает >=4 строк и первая строка variant=inbound

  @feature3
  Scenario: FR-3 — parseDecisionTable returns empty when the AC has no table
    Given ACCEPTANCE_CRITERIA.md fixture `polymorphic-fr-no-matrix/` загружен для parseDecisionTable FR-1
    When запущен parseDecisionTable над AC содержимым
    Then parseDecisionTable возвращает пустой массив

  @feature3
  Scenario: FR-3 — parseDecisionTable identifies an excluded row with its OUT_OF_SCOPE reason
    Given ACCEPTANCE_CRITERIA.md fixture `polymorphic-fr-complete/` загружен для parseDecisionTable FR-1
    When запущен parseDecisionTable над AC содержимым
    Then среди parseDecisionTable строк есть coverage=excluded с outOfScopeReason про server-generated

  @feature4
  Scenario: FR-4 — parseExamplesTable extracts rows from a Scenario Outline Examples block
    Given .feature fixture `polymorphic-fr-complete/` загружен для parseExamplesTable @feature1
    When запущен parseExamplesTable над .feature содержимым
    Then parseExamplesTable возвращает >=4 Examples строк

  @feature4
  Scenario: FR-4 — parseExamplesTable returns empty when the feature has no Scenario Outline
    Given .feature без Scenario Outline собран inline для parseExamplesTable @feature1
    When запущен parseExamplesTable над .feature содержимым
    Then parseExamplesTable возвращает пустой массив Examples

  @feature5
  Scenario: FR-5 — parseVariantTasks extracts per-variant tasks via the tracer line
    Given TASKS.md с двумя задачами и tracer line `_Variant: axis=value_` собран inline
    When запущен parseVariantTasks над TASKS содержимым
    Then parseVariantTasks возвращает 2 задачи и первая axis=doctype value=IN

  @feature6
  Scenario: FR-6 — checkVariantCoverage emits MATRIX_COMPLETE INFO for a complete spec (no WARNINGs)
    Given spec fixture `polymorphic-fr-complete/` передан в checkVariantCoverage
    When запущен checkVariantCoverage над spec директорией
    Then checkVariantCoverage не выдаёт ни одного WARNING и есть MATRIX_COMPLETE INFO finding

  @feature6
  Scenario: FR-6 — checkVariantCoverage flags AC_DECISION_TABLE_MISSING for a no-matrix spec
    Given spec fixture `polymorphic-fr-no-matrix/` передан в checkVariantCoverage
    When запущен checkVariantCoverage над spec директорией
    Then первый checkVariantCoverage finding имеет category=VARIANT_COVERAGE code=AC_DECISION_TABLE_MISSING severity=WARNING

  @feature6
  Scenario: FR-6 — checkVariantCoverage flags a RU/EN-mixed polymorphic FR
    Given spec fixture `polymorphic-fr-ru-mixed/` передан в checkVariantCoverage
    When запущен checkVariantCoverage над spec директорией
    Then среди checkVariantCoverage findings есть AC_DECISION_TABLE_MISSING

  @feature7
  Scenario: FR-7 — a single appendEscapeLog creates a one-row JSONL audit log
    Given один appendEscapeLog вызван в tmpdir с reason >=8 chars
    When прочитан spec-variant-matrix-escapes.jsonl лог
    Then лог содержит ровно 1 JSONL строку с spec=spec-x

  @feature7
  Scenario: FR-7 — two appendEscapeLog calls append two rows (atomic O_APPEND)
    Given appendEscapeLog вызван дважды в tmpdir (O_APPEND)
    When прочитан spec-variant-matrix-escapes.jsonl лог
    Then лог содержит ровно 2 JSONL строки (idempotent O_APPEND)

  @feature7
  Scenario: FR-7 — a short escape reason downgrades to a WARNING_REASON_TOO_SHORT INFO finding
    Given spec fixture `escape-hatch-short-reason/` передан в checkVariantCoverage
    When запущен checkVariantCoverage над spec директорией
    Then среди checkVariantCoverage findings есть WARNING_REASON_TOO_SHORT INFO

  @feature7
  Scenario: FR-7 — an exactly-8-char escape reason is a valid escape (boundary)
    Given spec fixture `escape-hatch-boundary-8/` передан в checkVariantCoverage
    When запущен checkVariantCoverage над spec директорией
    Then среди checkVariantCoverage findings есть ESCAPE_HATCH_USED INFO и нет WARNING_REASON_TOO_SHORT

  @feature8
  Scenario: FR-8 — variant-matrix-build sub-skill is caller-only and detects polymorphic dispatch
    Given файл SKILL.md скила variant-matrix-build прочитан
    When проверен frontmatter контракт variant-matrix-build
    Then SKILL.md содержит disable-model-invocation: true и ссылается на polymorphic dispatch detection

  @feature9
  Scenario: FR-9 — the PreToolUse form-guard stays OUT OF SCOPE (deferred to v0.2.0)
    Given FR-9 form-guard помечен OUT OF SCOPE (deferred to v0.2.0)
    When проверено наличие variant-matrix-guard.ts
    Then файл variant-matrix-guard.ts отсутствует в tools/specs-generator/variant-matrix
