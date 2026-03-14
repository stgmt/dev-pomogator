#!/bin/bash
# Docker test runner with session isolation
# Generates unique COMPOSE_PROJECT_NAME to prevent container conflicts
# when multiple Claude Code sessions run tests simultaneously.

set -o pipefail

SESSION="${TEST_STATUSLINE_SESSION:-}"
if [ -n "$SESSION" ]; then
  PROJECT_NAME="devpom-test-${SESSION}"
else
  PROJECT_NAME="devpom-test-$$-${RANDOM}"
fi

export COMPOSE_PROJECT_NAME="$PROJECT_NAME"

cleanup() {
  COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose -f docker-compose.test.yml down --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Build image (shared across sessions via image: directive)
docker compose -f docker-compose.test.yml build --quiet 2>/dev/null

# -T disables pseudo-TTY allocation for reliable stdout streaming through pipes
exec docker compose -f docker-compose.test.yml run --rm -T test "$@"
