#!/bin/bash
# Test Runner Wrapper — thin shim to canonical v2 writer
# Delegates to tui-test-runner's test_runner_wrapper.ts for v2 YAML status
# FR-2: YAML Protocol, FR-4: Test Runner Wrapper, FR-5: Session Isolation

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Resolve project root: .dev-pomogator/tools/X -> 3 up; extensions/X/tools/X -> 4 up
if [[ "$SCRIPT_DIR" == *".dev-pomogator"* ]]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." 2>/dev/null && pwd)"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." 2>/dev/null && pwd)"
fi
TUI_WRAPPER="$REPO_ROOT/.dev-pomogator/tools/tui-test-runner/test_runner_wrapper.ts"
TUI_WRAPPER_SRC="$REPO_ROOT/extensions/tui-test-runner/tools/tui-test-runner/test_runner_wrapper.ts"

# Load session from session.env if env vars not set (CLAUDE_ENV_FILE bug #15840)
if [ -z "$TEST_STATUSLINE_SESSION" ]; then
  _SESSION_FILE="$REPO_ROOT/.dev-pomogator/.test-status/session.env"
  if [ -f "$_SESSION_FILE" ]; then
    while IFS='=' read -r _key _val; do
      [ -n "$_key" ] && [ -n "$_val" ] && export "$_key=$_val"
    done < "$_SESSION_FILE"
  fi
fi

# Use npx tsx directly — NOT tsx-runner.js.
# tsx-runner uses execSync with timeout (for hooks), which kills long-lived
# test runs (Docker tests take 12+ min). npx tsx has no timeout.
if [ -f "$TUI_WRAPPER" ]; then
  exec npx tsx "$TUI_WRAPPER" "$@"
fi
if [ -f "$TUI_WRAPPER_SRC" ]; then
  exec npx tsx "$TUI_WRAPPER_SRC" "$@"
fi

# Fallback: run command directly if tui-test-runner not installed
exec "$@"
