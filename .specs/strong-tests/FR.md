# Functional Requirements (FR)

## FR-1: Greenfield strong-test generation with PBT

Skill SHALL produce strong tests for newly authored production code when invoked in Greenfield mode against a target file path. For every function with a structural invariant (roundtrip, idempotence, commutativity, associativity, identity), the skill SHALL emit at least one property-based test using the stack-appropriate framework (fast-check for TS, Hypothesis for Python). For every function without obvious structural invariants, the skill SHALL emit example-based tests covering at minimum: happy path, negative path, boundary conditions (min, max, empty, null/None, very-large, unicode where applicable). Every assertion SHALL include a descriptive failure message. The negative-to-positive scenario ratio SHALL be ≥1:2.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-greenfield-write-strong-tests-for-new-module)
**User Story:** [Story 1](USER_STORIES.md#user-story-1-greenfield-strong-tests-for-new-code-priority-p1)

## FR-2: Audit existing tests against 8-anti-pattern catalogue

Skill SHALL provide an Audit mode that, given a path to an existing test file or directory, scans for the 8 anti-patterns documented in `references/anti-patterns.md`: (1) Permissive Matching (toBeDefined / NotNull only), (2) Assertion Roulette (multiple unlabelled asserts), (3) Magic Number Test, (4) Happy-Path-Only, (5) Tautological Assertion (recompute expected with same logic), (6) Trivial Input (e.g., `console.log("OK")`), (7) Silent Skip / catch-and-swallow, (8) Missing Await on async. For each finding skill SHALL emit a finding row with: file:line, anti-pattern code, BAD snippet, GOOD replacement, rationale, and a mapping to the 12-point self-eval item the finding violates. Skill SHALL compute a per-file strength score (0–100) based on weighted anti-pattern frequency.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-audit-review-existing-weak-test-suite)
**User Story:** [Story 2](USER_STORIES.md#user-story-2-audit-existing-tests-for-hidden-weakness-priority-p1)

## FR-3: Mutation-feedback loop until threshold

Skill SHALL provide a Mutation-feedback mode that auto-detects the project's mutation tool from manifests (package.json for Stryker, pyproject.toml for mutmut, pom.xml for PIT, csproj for Stryker.NET, Cargo.toml for cargo-mutants, go.mod for go-mutesting). For TS+Python (primary stacks) the skill SHALL invoke the detected tool via `scripts/run-mutation.ts`. The skill SHALL parse survived mutants, propose a targeted test per survivor (with file:line of the mutation point), apply the proposed fix, and re-invoke the mutation tool. The loop SHALL terminate when: (a) kill rate ≥ user-specified threshold (default 70% per OutSight + Levnikolaevich consensus), OR (b) max-iter (default 5) reached. On max-iter exit skill SHALL emit a `[GAP]` report listing remaining survivors with rationale. If no mutation tool is detected, skill SHALL offer (a) install command, (b) AI-driven manual mutation fallback per the honnibal-style 8-category catalogue in `references/anti-patterns.md`.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-mutation-feedback-loop-strengthen-until-threshold), [UC-5](USE_CASES.md#uc-5-tool-missing-fallback-to-ai-driven-manual-mutation)
**User Story:** [Story 3](USER_STORIES.md#user-story-3-mutation-feedback-loop-until-threshold-met-priority-p1)

## FR-4: Multi-stack auto-detection

Skill SHALL auto-detect the project stack(s) when invoked without explicit target. Detection signals: `package.json` with a test framework devDep → TS (vitest / jest); `pyproject.toml` or `setup.py` with pytest → Python; `pom.xml` with `<artifactId>junit-jupiter` → Java; `*.csproj` with `xunit` → C#; `Cargo.toml` with `[dev-dependencies]` → Rust; `go.mod` with `*_test.go` → Go. For each detected stack the skill SHALL emit a matrix listing: stack name, test framework, mutation tool, PBT framework, threshold default. When ≥2 stacks are detected, the skill SHALL use `AskUserQuestion` to ask which stack(s) to target. When no recognized stack is detected, skill SHALL emit a clear message listing the 6 supported stacks with their detection signals.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-polyglot-project-auto-detect-both-stacks)
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
**Use Case:** [UC-7](USE_CASES.md#uc-7-jit-auto-trigger-on-production-code-write)
**User Story:** [Story 6](USER_STORIES.md#user-story-6-jit-auto-trigger-via-posttooluse-hook-priority-p1)
