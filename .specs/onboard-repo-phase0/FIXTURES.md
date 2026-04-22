# Fixtures

## Overview

Фича `onboard-repo-phase0` является `TEST_DATA_ACTIVE` (см. DESIGN.md > BDD Test Infrastructure). Создаёт артефакты в target репо (`.specs/.onboarding.json`, `.specs/.onboarding.md`, `.claude/rules/onboarding-context.md`, hook block в `.claude/settings.local.json`) + модифицирует `~/.dev-pomogator/config.json → managedFiles[]`. Для тестирования нужны:

1. **Fake target repos** — изолированные копии проектов разных архетипов (python-api, nodejs-frontend, monorepo, empty, no-tests, no-git) для симуляции UC-1..UC-13, EC-1..EC-6.
2. **Subagent output mocks** — детерминистические JSON ответы от 3 параллельных Claude Code Explore subagents, чтобы тесты не зависели от реальных subagent invocations (нестабильно, стоит токенов).
3. **Snapshot `~/.dev-pomogator/config.json`** — baseline до теста, restore после.
4. **Pre-populated `.onboarding.json` files** — для UC-2 (cache hit), UC-3 (SHA drift) — нужны valid JSON examples в известном state.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | fake-python-api | snapshot (directory copy) | `tests/fixtures/onboard-repo-fake-repos/fake-python-api/` | per-scenario | `before-each.ts:setupFakeRepo(F-1)` |
| F-2 | fake-nodejs-backend | snapshot | `tests/fixtures/onboard-repo-fake-repos/fake-nodejs-backend/` | per-scenario | `before-each.ts:setupFakeRepo(F-2)` |
| F-3 | fake-nextjs-frontend | snapshot | `tests/fixtures/onboard-repo-fake-repos/fake-nextjs-frontend/` | per-scenario | `before-each.ts:setupFakeRepo(F-3)` |
| F-4 | fake-fullstack-monorepo | snapshot | `tests/fixtures/onboard-repo-fake-repos/fake-fullstack-monorepo/` | per-scenario | `before-each.ts:setupFakeRepo(F-4)` |
| F-5 | fake-dotnet-service | snapshot | `tests/fixtures/onboard-repo-fake-repos/fake-dotnet-service/` | per-scenario | `before-each.ts:setupFakeRepo(F-5)` |
| F-6 | fake-empty-repo | snapshot | `tests/fixtures/onboard-repo-fake-repos/fake-empty/` | per-scenario | `before-each.ts:setupFakeRepo(F-6)` |
| F-7 | fake-no-tests | snapshot | `tests/fixtures/onboard-repo-fake-repos/fake-no-tests/` | per-scenario | `before-each.ts:setupFakeRepo(F-7)` |
| F-8 | fake-no-git | snapshot | `tests/fixtures/onboard-repo-fake-repos/fake-no-git/` | per-scenario | `before-each.ts:setupFakeRepo(F-8)` |
| F-9 | fake-large-repo (>500 files) | factory | `tests/fixtures/onboard-repo-fake-repos/factories/large-repo.ts` | per-scenario | `before-each.ts:generateLargeRepo()` |
| F-10 | fake-with-cursorignore | snapshot | `tests/fixtures/onboard-repo-fake-repos/fake-with-cursorignore/` | per-scenario | `before-each.ts:setupFakeRepo(F-10)` |
| F-11 | subagent-output-python-api | static JSON | `tests/fixtures/subagent-outputs/python-api.json` | per-test-file | `mock-subagent.ts:loadOutputs()` |
| F-12 | subagent-output-nodejs-frontend | static JSON | `tests/fixtures/subagent-outputs/nodejs-frontend.json` | per-test-file | `mock-subagent.ts:loadOutputs()` |
| F-13 | subagent-output-monorepo | static JSON | `tests/fixtures/subagent-outputs/monorepo.json` | per-test-file | `mock-subagent.ts:loadOutputs()` |
| F-14 | subagent-output-empty | static JSON | `tests/fixtures/subagent-outputs/empty.json` | per-test-file | `mock-subagent.ts:loadOutputs()` |
| F-15 | subagent-output-crash | static JSON | `tests/fixtures/subagent-outputs/subagent-b-crash.json` | per-test-file | `mock-subagent.ts:loadOutputs()` — simulate partial failure |
| F-16 | valid-onboarding-json-v1 | static JSON | `tests/fixtures/onboarding-artifacts/valid-v1.json` | per-scenario | `before-each.ts:seedCache()` |
| F-17 | stale-onboarding-json | static JSON | `tests/fixtures/onboarding-artifacts/stale-sha.json` | per-scenario | `before-each.ts:seedCache()` |
| F-18 | invalid-schema-onboarding | static JSON | `tests/fixtures/onboarding-artifacts/invalid-schema.json` | per-scenario | `before-each.ts:seedCache()` — missing required fields |
| F-19 | managed-registry-baseline | snapshot | `~/.dev-pomogator/config.json` (live) | per-test-suite | `before-all.ts:snapshotRegistry()` |
| F-20 | run-tests-skill-mock | factory | `tests/fixtures/skills/run-tests-mock.ts` | per-test-file | `mock-skill-invocation.ts:setup()` — returns fixed {passed, failed} |

