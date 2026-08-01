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
  "workflow_run_id": "opaque runtime-issued identifier",
  "attempt_id": "opaque runtime-issued identifier",
  "consumer_id": "spec-review",
  "contract_version": 1,
  "tool_name": "Agent"
}
```

This context is valid only when supplied by the trusted host boundary. Caller-provided copies are untrusted input and cannot authorize.

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
