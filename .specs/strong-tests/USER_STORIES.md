# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Skill `discovery-forms` auto-populates this file during Phase 1. Hook `user-story-form-guard` enforces the form at Write/Edit time.

### User Story 1: Greenfield strong tests for new code (Priority: P1) @feature1

As an AI agent (Claude) writing tests for newly authored production code, I want a 12-point self-eval checklist plus property-based testing patterns, so that the tests I produce kill mutations on the first pass instead of passing for the wrong reason.

**Why:** Schäfer et al. (arXiv 2406.18181) report 34.44–61.78% of LLM-generated tests are syntactically invalid and 74.99% of undetected defects come from missing inputs — the dominant failure mode is happy-path-only assertions, which strong-tests' 12-point self-eval and PBT patterns directly attack.

**Independent Test:** Run skill in Greenfield mode against a target source file, generate tests, then run the matching framework's mutation tool (Stryker / mutmut / PIT / etc.) — kill rate must be ≥70% on first pass for critical paths.

**Acceptance Scenarios:**

Given a TypeScript module `src/foo.ts` with branching logic and no existing tests
When I invoke `/strong-tests` in Greenfield mode
Then the skill emits at least one PBT (fast-check) test for any function with structural invariants (roundtrip / idempotence / commutativity)
And every assertion has a descriptive failure message
And the negative-to-positive scenario ratio is ≥1:2

Given a Python module with a pure function returning a tuple
When I invoke `/strong-tests` in Greenfield mode
Then the skill emits a Hypothesis test with explicit input strategies for boundary cases (min, max, empty, None, very-large, unicode)
And the 12-point self-eval is run as the final step and reported

---

### User Story 2: Audit existing tests for hidden weakness (Priority: P1) @feature2

As a developer reviewing a test suite that "looks fine" (high coverage, all green), I want a rapid audit that flags weak assertions and computes mutation-score-equivalent signals, so that I catch fake-positive tests before they ship.

**Why:** OutSight AI's case study showed a critical reconciliation workflow with 92% line coverage and 140 unit tests that started silently duplicating line items two days after deployment because the AI used reference equality on objects, not business key equality — coverage was a vanity metric (URL: medium.com/@outsightai). Ghiringhelli's experiment showed line-cov 93.1% with mutation MSI 58.62% (34.4 pp gap).

**Independent Test:** Point skill at an existing test file with known-weak assertions (e.g., `expect(result).toBeDefined()`); skill must produce an audit report listing each weak assertion + a strengthened replacement, plus recommended PBT additions where applicable.

**Acceptance Scenarios:**

Given an existing `tests/foo.test.ts` containing `expect(result).toBeDefined()` and `expect(arr.length > 0).toBe(true)`
When I invoke `/strong-tests` in Audit mode
Then the skill flags both assertions as weak
And proposes exact-match replacements with rationale referencing the 12-point self-eval items
And reports a Compliance Report table mapping each finding to a checklist item

Given a test file with no `await` on an async call
When I invoke `/strong-tests` in Audit mode
Then the skill flags the missing await
And cross-references `.claude/skills/tests-create-update/SKILL.md` rule 10 (the existing anti-pattern doc)

---

### User Story 3: Mutation-feedback loop until threshold met (Priority: P1) @feature3

As an AI agent that just wrote tests for a critical compliance / billing / auth path, I want an automated mutation-test loop that surfaces survived mutants and asks me to add tests until kill rate ≥70%, so that I have evidence the tests would catch real bugs.

**Why:** Meta's ACH (engineering.fb.com 2025-09-30) ran exactly this LLM ↔ mutation-tool feedback loop and achieved 73% test acceptance with 0.95 precision after equivalence-detector preprocessing — empirical evidence the loop produces tests humans accept. OutSight reported mutation score climbing 70% → 78% on second feedback pass.

**Independent Test:** Run skill in Mutation-feedback mode against a freshly-tested module; skill must invoke the appropriate mutation tool (auto-detected from project config), parse survivors, propose targeted tests, re-run, and stop only when kill rate threshold is met OR after a configurable max-iteration count is reached (with explicit gap report).

**Acceptance Scenarios:**

Given a TypeScript project with Stryker installed and a module with 60% mutation kill rate
When I invoke `/strong-tests` in Mutation-feedback mode with threshold 70%
Then the skill runs Stryker
And reports each survived mutant with the source line and proposed test to kill it
And applies fixes iteratively until kill rate ≥70% OR max iterations reached
And on max-iter exit emits an explicit `[GAP]` report listing remaining survivors with rationale

Given a Python project without mutmut installed
When I invoke `/strong-tests` in Mutation-feedback mode
Then the skill detects the missing tool
And offers an install command (`pip install mutmut`) plus a manual fallback (the honnibal-style Edit + git checkout AI-driven mutation per the catalogue in `references/anti-patterns.md`)

---

### User Story 4: Multi-stack auto-detection (Priority: P2) @feature4

As a developer with a polyglot project (TS frontend + Python backend), I want the skill to auto-detect each stack's mutation tool and PBT framework from manifests (package.json / pyproject.toml / pom.xml / etc.), so that I don't have to configure anything per-language.

