# Source: new spec — BDD enforcement для spec-generator workflow
Feature: SBDE001_create-specs-bdd-enforcement

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled
    And the specs-generator scripts are installed

  # @feature1 @feature8
  Scenario: SBDE001_01_detector_returns_Reqnroll_for_csharp_with_PackageReference
    Given fixture project "csharp-reqnroll-installed" with `<PackageReference Include="Reqnroll"/>` in .csproj
    When agent runs `scaffold-spec -TestFormat auto` targeting that fixture
    Then detector returns `{ language: 'csharp', framework: 'Reqnroll' }`
    And DESIGN.md template is pre-filled with Framework=Reqnroll
    And Evidence contains the cited .csproj path with line number
    And TEST_FORMAT=BDD is set by default

  # @feature5 @feature7
  Scenario: SBDE001_02_ConfirmStop_Requirements_blocks_without_Classification
    Given spec folder with DESIGN.md that lacks `## BDD Test Infrastructure` section
    When agent runs `spec-status.ts -Path {dir} -ConfirmStop Requirements`
    Then exit code is 1
    And stderr contains "DESIGN.md missing BDD Test Infrastructure Classification"
    And stderr contains "Run Phase 2 Step 6 assessment"
    And `.progress.json` phases.Requirements.stopConfirmed remains false

  # @feature3
  Scenario: SBDE001_03_analyze_features_finds_feature_in_multi_folder_layout
    Given fixture repo "multi-folder-features" with `.feature` files at:
      | path                                     |
      | Cloud/server/Cleverence.Server.Tests/Features/Sample.feature |
      | src/apps/Tests/Features/Other.feature    |
    When agent runs `analyze-features.ts -Format json`
    Then output JSON contains both `.feature` paths
    And each entry has `domainCode`, `featureSlug`, classification `production` or `spec`
    And entries under `node_modules/`, `bin/`, `obj/` are excluded

  # @feature4
  Scenario: SBDE001_04_TestFormat_unit_creates_SCENARIOS_md_not_feature
    Given empty target spec folder path
    When agent runs `scaffold-spec -Name "dummy-unit" -TestFormat unit`
    Then file `.specs/dummy-unit/SCENARIOS.md` exists
    And `.specs/dummy-unit/dummy-unit.feature` does NOT exist
    And SCENARIOS.md header contains "DOC ONLY — no executable BDD in this project"
    And DESIGN.md template contains `**TEST_FORMAT:** UNIT` placeholder

  # @feature6
  Scenario: SBDE001_05_Phase_0_bootstrap_block_for_csharp_with_Reqnroll_missing
    Given fixture project "csharp-reqnroll-missing" (xUnit without Reqnroll PackageReference)
    When agent runs `scaffold-spec -TestFormat auto` and fills DESIGN.md via `bdd-framework-detector`
    Then TASKS.md Phase 0 contains three tasks in order:
      | task-id                          | content                                                       |
      | install-bdd-framework            | Install Reqnroll: dotnet add package Reqnroll                 |
      | bootstrap-bdd-hooks              | Bootstrap Hooks folder (BeforeAll / AfterAll / BeforeScenario / AfterScenario) |
      | bootstrap-bdd-fixtures-config    | Create TestData/ fixtures folder + reqnroll.json config       |
    And `install-bdd-framework` has no `depends:`
    And `bootstrap-bdd-hooks` has `depends: install-bdd-framework`
    And `bootstrap-bdd-fixtures-config` has `depends: bootstrap-bdd-hooks`
    And every implementation task beyond Phase 0 has `depends: bootstrap-bdd-fixtures-config`

  # @feature2 @feature6 @feature8 @feature9
  Scenario: SBDE001_06_Phase_0_bootstrap_block_for_python_with_pytest_bdd_missing
    Given fixture project "python-pytest-bdd-missing" (pytest without pytest-bdd in requirements)
    When agent runs `scaffold-spec -TestFormat auto` and detector detects language=python framework=null
    Then detector returns suggestedFrameworks=["pytest-bdd","Behave"]
    And TASKS.md Phase 0 task-id `install-bdd-framework` content = "Install pytest-bdd: pip install pytest-bdd"
    And TASKS.md Phase 0 task-id `bootstrap-bdd-hooks` content references `conftest.py` with `autouse=True` fixtures
    And TASKS.md Phase 0 task-id `bootstrap-bdd-fixtures-config` content references `pytest.ini` with `[pytest]` section
