---
name: spec-review
description: |
  Семантическое pre-stop ревью спеки/кода через 16 категорий: external claims, acceptance-to-delivery coverage, antipatterns, assumption-vs-requirement, memory-constraint compliance, reality-drift и др. Используй ПЕРЕД каждым ConfirmStop в specs-management workflow И после каждой implementation phase. Триггеры — "сам ревью", "проверь спеку", "ревью перед стопом", "review phase N", "spec-review", "pre-stop check". Skip when — spec не существует, активной фазы нет в .progress.json, или пользователь явно отказался.
license: Apache 2.0
allowed-tools:
  - "mcp__dev-pomogator-specs__read_spec_doc"
  - "mcp__dev-pomogator-specs__list_spec_docs"
  - "mcp__dev-pomogator-specs__list_specs"
  - "mcp__dev-pomogator-specs__get_node"
  - "mcp__dev-pomogator-specs__search"
  - "mcp__dev-pomogator-specs__apply_spec_change"
  - "mcp__dev-pomogator-specs__validate_spec"
  - "mcp__dev-pomogator-specs__propose_spec_repairs"
  - "Read"
  - "Grep"
  - "Glob"
  - "Bash(bash:*)"
  - "Bash(node:*)"
  - "Bash(grep:*)"
  - "WebFetch"
  - "Edit"
  - "Agent"
  - "Skill"
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-review`](../.claude/skills/spec-review/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
