---
name: create-spec
description: |
  Creates and manages feature specifications under .specs/{slug}/ via 13-file scaffold + 4-phase STOP-confirmed workflow (Discovery → Context → Requirements+Design → Finalization) + Phase 3+ Audit. EN triggers: "create / make / draft / write / sketch / outline specs", "spec out X", "scaffold a spec", "update / show / status specs". RU triggers: "создай / сделай / набросай / напиши / опиши спеки", "новые спеки для X", "спеки по фиче", "обнови / покажи / статус спеков". Matches terse phrasings like "ок спеки по фиче сделай". Invokes Skill("research-workflow") during Phase 1 step 5 for technical research. Do NOT use for plan-pomogator development plans, read-only spec viewing, or non-spec workflows.
allowed-tools: mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__read_attachment, mcp__dev-pomogator-specs__apply_spec_change, mcp__dev-pomogator-specs__propose_spec_change, mcp__dev-pomogator-specs__create_spec, mcp__dev-pomogator-specs__delete_spec_doc, mcp__dev-pomogator-specs__rename_spec_doc, mcp__dev-pomogator-specs__append_to_section, mcp__dev-pomogator-specs__insert_after_heading, mcp__dev-pomogator-specs__insert_at_eof, mcp__dev-pomogator-specs__replace_in_section, mcp__dev-pomogator-specs__propose_patch, mcp__dev-pomogator-specs__apply_proposed_patch, mcp__dev-pomogator-specs__apply_spec_transaction, mcp__dev-pomogator-specs__add_backlog_task, mcp__dev-pomogator-specs__add_phase, mcp__dev-pomogator-specs__amend_requirement, mcp__dev-pomogator-specs__add_acceptance_criterion, mcp__dev-pomogator-specs__register_incident_backlog, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, WebFetch, WebSearch
argument-hint: "<feature-slug>"
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/create-spec`](../.claude/skills/create-spec/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
