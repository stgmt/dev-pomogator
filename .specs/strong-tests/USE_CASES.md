# Use Cases

## UC-1: Greenfield — write strong tests for new module @feature1

Developer (or AI agent) has just authored `src/billing/calculate-tax.ts` and asks Claude "write strong tests for this module".

- AI invokes `/strong-tests` with target file as $ARGUMENTS
- Skill detects stack (TS / vitest), reads target source, identifies invariants
- Skill emits: example-based tests with strong assertions + at least one fast-check property test for any function with a roundtrip/idempotence/commutativity invariant
- Skill runs the 12-point self-eval and reports PASS/FAIL per item with remediation
- Skill optionally runs Stryker on the new tests to verify ≥70% kill rate
- Result: tests pushed; mutation report shows kill rate; 12-point checklist saved alongside

## UC-2: Audit — review existing weak test suite @feature2

A team inherits a 4-year-old test suite with 87% coverage but production keeps regressing.

- Developer invokes `/strong-tests` in Audit mode against `tests/legacy/`
- Skill greps each test file for anti-patterns (8 from research catalogue: permissive matching, Assertion Roulette, Magic Number Test, etc.)
- Skill computes a strength score per file (0–100) based on weighted anti-pattern frequency
- Skill emits an audit report ranked by file weakness, with concrete BAD → GOOD replacements
- For files with high failure density, skill recommends adding PBT or running mutation tool
- Result: prioritized backlog of test refactor tasks with rationale

## UC-3: Mutation-feedback loop — strengthen until threshold @feature3

AI just wrote tests for `src/auth/totp.ts` and the user says "make these mutation-resistant, threshold 80%".

- AI invokes `/strong-tests` in Mutation-feedback mode with threshold flag
- Skill runs Stryker on the new tests, captures survived mutants
- For each survivor: skill proposes a focused test targeting the specific behavior the mutant violates
- Skill writes the new tests, re-runs Stryker
- Loop continues until threshold met OR max-iter (default 5) reached
- On max-iter: skill emits `[GAP]` report with rationale for each remaining survivor (e.g., "equivalent mutant — mathematically identical")
- Result: kill rate ≥80% (or explicit gap doc), test file checked in

## UC-4: Polyglot project — auto-detect both stacks @feature4

Repo has TypeScript frontend (`web/`) and Python ML backend (`ml/`). Developer wants to strengthen tests for both.

- Developer invokes `/strong-tests` without arguments
- Skill scans repo root + immediate subdirectories
- Skill detects: `web/package.json` → vitest + Stryker (npm devDep) + fast-check (npm devDep); `ml/pyproject.toml` → pytest + mutmut + Hypothesis
- Skill emits detection matrix and asks via AskUserQuestion which stack(s) to target
- For each selected stack, skill proceeds with the chosen mode (Greenfield / Audit / Mutation-feedback)
- Result: both stacks strengthened with consistent threshold

## UC-5: Tool missing — fallback to AI-driven manual mutation @feature3

Project has no mutation tool installed (e.g., research repo, old codebase).

- AI invokes `/strong-tests` in Mutation-feedback mode
- Skill detects no Stryker/mutmut/etc. in package.json/pyproject.toml
- Skill offers two paths: (a) auto-install proposal (`npx mutation-testing-installer` or `pip install mutmut`); (b) AI-driven manual mutation per the 8-category catalogue in `references/anti-patterns.md` — Edit one mutation at a time, run tests, revert via git checkout
- Developer chooses (b) for a quick check
- Skill runs 5 mutations from the catalogue, reports which were caught
- Result: lightweight mutation signal without tool install; explicit recommendation to install tool for systematic future runs

## UC-6: 12-point self-eval as final gate @feature5

Every mode (UC-1..UC-5) terminates with the 12-point self-eval as the final mandatory step, producing a PASS/FAIL/N_A report with remediation pointers and a `Kill-rate-readiness: HIGH | MEDIUM | LOW` summary line. The eval cannot be skipped; it is the audit trail proving every assertion was challenged with "could it pass for the WRONG reason?".

- Skill reaches its final step in any mode
- Skill emits `## 12-Point Self-Eval` Markdown section with one row per item
- For every FAIL row: actionable Remediation pointer (e.g., `tests/foo.test.ts:42 — replace toBeDefined() with toEqual on expected object`)
- Skill computes `Kill-rate-readiness` summary per FR-5 rule
- Result: complete audit trail of test-strength reasoning attached to the artifact

## UC-7: JiT auto-trigger on production code Write @feature7

Developer (or AI agent) is in the middle of implementing a refactor or new feature. AI writes a new TypeScript function in `src/indexer.ts` that returns `WorktreeEntry[]` collected from a `for repo in repos: for wt in worktrees: ...` loop pattern. Without invoking any slash command, AI proceeds к next file edit.

- AI invokes `Edit` on `src/indexer.ts` adding the new function
- PostToolUse hook `posttool-jit.ts` fires per `extension.json` matcher `Write|Edit`
- Hook excludes test paths (`*test*` / `__tests__` / `tests/`); `src/indexer.ts` matches production
- Hook invokes detector `detect-invariant-candidates.ts` on the modified file path
- Detector identifies: function returns Collection (`WorktreeEntry[]`) + N×M nested loop (repos × worktrees, overlapping paths) + composition chain (`discover_repos → git_worktree_list → assemble`)
- Hook emits `additionalContext` to AI: file path + function name + line numbers + 3 suggested invariants (cardinality `len(out) == |unique(worktree_path)|`, uniqueness on `worktree_path`, conservation `sum(per-repo counts) == len(out)`)
- AI reads context, recognizes the session-pilot duplicate-rows class of bug (see `.claude/rules/testing/output-invariants-first.md` §"Class of bug: leaves correct, composition broken"), writes 3 invariant tests inline **before** reporting "ready"
- Result: composition bug caught at WRITE time, not after пинок from user

## UC-8: Suppression with audit log for legitimate skip @feature7

AI writes a pure-leaf function `function tally(items: Item[]): number { return items.length; }` that returns a scalar (not collection) but per F1 detector heuristic still triggers because signature contains `Item[]` parameter. Pure-leaf: no invariants to assert beyond what type system already enforces.

- AI invokes `Edit` adding the function
- PostToolUse hook fires, detector triggers
- AI recognizes this is a legitimate suppression case
- AI adds comment `// strong-tests:skip pure-leaf reducer — type system enforces` immediately above the signature
- AI re-invokes `Edit` to add the suppression comment
- Hook fires again, detector skips the suppressed function, writes JSONL entry to `.claude/logs/strong-tests-skips.jsonl` with reason "pure-leaf reducer — type system enforces" (36 chars > 8)
- Result: legitimate exception logged for audit; reviewer can periodically scan `.jsonl` per `.claude/rules/scope-gate/escape-hatch-audit.md` analog workflow

## UC-9: Behavioural prior activation on every Skill load @feature7

User invokes `/strong-tests src/foo.ts` for Greenfield mode (existing UC-1 path). Independent of mode, AI loading skill body SHALL receive §1.5 behavioural prior as part of context.

- Skill loads SKILL.md into AI context
- §1.5 "Behavioural prior" section is loaded **before** §2 Pre-write checklist
- AI parses: reactive-vs-proactive workflow comparison, 3 anti-patterns A/B/C, 2 пинка, closing principle
- AI's subsequent decisions (e.g., whether to test in browser before reporting "ready") inherit prior — not as constraint enforced by validator but as behavioural baseline
- Result: skill load is also prior-activator, addressing the session-pilot incident root cause «документ в файле ≠ behavioural prior»
