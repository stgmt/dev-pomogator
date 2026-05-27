# strong-tests Skill — User Guide

> Mutation-resistant test generation, audit, and classification skill для Claude Code. Закрывает gap «coverage высокий, mutation score низкий». Production-ready v0.6.0.

## Quick start (3 минуты)

### Step 1: install
Already installed if you ran `npx dev-pomogator --claude --plugins=test-quality`. Verify:

```bash
ls .claude/skills/strong-tests/    # SKILL.md + scripts/ + references/
ls tools/test-quality/posttool-jit.ts    # hook handler
```

### Step 2: invoke skill

Через Claude Code:
```
/strong-tests             # auto-detect mode based on context
Skill("strong-tests")     # programmatic invocation
```

Или вызывай scripts напрямую:
```bash
npx tsx .claude/skills/strong-tests/scripts/<script-name>.ts <args>
```

### Step 3: pick mode

| Need | Mode | Script |
|---|---|---|
| Audit existing tests for anti-patterns | §6.2 Audit | (built-in skill workflow) |
| Find collection-returning functions без tests | §6.4 JiT auto-trigger | `detect-invariant-candidates.ts <file>` |
| Classify tests Unit/Integration/E2E | §3 Classification | `classify-tests.ts <dir>` |
| Apply Trait markers automatically (v0.5.3) | §3 Apply | `classify-tests.ts <dir> --apply` |
| Run mutation testing baseline | §6.3 Mutation-feedback | `run-mutation.ts <dir>` |
| LLM survivor analysis (v0.5.1) | §6.3 + manual orchestration | `survivors-batch-prompt.ts` + `merge-survivor-verdicts.ts` |
| Autopilot mutation loop (v0.6.0 minimal) | §6.3 autopilot | `autopilot-mutation.ts <dir> --iter=1` |

## Workflows — 5 common scenarios

### A. «У меня новый код, нужны strong tests» — Greenfield mode

```bash
# Step 1: detector — найди collection-returning functions
npx tsx detect-invariant-candidates.ts src/MyService.cs

# Step 2: skill workflow — для each candidate напиши invariant tests
# (see SKILL.md §6.1 для details)
```

Skill suggests invariants per kind:
- `collection-returning` → cardinality + uniqueness + conservation
- `nxm-overlap` → above + boundary checks
- `composition-chain` → above + monotonicity

### B. «У меня untagged C# / Python tests, нужно Stryker» — Classification + Apply

```bash
# Step 1: dry-run preview
npx tsx classify-tests.ts MyProject.Tests --apply --dry-run > preview.json

# Step 2: review preview — confirm reasonable classifications
cat preview.json | jq '.results[] | select(.action == "would-apply")'

# Step 3: real apply (default --confidence=high)
npx tsx classify-tests.ts MyProject.Tests --apply

# Step 4: now Stryker runs только на Unit (Integration/E2E skipped по умолчанию)
dotnet-stryker --config-file stryker-config.json
```

Default `--confidence=high` отказывает 30-40% классификаций (medium/low confidence skipped). Override через `--confidence=medium` если хочешь больше coverage за счёт safety.

### C. «Хочу formal mutation kill rate baseline» — Mutation-feedback mode

```bash
# C# project с Stryker.NET
cp .claude/skills/strong-tests/references/stryker-net.config.template.json stryker-config.json
# Edit {{TODO}} placeholders for your project
dotnet tool install -g dotnet-stryker
npx tsx run-mutation.ts .

# TypeScript project с Stryker
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
cp .claude/skills/strong-tests/references/stryker.config.template.mjs stryker.config.mjs
# Edit placeholders
npx tsx run-mutation.ts .

# Python project с mutmut
pip install mutmut
npx tsx run-mutation.ts .
```

Exit codes:
- `0` — threshold met (≥70% kill rate)
- `1` — below threshold (data — not error)
- `2` — no stack/tool detected
- `3` — tool execution failure

### D. «Анализ выживших mutants — какие реальные, какие equivalent» — LLM Survivor Analysis (v0.5.1)

```bash
# Step 1: run mutation с annotation
npx tsx run-mutation.ts . --analyze-survivors > report.json

# Step 2: batch survivors для LLM analysis
npx tsx survivors-batch-prompt.ts report.json --budget-usd=2 > batches.jsonl

# Step 3: AI agent (in Claude Code) invokes Agent() per batch:
#   for each line in batches.jsonl:
#     Agent(subagent_type="general-purpose") with prompt
#     save to verdicts-batch-N.json

# Step 4: merge verdicts back
npx tsx merge-survivor-verdicts.ts report.json verdicts-batch-*.json > enriched.json

# Output: enriched.json has gaps[] с equivalentSuspect + confidence + rationale per survivor
```

Cost: ~$0.30-0.60 per 200 survivors на Claude Sonnet 4.6 batch pricing.

### E. «Autopilot iteration loop» — Mutation-feedback autopilot (v0.6.0 minimal)

```bash
# Iteration 1: skill runs mutation → emits batches.jsonl → waits для AI agent
npx tsx autopilot-mutation.ts . --iter=1 --threshold=70 --max-iter=5

# AI agent reads batches.jsonl, invokes Agent() per batch, saves verdicts
# (manual step — autopilot orchestrates via Skill workflow)

# Iteration 2+: same pattern, kill rate measured per iter
npx tsx autopilot-mutation.ts . --iter=2

# Terminates when:
# - killRate >= threshold (success)
# - iter >= maxIter (max iterations reached)
# - 0 survivors (nothing to mutate)
```

v0.6.0 minimal: bookkeeping + threshold check. Killer-test writing — manual step (или Skill subworkflow). Full automation — v0.7.0+ roadmap.

