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

# Auto-build base image if it doesn't exist
if ! docker image inspect dev-pomogator-test-base:local >/dev/null 2>&1; then
  echo "[docker-test] Base image not found, building (this takes 3-5 min, one-time)..."
  if ! DOCKER_BUILDKIT=1 docker build -f Dockerfile.test.base -t dev-pomogator-test-base:local . 2>&1 | tail -20; then
    echo "[docker-test] ERROR: Base image build failed"
    exit 1
  fi
fi

# Build app image (fast: only COPY + npm install + build)
# Skip build with SKIP_BUILD=1 when image is already current
# CACHEBUST uses epoch seconds to invalidate COPY layer cache on every build
if [ "${SKIP_BUILD:-}" != "1" ]; then
  echo "[docker-test] Building app image..."
  if ! CACHEBUST=$(date +%s) DOCKER_BUILDKIT=1 docker compose -f docker-compose.test.yml build 2>&1 | tail -20; then
    echo "[docker-test] ERROR: App image build failed"
    exit 1
  fi
fi

# -T disables pseudo-TTY for pipe compatibility.
# PYTHONUNBUFFERED + NODE_DISABLE_COLORS force Node/Python unbuffered output.
# script /dev/null -qfc creates fake TTY → Node.js uses line buffering (not block).
exec docker compose -f docker-compose.test.yml run --rm -T \
  -e PYTHONUNBUFFERED=1 \
  test "$@"
