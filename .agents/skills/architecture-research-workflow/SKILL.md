---
name: architecture-research-workflow
description: |
  Greenfield-architecture research workflow for genuinely large features
  (rebuilds, version bumps, multi-component systems). Drives 7 sequential
  stages that emit committable markdown into `.specs/<slug>/.architecture-
  research/<N>-<stage>.md`, then merges them into a final `RESEARCH.md`
  with one Appendix per stage. Auto-invoked by `create-spec` when the
  complexity heuristic matches (RU/EN keywords: "архитектур*", "v\d+",
  "rebuild", "перепроектировать", OR ≥3 components in the prompt).
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch, mcp__dev-pomogator-specs__apply_spec_change, mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/architecture-research-workflow`](../.claude/skills/architecture-research-workflow/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