## Fixture Details

### F-1: fake-python-api

- **Type:** Snapshot (directory copy pattern)
- **Format:** File tree — `pyproject.toml` (FastAPI + uvicorn + pytest), `src/main.py` (simple FastAPI app), `src/routes/users.py`, `tests/test_users.py`, `README.md`, `.gitignore`, `.env.example` (`DATABASE_URL`, `JWT_SECRET`), `.github/workflows/ci.yml`
- **Setup:** `cp -r tests/fixtures/onboard-repo-fake-repos/fake-python-api/ {tmpdir}/` via `fs-extra.copy()` + `git init && git add . && git commit -m "initial"` для valid git state
- **Teardown:** `rm -rf {tmpdir}` через `AfterEach`
- **Dependencies:** none
- **Used by:** @feature1 (UC-1 happy path), @feature8 (archetype = python-api), @feature10 (AI-specific sections population)
- **Assumptions:** Node 18+, git installed на test runner, `fs-extra` доступен

### F-3: fake-nextjs-frontend

- **Type:** Snapshot
- **Format:** `package.json` (Next.js 14 + React 18 + vitest), `next.config.ts`, `src/app/page.tsx`, `src/app/api/hello/route.ts`, `tsconfig.json`, `vitest.config.ts`, `src/tests/page.test.tsx`, `README.md`
- **Setup:** `fs-extra.copy` + `git init && commit`
- **Teardown:** `rm -rf {tmpdir}`
- **Dependencies:** none
- **Used by:** @feature8 (UC-12 archetype routing Frontend SPA)

### F-4: fake-fullstack-monorepo

- **Type:** Snapshot
- **Format:** Turborepo layout — `packages/api/` (FastAPI python), `packages/web/` (Next.js), `packages/shared/` (TypeScript types), `turbo.json`, `package.json` workspaces
- **Setup:** `fs-extra.copy` + `git init && commit`
- **Teardown:** `rm -rf {tmpdir}`
- **Dependencies:** none
- **Used by:** @feature8 (EC-2 monorepo archetype detection с sub-archetypes)

### F-6: fake-empty-repo

- **Type:** Snapshot
- **Format:** ТОЛЬКО `README.md` (10 lines) + `.gitignore`. Нет манифестов, нет кода.
- **Setup:** `fs-extra.copy` + `git init && commit`
- **Teardown:** `rm -rf {tmpdir}`
- **Dependencies:** none
- **Used by:** @feature8 (EC-4 minimalistic repo → short report)

### F-7: fake-no-tests

- **Type:** Snapshot
- **Format:** Валидный python-api (pyproject.toml, src/) но БЕЗ `tests/` директории и без `pytest` в dev-dependencies.
- **Setup:** `fs-extra.copy` + `git init && commit`
- **Teardown:** `rm -rf {tmpdir}`
- **Dependencies:** none
- **Used by:** @feature5 (UC-7 Step 4 skipped — no test framework)

### F-8: fake-no-git

- **Type:** Snapshot
- **Format:** Любой валидный репо (например python-api) но БЕЗ `.git/` директории
- **Setup:** `fs-extra.copy` (NO `git init`)
- **Teardown:** `rm -rf {tmpdir}`
- **Dependencies:** none
- **Used by:** EC-1 (non-git repo fallback to mtime cache invalidation)

### F-9: fake-large-repo (factory)

- **Type:** Factory (runtime-generated)
- **Format:** TypeScript script генерит 600+ файлов из templates (minimal Python API с auto-generated routes). Speed: ~3s generation.
- **Setup:** `generateLargeRepo({tmpdir}, { fileCount: 600, archetype: 'python-api' })` → calls fs.writeFile loops
- **Teardown:** `rm -rf {tmpdir}`
- **Dependencies:** none
- **Used by:** @feature14 (UC-11 scratch file activation при >500 files)

### F-10: fake-with-cursorignore

