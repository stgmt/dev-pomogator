---
name: proxy-up
description: |
  Ensure the local Claude Code subscription proxy (claude-proxy-infra /
  Meridian) is alive on http://127.0.0.1:3456. Check health, restart on
  failure, diagnose auth/credentials issues. Use whenever a project
  configures `ANTHROPIC_BASE_URL=http://127.0.0.1:3456` and the user
  reports "proxy down", "503 from anthropic", "claude not responding",
  or wants to bring the proxy up before running an Anthropic SDK app.
  Triggers: "подними proxy", "проверь claude proxy", "claude-proxy
  status", "meridian up", "запусти локальный claude api".
---

# proxy-up — operate the local Claude subscription proxy

## When to invoke

Triggered by any of:

- User asks to start / check / restart the local Claude proxy
- Anthropic SDK code is failing with `503` / `connection refused` while
  `ANTHROPIC_BASE_URL` points to localhost
- Before running a script that depends on `http://127.0.0.1:3456`
- User asks "is claude code subscription routing working"

## Conventions

- **Proxy infra location**: ships INSIDE the dev-pomogator plugin at
  `<plugin-root>/tools/claude-subscription-proxy/` (Dockerfile + compose +
  `scripts/`). `CLAUDE_PLUGIN_ROOT` is injected only for hook execution, NOT
  for skill-driven Bash — so resolve `$PROXY_DIR` defensively (override env →
  plugin-root env → installed plugin cache glob → repo dogfood → external
  clone). The exact chain is in the START path below. Override with
  `CLAUDE_PROXY_INFRA_PATH` if installed elsewhere.
- **Default port**: `3456`. Override via `PROXY_PORT` in the infra `.env`.
- **Health endpoint**: `GET http://127.0.0.1:3456/health` returns JSON with
  `status`, `auth.loggedIn`, `mode`, `plugin`.

## Decision tree

```
1. Health check (curl /health, timeout 3s)
   ├── 200 + status:healthy + auth.loggedIn:true → DONE, report green
   ├── 200 + auth.loggedIn:false                → REAUTH path (see below)
   ├── connection refused / timeout              → START path (see below)
   └── 503 only from local SDK clients           → SYSTEM-PROXY path
```

## START path — proxy is down

1. Resolve infra dir defensively (the proxy infra ships in the plugin tree;
   `CLAUDE_PLUGIN_ROOT` is absent in skill-driven Bash, so probe each location):
   ```bash
   # override env → plugin-root env → installed plugin cache → repo dogfood → external clone
   PROXY_DIR="${CLAUDE_PROXY_INFRA_PATH:-}"
   [ -d "$PROXY_DIR/scripts" ] || PROXY_DIR="${CLAUDE_PLUGIN_ROOT:-}/tools/claude-subscription-proxy"
   [ -d "$PROXY_DIR/scripts" ] || PROXY_DIR="$(ls -d "$HOME"/.claude/plugins/cache/*/dev-pomogator/*/tools/claude-subscription-proxy 2>/dev/null | sort -V | tail -1)"
   [ -d "$PROXY_DIR/scripts" ] || PROXY_DIR="tools/claude-subscription-proxy"
   [ -d "$PROXY_DIR/scripts" ] || PROXY_DIR="$HOME/repos/claude-proxy-infra"
   [ -d "$PROXY_DIR/scripts" ] || echo "Proxy infra not found (plugin tree / cache / repo / clone all missing)"
   ```
2. If still not found (no plugin install, no clone): clone the standalone infra
   as a last resort, then point `CLAUDE_PROXY_INFRA_PATH` at it:
   ```bash
   git clone <claude-proxy-infra-url> "$HOME/repos/claude-proxy-infra"
   ```
3. If found, run start script:
   - Windows: `powershell -ExecutionPolicy Bypass -File "$PROXY_DIR/scripts/start.ps1"`
   - Unix: `bash "$PROXY_DIR/scripts/start.sh"`
4. Wait for healthcheck (script does this internally with 30s timeout).
5. Re-probe `/health` and report.

## REAUTH path — auth.loggedIn:false

OAuth refresh token expired (happens after weeks of inactivity).

1. Inform user that re-auth is needed.
2. Try non-interactive refresh first:
   ```bash
   curl -X POST http://127.0.0.1:3456/auth/refresh
   ```
3. If still false → user must run on host (interactive browser):
   ```bash
   claude login
   ```
4. After login, restart container:
   ```bash
   bash "$PROXY_DIR/scripts/stop.sh" && bash "$PROXY_DIR/scripts/start.sh"
   ```

## SYSTEM-PROXY path — 503 only from Python/Node SDK

Symptom: `curl /health` works, but `python` Anthropic SDK gets `503`.

Cause: Windows system HTTP proxy (V2Ray, Clash, etc.) intercepts
loopback. Solution is **client-side**, not proxy-side:

1. In the **client** project's `.env`, ensure:
   ```
   NO_PROXY=127.0.0.1,localhost,::1
   no_proxy=127.0.0.1,localhost,::1
   ```
2. Verify client app loads `.env` (e.g. `python-dotenv`, `dotenv` for Node).
3. If the client doesn't use dotenv, set the env var at process start.

Do NOT try to "fix" Meridian for this — it's a client-routing issue.

## Quick reference: tools

| Action | Command |
|---|---|
| Health (one-shot) | `curl -s http://127.0.0.1:3456/health` |
| Live tail logs | `docker compose -f "$PROXY_DIR/docker-compose.yml" logs -f meridian` |
| Restart only | `docker compose -f "$PROXY_DIR/docker-compose.yml" restart meridian` |
| Telemetry dashboard | open `http://127.0.0.1:3456/telemetry` in browser |
| Manual token refresh | `curl -X POST http://127.0.0.1:3456/auth/refresh` |
| Stop everything | `bash "$PROXY_DIR/scripts/stop.sh"` |

## Reporting back to user

After any operation, always include the one-line health summary:

```
Proxy: HEALTHY | mode=passthrough | auth=team (maxr@cleverence.com) | port=3456
```

or, on failure:

```
Proxy: DOWN | reason=<connection refused|auth expired|...> | next=<action taken>
```

Do not paste full /health JSON unless user asks — keep it terse.

## Anti-patterns

- ❌ Spawning a host-installed `meridian` (npm-global) when user has
  Docker setup — they will collide on port 3456. Always check Docker
  compose first, only fall back to npm if compose isn't present.
- ❌ Suggesting `claude login` on every failure — only when /health
  shows `auth.loggedIn:false`. Other failure modes have other fixes.
- ❌ Burning user's subscription budget on diagnostic Anthropic API
  calls. Use `/health` and `/telemetry` endpoints — they don't hit
  upstream Anthropic.
- ❌ Modifying `~/.claude/.credentials.json` directly — never. Always
  via `claude login` or the proxy's `/auth/refresh`.
