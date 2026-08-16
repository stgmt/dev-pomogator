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
allowed-tools: Bash
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/proxy-up`](../.claude/skills/proxy-up/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
