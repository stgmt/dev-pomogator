# Spec Review: dynamic-workflow-engineering

**Phase:** Complete (all four authoring stops confirmed)
**Generated:** 2026-08-01
**Scope:** full-ban feasibility, proof boundaries, migration completeness, workflow limits, partial results, journal-first judgments, marketplace parity, BDD coverage, and requirement/design/task consistency

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (authoring blockers) | 4 | fix the specification before implementation |
| P1 (fix before implementation) | 2 | important consistency corrections |
| P2 (recommendations) | 2 | evidence hardening |
| P3 (informational) | 0 | none |

**Overall verdict:** STOP_BLOCKED

The specification has a strong product direction, but its central enforcement model currently mixes two different things: the forbidden native `Agent` tool and Workflow-native `agent()` workers. That makes part of the proposed authorization path both unnecessary for the requested ban and unsupported by the evidence collected so far.

## P0 Findings — authoring blockers

### P0-1: The gate authorizes the wrong thing

**Where:** `FR.md` sections “Workflow-only delegation gate” and “Origin-safe Workflow child policy”; `DESIGN.md` Policy contract and Guarantee model; `dynamic-workflow-engineering_SCHEMA.md` Trusted Invocation Context; scenarios `DWE001_01` and `DWE001_02`.

**Problem in plain language:** the requested rule is simple: every call to the native `Agent` tool is forbidden, and workers must be created by Dynamic Workflow's own `agent()` primitive. The current text instead invents a trusted-Workflow exception for an `Agent` call. The schema even carries `tool_name: "Agent"`. That exception is not needed and depends on a Workflow-origin field that the research did not find.

**Required correction:**

1. Deny the native `Agent` tool unconditionally at its real pre-spawn boundary.
2. Treat Workflow invocation/admission as a separate subject. Validate the Workflow script or registered Workflow contract before the run starts where the host exposes such a boundary.
3. Keep a nested native `Agent` call from inside a Workflow worker denied; it is not a legitimate Workflow child.
4. Remove native-Agent allowance based on Workflow provenance from the contract and schema.
5. Make the real-host proof demonstrate the simple matrix: direct `Agent` denied, Workflow-native `agent()` allowed, nested native `Agent` denied.

### P0-2: Several hard limits are promised before an enforcement surface is known

**Where:** `FR.md` sections “Bounded workflow admission”, “Deterministic-first resource budgets”, and “Structured-output retry circuit breaker”; matching acceptance criteria and scenarios; task “Real-host enforceability PoC”.

**Problem in plain language:** the research explicitly says the plugin has not proved that it can intercept an internal Workflow worker before spawn, control automatic structured-output retries, stop a worker after a tool-call ceiling, or preempt context growth. The requirements nevertheless say these limits SHALL be enforced. Only wall-clock and token limits are currently marked best-effort. Tool-call, physical-attempt, context, and internal-child limits have the same unresolved capability problem.

The first proof task currently checks direct-Agent denial and Workflow allowance, but its Done-When list does not require proof of retry control, journal fields, static admission coverage, tool-call cancellation, context limits, or partial-output access. Implementation could therefore pass the proof task while the next requirements remain impossible to enforce.

**Required correction:**

- Extend the first proof task to test every hard control surface before policy implementation starts.
- Classify each promised limit as one of: hard pre-run admission, hard runtime cancellation, monitored warning/circuit-break after an event, best-effort, or unavailable.
- Reject a Workflow before launch only for properties that can be validated soundly from its real script/contract.
- Do not call monitoring after the fact “enforcement”.
- Define the fallback behavior when the host does not expose a control: lower the relevant capability claim instead of silently keeping a SHALL guarantee.

### P0-3: The direct-Agent migration census is incomplete

**Where:** `TASKS.md` task “Migrate every current direct Agent consumer” and `FILE_CHANGES.md`.

**Repository evidence:** `.claude/skills/architecture-decision-builder/SKILL.md:85` explicitly requires a fresh `Agent` tool call, but this skill is absent from both the migration checklist and planned file changes. The current tree also carries `Agent` in allowed-tools or direct-call instructions across `spec-status`, `tests-create-update`, `spec-review`, `strong-tests`, `skills-rules-optimizer`, `bdd-migrator`, `create-spec`, `docker-optimize`, `cross-spec-reconcile`, `spec-generator-dev`, onboarding Phase 0, and phase-agent orchestration. Some may be permission-only rather than load-bearing calls, but the spec does not contain a deterministic census that distinguishes them.

**Why this blocks authoring:** enabling the ban with this list would break at least one known current workflow that has no migration task or file owner. “Migrate every consumer” is a good invariant, but the concrete Done-When list is not exhaustive enough to prove it.

