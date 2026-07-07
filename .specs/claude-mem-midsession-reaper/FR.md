# Functional Requirements (FR)

## FR-1: Reap a wedged claude-mem worker during an active session

The dev-pomogator claude-mem health hook SHALL be able to run during a Claude Code session before tool execution and detect the same Windows wedged-worker state that the existing SessionStart reaper handles: worker health check fails, the configured worker port is still listening, the port owner is not alive, and an orphaned claude-mem-related process is present. When that state is detected, the hook SHALL reuse the existing surgical reaper decision path and target only the orphaned claude-mem socket holder process ids.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-2](USE_CASES.md)

## FR-2: Stay cheap when claude-mem is healthy

The mid-session guard SHALL avoid expensive work when the claude-mem worker is healthy. A healthy worker check SHALL return a successful continue payload without killing processes, without resetting failure counters unnecessarily, and without adding noticeable latency to ordinary tool calls.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md)

## FR-3: Debounce full mid-session checks

The mid-session guard SHALL persist a lightweight last-check marker and skip a full health probe / OS process snapshot when another full check already ran inside the debounce window. This prevents the guard from turning every tool call into a process scan while still allowing repeated active sessions to heal a worker that wedges after SessionStart.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-4](USE_CASES.md)

## FR-4: Ship the guard to canonical plugin users

The mid-session claude-mem guard SHALL be registered in the canonical plugin hook manifest so users who install or update dev-pomogator receive the guard automatically. The same behavior SHALL also be registered in the repository dogfood settings so this repo exercises the distributed path before release.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-6](USE_CASES.md)

## FR-5: Never block tool execution

The mid-session guard SHALL be fail-open. Unsupported platforms, explicit opt-out (`DEV_POMOGATOR_CLAUDE_MEM_REAP=off`), missing claude-mem state, internal probe errors, and reaper errors SHALL all return a continue payload and SHALL NOT deny, block, or require user intervention before the requested tool call proceeds.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md), [UC-5](USE_CASES.md)

## FR-6: Warn visibly when memory stays down

If the guard observes that claude-mem remains unavailable across consecutive checks for longer than the configured visibility threshold, it SHALL emit a visible non-blocking warning that memory has not been recording for the measured duration. The warning SHALL be rate-limited, SHALL keep returning a continue payload, and SHALL clear its down-since marker once the worker becomes healthy again.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-2](USE_CASES.md), [UC-3](USE_CASES.md)
