Feature: PLUGIN004 Forbid Root Artifacts
  As a developer
  I want to prevent accidental files in repository root
  So that repository stays clean and organized

  Background:
    Given a git repository
    And forbid-root-artifacts plugin is installed

  Scenario: Default whitelist blocks unknown files
    Given default whitelist is active
    And file "random.txt" exists in root
    When I run check.py
    Then exit code should be 1
    And output should contain "random.txt"
    And output should contain "NOT in whitelist"

  Scenario: Default whitelist allows known files
    Given default whitelist is active
    And file "README.md" exists in root
    And file ".gitignore" exists in root
    When I run check.py
    Then exit code should be 0

  Scenario: Custom config extends whitelist
    Given .root-artifacts.yaml exists with:
      """
      mode: extend
      allow:
        - Makefile
      """
    And file "Makefile" exists in root
    When I run check.py
    Then exit code should be 0

  Scenario: Custom config replaces whitelist
    Given .root-artifacts.yaml exists with:
      """
      mode: replace
      allow:
        - README.md
      """
    And file ".gitignore" exists in root
    When I run check.py
    Then exit code should be 1
    And output should contain ".gitignore"

  Scenario: Deny overrides default whitelist
    Given .root-artifacts.yaml exists with:
      """
      mode: extend
      deny:
        - README.md
      """
    And file "README.md" exists in root
    When I run check.py
    Then exit code should be 1
    And output should contain "README.md"

  Scenario: Ignore patterns work
    Given .root-artifacts.yaml exists with:
      """
      mode: extend
      ignore_patterns:
        - "*.tmp"
      """
    And file "test.tmp" exists in root
    When I run check.py
    Then exit code should be 0

  Scenario: Allowed directories restriction
    Given .root-artifacts.yaml exists with:
      """
      mode: extend
      allowed_directories:
        - src
        - docs
      """
    And directory "random-dir" exists in root
    When I run check.py
    Then exit code should be 1
    And output should contain "random-dir"

  Scenario: Setup creates default config
    Given .root-artifacts.yaml does not exist
    When I run setup.py
    Then .root-artifacts.yaml should exist
    And .pre-commit-config.yaml should contain "forbid-root-artifacts"
