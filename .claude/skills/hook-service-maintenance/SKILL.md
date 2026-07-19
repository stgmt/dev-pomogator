---
name: hook-service-maintenance
description: Diagnose and maintain dev-pomogator's project hook HTTP service. Shows real route execution logs, failures/timeouts, active daemon identity, registry routes, and canonical log path. Use when hooks appear silent, return HTTP errors, use the wrong plugin cache/worktree, or when asked whether hooks actually ran.
allowed-tools: Bash, Read, AskUserQuestion
---

# /hook-service-maintenance

Use the builtins-only CLI anchored to the active plugin/project root:

```bash
node "${CLAUDE_PLUGIN_ROOT:-${CLAUDE_PROJECT_DIR:-.}}/tools/hook-service/maintenance.mjs" <command> [flags]
```

## Commands

- `status` — active PID, health, service/root/registry identity, canonical log path.
- `doctor --json` — machine-readable health plus recent failures.
- `routes` — approved registry route inventory.
- `logs [--errors] [--route ID] [--since 30m|2h|7d] [--limit N] [--json]` — durable redacted execution evidence.

`restart` and `repair` are operator actions: first run `doctor --json`, explain the exact ownership evidence and ask through `AskUserQuestion` before stopping a process or rewriting settings. Never kill a PID solely because it appears in `service.json`; require matching health service identity. Settings repair must use `tools/hook-service/migrate-managed-hooks.mjs --fix` so CAS/snapshot recovery stays intact.

## Interpretation

- A `success`/`denied` record proves the target process completed and its decision was adapted.
- `failed`, `timeout`, `bootstrap_fail_open`, or `identity_mismatch` require action.
- HTTP health alone proves only daemon liveness, not target execution; use route logs.
- Logs deliberately exclude prompts, hook output, stderr, environment, secrets, and raw paths.

Always report the `logs:` path so the user knows where evidence lives.
