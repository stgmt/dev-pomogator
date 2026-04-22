# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи `onboard-repo-phase0`.

См. также: [README.md](README.md), [TASKS.md](TASKS.md), [DESIGN.md](DESIGN.md).

## Extension: onboard-repo (NEW)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/onboard-repo/extension.json` | create | [FR-13](FR.md#fr-13-delivered-as-dev-pomogator-extension-feature13) — new extension manifest с полным purview (files, tools, toolFiles, rules, ruleFiles, hooks, crossExtensionModifies) |
| `extensions/onboard-repo/README.md` | create | Stage-1 документация extension — обзор фичи, installation hint, links на spec |
| `extensions/onboard-repo/tools/onboard-repo/phase0.ts` | create | [FR-1](FR.md#fr-1-auto-trigger-phase-0-при-первом-create-spec-в-репо-feature1) — main orchestrator Phase 0 pipeline |
| `extensions/onboard-repo/tools/onboard-repo/steps/archetype-triage.ts` | create | [FR-8](FR.md#fr-8-archetype-triage-2-min-перед-deep-scan-feature8) — Step 1 (9 архетипов) |
| `extensions/onboard-repo/tools/onboard-repo/steps/parallel-recon.ts` | create | [FR-7](FR.md#fr-7-parallel-explore-subagents-для-recon-feature7) — Step 2 (3 parallel Explore subagents) |
| `extensions/onboard-repo/tools/onboard-repo/steps/ingestion.ts` | create | [FR-2](FR.md#fr-2-typed-artifact-specsonboardingjson-ai-first-schema-feature2-feature10) — Step 3 (repomix + fallback) |
| `extensions/onboard-repo/tools/onboard-repo/steps/baseline-tests.ts` | create | [FR-5](FR.md#fr-5-baseline-test-run-через-run-tests-feature5) — Step 4 (invoke /run-tests skill) |
| `extensions/onboard-repo/tools/onboard-repo/steps/scratch-findings.ts` | create | [FR-14](FR.md#fr-14-scratch-file-для-крупных-репо-feature14) — Step 5 (scratch file для >500 files) |
| `extensions/onboard-repo/tools/onboard-repo/steps/text-gate.ts` | create | [FR-6](FR.md#fr-6-text-gate-перед-phase-1-discovery-feature6) — Step 6 (user confirmation loop) |
| `extensions/onboard-repo/tools/onboard-repo/steps/finalize.ts` | create | [FR-2](FR.md#fr-2-typed-artifact-specsonboardingjson-ai-first-schema-feature2-feature10), [FR-9](FR.md#fr-9-prose-artifact-specsonboardingmd-6-секционный-отчёт-feature9), [FR-15](FR.md#fr-15-dual-render-из-single-source-of-truth-feature15) — Step 7 (atomic write + invoke renderers) |
| `extensions/onboard-repo/tools/onboard-repo/renderers/render-rule.ts` | create | [FR-15](FR.md#fr-15-dual-render-из-single-source-of-truth-feature15) — render `.claude/rules/onboarding-context.md` из `.onboarding.json` |
| `extensions/onboard-repo/tools/onboard-repo/renderers/compile-hook.ts` | create | [FR-3](FR.md#fr-3-pretooluse-hook-compiled-из-commands-блока-feature3), [FR-15](FR.md#fr-15-dual-render-из-single-source-of-truth-feature15) — compile PreToolUse hook block + smart merge в settings.local.json |
| `extensions/onboard-repo/tools/onboard-repo/lib/git-sha-cache.ts` | create | [FR-4](FR.md#fr-4-git-sha-cache-invalidation-feature4), [FR-16](FR.md#fr-16-manual-refresh-через---refresh-onboarding-feature4) — cache invalidation logic |
| `extensions/onboard-repo/tools/onboard-repo/lib/schema-validator.ts` | create | [FR-20](FR.md#fr-20-json-schema-validation-onboardingjson) — AJV wrapper |
| `extensions/onboard-repo/tools/onboard-repo/lib/subagent-merge.ts` | create | [FR-7](FR.md#fr-7-parallel-explore-subagents-для-recon-feature7), NFR-R4 — merge 3 parallel subagent outputs с priority rules |
| `extensions/onboard-repo/tools/onboard-repo/lib/ignore-parser.ts` | create | [FR-17](FR.md#fr-17-respect-cursorignore--aiderignore--gitignore-feature2) — parse `.cursorignore`/`.aiderignore`/`.gitignore` |
| `extensions/onboard-repo/tools/onboard-repo/lib/secret-redaction.ts` | create | [NFR-S1](NFR.md#security) — redact secret patterns из generated content перед write |
| `extensions/onboard-repo/tools/onboard-repo/schemas/onboarding.schema.json` | create | [FR-20](FR.md#fr-20-json-schema-validation-onboardingjson) — JSON Schema Draft 2020-12 |
| `extensions/onboard-repo/tools/onboard-repo/templates/onboarding.md.template` | create | [FR-9](FR.md#fr-9-prose-artifact-specsonboardingmd-6-секционный-отчёт-feature9) — 6-секционный шаблон (порт rpa-init дословно) |
| `extensions/onboard-repo/tools/onboard-repo/templates/onboarding-context.md.template` | create | [FR-15](FR.md#fr-15-dual-render-из-single-source-of-truth-feature15) — managed rule template с marker block |
| `extensions/onboard-repo/tools/onboard-repo/templates/pretool-hook.json.template` | create | [FR-3](FR.md#fr-3-pretooluse-hook-compiled-из-commands-блока-feature3) — hook block structure |
| `extensions/onboard-repo/tools/onboard-repo/templates/archetype-signals.json` | create | [FR-8](FR.md#fr-8-archetype-triage-2-min-перед-deep-scan-feature8) — signal-файл → archetype mapping |
| `extensions/onboard-repo/package.json` | create | Локальный package.json для extension — depends на `ajv` + `glob` + `fs-extra` |

## Rules (NEW)

| Path | Action | Reason |
|------|--------|--------|
| `.claude/rules/onboard-repo/onboarding-artifact-ai-centric.md` | create | [FR-10](FR.md#fr-10-ai-specific-секции-обязательны-не-только-generic-metadata-feature10) — enforce AI-first content, checklist 6 AI-specific секций, примеры hardcoded-prevention |
| `.claude/rules/onboard-repo/commands-via-skill-reference.md` | create | [FR-18](FR.md#fr-18-commands-via-skill-reference-не-hardcode-feature3-feature15) — enforce via_skill reference когда skill exists, block hardcoded raw commands |

## Cross-extension modifications

| Path | Action | Reason |
|------|--------|--------|
| `.claude/rules/specs-workflow/specs-management.md` | edit | [FR-1](FR.md#fr-1-auto-trigger-phase-0-при-первом-create-spec-в-репо-feature1) — add `### PHASE 0: Repo Onboarding` перед `### PHASE 1: Discovery`. Document triggering logic, cache policy, 7 steps. |
| `.claude/skills/create-spec/SKILL.md` | edit | [FR-1](FR.md#fr-1-auto-trigger-phase-0-при-первом-create-spec-в-репо-feature1) — add detection logic: если `.specs/.onboarding.json` missing → invoke Phase 0 before Phase 1. Handle `--onboard` / `--refresh-onboarding` / `--skip-onboarding` flags. |
| `extensions/specs-workflow/tools/specs-generator/spec-status.ts` | edit | [FR-1](FR.md#fr-1-auto-trigger-phase-0-при-первом-create-spec-в-репо-feature1) — add state `Onboarding` перед `Discovery` в state machine. Handle `-ConfirmStop Onboarding`. Update `.progress.json` schema. |
| `extensions/specs-workflow/extension.json` | edit | [FR-13](FR.md#fr-13-delivered-as-dev-pomogator-extension-feature13) — declare `consumedBy: ["onboard-repo"]` cross-reference для manifest integrity |
| `src/updater/managed-registry.ts` (или эквивалент) | edit | [FR-19](FR.md#fr-19-managed-files-tracking-через-sha-256) — register 5 new managed paths types: `.specs/.onboarding.json`, `.specs/.onboarding.md`, `.specs/.onboarding-history/**`, `.claude/rules/onboarding-context.md`, hook block identifier |
| `CLAUDE.md` | edit | [claude-md-glossary](../../../.claude/rules/claude-md-glossary.md) rule — add rows для 2 новых правил в Always-apply таблицу |

## Documentation

| Path | Action | Reason |
|------|--------|--------|
| `README.md` (root) | edit | Add row в Плагины table: `onboard-repo — Phase 0 Repo Onboarding для create-spec workflow` |

## Tests: BDD Feature + Integration

| Path | Action | Reason |
|------|--------|--------|
| `tests/features/onboard-repo/onboard-repo-phase0.feature` | create | [spec-test-sync](../../../.claude/rules/plan-pomogator/spec-test-sync.md) — BDD сценарии для @feature1..@feature15, сопоставлены с [AC-1..AC-20](ACCEPTANCE_CRITERIA.md) |
| `tests/e2e/onboard-repo/phase0.test.ts` | create | [integration-tests-first](../../../.claude/rules/integration-tests-first.md) — integration tests для UC-1..UC-13 через spawnSync реального phase0.ts + fake repos fixtures |
| `tests/e2e/onboard-repo/cache-invalidation.test.ts` | create | AC-4 — тесты git-SHA cache (UC-2 cache hit, UC-3 drift, UC-4 manual refresh) |
| `tests/e2e/onboard-repo/text-gate.test.ts` | create | AC-6 — тесты text gate с simulated user responses (iteration, abort, confirm) |
| `tests/e2e/onboard-repo/rendering.test.ts` | create | AC-15 — тесты dual-render (render-rule + compile-hook), verify hook content structure |
| `tests/e2e/onboard-repo/archetype-detection.test.ts` | create | AC-8 — тесты для 9 архетипов через F-1..F-7 fake repos |
| `tests/e2e/onboard-repo/schema-validation.test.ts` | create | AC-2, AC-10, AC-20 — schema validation с valid/invalid JSON fixtures (F-16..F-18) |
| `tests/e2e/onboard-repo/coexistence-init.test.ts` | create | AC-12 — coexistence с /init (pre-seed CLAUDE.md, assert unchanged) |
| `tests/e2e/onboard-repo/helpers.ts` | create | [no-test-helper-duplication](../../../.claude/rules/test-quality/no-test-helper-duplication.md) — shared helpers: `setupFakeRepo()`, `mockSubagents`, `mockSkill`, `seedOnboardingJson()`, `snapshotRegistry()`, `restoreRegistry()` |
| `tests/e2e/onboard-repo/hooks/before-each.ts` | create | DESIGN.md > BDD Test Infrastructure > Новые hooks — per-scenario setup |
| `tests/e2e/onboard-repo/hooks/after-each.ts` | create | DESIGN.md > BDD Test Infrastructure > Новые hooks — per-scenario cleanup |
| `tests/e2e/onboard-repo/hooks/mock-subagent.ts` | create | DESIGN.md > BDD Test Infrastructure > Новые hooks — mock Claude Code Explore subagent |

## Tests: Fixtures

| Path | Action | Reason |
|------|--------|--------|
| `tests/fixtures/onboard-repo-fake-repos/fake-python-api/` | create | [FIXTURES.md#F-1](FIXTURES.md#f-1-fake-python-api) — FastAPI minimal repo |
| `tests/fixtures/onboard-repo-fake-repos/fake-nodejs-backend/` | create | [FIXTURES.md#F-2](FIXTURES.md#fixture-inventory) — Express minimal repo |
| `tests/fixtures/onboard-repo-fake-repos/fake-nextjs-frontend/` | create | [FIXTURES.md#F-3](FIXTURES.md#f-3-fake-nextjs-frontend) — Next.js minimal repo |
| `tests/fixtures/onboard-repo-fake-repos/fake-fullstack-monorepo/` | create | [FIXTURES.md#F-4](FIXTURES.md#f-4-fake-fullstack-monorepo) — Turborepo minimal |
| `tests/fixtures/onboard-repo-fake-repos/fake-dotnet-service/` | create | [FIXTURES.md#F-5](FIXTURES.md#fixture-inventory) — .NET minimal |
| `tests/fixtures/onboard-repo-fake-repos/fake-empty/` | create | [FIXTURES.md#F-6](FIXTURES.md#f-6-fake-empty-repo) — только README |
| `tests/fixtures/onboard-repo-fake-repos/fake-no-tests/` | create | [FIXTURES.md#F-7](FIXTURES.md#f-7-fake-no-tests) — python-api без tests/ |
| `tests/fixtures/onboard-repo-fake-repos/fake-no-git/` | create | [FIXTURES.md#F-8](FIXTURES.md#f-8-fake-no-git) — валидный репо без .git/ |
| `tests/fixtures/onboard-repo-fake-repos/fake-with-cursorignore/` | create | [FIXTURES.md#F-10](FIXTURES.md#f-10-fake-with-cursorignore) — python-api + .cursorignore |
| `tests/fixtures/onboard-repo-fake-repos/factories/large-repo.ts` | create | [FIXTURES.md#F-9](FIXTURES.md#f-9-fake-large-repo-factory) — factory для >500 файлов |
| `tests/fixtures/subagent-outputs/python-api.json` | create | [FIXTURES.md#F-11](FIXTURES.md#f-11-subagent-output-python-api) — mock subagent response |
| `tests/fixtures/subagent-outputs/nodejs-frontend.json` | create | [FIXTURES.md#F-12](FIXTURES.md#fixture-inventory) — mock |
| `tests/fixtures/subagent-outputs/monorepo.json` | create | [FIXTURES.md#F-13](FIXTURES.md#fixture-inventory) — mock |
| `tests/fixtures/subagent-outputs/empty.json` | create | [FIXTURES.md#F-14](FIXTURES.md#fixture-inventory) — mock для empty repo |
| `tests/fixtures/subagent-outputs/subagent-b-crash.json` | create | [FIXTURES.md#F-15](FIXTURES.md#f-15-subagent-output-crash) — partial failure simulation |
| `tests/fixtures/onboarding-artifacts/valid-v1.json` | create | [FIXTURES.md#F-16](FIXTURES.md#f-16-valid-onboarding-json-v1) — golden reference valid JSON |
| `tests/fixtures/onboarding-artifacts/stale-sha.json` | create | [FIXTURES.md#F-17](FIXTURES.md#f-17-stale-onboarding-json) — for UC-3 drift test |
| `tests/fixtures/onboarding-artifacts/invalid-schema.json` | create | [FIXTURES.md#F-18](FIXTURES.md#f-18-invalid-schema-onboarding) — schema violation test |
| `tests/fixtures/skills/run-tests-mock.ts` | create | [FIXTURES.md#F-20](FIXTURES.md#f-20-run-tests-skill-mock) — mock /run-tests skill |

## Documentation & Specs

| Path | Action | Reason |
|------|--------|--------|
| `.specs/onboard-repo-phase0/**` | create (already done) | This spec itself (Phase 1 complete, Phase 2-3 in progress) |

## Summary по action

| Action | Count |
|--------|-------|
| `create` | 52 |
| `edit` | 6 |

## Path validation notes

- Все paths relative от project root (compliance с no-unvalidated-manifest-paths rule)
- Пути с `{placeholder}` в этой таблице ЗАПРЕЩЕНЫ — все конкретны
- Test fixtures в `tests/fixtures/onboard-repo-fake-repos/` суммарно ≤ 5MB (FIXTURES.md retention policy)
- Subagent output JSON files ≤ 50KB каждый
