Feature: CORE006 Updater Reliability
  As a developer using dev-pomogator
  I want the auto-update system to be reliable
  So that concurrent sessions don't corrupt my configuration

  Background:
    Given dev-pomogator is installed
    And the updater modules are available

  # @feature1
  Scenario: Lock prevents concurrent updates
    Given no update lock exists
    When the updater acquires a lock
    Then a second acquire attempt should return false
    And releasing the lock should allow re-acquisition

  # @feature2
  Scenario: Stale lock from dead process is recovered
    Given an update lock exists with a dead process PID
    When the updater tries to acquire the lock
    Then it should detect the stale lock
    And it should atomically rename the stale lock aside
    And it should successfully acquire a new lock

  # @feature3
  Scenario: Lock timeout recovers from zombie locks
    Given an update lock exists older than 60 seconds
    When the updater tries to acquire the lock
    Then it should treat the lock as stale
    And it should successfully acquire a new lock

  # @feature4
  Scenario: Download timeout prevents hanging updates
    Given the GitHub API is slow or unresponsive
    When the updater fetches an extension manifest
    Then the fetch should abort after 15 seconds
    And the updater should gracefully return null

  # @feature5
  Scenario: HTTP errors are logged with status codes
    Given the GitHub API returns a 404 error
    When the updater fetches an extension manifest
    Then the error response status should be logged
    And the updater should return null without throwing

  # @feature6
  Scenario: Cursor hooks are written atomically
    Given a Cursor project with existing hooks.json
    When the updater writes new hooks
    Then hooks.json should be written via atomic temp+move
    And the file should not be corrupted on partial write

  # @feature7
  Scenario: Failed project update doesn't block other projects
    Given two projects are registered for an extension
    And the first project path is inaccessible
    When the updater runs
    Then the first project error should be logged
    And the second project should still be updated
