# Workflow Dogfood: unbounded inventory run

## Provenance

User-provided incident report from an adjacent Claude Code session, supplied on 2026-08-01 for this feature specification. This artifact is product input, not an independently verified runtime trace. Any exact metrics below remain `[USER_ASSERTION_ONLY]` until reconciled with the original workflow script and journal.

## Observed incident

- Run began at 15:34:46 and was stopped after approximately 63 minutes.
- The GitHub branch completed after 62 Bash calls and about 37 minutes, classifying 23 open issues and finding comments only on issue #162.
- The spec branch never completed.
- The same broad spec agent was attempted six times, roughly ten minutes per attempt.
- None of those attempts reached StructuredOutput.
- The six attempts reportedly made 695 spec-MCP calls total.
- Individual attempts reportedly expanded their input context to approximately 297–312 thousand tokens.
- A `parallel()` barrier held the completed GitHub result behind the failed spec branch.
- Synthesis and completeness verification never started.

## Root-cause assessment from the incident owner

The task was an inventory, but the prompt turned it into an unbounded audit of the whole spec corpus. The agent was asked to find every materially related unfinished spec using many broad terms, with no finite slug set, call limit, query limit, retry limit, time budget, or early stop condition.

The six attempts were not six independent work packages. They repeated the same failed strategy after no valid structured return. A mechanical collection task also used high reasoning effort and repeated broad search instead of bounded API retrieval plus deterministic filtering.

## Required product lessons

1. Every workflow must declare a finite scope or an explicit, auditable discovery bound.
2. Every agent prompt must cap calls, rounds, output size, and retry count, and must state an immediate stop condition.
3. A structured-output failure must not silently recreate the same unbounded agent repeatedly.
4. Automatic retry must have a small configurable ceiling and must surface retry reason, attempt number, prior call count, elapsed time, and context growth.
5. A second retry with the same failure signature must trip a circuit breaker unless an operator explicitly resumes with a changed prompt or scope.
6. Mechanical inventory must use deterministic APIs and parsing first; LLM agents classify only the bounded remainder.
7. A barrier is allowed only when downstream correctness genuinely requires every branch. Completed independent results must remain inspectable/exportable if another branch fails.
8. Verification must validate the collected result, not repeat the full discovery crawl.
9. The run monitor must detect no-progress intervals, repeated tool/error signatures, excessive call counts, context growth, and stalled barrier dependencies.
10. Stop/resume must preserve completed outputs and must not automatically replay a completed branch solely because an earlier sibling failed.
11. The terms `Large workflow`, `slow`, `stalled`, and `runaway` must remain distinct: advisory size thresholds alone do not prove a stall, but repeated no-output attempts plus an unchanged failure signature do.
12. “All” means exhaustive over an explicitly defined finite population, not permission to expand the population recursively.

## Bounded replacement described by the incident owner

### GitHub collector

- One paginated retrieval of all open issues.
- One bounded pass over bodies and comments.
- Direct classification against the target subsystem.
- Stop after every open issue in that finite response set is classified.

### Spec collector

- Build a finite slug set from direct issue references, `spec-generator-v4`, and explicitly named related specs.
- For each slug: one status query, one unfinished-task query, and only the necessary TASKS section read.
- Default bound: at most five specs and twenty spec-MCP calls.
- If discovery exceeds the bound, return the discovered slugs and mark the remainder dropped; do not widen scope automatically.

### Cheap verifier

- Recheck that issues remain open.
- Recheck `comments.totalCount`.
- Recheck that listed tasks are not DONE.
- Never rerun the complete discovery.

## Second incident: useful but partially failed review

User supplied a second adjacent-session audit after inspecting the real `journal.jsonl`, agent metadata, and final run result. Exact values remain `[USER_ASSERTION_ONLY]` until original artifacts are attached:

- 4 logical agent calls, 11 physical attempts;
- 3 logical calls completed and 1 exhausted all retries;
- 2,415,361 subagent tokens, 626 tool uses, approximately 1 hour 47 minutes;
- `contracts/privacy`: one successful attempt;
- `provider/security`: six stalled attempts and no result;
- `workflow/integration`: three attempts and a result;
- synthesizer completed without the missing provider/security report.

The corrected verdict is not “proven runaway.” The workflow produced reproducible defects, including wrong source URL substitution, fabricated consensus without handoff revalidation, alias mixing, acceptance of a nonstandard port, non-executable lifecycle paths, and scope bypasses. It was nevertheless partially completed and extremely inefficient: one main scope remained uncovered, unchanged broad work was retried six times, and synthesis proceeded with a declared coverage gap.

This incident adds a required distinction:

