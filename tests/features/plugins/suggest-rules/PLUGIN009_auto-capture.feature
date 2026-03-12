# Source: analyze-features.sh (PLUGIN009, next free domain number)
Feature: PLUGIN009_Auto-Capture Learnings

  Background:
    Given dev-pomogator is installed
    And suggest-rules extension is enabled

  # @feature1
  Scenario: Capture T2 correction from UserPromptSubmit
    Given an empty learnings queue exists
    When UserPromptSubmit hook receives prompt "no, use bun instead of npm"
    Then learnings-queue.json should contain 1 entry
    And entry trigger should be "T2"
    And entry confidence should be >= 0.8
    And entry signal should contain "bun"
    And hook should exit with code 0

  # @feature1
  Scenario: No capture when prompt has no correction patterns
    Given an empty learnings queue exists
    When UserPromptSubmit hook receives prompt "please refactor this function"
    Then learnings-queue.json should contain 0 entries
    And hook should exit with code 0

  # @feature1a
  Scenario: Regex detects T2 pattern in English
    Given an empty learnings queue exists
    When UserPromptSubmit hook receives prompt "actually, I meant to use vitest not jest"
    Then learnings-queue.json should contain 1 entry
    And entry trigger should be "T2"

  # @feature1a
  Scenario: Regex detects T2 pattern in Russian
    Given an empty learnings queue exists
    When UserPromptSubmit hook receives prompt "нет, делай через bun а не npm"
    Then learnings-queue.json should contain 1 entry
    And entry trigger should be "T2"

  # @feature1a
  Scenario: Regex detects T6 workaround pattern
    Given an empty learnings queue exists
    When UserPromptSubmit hook receives prompt "let's use this workaround for now"
    Then learnings-queue.json should contain 1 entry
    And entry trigger should be "T6"

  # @feature1a
  Scenario: Regex detects explicit remember marker
    Given an empty learnings queue exists
    When UserPromptSubmit hook receives prompt "remember: always use --frozen-lockfile with bun install"
    Then learnings-queue.json should contain 1 entry
    And entry confidence should be >= 0.9

  # @feature1b
  Scenario: Semantic detection on Stop with transcript
    Given an empty learnings queue exists
    And a sample transcript with T2 and T6 signals exists
    And LEARNINGS_SEMANTIC_ENABLED is "true"
    When Stop hook is triggered with transcript_path
    Then learnings-queue.json should contain >= 2 entries
    And hook should exit with code 0

  # @feature1b
  Scenario: Fallback to regex when LLM unavailable
    Given an empty learnings queue exists
    And a sample transcript with T2 signals exists
    And LLM API is unavailable
    When Stop hook is triggered with transcript_path
    Then learnings-queue.json should contain >= 1 entry
    And stderr should contain "LLM unavailable, fallback to regex"
    And hook should exit with code 0

  # @feature2
  Scenario: Queue schema validation
    Given a populated learnings queue exists with 5 entries
    When queue file is read
    Then it should have version 1
    And each entry should have id, timestamp, sessionId, trigger, signal, context, confidence, source, platform, status
    And signal length should be <= 100 characters
    And context length should be <= 200 characters

  # @feature3
  Scenario: Atomic queue write with file lock
    Given an empty learnings queue exists
    When capture writes an entry to queue
    Then lock file should be acquired before write
    And lock file should be released after write
    And queue file should contain the new entry

  # @feature3
  Scenario: Recovery from corrupted queue file
    Given a corrupted learnings queue file exists
    When capture attempts to write an entry
    Then corrupted file should be backed up as .bak
    And new queue file should be created with the entry
    And hook should exit with code 0

  # @feature4 @agent-behavior
  Scenario: Phase -1.5 consumes pending queue entries
    Given a populated learnings queue with 3 pending entries
    When /suggest-rules Phase -1.5 runs
    Then output should contain "Queue: 3 pending entries"
    And 3 pre-candidates should be created with source "queue"

  # @feature4 @agent-behavior
  Scenario: Phase -1.5 skips when queue is empty
    Given an empty learnings queue exists
    When /suggest-rules Phase -1.5 runs
    Then output should contain "Queue: пуст"

  # @feature3 @agent-behavior
  Scenario: Auto-dedupe marks DUP for matching existing rule
    Given a populated learnings queue with entry signal "use bun not npm"
    And .claude/rules/ contains "package-manager-bun.md" with similar content
    When /suggest-rules Phase 2.5 runs auto-dedupe
    Then queue entry should be marked status "consumed"
    And queue entry consumedBy should contain "DUP"

  # @feature3 @agent-behavior
  Scenario: Auto-dedupe shows MERGE for partial overlap
    Given a populated learnings queue with entry about npm configuration
    And .claude/rules/ contains a general npm gotcha with 50% overlap
    When /suggest-rules Phase 2.5 runs auto-dedupe
    Then candidate should be shown as MERGE with reference to existing rule

  # @feature2 @agent-behavior
  Scenario: /reflect shows queue table
    Given a populated learnings queue with 3 pending and 2 consumed entries
    When user runs /reflect
    Then output should contain a table with 5 entries
    And table should have columns Trigger, Signal, Confidence, Age, Status
    And entries should be sorted by timestamp descending

  # @feature2 @agent-behavior
  Scenario: /reflect reject marks entry as rejected
    Given a populated learnings queue with 3 pending entries
    When user runs /reflect and types "reject 2"
    Then entry 2 should have status "rejected"

  # @feature2 @agent-behavior
  Scenario: /reflect shows empty queue message
    Given an empty learnings queue exists
    When user runs /reflect
    Then output should contain "Очередь пуста"

  # @feature3 @agent-behavior
  Scenario: Auto-dedupe in Phase 6 identifies similar rules
    Given .claude/rules/ contains two rules with >70% keyword overlap
    When /suggest-rules Phase 6 runs
    Then Phase 6 summary should list merge candidates with overlap percentage

  # @feature3 @agent-behavior
  Scenario: Auto-dedupe in Phase 6 reports no duplicates
    Given .claude/rules/ contains only unique rules
    When /suggest-rules Phase 6 runs
    Then Phase 6 summary should contain "Дубликатов не найдено"

  # @feature4
  Scenario: Hooks registered for Claude Code after installation
    Given dev-pomogator installs for Claude Code
    When installation completes
    Then .claude/settings.json should contain UserPromptSubmit hook referencing learnings-capture
    And .claude/settings.json should contain Stop hook referencing learnings-capture

  # @feature4
  Scenario: Hooks registered for Cursor after installation
    Given dev-pomogator installs for Cursor
    When installation completes
    Then hooks.json should contain beforeSubmitPrompt hook referencing learnings-capture
    And hooks.json should contain stop hook referencing learnings-capture

  # @feature4
  Scenario: Verify-install checks auto-capture components
    Given dev-pomogator is installed with auto-capture hooks
    When /verify-install runs
    Then output should contain "auto-capture: capture.ts installed"
    And output should contain "auto-capture: hooks registered"

  # @feature5
  Scenario: Auto-suggest notification when threshold reached
    Given a populated learnings queue with 4 pending entries
    When UserPromptSubmit hook receives prompt "no, use vitest not jest"
    Then learnings-queue.json should contain 5 pending entries
    And stderr should contain "pending learnings. Run /suggest-rules"
    And hook should exit with code 0

  # @feature5
  Scenario: No notification when below threshold
    Given a populated learnings queue with 2 pending entries
    When UserPromptSubmit hook receives prompt "no, use bun"
    Then learnings-queue.json should contain 3 pending entries
    And stderr should not contain "pending learnings"
    And hook should exit with code 0

  # @feature1b
  Scenario: Self-evaluation gates detect non-obvious discovery
    Given an empty learnings queue exists
    And a sample transcript with no T1-T6 patterns but non-trivial investigation exists
    And LEARNINGS_SEMANTIC_ENABLED is "true"
    When Stop hook is triggered with transcript_path
    Then learnings-queue.json should contain >= 1 entry
    And entry trigger should be "T5"
    And entry confidence should be >= 0.7

  # @feature4 @agent-behavior
  Scenario: Queue-sourced candidate has description hint
    Given a populated learnings queue with entry signal "PrismaClientKnownRequestError in serverless"
    When /suggest-rules Phase -1.5 runs
    Then pre-candidate should contain descriptionHint with error symptom

  # @feature6
  Scenario: Approval boosts existing pending entry confidence
    Given a populated learnings queue with entry signal "use vitest not jest" and confidence 0.85
    When UserPromptSubmit hook receives prompt "perfect, exactly what I needed"
    Then entry "use vitest not jest" confidence should be >= 0.95
    And learnings-queue.json should NOT contain a new approval entry
    And hook should exit with code 0

  # @feature6
  Scenario: Approval without matching pending entry is ignored
    Given an empty learnings queue exists
    When UserPromptSubmit hook receives prompt "perfect, great job"
    Then learnings-queue.json should contain 0 entries
    And hook should exit with code 0

  # @feature1a
  Scenario: Fingerprint dedup increments count for same signal
    Given a populated learnings queue with entry signal "use bun not npm" and count 1
    When UserPromptSubmit hook receives prompt "no, use bun instead of npm"
    Then learnings-queue.json should contain 1 entry with signal "use bun not npm"
    And entry count should be 2
    And entry lastSeen should be updated

  # @feature1a
  Scenario: Different signals get different fingerprints
    Given a populated learnings queue with entry signal "use bun not npm"
    When UserPromptSubmit hook receives prompt "no, use vitest not jest"
    Then learnings-queue.json should contain 2 entries
    And entries should have different fingerprints

  # @feature4 @agent-behavior
  Scenario: Phase -1.5 applies scoring bonus for repeated signal
    Given a populated learnings queue with entry signal "use uv not pip" and count 4
    When /suggest-rules Phase -1.5 runs
    Then pre-candidate should have ACCUMULATED_EVIDENCE bonus of 15
    And pre-candidate should have CROSS_SESSION_REPEAT bonus of 20
