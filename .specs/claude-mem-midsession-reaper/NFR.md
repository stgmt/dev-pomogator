# Non-Functional Requirements

## Performance

On a healthy worker the guard adds negligible per-tool-call latency: a bounded health probe (~7ms), and within the debounce window even that is skipped. The expensive PowerShell OS snapshot runs ONLY when the worker is unhealthy AND the debounce window has elapsed.

## Security

N/A — no new external input. The reap is bounded by the existing surgical `matchesClaudeMemSignature`: only orphaned claude-mem processes with a dead parent are killed.

## Reliability

Fail-open: any error yields `continue:true`; a tool call is never blocked or denied. Builtins-only (`node:fs`/`os`/`path`/`http`/`child_process`) so the guard runs for plugin users who have no `node_modules`.

## Usability

No user configuration required; opt-out via a single env var `DEV_POMOGATOR_CLAUDE_MEM_REAP=off`. When memory is genuinely down beyond the visibility threshold, the user sees a clear non-blocking notice rather than silent data loss.
