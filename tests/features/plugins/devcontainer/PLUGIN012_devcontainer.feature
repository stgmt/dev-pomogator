Feature: PLUGIN012 DevContainer Extension
  As a developer
  I want dev-pomogator to install devcontainer templates
  So that I can run AI development environment with GUI and desktop automation

  Background:
    Given dev-pomogator is installed
    And devcontainer extension is enabled

  # @feature1
  Scenario: Tool files are installed after clean installation
    When installer runs with --claude --all
    Then .dev-pomogator/tools/devcontainer/ directory should exist
    And postinstall.ts should be present
    And launch-worktree.ps1 should be present
    And templates/ directory should contain core config files
    And templates/scripts/ should contain all 13 shell scripts
    And templates/patches/ should contain oculos-atspi2-fix.patch

  # @feature2
  Scenario: Template files have valid structure
    Given devcontainer tools are installed
    Then templates/Dockerfile should contain multi-stage build markers
    And templates/docker-compose.yml should contain healthcheck configuration
    And templates/docker-compose.yml should contain security capabilities
    And templates/docker-compose.yml should contain Docker socket mount
    And templates/devcontainer.json should be valid JSON with required fields
    And templates/start.bat should contain Docker check and compose commands
    And templates/stop.bat should contain compose down command

  # @feature3
  Scenario: Template files contain parameterization placeholders
    Given devcontainer tools are installed
    Then templates/Dockerfile should contain {{WORKSPACE_FOLDER}} placeholder
    And templates/docker-compose.yml should contain {{PROJECT_NAME}} placeholder
    And templates/devcontainer.json should contain {{WORKSPACE_FOLDER}} placeholder
    And templates should not contain hardcoded ai-pomogator-smi references

  # @feature4
  Scenario: Extension manifest is complete
    Given devcontainer extension.json exists
    Then extension.json should declare devcontainer tool
    And extension.json toolFiles should list all template files
    And extension.json should have postInstall hooks for cursor and claude
    And every file listed in toolFiles should exist on disk

  # @feature5
  Scenario: Docker-in-Docker support is configured
    Given devcontainer tools are installed
    Then templates/docker-compose.yml should mount Docker socket
    And templates/Dockerfile should install docker-ce-cli
    And templates/scripts/post-start.sh should contain Docker GID sync logic

  # @feature6
  Scenario: Chromium accessibility support is configured
    Given devcontainer tools are installed
    Then templates/Dockerfile should build OculOS from source
    And templates/Dockerfile should install at-spi2-core
    And templates/scripts/start-gui.sh should start AT-SPI2 registryd
    And templates/scripts/oculos-wrapper.sh should resolve accessibility bus
    And templates/scripts/open-browser.sh should launch Chromium with --no-sandbox

  # @feature7
  Scenario: Dynamic port allocation support
    Given devcontainer tools are installed
    Then templates/docker-compose.yml should use HOST_NOVNC_PORT env variable
    And templates/docker-compose.yml should use HOST_VNC_PORT env variable
    And launch-worktree.ps1 should contain Get-NextPorts function
    And templates/start.bat should read ports from .env file
