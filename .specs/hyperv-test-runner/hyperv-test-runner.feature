Feature: HVTR000_HyperV_Test_Runner
  As a human developer or AI agent
  I want lifecycle scripts, AI skill, and a YAML test catalog for a Hyper-V VM
  So that dev-pomogator can be tested against a clean Windows baseline repeatedly with version control and visual verification

  Background:
    Given the dev-pomogator repository is checked out
    And the spec ".specs/hyperv-test-runner" exists
    And no actual Hyper-V VM is required for these BDD scenarios

  # @feature1
  Scenario: HVTR001_lifecycle_scripts_exist
    Given the spec FR-1 requires 5 lifecycle PowerShell scripts
    When I list "tools/hyperv-test-runner/" recursively
    Then the directory contains "01-create-vm.ps1"
    And the directory contains "02-post-install.ps1"
    And the directory contains "03-checkpoint.ps1"
    And the directory contains "04-revert-and-launch.ps1"
    And the directory contains "05-cleanup.ps1"
    And the directory contains "lib/common.ps1"

  # @feature1
  Scenario: HVTR002_lifecycle_scripts_have_admin_check
    Given the lifecycle scripts in "tools/hyperv-test-runner/" exist
    When I read each "0X-*.ps1" file
    Then each file contains an admin elevation check using "WindowsPrincipal" or "IsInRole"
    And each file fails fast with a clear error message when not elevated

  # @feature1
  Scenario: HVTR003_lifecycle_scripts_parse_as_powershell
    Given the lifecycle scripts in "tools/hyperv-test-runner/" exist
    When I parse each "*.ps1" file with "[System.Management.Automation.Language.Parser]::ParseFile"
    Then each file parses without syntax errors
    And no file contains placeholder tokens such as TODO-in-braces or FILL-in-angles

  # @feature2
  Scenario: HVTR004_snapshot_param_supported
    Given the script "tools/hyperv-test-runner/03-checkpoint.ps1" exists
    And the script "tools/hyperv-test-runner/04-revert-and-launch.ps1" exists
    When I parse the param block of each script
    Then both scripts declare a "-Snapshot" string parameter
    And the default value of "-Snapshot" is "baseline-clean"

  # @feature3
  Scenario: HVTR005_revert_and_launch_calls_vmconnect
    Given the script "tools/hyperv-test-runner/04-revert-and-launch.ps1" exists
    When I read the script content
    Then the content contains "vmconnect.exe localhost" or "Start-Process vmconnect.exe"
    And the content contains a check for "EnableEnhancedSessionMode"

  # @feature4
  Scenario: HVTR006_post_install_enables_rdp
    Given the script "tools/hyperv-test-runner/02-post-install.ps1" exists
    When I read the script content
    Then the content contains "fDenyTSConnections" with value "0"
    And the content contains "Enable-NetFirewallRule" with display group "Remote Desktop"

  # @feature6
  Scenario: HVTR007_skill_file_exists_with_metadata
    Given the spec FR-6 requires an AI skill
    When I read ".claude/skills/hyperv-test-runner/SKILL.md"
    Then the file exists
    And the YAML frontmatter contains a "name" field equal to "hyperv-test-runner"
    And the YAML frontmatter contains a "description" field
    And the YAML frontmatter contains an "allowed-tools" field
    And "allowed-tools" includes "Bash"
    And "allowed-tools" includes "Read"

  # @feature6
  Scenario: HVTR008_skill_triggers_cover_languages
    Given the file ".claude/skills/hyperv-test-runner/SKILL.md" exists
    When I read the description field from frontmatter
    Then the description contains the trigger "протестируй в VM"
    And the description contains the trigger "test in clean windows"
    And the description contains the trigger "проверь на чистой винде"

  # @feature8
  Scenario: HVTR009_catalog_directory_exists
    Given the spec FR-8 requires a test catalog
    When I list "tests/hyperv-scenarios/"
    Then the directory exists
    And the directory contains "schema.json"
    And the directory contains at least one "HV*.yaml" file

  # @feature8
  Scenario: HVTR010_catalog_schema_is_valid_json_schema
    Given the file "tests/hyperv-scenarios/schema.json" exists
    When I parse it as JSON
    Then it has a "$schema" field referencing JSON Schema draft-07 or later
    And it has a "type" field equal to "object"
    And it has "required" array containing "id" and "name" and "preconditions" and "steps" and "assertions"

  # @feature8
  Scenario: HVTR011_reference_scenario_HV001_validates
    Given the file "tests/hyperv-scenarios/HV001_install-clean.yaml" exists
    When I parse it as YAML
    And I validate it against "tests/hyperv-scenarios/schema.json"
    Then validation passes
    And the scenario "id" equals "HV001"
    And the scenario contains at least one "screenshot_match" assertion
    And the scenario "post_test.revert" equals "baseline-clean"

  # @feature9
  Scenario: HVTR012_gitignore_includes_run_artifacts
    Given the file ".gitignore" exists at the repo root
    When I read it
    Then it contains a line matching ".dev-pomogator/hyperv-runs/" or ".dev-pomogator/hyperv-runs"

  # @feature11
  Scenario: HVTR013_readme_includes_roadmap_section
    Given the file ".specs/hyperv-test-runner/README.md" exists
    When I read it
    Then it contains a heading "## Roadmap"
    And the Roadmap section mentions "v0", "v1", "v2", "v3", "v4"
    And each phase has "Entry criteria" and "Exit criteria" sub-points

  # @feature12
  Scenario: HVTR014_cleanup_requires_confirm_or_force
    Given the script "tools/hyperv-test-runner/05-cleanup.ps1" exists
    When I parse its parameter block
    Then it declares a "-Confirm" or "-Force" switch parameter
    And the script body fails fast when neither is passed

  # @feature7
  Scenario: HVTR015_skill_reuses_debug_screenshot
    Given the file ".claude/skills/hyperv-test-runner/SKILL.md" exists
    When I read its content
    Then the content references "extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1"
    And the content does not define a custom screenshot helper

  # @feature10
  Scenario: HVTR016_skill_documents_catalog_extension_workflow
    Given the file ".claude/skills/hyperv-test-runner/SKILL.md" exists
    When I read its content
    Then the content contains a section about extending the catalog from new specs
    And the content references reading ".specs/<feature>/FR.md"
    And the content references generating "tests/hyperv-scenarios/HV<NNN>_<slug>.yaml"
