# Dynamic Workflow Engineering Schema

## Consumer Contract

```json
{
  "consumer_id": "spec-review",
  "skill_path": ".claude/skills/spec-review/SKILL.md",
  "operation": "workflow",
  "subagent_types": ["Explore"],
  "max_calls": 3,
  "max_concurrency": 3,
  "max_attempts": 2,
  "max_tool_calls": 40,
  "max_input_bytes": 65536,
  "output_schema": "spec-review-report-v1",
  "owner": "dev-pomogator",
  "version": 1,
  "review_after": "ISO-8601 timestamp"
}
```

- `consumer_id`: stable unique identifier; never accepted from prompt prose as proof of origin.
- `skill_path`: exact plugin-relative owner path.
- `operation`: registered Workflow operation; direct-Agent contracts are forbidden.
- `subagent_types`: explicit allowed runtime child types.
- `max_*`: deterministic ceilings; time and token preemption are excluded unless host PoC proves enforcement.
- `output_schema`: schema identifier validated after the child returns.
- `review_after`: contract expiry or review boundary.

## Trusted Invocation Context

```json
{
  "subject": "workflow-native-agent",
  "workflow_run_id": "opaque runtime-issued identifier",
  "attempt_id": "opaque runtime-issued identifier",
  "consumer_id": "spec-review",
  "contract_version": 1,
  "operation": "workflow"
}
```

This context applies only to Workflow-native `agent()` packet admission when supplied by the trusted Workflow runtime boundary. Caller-provided copies are untrusted input and cannot authorize. It is never an allow-envelope for the native Claude Code `Agent` tool: native Agent has a separate unconditional-deny decision when the real protected pre-spawn boundary is proven and installed.

## Policy Decision

```json
{
  "decision": "allow-or-deny",
  "reason_code": "DWE_DIRECT_AGENT_DENIED",
  "policy_version": 1,
  "consumer_id": "spec-review-or-null",
  "workflow_run_hash": "sha256-or-null",
  "attempt": 1,
  "counters": {
    "logical_calls": 1,
    "physical_attempts": 1,
    "tool_calls": 0,
    "active_children": 0
  },
  "input_hash": "sha256",
  "schema_result": "not-run-or-valid-or-invalid"
}
```

## Journal Event

```json
{
  "event": "started-or-progress-or-result-or-failure-or-circuit-open",
  "logical_call_key": "stable prompt-and-options fingerprint",
  "physical_attempt": 1,
  "phase": "Inspect",
  "status": "running-or-completed-or-failed-or-blocked",
  "failure_signature": "normalized hash or null",
  "coverage_scope": "declared scope identifier",
  "output_ref": "durable result reference or null"
}
```

## Validation Rules

- Missing or unknown contract fields deny before spawn.
- Unknown, duplicate, expired, forged, wrong-skill, forbidden-subtype, or over-budget calls deny with stable codes.
- Raw prompts, secrets, tokens, and tool payloads never enter policy audit records.
- Logical call keys remain stable across physical retries with unchanged prompt and options.
- Completed output references remain reusable across resume.
- Schema examples are normative shapes for implementation; exact host-origin fields remain conditional on the real-host PoC.

## Second dogfood schema extensions (planned, not implemented)

### Packet/run identity binding

```json
{
  "expectedRoot": "normalized absolute repository root",
  "worktree": {
    "mode": "existing|isolated",
    "path": "exact checkout path",
    "baseSha": "git SHA"
  },
  "ownerTaskId": "runtime-owned task identifier",
  "ownerInstanceId": "runtime-issued owner generation",
  "ownerProcess": { "pid": 0, "startedAt": "ISO-8601" },
  "dirtyPathAllowlist": [],
  "runId": "runtime-issued identifier",
  "stateVersion": 1,
  "fencingToken": 1,
  "runtimeState": "ROOT_VERIFIED|EXCLUSIVE_OWNERSHIP|PREFLIGHT_GREEN|PLAN_FROZEN|RUNNING|VERIFYING|COMMITTING|DONE|PARTIAL|FAILED|BLOCKED|CANCELLED|PAUSED_RESUMABLE|TERMINATED_NO_RESUME|HARNESS_REPAIR",
  "requiredGates": ["consumer-defined ordered gate id"],
  "binding": {
    "processGroupId": "OS-owned group",
    "sharedResourceLeaseId": "lease identifier",
    "checkoutWriterOwner": "owner identifier"
  }
}
```

