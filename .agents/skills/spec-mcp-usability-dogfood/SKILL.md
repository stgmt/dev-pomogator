---
name: spec-mcp-usability-dogfood
description: >
  Harvest REAL usability friction with the spec-graph MCP door (`mcp__dev-pomogator-specs__*`) out of
  Claude Code SESSION TRANSCRIPTS, so the painful spots surface as DATA (errors, retries, door-bypasses)
  instead of being re-typed from memory. Sibling of `spec-mcp-dogfood`: that one checks each tool WORKS
  (runtime), THIS one checks how USABLE each tool is (lived friction across past sessions). INVOKE after
  a session where the door felt clunky, before improving door DX (tool descriptions / error messages),
  or periodically to rank what to fix next. Triggers (EN): "dogfood spec mcp usability", "what door
  tools were painful", "mine session logs for mcp friction", "rank door DX fixes". Triggers (RU):
  "догфуд юзабилити спек-mcp", "что в двери было неудобно", "собери трение по двери из сессий",
  "где мучился с mcp дверью". Do NOT use to check if tools WORK (that is `spec-mcp-dogfood`), nor for the
  honest DONE verdict (`get_coverage` / `spec-status`).
allowed-tools: Bash, Read
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-mcp-usability-dogfood`](../.claude/skills/spec-mcp-usability-dogfood/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
