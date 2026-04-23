#!/bin/bash
# Mock docker binary for fix-bg-output-loss integration tests.
# Intercepts all `docker ...` calls from scripts/docker-test.sh so tests run
# without a real Docker daemon.
#
# Controlled by DOCKER_MOCK_EXIT_CODE env var:
#   - compose run: exits with that code (default 0)
#   - all other subcommands: exit 0 unconditionally
#
# Output written for compose run:
#   - stub-docker-stdout-line-1 → stdout
#   - stub-docker-stderr-line-2 → stderr
# Tests use these sentinels to assert that tee captures both streams (via 2>&1).

case "$1" in
  image)
    # `docker image inspect IMG` — pretend image exists so script skips base build
    exit 0
    ;;
  ps)
    # `docker ps -q --filter ...` — empty (no orphans)
    exit 0
    ;;
  inspect)
    # `docker inspect --format ... CID` — not called when ps returns empty
    echo "mock-container"
    exit 0
    ;;
  stop|rm)
    exit 0
    ;;
  compose)
    shift  # consume "compose"
    # Skip any `-f <file>` pairs
    while [ "$1" = "-f" ] || [ "$1" = "--file" ]; do
      shift 2
    done
    case "$1" in
      build|down)
        exit 0
        ;;
      run)
        echo "stub-docker-stdout-line-1"
        echo "stub-docker-stderr-line-2" >&2
        exit "${DOCKER_MOCK_EXIT_CODE:-0}"
        ;;
      *)
        exit 0
        ;;
    esac
    ;;
  *)
    exit 0
    ;;
esac