- **Type:** Snapshot
- **Format:** Python-api + `.cursorignore` файл с паттернами `secrets/**`, `*.secret.json`, `.env.local`. Реальные sensitive файлы в tmpdir.
- **Setup:** `fs-extra.copy` + `git init && commit` (с .cursorignore в commit)
- **Teardown:** `rm -rf {tmpdir}`
- **Dependencies:** none
- **Used by:** @feature2 (EC-3 respect .cursorignore), FR-17

### F-11: subagent-output-python-api

- **Type:** Static JSON
- **Format:** Structured output от Subagent A (manifest+env) + Subagent B (tests+configs) + Subagent C (entry points) для `fake-python-api` — deterministic response, дублирующий что реальные subagents бы вернули.
- **Setup:** `mockSubagents.register('python-api', require('./python-api.json'))` в `BeforeAll`
- **Teardown:** `mockSubagents.reset()` в `AfterAll`
- **Dependencies:** F-1 (семантически соответствует structure fake-python-api)
- **Used by:** @feature7 (UC-1 integration test — replaces expensive real subagent calls)

### F-15: subagent-output-crash

- **Type:** Static JSON (error response)
- **Format:** Subagent A и C return valid output, Subagent B returns `{error: "timeout", subagent_id: "B"}`
- **Setup:** `mockSubagents.register('partial-fail', {...})`
- **Teardown:** `mockSubagents.reset()`
- **Dependencies:** F-11/F-12/... (merge logic должна работать с частичными данными)
- **Used by:** NFR-R4 partial subagent failure recovery test, AC-7 IF-одна-subagent-failed flow

### F-16: valid-onboarding-json-v1

- **Type:** Static JSON (golden reference)
- **Format:** Valid `.onboarding.json` с всеми 17 блоками заполненными для python-api archetype. Используется для UC-2 cache hit tests + schema conformance tests.
- **Setup:** `fs-extra.copy(F-16 → {tmpdir}/.specs/.onboarding.json)` + обновить `last_indexed_sha` на actual git HEAD tmpdir-а
- **Teardown:** `rm {tmpdir}/.specs/.onboarding.json`
- **Dependencies:** F-1 (fixture должна match fake-python-api состояние)
- **Used by:** UC-2 cache hit, AC-2 schema conformance

### F-17: stale-onboarding-json

- **Type:** Static JSON
- **Format:** Valid `.onboarding.json` но с `last_indexed_sha = "abc000..."` (never matches actual HEAD) — для triggering UC-3 drift flow
- **Setup:** copy to `{tmpdir}/.specs/.onboarding.json`, DO NOT update SHA
- **Teardown:** `rm`
- **Dependencies:** F-1
- **Used by:** UC-3 SHA drift prompt, AC-4

### F-18: invalid-schema-onboarding

- **Type:** Static JSON
- **Format:** JSON намеренно missing required field (например без `boundaries`) — для testing schema validation reject
- **Setup:** copy to tmpdir
- **Teardown:** `rm`
- **Dependencies:** none
- **Used by:** AC-2 schema violation abort, AC-10 missing AI-specific sections

### F-19: managed-registry-baseline

- **Type:** Snapshot (live file)
- **Format:** Copy `~/.dev-pomogator/config.json` → memory snapshot в `BeforeAll`
- **Setup:** `globalState.registryBaseline = JSON.parse(fs.readFileSync(HOME + '/.dev-pomogator/config.json'))`
- **Teardown:** `fs.writeFileSync(HOME + '/.dev-pomogator/config.json', JSON.stringify(globalState.registryBaseline))` в `AfterAll` — restore baseline
- **Dependencies:** none
- **Used by:** Все UC-тесты (NFR-R1 managed registry cleanliness)

### F-20: run-tests-skill-mock

- **Type:** Factory (TypeScript wrapper)
- **Format:** Mocks Claude Code skill invocation — intercepts `/run-tests` calls, returns configurable `{passed: N, failed: M, duration_s: X}` без реального запуска тестов. Используется для изоляции Phase 0 Step 4 unit behavior.
- **Setup:** `mockSkills.register('run-tests', mockRunTestsSkill({ passed: 145, failed: 2 }))`
- **Teardown:** `mockSkills.reset()`
- **Dependencies:** none
- **Used by:** AC-5 baseline test flow, UC-7 no-tests skip

## Dependencies Graph