- Useful findings do not make a run complete.
- High duration or token count does not make a run runaway.
- A partial run must preserve confirmed findings and also expose missing scopes.
- Logical calls and physical attempts must be reported separately.
- Synthesis must not silently imply full coverage when an input branch is absent.

## External workflow patterns supplied by the user

These references are research leads supplied on 2026-08-01. Repository statistics and quoted behavior remain `[USER_ASSERTION_ONLY]` until this spec’s research workflow independently fetches and pins URL/commit/file evidence.

### Salesforce DX VS Code

- Candidate: `forcedotcom/salesforcedx-vscode/.claude/workflows`, especially `review-diff.js`.
- Claimed pattern: discover applicable skills, run independent reviews, normalize findings, adversarially verify each finding, classify confirmed/downgraded/dropped, and fix only verified findings.
- Claimed verifier checks: cited file/line existence, premise validity, CI coverage, real external consumers, ADR violation, and severity.
- Intended use: borrow the verification pattern, not its Salesforce-specific monolithic implementation, GUS/Slack/CI dependencies, or one-file constraint.

### Himmel

- Candidate: `Himmel` `adversarial-verify.js`.
- Claimed pattern: two review dimensions through a pipeline, one refuter per finding, and “default to refuted=true if uncertain.”
- Intended use: minimal reference for verifier direction, not proof of production reliability, reproduction, or workflow tests.

### claude-workflows-pack

- Candidate: `liush2yuxjtu/claude-workflows-pack`, especially `plan-module-review.js`.
- Claimed useful ideas: schema validation, no silent caps, completeness critic, factual/false-positive/reproducibility lenses, and 2-of-3 voting.
- Limitation: reported zero stars/forks, no test directory, and private-service dependencies. Structural reference only; never install or trust as a verified package by default.

### Claude Code Ultimate Guide

- Candidate: Dynamic Workflows chapter in `Claude Code Ultimate Guide`.
- Intended use: secondary explanation of Agent/Skill/Workflow, parallel/pipeline, schemas, verification, resume, and token discipline. Runtime syntax and limits must come from current official docs.

### shinpr/claude-code-workflows

- Claimed useful ideas: orchestrator/implementer/verifier responsibility separation, objective repository-state checks, BLOCKED instead of guessing, explicit stops, structured artifacts between phases.
- Limitation: primarily Skill + Agent-tool orchestration, not the new Dynamic Workflow JavaScript DSL. Use only the responsibility pattern.

### Awesome list

- Candidate: `awesome-claude-code-workflows`.
- Intended use: discovery only. Every linked project must be checked for real Workflow DSL scripts, tests, activity, private dependencies, and non-generated evidence.

## Research synthesis requested by the user

The target skill should combine:

1. the official Workflow runtime contract;
2. Salesforce-style premise, CI, consumer, ADR, and severity verification;
3. Himmel’s default-to-refuted verifier direction;
4. diverse factual, false-positive, and reproducibility lenses;
5. explicit orchestrator/implementer/verifier responsibility boundaries;
6. repository-owned regression tests and journal inspection.

No finding about workflow quality may be based only on agent count, elapsed time, or tokens. The evaluator must first inspect logical calls, physical retries, completed outputs, failures, coverage gaps, and whether reported findings were independently reproduced.

## Third incident: this spec analysis workflow

The bounded repository-analysis workflow run `wf_4402365e-d2e` was inspected through its final output and complete `journal.jsonl` before judging it. This is direct session evidence, not a metric-only inference:

- 6 logical agent calls completed with 0 errors and 0 empty results;
- one `inspect:hooks` logical call required 4 physical attempts after 3 no-progress stall retries;
- total usage was 1,079,277 subagent tokens, 400 tool calls, and 2,374,446 ms;
- the three inspect reports, two adversarial verdicts, and synthesis all returned structured outputs;
- the result identified current missing enforcement, packaging shape, direct consumers, BDD gaps, and unresolved host-origin questions.

Correct verdict: the workflow completed and produced useful verified design input, but it was highly inefficient and its hook-inspection branch exposed the same unchanged-stall retry weakness targeted by FR-6. Completion does not erase the resource defect; resource cost does not erase the useful result. This run becomes an additional regression example for physical-attempt accounting and circuit breaking.

## Acceptance implications

The feature must include BDD scenarios for: repeated schema-failure retry circuit breaking; per-agent call/time/context budgets; bounded corpus discovery; no-progress detection; partial-result release across a failed independent branch; barrier justification; cheap verifier behavior; low-effort routing for mechanical collection; stop/resume preservation; logical-call versus physical-attempt accounting; synthesis with a missing input; preservation of useful confirmed findings from a partial run; journal-first quality classification; and truthful FACT/INFERENCE/UNKNOWN/ACTION monitoring output.
