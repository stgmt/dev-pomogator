---
name: requirements-chk-matrix
description: >
  Builds CHK traceability matrix (CHK-FR{n}-{nn} rows linked to FR + AC/@feature/UC)
  in REQUIREMENTS.md and populates ## Key Decisions with Rationale + Trade-off + Alternatives
  blocks in DESIGN.md. Called by create-spec Phase 2 (Requirements + Design)
  step 4b. Preserves Jira trace lines byte-for-byte. Returns JSON summary of CHKs and decisions.
allowed-tools: mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__apply_spec_change, mcp__dev-pomogator-specs__propose_spec_change, mcp__dev-pomogator-specs__append_to_section, mcp__dev-pomogator-specs__insert_after_heading, mcp__dev-pomogator-specs__insert_at_eof, mcp__dev-pomogator-specs__replace_in_section, Bash, AskUserQuestion
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/requirements-chk-matrix`](../.claude/skills/requirements-chk-matrix/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
