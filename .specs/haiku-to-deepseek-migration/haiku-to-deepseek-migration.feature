@haiku_to_deepseek_migration
Feature: HDS001_Haiku_to_DeepSeek_active_selection_migration
  Active runtime selectors use DeepSeek without silently falling back to Haiku.

  @HDS001 @FR-1
  Scenario Outline: Prompt-suggest uses the exact DeepSeek ID for each provider
    Given prompt-suggest has no model override and uses "<provider>" credentials
    When the supported prompt-suggest configuration resolves its model
    Then the effective prompt-suggest model is "<model>"

    Examples:
      | provider     | model                                         |
      | OpenRouter   | deepseek/deepseek-v4-flash                    |
      | AiPomogator  | openrouter/deepseek/deepseek-v4-flash         |

  @HDS002 @FR-2
  Scenario: AiPomogator selects the DeepSeek route returned by its catalog
    Given the producer-shaped AiPomogator catalog fixture "aipomogator-models.json"
    When the DeepSeek route is selected from that catalog
    Then the selected route is exactly "openrouter/deepseek/deepseek-v4-flash" and came from the catalog

  @HDS003 @FR-2
  Scenario: An absent DeepSeek catalog route never falls back to Haiku
    Given the producer-shaped AiPomogator catalog fixture "aipomogator-models-no-deepseek.json"
    When the DeepSeek route is selected from that catalog
    Then no model is selected and Haiku is not used as a fallback

  @HDS004 @FR-1 @FR-3 @FR-4
  Scenario: Every scoped active selector and delivered artifact uses DeepSeek
    Given the scoped active model-selection surfaces
    When their canonical and delivered artifacts are inspected
    Then every direct OpenRouter default is "deepseek/deepseek-v4-flash"
    And every routed AiPomogator default is "openrouter/deepseek/deepseek-v4-flash"
    And the learning and claude-mem defaults use DeepSeek V4 Flash
    And no scoped active selector contains a Haiku model ID
    And canonical sources and their generated or mirrored artifacts agree

  @HDS005 @FR-5
  Scenario: External benchmark and historical price evidence cannot approve rollout
    Given the captured workload and pricing evidence
    When rollout readiness is evaluated without product workload results
    Then the migration rollout decision is "no-go"
    And the rubric covers quality, failures, latency, and cost
    And the historical costs remain context rather than current-price proof
