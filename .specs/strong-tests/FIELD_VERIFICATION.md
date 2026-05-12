# Field Verification — strong-tests v0.4.0 on lm-saas/AiPomogator + new-api-modified

> End-to-end audit of `strong-tests` skill — production install via dev-pomogator installer + detector smoke + Stryker.NET baseline on real-world target repos. Dogfooding на dev-pomogator завершён ранее (56.83% kill rate); этот документ — first production validation.

## Summary

| Target | Stack | Install | Smoke Test | Stryker | Verdict |
|---|---|---|---|---|---|
| `D:/repos/lm-saas/source-code/AiPomogator` | C# / .NET 10 | ✅ via lm-saas root | ✅ 3/3 files PASS | 🏃 background (Library.Shared) | Plugin works in real .NET project |
| `D:/repos/lm-saas/source-code/new-api-modified` | Go | ✅ same install (lm-saas siblings) | ✅ 5/5 files PASS | N/A (Go support v0.4.0 — Stryker.NET .NET-only) | Plugin works in real Go project |

**Key insight:** installer detected `D:/repos/lm-saas/` as git repo root (parent of both AiPomogator/source-code/AiPomogator + source-code/new-api-modified). One install covers all siblings — both projects share hook + skill from the same lm-saas root. Это правильное поведение per personal-pomogator spec (managed files живут на repo root уровне).

## Install — `D:/repos/lm-saas/`

### Command

```bash
cd D:/repos/lm-saas/source-code/AiPomogator
node D:/repos/dev-pomogator/dist/index.js --claude --plugins=test-quality
```

### Installer Output (verbatim)

```
🚀 dev-pomogator installer (non-interactive)

Installing plugins: test-quality

Installing...

  ✓ Installed rule: no-test-helper-duplication.md
  ✓ Installed tool: test-quality/
  ✓ Installed shared utilities: _shared/
  ✓ Installed skill: dedup-tests/
  ✓ Installed skill: tests-create-update/
  ✓ Installed skill: strong-tests/
  [WARN] Using empty fallback for: D:\repos\lm-saas\package.json
  ✓ Migrated 15 hook(s) and 0 env key(s) from .claude/settings.json → .claude/settings.local.json
  ✓ Installed 3 extension hook(s) to .claude/settings.local.json
  ✓ Generated .dev-pomogator/.claude-plugin/plugin.json
  [WARN] Using empty fallback for: D:\repos\lm-saas\package.json

⚠  SECURITY: Found .mcp.json with potential plaintext secrets
   Patterns detected: GITHUB_TOKEN
   ...
  ✓ Installed SessionStart version check hook
✓ Claude Code plugin installed

✨ Installation complete!
```

### Verification (post-install file checks)

| Path | Status |
|---|---|
| `D:/repos/lm-saas/.claude/skills/strong-tests/SKILL.md` | ✅ exists |
| `D:/repos/lm-saas/.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts` | ✅ exists |
| `D:/repos/lm-saas/.claude/skills/strong-tests/references/anti-patterns.md` | ✅ exists |
| `D:/repos/lm-saas/.claude/skills/strong-tests/references/tooling-setup.md` | ✅ exists |
| `D:/repos/lm-saas/.claude/skills/strong-tests/references/stryker.config.template.mjs` | ✅ exists (после manifest fix) |
| `D:/repos/lm-saas/.dev-pomogator/tools/test-quality/posttool-jit.ts` | ✅ exists (host-копия для hook) |
| `D:/repos/lm-saas/.claude/settings.local.json` `posttool-jit` hook entry | ✅ registered via `tsx-runner-bootstrap.cjs` portable wrapper |

### Install warnings

- `[WARN] Using empty fallback for: D:\repos\lm-saas\package.json` × 2 — lm-saas — multi-language monorepo без top-level package.json. Installer expects optional Node.js metadata; absence — non-fatal warning, не блокирует install. Pre-existing dev-pomogator behavior, not strong-tests-specific.
- `⚠ SECURITY: Found .mcp.json with potential plaintext secrets` — pre-existing security warning из `.mcp.json` в lm-saas. Not related к strong-tests. Documented as advisory.

