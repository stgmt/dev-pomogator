---
name: bdd-migrator
description: |
  Migrate a spec's non-BDD (vitest) tests to traceable @featureN cucumber
  scenarios so coverage is visible in the spec graph (zero orphan tests,
  zero uncovered specs). An evolution of strong-tests §6.5. Use when a spec
  has a .feature with comment-tags / no step-defs / unwired, or vitest tests
  that are graph-invisible orphans. Drives the proven pilot conveyor:
  classify → fix tags → author real step-defs → wire → green →
  mutation-check → delete vitest. Adaptive across specs; ships for users
  running it on their own repos.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__get_spec_status, mcp__dev-pomogator-specs__apply_spec_change
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/bdd-migrator`](../.claude/skills/bdd-migrator/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
