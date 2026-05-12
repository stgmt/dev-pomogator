# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-greenfield-strong-test-generation-with-pbt)

WHEN AI invokes `/strong-tests` in Greenfield mode with a target TS source file containing at least one function with a structural invariant (roundtrip / idempotence / commutativity), THEN the skill SHALL emit at least one `fast-check` property-based test for that function, AND every assertion across the generated test file SHALL include a descriptive failure message, AND the negative-to-positive scenario ratio SHALL be ≥1:2.

WHEN AI invokes `/strong-tests` in Greenfield mode with a target Python source file containing a pure function returning a tuple, THEN the skill SHALL emit at least one `hypothesis` test with explicit input strategies covering min, max, empty, None, very-large, and unicode (where the type system permits) boundary cases.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-audit-existing-tests-against-8-anti-pattern-catalogue)

WHEN AI invokes `/strong-tests` in Audit mode against an existing `tests/foo.test.ts` containing `expect(result).toBeDefined()` AND `expect(arr.length > 0).toBe(true)`, THEN the skill SHALL flag both assertions as weak, AND propose exact-match replacements with rationale referencing specific 12-point self-eval items, AND emit a Compliance Report table mapping each finding to its violated checklist item.

WHEN AI invokes `/strong-tests` in Audit mode against a test file containing an async call without `await`, THEN the skill SHALL flag the missing await AND cross-reference `.claude/skills/tests-create-update/SKILL.md` rule 10 (the existing write-time anti-pattern documentation).

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-mutation-feedback-loop-until-threshold)

WHEN AI invokes `/strong-tests` in Mutation-feedback mode against a TS project with Stryker installed AND a target module currently at 60% mutation kill rate AND threshold 70%, THEN the skill SHALL run Stryker on the target, AND report each survived mutant with source file:line AND a proposed test to kill it, AND apply fixes iteratively until kill rate ≥70% OR max-iter (default 5) reached.

WHEN AI invokes `/strong-tests` in Mutation-feedback mode AND the max-iter ceiling is reached without meeting threshold, THEN the skill SHALL emit a `[GAP]` report listing remaining survivors with rationale (e.g., `[EQUIVALENT_SUSPECT: mathematically identical path]` or `[UNCOVERED: needs human review]`) AND SHALL NOT modify additional test files past the ceiling.

IF the project has no mutation tool installed at invocation time, THEN the skill SHALL detect the absence AND offer two paths via `AskUserQuestion`: (a) install command (`npm install --save-dev @stryker-mutator/core` or `pip install mutmut`), (b) AI-driven manual mutation fallback per the 8-category catalogue in `references/anti-patterns.md`.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-multi-stack-auto-detection)

WHEN AI invokes `/strong-tests` without arguments in a repo containing both `package.json` (with vitest devDep) AND `pyproject.toml` (with pytest dep), THEN the skill SHALL emit a detection matrix listing both stacks with their mutation tools (Stryker, mutmut) AND PBT frameworks (fast-check, Hypothesis), AND SHALL ask via `AskUserQuestion` which stack(s) to target.

IF the repo contains no recognized manifest (no package.json / pyproject.toml / pom.xml / *.csproj / Cargo.toml / go.mod), THEN the skill SHALL emit a clear "no recognized stack detected" message AND list the 6 supported stacks with their detection signals.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-12-point-self-eval-as-final-gate-with-passfail-report)

