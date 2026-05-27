Feature: FR-2 Locale-specific date and currency formatting
  As a user reading data в моём locale
  I want dates and currency rendered using my locale conventions
  So that values are unambiguous and culturally correct

  Background:
    Given the formatLocalized pipeline is loaded
    And the reference date is "2026-04-30" and the reference amount is 1234.56

  @feature2 @variant-matrix
  Scenario Outline: Format date and currency per <locale>
    Given the active locale tag is "<locale>"
    And user setting useImperialEra is "<imperialEra>"
    When the formatter renders the reference date and amount
    Then the date string equals "<expectedDate>"
    And the currency string equals "<expectedCurrency>"
    And the rendered direction attribute is "<direction>"
    And bidi isolation around numeric runs is "<bidiIsolation>"

  Examples:
    | locale | imperialEra | expectedDate     | expectedCurrency | direction | bidiIsolation |
    | en-US  | false       | 04/30/2026       | $1,234.56        | ltr       | not-required  |
    | en-GB  | false       | 30/04/2026       | £1,234.56        | ltr       | not-required  |
    | ru-RU  | false       | 30.04.2026       | 1 234,56 ₽       | ltr       | not-required  |
    | ja-JP  | false       | 2026年4月30日    | ¥1,235           | ltr       | not-required  |
    | ja-JP  | true        | 令和8年4月30日   | ¥1,235           | ltr       | not-required  |
    | ar-SA  | false       | ٣٠‏/٠٤‏/٢٠٢٦       | ر.س.‏ ١٬٢٣٤٫٥٦      | rtl       | required-FSI-PDI |

  # All 6 rows expected covered. No excluded rows: each variant carries a distinct
  # quirk (MDY vs DMY, prefix vs suffix currency, Imperial era opt-in, RTL bidi)
  # that cannot be subsumed under another. See ac-decision-table.md AC-2 rows 1-6.

  @feature2 @variant-matrix @ar-SA-bidi-edge
  Scenario: ar-SA mixed-direction paragraph preserves digit grouping
    Given the active locale tag is "ar-SA"
    And the page contains an Arabic sentence "تاريخ الطلب هو {date} والمبلغ {amount}"
    When the formatter substitutes date="2026-04-30" and amount=1234.56
    Then the numeric runs are wrapped in U+2068 (FSI) and U+2069 (PDI)
    And the visual order of digit groups matches "٣٠ ٠٤ ٢٠٢٦" (day month year, not reversed)

  @feature2 @variant-matrix @ja-JP-era-boundary
  Scenario: ja-JP Imperial era table resolves correctly across era boundary
    Given user setting useImperialEra is true
    And the active locale tag is "ja-JP"
    When the formatter renders date "2019-05-01"
    Then the era prefix is "令和" (Reiwa, started 2019-05-01)
    And the year-in-era is "1年"
    When the formatter renders date "2019-04-30"
    Then the era prefix is "平成" (Heisei, ended 2019-04-30)
    And the year-in-era is "31年"
