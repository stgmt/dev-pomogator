---
name: spec-generator-orchestrator
description: Thin end-to-end orchestrator for the spec-generator-v4 workflow (scaffold → conformance → coverage → reconcile → resolve → honesty-gate). Owns ONLY the feature map + a human-merge self-improve ledger; delegates every unit of work to existing worker skills and MCP tools — never re-implements worker logic. Triggers on "run the spec workflow / orchestrate specs / end-to-end spec pipeline".
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Skill, AskUserQuestion, mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__get_spec_status, mcp__dev-pomogator-specs__get_test_result, mcp__dev-pomogator-specs__get_scenario_trace, mcp__dev-pomogator-specs__find_orphans, mcp__dev-pomogator-specs__conformance_check
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-generator-orchestrator`](../.claude/skills/spec-generator-orchestrator/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
