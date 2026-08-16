---
name: research-workflow
description: |
  Use this skill for technical research workflows: investigating libraries, frameworks, APIs, code patterns, or external documentation. Guides through 4-phase research cycle (Уточнение → Исследование → Верификация → Отчёт) with HYPOTHESIS-FIRST verification across MCP tools, GitHub code search, and Web Search. Triggers (Russian): "исследуй", "найди", "погугли", "ресерч". Triggers (English): "research", "investigate", "find", "google", "look up". The skill is also invoked by create-spec via Skill("research-workflow") during Phase 1 step 5 when filling RESEARCH.md technical findings. Each hypothesis MUST be verified across ≥3 INDEPENDENT sources (not just 3 search hits) with direct quotes and explicit [VERIFIED]/[UNVERIFIED]/[ASSUMED]/[SINGLE_SOURCE] markers in output. Schema/API/protocol questions REQUIRE exhaustive field enumeration, not "key fields". Do NOT use for refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.
allowed-tools: Read, Glob, Grep, Bash, WebFetch, WebSearch
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/research-workflow`](../.claude/skills/research-workflow/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