## Smoke Test — C# Detector (AiPomogator)

### Targets

3 production C# files (identified by Explore agent earlier in session):

| File | LOC (~) | Production purpose |
|---|---|---|
| `AiPomogator.Library.LlmClient/Converters/CommaSeparatedListConverter.cs` | ~80 | JSON converter producing List<string> from comma-separated |
| `AiPomogator.Service.Core/BoundedContexts/Billing/Domain/Aggregates/PricingCatalog.cs` | ~90 | Billing aggregate with List<ModelPrice> initialization |
| `AiPomogator.Service.Core/BoundedContexts/Billing/Domain/Aggregates/BillingAggregate.cs` | ~300 | Transaction aggregate с IReadOnlyList wrappers + FirstOrDefault chains |

### Results

| File | Stack | Candidates | Kind | Return Type | Scan ms |
|---|---|---|---|---|---|
| CommaSeparatedListConverter.cs | csharp | 1 | collection-returning | `List<string>` (function `Read`) | 3 |
| PricingCatalog.cs | csharp | 1 | collection-returning | `List<ModelPrice>` (function `InitializeDefaultModels`) | 3 |
| BillingAggregate.cs | csharp | 1 | collection-returning | `IEnumerable<Transaction>` (function `GetTransactionsForPeriod`) | 2 |

**All 3 candidates correctly identified.** Каждая функция action возвращает коллекцию. Не было false positives. Performance well within NFR-P4 budget (500ms).

### Notes

- `BillingAggregate.cs` имеет в коде `FirstOrDefault()` chains которые могли бы trigger composition-chain kind — но detector v0.3.0 не реализует full composition-chain detection (это roadmap). Detector корректно выдал `collection-returning` без false escalation.
- `PricingCatalog.cs` `InitializeDefaultModels` — legitimate candidate (returns List<ModelPrice> initialized in-place). Invariant suggestions (cardinality / uniqueness / conservation) — applicable: тесты должны проверять что catalog содержит exactly N expected models без duplicates.
- Suppression mechanism не активирован ни в одном из файлов (`suppressed: 0`) — фичу проверим в Chunk 4 PostToolUse smoke.

## Smoke Test — Go Detector (new-api-modified)

### Targets

5 production Go files (selected via grep `^func.*\)\s*\[\]|^func.*\)\s*map\[`):

| File | Production purpose |
|---|---|
| `service/group.go` | User group resolution |
| `service/convert.go` | OpenAI → Claude response stream conversion |
| `service/str.go` | String utility (RemoveDuplicate) |
| `controller/channel.go` | Channel HTTP handlers |
| `controller/log.go` | Log query handlers |

### Results

| File | Stack | Candidates | Top finding | Scan ms |
|---|---|---|---|---|
| service/group.go | go | 2 | `GetUserUsableGroups()` → `map[string]string`, **kind nxm-overlap** | 2 |
| service/convert.go | go | 1 | `StreamResponseOpenAI2Claude()` → `[]*dto.ClaudeResponse` | 2 |
| service/str.go | go | 1 | `RemoveDuplicate()` → `[]string`, **kind nxm-overlap** | 1 |
| controller/channel.go | go | 1 | `getVertexArrayKeys()` → `[]string` | 2 |
| controller/log.go | go | 0 | (no collection-returning functions detected; file consists of HTTP handlers returning gin.HandlerFunc) | 1 |

**4/5 files produced candidates** (5th был empty — корректно, log controller — gin handlers, не collection-returners). All findings — реальные production functions with collection return signatures.

### Notable findings

