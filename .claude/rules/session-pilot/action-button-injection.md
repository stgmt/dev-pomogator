# Action Button Injection — Decision Tree

При implementation `POST /api/launch` для session-pilot ВСЕГДА следуй decision tree ниже. НЕ упрощай — каждое условие закрывает реальный edge case.

## Decision tree

```
POST /api/launch {worktree_path, session_name, mode, uuid?}
        │
        ▼
┌──────────────────────┐
│ 1. Path whitelist    │  → 403 if not in current /api/index
│ 2. UUID regex        │  → 400 if mode=resume AND not ^[0-9a-f-]{36}$
│ 3. Idempotency lock  │  → cached response if (session,uuid) seen <5s ago
└──────────┬───────────┘
           ▼
    zellij list-sessions
       grep <name>?
        ┌──┴──┐
       YES   NO
        │     │
        ▼     ▼
  ┌─────────┐ ┌──────────────────────────────────┐
  │ EXISTS  │ │ NEW session                      │
  │         │ │                                  │
  │ focus-  │ │ 1. Render KDL layout from tmpl   │
  │ pane-id │ │    to /tmp/sp-<rand>.kdl         │
  │ +       │ │ 2. setsid script -qfc            │
  │ write-  │ │      "zellij -s NAME -n FILE"    │
  │ chars   │ │      /dev/null                   │
  │         │ │ 3. threading.Timer(60, unlink)   │
  └─────────┘ └──────────────────────────────────┘
```

## Critical Zellij flag gotcha

**Use `-n FILE` (not `-l FILE`) for new sessions.**

- `zellij -s NAME -l FILE` interpretation: «add layout as new tab to existing session NAME». If NAME doesn't exist → fails with «Session NAME not found».
- `zellij -s NAME -n FILE` (or `--new-session-with-layout`): always creates new session with layout regardless of existing state.

This was discovered Phase 3 after spawn returned 200 but session never appeared in `list-sessions`.

## Race condition mitigation (existing-session path)

`zellij action write-chars "<cmd>\n"` writes to **focused pane**. If user (or another script) shifted focus between `list-sessions` and `write-chars` calls, keystrokes go to wrong pane.

**Mitigation**: always call `action focus-pane-id terminal_1` BEFORE `action write-chars`:

```python
subprocess.run([ZELLIJ_BIN, "--session", session, "action", "focus-pane-id", "terminal_1"], ...)
subprocess.run([ZELLIJ_BIN, "--session", session, "action", "write-chars", cmd + "\n"], ...)
```

The first call is fast (no-op if already focused on terminal_1). Acceptable cost for race elimination.

## Idempotency lock semantics

`_launch_lock: dict = {(session, uuid): timestamp}` with TTL 5s.

- Same (session, uuid) within 5s → return cached response with `method: "cached"` and `note` field
- Different uuid for same session → fresh execution
- Different session → fresh execution

Why 5s: typical double-click happens <500ms; 5s also covers «I clicked but page didn't update so I clicked again» pattern.

## TTY requirement for spawn

Zellij needs a real terminal to start. From HTTP backend, use:

```bash
setsid script -qfc "zellij -s NAME -n FILE" /dev/null </dev/null >/dev/null 2>&1 &
```

- `script -qfc "<cmd>" /dev/null` allocates a pty, runs command in it, discards output to /dev/null
- `setsid` detaches from controlling terminal of HTTP server
- `<` `>` `2>&1` redirects all standard streams
- Trailing `&` backgrounds

Without `script`, Zellij will fail with «no TTY» or hang indefinitely. Without `setsid`, it inherits HTTP server's controlling terminal and dies when server exits.

## When to deviate

Don't. The decision tree exists because each branch was empirically validated. If you find yourself wanting to:
- Skip whitelist → security regression (arbitrary command injection)
- Skip UUID validation → command injection via crafted UUID
- Skip idempotency lock → duplicate `\n` strokes pile up in shell
- Use `-l` instead of `-n` → silent spawn failure
- Skip focus-pane-id → race condition

…then revisit this rule and reconsider.
