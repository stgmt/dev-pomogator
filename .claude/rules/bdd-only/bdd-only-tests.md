# BDD-only tests — no new non-BDD test files (staged)

The repo is migrating to **BDD-only**: every test is a traceable `@featureN` cucumber scenario that
drives the real code. The goal is **zero `*.test.ts`**. New test work goes to BDD, not vitest/jest/
pytest/xunit unit files.

## Rule (enforced by a PreToolUse hook)

`tools/bdd-only-test-guard/guard.ts` (builtins-only, fail-open) runs on `Write|Edit`:

- **DENY** `Write` of a **NEW** non-BDD test file — `*.test.ts` / `*.test.tsx` / `*.spec.[tj]sx` /
  `test_*.py` / `*_test.py` / `*_test.go` / `*Tests.cs` / `*Test.cs`.
- **ALLOW** `Edit`/`MultiEdit` of an **existing** non-BDD test file (staged: the ~120-file tail is
  migrated and deleted over time — editing existing ones during the transition is permitted).
- **ALLOW** always: `*.feature`, `tests/step_definitions/`, `tests/hooks/`, fixture trees
  (`tests/fixtures/`, any `__fixtures__/`). Fixture DATA legitimately contains files literally named
  `*.test.ts` (e.g. a deliberate fake-positive fixture) — never blocked.

Once the tail is fully migrated (no `*.test.ts` left) the staged guard is effectively total.

## How to write a test instead

1. Add a `Scenario` with a real `@featureN` tag to `.specs/<slug>/<slug>.feature` (the `@featureN` MUST
   map to the FR whose subject the scenario tests).
2. Implement the step-def under `tests/step_definitions/feature_<slug>.ts` driving the REAL code
   (import a `tools/`/`.claude/skills/` module in-process, or spawn the real CLI) — **real fixtures from
   `tests/fixtures/`, never inline fakes/mocks**; per-scenario isolation via the `V4World` Before/After
   hooks (`tests/hooks/before-after.ts`).
3. Wire the `.feature` into `cucumber.json` once step-defs exist.

Use the `bdd-migrator` agent for migrating an existing vitest twin (it carries the full playbook,
including the mutation-surface technique: Scenario Outline + Examples + `stryker.bdd` + `verify-kill`).

## Escape (logged, anti-gaming)

Set env `BDD_ONLY_SKIP=1` for the one write → allowed and recorded in
`.claude/logs/bdd-only-escapes.jsonl` (`{ts,file,tool,reason,session_id,cwd}`). Use only for a genuine
exception (e.g. a third-party scaffolder); a new non-BDD test should otherwise be authored as BDD.

## Reliability

The guard is **builtins-only** (`node:fs`/`node:path`) so it runs for plugin users with no installed
deps (rule: `dead-integration-guard`), and **fail-open** — any error → allow (never blocks on a guard
bug). Decision logic is the pure exported `bddOnlyDecision(tool, filePath, exists)`, BDD-tested.

## История

Создано 2026-06-21 в рамках полного перехода на BDD-only (план `iridescent-giggling-lemur`, спека
`.specs/bdd-only-migration`). Владелец: «хук запрет на любые другие тесты кроме BDD на уровне файлов»,
поэтапный режим — блокировать только создание новых, правки существующих разрешены до их миграции.
