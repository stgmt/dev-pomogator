---
name: use-claude-subscription
description: |
  Wire up the current project to use the user's Claude subscription via
  the local Anthropic-compatible proxy (claude-proxy-infra / Meridian on
  http://127.0.0.1:3456) instead of an ANTHROPIC_API_KEY. Detects the
  project's language stack (Python, Node.js, Go, etc.), edits .env files
  with the right env vars, handles Windows VPN/NO_PROXY quirk, ensures the
  proxy is alive (delegating to proxy-up skill if needed), and verifies
  end-to-end with a smoke test. Use whenever the user says "use claude
  here", "wire claude in this project", "claude через подписку",
  "хочу клода в этом проекте без ключа", "анthropic api без ключа",
  "set up claude api locally", "use my claude subscription here".
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Skill
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/use-claude-subscription`](../.claude/skills/use-claude-subscription/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
