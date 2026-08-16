---
name: runtime-dogfood
description: >
  Find dead / broken / silently-empty entrypoints in ANY tool surface by DRIVING each one
  against REAL data and recording what it actually returns — not grep, not a green suite. Works
  for any surface with many entrypoints: CLI subcommands, HTTP/API endpoints, MCP/agent tools,
  plugin commands, library exports, RPC methods, queue handlers. Catches the worst class of bug:
  a feature the test suite reaches through a SIDE-CHANNEL while the real path is broken and
  unasserted (so the suite is GREEN). INVOKE before pruning / a scope decision, after refactoring
  a handler layer or a builder the entrypoints read from, or to tell "dead-because-unused" from
  "dead-because-broken". Triggers (EN): "dogfood the tools/api/cli", "runtime census of the
  endpoints", "which commands/endpoints are dead or broken", "drive every handler on real data",
  "what does each endpoint actually return". Triggers (RU): "прогони все команды/эндпоинты на
  реальных данных", "рантайм-перепись инструментов", "какие команды мёртвые/сломанные",
  "что каждый эндпоинт реально отдаёт", "dogfood поверхности". Do NOT use to triage a RED suite
  (that's suite-failure-triage) or to write the tests themselves (tests-create-update). For the
  dev-pomogator spec-MCP specifically, use the ready-made `spec-mcp-dogfood`.
allowed-tools: Bash, Read, Grep, Glob, Write
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/runtime-dogfood`](../.claude/skills/runtime-dogfood/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
