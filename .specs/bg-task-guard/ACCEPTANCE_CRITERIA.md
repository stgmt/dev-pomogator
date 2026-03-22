# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-posttooluse-marker-creation-feature1)

WHEN Bash tool output contains "Command running in background" THEN PostToolUse hook SHALL create marker file `.dev-pomogator/.bg-task-active` with ISO 8601 timestamp.

## AC-2 (FR-2) @feature1

**Требование:** [FR-2](FR.md#fr-2-stop-hook-блокировка-при-активном-marker-feature1)

WHEN Claude attempts to stop AND marker file exists AND marker age < 15 minutes THEN Stop hook SHALL return `{"decision": "block"}` with systemMessage.

## AC-3 (FR-3) @feature2

**Требование:** [FR-3](FR.md#fr-3-ttl-expire-маркера-feature2)

WHEN Claude attempts to stop AND marker file exists AND marker age >= 15 minutes THEN Stop hook SHALL NOT block (exit 0).

## AC-4 (FR-4) @feature1

**Требование:** [FR-4](FR.md#fr-4-fail-open-при-ошибках-hook-feature1)

IF hook script encounters any error (missing files, parse error, runtime exception) THEN hook SHALL exit 0 (approve stop).