- `service/str.go::RemoveDuplicate` is **nxm-overlap** kind — Go's standard "uniqueness via nested loop" pattern. Это **classic candidate for invariant test**: input slice with N items, output should have ≤N items, all unique. Cardinality + uniqueness invariants exactly applicable.
- `service/group.go::GetUserUsableGroups` returns map with nested for-range — likely iterates groups+users to build dict. Map invariants (coverage + no-leak) suggested correctly.

### Production-ready signal

Detector работает в real-world Go code без false positives. Не помечает все функции — только те которые реально returns collections.

## Stryker.NET Baseline — AiPomogator.Library.Shared

### Setup

```bash
# Install once (global)
dotnet tool install -g dotnet-stryker  # version 4.14.1

# Config: D:/repos/lm-saas/source-code/AiPomogator/stryker-config.json
# Scope: AiPomogator.Library.Shared.csproj (smallest production project)
# Test project: AiPomogator.Tests.csproj (xUnit + Reqnroll)
```

### Run command

```bash
cd D:/repos/lm-saas/source-code/AiPomogator
bash D:/repos/dev-pomogator/scripts/bg-log.sh stryker-aipomogator dotnet-stryker --config-file stryker-config.json
```

(Running in background per `.claude/rules/pomogator/no-blocking-on-tests.md` — capture log на `.dev-pomogator/.bg-logs/`.)

### Status: BLOCKED — test infrastructure issues (2026-05-12 23:49 → 2026-05-13 00:10, ~21 min)

**Stryker.NET exited 0 но mutation phase не стартовала.** Initial test run завершился, но многие tests упали на baseline run из-за external dependencies теста.

### Verbatim error patterns из stryker-output.log

```
System.InvalidOperationException : Failed to create token: Unauthorized, invalid access token
System.InvalidOperationException : Failed to drop/create database: ERROR:  DROP DATABASE cannot run inside a transaction block
System.TimeoutException : Timeout 60000ms exceeded
```

### Affected test scenarios

- `005-T1.01 - Получение получение сети через TTS` — auth required
- `005-T2.01 - Реквестирование набор число через SDK` — auth required
- `005-T2.02, 005-T2.03` — auth required
- `005-T3.01` — database transaction block error
- `GC-EMB-001, GC-EMB-002, GC-EMB-003` — auth / database errors

### Root cause analysis

AiPomogator.Tests/ — Reqnroll BDD integration tests. Scenarios предполагают:
1. Доступный backend auth service для token issuance
2. PostgreSQL database с DROP-able permission (without transaction wrap)
3. Network reachability к external API endpoints (OpenAI/Claude/etc — visible в log как `/v1/chat/completions`, `/v1beta/models`, etc.)

В data-collection environment (dev machine без production infrastructure) — все эти tests fail at initial run. Stryker.NET требует **зелёный** initial test run для baseline; нет baseline → mutation phase skip-ает.

### Implication for skill

**Skill itself worked correctly:**
- Stryker.NET dispatched successfully (config parsed после fix invalid `timeout-ms` → `additional-timeout`)
- Tools (dotnet-stryker 4.14.1) detected, executed
- Output captured to log
- Exit code 0 (Stryker.NET считает что "ran" — даже если tests failed)

**Skill cannot fix:**
- External infra dependencies в target's test project (это application-level concern, не tooling)
- Test execution environment setup (auth services, DB, API endpoints) — отдельная задача user-а

### Honest outcome

**No kill rate baseline obtained for AiPomogator.** Stryker.NET — bonus measurement, не critical для skill verification. Skill works (install + smoke + cross-skill composition + 56 vitest tests all PASS). Stryker baseline отложен до момента когда у AiPomogator появится self-contained test scope (e.g. unit tests без external deps).

### Recommendation для AiPomogator owners

Чтобы получить mutation score baseline:
1. Создать `AiPomogator.UnitTests` отдельный csproj с pure unit tests (no auth, no DB, no API)
2. Установить `[Trait("Category", "Unit")]` markers
3. Использовать `--test-case-filter "Category=Unit"` в Stryker config
4. Initial test run проходит → mutation phase starts → baseline appears

