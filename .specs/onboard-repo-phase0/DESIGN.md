# Design

## Реализуемые требования

- [FR-1: Auto-trigger Phase 0](FR.md#fr-1-auto-trigger-phase-0-при-первом-create-spec-в-репо-feature1)
- [FR-2: Typed JSON artifact](FR.md#fr-2-typed-artifact-specsonboardingjson-ai-first-schema-feature2-feature10)
- [FR-3: PreToolUse hook compile](FR.md#fr-3-pretooluse-hook-compiled-из-commands-блока-feature3)
- [FR-4: Git-SHA cache](FR.md#fr-4-git-sha-cache-invalidation-feature4)
- [FR-5: Baseline test run](FR.md#fr-5-baseline-test-run-через-run-tests-feature5)
- [FR-6: Text gate](FR.md#fr-6-text-gate-перед-phase-1-discovery-feature6)
- [FR-7: Parallel subagents](FR.md#fr-7-parallel-explore-subagents-для-recon-feature7)
- [FR-8: Archetype triage](FR.md#fr-8-archetype-triage-2-min-перед-deep-scan-feature8)
- [FR-9: Prose .onboarding.md](FR.md#fr-9-prose-artifact-specsonboardingmd-6-секционный-отчёт-feature9)
- [FR-10: AI-specific sections](FR.md#fr-10-ai-specific-секции-обязательны-не-только-generic-metadata-feature10)
- [FR-11: Developer checklist](FR.md#fr-11-developer-onboarding-checklist-из-onboardingmd-feature11)
- [FR-12: Coexistence с /init](FR.md#fr-12-coexistence-с-anthropic-init-без-конфликта-feature12)
- [FR-13: Delivered as extension](FR.md#fr-13-delivered-as-dev-pomogator-extension-feature13)
- [FR-14: Scratch file](FR.md#fr-14-scratch-file-для-крупных-репо-feature14)
- [FR-15: Dual-render](FR.md#fr-15-dual-render-из-single-source-of-truth-feature15)
- [FR-16: Manual refresh](FR.md#fr-16-manual-refresh-через---refresh-onboarding-feature4)
- [FR-17: Ignore files](FR.md#fr-17-respect-cursorignore--aiderignore--gitignore-feature2)
- [FR-18: Commands via skill-ref](FR.md#fr-18-commands-via-skill-reference-не-hardcode-feature3-feature15)
- [FR-19: SHA-256 managed](FR.md#fr-19-managed-files-tracking-через-sha-256)
- [FR-20: Schema validation](FR.md#fr-20-json-schema-validation-onboardingjson)

## Архитектурный обзор

Фича реализуется как **новый extension `onboard-repo`** в dev-pomogator с координацией (cross-extension modification) с существующим `specs-workflow`. Phase 0 интегрируется в 4-фазный workflow `specs-management.md` как новая первая фаза.

```
╔═══════════════════════════════════════════════════════════════════════╗
║  /create-spec <slug>  →  specs-workflow (existing)                    ║
║                          ↓                                             ║
║                          check .specs/.onboarding.json                 ║
║                          ├─ missing/stale → Phase 0 (onboard-repo)    ║
║                          │                   ↓                         ║
║                          │                   7-step pipeline           ║
║                          │                   ↓                         ║
║                          │                   artifacts + hook          ║
║                          │                   ↓                         ║
║                          │                   text gate confirmed       ║
║                          │                   ↓                         ║
║                          └→ Phase 1 Discovery (existing, pre-ctx)     ║
║                          ↓                                             ║
║                          Phase 1.5 Context (reads .onboarding.json)   ║
║                          ↓                                             ║
║                          Phase 2 Requirements + Design + BDD           ║
║                          ↓                                             ║
║                          Phase 3 Finalization + Audit                  ║
╚═══════════════════════════════════════════════════════════════════════╝
```

## Компоненты

### Core (extensions/onboard-repo/tools/onboard-repo/)

- **`phase0.ts`** — главный orchestrator. Entry point. Читает context (git SHA, existing artifacts, flags). Decides: skip/re-run/full. Вызывает Step 1-7 sequentially.
- **`steps/archetype-triage.ts`** — Step 1. 2-min classification на 9 архетипов. Читает top-level manifests only.
- **`steps/parallel-recon.ts`** — Step 2. Launches 3 Claude Code Explore subagents в одном call. Merges outputs по priority rule.
- **`steps/ingestion.ts`** — Step 3. Детектит `repomix` в PATH. Runs `repomix --compress` если available, fallback top-N script иначе.
- **`steps/baseline-tests.ts`** — Step 4. Invoke `/run-tests` skill через Claude Code skill invocation (не raw cmd). Parses output в typed structure.
- **`steps/scratch-findings.ts`** — Step 5. Helper утилита для appends в `.onboarding-scratch.md`. Используется subagents async. Archive step вызывается в Step 7.
- **`steps/text-gate.ts`** — Step 6. Формирует prompt для AI summary + ожидает user confirmation в chat. Max 3 iterations.
- **`steps/finalize.ts`** — Step 7. Validates JSON против schema, writes atomically, invokes renderers.
- **`renderers/render-rule.ts`** — рендерит prose в `.claude/rules/onboarding-context.md` из `.onboarding.json`.
- **`renderers/compile-hook.ts`** — компилирует PreToolUse hook block из `commands.*.raw_pattern_to_block` в `.claude/settings.local.json` через smart merge.
- **`lib/git-sha-cache.ts`** — helper для cache invalidation logic (читает `last_indexed_sha`, сравнивает с HEAD, возвращает decision).
- **`lib/schema-validator.ts`** — AJV wrapper для validation `.onboarding.json` против `schemas/onboarding.schema.json`.
- **`lib/subagent-merge.ts`** — helper для merging output от 3 parallel subagents с priority rules.

### Schemas & Templates (extensions/onboard-repo/tools/onboard-repo/)

- **`schemas/onboarding.schema.json`** — Draft 2020-12 JSON Schema для `.onboarding.json` v1.0. 17 блоков с required/enum/pattern constraints.
- **`templates/onboarding.md.template`** — 6-секционный markdown template (Project snapshot / Dev env / Tests / Behavior / Risks / Next steps). Плейсхолдеры `{{variable}}`.
- **`templates/onboarding-context.md.template`** — managed rule template с marker block.
- **`templates/pretool-hook.json.template`** — hook block structure (один per-command entry).
- **`templates/archetype-signals.json`** — mapping signal-файл → archetype (e.g., `next.config.ts → nodejs-frontend`).

### Rules (новые в dev-pomogator)

- **`.claude/rules/onboard-repo/onboarding-artifact-ai-centric.md`** — правило enforcing AI-first content в `.onboarding.json` (не generic metadata only). Trigger: `Edit` на `.specs/.onboarding.json`. Content: checklist 6 AI-specific секций, примеры.
- **`.claude/rules/onboard-repo/commands-via-skill-reference.md`** — правило enforcing `via_skill` reference для командных wrappers. Trigger: `Edit` на `.specs/.onboarding.json`. Content: если detected skill existing в `.claude/skills/` — hardcoded raw cmd без via_skill = violation.

### Extension.json manifest

`extensions/onboard-repo/extension.json` — полный manifest по правилу `extension-manifest-integrity`:
```jsonc
{
  "name": "onboard-repo",
  "version": "1.0.0",
  "description": "Phase 0 Repo Onboarding для create-spec workflow",
  "envRequirements": [],
  "crossExtensionModifies": [
    ".claude/rules/specs-workflow/specs-management.md"
  ],
  "files": [],
  "rules": {
    "claude": [
      ".claude/rules/onboard-repo/onboarding-artifact-ai-centric.md",
      ".claude/rules/onboard-repo/commands-via-skill-reference.md"
    ]
  },
  "ruleFiles": { "onboard-repo": [...above two paths...] },
  "tools": ["onboard-repo"],
  "toolFiles": {
    "onboard-repo": [
      "tools/onboard-repo/phase0.ts",
      "tools/onboard-repo/steps/archetype-triage.ts",
      "tools/onboard-repo/steps/parallel-recon.ts",
      "tools/onboard-repo/steps/ingestion.ts",
      "tools/onboard-repo/steps/baseline-tests.ts",
      "tools/onboard-repo/steps/scratch-findings.ts",
      "tools/onboard-repo/steps/text-gate.ts",
      "tools/onboard-repo/steps/finalize.ts",
      "tools/onboard-repo/renderers/render-rule.ts",
      "tools/onboard-repo/renderers/compile-hook.ts",
      "tools/onboard-repo/lib/git-sha-cache.ts",
      "tools/onboard-repo/lib/schema-validator.ts",
      "tools/onboard-repo/lib/subagent-merge.ts",
      "tools/onboard-repo/schemas/onboarding.schema.json",
      "tools/onboard-repo/templates/onboarding.md.template",
      "tools/onboard-repo/templates/onboarding-context.md.template",
      "tools/onboard-repo/templates/pretool-hook.json.template",
      "tools/onboard-repo/templates/archetype-signals.json"
    ]
  },
  "hooks": [],
  "dependsOn": ["specs-workflow", "tui-test-runner"]
}
```

## Где лежит реализация

- **App-код (новый):** `extensions/onboard-repo/tools/onboard-repo/**/*.ts`
- **Schema:** `extensions/onboard-repo/tools/onboard-repo/schemas/onboarding.schema.json`
- **Templates:** `extensions/onboard-repo/tools/onboard-repo/templates/*`
- **Rules (новые):** `.claude/rules/onboard-repo/*.md`
- **Modified (cross-extension):** `.claude/rules/specs-workflow/specs-management.md` — add `### PHASE 0: Repo Onboarding` перед `### PHASE 1: Discovery`
- **Modified (cross-extension):** `.claude/skills/create-spec/SKILL.md` — add check `.onboarding.json` trigger logic
- **Modified (cross-extension):** `extensions/specs-workflow/tools/specs-generator/spec-status.ts` — добавить state `Onboarding` в state machine
- **Tests:** `tests/e2e/onboard-repo/*.test.ts`, `tests/features/onboard-repo/*.feature`, `tests/e2e/onboard-repo/fixtures/*`

## Директории и файлы

Создаётся на target репо когда Phase 0 выполняется:

- `.specs/.onboarding.json` — typed artifact (v1.0)
- `.specs/.onboarding.md` — prose report (6 sections)
- `.specs/.onboarding-scratch.md` — scratch during execution, archive-ится в
- `.specs/.onboarding-history/` — archived scratch & previous onboarding runs (retention: 5)
- `.claude/rules/onboarding-context.md` — rendered prose rule (managed)
- `.claude/settings.local.json` — injected hook block (managed, smart merge)

## Алгоритм (Phase 0 pipeline)

### Pre-step: Decision gate

```typescript
// phase0.ts entry
async function runPhase0(args: { slug: string, refreshFlag: boolean }) {
  const cache = await gitShaCache.check('.specs/.onboarding.json');
  
  if (cache.status === 'missing' || args.refreshFlag) {
    return await runFull();
  }
  if (cache.status === 'valid') {
    return showCacheSummary();  // UC-2
  }
  if (cache.status === 'drift' && cache.commits >= 5) {
    return await promptRefresh(cache);  // UC-3
  }
  // drift < 5 commits → silent reuse
  return showCacheSummary();
}
```

### Step 1: Archetype triage (FR-8, ≤ 2 min)

```
1.1. Read: package.json, pyproject.toml, Cargo.toml, go.mod, *.csproj, Gemfile, mix.exs, pubspec.yaml, composer.json, Dockerfile, terraform/, Jupyter files in notebooks/
1.2. Match signals против templates/archetype-signals.json
1.3. Calculate confidence (high/medium/low)
1.4. Output: { archetype: string, confidence: enum, evidence: string }
1.5. Write temporarily в phase0State object, pass в следующие шаги
```

### Step 2: Parallel recon (FR-7, 3 subagents в одном call)

```typescript
const [subA, subB, subC] = await Promise.all([
  launchSubagent('manifest+env', ['read all manifests', 'check CI configs', 'check .env.example']),
  launchSubagent('tests+configs', ['detect test framework', 'find CLAUDE.md/.cursor/rules/', 'check AGENTS.md']),
  launchSubagent('entry-points', ['find main files', 'architecture hints', 'top 5 dirs by size']),
]);
const merged = subagentMerge(subA, subB, subC, { priority: ['A', 'B', 'C'] });
```

### Step 3: Ingestion (FR-2 data, NFR-P5)

```
3.1. which repomix → available?
3.2. IF available: spawn `repomix --compress -o /tmp/.onboarding-{slug}.xml`
3.3. ELSE fallback: top-N files ranked by (size + git-recency + import-count)
3.4. Cache result path в phase0State.ingestion
```

### Step 4: Baseline tests (FR-5)

```
4.1. Is test framework detected (phase0State.step2.test_framework)?
4.2. IF null: skip; record {framework: null, reason: "no test framework detected"}
4.3. ELSE: invoke Claude Code skill /run-tests
4.4. Parse output → { passed, failed, skipped, duration_s, failed_test_ids[] }
4.5. IF exit 127: abort Phase 0 with hint "install deps"
```

### Step 5: Scratch findings (FR-14, conditional)

```
5.1. Count files in repo (git ls-files | wc -l)
5.2. IF < 500: skip (pass-through, no scratch file)
5.3. ELSE: scratch-findings.ts активен, subagents из Step 2 appends findings каждые 2-3 прочитанных файла
5.4. После Step 7: archive to .specs/.onboarding-history/scratch-{ISO}.md
```

### Step 6: Text gate (FR-6, NFR-U2)

```
6.1. Build 1-paragraph summary из phase0State (archetype + stack + tests + main purpose + risks)
6.2. Print to chat в conversational tone
6.3. Ask: "Правильно я понял суть?"
6.4. Wait for user response
6.5. IF positive confirm: goto 6.7
6.6. IF corrections: update summary, goto 6.2 (max 3 iterations)
6.7. Invoke spec-status.ts -ConfirmStop Onboarding
```

### Step 7: Finalize artifacts (FR-2, FR-9, FR-15)

```
7.1. Compose phase0State into JSON matching onboarding.schema.json
7.2. Validate against schema (lib/schema-validator.ts)
7.3. IF validation fails: abort with structured error
7.4. atomicWrite('.specs/.onboarding.json', content)
7.5. Invoke render-rule.ts → .claude/rules/onboarding-context.md
7.6. Invoke compile-hook.ts → smart-merge hook block in .claude/settings.local.json
7.7. Register managed files с SHA-256 в ~/.dev-pomogator/config.json
7.8. Archive scratch to .onboarding-history/ if exists
7.9. Prune .onboarding-history/ if > 5 entries
7.10. Return success
```

## API / Invocation

### Public skill/command API

- **Implicit trigger:** `/create-spec <slug>` (existing) → check `.onboarding.json` → auto Phase 0 if missing.
- **Explicit flag:** `/create-spec <slug> --onboard` → force Phase 0 (даже если cache valid).
- **Explicit refresh:** `/create-spec <slug> --refresh-onboarding` → force re-run + archive previous.
- **Skip guard:** `/create-spec <slug> --skip-onboarding` → emergency escape hatch. Записывает `skipped_by_user: true` в progress.json. Banner при следующем запуске.

### Internal CLI (для testing)

- `npx tsx extensions/onboard-repo/tools/onboard-repo/phase0.ts --slug=my-feature [--refresh] [--skip-baseline] --projectPath=<path>` — для integration tests.

## External Service Verification

Phase 0 зависит от нескольких **внешних** инструментов:

| Service | Verified | Source | Notes |
|---------|----------|--------|-------|
| Claude Code Explore subagent | [VERIFIED: available in Claude Code 2.x] | Internal tool (Agent tool, subagent_type=Explore) | Core dependency для FR-7 parallel recon |
| `repomix` CLI | [VERIFIED: public npm package yamadashy/repomix] | https://github.com/yamadashy/repomix | Optional (fallback if missing) |
| `/run-tests` skill | [VERIFIED: existing in dev-pomogator tui-test-runner extension] | `.claude/skills/run-tests/SKILL.md` | Core dependency для FR-5 |
| `git` CLI | [VERIFIED: required for dev-pomogator] | `package.json engines` + README | Fallback если unavailable: mtime-based invalidation |
| `ajv` (JSON Schema validation) | [VERIFIED: public npm package] | https://ajv.js.org/ | New dependency — add to extensions/onboard-repo/package.json OR root package.json |

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** vitest (TypeScript) + custom BDD convention через `analyze-features.ts` парсинг `.feature` файлов
**Install Command:** vitest уже установлен (`devDependencies.vitest == "^4.1.0"` в root package.json). Для `ajv` schema validator: `npm install --save-dev ajv ajv-formats ajv-cli`
**Evidence:**
- ✅ Вопрос 1: Фича создаёт/изменяет данные через файлы? **ДА** — создаёт `.specs/.onboarding.json`, `.specs/.onboarding.md`, `.claude/rules/onboarding-context.md`, модифицирует `.claude/settings.local.json`, `~/.dev-pomogator/config.json`.
- ✅ Вопрос 2: Изменяет состояние системы, которое нужно откатить после теста? **ДА** — все вышеперечисленные artifacts + hook block нуждаются в cleanup после теста.
- ✅ Вопрос 3: BDD сценарии требуют предустановленных данных? **ДА** — UC-1 (репо с манифестами), UC-7 (репо без тестов), UC-12 (frontend-spa репо) — разные fixture типы репо.
- ⚠️ Вопрос 4: Взаимодействие с external services, требующими mock? **ДА** — Claude Code Explore subagent (в test env — mocked через helper), `/run-tests` skill (mocked).

**Verdict:** Требуются hooks: `BeforeAllTests` (docker/fixture setup), `BeforeEach` (per-scenario fresh fixture copy), `AfterEach` (cleanup артефактов в fake repo), `AfterAllTests` (teardown docker).

### Существующие hooks

| Hook файл | Тип | Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-------|------------|------------------------|
| `tests/e2e/helpers.ts` | shared helpers | per-test-file | spawnSync wrappers для scripts, `setupFakeRepo()`, `teardownFakeRepo()` | **Да** — extend с `createFakeRepoForArchetype(archetype)` |
| `scripts/docker-test.sh` | BeforeAll (global) | suite-wide | Docker container + volume mounts | **Да** — уже используется для всех E2E |
| `tests/e2e/**` fixtures pattern | per-test fixture | per-scenario | Read-only snapshots in `tests/fixtures/` | **Да** — добавить `tests/fixtures/onboard-repo-fake-repos/` |

### Новые hooks

| Hook файл | Тип | Scope | Что делает | По аналогии с |
|-----------|-----|-------|------------|---------------|
| `tests/e2e/onboard-repo/hooks/before-each.ts` | BeforeEach | per-scenario | Copy fixture fake-repo в tmpdir. Init git (optional). Clear `.specs/`/`.claude/rules/onboarding-context.md`/`.claude/settings.local.json` hook block | `tests/e2e/helpers.ts:setupFakeRepo()` |
| `tests/e2e/onboard-repo/hooks/after-each.ts` | AfterEach | per-scenario | Remove tmpdir. Restore managed-registry в `~/.dev-pomogator/config.json`. Reset state machine | `tests/e2e/helpers.ts:teardownFakeRepo()` |
| `tests/e2e/onboard-repo/hooks/mock-subagent.ts` | BeforeAll | per-test-file | Mock Claude Code Agent subagent invocations — return deterministic fixture JSON из `tests/fixtures/subagent-outputs/` | Нет precedent; новый паттерн |

### Cleanup Strategy

**Порядок удаления (каскадный rollback):**

1. `AfterEach`: Remove `{tmpdir}/.specs/.onboarding.json` + `{tmpdir}/.specs/.onboarding.md` + scratch + history
2. `AfterEach`: Remove `{tmpdir}/.claude/rules/onboarding-context.md`
3. `AfterEach`: Strip onboarding hook block из `{tmpdir}/.claude/settings.local.json` (preserve user hooks)
4. `AfterEach`: Remove онбординг entries из `~/.dev-pomogator/config.json → managedFiles[]` (only для tmpdir paths)
5. `AfterEach`: `rm -rf {tmpdir}` (full teardown)
6. `AfterAll`: Docker container down

**Rollback при ошибке посреди теста:**
- Все writes через temp files + atomic move (существующий паттерн) — partial writes невозможны.
- Если crash между Step 7.4 (write JSON) и 7.6 (compile hook) — state machine остаётся в "Onboarding in progress", next run detect-ит это и prompt "resume or restart".

### Test Data & Fixtures

Подробности см. [FIXTURES.md](FIXTURES.md). Краткий overview:

| Fixture | Путь | Назначение | Lifecycle |
|---------|------|------------|-----------|
| `fake-python-api/` | `tests/fixtures/onboard-repo-fake-repos/fake-python-api/` | Valid FastAPI минимальный репо для UC-1 | Read-only snapshot, copy per-scenario |
| `fake-nextjs-frontend/` | `tests/fixtures/onboard-repo-fake-repos/fake-nextjs-frontend/` | Valid Next.js для UC-12 | Read-only snapshot |
| `fake-monorepo/` | `tests/fixtures/onboard-repo-fake-repos/fake-monorepo/` | Monorepo для EC-2 | Read-only snapshot |
| `fake-empty/` | `tests/fixtures/onboard-repo-fake-repos/fake-empty/` | Только README для EC-4 | Read-only snapshot |
| `fake-no-tests/` | `tests/fixtures/onboard-repo-fake-repos/fake-no-tests/` | Python проект без tests/ для UC-7 | Read-only snapshot |
| `fake-no-git/` | `tests/fixtures/onboard-repo-fake-repos/fake-no-git/` | Проект без `.git/` для EC-1 | Read-only snapshot |
| `subagent-outputs/` | `tests/fixtures/subagent-outputs/*.json` | Моки ответов Explore subagents для deterministic tests | Read-only, keyed by archetype |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tmpdir` | string | `BeforeEach` (hook-before-each.ts) | Все step defs / test bodies | Path к изолированной копии fake-repo |
| `phase0State` | object | `phase0.ts` orchestrator | Step implementations | Accumulated data между шагами (archetype, step2 merge output, etc.) |
| `originalManagedRegistry` | object | `BeforeAll` | `AfterEach` | Snapshot `~/.dev-pomogator/config.json → managedFiles[]` до теста — для rollback |
| `mockedSubagentOutputs` | Map<string, object> | `BeforeAll` (mock-subagent.ts) | Mock impl of Agent tool | Deterministic fixture responses для archetype-specific scenarios |

## Design Decisions & Trade-offs

### DD-1: Новый extension vs расширение specs-workflow

**Решение:** Новый extension `onboard-repo` + cross-extension modification `specs-workflow`.

**Trade-off:**
- Плюс: separation of concerns — onboarding и spec creation могут эволюционировать независимо. Uninstall `onboard-repo` не ломает specs-workflow.
- Минус: дополнительный boilerplate (отдельный `extension.json`, отдельный package). Cross-extension modifications требуют `crossExtensionModifies` поле в manifest для coordinated update.

### DD-2: Git-SHA cache vs TTL vs file-hash

**Решение:** Git-SHA primary, mtime fallback для non-git repos.

**Trade-off:**
- Плюс: deterministic — одинаковый git state = один cache, не зависит от clock drift или FS mtime quirks.
- Минус: uncommitted changes не отражаются в SHA — теоретически возможно onboarding из outdated state. Mitigation: check `git status -z` при Phase 0 start, если dirty working tree — warn user.

### DD-3: Parallel subagents в 1 tool call vs sequential

**Решение:** 3 parallel в одном tool call (single multi-tool message).

**Trade-off:**
- Плюс: 3x speedup Step 2. Main context не засоряется output от 3 reads.
- Минус: error handling сложнее — если один subagent crashed, другие уже завершились, нужен partial merge. Логика в `subagent-merge.ts`.

### DD-4: Text gate через natural language vs AskUserQuestion structured UI

**Решение:** Natural language chat dialog.

**Trade-off:**
- Плюс: NFR-U2 — conversational feel. Пользователь отвечает как удобно.
- Минус: harder для auto-detect "confirm" signal. Решается: regex на синонимы "да/yes/верно/correct/правильно" + fallback question "(Y/N)?" после 2 ambiguous responses.

### DD-5: Schema v1 "версионирование по minor-bump"

**Решение:** `.onboarding.json.schema_version == "1.0"`. Minor bumps (1.0 → 1.1) — additive fields, backward compatible. Major bump (2.0) — требует migration script или `--refresh-onboarding`.

### DD-6: Rendered rule file без `paths:` frontmatter (always-loaded)

**Решение:** `.claude/rules/onboarding-context.md` без `paths:` frontmatter — always-loaded в каждой сессии Claude Code.

**Trade-off:**
- Плюс: AI имеет onboarding context всегда без дополнительных triggers. Универсально для любой задачи в репо.
- Минус: токены тратятся даже когда задача не связана с архитектурой проекта. Mitigation: файл компактный (< 3k tokens после render).

### DD-7: Scratch file threshold = 500 файлов

**Решение:** `.onboarding-scratch.md` только если > 500 файлов в репо.

**Trade-off:**
- Плюс: не мусорит на маленьких репо.
- Минус: magic number. Consider config: `onboarding.scratch_threshold` в target repo settings.

## Reuse существующих компонентов dev-pomogator

| Existing | Использование |
|----------|---------------|
| `extensions/specs-workflow/tools/specs-generator/spec-status.ts` | Extended: added state `Onboarding` перед `Discovery` |
| `.claude/skills/create-spec/SKILL.md` | Modified: detect `.onboarding.json` trigger, inline в SKILL workflow |
| `.claude/skills/run-tests/SKILL.md` | Invoked as-is by Step 4 через Claude Code skill invocation |
| `src/updater/managed-files.ts` (или аналог) | Register новые managed paths после Phase 0 finalize |
| `tests/e2e/helpers.ts` | Extended: `createFakeRepoForArchetype(name, archetype)` helper |
| `scripts/docker-test.sh` | Unchanged — E2E для onboard-repo через тот же Docker setup |
| `.claude/rules/pomogator/post-edit-verification.md` | Apply — после каждого edit в tools/onboard-repo/: npm run build → copy to `.dev-pomogator/` → тесты background |
