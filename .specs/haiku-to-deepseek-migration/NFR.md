# Non-Functional Requirements

## NFR-1: Deterministic observable selection

Each scoped decision MUST expose the effective provider/model, decision source (default, override, or verified catalog), and a secret-free failure reason. Observability MUST distinguish a configured override from a default and a verified catalog route from a direct OpenRouter default.

## NFR-2: Reliability and fail-soft safety

Provider/catalog unavailability MUST retain process safety through the configured non-Haiku abstention, stop, or fallback path. Missing catalog evidence, stale generated artifacts, missing exact-ID proof, and incomplete A/B evidence are fail-closed for rollout claims, not successful migration evidence.

## NFR-3: Reproducible semantic evaluation

Candidate and baseline runs MUST use the same redacted workload, prompt/template, settings, rubric, threshold, and human-review procedure. The record MUST distinguish availability failure from quality failure and preserve sufficient non-secret provenance for review.

## NFR-4: Derived-artifact and mirror integrity

Generated bundles MUST be regenerated through supported project commands from canonical source. `.agents` content MUST be synchronized from `.claude`; independently hand-edited derived artifacts are not a source of truth. Verification MUST invoke actual supported entry points.

## NFR-5: Performance and cost transparency

The evaluation MUST record latency, input/output token counts, live price metadata, and the calculation assumptions. Changed price, retry, caching, or unavailable metadata MUST produce a pricing-drift result rather than a stale percentage claim.

## NFR-6: Fixture secrecy and data minimization

Fixtures MUST be redacted captures of actual producer shapes and MUST contain no live credentials, secrets, or unredacted sensitive prompts. Negative cases MAY be derived from captured shapes but MUST identify the derivation.

## Performance

Catalog verification and model-selection logic MUST preserve existing hook timeout budgets. A cached or already-verified route MUST NOT add a provider catalog request to every inference call. The A/B evidence record MUST report latency, token usage, retries, cache usage when reported, live prices, and total cost separately for baseline and candidate runs.

## Security

Diagnostics, catalog captures, workload fixtures, review packets, and test output MUST remain secret-free and redacted. Only runtime/provider code may read credentials, and only a provider-returned validated catalog value may become a routed model ID.

## Reliability

Malformed catalogs, absent DeepSeek routes, provider errors, invalid overrides, malformed completions, and timeouts MUST preserve each component's fail-soft contract without silently routing to Haiku. Generated bundles and mirrors MUST remain behaviorally equal to their canonical sources.

## Usability

Failure diagnostics MUST identify the affected component, provider class, reason category, and remediation without exposing secrets. The rollout report MUST end in an explicit pass, fail, or no-go decision with reviewer and date.
