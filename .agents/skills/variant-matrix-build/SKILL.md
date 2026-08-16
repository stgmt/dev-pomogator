---
name: variant-matrix-build
description: Phase-2 sub-skill that detects polymorphic FRs (shared pipeline + per-variant dispatch) and populates variant matrix artifacts — AC Decision Table, Gherkin Scenario Outline + Examples, per-variant tasks. Invoked by create-spec Phase 2 step 4c. Returns JSON summary. Mirrors requirements-chk-matrix shape.
disable-model-invocation: true
allowed-tools: mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__apply_spec_change, mcp__dev-pomogator-specs__propose_spec_change, Bash, AskUserQuestion
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/variant-matrix-build`](../.claude/skills/variant-matrix-build/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
