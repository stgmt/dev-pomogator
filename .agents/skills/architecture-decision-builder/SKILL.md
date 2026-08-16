---
name: architecture-decision-builder
description: >
  Greenfield architecture decisions — enumerates tech-stack axes from a PRD, generates
  per-axis multi-variant markdown + self-contained HTML (rendered in browser), auto-applies
  the recommendation (auto-mode default) with optional override, cascades dependent axes.
  Standalone triggers (RU): "выбери стек", "спроектируй архитектуру", "архитектура для",
  "варианты архитектуры"; (EN): "choose stack", "design architecture", "architecture decision",
  "stack options". Also invoked by create-spec Phase 1.75 (greenfield only) once for
  axis-enumeration plus once per axis. Do NOT use for brownfield refactors (existing build
  manifest), single-tech feature decisions, or post-implementation reviews.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, WebFetch, WebSearch, ToolSearch, mcp__context7__resolve-library-id, mcp__context7__query-docs, mcp__claude_ai_Context7__resolve-library-id, mcp__claude_ai_Context7__query-docs, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__read_spec_doc
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/architecture-decision-builder`](../.claude/skills/architecture-decision-builder/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
