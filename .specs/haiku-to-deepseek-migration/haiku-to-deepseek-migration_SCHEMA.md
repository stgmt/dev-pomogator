# Haiku to DeepSeek Migration Fixture Schemas

## Direct model decision observation

```json
{
  "provider": "openrouter",
  "effectiveModel": "deepseek/deepseek-v4-flash",
  "decisionSource": "default | environment_override | verified_catalog",
  "diagnosticCode": "string | null"
}
```

- `provider` identifies the actual provider namespace used by the entry point.
- `effectiveModel` is exact for direct OpenRouter defaults and is an exact returned catalog ID for routed paths.
- `decisionSource` explains why that value won precedence.
- `diagnosticCode` is secret-free and present for fail-soft outcomes.

## Redacted routed catalog capture

```json
{
  "capturedAt": "ISO-8601 timestamp",
  "producer": "aipomogator-go-v1-models",
  "models": [
    {
      "id": "provider-returned-string",
      "capabilities": ["optional-string"]
    }
  ]
}
```

- This schema describes the normalized test capture, not a fabricated promise that any ID exists live.
- The producer-specific adapter retains actual captured field names in F-H2D-02; only redaction removes sensitive values.
- Negative variants preserve the envelope shape where applicable and identify their deliberate fault.

## Quality evaluation record

```json
{
  "surface": "prompt-suggest | claim-evidence | learnings-capture",
  "baselineModel": "historical-haiku-id",
  "candidateModel": "deepseek/deepseek-v4-flash | verified-routed-id",
  "workloadFixture": "F-H2D-04",
  "settingsFingerprint": "redacted-hash",
  "rubric": {
    "relevance": "pass | fail | score",
    "hallucination": "pass | fail | score",
    "russianQuality": "pass | fail | score",
    "formatLength": "pass | fail | score",
    "malformedEmptyRate": "number",
    "latency": "distribution",
    "cost": "currency record"
  },
  "decision": "pass | fail | no-go",
  "reviewer": "role-or-redacted-id",
  "evaluatedAt": "ISO-8601 timestamp",
  "pricingStatus": "matched | drifted | unavailable"
}
```

## Validation rules

- Direct OpenRouter candidate model MUST equal `deepseek/deepseek-v4-flash`.
- A routed candidate model MUST originate from a validated catalog observation; a transformed direct slug is invalid.
- `decision` is `no-go` if required rubric evidence is missing or a required threshold fails.
- `pricingStatus` of `drifted` or `unavailable` forbids publication of the captured numeric savings as a live claim.
- Schema records and fixtures MUST remain secret-free.