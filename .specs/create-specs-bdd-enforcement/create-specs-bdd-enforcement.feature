# Source: new spec — BDD enforcement для spec-generator workflow
Feature: SBDE001_create-specs-bdd-enforcement

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled
    And the specs-generator scripts are installed

  @feature8
  Scenario: SBDE001_01_detector_returns_Reqnroll_for_csharp_with_PackageReference
    Given fixture project "csharp-reqnroll-installed" with `<PackageReference Include="Reqnroll"/>` in .csproj
    When the BDD framework detector runs against that fixture
    Then detector returns language "csharp" and framework "Reqnroll"
    And installCommand contains "Reqnroll"
    And evidence array contains a string matching "Reqnroll detected"

  @feature5
  Scenario: SBDE001_02_ConfirmStop_Requirements_blocks_without_Classification
    Given a temporary spec folder with DESIGN.md that lacks a BDD Test Infrastructure section
    When spec-status.ts runs with -ConfirmStop Requirements against that spec
    Then exit code is non-zero
    And combined output matches "BDD Test Infrastructure" or "Classification" or "Phase 2 Step 6"

  @feature3
  Scenario: SBDE001_03_analyze_features_finds_feature_in_multi_folder_layout
    Given fixture repo "multi-folder-features" with `.feature` files at:
      | path                                                         |
      | Cloud/server/Cleverence.Server.Tests/Features/Sample.feature |
      | src/apps/Tests/Features/Other.feature                        |
    When specs-generator-core runs "analyze-features -Format json" from that fixture directory
    Then the output contains at least one of the known feature paths
    And the command exits with code 0 or produces non-empty output

  @feature4
  Scenario: SBDE001_04_TestFormat_unit_creates_SCENARIOS_md_not_feature
    Given a unique spec slug for -TestFormat unit test
    When scaffold-spec runs with -Name <slug> -TestFormat unit
    Then file SCENARIOS.md exists under .specs/<slug>/
    And <slug>.feature does NOT exist under .specs/<slug>/
    And SCENARIOS.md content matches "DOC ONLY"

  @feature8
  Scenario: SBDE001_05_bootstrap_recipe_for_csharp_with_Reqnroll_missing
    Given fixture project "csharp-reqnroll-missing" (xUnit without Reqnroll PackageReference)
    When the BDD framework detector runs against that fixture
    Then detector returns language "csharp" and framework null
    And suggestedFrameworks contains "Reqnroll"
    And installCommand matches "Reqnroll"
    And hookFileHints is non-empty and contains a path with "Hooks"
    And configFileHint matches "reqnroll.json"

  @feature8
  Scenario: SBDE001_06_bootstrap_recipe_for_python_with_pytest_bdd_missing
    Given fixture project "python-pytest-bdd-missing" (pytest without pytest-bdd in requirements)
    When the BDD framework detector runs against that fixture
    Then detector returns language "python" and framework null
    And suggestedFrameworks contains "pytest-bdd"
    And installCommand matches "pytest-bdd"
    And hookFileHints contains a path matching "conftest.py"
    And configFileHint matches "pytest.ini"
