---
name: task-status
description: |
  Use when you change ANY spec entity's status through the centralized door,
  especially before starting work (moving a task to `ready` or `in-progress`)
  or confirming a spec PHASE STOP. It is the validated path: read the
  requirement's trace chain, confirm it is assembled, then set status through
  the door's `set_entity_status` tool. Covers tasks (5-status machine), spec
  phases (confirm STOP, gated on prior STOPs), and derived entities
  (FR/story/decision are refused because their status is computed). Explains
  why a start is refused and how to unblock it. Trigger phrases include taking
  a task into work, setting task status, and confirming a phase STOP.
allowed-tools: mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__get_node, mcp__dev-pomogator-specs__get_spec_status, mcp__dev-pomogator-specs__set_entity_status, mcp__dev-pomogator-specs__set_spec_status, mcp__dev-pomogator-specs__read_spec_doc
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/task-status`](../.claude/skills/task-status/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
