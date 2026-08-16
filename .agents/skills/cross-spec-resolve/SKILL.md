---
name: cross-spec-resolve
description: |
  Sibling to cross-spec-reconcile — walks the user through every finding
  in `.specs/<slug>/consistency-report.yaml` interactively. For each one
  it emits a 5-field explanation (code/severity/class, files/lines,
  plain-language description, WHY it matters, available options), then
  applies the chosen fix. Three resolution paths for
  `impl-drift/architectural-decision-vs-reality`:
    A — update the spec (decision was wrong)
    B — update the code (reality was wrong)
    C — defer with explicit OUT_OF_SCOPE marker
  Foreign-spec edits (modifying another slug's `.md`) fire an additional
  confirmation banner.
allowed-tools: mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__apply_spec_change, mcp__dev-pomogator-specs__propose_spec_change, Bash, Edit, AskUserQuestion
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/cross-spec-resolve`](../.claude/skills/cross-spec-resolve/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
