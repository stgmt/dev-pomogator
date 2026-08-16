---
name: spec-mcp-dogfood
description: >
  Dogfood the spec-graph MCP — drive EVERY tool's real handler against the REAL `.specs/` graph
  and record what each actually returns, so you find live/dead/buggy tools by RUNTIME evidence,
  not grep. Catches the class of bug a green suite hides: a tool that's broken because the suite
  reaches its data by a side-channel (tags) the tool itself never uses (edges). INVOKE before a
  scope update / pruning decision, after changing the graph builder / parsers / tool handlers,
  or to confirm a "dead by no consumer" tool is dead-vs-just-unwired. Triggers (EN): "dogfood
  the spec mcp", "collect the mcp tool dataset", "which spec tools are dead/live at runtime",
  "runtime-check the mcp tools", "does each spec tool return data". Triggers (RU): "прогони
  dogfood спек-mcp", "собери датасет mcp тулзов", "какие тулзы живы/мертвы в рантайме",
  "проверь mcp тулзы на реальном графе". Do NOT use to write tests (tests-create-update) or for
  the FR-32 honest DONE verdict (get_coverage / spec-status).
allowed-tools: Bash, Read
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-mcp-dogfood`](../.claude/skills/spec-mcp-dogfood/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