## File map

| Path | Purpose |
|---|---|
| `SKILL.md` | Main workflow + 12-point self-eval + §1.5 behavioural prior |
| `scripts/detect-invariant-candidates.ts` | JiT detector (collection-returning, nxm-overlap, composition-chain) |
| `scripts/run-mutation.ts` | Stryker / mutmut / Stryker.NET dispatch |
| `scripts/classify-tests.ts` | Unit / Integration / E2E classifier с --apply (v0.5.3) |
| `scripts/survivors-batch-prompt.ts` | LLM survivor analysis batching (v0.5.1) |
| `scripts/merge-survivor-verdicts.ts` | Verdict merge back into MutationReport (v0.5.1) |
| `scripts/autopilot-mutation.ts` | Iteration runner (v0.6.0 minimal) |
| `references/anti-patterns.md` | 8 anti-patterns catalogue + grep regex |
| `references/tooling-setup.md` | Install + thresholds per 6 stacks |
| `references/stryker.config.template.mjs` | Stryker TS template |
| `references/stryker-net.config.template.json` | Stryker.NET template (v0.5.0) |

## Supported stacks (v0.6.0)

| Stack | Detection | Mutation tool | --apply marker |
|---|---|---|---|
| TypeScript | `package.json` + vitest/jest | Stryker | `// @category: <X>` |
| Python | `pyproject.toml` / `setup.py` + pytest | mutmut | `pytestmark = pytest.mark.<x>` |
| C# / .NET | `*.csproj` + xunit/NUnit | Stryker.NET | `[Trait("Category", "<X>")]` |
| Go | `go.mod` + `*_test.go` | go-mutesting (manual) | `//go:build <x>` |
| Java | `pom.xml` + junit | PIT (doc-only) | (v0.7.0+) |
| Rust | `Cargo.toml` | cargo-mutants (manual) | (v0.7.0+) |

## Cross-skill composition

When AI invokes other skills:

| Caller | Calls strong-tests when... | Pattern |
|---|---|---|
| `/simplify` | test files в diff | Skill("strong-tests") for audit |
| `/run-tests` Step 5 | test files modified last commit | Hint to run mutation analysis |
| `/create-spec` Phase 3 | TASKS.md contains test items | Optional recommendation post task-board-forms |
| `tests-create-update` | new test file written | Post-write strength verification |

## JiT auto-trigger (PostToolUse hook)

Hook armed by extension `test-quality`. Fires on `Write|Edit` to production code (`.ts`/`.tsx`/`.py`/`.cs`/`.go`), excluding test paths. Emits `additionalContext` с invariant suggestions when collection-returning / nxm-overlap / composition-chain detected.

To suppress detection on legitimate exceptions:
```typescript
// strong-tests:skip pure-leaf reducer — type system enforces
function leafReducer(items: Item[]): number { /* ... */ }
```

```python
# strong-tests:skip math identity function
def pure_hash(x: int) -> int:
    return x * 31
```

Reason ≥8 chars required. Audit log: `.claude/logs/strong-tests-skips.jsonl`.

## Anti-gaming guards (§8 hard-NO)

1. NO emitting tests без 12-point self-eval report
2. NO coverage % as proof of strength (only mutation kill rate OR PBT pass-rate)
3. NO equivalent-mutant silent skip — mark `[EQUIVALENT_SUSPECT]` for human review
4. NO blocking session на mutation runs (>2min → `run_in_background`)
5. NO reporting «работает» без visual verification в real environment
6. NO trusting LLM equivalent verdicts blindly — verdicts are suggestions
7. NO auto-applying Trait markers без `--confidence=high` threshold (or explicit override)

## Real-world validation

- **smarts** (Cleverence enterprise C#): 761 tests classified → 514 Unit / 238 Integration / 9 E2E
- **lm-saas/AiPomogator** (.NET): 79 tests classified → 52/8/19; 10 Steps files --apply: 6 applied + 4 skipped (safety threshold)
- **meridian** (TS): 93 tests classified → 88/4/1; gap found в crush.ts/forgecode.ts/opencode.ts/pi.ts — 12 invariant tests recommended per function
- **dev-pomogator** (own): 60 vitest tests (47 unit + 9 JIT + 4 dotnet + 5 survivor + 12 classification + 5 apply) all PASS
- **Stryker.NET fixture**: 80.49% kill rate baseline в 15.4s (41 mutants)

## Diagnostics

Set `STRONG_TESTS_DEBUG=1` env var для verbose output:

```bash
STRONG_TESTS_DEBUG=1 npx tsx run-mutation.ts <target>
# Outputs propagated env vars + stack detection trace
```

## Known limitations

- **Bun test runner** — Stryker не supports natively (see `BUN_RUNNER_GAP.md`); workaround: command-runner OR migrate to vitest
- **TS multi-line function signatures** — regex single-line; ast-grep migration covers TS only в v0.6.0
- **Stryker.NET integration tests** — require green initial baseline (live infra fails — use `--include-integration` carefully)
- **Java / Rust mutation dispatch** — doc-only per FR-6; manual invocation per references/tooling-setup.md

## See also

- `SKILL.md` — full skill workflow с §0..§8 sections
- `.specs/strong-tests/` — spec directory: FR.md / ACCEPTANCE_CRITERIA.md / REQUIREMENTS.md / TASKS.md
- `.specs/strong-tests/FIELD_VERIFICATION*.md` — real-world install + smoke results
- `.specs/strong-tests/INVARIANTS.md` — invariants catalogue per public function
- `.specs/strong-tests/REAL_TASK_MERIDIAN.md` — example gap analysis on production code
- `.specs/strong-tests/BUN_RUNNER_GAP.md` — Bun test runner blocking issue
