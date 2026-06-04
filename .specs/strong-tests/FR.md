# Functional Requirements (FR)

## FR-1: Greenfield strong-test generation with PBT

Skill SHALL produce strong tests for newly authored production code when invoked in Greenfield mode against a target file path. For every function with a structural invariant (roundtrip, idempotence, commutativity, associativity, identity), the skill SHALL emit at least one property-based test using the stack-appropriate framework (fast-check for TS, Hypothesis for Python). For every function without obvious structural invariants, the skill SHALL emit example-based tests covering at minimum: happy path, negative path, boundary conditions (min, max, empty, null/None, very-large, unicode where applicable). Every assertion SHALL include a descriptive failure message. The negative-to-positive scenario ratio SHALL be ≥1:2.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-greenfield-write-strong-tests-for-new-module-feature1)
**User Story:** [Story 1](USER_STORIES.md#user-story-1-greenfield-strong-tests-for-new-code-priority-p1)

## FR-2: Audit existing tests against 8-anti-pattern catalogue

Skill SHALL provide an Audit mode that, given a path to an existing test file or directory, scans for the 8 anti-patterns documented in `references/anti-patterns.md`: (1) Permissive Matching (toBeDefined / NotNull only), (2) Assertion Roulette (multiple unlabelled asserts), (3) Magic Number Test, (4) Happy-Path-Only, (5) Tautological Assertion (recompute expected with same logic), (6) Trivial Input (e.g., `console.log("OK")`), (7) Silent Skip / catch-and-swallow, (8) Missing Await on async. For each finding skill SHALL emit a finding row with: file:line, anti-pattern code, BAD snippet, GOOD replacement, rationale, and a mapping to the 12-point self-eval item the finding violates. Skill SHALL compute a per-file strength score (0–100) based on weighted anti-pattern frequency.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-audit-review-existing-weak-test-suite-feature2)
**User Story:** [Story 2](USER_STORIES.md#user-story-2-audit-existing-tests-for-hidden-weakness-priority-p1)

## FR-3: Mutation-feedback loop until threshold

Skill SHALL provide a Mutation-feedback mode that auto-detects the project's mutation tool from manifests (package.json for Stryker, pyproject.toml for mutmut, pom.xml for PIT, csproj for Stryker.NET, Cargo.toml for cargo-mutants, go.mod for go-mutesting). For TS+Python (primary stacks) the skill SHALL invoke the detected tool via `scripts/run-mutation.ts`. The skill SHALL parse survived mutants, propose a targeted test per survivor (with file:line of the mutation point), apply the proposed fix, and re-invoke the mutation tool. The loop SHALL terminate when: (a) kill rate ≥ user-specified threshold (default 70% per OutSight + Levnikolaevich consensus), OR (b) max-iter (default 5) reached. On max-iter exit skill SHALL emit a `[GAP]` report listing remaining survivors with rationale. If no mutation tool is detected, skill SHALL offer (a) install command, (b) AI-driven manual mutation fallback per the honnibal-style 8-category catalogue in `references/anti-patterns.md`.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-mutation-feedback-loop-strengthen-until-threshold-feature3), [UC-5](USE_CASES.md#uc-5-tool-missing-fallback-to-ai-driven-manual-mutation-feature3)
**User Story:** [Story 3](USER_STORIES.md#user-story-3-mutation-feedback-loop-until-threshold-met-priority-p1)

## FR-4: Multi-stack auto-detection

Skill SHALL auto-detect the project stack(s) when invoked without explicit target. Detection signals: `package.json` with a test framework devDep → TS (vitest / jest); `pyproject.toml` or `setup.py` with pytest → Python; `pom.xml` with `<artifactId>junit-jupiter` → Java; `*.csproj` with `xunit` → C#; `Cargo.toml` with `[dev-dependencies]` → Rust; `go.mod` with `*_test.go` → Go. For each detected stack the skill SHALL emit a matrix listing: stack name, test framework, mutation tool, PBT framework, threshold default. When ≥2 stacks are detected, the skill SHALL use `AskUserQuestion` to ask which stack(s) to target. When no recognized stack is detected, skill SHALL emit a clear message listing the 6 supported stacks with their detection signals.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-polyglot-project-auto-detect-both-stacks-feature4)
**User Story:** [Story 4](USER_STORIES.md#user-story-4-multi-stack-auto-detection-priority-p2)

## FR-5: 12-point self-eval as final gate with PASS/FAIL report

Skill SHALL run the 12-point self-eval checklist as the final step in every mode (Greenfield, Audit, Mutation-feedback). The 12 items SHALL be the verbatim list defined in SKILL.md section 5 (covering: mutation gutcheck, assertion specificity, negative:positive ratio, error-path coverage, invariants list, input boundaries, failure messages, round-trip, parallel-impl absence, tautology absence, trivial-input absence, self-challenge). Skill SHALL emit a Markdown section `## 12-Point Self-Eval` with one row per item: `| # | Item | Status (PASS/FAIL/N_A) | Evidence | Remediation |`. Every FAIL row SHALL include an actionable remediation pointing at the exact line / assertion to change. The final summary line SHALL be `Kill-rate-readiness: HIGH | MEDIUM | LOW` computed as: HIGH if ≥10 PASS and 0 FAIL on items #1, #5, #12; MEDIUM if 7–9 PASS; LOW otherwise.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** All UCs (UC-1..UC-5) — final step
**User Story:** [Story 5](USER_STORIES.md#user-story-5-enforce-12-point-self-eval-as-final-gate-priority-p2)

## FR-6: PIT / Stryker.NET / cargo-mutants / go-mutesting deep integration — OUT OF SCOPE

> OUT OF SCOPE — dev-pomogator текущий codebase = TS + Python only. Java/C#/Go/Rust mutation tooling документирован в `references/tooling-setup.md` для пользователей таргетных стеков, но скрипт `run-mutation.ts` v0.1.0 dispatches только Stryker/mutmut. Расширение через follow-up spec.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) (marked OUT OF SCOPE)
**Use Case:** N/A
**User Story:** N/A — FR-6 не имеет downstream ссылок (никакой UC/AC/Story не ссылается на эту функциональность).

## FR-7: JiT (Just-in-Time) auto-trigger via PostToolUse hook

Skill SHALL register a PostToolUse hook in `extensions/test-quality/extension.json` matching `Write|Edit` events on production code files. v0.3.0 scope: TypeScript (`*.ts` / `*.tsx`) + Python (`*.py`) + C# / .NET (`*.cs`); test paths excluded (`*test*` / `__tests__` / `tests/` / capital `Tests/` folder / `*.test.ts` / `*_test.py` / `*.test.cs` / `*Steps.cs` Reqnroll / `*Tests.cs` xUnit / `*Test.cs` NUnit / `_test.cs`). The hook SHALL invoke `.dev-pomogator/tools/test-quality/posttool-jit.ts` which delegates to detector `.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts`. The detector SHALL identify three structural risk patterns in the file modified by the Write|Edit operation:

- **Collection-returning function**: function signature with return type `list[X]` / `dict[K, V]` / `Array<T>` / `T[]` / `Set<T>` / `pd.DataFrame` / `Iterator[X]` / similar collection types.
- **N×M nested loop**: pattern `for x in A: for y in B:` (Python) or nested `for (...)` (TypeScript) where A and B могут пересекаться (file paths, IDs, URLs — где duplicates приходят естественно).
- **Function composition chain**: function вызывает ≥2 других функций возвращающих коллекции последовательно (e.g., `discover_repos() → git_worktree_list() → assemble_rows()`).

If detector finds ≥1 hit, hook SHALL emit `additionalContext` containing: file path, suspicious function name(s) with line numbers, suggested invariants (cardinality / uniqueness / conservation / monotonicity / coverage per `.claude/rules/testing/output-invariants-first.md` taxonomy), and trigger phrase suggestion (`Skill("strong-tests")` on file path OR inline invariant test writing per §1.5 behavioural prior). Hook SHALL be **emit-only** — never block the Write|Edit operation.

Skill SHALL support a suppression mechanism per `scope-gate` escape-hatch pattern: comment `// strong-tests:skip <reason ≥8 chars>` (TS) or `# strong-tests:skip <reason>` (Python) на той же строке что function signature, ИЛИ standalone comment на строке непосредственно над signature. Detection SHALL skip suppressed functions AND emit a JSONL entry to `.claude/logs/strong-tests-skips.jsonl` per `.claude/rules/scope-gate/escape-hatch-audit.md` analogous pattern. Entry schema in [strong-tests_SCHEMA.md](strong-tests_SCHEMA.md). Reason < 8 chars → entry includes `warning: "REASON_TOO_SHORT"` AND `additionalContext` notes the short reason for audit attention.

Skill SHALL include §1.5 "Behavioural prior" в SKILL.md body that loads on **every** Skill activation (slash command, semantic match, JiT hook context insertion). Section content: reactive vs proactive workflow side-by-side, 3 anti-patterns A/B/C from session-pilot incident 2026-05-11 (cross-link: `dev-pomogator-session-pilot/.specs/session-pilot/POSTMORTEM-test-discipline.md`), 2 verbatim пинка таблицей, sample dialogue snippets cross-link to postmortem §9, главный системный вывод «знание правила ≠ применение правила». Section is **prior-activator**, not optional appendix.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-7](USE_CASES.md#uc-7-jit-auto-trigger-on-production-code-write-feature7)
**User Story:** [Story 6](USER_STORIES.md#user-story-6-jit-auto-trigger-via-posttooluse-hook-priority-p1)

## FR-11: Composition-chain detection (v0.5.0)

Detector `detect-invariant-candidates.ts` `scan()` function SHALL assign `kind: 'composition-chain'` для functions whose body содержит ≥2 chained method calls на collection types ИЛИ ≥2 sequential collection-typed assignments. Per-stack regex constants: `CHAIN_TS` (`.map().filter().reduce()` patterns), `CHAIN_CS` (LINQ `.Select().Where().GroupBy()`), `CHAIN_PY` (list comprehension stacking), `CHAIN_GO` (sequential `result := fn(); result2 := fn2(result)` flow). Existing taxonomy mapping в `suggestInvariants()` already returns `[cardinality, uniqueness, conservation, monotonicity]` для composition-chain kind. Detection priority: `nxm-overlap` (≥2 nested loops) takes precedence; composition-chain assigned ONLY when nestedFor < 2 AND chainCount ≥ 1.

## FR-12: Stryker.NET dispatch для C# stack (v0.5.0)

`run-mutation.ts` SHALL добавить `runStrykerNet()` function как parallel implementation `runStryker()` (TS) и `runMutmut()` (Python). Detection: existing `detectStack()` C# branch уже identifies `*.csproj` + xUnit/NUnit; expanded для recognize Stryker.NET availability via either (a) `<PackageReference Include="Stryker.NET"` в csproj, ИЛИ (b) presence of `stryker-config.json` в repo root. Dispatch: spawn `dotnet-stryker --config-file stryker-config.json` через `spawnSync`, parse `StrykerOutput/<latest-timestamp>/reports/mutation-report.json`. Pre-flight checks: `dotnet-stryker --help` для tool availability + `stryker-config.json` exists для repo setup. Install hint emit if missing: `dotnet tool install -g dotnet-stryker` + copy template из `references/stryker-net.config.template.json`. Parallel JSON template at `references/stryker-net.config.template.json` с `{{TODO}}` placeholders для production / test-projects / test-case-filter / additional-timeout / thresholds.

## FR-13: Test classification policy (v0.5.0)

Stryker dispatch (TS + Python + C#) SHALL по умолчанию apply test-case filter `Category=Unit` (или equivalent stack-specific pattern: pytest `-m unit`, xUnit `[Trait("Category","Unit")]`, vitest `describe.skipIf` on integration env var). Integration и E2E tests skipped unless caller passes explicit override flag `--include-integration` ИЛИ `--include-e2e` к `run-mutation.ts`. Rationale: real-world experience (lm-saas/AiPomogator field verification documented в FIELD_VERIFICATION.md) — integration tests с live infrastructure (DB / auth / HTTP) block Stryker initial test run, preventing mutation phase from starting. Solution architectural: classify tests via Trait/marker, default scope = unit only. AI agent SHALL offer test classification suggestion sub-mode (см. SKILL.md §framework-selection-ux) когда target repo не имеет existing categorization.

## FR-14: ast-grep migration для TypeScript detector (v0.5.0)

`detect-invariant-candidates.ts` SHALL прefer ast-grep AST-based detection через `@ast-grep/napi` library (npm dependency) для TypeScript stack. Implementation: cached `getTsFunctionsViaAstGrep(content)` returns `Map<line, name>` для ALL function-like nodes (function_declaration + arrow function const assignments). Cache invalidation на content hash. Function detection precedence: ast-grep parse result → fallback к regex `FUNCTION_TS` ONLY if NAPI load fails OR ast-grep returns empty results. Other stacks (Python / C# / Go) remain regex-based для v0.5.0 — full ast-grep migration roadmap v0.5.1+. Required: try/catch NAPI module load на startup (graceful degradation если binary compat fails на target host).

## FR-15: LLM-driven survivor analysis stub (v0.5.0)

`run-mutation.ts` SHALL provide `--analyze-survivors` CLI flag which enriches `MutationReport.gaps[]` с annotated survivors containing: original `Survivor` fields + `equivalentSuspect: 'NEEDS_HUMAN_REVIEW'` initial marker + `reconstructedContext` (±3 lines around mutation point read from disk). Function `annotateSurvivorsForLlmReview()` pure 1-to-1 mapping (cardinality preserved). Production invocation pattern documented в SKILL.md: AI orchestrator reads `gaps[]` output, spawns `Agent(subagent_type="general-purpose")` per batch of 50 survivors, asks LLM to flag equivalent vs real (per Meta ACH 0.95 precision Equivalence Detector pattern, engineering.fb.com 2025), merges verdicts back into `gaps[].equivalentSuspect: boolean`. Standalone Node script cannot directly invoke `Agent()` tool (skill-level only) — annotation provides structured context для AI orchestration.

## FR-16: Hypothesis Ghostwriter integration для Python Greenfield (v0.5.0)

`run-mutation.ts` SHALL provide `runGhostwriter(cwd, functionRef)` function for invoking `hypothesis write <module.function>` subprocess in Python Greenfield mode (§6.1). Returns `GhostwriterResult{success, scaffold?, error?, functionRef}`. Pre-flight check `hypothesis --version` для tool availability; if missing emit install hint `pip install hypothesis`. STDOUT parse: locate `from hypothesis import` line as scaffold start, slice до конца output. Integration point: AI orchestrator может invoke runGhostwriter per detected production function в Greenfield mode для emit PBT skeleton как `[GHOSTWRITER_SCAFFOLD]` block. Reduces blank-page paralysis per SKILL.md §6.4 line 390 reference.

## FR-17: Framework selection UX через AskUserQuestion (v0.5.0)

Skill SHALL NOT perform heavy auto-detection для polyglot repositories (multiple stacks detected). Вместо этого calling-side (AI agent ИЛИ user) SHALL invoke `AskUserQuestion` с enumerated framework list (6 options: vitest+Stryker / jest+Stryker / pytest+mutmut / xUnit+Stryker.NET / NUnit+Stryker.NET / go test+go-mutesting / cargo test+cargo-mutants). Pattern established в 9 другие dev-pomogator skills (discovery-forms, hyperv-test-runner, docker-optimize, install-diagnostics, run-tests, fewer-permission-prompts, dev-pomogator-uninstall, simplify, dedup-tests). `run-mutation.ts detectStack()` heuristic remains as fallback для unambiguous single-stack repos. Documentation в SKILL.md §3 "Framework selection UX" sub-section.

## Out of Scope для v0.5.0

- **Stryker Dashboard integration** (https://dashboard.stryker-mutator.io/) — defer v0.6.0+. Roadmap: после Stryker.NET produces report, push к dashboard для baseline tracking + weekly trend visualization. Workflow: env var `STRYKER_DASHBOARD_API_KEY` + project URL configuration в stryker config. Not implemented в v0.5.0 чтобы avoid scope creep.
- **Mutation-feedback autopilot loop** (full automation iter→iter) — described в SKILL.md §6.3 autopilot sub-section as v0.6.0 roadmap. v0.5.0 ships building blocks (Stryker.NET dispatch + survivor LLM context + composition-chain detection); orchestration via Skill subworkflow planned v0.6.0.
- **ast-grep migration for Python / Go / C# stacks** — defer v0.5.1. v0.5.0 only TypeScript branch uses ast-grep; other stacks remain regex.
- **LLM equivalent mutant fine-tuning** — Meta ACH 0.95 precision requires custom-trained model. v0.5.0 uses base Sonnet/Claude через Agent() pattern as "suggestion" not "assertion" — human review required per SKILL.md §8 hard-NO #6.
