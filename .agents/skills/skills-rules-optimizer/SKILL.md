---
name: skills-rules-optimizer
description: >
  Optimizes .claude/rules/ AND .claude/skills/ — audit (token count, frontmatter
  validation, allowed-tools coverage, oversize cap), triple-axis Jaccard overlap
  detection between skills, LLM-driven merge synthesis through Claude Code
  sub-agent, ratchet (regression prevention) via independent scorer. Called
  automatically from suggest-rules Phase 6 after rule creation. Can also be
  invoked manually.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, mcp__context7__resolve-library-id, mcp__context7__query-docs
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/skills-rules-optimizer`](../.claude/skills/skills-rules-optimizer/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
