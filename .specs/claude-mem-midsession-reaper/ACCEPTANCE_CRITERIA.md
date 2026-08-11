# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md)

WHEN the mid-session guard runs before a tool call AND the claude-mem worker is wedged (port listening, owner PID dead, an orphaned claude-mem process present) THEN the reaper decision SHALL return action `reap` carrying the orphaned socket-holder's pid(s). This proves only the local zombie-port mitigation and SHALL NOT claim to bound upstream `session-init` HTTP latency; issues #92/#93 require its independent 3–5 second deadline and no-injection fallback.

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


## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-classify-an-unreadable-claude-mem-chroma-root-without-touching-foreign-processes)

WHEN a Windows wedge snapshot contains a blank-command-line `chroma-mcp.exe` root with a dead parent and a direct Python child
THEN the reaper SHALL select that root once and SHALL exclude a foreign blank chroma root and unrelated Python processes.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-treat-port-release-as-the-recovery-proof)

WHEN a selected root cannot be terminated or the configured port cannot be verified free
THEN the failure counter SHALL remain unchanged and the hook SHALL still return a continue payload.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-cross-the-windows-elevation-boundary-explicitly-and-narrowly)

WHEN unprivileged termination returns Access Denied for the classified root
THEN the guard SHALL request only the fixed UAC helper, rate-limit repeat requests, and SHALL not claim recovery before same-port verification.

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-heal-before-a-blocked-prompt-reaches-claude-mem)

WHEN claude-mem wedges after SessionStart and before a tool call
THEN the generated UserPromptSubmit route SHALL invoke the prompt preflight before subsequent prompt hooks, with `--prompt-preflight`, without moving the worker port or disabling a hook.
