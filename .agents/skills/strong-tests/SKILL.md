---
name: strong-tests
description: >
  Use this skill BEFORE writing any tests OR when user reports
  "тесты слабые / fake-positive / проходят но баги пропускают /
  coverage высокий но mutation score низкий".
  Triggers (RU): "напиши крепкие тесты", "сильные тесты",
  "mutation testing", "переписать тесты сильнее",
  "проверь тесты на крепкость",
  "шаг UndefinedStep / не найден но метод есть",
  "тест выглядит багом Reqnroll/фреймворка / binding не регистрируется".
  Triggers (EN): "write strong tests", "strengthen tests",
  "mutation-resistant tests", "fix weak tests",
  "no fake-positive tests".
  Skill enforces 12-point self-eval checklist + mutation testing
  feedback loop + property-based testing patterns. Auto-detects
  framework (vitest/jest, pytest, JUnit, xUnit, Go, Rust) from
  project config.
  NOT for: mocking-heavy unit tests, perf benchmarks, e2e UI tests.
argument-hint: "[<test-file-path>] [--mode=greenfield|audit|mutate] [--threshold=70]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, AskUserQuestion, Skill
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/strong-tests`](../.claude/skills/strong-tests/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
