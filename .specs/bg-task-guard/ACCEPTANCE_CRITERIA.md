# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-posttooluse-marker-creation-feature1)

WHEN Bash tool_response contains `backgroundTaskId` field THEN PostToolUse hook SHALL create marker file `.dev-pomogator/.bg-task-active` with ISO 8601 timestamp.

WHEN Bash tool_response.stdout contains "Command running in background" AND no `backgroundTaskId` present THEN PostToolUse hook SHALL create marker file (fallback detection).

## AC-2 (FR-2) @feature1

**Требование:** [FR-2](FR.md#fr-2-stop-hook-блокировка-при-активном-marker-feature1)

WHEN Claude attempts to stop AND marker file exists AND marker age < 15 minutes THEN Stop hook SHALL return `{"decision": "block"}` with systemMessage.

## AC-3 (FR-3) @feature2

**Требование:** [FR-3](FR.md#fr-3-ttl-expire-маркера-feature2)

WHEN Claude attempts to stop AND marker file exists AND marker age >= 15 minutes THEN Stop hook SHALL NOT block (exit 0).

## AC-5 (FR-5) @feature3

**Требование:** [FR-5](FR.md#fr-5-auto-cleanup-marker-при-завершении-background-task-feature3)

WHEN background task completes (task notification received) AND marker file exists with matching task ID THEN PostToolUse hook SHALL delete marker file `.dev-pomogator/.bg-task-active`.

WHEN marker file exists AND stop hook executes AND task ID from marker is no longer a valid running task THEN stop hook SHALL delete marker and allow stop (exit 0).

## AC-4 (FR-4) @feature1

**Требование:** [FR-4](FR.md#fr-4-fail-open-при-ошибках-hook-feature1)

IF hook script encounters any error (missing files, parse error, runtime exception) THEN hook SHALL exit 0 (approve stop).

## AC-9 (FR-9) @feature7

**Требование:** [FR-9](FR.md#fr-9-per-session-marker-isolation-feature7)

WHEN session A launches background task THEN mark-bg-task SHALL create `.bg-task-active.{A_prefix}` marker.
WHEN session B runs stop hook THEN stop-guard SHALL check ONLY `.bg-task-active.{B_prefix}` and NOT block due to A's marker.
IF session_id is absent from stdin THEN hooks SHALL fall back to legacy `.bg-task-active` file.

## AC-10 (FR-10) @feature7

**Требование:** [FR-10](FR.md#fr-10-session_prefix_len-shared-через-sessionenv-feature7)

WHEN SessionStart hook runs THEN it SHALL write `SESSION_PREFIX_LEN=8` to `session.env`.
WHEN mark-bg-task.sh or stop-guard.sh run THEN they SHALL source `session.env` for SESSION_PREFIX_LEN with fallback `:-8`.

## AC-11 (FR-11) @feature7

**Требование:** [FR-11](FR.md#fr-11-orphan-marker-cleanup-feature7)

WHEN stop-guard runs AND any `.bg-task-active.*` marker is older than 15 minutes THEN it SHALL delete the orphaned marker.
WHEN SessionStart hook runs THEN it SHALL delete ALL `.bg-task-active*` markers from previous sessions.

## AC-12 (FR-12) @feature8

**Требование:** [FR-12](FR.md#fr-12-yaml-consistency-check-feature8)

WHEN stop-guard reads YAML status AND percent > 0 AND passed = 0 AND failed = 0 THEN it SHALL skip the YAML data as inconsistent (partial read).

## AC-13 (FR-13) @feature9

**Требование:** [FR-13](FR.md#fr-13-building-state-в-yaml-feature9)

WHEN wrapper starts AND no test events received THEN YAML SHALL show `state: building`.
WHEN first test event is parsed THEN YAML state SHALL change from `building` to `running`.
WHEN stop-guard reads `state: building` THEN it SHALL block with "Building Docker image" message without progress numbers.
WHEN stop-guard reads `state: building` THEN it SHALL NOT trigger stuck detection.

## AC-14 (FR-14) @feature10

**Требование:** [FR-14](FR.md#fr-14-centralized-marker-lifecycle-wrapper--orchestrator-feature10)

WHEN wrapper starts THEN it SHALL create per-session marker `.bg-task-active.{session_prefix}`.
WHEN wrapper exits (success, error, or signal) THEN it SHALL delete the marker file.
WHEN mark-bg-task hook fires on any Bash tool THEN it SHALL exit 0 without creating any file.

## AC-15 (FR-15) @feature10

**Требование:** [FR-15](FR.md#fr-15-yaml-freshness-check-feature10)

WHEN stop-guard reads YAML status file AND file mtime > 30 seconds ago THEN it SHALL skip the YAML data as stale.
