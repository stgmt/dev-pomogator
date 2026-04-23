# Tasks

## TDD Workflow

Задачи организованы по TDD: Red → Green → Refactor. Каждая группа реализации (Phase 2+) начинается с привязки к @featureN BDD сценариям и завершается verify-шагом "сценарии переходят Red → Green".

## Phase -1: Infrastructure Prerequisites

> DESIGN.md упоминает: Docker E2E, AJV dependency, new env vars detection. Подготовим инфраструктуру ПЕРЕД разработкой.

- [ ] Добавить `ajv` + `ajv-formats` в `extensions/onboard-repo/package.json` dependencies. Версия `ajv@^8.12.0` [VERIFIED: https://ajv.js.org/ current stable]
- [ ] Создать `extensions/onboard-repo/package.json` с корректными dependencies (ajv, glob, fs-extra, cross-spawn — переиспользуем root dev-pomogator versions)
- [ ] Добавить в root `package.json` → `devDependencies`: `ajv-cli` для CLI validation в CI
- [ ] Создать директорию `tests/fixtures/onboard-repo-fake-repos/` + подпапки для F-1..F-10 фикстур (пустые шаблоны, будут заполнены в Phase 0)
- [ ] Создать директорию `tests/fixtures/subagent-outputs/` + `tests/fixtures/onboarding-artifacts/` + `tests/fixtures/skills/` (пустые)
- [ ] Verify: `npm install` успешно + `npx ajv --version` работает

## Phase 0: BDD Foundation (Red)

> TEST_DATA_ACTIVE (см. DESIGN.md BDD Test Infrastructure). Phase 0 содержит задачи для **каждого** hook и fixture из DESIGN.md.
>
> Все сценарии из `.feature` ДОЛЖНЫ FAIL на этом этапе (step definitions — заглушки).

### Fixtures (F-1..F-20 из FIXTURES.md)

- [ ] Создать fixture **F-1 fake-python-api**: `tests/fixtures/onboard-repo-fake-repos/fake-python-api/` с pyproject.toml (FastAPI/uvicorn/pytest), src/main.py, tests/test_main.py, README.md, .gitignore, .env.example
  _Source: [FIXTURES.md F-1](FIXTURES.md#f-1-fake-python-api)_
- [ ] Создать fixture **F-2 fake-nodejs-backend**: Express + vitest minimal repo
  _Source: FIXTURES.md F-2_
- [ ] Создать fixture **F-3 fake-nextjs-frontend**: Next.js 14 + React 18 + vitest с next.config.ts, src/app/page.tsx, src/app/api/hello/route.ts
  _Source: [FIXTURES.md F-3](FIXTURES.md#f-3-fake-nextjs-frontend)_
- [ ] Создать fixture **F-4 fake-fullstack-monorepo**: Turborepo layout packages/api/ (python) + packages/web/ (nextjs) + packages/shared/ + turbo.json
  _Source: [FIXTURES.md F-4](FIXTURES.md#f-4-fake-fullstack-monorepo)_
- [ ] Создать fixture **F-5 fake-dotnet-service**: .csproj + Program.cs + xunit tests
  _Source: FIXTURES.md F-5_
- [ ] Создать fixture **F-6 fake-empty-repo**: только README.md + .gitignore
  _Source: [FIXTURES.md F-6](FIXTURES.md#f-6-fake-empty-repo)_
- [ ] Создать fixture **F-7 fake-no-tests**: python-api без tests/ директории
  _Source: [FIXTURES.md F-7](FIXTURES.md#f-7-fake-no-tests)_
- [ ] Создать fixture **F-8 fake-no-git**: валидный repo без .git/
  _Source: [FIXTURES.md F-8](FIXTURES.md#f-8-fake-no-git)_
- [ ] Создать factory **F-9 fake-large-repo**: `tests/fixtures/onboard-repo-fake-repos/factories/large-repo.ts` — генерит 600 файлов из templates runtime
  _Source: [FIXTURES.md F-9](FIXTURES.md#f-9-fake-large-repo-factory)_
- [ ] Создать fixture **F-10 fake-with-cursorignore**: python-api + .cursorignore с pattern `secrets/**` + real secrets/key.json
  _Source: [FIXTURES.md F-10](FIXTURES.md#f-10-fake-with-cursorignore)_
- [ ] Создать static mocks **F-11..F-15**: `tests/fixtures/subagent-outputs/{python-api,nodejs-frontend,monorepo,empty,subagent-b-crash}.json` с structured mock Subagent A/B/C outputs
  _Source: [FIXTURES.md F-11..F-15](FIXTURES.md#f-11-subagent-output-python-api)_
- [ ] Создать golden references **F-16..F-18**: `tests/fixtures/onboarding-artifacts/{valid-v1,stale-sha,invalid-schema}.json`
  _Source: [FIXTURES.md F-16..F-18](FIXTURES.md#f-16-valid-onboarding-json-v1)_
- [ ] Создать skill mock **F-20**: `tests/fixtures/skills/run-tests-mock.ts` — intercepts `/run-tests` invocation, returns configurable result
  _Source: [FIXTURES.md F-20](FIXTURES.md#f-20-run-tests-skill-mock)_

### Hooks (новые из DESIGN.md BDD Test Infrastructure)

- [ ] Создать hook **`tests/e2e/onboard-repo/hooks/before-each.ts`** (BeforeEach, per-scenario) — copy fixture fake-repo в tmpdir, init git (optional), clear `.specs/`/managed artifacts
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_
  _Reuse: `tests/e2e/helpers.ts:setupFakeRepo()`_
- [ ] Создать hook **`tests/e2e/onboard-repo/hooks/after-each.ts`** (AfterEach, per-scenario) — cleanup tmpdir, restore managed-registry, reset state machine
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_
  _Reuse: `tests/e2e/helpers.ts:teardownFakeRepo()`_
- [ ] Создать hook **`tests/e2e/onboard-repo/hooks/mock-subagent.ts`** (BeforeAll, per-test-file) — intercept Agent tool invocations, return deterministic JSON из F-11..F-15
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_
- [ ] Создать helpers **`tests/e2e/onboard-repo/helpers.ts`** с функциями: `setupFakeRepo(name)`, `createFakeRepoForArchetype(archetype)`, `seedOnboardingJson(fixture, tmpdir)`, `snapshotRegistry()`, `restoreRegistry()`, `assertNoSecretsInFile(path)`
  _Reuse: `tests/e2e/helpers.ts:spawnSyncWrapper`_

### BDD .feature и step definitions

- [ ] Verify: `.specs/onboard-repo-phase0.feature` и `tests/features/onboard-repo/onboard-repo-phase0.feature` содержат **идентичные** сценарии (copy — `.specs/` это spec reference, `tests/features/` — runtime location для test runner)
- [ ] Создать step definitions **`tests/e2e/onboard-repo/step-definitions.ts`** — заглушки для всех Given/When/Then из .feature с `throw new Error('PENDING: not implemented')`
  _Mapping: каждый шаг в .feature имеет matching step definition_
- [ ] Verify: `/run-tests tests/e2e/onboard-repo/` — все сценарии FAIL (Red)
  _Reuse: `/run-tests` skill_

## Phase 1: Cache invalidation (Green, @feature4)

> Реализация Step 0 decision gate (cache check) — foundation для следующих этапов.

- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/lib/git-sha-cache.ts` (read `.onboarding.json`, compare with `git rev-parse HEAD`, return decision enum: `missing | valid | drift | error`) -- @feature4
  _Requirements: [FR-4](FR.md#fr-4-git-sha-cache-invalidation-feature4)_
- [ ] Реализовать handle для `--refresh-onboarding` flag: archive prev artifacts в `.onboarding-history/`, retention 5 -- @feature4
  _Requirements: [FR-16](FR.md#fr-16-manual-refresh-через---refresh-onboarding-feature4)_
- [ ] Реализовать fallback для non-git repos (mtime-based invalidation) -- @feature4
  _Requirements: [NFR-C3](NFR.md#compatibility)_
- [ ] Verify: сценарии ONBOARD003 (cache hit) + ONBOARD004 (drift) + ONBOARD005 (refresh) + ONBOARD032 (non-git) переходят Red → Green

## Phase 2: Archetype triage (Green, @feature8)

- [ ] Создать `extensions/onboard-repo/tools/onboard-repo/templates/archetype-signals.json` — mapping signal-файлов → архетипов (9 типов)
  _Requirements: [FR-8](FR.md#fr-8-archetype-triage-2-min-перед-deep-scan-feature8)_
- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/steps/archetype-triage.ts` (read root + top-2-depth dirs, match signals, compute confidence) -- @feature8
  _Requirements: [FR-8](FR.md#fr-8-archetype-triage-2-min-перед-deep-scan-feature8), [NFR-P2](NFR.md#performance) (≤ 120s)_
- [ ] Обработка `unknown` archetype + fallthrough на generic routing
  _Requirements: AC-8_
- [ ] Verify: сценарии ONBOARD015 (python-api) + ONBOARD016 (nextjs-frontend) + ONBOARD017 (monorepo) + ONBOARD018 (minimal) переходят Green

## Phase 3: Parallel recon (Green, @feature7)

- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/steps/parallel-recon.ts` — spawn 3 Claude Code Explore subagents в одном tool call -- @feature7
  _Requirements: [FR-7](FR.md#fr-7-parallel-explore-subagents-для-recon-feature7)_
- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/lib/subagent-merge.ts` — merge 3 outputs с priority rule A > B > C per-field
  _Requirements: [NFR-R4](NFR.md#reliability) (partial failure recovery)_
- [ ] Интеграция mock-subagent.ts для test isolation
- [ ] Verify: сценарии ONBOARD013 (parallel launch) + ONBOARD014 (partial failure) переходят Green

## Phase 4: Ingestion (Green, @feature7 + @feature2)

- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/steps/ingestion.ts` — `which repomix` detection, invoke `repomix --compress`, fallback top-N
  _Requirements: [FR-2](FR.md#fr-2-typed-artifact-specsonboardingjson-ai-first-schema-feature2-feature10) (ingestion metadata), [NFR-P5](NFR.md#performance)_
- [ ] Реализовать fallback top-N by (size + git-recency + import-count) — shell commands + TypeScript aggregation
- [ ] Verify: сценарии ONBOARD033 (repomix available) + ONBOARD034 (fallback) переходят Green

## Phase 5: Baseline tests (Green, @feature5)

- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/steps/baseline-tests.ts` — invoke `/run-tests` skill (не raw cmd) -- @feature5
  _Requirements: [FR-5](FR.md#fr-5-baseline-test-run-через-run-tests-feature5), правило centralized-test-runner_
- [ ] Parse output в typed structure `{framework, passed, failed, skipped, duration_s, failed_test_ids[]}`
- [ ] Handle edge cases: no framework → skip with reason, exit 127 → abort with install hint, `--skip-baseline-tests` flag
  _Requirements: AC-5_
- [ ] Verify: сценарии ONBOARD007 (invoke /run-tests) + ONBOARD008 (no framework) + ONBOARD009 (skip flag) переходят Green

## Phase 6: Scratch findings (Green, @feature14)

- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/steps/scratch-findings.ts` — file count detection, appender utility
  _Requirements: [FR-14](FR.md#fr-14-scratch-file-для-крупных-репо-feature14)_
- [ ] Integrate scratch appends в parallel-recon.ts subagent prompts (each subagent writes findings every 2-3 files read)
- [ ] Archive logic в finalize (Step 7) — move live scratch → `.onboarding-history/scratch-{ISO}.md`
- [ ] Retention policy — keep last 5 scratch archives
- [ ] Verify: сценарии ONBOARD025 (scratch for large) + ONBOARD026 (no scratch for small) переходят Green

## Phase 7: Text gate (Green, @feature6)

- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/steps/text-gate.ts` — compose 1-paragraph summary, emit to chat, wait for user response
  _Requirements: [FR-6](FR.md#fr-6-text-gate-перед-phase-1-discovery-feature6), [NFR-U2](NFR.md#usability) (natural language)_
- [ ] Response classification (confirm synonyms regex + correction detection) — max 3 iterations
- [ ] Abort handling (`cancel`/`прервать`) + 3-iteration timeout
- [ ] Invoke `spec-status.ts -ConfirmStop Onboarding` after positive confirmation
- [ ] Verify: сценарии ONBOARD010 (confirm) + ONBOARD011 (iterate) + ONBOARD012 (3-iter abort) переходят Green

## Phase 8: Finalize + renderers (Green, @feature2, @feature9, @feature15)

- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/steps/finalize.ts` — compose JSON из phase0State, validate, atomic write
  _Requirements: [FR-2](FR.md#fr-2-typed-artifact-specsonboardingjson-ai-first-schema-feature2-feature10), [NFR-R1](NFR.md#reliability) (atomic), [NFR-R5](NFR.md#reliability) (schema-gated)_
- [ ] Создать `extensions/onboard-repo/tools/onboard-repo/templates/onboarding.md.template` — 6-секционный шаблон (порт rpa-init)
  _Source: rpa-init SKILL.md:30-52 https://github.com/EvilFreelancer/rpa-skills/blob/main/rpa-init/SKILL.md_
- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/renderers/render-rule.ts` — render `.claude/rules/onboarding-context.md` from JSON -- @feature15
  _Requirements: [FR-15](FR.md#fr-15-dual-render-из-single-source-of-truth-feature15)_
- [ ] Создать `extensions/onboard-repo/tools/onboard-repo/templates/onboarding-context.md.template` — managed rule template с marker block
- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/renderers/compile-hook.ts` — compile PreToolUse hook block, smart-merge в settings.local.json -- @feature3 @feature15
  _Requirements: [FR-3](FR.md#fr-3-pretooluse-hook-compiled-из-commands-блока-feature3)_
- [ ] Создать `extensions/onboard-repo/tools/onboard-repo/templates/pretool-hook.json.template` — hook block structure
- [ ] Verify: сценарии ONBOARD002 (happy path — full pipeline) + ONBOARD023 (hook blocks raw) + ONBOARD024 (dual-render) + ONBOARD029 (6 sections) + ONBOARD030 (next steps include env) переходят Green -- @feature11

## Phase 9: Schema validation (Green, @feature2, @feature10)

- [ ] Создать `extensions/onboard-repo/tools/onboard-repo/schemas/onboarding.schema.json` — Draft 2020-12 JSON Schema по onboard-repo-phase0_SCHEMA.md -- @feature2 @feature10
  _Requirements: [FR-20](FR.md#fr-20-json-schema-validation-onboardingjson), [FR-10](FR.md#fr-10-ai-specific-секции-обязательны-не-только-generic-metadata-feature10)_
  _Source: [onboard-repo-phase0_SCHEMA.md](onboard-repo-phase0_SCHEMA.md) full 17-block spec_
- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/lib/schema-validator.ts` — AJV wrapper с structured error reporting
- [ ] Добавить `forbidden_if_skill_present` + `raw_pattern_to_block` consistency check (custom ajv keyword) -- @feature3 @feature15
  _Requirements: [FR-18](FR.md#fr-18-commands-via-skill-reference-не-hardcode-feature3-feature15)_
- [ ] Verify: сценарии ONBOARD019 (schema conformance) + ONBOARD020 (AI-specific mandatory) + ONBOARD021 (violation abort) + ONBOARD022 (via_skill consistency) переходят Green

## Phase 10: Ignore parser + secret redaction (Green, @feature2 + NFR-S1)

- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/lib/ignore-parser.ts` — parse `.gitignore`/`.cursorignore`/`.aiderignore` с proper gitignore semantics
  _Requirements: [FR-17](FR.md#fr-17-respect-cursorignore--aiderignore--gitignore-feature2)_
- [ ] Реализовать `extensions/onboard-repo/tools/onboard-repo/lib/secret-redaction.ts` — pre-write scanner для sk-*, ghp_*, xoxb-*, AKIA, eyJ... patterns
  _Requirements: [NFR-S1](NFR.md#security) secrets never in artifacts_
- [ ] Integrate ignore-parser в subagent prompts (skip matching paths)
- [ ] Integrate secret-redaction в finalize.ts pre-write validator
- [ ] Verify: сценарий ONBOARD028 (cursorignore respected) переходит Green

## Phase 11: Extension manifest + cross-extension integration (Green, @feature1, @feature13)

- [ ] Создать `extensions/onboard-repo/extension.json` с полным manifest (files, tools, toolFiles, rules, ruleFiles, hooks, crossExtensionModifies, dependsOn)
  _Requirements: [FR-13](FR.md#fr-13-delivered-as-dev-pomogator-extension-feature13), правило extension-manifest-integrity_
- [ ] Создать `extensions/onboard-repo/README.md` — обзор фичи для installer target
- [ ] Создать 2 новых rules:
  - [ ] `.claude/rules/onboard-repo/onboarding-artifact-ai-centric.md` (@feature10)
  - [ ] `.claude/rules/onboard-repo/commands-via-skill-reference.md` (@feature3, @feature15)
- [ ] **Cross-extension edit**: `.claude/rules/specs-workflow/specs-management.md` — add section `### PHASE 0: Repo Onboarding` перед `### PHASE 1: Discovery` (алгоритм, cache policy, 7 steps) -- @feature1
- [ ] **Cross-extension edit**: `.claude/skills/create-spec/SKILL.md` — add Phase 0 detection logic (если `.onboarding.json` missing → invoke phase0.ts ПЕРЕД Phase 1), handle flags `--onboard`, `--refresh-onboarding`, `--skip-onboarding`
- [ ] **Cross-extension edit**: `extensions/specs-workflow/tools/specs-generator/spec-status.ts` — add state `Onboarding` в state machine, handle `-ConfirmStop Onboarding`, update `.progress.json` schema
- [ ] **Cross-extension edit**: `extensions/specs-workflow/extension.json` — add `consumedBy: ["onboard-repo"]` для manifest integrity
- [ ] Integration с installer: `src/updater/managed-registry.ts` — register 5 new managed path patterns -- @feature13 (+ FR-19)
  _Requirements: [FR-19](FR.md#fr-19-managed-files-tracking-через-sha-256)_
- [ ] Verify: сценарии ONBOARD001 (Background dev-pomogator installed) + ONBOARD002 (auto-trigger) + ONBOARD006 (missing dev-pomogator error) + ONBOARD031 (install via npx) переходят Green

## Phase 12: Coexistence + archetype edge cases (Green, @feature12, @feature8 EC-2)

- [ ] Integration check: Phase 0 respects existing `CLAUDE.md` unchanged -- @feature12
  _Requirements: [FR-12](FR.md#fr-12-coexistence-с-anthropic-init-без-конфликта-feature12)_
- [ ] Monorepo archetype sub-archetypes detection в archetype-triage.ts
- [ ] Edge case testing: fake-empty (EC-4), fake-large-repo (EC-5)
- [ ] Verify: сценарии ONBOARD027 (coexistence /init) + ONBOARD017 (monorepo sub-archetypes) + ONBOARD018 (minimal repo) переходят Green

## Phase 13: Update CLAUDE.md glossary + root README

- [ ] Обновить root `CLAUDE.md` — add rows в таблицу Always-apply rules для 2 новых правил (`onboarding-artifact-ai-centric`, `commands-via-skill-reference`)
  _Rule: claude-md-glossary_
- [ ] Обновить root `README.md` — add row в Плагины таблицу для `onboard-repo`
- [ ] Обновить CHANGELOG.md фичи — move pending items в released при PR merge

## Phase Refactor: Final verification + /simplify review

- [ ] Run `/simplify` на all new/modified files (single pass, после Audit)
  _Rule: simplify-once-at-end (memory)_
- [ ] Run `validate-spec.ts -Path ".specs/onboard-repo-phase0"` — 0 errors, 0 warnings
- [ ] Run `audit-spec.ts -Path ".specs/onboard-repo-phase0"` — 0 errors, 0 warnings (если есть — fix и re-run)
- [ ] Run Docker E2E тесты: `/run-tests` background, wait for notification. Все ONBOARD001..ONBOARD034 сценарии — GREEN
- [ ] Screenshot verification (debug-screenshot skill) для TUI flows если applicable
- [ ] Verify: `dev-pomogator --doctor` → 🟢 для all onboard-repo checks
- [ ] Verify: manual test на real repository — запуск `/create-spec test-onboarding` в чистом проекте вне dev-pomogator, full flow завершается за ≤ 20 минут

## Verification Plan (Definition of Done)

### Automated Tests

- `/run-tests tests/e2e/onboard-repo/` — integration tests для всех UC/EC
- `npx tsx extensions/specs-workflow/tools/specs-generator/analyze-features.ts -FeatureSlug "onboard-repo-phase0"` — BDD scenarios validation
- `npx ajv validate -s extensions/onboard-repo/tools/onboard-repo/schemas/onboarding.schema.json -d tests/fixtures/onboarding-artifacts/valid-v1.json` — schema conformance
- `npm run lint` — ESLint pass
- `npm test` — full E2E в Docker isolation

### Manual Verification

- Создать чистый test repo (`mkdir /tmp/test-phase0 && cd /tmp/test-phase0 && git init && echo "# test" > README.md && npm init -y`)
- Установить dev-pomogator: `npx github:stgmt/dev-pomogator --claude --plugins=onboard-repo,specs-workflow,tui-test-runner`
- Запустить `/create-spec test-feature` — проверить что Phase 0 запустился, создал .specs/.onboarding.json + .md, hook + rule, text gate сработал, Phase 1 Discovery стартовала после подтверждения
- Повторить `/create-spec second-feature` — проверить cache hit ≤ 3s
- Изменить git (5 коммитов) — проверить drift prompt
- `rm -rf test-feature && /create-spec test-feature --refresh-onboarding` — проверить force re-run + archive
- Попытаться `npm test` после Phase 0 — проверить что PreToolUse hook блокирует с hint про `/run-tests`

## Sequencing Notes

- Phase -1 (infra) + Phase 0 (fixtures/hooks) — параллельно независимы
- Phase 1 (cache) → prerequisite для Phase 11 (integration через flags)
- Phase 2 (archetype) → prerequisite для Phase 3 (parallel recon использует archetype для subagent prompts)
- Phase 3 (recon) + Phase 4 (ingestion) — параллельно
- Phase 5 (baseline tests) — после Phase 3 (needs test_framework из Subagent B output)
- Phase 6 (scratch) — параллельно с Phase 5
- Phase 7 (text gate) — после Phase 1..6 (нужен phase0State из предыдущих шагов)
- Phase 8 (finalize) — после Phase 7 + Phase 9 (нужен schema)
- Phase 9 (schema) — параллельно с Phase 2..7 (независима)
- Phase 10 (ignore+secrets) — после Phase 3 (integration в subagent prompts)
- Phase 11 (extension manifest) — финальная интеграция, после всех предыдущих
- Phase 12 (coexistence/edge) — после Phase 11
- Phase 13 (docs) — после Phase 12
- Phase Refactor — финальный шаг после всех Green
