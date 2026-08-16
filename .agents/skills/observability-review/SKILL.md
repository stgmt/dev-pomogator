---
name: observability-review
description: >
  See, in one view, WHERE the agent stumbled in this repo — gate bypasses (escape-hatch
  gaming), the last BDD run's reds/pendings, pending self-improve friction, and log errors.
  INVOKE when asked "where did it stumble / break", "show observability / diagnostics",
  "что сломалось / где споткнулся", "посмотри логи / диагностику", before declaring a long
  agent run done, or to audit whether gates are being gamed. Reads files only (dep-safe —
  no SpecGraph build), so it never crashes for plugin users with no node_modules.
allowed-tools: Bash, Read, Grep
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/observability-review`](../.claude/skills/observability-review/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
