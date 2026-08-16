---
name: spec-reality-check
description: |
  Verify spec docs against repository reality. Auto-trigger when the user asks to create, modify, supplement, or implement a spec, or explicitly asks to verify spec readiness.

  EN triggers — create: "create spec", "scaffold spec", "new spec for". Modify: "modify spec", "update spec", "change spec for". Supplement: "supplement spec", "extend spec", "add FR to spec", "add AC to spec". Implement: "implement spec", "implement feature spec", "verify spec ready", "ready to ship spec".
  EN general: "verify spec ready", "spec reality check", "check spec drift", "spec drift", "spec docs vs reality".

  RU триггеры — создать: "создай спеку", "новая спека", "сделай спеку для". Изменить: "измени спеку", "обнови спеку", "поменяй спеку". Дополнить: "дополни спеку", "добавь FR", "добавь AC", "расширь спеку". Реализовать: "реализуй спеку", "имплементируй спеку", "запили фичу по спеке", "сверь спеку с кодом".
  RU общие: "проверь спеку", "сверить с реальностью", "drift в спеке", "файлы из спеки существуют?".

  Skill detects six classes of spec-vs-reality drift via `scripts/verify.ts` and supports JSON/human/markdown output formats. Pairs with PreToolUse hook on ExitPlanMode (mechanical backup). Outputs `AuditFinding[]` shape (same as audit-spec.ts).
allowed-tools: Read, Glob, Grep, Bash, Skill
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-reality-check`](../.claude/skills/spec-reality-check/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
