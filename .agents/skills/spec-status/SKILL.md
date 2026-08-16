---
name: spec-status
description: >
  Honest, evidence-backed status of a spec — run it BEFORE claiming a spec/feature
  is done. Delegates verification to an INDEPENDENT sub-agent (fresh context, no
  goal-completion bias) that classifies each AC as verified / blocked / claimed-only
  with an evidence path, audits test-body quality (STRONG / WEAK / FAKE-POSITIVE-RISK),
  reads test-result recency, and separates environmental blockers from real failures.
  Triggers (RU): «статус спеки», «честный статус», «проверь готовность спеки»,
  «что реально сделано», «AC проверены?», «перед тем как сказать готово»,
  «все ли требования реализованы», «ревью реализации по спеке», «какие FR готовы»,
  «покрытие требований», «что осталось по спеке». Triggers (EN): «spec status»,
  «honest status check», «before claiming done», «is this spec actually finished»,
  «verify AC evidence», «what is really done», «are all requirements implemented»,
  «per-FR implementation review», «which FRs are done».
  Do NOT use for: writing/scaffolding a spec (use create-spec), running tests
  (use /run-tests), or general progress questions answerable from .progress.json alone.
allowed-tools: Bash, Read, Glob, Grep, Agent, mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__get_spec_status
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-status`](../.claude/skills/spec-status/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
