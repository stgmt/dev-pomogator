---
name: headroom-beta
description: |
  Optional beta installer/doctor for Claude Code through Headroom. Use when the user asks to set up, repair, verify, roll back, or inspect the dev-pomogator Headroom chain: Claude Code -> Headroom -> sub2api -> Codex/OpenAI subscription, or Claude Code -> Headroom -> Anthropic direct. Triggers: "Headroom", "sub2api", "Claude Code через Codex", "gpt-5.6-sol", "Token Savings 0", "настрой прокси", "перепрошей Claude Code".
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

# Headroom Beta

This skill manages the dev-pomogator Headroom beta. It is opt-in because it changes
the global Claude Code request path.

## Install

Use the installer from the plugin root:

```bash
npx tsx tools/headroom-beta/install.ts --enable --topology codex-sub2api --runtime auto
```

For a proof-only pass:

```bash
npx tsx tools/headroom-beta/install.ts --enable --topology codex-sub2api --runtime auto --dry-run
```

Topologies:

- `codex-sub2api`: Claude Code -> Headroom -> sub2api -> OpenAI/Codex subscription.
- `anthropic-direct`: Claude Code -> Headroom -> Anthropic API.

The installer writes only dev-pomogator-owned routing/model/context settings.
It does not write `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, OAuth refresh
tokens, or provider secrets into `~/.claude/settings.json`.

## Defaults

For the Codex/sub2api path, current defaults are:

- main model: `gpt-5.6-sol`
- small/compact model: `gpt-5.3-codex-spark`
- haiku/subagent model: `gpt-5.6-terra`
- `CLAUDE_CODE_MAX_CONTEXT_TOKENS=370000`
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW=340000`
- `MAX_THINKING_TOKENS=8000`

These values are intentionally below the observed hard stop so Claude Code can
compact before the upstream model rejects the request.

## Doctor Pattern

After install, verify in this order:

1. Headroom `/health`.
2. Headroom `/stats` mode and compression counters.
3. sub2api `/v1/models` and route logs for `codex-sub2api`.
4. A tiny Claude Code `--print` smoke request through the wrapper.
5. A model-route proof for the chosen main/small/haiku models.

Report savings by layer: Headroom compression, provider prefix cache,
tool-search/RTK/context-tool filtering, and output-shaping estimates. Do not
claim proxy token savings if Headroom is in cache mode or no compressible
payload crossed the proxy.

## Rollback

The installer creates timestamped backups of Claude settings before mutation.
Rollback restores the selected backup and removes dev-pomogator-owned runtime
and startup files only; it must not delete user-created Headroom installations.
