---
name: meridian-model-call
description: |
  HOW and WHY to make a FAST model call from our own hooks, gates, judges, and
  engine scripts. DeepSeek calls use the OpenAI-compatible AiPomogator route;
  Claude-subscription calls may use the local Meridian proxy on http://127.0.0.1:3456.
  Do not send OpenRouter model IDs to Meridian's Anthropic-compatible /v1/messages API.
  Measured: a direct Meridian call with thinking OFF ≈ 2.4s; `claude -p` ≈ 13s (it
  cold-starts MCP/hooks/plugin every call). USE THIS before writing any "spawn claude
  to judge X" code — do not reinvent the slow wheel. Triggers: "вызвать модель из хука",
  "быстрый вызов хайку", "судья на хайку", "model call from a hook/gate/judge",
  "call haiku fast", "LLM judge in a hook", "meridian api call", "как звать модель в плагине".
allowed-tools: Read, Bash, Edit, Write, Skill
---

# meridian-model-call — call a model fast from our hooks/gates/judges (via Meridian, not `claude -p`)

## Why this exists (read before writing any model-call code)

Anything in this repo that needs a model decision inside a hook/gate/judge/engine script
must use the matching provider protocol directly. DeepSeek uses AiPomogator/OpenRouter's
OpenAI-compatible API; Claude subscription calls use Meridian's Anthropic-compatible API.
Do **NOT** shell out to `claude -p`. Measured on this machine (`.dev-pomogator/.tmp/latency-probe`):

| Transport | Latency / call | Why |
|---|---|---|
| `claude -p --model haiku` | **~13 000 ms** | cold-starts the whole Claude Code CLI (MCP servers, hooks, plugin tree, CLAUDE.md) EVERY call |
| `claude -p --bare` (via proxy) | ~5 000 ms | `--bare` skips MCP/hooks/plugin, but the CLI wrapper still costs ~5s |
| Meridian `/v1/messages`, thinking ON | ~7 000 ms | the model reasons before the verdict |
| **Meridian `/v1/messages`, thinking OFF** | **~2 400 ms** | direct HTTP, no CLI, no reasoning — **use this** |

`claude -p` for a binary judgment is the slow/dumb wheel. Direct HTTP avoids CLI startup.
Choose AiPomogator/OpenRouter for DeepSeek and Meridian only for Claude-subscription models.

## The recipe for DeepSeek

1. Query `GET {AUTO_COMMIT_LLM_URL}/models` with `AUTO_COMMIT_API_KEY`.
2. Select only a returned compatible route; the expected AiPomogator route is
   `openrouter/deepseek/deepseek-v4-flash`. Never invent it by prefixing the direct ID.
3. Call `POST {AUTO_COMMIT_LLM_URL}/chat/completions` with that verified route.
4. On catalog/provider failure, emit a secret-free diagnostic and fail open without Haiku fallback.

Use `tools/_shared/deepseek-model.ts::selectAipomogatorDeepSeek` rather than reimplementing
catalog parsing, selection, cache, or failure codes. Direct OpenRouter calls use
`deepseek/deepseek-v4-flash`.

For a Claude-subscription call, Meridian remains available through its Anthropic-compatible
`/v1/messages` endpoint, but its model ID must be one accepted by Meridian — never an OpenRouter ID.

## FAIL-OPEN — never hard-depend on Meridian

A plugin-distributed hook runs on machines where Meridian may be down or not installed.
The caller MUST degrade, never block on the proxy:

1. Probe first: `curl -s -m 3 http://127.0.0.1:3456/health` → expect `{"status":...,"auth":...}`.
2. If unreachable / non-200 → **skip the model call and fall back** (e.g. the stop-gate keeps
   its instant fact-gate + regex; FR-8 marks SEMANTIC_SKIPPED). Do not error, do not hang.
3. To bring it up: invoke `Skill("proxy-up")` (health → start → reauth decision tree).

## When to use which skill

| Need | Skill |
|---|---|
| Make a model call from OUR hook/judge/engine | **this** (the recipe above) |
| Proxy down / 503 / start-restart-reauth Meridian | `proxy-up` |
| Wire an EXTERNAL project's `.env` to the subscription | `use-claude-subscription` |
| Install/autostart Meridian for plugin users | infra ships in the plugin at `<plugin-root>/tools/claude-subscription-proxy/`; a SessionStart hook (`ensure-up.cjs`) auto-starts it (fail-open, `MERIDIAN_AUTOSTART=false` to opt out); container reuses the host Claude login (no separate `claude login`); `proxy-up` for manual ops |

## Anti-patterns

- ❌ `spawnSync('claude', ['-p', ...])` for a judgment — ~13s cold-start; use Meridian (~2.4s).
- ❌ Leaving `thinking` on for a binary classifier/judge — wastes ~3-5s.
- ❌ Hard-failing when the proxy is down — always fail-open to the dep-free path.
- ❌ Putting an `ANTHROPIC_API_KEY` in code/hooks — Meridian uses the subscription; no key.
- ❌ Burning subscription budget on health checks — `/health` is local, doesn't hit upstream.

## History

Created 2026-06-14 after the FR-49 stop-gate-judge prototype measured `claude -p` at ~13s
(unusable per-stop) vs Meridian-direct-thinking-off at ~2.4s. The owner: «встрой Meridian в
плагин… и скил сделай как и нахуя юзать, чтоб не придумывать велосипеды медленные». This
skill is the canonical answer so no future agent reinvents the `claude -p` slow path.
