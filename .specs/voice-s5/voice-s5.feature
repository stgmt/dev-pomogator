# Каждый Scenario ОБЯЗАН нести @FR-N тег требования, которое он тестирует
# (conformance UNTAGGED_SCENARIO; blanket-теги ловит TAG_BULK_SUSPECT + FR-8 judge).
Feature: {DOMAIN}{NNN}_{Название_фичи}

  Background:
    Given {предусловие 1}
    And {предусловие 2}

  @FR-1
  Scenario: {DOMAIN}{NNN+1}_{Название_сценария_1}
    Given {контекст}
    When {действие}
    Then {ожидаемый результат}

  @FR-2
  Scenario: {DOMAIN}{NNN+2}_{Название_сценария_2}
    Given {контекст}
    When {действие}
    Then {ожидаемый результат}

  @FR-3
  Scenario: {DOMAIN}{NNN+3}_{Название_сценария_3}
    Given {контекст}
    When {действие}
    Then {ожидаемый результат}