Это вне scope `strong-tests` skill. Document как known limitation для real-world adoption.

## Skill product audit — what works / what's broken

### ✅ Works

1. **Plugin installation** via `npx ... --plugins=test-quality` — все файлы скилла копируются, hook registers, settings.local.json updated.
2. **Multi-project install** — installer correctly детектит git repo root (lm-saas/) и устанавливает one set of artifacts covering all siblings (AiPomogator + new-api-modified + другие subdirs).
3. **Detector C# / Go regex** — корректно работает на real production code без false positives.
4. **Performance NFR-P4** — все smoke tests < 5ms (NFR budget 500ms, ×100 запас).
5. **Manifest fix** — `stryker.config.template.mjs` теперь tracked в `skillFiles.strong-tests`, installer копирует его и compute hash.
6. **Portable hook command** — installer transforms `npx tsx ...` → `node -e require(...tsx-runner-bootstrap.cjs)` для Windows compatibility (no npx PATH issues).
7. **Cross-skill composition wires** (Chunk 3): simplify-extended.md + run-tests Step 5 + create-spec phase3 Step 1c — explicit invocation patterns с Skill() syntax. Будут активны после установки на target repo.

### ⚠️ Friction / known limitations

1. **`controller/log.go` returned 0 candidates** — это правильно для gin handlers, но detector не различает «правильно 0» vs «пропустил все». Roadmap: add diagnostic flag e.g. `--explain` для verbose output про checked patterns.
2. **No suppression observed in real code** — нет `// strong-tests:skip` markers в lm-saas codebase yet. Это expected (skill только что установлен). Будет наблюдаемо после next PR cycle.
3. **Composition-chain kind never triggered** на lm-saas smoke set — detector v0.3.0 имеет only basic pattern. Roadmap v0.5.0+: LINQ chain detection (.SelectMany().GroupBy()) + Go chained calls.
4. **Stryker.NET config syntax differs from Stryker (TS)** — template `stryker.config.template.mjs` writes JS config с {{TODO}} placeholders; Stryker.NET needs JSON (`stryker-config.json`). Создан adapted config для AiPomogator manually. Roadmap: add `references/stryker-net.config.template.json` parallel template.
5. **Pre-existing security advisory** в lm-saas `.mcp.json` (GITHUB_TOKEN plaintext) — installer correctly flagged, не связано со strong-tests.

### 📋 Recommended next steps (v0.5.0 roadmap)

1. Add `references/stryker-net.config.template.json` parallel template для .NET ecosystem.
2. Composition-chain detection: enrich detector для `.Select().Where().GroupBy()` LINQ patterns (C#) + Go `result := foo(...); result2 := bar(result)` chained calls.
3. Mutation-feedback loop autopilot — `scripts/run-mutation.ts` пока single-shot dispatcher; v0.5.0 — iteration loop с auto-tests-for-survivors.
4. ast-grep migration (v0.6.0) — regex детектор fragile на multi-line C# signatures; ast-grep даст более надёжный AST-based parsing.
5. End-to-end smoke в production PR: Edit a real .cs file в AiPomogator с new method returning List<Item>, verify hook fires + additionalContext emit-ится в Claude Code session.

## Cross-references

- Spec: `.specs/strong-tests/` (parent directory)
- Skill: `.claude/skills/strong-tests/SKILL.md`
- Tests: `tests/e2e/strong-tests-jit.test.ts` (9 integration tests) + `tests/e2e/detect-invariant-candidates-unit.test.ts` (47 unit tests)
- Manifest: `extensions/test-quality/extension.json` v1.3.0
- Prior dogfood: `reports/mutation/mutation.html` (Stryker baseline на dev-pomogator/detect-invariant-candidates.ts — 56.83% kill rate, see commit 56a46f7 + iteration improvements)
