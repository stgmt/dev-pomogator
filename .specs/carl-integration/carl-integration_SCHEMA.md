# CARL Integration Schema

This schema document is a Phase 2 draft for managed dev-pomogator CARL artifacts. External CARL runtime fields remain [UNVERIFIED] until real CARL documentation, source, or runtime output is captured.

## Managed CARL config (`.carl/carl.json`)

```json
{
  "schemaVersion": 1,
  "managedBy": "dev-pomogator",
  "managedVersion": "<plugin-version>",
  "platforms": {
    "claudeCode": {
      "state": "healthy|missing|stale|broken-runtime|unsupported|user-conflict|repairable",
      "hookCommand": "<managed hook command>",
      "runtimeVerified": false,
      "lastCheckedAt": "<ISO-8601 timestamp>"
    },
    "codex": {
      "state": "deferred|unsupported|healthy|missing|stale|broken-runtime|user-conflict|repairable",
      "requires": ["context-menu-codex-launcher", "codex-hook-dispatcher", "codex-hook-capability"],
      "capabilityVerified": false,
      "lastCheckedAt": "<ISO-8601 timestamp>"
    }
  },
  "externalCarl": {
    "runtimeSource": "[UNVERIFIED]",
    "runtimeCommand": "[UNVERIFIED]",
    "outputContract": "[UNVERIFIED]"
  },
  "benchmark": {
    "enabled": false,
    "baselineArtifact": null,
    "thresholdStatus": "draft|verified|blocked"
  }
}
```

- `schemaVersion`: Integer managed config schema version for migration and doctor checks.
- `managedBy`: MUST be `dev-pomogator` for artifacts that doctor is allowed to repair automatically.
- `managedVersion`: Plugin or integration version that produced the managed artifact.
- `platforms.claudeCode.state`: Doctor-visible Claude Code CARL state.
- `platforms.claudeCode.hookCommand`: Managed hook command registered for Claude Code. Exact command remains [UNVERIFIED] until implementation validates the hook transport.
- `platforms.claudeCode.runtimeVerified`: `true` only after a real hook runtime consumer has executed the CARL runner.
- `platforms.codex.state`: Codex CARL state; `deferred` is valid until launcher/dispatcher prerequisites exist.
- `platforms.codex.requires`: Explicit prerequisite list preventing accidental Codex fake-green.
- `externalCarl.*`: External CARL runtime facts; these MUST remain `[UNVERIFIED]` until real evidence exists.
- `benchmark.baselineArtifact`: Path or provenance identifier for the real CARL recall artifact used to establish baseline metrics.
- `benchmark.thresholdStatus`: `draft` before a real baseline, `verified` after approved evidence, `blocked` when recall is enabled but no real artifact exists.

## Hook result payload

```json
{
  "ok": false,
  "mode": "fail-open|success",
  "warning": "CARL did not run; tell the user CARL guidance/recall was unavailable.",
  "diagnosticCode": "missing-runtime|timeout|malformed-output|unsupported|exception",
  "agentContext": "<short agent-visible text>",
  "logRef": "<diagnostic log reference>"
}
```

- `ok`: `true` only when the managed CARL runner completed successfully.
- `mode`: `fail-open` on any CARL failure that allows the agent session to continue.
- `warning`: Required on `fail-open`; MUST be concise and agent-visible.
- `diagnosticCode`: Stable state code used by doctor and reports.
- `agentContext`: Short text injected into agent-visible context; MUST NOT include secrets or raw private recall data.
- `logRef`: Reference to structured diagnostics outside chat context.

## Doctor CARL check result

```json
{
  "id": "carl",
  "state": "healthy|missing|stale|broken-runtime|unsupported|user-conflict|repairable",
  "severity": "ok|warn|error",
  "platform": "claude-code|codex",
  "canRepair": true,
  "summary": "<human-readable summary>",
  "evidence": ["<path or check evidence>"],
  "nextAction": "repair|install-prerequisite|verify-runtime|defer-codex|resolve-conflict"
}
```

- `state`: One of the FR-5 doctor states.
- `severity`: Maps state to doctor report severity; exact UI labels follow doctor conventions.
- `platform`: Platform-specific status so Codex unsupported state does not hide Claude Code health.
- `canRepair`: `true` only for managed drift, not for missing external runtime dependencies or user conflicts.
- `evidence`: Paths, marker versions, or command results used by the doctor check.
- `nextAction`: Actionable remediation hint.

## Benchmark baseline record

```json
{
  "artifact": "<real CARL artifact provenance>",
  "capturedAt": "<ISO-8601 timestamp>",
  "metrics": {
    "latencyMsP95": null,
    "tokenOverhead": null,
    "recallQuality": null
  },
  "thresholdStatus": "draft|verified|blocked",
  "notes": "[UNVERIFIED] until real CARL artifact is captured"
}
```

- `artifact`: MUST identify a real CARL runtime output or recall artifact before the benchmark can become verified.
- `metrics`: Only metrics supported by real CARL evidence may be populated.
- `thresholdStatus`: Remains `draft` or `blocked` until thresholds are derived from real evidence or approved external requirement.

## Правила валидации

- Managed config MUST include `managedBy: "dev-pomogator"` before doctor auto-repair mutates it.
- `runtimeVerified` MUST NOT become `true` from file-existence evidence alone; a real hook consumer must execute.
- Codex state MUST NOT become `healthy` unless launcher, dispatcher, and hook capability prerequisites are verified.
- Hook fail-open payloads MUST include a warning instructing the agent to tell the user CARL did not run.
- Benchmark thresholds MUST NOT be numeric unless backed by a real CARL artifact or approved external requirement.
- No schema field may store secrets, tokens, raw private recall content, or full hook logs intended only for diagnostics.