**Required correction:**

1. Generate a deterministic inventory of direct-call instructions, invocation envelopes, agent-only orchestrators, custom phase agents, and `allowed-tools: Agent` declarations.
2. Classify every hit as load-bearing, test prose, fixture, or stale permission.
3. Add every load-bearing owner to the migration task and `FILE_CHANGES.md`; remove stale Agent permissions from modified skills.
4. Make the final negative check compare against this inventory, not against a hand-written list.

### P0-4: Central host claims are marked more strongly than their evidence permits

**Where:** `RESEARCH.md` verification table and conclusion.

**Problem in plain language:** the research calls the distinct-Agent PreToolUse ban “VERIFIED” and concludes that a hard ban is feasible, while the same document says real matcher behavior, Workflow origin, and the installed-runtime allow/deny matrix still need confirmation. The source list names official pages, but the report does not retain direct quotes, versions, or exact anchors, and it does not provide the three independent evidence angles required by the research discipline for a `VERIFIED` label.

**Required correction:**

- Downgrade the central host-runtime claims to `NEEDS_CONFIRMATION` until the real-host proof passes.
- Keep generic hook response-shape facts separate from proof that the actual native `Agent` call is denied before child creation.
- Add fetched quote/anchor/version evidence for official claims and do not promote one official page plus local design code to three-angle verification.
- Rewrite the conclusion conditionally: the ban is an architecture candidate; the published tier depends on the host proof.

## P1 Findings — important consistency fixes

### P1-1: The supplied skill contains unsupported numeric runtime claims

**Where:** `dynamic-workflow-engineering_SKILL.md`, Monitoring section.

The preserved input states exact `Large workflow` thresholds of more than 25 agents or more than 1.5 million projected tokens and attaches them to a specific Claude Code version. Those numbers are not proved in the spec research. The implementation task for the bundled skill checks discovery and allowed-tools, but does not require verification or removal of stale runtime facts.

**Fix:** add a Done-When item for the bundled skill: every runtime number and semantic claim must be sourced from current official documentation or real-host evidence; otherwise remove it or mark it unknown. The shipped skill must not inherit unsupported facts merely because the source artifact contained them.

### P1-2: The generated task summary uses different IDs from the real task blocks

**Where:** `TASKS.md` Task Summary Table.

The table shows IDs such as `T-1-01` and `T1-04`, while the actual task blocks and dependency references use `DWE-T01` through `DWE-T09`. The graph correctly parses the body IDs, but a human reader cannot reliably follow the table's dependency chain.

**Fix:** correct the task-table renderer or regenerate the table from the explicit task IDs. Do not leave a generated block that changes task identity.

## P2 Recommendations

| # | Area | Recommendation |
|---|------|----------------|
| 1 | External workflow examples | Pin mutable default-branch URLs to immutable commit SHAs and locate executable workflow tests before upgrading any source above `SINGLE_SOURCE`. |
| 2 | Dogfood fixtures | Attach or hash the original journals and derive sanitized fixtures from the real field shapes before using them as positive parser evidence. Exact user-supplied metrics should remain product input until then. |

## What is already coherent

- The feature stays inside one existing marketplace plugin; no nested plugin is proposed.
- Steering is not presented as a security boundary.
- The specification rejects prompt text, labels, frontmatter, subtype, session ID, and caller-supplied environment markers as authorization evidence.
- Deterministic-first collection, bounded discovery, retry accounting, partial-result preservation, adversarial verification, and journal-first stop/resume are consistently represented across stories, requirements, acceptance criteria, design, tasks, and source scenarios.
- Marketplace clean-home installation and dependency-absent execution are explicit acceptance work.
- The source graph is structurally consistent: 13 requirements, 13 acceptance criteria, 13 tagged source scenarios, 9 parsed tasks, and 0 conformance findings.

## Future implementation evidence — not authoring defects

These items remain open by design and must not be reported as mistakes in the specification itself:

- No policy, monitor, bundled skill, migration, or generated hook wiring has been implemented yet.
- All 13 scenarios are source-only and have no executable twins yet.
- No canonical BDD run exists; lifecycle is correctly `TESTS_NOT_RUN` and readiness is correctly `NOT_READY`.
- Direct-Agent denial, Workflow-native allowance, retry control, clean installation, dependency-absent execution, and the final guarantee tier still require real execution evidence.

After the four P0 authoring corrections, implementation should begin with the expanded real-host proof. A failed proof is an acceptable product result only if the specification publishes the lower, precisely scoped guarantee instead of calling it a complete ban.
