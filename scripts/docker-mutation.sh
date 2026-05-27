#!/bin/bash
# Docker mutation testing runner — wraps `npx stryker run` inside the Docker
# test container so vitest workers see DEV_POMOGATOR_TEST_IN_DOCKER=1 and pass
# the ensure-docker.ts guard. Mirrors scripts/docker-test.sh layout.
#
# Why: stryker spawns vitest as the test runner. Vitest loads
# tests/setup/ensure-docker.ts which throws unless DEV_POMOGATOR_TEST_IN_DOCKER
# is set. Running stryker on host violates the guard; running inside Docker
# satisfies it naturally. The earlier DEVPOM_ALLOW_HOST_TESTS bypass was
# removed after a 2026-05-22 incident where a host-run suite destroyed real
# .specs/ via fs.remove. See tests/setup/ensure-docker.ts header.
#
# Usage:
#   bash scripts/docker-mutation.sh                       # full Stryker config
#   bash scripts/docker-mutation.sh --mutate "src/foo.ts" # narrow scope

set -o pipefail

LOG_DIR=".dev-pomogator/.docker-status"
LOG_FILE="${LOG_DIR}/mutation-run-$(date +%s).log"
mkdir -p "$LOG_DIR"
mkdir -p reports/mutation .stryker-tmp

SESSION="${TEST_STATUSLINE_SESSION:-}"
if [ -z "$SESSION" ]; then
  SESSION_ENV=".dev-pomogator/.test-status/session.env"
  if [ -f "$SESSION_ENV" ]; then
    SESSION=$(grep -m1 '^TEST_STATUSLINE_SESSION=' "$SESSION_ENV" 2>/dev/null | cut -d= -f2 || true)
  fi
fi

if [ -n "$SESSION" ]; then
  PROJECT_NAME="devpom-mutation-${SESSION}"
else
  PROJECT_NAME="devpom-mutation-$$-${RANDOM}"
fi

export COMPOSE_PROJECT_NAME="$PROJECT_NAME"

cleanup() {
  COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose -f docker-compose.test.yml down --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Pre-flight: kill orphaned devpom-mutation containers from previous runs
for cid in $(docker ps -q --filter "name=devpom-mutation-" 2>/dev/null); do
  echo "[docker-mutation] Killing orphaned container: $(docker inspect --format '{{.Name}}' "$cid" 2>/dev/null)"
  docker stop "$cid" 2>/dev/null || true
  docker rm "$cid" 2>/dev/null || true
done

# Reuse the same base + app image as docker-test.sh
if ! docker image inspect dev-pomogator-test-base:local >/dev/null 2>&1; then
  echo "[docker-mutation] Base image not found, building (this takes 3-5 min, one-time)..."
  if ! DOCKER_BUILDKIT=1 docker build -f Dockerfile.test.base -t dev-pomogator-test-base:local . 2>&1 | tail -20; then
    echo "[docker-mutation] ERROR: Base image build failed"
    exit 1
  fi
fi

if [ "${SKIP_BUILD:-}" != "1" ]; then
  echo "[docker-mutation] Building app image..."
  if ! CACHEBUST=$(date +%s) DOCKER_BUILDKIT=1 docker compose -f docker-compose.test.yml build 2>&1 | tail -20; then
    echo "[docker-mutation] ERROR: App image build failed"
    exit 1
  fi
fi

SESSION_ARGS=()
if [ -n "$SESSION" ]; then
  SESSION_ARGS+=(-e "TEST_STATUSLINE_SESSION=$SESSION")
fi

# Override CMD with `npx stryker run [...]`. Container env already has
# DEV_POMOGATOR_TEST_IN_DOCKER=1 (set by compose), so vitest workers pass
# the ensure-docker.ts guard without any bypass.
echo "[docker-mutation] Log: $LOG_FILE"
docker compose -f docker-compose.test.yml run --rm -T \
  -e PYTHONUNBUFFERED=1 \
  -e SKIP_BUILD_CHECK=1 \
  "${SESSION_ARGS[@]}" \
  test npx stryker run "$@" 2>&1 | tee -a "$LOG_FILE"
