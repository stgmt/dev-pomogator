# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md)

WHEN the mid-session guard runs before a tool call AND the claude-mem worker is wedged (port listening, owner PID dead, an orphaned claude-mem process present) THEN the reaper decision SHALL return action `reap` carrying the orphaned socket-holder's pid(s).

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md)

WHEN the mid-session guard runs before a tool call AND the claude-mem worker is healthy THEN the guard SHALL return `skip-healthy` without taking the OS snapshot.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md)

IF a full check ran within the debounce window THEN the guard SHALL skip the check, including the health probe, and return without contacting the worker.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md)

WHEN the dev-pomogator plugin is installed or updated THEN the mid-session guard SHALL be registered on the PreToolUse event in `.claude-plugin/hooks.json` so every user receives it without manual configuration.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md)

IF the platform is non-Windows OR `DEV_POMOGATOR_CLAUDE_MEM_REAP=off` THEN the guard SHALL skip immediately and return `continue:true`, and it SHALL never emit a deny/block for a tool call.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md)

WHEN the guard observes the claude-mem worker unavailable across consecutive checks spanning longer than the visibility threshold (default ~5 minutes) AND the reap did not restore it THEN the guard SHALL surface a VISIBLE, NON-BLOCKING notice that memory has not been recording for N minutes, emit that notice at most once per threshold crossing, still return `continue:true`, and clear the down-since marker once the worker is healthy again.
