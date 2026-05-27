# Design

## Реализуемые требования

- [FR-1: Greenfield strong-test generation with PBT](FR.md#fr-1-greenfield-strong-test-generation-with-pbt)
- [FR-2: Audit existing tests against 8-anti-pattern catalogue](FR.md#fr-2-audit-existing-tests-against-8-anti-pattern-catalogue)
- [FR-3: Mutation-feedback loop until threshold](FR.md#fr-3-mutation-feedback-loop-until-threshold)
- [FR-4: Multi-stack auto-detection](FR.md#fr-4-multi-stack-auto-detection)
- [FR-5: 12-point self-eval as final gate with PASS/FAIL report](FR.md#fr-5-12-point-self-eval-as-final-gate-with-passfail-report)
- [FR-7: JiT (Just-in-Time) auto-trigger via PostToolUse hook](FR.md#fr-7-jit-just-in-time-auto-trigger-via-posttooluse-hook)

## Компоненты

- `SKILL.md` — main workflow document. 8 sections (Why this exists / Pre-write checklist / Multi-framework tooling matrix / Anti-pattern detection table / 12-point self-eval / 3 execution modes / Verbatim prompt templates / Anti-халява invariants).
- `references/anti-patterns.md` — detailed catalogue of 8 anti-patterns + honnibal-style 8-category mutation catalogue (loaded on-demand when audit/manual-mutation modes invoke it).
- `references/tooling-setup.md` — per-stack install + run + threshold matrix for all 6 supported stacks. Loaded on-demand for stacks beyond TS+Python.
- `scripts/run-mutation.ts` — pure TS, runs via tsx, no extra runtime deps. Reads `package.json` / `pyproject.toml` to detect stack, dispatches Stryker / mutmut subprocess, parses JSON output, returns standardized killRate-plus-survivors shape (see "## API" section below for full JSON schema).
- `scripts/detect-invariant-candidates.ts` — pure TS, runs via tsx. ast-grep based scanner. Input: file path. Output: JSON list of candidate functions (collection-returning / N×M / composition) + suppressed functions + scan duration. Spec в `strong-tests_SCHEMA.md`.
- `posttool-jit.ts` — PostToolUse hook handler installed at `.dev-pomogator/tools/test-quality/posttool-jit.ts`. Reads project-dir from env [VERIFIED: https://code.claude.com/docs/en/hooks env contract] + tool_input.file_path, filters production-code paths (excludes test paths), spawns detector subprocess via `child_process.spawn`, parses detector JSON, emits `additionalContext` JSON to stdout per Claude Code PostToolUse hook protocol, appends suppression entries to `.claude/logs/strong-tests-skips.jsonl`.

## Где лежит реализация

- App-код: `.claude/skills/strong-tests/`
- Wiring: `extensions/test-quality/extension.json` (skills.strong-tests + skillFiles.strong-tests entries)

## Директории и файлы

- `.claude/skills/strong-tests/SKILL.md`
- `.claude/skills/strong-tests/references/anti-patterns.md`
- `.claude/skills/strong-tests/references/tooling-setup.md`
- `.claude/skills/strong-tests/scripts/run-mutation.ts`
- `extensions/test-quality/extension.json` (edited)
- `.specs/strong-tests/report.html` (Phase 6 HTML report deliverable)
- `tests/e2e/strong-tests.test.ts` (planned BDD test)
- `.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts` (planned — JiT detector)
- `extensions/test-quality/tools/test-quality/posttool-jit.ts` (planned — PostToolUse hook handler source; installed to `.dev-pomogator/tools/test-quality/`)
- `tests/e2e/strong-tests-jit.test.ts` (planned — BDD tests for JiT scenarios; ids enumerated in `strong-tests.feature` @feature7)
- `.claude/logs/strong-tests-skips.jsonl` (runtime — created on first suppression; gitignored)

## Алгоритм

### Mode dispatcher (top of SKILL.md workflow)

1. Read `$ARGUMENTS` from invocation.
2. If `$ARGUMENTS` is a path to a source file (e.g. `src/foo.ts`) AND no matching test file exists → **Greenfield mode**.
3. If `$ARGUMENTS` is a path to a test file (e.g. `tests/foo.test.ts`) OR a directory of tests → **Audit mode**.
4. If `$ARGUMENTS` contains `--mutate` flag OR user prompt contains "mutation testing" / "mutation-resistant" → **Mutation-feedback mode**.
5. If `$ARGUMENTS` empty → run auto-detect, present matrix via `AskUserQuestion`.

### Greenfield mode

1. Read target source file. Identify functions + signatures.
2. For each function: identify structural invariants (roundtrip / idempotence / commutativity / associativity / identity) via grep over function body for patterns: `deserialize(serialize(`, `f(f(x)) === f(x)`, etc.
3. For functions with invariants: emit PBT test using `fast-check` (TS) or `hypothesis` (Python).
4. For functions without invariants: emit example-based tests (happy + ≥1 negative + boundary cases).
5. Run 12-point self-eval over emitted tests.
6. Optionally invoke mutation tool to verify ≥70% kill rate (NFR-P1: skip if file is large or mutation tool would exceed 2min — prompt user instead).

### Audit mode

1. Read each test file in target path.
2. For each file run 8 anti-pattern grep scans (regexes in `references/anti-patterns.md`).
3. Compute strength score = `100 - sum(weight_i * count_i)` where `weight_i` is per-pattern severity (e.g., Trivial Input = 30 pts; Permissive Matching = 10 pts).
4. Emit Compliance Report table per file: findings sorted by severity, BAD→GOOD pairs, mapping to 12-point self-eval items.
5. Run 12-point self-eval over the audit findings.

### Mutation-feedback loop

1. Auto-detect stack (delegate to `scripts/run-mutation.ts`).
2. If no mutation tool found → `AskUserQuestion` between (a) install proposal, (b) manual fallback.
3. Iteration N (N starts at 1):
   - Invoke mutation tool subprocess (`stryker run`, `mutmut run`, etc.) via Bash with `run_in_background: true` if estimated >2min.
   - Parse output (Stryker JSON report at `reports/mutation/mutation.json`, mutmut output via `mutmut results`).
   - If kill rate ≥ threshold → emit success report + run 12-point self-eval + STOP.
   - For each survivor: emit proposed test code via Edit tool.
4. If iteration N == max-iter AND threshold not met → emit `[GAP]` report listing remaining survivors with rationale + run 12-point self-eval + STOP.

### JiT auto-trigger flow (FR-7)

1. AI invokes Write or Edit on a file.
2. Claude Code PostToolUse hook system reads `extensions/test-quality/extension.json` `hooks.claude.PostToolUse[]` entries и matches `matcher: "Write|Edit"`.
3. Hook spawns `npx tsx .dev-pomogator/tools/test-quality/posttool-jit.ts` с environment:
   - the project-dir env var (set by Claude Code hooks runtime per https://code.claude.com/docs/en/hooks) — abs path to project
   - tool_input JSON on stdin containing `file_path`, `tool_name`, etc.
4. `posttool-jit.ts` reads stdin, parses JSON, extracts `tool_input.file_path`.
5. Hook checks file path against production-code filter:
   - **Include if**: path matches `*.ts` OR `*.py` (initial v0.1.0 scope)
   - **Exclude if**: path matches `*test*` OR `*__tests__*` OR `*/tests/*` OR `*.test.ts` OR `*_test.py` OR `*.feature` OR `*.md`
6. If excluded → hook exits 0 immediately, no further action.
7. If included → hook spawns detector: `npx tsx .claude/skills/strong-tests/scripts/detect-invariant-candidates.ts <file_path>`.
8. Detector reads file, runs ast-grep с три pattern groups (collection-returning / N×M / composition), produces JSON output per SCHEMA.
9. Hook reads detector JSON.
10. For each suppressed function (entry в `suppressed[]`): hook appends one JSONL line to `.claude/logs/strong-tests-skips.jsonl` (atomic O_APPEND [VERIFIED: POSIX open() flag — fs.appendFileSync uses 'a' which maps to O_APPEND on Node.js fs module] open). Если reason <8 chars: entry includes warning REASON_TOO_SHORT [VERIFIED: status string defined in this spec, see strong-tests_SCHEMA.md §validation rules].
11. For each candidate function (entry в `candidates[]`): hook accumulates suggestion text "file:line — function `<name>` returns `<type>` — suggest invariants: cardinality / uniqueness / conservation".
12. Hook emits PostToolUse response JSON on stdout: `{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "<accumulated suggestion text>"}}`.
13. AI reads `additionalContext` as part of next message context.
14. Hook exits 0 unconditionally — emit-only, never blocks Write|Edit.

### `run-mutation.ts` (auto-detect script)

```typescript
// Pseudocode shape — actual TS file in Phase 4
1. Read CWD.
2. Check package.json devDependencies for @stryker-mutator/core → TS.
3. Else check pyproject.toml [tool.poetry.dev-dependencies] for mutmut → Python.
4. Else check pom.xml for <artifactId>pitest-maven</artifactId> → Java.
5. Else check *.csproj for <PackageReference Include="Stryker.NET"> → C#.
6. Else check Cargo.toml [dev-dependencies] for cargo-mutants → Rust.
7. Else check go.mod for github.com/avito-tech/go-mutesting → Go.
8. If found: spawn subprocess with stack-specific args; parse output to standardized shape.
9. If none: exit 2 with stderr listing 6 supported stacks + detection signals.
```

## API

### `scripts/run-mutation.ts` CLI

- Method: `node` / `tsx` invocation
- Path: `.claude/skills/strong-tests/scripts/run-mutation.ts`
- Request (argv): `[<target-file-or-dir>] [--threshold=<N>] [--max-iter=<M>] [--dry-run]`
- Response (stdout JSON):
  ```json
  {
    "stack": "ts" | "python" | "java" | "csharp" | "rust" | "go" | null,
    "tool": "stryker" | "mutmut" | "pit" | "stryker-net" | "cargo-mutants" | "go-mutesting" | null,
    "killRate": 0.73,
    "survivors": [
      { "file": "src/foo.ts", "line": 42, "mutator": "ConditionalExpression", "originalCode": "x > 0", "mutatedCode": "x >= 0" }
    ],
    "iterations": 2,
    "thresholdMet": true,
    "gaps": []
  }
  ```
- Exit codes: `0` success, `1` threshold not met after max-iter, `2` no stack/tool detected, `3` tool execution failure.

### `scripts/detect-invariant-candidates.ts` CLI (FR-7)

- Method: `node` / `tsx` invocation
- Path: `.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts`
- Request (argv): `<file-path>`
- Response (stdout JSON): see [strong-tests_SCHEMA.md](strong-tests_SCHEMA.md) §"detect-invariant-candidates.ts stdout JSON"
- Exit codes: `0` success (with or without candidates), `2` file not found / unreadable, `3` ast-grep binary missing
- Performance: p95 ≤500ms on files ≤2000 LOC per NFR-P4

### `posttool-jit.ts` Claude Code PostToolUse hook contract

- Invocation: by Claude Code hook runtime per `extension.json` `hooks.claude.PostToolUse[]` array-with-nested-hooks format per `.claude/rules/gotchas/installer-hook-formats.md`
- Input: project-dir env var (Claude Code hook runtime contract); stdin JSON `{tool_name, tool_input: {file_path, ...}, session_id, cwd}`
- Output: stdout JSON `{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: "<string>"}}` per Claude Code hook protocol
- Exit: 0 unconditionally per NFR-R5 (graceful degradation — detector errors не должны fail-ить Write|Edit)
- Side effects: append-only writes to `.claude/logs/strong-tests-skips.jsonl` per NFR-S4

## Key Decisions

### Decision: Mutation testing chosen over coverage-only verification

**Rationale:** Empirical evidence (Schäfer arXiv 2406.18181 §3.4: 74.99% of undetected defects from missing inputs; OutSight worst-case "100% coverage / 4% mutation score"; Ghiringhelli 93.1% line-cov vs 58.62% MSI = 34.4 pp gap) shows coverage is a vanity metric. Mutation testing directly measures whether tests catch behaviour changes — the actual outcome users care about.

**Trade-off:** Mutation runs are slow (5–30min for medium codebases) — bigger UX cost than a `--coverage` flag. Mitigated via NFR-P1 (single-file scope default) + `run_in_background` instruction.

**Alternatives considered:**
- Line / statement / branch coverage only — rejected; Inozemtseva ICSE 2014 ("doesn't seem to matter what type of coverage you use") + MutGen 2025 id_81 (100% line cov / 4% mutation score, peer-reviewed)
- MCDC coverage (aviation-grade DO-178B) — rejected; Inozemtseva: branch и statement perform одинаково, MCDC не даёт measurable gain
- Search-based testing (EvoSuite / Pex) — rejected; stack-specific (Java / .NET), EvoSuite сам использует mutation как fitness — валидирует mutation-as-metric
- Symbolic execution (KLEE) — rejected; Cadar & Sen 2013: не масштабируется на non-linear constraints, fails на typical TS/Python code
- LLM-judge of test quality — rejected; Schäfer 2024: LLM-evaluator наследует те же gaps что test-writer; MutGen + Meta-ACH комбинируют LLM с mutation именно поэтому
- Diff-coverage-only ratchet — rejected; не решает assertion-strength problem, высокая diff coverage со слабыми ассертами = OutSight bug
- PBT without mutation — rejected; PBT verifies только properties о которых developer подумал; Just FSE 2014: mutation supplies "what did you forget" signal

### Decision: Property-based testing (PBT) as primary technique for invariant-driven tests

**Rationale:** Anthropic Red Team (red.anthropic.com 2026): Hypothesis generated 984 bug reports across 100+ Python packages, 56% → 86% validity after ranking, 5 accepted patches in NumPy / Lambda Powertools / Tokenizers. Quoted principle: "if a developer does not think to test an edge case, it is also likely the developer did not consider that case in the implementation". PBT eliminates the "missing input" failure mode (Schäfer 74.99%) by enumerating input space.

**Trade-off:** PBT tests have steeper learning curve and shrinking can be confusing; not every function has obvious structural invariants. Mitigated by emitting PBT only when invariant detected, falling back to example-based otherwise.

**Alternatives considered:**
- Example-only с 12-point checklist — rejected; Schäfer 74.99% — не escape missing-input gap без invariant reasoning
- Fuzzing (libFuzzer / AFL) — rejected; oracle problem (только crashes, не logic bugs); Crowbar = AFL+QuickCheck — falls back на properties
- Metamorphic testing — rejected; "metamorphic = specialized form of PBT" (Hillel Wayne); PBT subsumes
- Contract-based (Eiffel / JML / Code Contracts) — rejected; stack-narrow, invasive source changes, .NET Code Contracts EOL 2019
- TLA+ model checking — rejected как замена; заменяет design docs, не unit tests. Companion (design → TLA+ → impl → PBT), не alternative
- Runtime invariants (TS decorators / Python Protocol) — rejected; high overhead, catches только prod bugs, same oracle gap as fuzzing
- Stryker mutators-as-property-source — это MuTAP / MutGen / Meta-ACH; adopted в FR-3 Mutation-feedback mode как companion для Audit, не alternative для Greenfield

### Decision: Threshold default 70% (configurable)

**Rationale:** Consensus across three independent sources: OutSight ("critical paths ≥70%"), Levnikolaevich marketplace skill (≥75%), Meta ACH acceptance rate (73%). 70% is the floor; standard ≥50%, experimental ≥30% per OutSight tiers.

**Trade-off:** 70% is aggressive for legacy codebases — first runs commonly land at 40–60%. Mitigated by max-iter ceiling (5) + `[GAP]` report so the loop terminates explicitly instead of looping indefinitely.

**Alternatives considered:**
- 60% — rejected; ниже OutSight critical-path recommendation, пропускает много слабых тестов
- 75% — rejected; marginal benefit, ~30% более итераций per Ghiringhelli
- 80% (PIT default) — rejected как default; Petrović 2021 не endorse fixed %, что работает в Google scale не = single-repo. Реализовано как `--strict` opt-in
- 90%+ — rejected; diminishing returns, последние 5pp требуют equivalent-mutant filtering >> test-strengthening
- Variable per-file by criticality (OutSight tier ≥70% / ≥50% / ≥30%) — partial adoption; v2 add `priority.json` config, для v1 single threshold проще
- Ratchet (delta from baseline) — rejected как default; лучше для legacy repos. Реализовано как `--ratchet` flag (mirror Google diff approach)
- Per-mutator-class threshold (Boolean ≥90%, arithmetic ≥80%, statement ≥60%) — rejected; high coordination cost, taxonomies differ Stryker / mutmut / PIT
- MSI vs MSC vs PMS scoring methods — adopted MSC (mutation coverage = killed/total); MSI excludes equivalent (expensive); PMS — Petrović productivity, не unit test fitness

### Decision: TS + Python primary in SKILL.md body; Java/C#/Go/Rust documented only in `references/tooling-setup.md`

**Rationale:** This repo's actual stacks are TS (vitest in main package) + Python (pytest in `extensions/tui-test-runner/`). Verified via `grep package.json pyproject.toml`. Maintaining a full 6-stack matrix in SKILL.md body inflates the skill above the 8K-token soft cap and adds untested code paths. Progressive disclosure: SKILL.md body covers what dev-pomogator users will most commonly invoke; references/ covers everything else.

**Trade-off:** Users on Java/C#/Go/Rust stacks must load an extra reference file. Acceptable cost — Anthropic's skill-development meta-skill explicitly endorses this 3-tier load pattern.

**Alternatives considered:**
- TS-only — rejected; dev-pomogator = платформа, target users — polyglot repos
- Python-only — rejected; то же, плюс канонические тулы (PIT, Stryker.NET) вне Python ecosystem
- All 6 stacks в SKILL.md body — rejected; ~14K tokens, выше 8K soft cap, progressive disclosure более sustainable
- Dynamic loading via Skill argument (`Skill("strong-tests", {stack: "rust"})`) — rejected; Anthropic Skills не поддерживают runtime args этим способом
- Per-extension matrix (strong-tests-ts, strong-tests-py) — rejected; violates extension-layout.md (один extension per scope), duplicates catalogue 6×
- TS + Python + Java в body (3 стэка) — rejected; Java не в dev-pomogator dogfood scope, нет CI для validate, stale documentation risk

### Test IDs naming convention

Test IDs follow `DOMAIN_CODE_NN` convention per `.claude/rules/extension-test-quality.md`. References in DESIGN.md to scenario codes are 1:1 mapped to `tests/e2e/strong-tests-jit.test.ts` `it()` blocks per BDD discipline. See `strong-tests.feature` for the canonical list of scenario codes (this DESIGN.md does not duplicate them to avoid env-var-like false positives in audit-spec FANTASIES check).

### Decision: PostToolUse hook chosen over UserPromptSubmit skill-activation-only for auto-trigger

**Rationale:** Three independent industry signals point at PostToolUse + structural-detection pattern as the standard for catch-test-at-write-time workflow:

1. **Meta JiT Testing (engineering.fb.com 2026-02-11; arXiv 2601.22832)**: 4× catch generation rate vs hardening tests at code-review-time. Mechanism: LLM + program analysis runs on diff, generates tests designed to **fail** when regressions exist. Reproducible принцип: тесты generated **at the moment** code лежит на диске, не статически pre-written.
2. **Claude Code PostToolUse + ast-grep canonical pattern (code.claude.com/docs/en/hooks; paulmduvall.com 2026)**: matcher `Write|Edit` на production-code файлы → ast-grep детектирует structural patterns → hook эмитит `additionalContext` который AI читает как nudge. Existing `tests-create-update` extension использует identical pattern на test files.
3. **Skill semantic matching unified surface (anthropics/claude-code plugin-dev/skills/hook-development/SKILL.md)**: `description:` frontmatter parsed Claude Code, embedded в Skill tool description, LLM матчит intent на description при slash invocation **И** при auto-context insertion от hook. Один SKILL.md покрывает оба сценария — no duplication.

**Trade-off:** PostToolUse hooks add latency to Write|Edit (≤500ms p95 per NFR-P4). False-positive rate возможен если detector triggers on legitimate pure-leaf functions. Mitigated через suppression comment + audit log per `scope-gate` escape-hatch pattern.

**Alternatives considered:**

- **Slash-command only (status quo before v3)**: rejected — Real-session evidence (session-pilot agent self-postmortem 2026-05-11): doc-on-disk не становится behavioural prior automatically; same agent wrote `output-invariants-first.md` and 2 hours later violated it 2 раунда подряд. Slash-only requires user invocation discipline, which the agent has empirically failed to maintain.
- **UserPromptSubmit hook with keyword injection**: rejected — fires on user-prompt boundary, not at code-write boundary. Latency between code-write and next prompt можно быть несколько minutes — bug уже зафиксирован к моменту срабатывания.
- **PreToolUse hook blocking Write**: rejected — too aggressive. Pure-leaf functions, scratch experiments, debugging code would be blocked. NFR-R5 graceful degradation contract incompatible с blocking. Meta JiT не блокирует commit — лишь suggests catch tests.
- **In-editor LSP integration**: rejected — out of Claude Code scope (LSP runs in user's editor, not in Claude Code runtime). Cross-editor support burden (VS Code, JetBrains, vim, emacs) высокий.
- **Separate `invariants-audit` extension**: rejected — duplicates skill content + manifest + tests. Per Skill semantic matching pattern (Anthropic plugin-dev/skills/hook-development): one SKILL.md покрывает slash + hook activation surfaces. Sibling `tests-create-update` precedent confirms.

**Sources verified 2026-05-11:**
- https://engineering.fb.com/2026/02/11/developer-tools/the-death-of-traditional-testing-agentic-development-jit-testing-revival/
- https://arxiv.org/abs/2601.22832
- https://www.infoq.com/news/2026/04/meta-jit-testing-ai-detection/
- https://code.claude.com/docs/en/hooks
- https://www.paulmduvall.com/claude-code-hooks-code-quality-guardrails/
- https://ast-grep.github.io/catalog/typescript/
- https://ast-grep.github.io/catalog/python/

### Decision: Separate parallel skill from `tests-create-update` (no merge)

**Rationale:** `tests-create-update` is WRITE-TIME prevention (16 anti-patterns, triggered when Claude is writing tests). `strong-tests` is POST-WRITE strength verification (mutation testing, PBT, 12-point self-eval, triggered when user says "weak tests" / "fake-positive" / "mutation"). Two distinct trigger surfaces, two distinct user intents, two distinct execution contexts. Merging would inflate one description and cause auto-loading collisions.

**Trade-off:** Two skills to maintain instead of one. Mitigated via bidirectional cross-link (`## Related Skills`) so users discover the sibling.

**Alternatives considered:**
- Merge в один mega-skill — rejected; combined SKILL.md >> 8K tokens, different triggers (write-time vs post-write), conflates prevention vs verification
- Extend `tests-create-update` с `--mode strong` flag — rejected; не решает token budget, Anthropic activation keyword-based, sub-mode flag требует preload — worst of both worlds
- Shared workflow doc — rejected; hidden coupling, harder to discover from skill registry, cross-link в SKILL.md preamble проще
- Sibling subagent invocation (`tests-create-update` зовёт `strong-tests` post-write) — rejected; doubles runtime cost, users хотят strong-tests на legacy тестах тоже, independent invocation — necessary capability
- Hook-based auto-trigger (PostToolUse hook на test file Write) — rejected; high false-positive rate (setup files, helpers, fixtures), hook latency. Кандидат на v3 когда mutation runtime <30s
- Single skill с deferred mutation (просто печатает "run /strong-tests later") — rejected; splits user journey без advantage, всё равно invoke второй flow

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_NONE
**TEST_DATA:** TEST_DATA_NONE
**TEST_FORMAT:** UNIT
**Framework:** N/A при UNIT
**Install Command:** already installed (vitest in package.json devDependencies)
**Evidence:** `grep "vitest" package.json` → `"vitest": "^3.2.4"` in devDependencies. dev-pomogator uses vitest+E2E test convention per `.claude/rules/integration-tests-first.md` rather than reqnroll/cucumber for skill testing. Existing siblings `tests/e2e/dedup-tests.test.ts` and `tests/e2e/tests-create-update.test.ts` follow this convention.
**Verdict:** No BDD hooks/fixtures required. Skill tests follow vitest E2E pattern using helper utilities from `tests/e2e/helpers.ts`. `.feature` file serves as BDD-style scenario documentation (1:1 mapping with vitest `it()` blocks per `extension-test-quality` rule) but executes via vitest, not via cucumber.

> Risks acknowledged for UNIT format: vitest E2E tests must call real production code paths (the skill workflow when invoked) via spawnSync or direct skill-loader simulation, not mock the SKILL.md content. Per `.claude/rules/integration-tests-first.md` skill tests SHALL exercise actual file existence + frontmatter parsing + scripts/run-mutation.ts invocation against fixture inputs.
