# claude-subscription-proxy

Local proxy that exposes the user's **Claude Pro/Max/Team subscription**
as a standard Anthropic-compatible HTTP API on `http://127.0.0.1:3456` —
so any tool speaking the Anthropic SDK protocol bills against subscription
instead of pay-per-token API key.

Built on [Meridian](https://github.com/rynfar/meridian) (official
`@anthropic-ai/claude-agent-sdk` wrapper, not reverse-engineered auth).

## What this extension installs

**Skills** (auto-activated in any Claude Code session in this project):
- `proxy-up` — operations: check / start / restart / diagnose proxy
- `use-claude-subscription` — wire any project's `.env` to use the proxy

**Tools** (in `tools/claude-subscription-proxy/`):
- `Dockerfile` — patched Meridian image with Linux musl binary fix
- `docker-compose.yml` — passthrough mode, loopback bind, restart unless-stopped, healthcheck, log rotation
- `scripts/{start,stop,health}.{sh,ps1}` — cross-platform lifecycle
- `scripts/install-autostart.ps1` — Windows Docker Desktop autostart

## Quick start (after extension install)

```bash
# Pre-requisites (one-time)
npm install -g @anthropic-ai/claude-code   # if not installed
claude login                                # browser OAuth, saves ~/.claude/.credentials.json

# Bring up the proxy
bash tools/claude-subscription-proxy/scripts/start.sh
# Windows: powershell .\.dev-pomogator\tools\claude-subscription-proxy\scripts\start.ps1
```

First start builds the Docker image (~3 min, cached after). Then:

```bash
curl http://127.0.0.1:3456/health
# {"mode":"passthrough", ...}
```

## Wire your project to the proxy

Either invoke the `use-claude-subscription` skill ("use claude in this
project" / "wire claude here" in chat), or manually add to your project's
`.env`:

```ini
ANTHROPIC_BASE_URL=http://127.0.0.1:3456
ANTHROPIC_API_KEY=meridian-placeholder-not-real-key
NO_PROXY=127.0.0.1,localhost,::1
no_proxy=127.0.0.1,localhost,::1
```

The Anthropic SDK auto-honors `ANTHROPIC_BASE_URL` — no source code changes
needed.

## Always-on (Windows)

```powershell
.\.dev-pomogator\tools\claude-subscription-proxy\scripts\install-autostart.ps1
```

Enables Docker Desktop autostart on Windows login. Combined with
`restart: unless-stopped`, the proxy is alive within ~20s of any login or
container crash.

## Always-on (Linux)

```bash
sudo systemctl enable --now docker
bash tools/claude-subscription-proxy/scripts/start.sh
```

## Operations

| Task | Command |
|---|---|
| Health | `curl http://127.0.0.1:3456/health` |
| Logs | `docker compose -f tools/claude-subscription-proxy/docker-compose.yml logs -f meridian` |
| Telemetry dashboard | open `http://127.0.0.1:3456/telemetry` in browser |
| Manual OAuth refresh | `curl -X POST http://127.0.0.1:3456/auth/refresh` |
| Re-auth (refresh token expired) | `claude login`, then restart proxy |
| Stop | `bash tools/claude-subscription-proxy/scripts/stop.sh` |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `503` from Python SDK only, `curl` works | System HTTP proxy intercepting loopback | Add `NO_PROXY=127.0.0.1,localhost,::1` to project `.env` |
| Container restart loop | Linux musl binary missing in Alpine | Bundled Dockerfile already fixes this; rebuild: `docker compose up -d --build` |
| `auth.loggedIn:false` at /health | OAuth refresh token expired (weeks of inactivity) | `claude login` on host, restart container |
| Port 3456 in use | Old `meridian` process running | `start.sh` auto-kills it; or change port in `.env` |
| `bake: exit status 1` | BuildKit Bake bug | `COMPOSE_BAKE=false docker compose up -d --build` |

## Security caveats

- Loopback-only by default. **Never** bind to `0.0.0.0` without setting
  `MERIDIAN_API_KEY` to a strong secret — anyone reachable on the network
  would burn your subscription.
- `~/.claude/.credentials.json` contains plain-text OAuth tokens. Don't
  share screen with that file open.
- Anthropic ToS gray zone: subscription is intended for individual /
  small-team use. Sharing Max account across 10+ unrelated devs via
  network proxy would violate fair-use clauses. Personal-productivity
  tool, not a SaaS reselling vehicle.

## Reference

Full spec (project-agnostic): the upstream `claude-proxy-infra` repo
contains `.specs/local-claude-subscription-proxy/` with FR / NFR / AC /
DESIGN / RESEARCH / TASKS for understanding the architecture.

Upstream: https://github.com/rynfar/meridian
