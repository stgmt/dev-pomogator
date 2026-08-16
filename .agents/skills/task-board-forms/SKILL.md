---
name: task-board-forms
description: >
  Enriches TASKS.md with Done When / Status / Est fields per task and regenerates
  the ## Task Summary Table header via spec-status.ts -Format task-table. Idempotent
  (replaces auto-generated block between markers). Called by create-spec Phase 3
  (Finalization) step 1b. Returns JSON summary of tasks enriched.
allowed-tools: mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__apply_spec_change, mcp__dev-pomogator-specs__propose_spec_change, mcp__dev-pomogator-specs__append_to_section, mcp__dev-pomogator-specs__insert_after_heading, mcp__dev-pomogator-specs__insert_at_eof, mcp__dev-pomogator-specs__replace_in_section, Bash, AskUserQuestion
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/task-board-forms`](../.claude/skills/task-board-forms/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
