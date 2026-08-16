---
name: anchor-fix
description: >
  Keep spec/markdown cross-reference links clickable in the editor (Marksman) when
  you RENAME a heading. Long descriptive headings (`## FR-7: Title`) are Marksman's
  standard, but their GLFM slug is derived from the heading TEXT — so renaming a
  heading silently breaks every inbound `[text](file.md#old-slug)` link. This skill
  DETECTS broken anchors and AUTO-FIXES them: ~99% deterministically (id-bearing
  links), the rest via `claude -p`. INVOKE after renaming/retitling a heading,
  before declaring spec work done, or to clean a corpus of broken anchors.
  Triggers (RU): "почини якоря", "битые ссылки в спеках", "переименовал заголовок
  ссылки", "anchor fix", "проверь ссылки спек". Triggers (EN): "fix broken anchors",
  "spec links broken after rename", "check spec link integrity", "anchor integrity".
allowed-tools: Bash, Read, Edit, Grep, Glob
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/anchor-fix`](../.claude/skills/anchor-fix/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
