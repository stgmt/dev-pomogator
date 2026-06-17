Feature: CORE023_skill-listing-budget

  Background:
    Given installer запускается с изолированным temp HOME directory
    And путь к настройкам это `${HOME}/.claude/settings.json`

  @feature1
  Scenario: CORE023_01 settings.json отсутствует — installer создаёт с skillListingBudgetFraction=1.0
    Given файл `${HOME}/.claude/settings.json` не существует
    When запускается `ensureSkillListingBudget`
    Then файл `${HOME}/.claude/settings.json` создан
    And содержит ключ `skillListingBudgetFraction` со значением `1.0` (number, не string)
    And install report содержит строку `skillListingBudgetFraction: (unset) → 1.0`

  @feature1
  Scenario: CORE023_02 существующие ключи сохраняются
    Given `${HOME}/.claude/settings.json` содержит `{ "theme": "dark", "model": "sonnet" }`
    When запускается `ensureSkillListingBudget`
    Then файл содержит `theme: "dark"` без изменений
    And файл содержит `model: "sonnet"` без изменений
    And файл содержит `skillListingBudgetFraction: 1.0` (новый ключ)

  @feature2
  Scenario: CORE023_03 значение уже 1.0 — no-op (mtime preserved)
    Given `${HOME}/.claude/settings.json` содержит `{ "skillListingBudgetFraction": 1.0 }`
    And запомнен текущий mtime файла
    When запускается `ensureSkillListingBudget`
    Then mtime файла не изменился
    And install report содержит строку `skillListingBudgetFraction: 1.0 (unchanged)`

  @feature3
  Scenario: CORE023_04 существующее значение 0.5 — bump до 1.0
    Given `${HOME}/.claude/settings.json` содержит `{ "skillListingBudgetFraction": 0.5 }`
    When запускается `ensureSkillListingBudget`
    Then файл содержит `skillListingBudgetFraction: 1.0`
    And install report содержит строку `skillListingBudgetFraction: 0.5 → 1.0`

  @wip
  Scenario: CORE023_05 битый JSON — backup + rewrite с 1.0
    Given `${HOME}/.claude/settings.json` содержит невалидный JSON `{ skillListingBudgetFraction: }`
    When запускается `ensureSkillListingBudget`
    Then создан backup `${HOME}/.dev-pomogator/.user-overrides/settings.json.broken-{epoch}` с оригинальным content
    And `${HOME}/.claude/settings.json` теперь валидный JSON
    And содержит `skillListingBudgetFraction: 1.0`
    And install report содержит строку начинающуюся с `skillListingBudgetFraction: <invalid:`

  @wip
  Scenario: CORE023_06 ключ с invalid типом (string) — bump до 1.0
    Given `${HOME}/.claude/settings.json` содержит `{ "skillListingBudgetFraction": "0.5" }`
    When запускается `ensureSkillListingBudget`
    Then файл содержит `skillListingBudgetFraction: 1.0` (number, не string)
    And install report содержит строку начинающуюся с `skillListingBudgetFraction: <invalid:`

  @wip
  Scenario: CORE023_07 install report содержит ровно одну строку про skillListingBudgetFraction
    Given любое начальное состояние `${HOME}/.claude/settings.json`
    When запускается `ensureSkillListingBudget`
    Then install report содержит ровно одну строку начинающуюся с `skillListingBudgetFraction:`
    And не содержит дублирующих или противоречивых строк

  @wip
  Scenario: CORE023_08 запись атомарна — temp file + fs.move
    Given файл `${HOME}/.claude/settings.json` отсутствует
    When `ensureSkillListingBudget` начинает запись
    Then перед `fs.move` существует `${HOME}/.claude/settings.json.tmp`
    And после `fs.move` `settings.json.tmp` удалён
    And `settings.json` содержит финальный JSON
