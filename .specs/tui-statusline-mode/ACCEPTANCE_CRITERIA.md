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
