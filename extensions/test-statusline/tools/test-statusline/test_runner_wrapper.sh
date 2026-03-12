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

TSX_RUNNER="$HOME/.dev-pomogator/scripts/tsx-runner.js"

if [ -f "$TUI_WRAPPER" ]; then
  if [ -f "$TSX_RUNNER" ]; then
    exec node -e "require('$TSX_RUNNER')" -- "$TUI_WRAPPER" "$@"
  else
    exec npx tsx "$TUI_WRAPPER" "$@"
  fi
fi
if [ -f "$TUI_WRAPPER_SRC" ]; then
  if [ -f "$TSX_RUNNER" ]; then
    exec node -e "require('$TSX_RUNNER')" -- "$TUI_WRAPPER_SRC" "$@"
  else
    exec npx tsx "$TUI_WRAPPER_SRC" "$@"
  fi
fi

# Fallback: run command directly if tui-test-runner not installed
exec "$@"
