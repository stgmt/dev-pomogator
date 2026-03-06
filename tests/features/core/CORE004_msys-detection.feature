Feature: CORE004 MSYS Path Mangling Detection
  As a developer using devcontainers on Windows with Git Bash,
  I want dev-pomogator to detect and warn about MSYS path mangling artifacts,
  So that I can fix the root cause and clean up corrupted directories.

  Background:
    Given dev-pomogator is installed

  # @feature1
  Scenario: Detect MSYS-mangled path string
    Given a path string "C:/Program Files/Git/home/vscode/.claude"
    When isMsysMangledPath is called
    Then it should return true

  # @feature2
  Scenario: Detect MSYS artifact directory in project root
    Given a project root with a "C:" directory containing "Program Files/Git/home/vscode"
    When detectMangledArtifacts is called with the project root
    Then it should return ["C:"]

  # @feature3
  Scenario: Environment hardening on Windows
    Given the platform is "win32"
    When getMsysSafeEnv is called
    Then the returned environment should contain MSYS_NO_PATHCONV="1"
    And the returned environment should contain MSYS2_ARG_CONV_EXCL="*"

  # @feature4
  Scenario: No false positives on clean project
    Given a clean project root without MSYS artifacts
    When detectMangledArtifacts is called with the project root
    Then it should return an empty list

  # @feature5
  Scenario: Installer warns about MSYS artifacts
    Given a project with MSYS path mangling artifacts
    When the Claude installer runs
    Then it should print a warning about MSYS path mangling
    And suggest setting MSYS_NO_PATHCONV=1
