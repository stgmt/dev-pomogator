# Acceptance Criteria (EARS)

## AC-1 (FR-1): CompactBar рендеринг @feature1

**Требование:** [FR-1](FR.md#fr-1-compactbar-виджет)

WHEN TUI is in compact mode AND YAML status file exists with state "running" THEN CompactBar SHALL display progress line with framework name, passed/failed/skipped counts, progress bar percentage, and elapsed duration.

WHEN TUI is in compact mode AND YAML status file does not exist THEN CompactBar SHALL display idle indicator "no test runs".

WHEN TUI is in compact mode AND YAML status file is corrupted THEN CompactBar SHALL display "waiting for tests..." without crashing.

## AC-2 (FR-2): Toggle compact/full @feature2

**Требование:** [FR-2](FR.md#fr-2-toggle-compactfull-mode)

WHEN user presses `M` key THEN TUI SHALL toggle between compact and full mode.

WHEN TUI switches from full to compact THEN TabbedContent SHALL be hidden (CSS `display: none`) AND CompactBar SHALL be visible.

WHEN TUI switches from compact to full THEN TabbedContent SHALL be visible AND CompactBar SHALL be hidden AND previously active tab SHALL be restored.

## AC-3 (FR-3): Stop tests @feature3

**Требование:** [FR-3](FR.md#fr-3-stop-tests)

WHEN user presses `X` AND YAML status file contains valid PID AND process is running THEN TUI SHALL send termination signal to that PID.

IF YAML status file does not contain PID THEN Stop button SHALL be visually disabled.

IF process with PID is already dead THEN TUI SHALL update status to "stopped" without error.

## AC-4 (FR-4): Auto-compact @feature4

**Требование:** [FR-4](FR.md#fr-4-auto-compact-при-малом-terminal-height)

WHEN terminal height drops below 15 rows AND TUI is in full mode THEN TUI SHALL automatically switch to compact mode.

WHEN terminal height increases above 15 rows AND TUI was auto-compacted THEN TUI SHALL remain in compact mode (manual `M` to restore).

## AC-5 (FR-5): Выпиливание statusline @feature5

**Требование:** [FR-5](FR.md#fr-5-выпилить-statusline-render-из-test-statusline)

WHEN test-statusline extension is installed THEN `statusline_render.cjs`, `statusline_render.sh`, and `statusline_wrapper.js` SHALL NOT be present in `.dev-pomogator/tools/test-statusline/`.

WHEN test-statusline extension is installed THEN `statusline_session_start.ts` and `test_runner_wrapper.*` SHALL still be present and functional.

IF user had `statusLine` configured in `~/.claude/settings.json` by dev-pomogator THEN updater SHALL remove managed statusLine entry.

## AC-6 (FR-6): Idle indicator @feature1

**Требование:** [FR-6](FR.md#fr-6-idle-indicator-в-compact-mode)

WHEN TUI is in compact mode AND no YAML status file exists THEN CompactBar SHALL display "no test runs" with dim styling.

WHEN TUI is in compact mode AND YAML status file exists with state "idle" THEN CompactBar SHALL display "no test runs" with dim styling.

WHEN TUI is in compact mode AND YAML file is corrupted (invalid YAML) THEN CompactBar SHALL display "waiting for tests..." without crashing.

## AC-7 (FR-7): Docker session propagation @feature14

**Требование:** [FR-7](FR.md#fr-7-docker-session-propagation)

WHEN `docker-test.sh` is invoked AND `session.env` exists at `.dev-pomogator/.test-status/session.env` THEN Docker container SHALL receive `-e TEST_STATUSLINE_SESSION={prefix}` with the session prefix value from `session.env`.

IF `session.env` does not exist at `.dev-pomogator/.test-status/session.env` THEN `docker-test.sh` SHALL proceed without passing `TEST_STATUSLINE_SESSION` (fail-open).

WHEN CJS wrapper runs inside Docker AND `TEST_STATUSLINE_SESSION` is not set in environment THEN wrapper SHALL try reading `session.env` from `.docker-status/` directory as fallback path.

WHEN wrapper runs with `TEST_STATUSLINE_SESSION` set AND `TEST_STATUS_DIR` points to `.docker-status/` THEN YAML status file SHALL be written to `.dev-pomogator/.docker-status/status.{prefix}.yaml`.

## AC-8 (FR-8): Dual-directory YAML reader @feature15

**Требование:** [FR-8](FR.md#fr-8-dual-directory-yaml-reader)

WHEN TUI is launched AND primary status file does not exist at `--status-file` path THEN YamlReader SHALL scan fallback directories for any `status.*.yaml` file (not limited to same filename as primary).

WHEN status files exist in both primary and fallback directories (possibly with different session prefixes) THEN YamlReader SHALL use the file with the most recent mtime (freshest wins).

IF no status files exist in any directory (primary or fallback) THEN YamlReader SHALL return None (idle state displayed).

WHEN launcher builds TUI arguments THEN `--fallback-dir` SHALL include the `.docker-status/` directory path.

## AC-9 (FR-9): TUI Stop hook @feature16

**Требование:** [FR-9](FR.md#fr-9-tui-stop-hook-session-cleanup)

WHEN Claude Code session ends (Stop event) AND `tui.pid` exists in `.test-status/` or `.docker-status/` THEN Stop hook SHALL read the PID and send SIGTERM signal.

IF PID process is already dead THEN Stop hook SHALL clean up the `tui.pid` file and exit 0 without error.

IF `tui.pid` does not exist in any status directory THEN Stop hook SHALL exit 0 without error.

WHEN SessionStart hook runs for a new session AND `tui.pid` exists from a previous session THEN hook SHALL terminate the stale TUI process before proceeding.

## AC-10 (FR-10): Docker session passing @feature14

**Требование:** [FR-10](FR.md#fr-10-docker-session-passing)

WHEN `docker-test.sh` runs THEN `TEST_STATUSLINE_SESSION` SHALL be passed to Docker container via `-e` flag if session is known.

WHEN `docker-test.sh` runs without custom args THEN Dockerfile CMD (with wrapper) SHALL produce YAML status.

WHEN `docker-test.sh` runs with custom args THEN Docker CMD is overridden — vitest runs directly without wrapper (accepted: filtered runs don't produce YAML).
