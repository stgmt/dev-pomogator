#!/bin/bash
# Build the base Docker image for tests.
# Run this when system dependencies change (apt, pip, powershell, bun, cursor, claude-mem).
# Typically needed once per week or after Dockerfile.test.base changes.

set -e

echo "Building dev-pomogator-test-base:local ..."
# Remove old image to avoid BuildKit "already exists" error
docker rmi dev-pomogator-test-base:local 2>/dev/null || true

DOCKER_BUILDKIT=1 docker build \
  -f Dockerfile.test.base \
  -t dev-pomogator-test-base:local \
  .

echo "Done. Base image ready."
