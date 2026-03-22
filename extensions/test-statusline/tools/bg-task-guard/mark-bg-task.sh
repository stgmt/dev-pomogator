#!/usr/bin/env bash
# PostToolUse hook (Bash matcher): creates marker when background task detected.
# stdin: JSON with tool_input/tool_output from Claude Code
# Fail-open: always exit 0

set -euo pipefail

INPUT=$(cat 2>/dev/null || true)

STDOUT=$(echo "$INPUT" | jq -r '.tool_output.stdout // empty' 2>/dev/null || true)

if echo "$STDOUT" | grep -qF "Command running in background"; then
  MARKER_DIR=".dev-pomogator"
  mkdir -p "$MARKER_DIR"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$MARKER_DIR/.bg-task-active"
fi

exit 0