Before any work action, `expectedRoot` SHALL equal the normalized actual `git rev-parse --show-toplevel`. The binding is invalid if root/worktree, owner instance/process-start identity, process group, lease, run, state version, fencing token, or runtime state is missing or changes without a CAS transition. Domain gates live in `requiredGates`; generic runtime state never hard-codes domain-specific L1–L6 names. Prompt prose is not a binding field.

### Run state, terminal evidence, and typed result collections

```json
{
  "state": "CREATED|ROOT_VERIFIED|EXCLUSIVE_OWNERSHIP|PREFLIGHT_GREEN|PLAN_FROZEN|RUNNING|VERIFYING|COMMITTING|DONE|PARTIAL|FAILED|BLOCKED|CANCELLED|PAUSED_RESUMABLE|TERMINATED_NO_RESUME|HARNESS_REPAIR",
  "stateVersion": 1,
  "fencingToken": 1,
  "ownerTaskId": "...",
  "ownerInstanceId": "...",
  "ownerProcess": { "pid": 0, "startedAt": "ISO-8601" },
  "requiredGates": [],
  "gateResults": [],
  "checkoutWriterLock": {
    "ownerInstanceId": "...",
    "fencingToken": 1,
    "acquiredAt": "ISO-8601",
    "renewedAt": "ISO-8601",
    "expiresAt": "ISO-8601"
  },
  "externalRuntimeLease": {
    "ownerInstanceId": "...",
    "fencingToken": 1,
    "acquiredAt": "ISO-8601",
    "renewedAt": "ISO-8601",
    "expiresAt": "ISO-8601"
  },
  "lockOrder": ["checkoutWriterLock", "externalRuntimeLease"],
  "baselineHashes": {},
  "originalCandidates": [],
  "staged": [],
  "proven": [],
  "rejected": [],
  "deferred": [],
  "unprovenApplied": [],
  "terminal": {
    "ownerStopped": false,
    "descendantsRemaining": 0,
    "writersRemaining": 0,
    "stopState": "PAUSED_RESUMABLE|TERMINATED_NO_RESUME"
  }
}
```

Every transition is compare-and-swap on `stateVersion` and the successful transition advances `fencingToken` when ownership changes. PID alone never proves ownership. Locks are acquired only in `lockOrder`; each has bounded acquisition timeout, renewal, expiry, explicit release, stale-owner inspection, and takeover that issues a newer fencing token. Any write with an old token is denied. `RUNNING` and mutation are invalid until root verification, exclusive ownership, green preflight, and frozen baseline/plan are present. Completion is invalid unless every ordered `requiredGates` entry has required evidence and the identity binding remains intact.

### Captured process and typed summary

```json
{
  "executable": "...",
  "argv": [],
  "stdoutRef": "...",
  "stderrRef": "...",
  "evidenceRef": "...",
  "encoding": "UTF-8",
  "exitCode": 0,
  "diagnosticsRef": "...",
  "summary": { "count": 0, "items": [] },
  "classification": "HARNESS_DEFECT|CAPABILITY_GAP|PRODUCT_FAILURE"
}
```

The normal runner accepts argv arrays and writes separate evidence. `summary.count` SHALL equal `summary.items.length`; ad-hoc object `length` is not a valid summary. External claims require an independent real readback.

### Per-run event and recovery capsule

```json
{
  "runId": "...",
  "seq": 42,
  "ownerTaskId": "...",
  "ownerPid": 0,
  "worktree": "...",
  "phase": "RUNNING",
  "gateId": "consumer-defined gate id or null",
  "status": "start|progress|success|failure|blocked|terminal",
  "recoveryCapsule": {
    "root": "...",
    "owner": "...",
    "baseSha": "...",
    "dirtyPaths": [],
    "acceptedEvidenceOrCommits": [],
    "unprovenWork": [],
    "lastGreenGate": "...",
    "blocker": "...",
    "nextAction": "...",
    "doNotTouch": []
  }
}
```

Events from another run ID or a non-monotonic sequence are not current progress. A `TERMINATED_NO_RESUME` run rejects old-context continuation. These schema extensions remain planned until fixtures and runtime evidence exist.
