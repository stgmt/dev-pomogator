# File Changes

Файлы, добавленные/изменённые при реализации (все на диске, закоммичены).

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `stryker.bdd.config.mjs` | create | FR-1/FR-2 cucumber-runner + perTest + concurrency 100% |
| `cucumber.json` | edit | FR-1 stryker-bdd profile |
| `package.json` | edit | FR-1 mutation:bdd script + cucumber-runner dep |
| `tools/stryker-mutation/state.ts` | create | FR-3 atomic mutation state |
| `.claude/skills/stryker-mutation/SKILL.md` | create | FR-3 Stryker recipe skill |
| `.claude/skills/strong-tests/SKILL.md` | edit | FR-4 §6.5 coverage-breadth guidance |
| `tests/step_definitions/feature_strong_tests.ts` | edit | FR-4 step-defs for the 3 coverage-gap scenarios |
| `tools/bdd-quality-judge/judge.ts` | create | FR-5 Haiku BDD-quality judge |
| `tools/bdd-quality-judge/hook.ts` | create | FR-5 PostToolUse advisory hook |
| `.claude/settings.json` | edit | FR-5 register the judge hook (dogfood) |
| `.claude-plugin/hooks.json` | edit | FR-5 register the judge hook (distribution) |
| `.claude/agents/bdd-migrator.md` | edit | FR-6 path-limited commit discipline |
