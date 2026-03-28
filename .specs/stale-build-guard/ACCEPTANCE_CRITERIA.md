# Acceptance Criteria (EARS)

## AC-1 (FR-1, FR-2): TypeScript stale build deny @feature1

WHEN Bash command contains `test_runner_wrapper` AND `dist/index.js` mtime < max mtime of `src/**/*.ts` THEN build_guard SHALL deny with message containing "Build stale" and "npm run build" AND exit code 2.

## AC-2 (FR-1, FR-2): TypeScript missing dist deny @feature1

WHEN Bash command contains `test_runner_wrapper` AND `dist/` directory does not exist THEN build_guard SHALL deny with message containing "No build artifacts" and "npm run build" AND exit code 2.

## AC-3 (FR-1, FR-2): TypeScript fresh build allow @feature1

WHEN Bash command contains `test_runner_wrapper` AND `dist/index.js` mtime >= max mtime of `src/**/*.ts` THEN build_guard SHALL allow (exit 0).

## AC-4 (FR-3): Docker SKIP_BUILD deny @feature3

WHEN Bash command contains `docker-test.sh` AND `SKIP_BUILD=1` is in env or command THEN build_guard SHALL deny with message containing "Docker build must not be skipped" AND exit code 2.

## AC-5 (FR-4): dotnet --no-build deny @feature3

WHEN Bash command contains `--no-build` AND framework is dotnet THEN build_guard SHALL deny with message containing "Remove --no-build" AND exit code 2.

## AC-6 (FR-5): pytest/go/rust passthrough @feature3

WHEN Bash command contains `test_runner_wrapper --framework pytest` THEN build_guard SHALL allow without staleness check (exit 0).

WHEN Bash command contains `test_runner_wrapper --framework go` THEN build_guard SHALL allow without staleness check (exit 0).

WHEN Bash command contains `test_runner_wrapper --framework rust` THEN build_guard SHALL allow without staleness check (exit 0).

## AC-7 (FR-7): SKIP_BUILD_CHECK bypass @feature5

WHEN env `SKIP_BUILD_CHECK=1` is set THEN build_guard SHALL allow (exit 0) AND write warning "Build check skipped" to stderr.

## AC-8 (NFR-Reliability): Fail-open @feature1

WHEN staleness check throws an error THEN build_guard SHALL allow (exit 0).

WHEN stdin contains invalid JSON THEN build_guard SHALL allow (exit 0).

## AC-9 (FR-1): Non-test command passthrough @feature1

WHEN Bash command does NOT contain `test_runner_wrapper` or `docker-test.sh` THEN build_guard SHALL allow (exit 0, passthrough).
