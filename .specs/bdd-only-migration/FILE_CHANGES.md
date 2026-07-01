# File Changes

Список файлов, которые добавляются/изменяются при реализации фичи.

> ⚠️ `edit`/`delete` — только для СУЩЕСТВУЮЩИХ на диске путей. Для планируемых файлов — `create`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `tools/bdd-only-test-guard/guard.ts` | create | [FR-1](FR.md#fr-1-staged-bdd-only-test-file-guard) staged BDD-only PreToolUse guard |
| `tests/step_definitions/feature_bdd_only_guard.ts` | create | [FR-9](FR.md#fr-9-fr-1-guard-scenarios-drive-the-real-guard) step-defs driving the real guard |
| `.specs/bdd-only-migration/bdd-only-migration.feature` | create | [FR-9](FR.md#fr-9-fr-1-guard-scenarios-drive-the-real-guard) guard scenarios BDDONLY001_01..04 |
| `.claude/rules/bdd-only/bdd-only-tests.md` | create | [FR-1](FR.md#fr-1-staged-bdd-only-test-file-guard) rule documenting the BDD-only regime |
| `.claude/settings.json` | edit | [FR-1](FR.md#fr-1-staged-bdd-only-test-file-guard) register the guard hook (dogfood) |
| `.claude-plugin/hooks.json` | edit | [FR-1](FR.md#fr-1-staged-bdd-only-test-file-guard) register the guard hook (distribution) |
| `cucumber.json` | edit | [FR-9](FR.md#fr-9-fr-1-guard-scenarios-drive-the-real-guard) wire the spec feature into default.paths |
| `tools/tui-test-runner/build-staleness.ts` | edit | [FR-4](FR.md#fr-4-build-guard-updated-for-v2) remove the dead src/→dist/ staleness check |
| `Dockerfile.test.base` | edit | [FR-3](FR.md#fr-3-net-mutation-path-runs-in-docker) install .NET 8 SDK + dotnet-stryker |
| `.claude/skills/strong-tests/scripts/run-mutation.ts` | edit | [FR-2](FR.md#fr-2-detector-unit-tests-migrated-to-bdd-with-mutation-parity) drive runStrykerNet from BDD scenarios |
| `tools/bdd-migrator/migrate.ts` | edit | [FR-6](FR.md#fr-6-bdd-migrator-upgraded-for-bdd-only-with-no-exceptions) classify mutation surface as migratable |
| `tools/bdd-migrator/corpus.ts` | edit | [FR-5](FR.md#fr-5-all-vitest-tests-migrated-to-bdd) count all test roots toward netCount=0 |
| `.claude/agents/bdd-migrator.md` | edit | [FR-6](FR.md#fr-6-bdd-migrator-upgraded-for-bdd-only-with-no-exceptions) no-refusal migration playbook |
| `package.json` | edit | [FR-7](FR.md#fr-7-final-gate-switch-to-the-docker-cucumber-canonical-run) gate-switch npm test to the Docker-cucumber canonical run |
| `CLAUDE.md` | edit | [FR-1](FR.md#fr-1-staged-bdd-only-test-file-guard) glossary line for the bdd-only rule |