```
F-1..F-10 (fake repos, snapshots)     — no deps
    ↓
F-11..F-15 (subagent output mocks)    — semantically depend on corresponding F-1..F-10
    ↓
F-16, F-17, F-18 (onboarding.json)    — seeded into F-1..F-10 tmpdirs for specific UCs
    ↓
F-19 (managed registry)               — global, independent
    ↓
F-20 (skill mock)                     — independent, per-test-file

F-9 (large repo factory)              — runtime-generated, no file deps
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | UC-1 first `/create-spec` happy path | F-1 (python-api) + F-11 (subagent output) + F-20 (run-tests mock) | none |
| @feature2 | FR-2 typed JSON creation | F-1 + F-11 + F-20 → output compared to F-16 structure | none |
| @feature3 | FR-3 PreToolUse hook compile | F-1 + F-11 → assert hook block in settings.local.json | none |
| @feature4 | UC-2 cache hit | F-1 + F-16 (seed valid .onboarding.json с matching SHA) | none |
| @feature4 | UC-3 SHA drift prompt | F-1 + F-17 (stale SHA) + user prompt mock | Need: mock AskUserQuestion responses |
| @feature4 | UC-4 manual --refresh-onboarding | F-1 + F-16 (existing) → assert history dir created | none |
| @feature5 | UC-7 no test framework | F-7 + F-14 (empty subagent output) | none |
| @feature5 | UC-13 --skip-baseline-tests | F-1 + F-11 + flag | none |
| @feature6 | UC-8 text gate iterations | F-1 + mock user responses: `["not quite", "yes correct"]` | Need: user response simulator |
| @feature7 | UC-1 parallel subagents | F-1 + F-11 (3 subagent outputs) | none |
| @feature7 | NFR-R4 partial subagent failure | F-1 + F-15 (subagent B crash) | none |
| @feature8 | UC-12 archetype frontend-spa | F-3 + F-12 | none |
| @feature8 | EC-2 monorepo archetype | F-4 + F-13 | none |
| @feature8 | EC-4 minimal repo | F-6 + F-14 | none |
| @feature9 | FR-9 6-section report | F-1 + F-11 → parse `.onboarding.md` sections | none |
| @feature10 | FR-10 AI-specific sections | F-1 + F-11 → assert JSON keys present | none |
| @feature11 | FR-11 developer checklist | F-1 + F-11 → parse Section 6 `.onboarding.md` | none |
| @feature12 | UC-10 coexistence with /init | F-1 + pre-seeded CLAUDE.md in tmpdir → assert unchanged | Need: `fs-extra.writeFile(tmpdir/CLAUDE.md)` в setup |
| @feature13 | AC-13 delivered as extension | Install dev-pomogator in Docker container, assert `extensions/onboard-repo/` | Need: full dev-pomogator install test (heavy) |
| @feature14 | UC-11 scratch file | F-9 (large repo factory) + assert scratch written → archived | none |
| @feature15 | FR-15 dual-render | F-1 + F-11 → assert `.claude/rules/onboarding-context.md` + hook block | none |
| @feature4 | FR-17 .cursorignore respect | F-10 + F-11 → assert onboarding.ignore.external_configs_found | none |
| EC-1 | non-git repo fallback | F-8 + F-11 | none |

## Notes

### Retention policy
- `tests/fixtures/onboard-repo-fake-repos/` — под git control, размер ≤ 5MB total для всех fixture репо (избегать blow up).
- `subagent-outputs/*.json` — ≤ 50KB per file.
- Runtime-generated (F-9, F-19 baselines) — очищаются в `AfterAll` без persistence.

### Caveats
- **F-9 generation time:** Factory генерит 600 файлов в ~3 seconds. При выполнении всех UC-11 тестов (несколько раз) — накопительно ~15-20 seconds overhead. Приемлемо для CI.
- **F-19 managed registry safety:** Если тест падает до `AfterAll` restore — registry может остаться в dirty state. Mitigation: atomic snapshot+restore через `try/finally`, plus CI cleanup job перед test suite start.
- **F-11..F-15 staleness:** Mock JSON hardcode'ит expected subagent output. Если реальные Explore subagents меняют output format (breaking change upstream Claude Code) — mocks устареют. Mitigation: `tests/integration/subagent-contract.test.ts` — контрактный тест что real subagent возвращает matching format (runs раз в неделю, не в каждом CI run).

### Cleanup Order (AfterEach)
1. Close any open file handles в tmpdir
2. `rm -rf {tmpdir}` — removes fake repo copy полностью, plus all `.specs/`, `.claude/` artifacts внутри
3. Restore `~/.dev-pomogator/config.json` entries (strip tmpdir-related entries)
4. Reset global mock state (mockSubagents, mockSkills)
5. (AfterAll only) Full registry restore из F-19
