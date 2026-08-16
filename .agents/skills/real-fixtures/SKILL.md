---
name: real-fixtures
description: >
  Build REAL test fixtures from ANY external producer's actual output, on ANY
  stack / language / test framework — instead of hand-fabricated data that fakes
  the producer's shape and masks bugs. One universal recipe: capture a real
  sample, trim it to a valid minimal subset spanning the result space, document
  provenance + ground-truth, and generate an integration test (in the project's
  own framework) that reconciles with the tool's own summary. Works for test
  runners (cucumber / pytest / JUnit / xUnit / go test / cargo), git, CLI/JSON,
  HTTP & API responses, DB dumps, compilers, message queues — anything with a
  real producer. Triggers (RU): "сделай нормальную фикстуру", "нормальные
  фикстуры", "фикстура из реального вывода", "захвати реальный вывод", "скил для
  фикстур". Triggers (EN): "real fixture", "capture real output", "fixture from
  real tool", "stop faking fixtures", "proper test fixtures". Use when building
  or fixing a parser / ingester / adapter / client for external output on any
  stack, or when synthetic fixtures are suspected of faking the producer's shape.
  Do NOT use for pure-logic unit tests that have no external producer.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/real-fixtures`](../.claude/skills/real-fixtures/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