**Why:** dev-pomogator already ships `run-tests` skill with framework auto-detection (vitest / pytest / dotnet / cargo / go) — strong-tests must follow the same UX expectation. Forcing manual config breaks adoption and contradicts repo convention `.claude/skills/run-tests/SKILL.md`.

**Independent Test:** Drop the skill into a multi-stack repo, invoke without arguments, verify it identifies each stack and reports the detected tool per stack in a single matrix.

**Acceptance Scenarios:**

Given a repo with both `package.json` (vitest) and `pyproject.toml` (pytest)
When I invoke `/strong-tests` without arguments
Then the skill emits a detection matrix listing both stacks with their respective mutation tool (Stryker, mutmut) and PBT framework (fast-check, Hypothesis)
And asks via AskUserQuestion which stack(s) to target

Given a repo with no recognized manifest
When I invoke `/strong-tests`
Then the skill emits a clear "no recognized stack detected" message
And lists the 6 supported stacks with their detection signals

---

### User Story 5: Enforce 12-point self-eval as final gate (Priority: P2) @feature5

As an AI agent finishing a test write, I want the 12-point self-eval to run as a final mandatory step and produce a checklist report, so that the user has an audit trail proving each assertion was challenged with "could it pass for the WRONG reason?"

**Why:** dev-pomogator's tsx-runner CORE007_04 incident — a test passed for months with a trivial input (`console.log("OK")`) while real hooks were broken (commit `97a7c86`) — is the canonical "passes for the wrong reason" failure mode. The 12-point self-eval item #12 (self-challenge per assertion) directly addresses this.

**Independent Test:** Run skill in any mode against a sample test file, verify the output includes a 12-point checklist with PASS / FAIL / N_A status per item and concrete remediation hints for FAILs.

**Acceptance Scenarios:**

Given strong-tests has just written or audited a test file
When the skill reaches the final step
Then it emits a `## 12-Point Self-Eval` Markdown section with all 12 items checked
And every FAIL has an actionable remediation pointing at the exact line / assertion to change
And the report includes a final summary line `Kill-rate-readiness: HIGH / MEDIUM / LOW` based on PASS/FAIL pattern

---

### User Story 6: JiT auto-trigger via PostToolUse hook (Priority: P1) @feature7

As an AI agent writing or editing production code that returns collections or contains nested loops, I want strong-tests skill to **auto-trigger** через PostToolUse hook (без explicit `/strong-tests` invocation) и подсказать релевантные инварианты до того как код будет признан готовым, so that composition bugs caught at **write time**, not after пинок from user.

**Why:** Real-session evidence — session-pilot agent self-postmortem (`dev-pomogator-session-pilot/.specs/session-pilot/POSTMORTEM-test-discipline.md`): same agent wrote `.claude/rules/testing/output-invariants-first.md` and 2 hours later violated it 2 rounds in a row, each requiring user пинок («тестов нет нихуя не работает» / «почему тестов опять нет»). Doc-on-disk does not become behavioural prior automatically. Industry-wise: Meta JiT 2026-02 (engineering.fb.com 2026-02 + arXiv 2601.22832) demonstrated 4× bug detection at code-review-time vs traditional hardening tests; Anthropic Red Team PBT 2026 principle «if a developer does not think to test an edge case, it is also likely the developer did not consider that case in the implementation». Auto-trigger через hook delivers this forcing function.

**Independent Test:** Write a TS function `function buildIndex(): WorktreeEntry[]` containing nested-loop composition pattern in a fresh test repo. Invoke Write tool — PostToolUse hook fires, detector identifies risk, `additionalContext` propagated to AI. Verify hook is emit-only (Write|Edit not blocked); verify suppression comment skips detection AND writes JSONL entry to `.claude/logs/strong-tests-skips.jsonl`; verify §1.5 behavioural prior loads on every skill activation path (slash + semantic + hook context).

**Acceptance Scenarios:**

Given AI invokes Edit on a TypeScript production file `src/foo.ts` adding a function with signature `function foo(): T[]`
When PostToolUse hook fires per `extension.json` matcher `Write|Edit`
Then the hook invokes detector `detect-invariant-candidates.ts` on the modified file
And the detector identifies the function as Collection-returning candidate
And the hook emits additionalContext с file path + function name + line number + ≥3 suggested invariants
And the Write|Edit operation is not blocked (emit-only)

Given a Python production file `src/foo.py` with `def foo() -> list[X]:` AND comment `# strong-tests:skip leaf function — no invariants` above the signature
When PostToolUse hook fires on Write|Edit of that file
Then the detector skips the function in detection
And the hook writes JSONL entry to `.claude/logs/strong-tests-skips.jsonl` с ts, file, function, reason, session_id, cwd
And reason length ≥8 chars passes без warning; <8 chars emits warning: "REASON_TOO_SHORT"

Given AI loads strong-tests skill via slash command OR via auto-trigger from PostToolUse hook context
When the skill body loads into AI context
Then §1.5 "Behavioural prior" section is present **before** §2 Pre-write checklist
And the section contains reactive-vs-proactive workflow side-by-side
And 3 anti-patterns A/B/C inline from session-pilot incident
And 2 verbatim пинка таблицей с meaning
And «знание правила ≠ применение правила» closing principle
