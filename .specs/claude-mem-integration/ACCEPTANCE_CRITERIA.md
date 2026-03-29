# Acceptance Criteria (EARS)

## AC-1 (FR-1): Auto-install health extension @feature1

- WHEN installer runs with extension that has `requiresClaudeMem: true` THEN installer SHALL also install `claude-mem-health` extension
- WHEN `claude-mem-health` installed THEN `~/.claude/settings.json` or project `.claude/settings.json` SHALL contain SessionStart hook pointing to `health-check.ts`
- WHEN user runs `--claude --all` THEN claude-mem-health hooks SHALL be registered without manual selection

## AC-2 (FR-2): Post-install validation @feature2

- WHEN `ensureClaudeMem()` completes THEN installer SHALL call `isWorkerRunning()` and log result
- WHEN worker responds to /api/health THEN install report SHALL show `worker: ok`
- WHEN worker does NOT respond THEN install report SHALL show `worker: fail` with error
- WHEN chroma responds to heartbeat THEN install report SHALL show `chroma: ok`
- WHEN chroma does NOT respond THEN install report SHALL show `chroma: warn` (degraded mode)

## AC-3 (FR-3): Structured error logging @feature3

- WHEN any step in memory.ts fails THEN `install.log` SHALL contain `[ERROR]` entry with step name, error message, and stack
- WHEN chroma binary not found THEN install.log SHALL contain "chroma binary not found" (not just console yellow)
- WHEN worker spawn fails THEN install.log SHALL contain "worker start failed" with error details

## AC-4 (FR-4): User-facing diagnostics @feature4

- WHEN claude-mem installation fails THEN console SHALL show: step name, reason, path to install.log
- WHEN installation completes THEN `~/.dev-pomogator/last-install-report.md` SHALL contain per-component table (worker | chroma | mcp | hooks)

## AC-5 (FR-5): Graceful degradation @feature5

- WHEN chroma fails to start THEN worker SHALL still be started
- WHEN chroma fails THEN install report SHALL show `chroma: warn` not `claude-mem: fail`
- WHEN worker fails THEN MCP SHALL NOT be registered (pointing to dead service)
- WHEN worker fails THEN install report SHALL show `claude-mem: fail`

## AC-6 (FR-6): Re-install idempotency @feature6

- WHEN claude-mem is already running THEN re-install SHALL skip clone/build
- WHEN re-install runs THEN hooks SHALL NOT be duplicated in settings.json
- WHEN re-install completes THEN install report SHALL show `claude-mem: ok (already running)`

## AC-7 (FR-7): Integration tests @feature7

- WHEN test verifies claude-mem installed THEN it SHALL check worker health via HTTP, not just pathExists
- WHEN test verifies hooks THEN it SHALL check settings.json contains health-check.ts hook
- WHEN test verifies install report THEN it SHALL check per-component statuses (worker/chroma/mcp)
