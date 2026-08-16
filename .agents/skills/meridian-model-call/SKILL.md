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

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/meridian-model-call`](../.claude/skills/meridian-model-call/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