WHEN the skill completes any mode (Greenfield / Audit / Mutation-feedback), THEN it SHALL emit a `## 12-Point Self-Eval` Markdown section with all 12 items in tabular form (columns: #, Item, Status PASS/FAIL/N_A, Evidence, Remediation).

WHEN any of the 12 items receives a FAIL status, THEN the corresponding Remediation column SHALL contain an actionable hint pointing at the exact line / assertion / source file to change (e.g., `tests/foo.test.ts:42 — replace toBeDefined() with toEqual on expected object`).

WHEN the skill completes the 12-point eval, THEN the final summary line SHALL be `Kill-rate-readiness: HIGH | MEDIUM | LOW` with the rule: HIGH = ≥10 PASS AND 0 FAIL on items #1 (mutation gutcheck), #5 (invariants list), #12 (self-challenge); MEDIUM = 7–9 PASS; LOW otherwise.

## AC-6 (FR-6)

> OUT OF SCOPE — see FR-6

**Требование:** [FR-6](FR.md#fr-6-pit--strykernet--cargo-mutants--go-mutesting-deep-integration--out-of-scope)

N/A — FR-6 is documented as OUT OF SCOPE; no acceptance criteria defined. Java/C#/Go/Rust mutation tooling matrix lives in `references/tooling-setup.md` as documentation-only.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-jit-just-in-time-auto-trigger-via-posttooluse-hook)

WHEN AI invokes Write or Edit on a TypeScript production file `src/foo.ts` containing a function with signature `function foo(): T[]` (returns `Array<T>`), THEN the PostToolUse hook `posttool-jit.ts` SHALL invoke the detector `detect-invariant-candidates.ts`, AND the detector SHALL identify the function as a Collection-returning candidate, AND the hook SHALL emit `additionalContext` containing the file path, function name with line number, and ≥3 suggested invariants (cardinality / uniqueness / conservation per `.claude/rules/testing/output-invariants-first.md` taxonomy), AND the Write|Edit operation SHALL NOT be blocked (emit-only).

WHEN AI invokes Write or Edit on a Python production file `src/foo.py` containing a function `def foo() -> list[X]:` AND a comment `# strong-tests:skip leaf function — no invariants` on the line immediately above the signature OR on the same line, THEN the detector SHALL skip that function in the detection scan, AND the hook SHALL write a JSONL entry to `.claude/logs/strong-tests-skips.jsonl` containing fields: ts (ISO 8601), file (absolute path), function (name + line), reason (string from comment), session_id (UUID), cwd (abs path).

IF the suppression reason has fewer than 8 characters (e.g., `# strong-tests:skip ok`), THEN the detector SHALL still skip the function BUT the JSONL entry SHALL include `warning: "REASON_TOO_SHORT"`, AND the hook SHALL emit `additionalContext` noting the short reason for audit attention per the anti-gaming guidance in `.claude/rules/scope-gate/escape-hatch-audit.md`.

WHEN AI invokes Write or Edit on a TypeScript file containing a function with nested `for (...)` loop pattern where the outer collection and inner collection могут содержать пересекающиеся элементы (file paths / IDs / URLs), THEN the detector SHALL identify the function as N×M overlap candidate, AND the additionalContext SHALL include the explicit cardinality formula suggestion (e.g., `len(out) == |A∪B|` or `|A| + |B| - |A∩B|`).

WHEN AI loads the strong-tests skill via any trigger path (slash command `/strong-tests`, semantic match on description keywords, OR JiT hook context insertion), THEN the loaded SKILL.md body SHALL contain §1.5 "Behavioural prior" with: (a) reactive-vs-proactive workflow side-by-side, (b) 3 anti-patterns A/B/C inline from session-pilot incident, (c) 2 verbatim пинков таблицей с длиной + meaning, (d) sample dialogue snippets cross-link к postmortem §9, (e) closing principle «знание правила ≠ применение правила».

WHEN AI invokes Write or Edit on a C# production file `src/Services/IndexerService.cs` containing `public List<WorktreeEntry> BuildIndex()` with nested for-loop AND foreach-loop в body, THEN detector SHALL identify the function as Collection-returning candidate with kind `nxm-overlap`, AND `additionalContext` SHALL include suggested invariants taxonomy entries cardinality + uniqueness + conservation, AND the Write or Edit operation SHALL NOT be blocked (emit-only contract).

WHEN AI invokes Write or Edit on a C# test file matching one of `*Steps.cs` (Reqnroll) / `*Tests.cs` (xUnit) / `*Test.cs` (NUnit) / `_test.cs` / file under capital `Tests/` directory, THEN hook SHALL exit 0 without emitting additionalContext (test-file exclusion path).

IF a C# function has comment `// strong-tests:skip <reason ≥8 chars>` immediately above method signature OR on the same line as signature, THEN detector SHALL skip that function from detection AND append JSONL entry to `.claude/logs/strong-tests-skips.jsonl` with `warning` field null when reason length ≥8.
