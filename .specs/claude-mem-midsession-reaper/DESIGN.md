# Design

## Overview

The mid-session guard is a thin PreToolUse wrapper around the EXISTING reaper core in `tools/claude-mem-health/health-check.ts`. It reuses `reapWedgedWorker` (which already probes `/api/health` first and skips the OS snapshot when healthy) and the pure `reaperDecision`. The only new logic is a debounce gate plus a down-since visibility signal. Requirements: [FR.md](FR.md), criteria: [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md).

## Component flow

1. PreToolUse fires → guard reads the persisted last-check timestamp. Within the debounce window (~10s) → return `continue:true` immediately (no probe).
2. Window elapsed → call `reapWedgedWorker`: fast `/api/health` probe. Healthy → `skip-healthy` (no OS snapshot) + clear the down-since marker. Unhealthy → OS snapshot → `reaperDecision`: wedged (dead-PID port) → reap the orphan; port free → skip.
3. Track a persisted `worker-down-since` timestamp. If unavailable longer than the visibility threshold (~5 min) and reap did not restore it → emit a VISIBLE, non-blocking notice once (FR-6). Healthy → clear it.
4. Always `continue:true`; never a deny.

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js
**Install Command:** already installed
**Evidence:** `cucumber.json` is present; step definitions are loaded via `tests/step_definitions/**/*.ts`; existing cleanup uses `tests/hooks/before-after.ts` `V4World` per-scenario `tempDir`.
**Verdict:** BDD framework is already installed; no Phase 0 bootstrap is required. Test data is active because scenarios create temporary snapshot/state files, but cleanup is covered by the existing per-scenario world temp directory.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|--------------------------|
| `tests/hooks/before-after.ts` | Before/After | per-scenario | Provides isolated `V4World.tempDir` and cleans scenario-local filesystem state. | Да — use for fake claude-mem home, snapshot JSON, debounce markers, and kill-record files. |

### Новые hooks

No new BDD hooks are required. The feature reuses `V4World` isolation and extends `tests/step_definitions/feature_claude_mem_reaper.ts` with scenario-specific fake home/snapshot setup.

### Cleanup Strategy

All scenario-created files live under `V4World.tempDir`; the existing per-scenario cleanup removes fake claude-mem home/state, synthetic snapshot JSON, debounce/down-since marker files, and kill-record output.

### Test Data & Fixtures

| Fixture / data | Lifecycle | Used by | Notes |
|----------------|-----------|---------|-------|
| Synthetic reaper snapshot JSON | per-scenario temp file | CMEMMID001, CMEMMID002, CMEMMID003, CMEMMID005 | Written through the existing `CLAUDE_MEM_REAPER_SNAPSHOT` seam. |
| Fake claude-mem home/state directory | per-scenario temp directory | CMEMMID003, CMEMMID006 | Holds debounce and down-since markers without touching the real user home. |
| Kill-record JSON | per-scenario temp file | CMEMMID001, CMEMMID002, CMEMMID005 | Records intended pids instead of signalling real processes. |

Reuse: `tests/step_definitions/feature_claude_mem_reaper.ts` — existing reaper step-defs, the env seams `CLAUDE_MEM_REAPER_SNAPSHOT` / `_KILL_RECORD` / `_HOME`, and `V4World` per-scenario isolation. New step-defs extend it with debounce and down-since seams (same style). The new `.feature` MUST be added to `cucumber.json` `paths` (features are listed explicitly, not globbed).

## Key Decisions

### Decision: Reuse reapWedgedWorker + a thin PreToolUse wrapper with debounce

**Rationale:** the reaper core is already surgical and BDD-tested; the only gap is WHEN it runs (SessionStart only). A PreToolUse trigger closes the mid-session gap with minimal new code.

**Trade-off:** PreToolUse fires on every tool call, so the wrapper must debounce or it adds latency to every action.

**Alternatives considered:**
- Bound claude-mem's own hook call to 3–5s (upstream fix) — rejected because it is not in our codebase (upstream issue #92).
- Move the worker off the fixed port 37777 — rejected because it is palliative and does not prevent a future zombie on the new port.

### Decision: Debounce via a persisted, env-seamable timestamp

**Rationale:** avoids paying even the ~7ms health probe on back-to-back tool calls; each hook is a fresh process so the state must live on disk.

**Trade-off:** a zombie appearing just after a check waits up to one debounce window before it is healed (≪ today's 15–85 min outage).

**Alternatives considered:**
- No debounce, probe every call — rejected because ~7ms × every tool call is needless recurring overhead.
- In-memory debounce — rejected because each hook is a fresh process; in-memory state does not survive.

### Decision: Visible-but-non-blocking down signal (FR-6), never a deny

**Rationale:** the owner must not lose a day of memory silently, but the old `exit(2)` block-storm that blocked every tool call was worse.

**Trade-off:** a notice on the tool-call surface is mildly noisy compared with total silence.

**Alternatives considered:**
- Reintroduce the fail-loud block — rejected because it blocked every tool call (the original incident).
- Stay fully silent (pure fail-open) — rejected because a genuine death then goes unnoticed for hours (the owner's concern).
