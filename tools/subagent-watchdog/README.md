# subagent-watchdog

Parent-side guard for Claude Code background Agent/Task work.

## Problem

`tools/bg-task-guard` protects long-running Bash jobs through `.bg-task-active*`
markers. Claude `Agent(...)` work does not use that marker lifecycle. It is
observable through:

- `Agent` tool launch results containing `agentId` and `output_file`;
- `<task-notification>` records in the session transcript;
- sidechain transcript rows with `agentId`;
- output files under `%TEMP%/claude/.../tasks/*.output`.

When Claude Code exits, reconnects, hits API/stream/context errors, or loses a
completion record, the parent session can continue without a hard stop unless
another hook checks these records.

## Hook behavior

- `UserPromptSubmit`, `SessionStart`, `PostToolUse`: inject `additionalContext`
  when stale/lost/API-failed background work is detected.
- `Stop`: returns `{"decision":"block"}` so the parent agent cannot claim done
  over unresolved child work.
- Failed task notifications are only blocked for Claude/API failure signatures
  such as `API Error`, `Stream ended without receiving any events`, `429`, `503`,
  `context window`, and `max_output_tokens`; ordinary failed test commands stay
  visible to their normal gates.
- Default stale threshold: `SUBAGENT_WATCHDOG_STALE_MINUTES=30`.
- Default lookback: `SUBAGENT_WATCHDOG_LOOKBACK_HOURS=24`.
- Default max reported issues: `SUBAGENT_WATCHDOG_MAX_ISSUES=8`.
- Disable: `SUBAGENT_WATCHDOG_ENABLED=false`.

## Acknowledge a resolved old task

After the parent has inspected/reported/recovered an old lost task, acknowledge it
so future Stop hooks do not block forever on the same historical record:

```bash
node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','tsx-runner-bootstrap.cjs'))" -- ".dev-pomogator/tools/subagent-watchdog/subagent_watchdog.ts" --ack <task-id> --reason "<what you did>"
```

The ack file is `.dev-pomogator/.subagent-watchdog-ack.jsonl`.

## Evidence command

Run the hook against a known transcript:

```bash
printf '{"transcript_path":"C:/Users/stigm/.claude/projects/E--repos-lm-saas/31315601-8945-40a8-98f5-86bb006a983f.jsonl","cwd":"E:/repos/lm-saas"}' \
  | node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','tsx-runner-bootstrap.cjs'))" -- ".dev-pomogator/tools/subagent-watchdog/subagent_watchdog.ts" --event Stop
```
