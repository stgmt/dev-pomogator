# spec-dashboard Browser DTO Schema

## Envelope

Every response uses `{ schemaVersion: "1", requestId, data, error }`; `data` and `error` are mutually exclusive. `requestId` is safe to display and contains no credential, path, command, or node content.

## AdapterConfig

```json
{
  "providerTimeoutMs": 5000,
  "transientTransportRetries": 1,
  "staleAfterMs": 900000,
  "traceDisplayRetentionMs": 86400000,
  "maxCollectionItems": 100
}
```

Only a transient idempotent read transport failure may be retried once. Invalid, not-found, authentication, cross-origin, non-allowlisted, and mutation requests are never retried. Authentication and session credentials remain server-side and are never stored by the browser.

## TraceCollection<T>

```json
{
  "availability": "available | empty | partial | unavailable | provider_error",
  "items": [],
  "pageSize": 100,
  "truncated": false,
  "continuationToken": null
}
```

The continuation token is opaque and contains no path or credential. This envelope applies independently to acceptance criteria, decisions, stories, scenarios, tasks, code/files, evidence, history, and relationships. Full incoming/outgoing relationships are projected from bounded `find_refs`; `get_trace.related_nodes` is only a summary. The current provider exposes no canonical history surface, so `history.availability` is `unavailable` unless a future versioned provider contract supplies one.

## TaskCardDto

```json
{
  "id": "spec-dashboard:T01",
  "spec": "spec-dashboard",
  "title": "Mirror executable BDD feature",
  "authoredStatus": "todo | ready | in-progress | done | blocked",
  "verifiedStatus": "DONE | IN_PROGRESS | unverified",
  "readiness": "ready | incomplete | blocked | unknown",
  "requirements": ["FR-1"],
  "phase": "Phase 0: BDD Foundation (Red)",
  "lastEvidenceAt": null
}
```

Task cards come from bounded `list_tasks` pages requested with all five statuses. Authored lifecycle and evidence-derived verification/readiness are separate fields: a hand-authored `done` can never imply verified evidence.

## StatusDto

```json
{
  "spec": "spec-dashboard",
  "lifecycle": "SPEC_ONLY | TESTS_NOT_RUN | RED | PARTIAL | GREEN",
  "counts": { "fr": 0, "ac": 0, "scenario": 0, "task": 0 },
  "gaps": [],
  "phases": [],
  "lastRun": null,
  "providerState": "ok | stale | partial | unavailable | provider_error",
  "retrievedAt": "ISO-8601",
  "freshness": "current | stale | unknown"
}
```

## TraceDto

Every property below is `TraceCollection<T>` except `node`:

```json
{
  "node": { "id": "spec-dashboard:T01", "type": "Task", "title": "Mirror nine executable BDD scenarios", "authoredStatus": "todo", "verifiedStatus": "IN_PROGRESS" },
  "acceptanceCriteria": { "availability": "available", "items": [], "pageSize": 100, "truncated": false, "continuationToken": null },
  "decisions": { "availability": "empty", "items": [], "pageSize": 100, "truncated": false, "continuationToken": null },
  "stories": { "availability": "available", "items": [], "pageSize": 100, "truncated": false, "continuationToken": null },
  "scenarios": { "availability": "available", "items": [], "pageSize": 100, "truncated": false, "continuationToken": null },
  "tasks": { "availability": "partial", "items": [], "pageSize": 100, "truncated": true, "continuationToken": "opaque" },
  "codeFiles": { "availability": "available", "items": [], "pageSize": 100, "truncated": false, "continuationToken": null },
  "evidence": { "availability": "available", "items": [], "pageSize": 100, "truncated": false, "continuationToken": null },
  "history": { "availability": "unavailable", "items": [], "pageSize": 100, "truncated": false, "continuationToken": null },
  "relationships": { "availability": "available", "items": [{ "direction": "incoming", "relation": "tested-by", "nodeId": "spec-dashboard:SCEN-example" }], "pageSize": 100, "truncated": false, "continuationToken": null }
}
```

Task detail first resolves `node` with `get_node`, then resolves each `requirements[]` item with `get_trace`; relationships come from bounded `find_refs`, and scenario details come from `get_scenario_trace`. Code paths are validated root-contained repository-relative POSIX paths. Absolute/traversal paths are rejected. Evidence storage and runtime trace chunk paths are omitted or represented by opaque IDs/status values.

## ScenarioEvidenceDto

```json
{
  "scenarioId": "spec-dashboard:SCEN-example",
  "executed": false,
  "result": "PASSED | FAILED | SKIPPED | PENDING | UNDEFINED | AMBIGUOUS | UNKNOWN",
  "runId": null,
  "runAt": null,
  "source": null,
  "traceAvailability": "available | empty | partial | unavailable | expired | provider_error",
  "failingStep": null,
  "error": null,
  "stale": false,
  "provenance": "execution_verified | claimed_only | unavailable"
}
```

When `executed` is false, `result` is omitted or null; `NOT_RUN` is not a scenario-result value.

## EvidenceItemDto

```json
{
  "id": "spec-dashboard:Evidence-1",
  "state": "PRESENT | MISSING",
  "reviewStatus": "CONFIRMED | DENIED | INCOMPLETE | UNAVAILABLE | SELF_ATTESTED",
  "provenance": "execution_verified | claimed_only | unavailable",
  "producer": "provider-name",
  "source": "opaque-source-id",
  "runId": "run-id",
  "subjectRevision": "revision",
  "finalizedAt": "ISO-8601",
  "freshness": "current | stale | unknown",
  "stale": false
}
```

## EvidenceReportDto

`items` is `TraceCollection<EvidenceItemDto>`. The route composes only existing `get_spec_status(view=coverage)`, `get_trace`, `get_scenario_trace`, `evidenced-by` edges, and `EvidenceNode` fields. No `get_evidence` MCP tool exists or is assumed.

## ErrorDto

```json
{
  "code": "READ_ONLY | TOOL_NOT_ALLOWLISTED | INVALID_REQUEST | NODE_NOT_FOUND | PROVIDER_UNAVAILABLE | TRANSPORT_ERROR | BROWSER_RUNTIME_ERROR | AUTHENTICATION_ERROR | CORS_ORIGIN_REJECTED",
  "diagnosticId": "safe-diagnostic-id",
  "retryable": false,
  "message": "Safe user-facing message"
}
```

Unknown, non-allowlisted, and mutation tools are rejected before MCP dispatch. Errors never contain credentials, absolute paths, evidence storage paths, command arguments, stack traces, or provider secrets.
