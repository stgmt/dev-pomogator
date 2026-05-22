Feature: SVM001_Spec_variant_matrix_enforcement

  Background:
    Given dev-pomogator установлен в test fixture project
    And specs-workflow extension version 1.19.0 active

  Scenario: SVM002_Detection_flags_polymorphic_FR_with_EN_trigger
    Given fixture .specs/polymorphic-fr-no-matrix содержит FR-1 с фразой "for each adapter"
    When detection module trigger-phrases.ts scans FR.md
    Then detection returns object {frId: "FR-1", triggers: [...], hardOut: false}
    And matched phrase "for each adapter" присутствует в triggers array

  Scenario: SVM003_Detection_flags_polymorphic_FR_with_RU_trigger
    Given fixture .specs/polymorphic-fr-ru-mixed содержит FR-1 с фразой "переиспользуем для каждого доктайпа"
    When detection module scans FR.md
    Then detection returns object {frId: "FR-1", hardOut: false}
    And matched RU phrase присутствует в triggers array

  Scenario: SVM004_Hard_OUT_skips_single_variant_FR
    Given fixture .specs/polymorphic-fr-hard-out содержит FR-1 с "только для warehouse-transfer"
    When detection module scans FR.md
    Then detection returns object {hardOut: true}
    And audit category VARIANT_COVERAGE emit zero findings

  Scenario: SVM005_Audit_emits_finding_for_missing_AC_Decision_Table
    Given fixture .specs/polymorphic-fr-no-matrix содержит polymorphic FR-1 без AC Decision Table
    When audit-spec.ts -Path runs Phase 3 Audit
    Then summary by_category VARIANT_COVERAGE > 0
    And finding code равен "AC_DECISION_TABLE_MISSING"
    And finding severity равен "WARNING"

  Scenario: SVM006_Escape_hatch_with_short_reason_emits_INFO
    Given fixture FR.md содержит "[skip-variant-matrix: ok]" 3 chars
    When audit-spec.ts runs
    Then finding code равен "WARNING_REASON_TOO_SHORT"
    And finding severity равен "INFO"
    And spec-status.ts -ConfirmStop Audit advancement не отклонён

  Scenario: SVM007_Escape_hatch_with_valid_reason_appends_JSONL_log
    Given fixture FR.md содержит "[skip-variant-matrix: covered by parametrized helper at tests/runner.ts]"
    When audit-spec.ts runs
    Then file `.claude/logs/spec-variant-matrix-escapes.jsonl` существует
    And последняя строка содержит JSON object с полями {ts, spec, fr, reason, session_id, cwd}
    And reason длиной >=8 chars
