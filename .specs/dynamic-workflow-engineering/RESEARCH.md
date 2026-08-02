# Research

## Контекст

Feature packages the user-provided `dynamic-workflow-engineering` skill inside the canonical dev-pomogator marketplace plugin, steers Claude toward that skill for multi-agent work, and enforces a Workflow-only delegation boundary. It also turns an adjacent-session incident into explicit quality gates: one inventory workflow ran for about an hour, repeated the same unbounded agent six times, reportedly made 695 spec-MCP calls, grew individual contexts to roughly 300k tokens, and held a completed branch behind an unnecessary barrier.

## Hypotheses (formulated before research)

| H# | Statement | Expected proof | Fallback |
|----|-----------|----------------|----------|
| H1 | `PreToolUse` can block the distinct `Agent` tool before execution | Official hooks reference + local hook dispatcher/test | `[UNVERIFIED]` if tool identity or deny contract differs |
| H2 | Workflow-native `agent()` is not the same permission subject as the `Agent` tool | Official workflow/subagent docs + runtime probe | `[UNVERIFIED]` until an installed-runtime probe proves the allow/deny matrix |
| H3 | A PreToolUse hook can distinguish direct Agent origin from Workflow origin | Hook input schema + real captured events | `[UNVERIFIED]` if no origin field exists |
| H4 | A marketplace plugin can distribute this skill and hook from plugin-owned paths | Plugin reference + current manifests + clean install | `[NEEDS_CONFIRMATION]` until clean install passes |
| H5 | Structured-output retries, per-agent call/time/context budgets, and circuit-breaking are configurable by a plugin | Workflow docs + runtime/tool API | `[UNVERIFIED]` for controls not exposed by Claude Code |
| H6 | The user-supplied hour-long incident reflects a reproducible failure mode | Original workflow script + journal + rerun fixture | `[USER_ASSERTION_ONLY]` until artifacts are reconciled |

## Источники

- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks), fetched 2026-08-01.
- [Claude Code workflows](https://code.claude.com/docs/en/workflows), fetched 2026-08-01.
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents), fetched 2026-08-01.
- [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference), fetched 2026-08-01.
- [Claude Code skills](https://code.claude.com/docs/en/skills), fetched 2026-08-01.
- [Claude Code settings](https://code.claude.com/docs/en/settings), fetched 2026-08-01.
- Repository evidence captured from current `main` for hook registry, prompt-suggest/Pinator packaging, manifests, skills, and BDD tests; exact file:line citations are finalized after the bounded analysis workflow returns.
- `WORKFLOW_DOGFOOD.md` — `[USER_ASSERTION_ONLY]` adjacent-session incident input.
- `dynamic-workflow-engineering_SKILL.md` — user-supplied product contract preserved byte-for-byte in substance.

## Технические находки

### Hook enforcement surface

`[VERIFIED: official hooks docs + current repository hook architecture]` `PreToolUse` is generically a blocking event: exit code 2 blocks a matched tool call, and hook output may deny before execution. Hooks from settings and enabled plugins also run inside subagents; tool events carry `agent_id` and `agent_type` when inside a subagent. `[NEEDS_CONFIRMATION]` This does not by itself prove that the installed host exposes the native `Agent` call to the expected matcher early enough to deny child creation; that exact path requires the real-host matrix.

`[VERIFIED: official hooks docs]` `SubagentStart` runs when a subagent is spawned through the `Agent` tool, but it cannot block creation. It is useful for telemetry/context injection, not as the primary deny gate.

`[SINGLE_SOURCE: official hooks docs]` The documented common PreToolUse input exposes session, prompt, transcript, cwd, permission mode, tool name/input, and subagent identity fields. The current research has not found a documented `workflow_id` or caller-origin field that proves an `Agent` call came from a Workflow. Therefore prompt text, labels, environment markers, or agent names must not be accepted as security evidence without a runtime PoC.

### Workflow and Agent are different primitives

`[VERIFIED: official workflows + subagents docs]` A workflow script uses native `agent()` calls under its own per-run limits. The subagent session limit documentation explicitly says agents a workflow script spawns with `agent()` do not count toward the regular Agent-tool session limit; workflows have their own per-run limit. This supports denying the separate `Agent` tool while allowing Workflow-native workers.

`[VERIFIED: official workflows docs]` Workflow-spawned agents inherit tool permission checks and sandboxing. This means a worker later invoking the separate `Agent` tool remains subject to an Agent deny; the base architecture should avoid requiring nested Agent and express fan-out in the workflow script.

### Distribution

`[VERIFIED: official plugin/skills docs + current manifest]` Plugin skills are automatically discovered and may be invoked based on description. Plugin hooks are loaded while the plugin is enabled. Component paths are plugin-root-relative; the default skills directory is scanned, and explicit `skills` paths add to it under the documented merge rules.

`[NEEDS_CONFIRMATION: clean marketplace install pending]` Source-tree presence is insufficient. The final proof must install the canonical plugin in a clean deps-absent environment and verify skill discovery, hook registration, runtime start, denial, Workflow allowance, and namespaced invocation.

### Runtime controls versus plugin-owned controls

`[VERIFIED: official workflows docs]` The runtime documents up to 16 concurrent agents and 1,000 agents total per run. `workflowSizeGuideline` is advice, not a cap. `Large workflow` is advisory and does not stop a run.

`[UNVERIFIED]` The official page does not document plugin-configurable hard per-agent tool-call, wall-clock, or context-token limits, nor a plugin hook that intercepts the internal workflow `agent()` call before spawn. Those protections may require one or more of: a static workflow-script admission validator, bounded templates, monitoring plus operator stop, or an upstream Claude Code capability request. The spec must not promise a hard runtime control until a PoC proves it.

`[UNVERIFIED]` The official docs reviewed here do not specify the automatic retry count after StructuredOutput failure. The six-attempt report is product evidence but not yet a portable platform contract.

### Dogfood implications

`[USER_ASSERTION_ONLY]` Exact incident metrics remain unverified until the original script and journal are attached. The failure pattern itself is actionable: unbounded discovery, identical retry, high-effort mechanical collection, an unnecessary barrier, expensive rediscovery by verifier, and absent monitoring.

The preferred corrective design is deterministic-first: enumerate a finite population with one API pass, use agents only for bounded classification, verify only selected claims, release independent partial results, and circuit-break repeated unchanged failures.

## Verification table

| H# | Status | Official docs | Repository/runtime | Independent incident/community |
|----|--------|---------------|--------------------|--------------------------------|
| H1 | `[VERIFIED]` | PreToolUse blocking contract | Existing hook-service architecture and deny tests | BDD scenario required for this feature |
| H2 | `[NEEDS_CONFIRMATION]` | Workflow `agent()` has separate limits | Installed runtime probe pending | Dogfood demonstrates Workflow agents in use |
| H3 | `[UNVERIFIED]` | No documented Workflow-origin field found | Capture probe pending | No independent source yet |
| H4 | `[NEEDS_CONFIRMATION]` | Plugin skills/hooks supported | Current manifest pattern found | Clean install pending |
| H5 | `[UNVERIFIED]` | Only global concurrency/total limits and advisory sizing documented | Admission/monitor design pending | Dogfood shows need, not platform support |
| H6 | `[USER_ASSERTION_ONLY]` | N/A | Original script/journal not yet attached | User report only |

## Где лежит реализация

- Proposed skill source: `.claude/skills/dynamic-workflow-engineering/SKILL.md`.
- Preserved input: `.specs/dynamic-workflow-engineering/dynamic-workflow-engineering_SKILL.md`.
- Proposed enforcement and admission logic: `tools/dynamic-workflow-engineering/` or the canonical shared hook-policy layer after architecture verification.
- Canonical hook registration: `tools/hook-service/registry.json`; `.claude-plugin/hooks.json` is the distributed hook declaration surface, not the only target registry.
- Plugin manifests: `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
- BDD feature: `tests/features/plugins/dynamic-workflow-engineering.feature` or the existing closest hook-policy feature family, selected after collision analysis.

## Выводы

A hard ban for the distinct native `Agent` tool is an architecture candidate, not a proven product guarantee. Official hook documentation establishes generic blocking semantics, while the actual native-Agent matcher, deny-before-spawn behavior, nested-call behavior, and installed clean-host matrix remain `NEEDS_CONFIRMATION` until real-host probes pass. No nested Agent bypass is needed for Workflow-native `agent()` workers, and no exception may trust prompt text or claimed Workflow provenance. The bundled skill provides steering; only a proven installed boundary may provide native-Agent denial. Workflow ceilings must be classified individually as hard admission, hard cancellation, monitored circuit, best-effort, or unavailable; monitoring after the event is not enforcement.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| skill-allowed-tools-audit | `.claude/rules/checklists/skill-allowed-tools-audit.md` | Modified skills must declare every workflow tool they use | new bundled skill | FR for distribution and skill audit |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Test the real hook/plugin path, not isolated helpers only | hook enforcement | BDD integration design |
| bdd-only-tests | `.claude/rules/bdd-only/bdd-only-tests.md` | New tests must be BDD scenarios and step definitions | all new tests | FILE_CHANGES and TASKS |
| dead-integration-guard | `.claude/rules/testing/dead-integration-guard.md` | Plugin runtime dependencies need a real consumer and deps-absent proof | distributed hook/bundle | install parity NFR |
| output-invariants-first | `.claude/rules/testing/output-invariants-first.md` | Collection results need cardinality/uniqueness/conservation assertions | inventory workflows | bounded collectors and verifier |
| no-unverified-blocker | `.claude/rules/no-unverified-blocker.md` | Stop/block claims require evidence | workflow monitoring | FACT/INFERENCE/UNKNOWN/ACTION output |
| one-feature-one-pr | `.claude/rules/pomogator/one-feature-one-pr.md` | Ship the coherent feature as one reviewable unit | implementation | task planning |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| Hook service | `tools/hook-service/` | Central dispatch and policy registry | Primary enforcement integration point |
| Prompt-suggest/Pinator | `tools/prompt-suggest/` plus package build wiring | Bundled executable/service pattern | Packaging reference only; not automatically the right runtime architecture |
| Plugin manifest | `.claude-plugin/plugin.json` | Canonical component paths | Skill/workflow distribution |
| Hook declarations | `.claude-plugin/hooks.json` and hook registry | Installed hook wiring | Must stay in parity |
| Existing hook BDD | `tests/features/` and step definitions | Real hook input/output harness | Reuse for deny/allow matrix |

### Architectural Constraints Summary

Steering and enforcement are separate. Skill auto-invocation is probabilistic and cannot be the security boundary. PreToolUse denial is enforceable only while the hook is loaded; managed policy can disable non-managed hooks, so organization-grade guarantees require the plugin to be force-enabled or a managed permission deny. Workflow-native `agent()` should remain the sole approved spawn primitive. Nested direct Agent calls stay denied. Any budget/circuit-break promises beyond documented workflow limits require a PoC and may be admission/monitoring guarantees rather than runtime preemption.

## Proof of Concept

**PoC Required:** yes

Required probes:

1. Capture real PreToolUse and SubagentStart inputs for direct Agent, Workflow `agent()`, and workflow worker nested Agent.
2. Prove the direct-Agent deny / Workflow allow matrix on the installed plugin.
3. Determine whether structured-output retries are observable and configurable, and record actual attempt behavior.
4. Prove a static admission validator can identify missing scope/bounds/stop conditions without false-blocking valid workflow scripts.
5. Run the plugin with repository dependencies absent.

**Verdict:** PARTIAL — official docs support the main boundary, but runtime-origin and hard-budget controls still require probes.

## Cost Estimate

**Runtime/CI:** Focused BDD hook and clean-install scenarios should remain minutes-scale; no full corpus crawl is permitted. Long Docker suites run only through the centralized background test skill.

**Maintenance:** Medium. The feature adds a bundled skill, one canonical policy/admission engine, hook registry wiring, audit schema, BDD steps, and compatibility tracking against Claude Code workflow/tool event changes. If hard budget controls require upstream support, maintenance includes version-gated capability detection.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The policy denies Workflow-native workers because Agent and workflow origin are conflated | Medium | High | Prove the real event matrix first; allow native `agent()` without a text marker and keep nested Agent denied |
| Skill auto-invocation is treated as enforcement | High | High | Separate steering skill from PreToolUse/managed permission enforcement in FR, AC, and BDD |
| Identical schema failures retry an unbounded prompt repeatedly | High | High | Add explicit retry ceiling, failure-signature circuit breaker, no-progress monitor, and a runtime-capability fallback status |
| Static validator false-positively rejects legitimate finite discovery | Medium | High | Validate concrete invariants, provide reason codes, fixture both finite dynamic sets and true unbounded crawls, and support audited override only where necessary |
| Completed partial results remain hidden behind an unnecessary barrier | Medium | High | Require barrier justification and persist per-branch outputs before cross-branch synthesis |
| Source-tree tests pass but installed plugin lacks the skill/hook or runtime dependency | Medium | High | Add clean marketplace install and deps-absent execution to BDD acceptance |
| User-provided incident metrics are inaccurate or not portable across versions | Medium | Medium | Preserve `[USER_ASSERTION_ONLY]`, attach original script/journal, and derive requirements from the failure class rather than exact numbers |
| Managed settings disable or bypass the plugin hook | Low | High | Document guarantee tiers; support managed force-enable/permission deny for organization enforcement and fail visibly when only steering is active |

## Second dogfood research addendum

### Evidence boundary

The source for this addendum is the user-supplied `E:\Note from ChatGPT.txt` postmortem. It is `[USER-SUPPLIED][UNVERIFIED_FOR_THIS_REPOSITORY]`. It supplies generalizable failure classes and design input only. It does not prove that any named adjacent project, commit, model, container, test, or metric belongs to dev-pomogator, and it does not provide an authoritative local producer artifact.

### Generalizable findings and required proof

| Class | Research implication | Required proof before implementation claim |
|---|---|---|
| Root/isolation identity | Prompt paths cannot select the checkout; existing-worktree continuation and explicit isolation are different admission modes | Normalized expectedRoot versus actual git top-level before first action, with base SHA and dirty-path evidence |
| Process-tree stop | Stopping an owner without descendants/writers leaves a live mutator | OS process-group/Job Object scan and terminal `ownerStopped`, `descendantsRemaining`, `writersRemaining` |
| Single-writer state | A dev-stack lease does not protect checkout or phase ownership | CAS run state, one mutating owner, separate checkout lock, separate runtime lease, and ownership census |
| External resources | Fixed names and stale labels can point at a foreign checkout | Run/worktree-derived identity, labels, ownership plus actual mount/source validation, non-destructive foreign handling |
| Captured execution | Warnings and redirect locks can hide the native failure | argv-array runner, separate UTF-8 evidence, native exit code, atomic JSON, full diagnostics |
| Transactional evidence | Partial writes can be mistaken for a completed rollout | Baseline hashes, staged/quarantined mutation, rollback/unproven state, typed result collections, all-layer completeness |
| Probe truth | Scratch or alternate API paths can produce false RED/GREEN | One canonical real API path, schema/invariant validation, harness/capability/product classification, independent readback |
| Run observability | Shared progress files mix runs and stale monitors | Per-run directory, runId/monotonic seq, owner inheritance, terminal marker, correlated status |
| Recovery/context | Old context and pulse spam create unsafe resumes and context overflow | 1–3 KiB recovery capsule, lazy references, `TERMINATED_NO_RESUME`, two-failure `HARNESS_REPAIR` cutoff |
| Verdict | Global green and useful findings do not prove active-run completeness | Required proof-layer correlation, missing-scope disclosure, productive/recovery/restart/stale-writer metrics where available |
| Fundamental binding | Any broken Agent→root→process→lease→run→proof link invalidates evidence | Atomic binding check before mutation and before completion |

### Research status

These findings strengthen FR-2 and FR-4 through FR-13 and are represented in the existing 13 FR/AC/scenario/task graph. They do not upgrade any host capability, implementation, test, or external producer claim. The authoritative second-incident replay remains `REPLAY_UNAVAILABLE` until the original evidence listed in `FIXTURES.md` is provided.
