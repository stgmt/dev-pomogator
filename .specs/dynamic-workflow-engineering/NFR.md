# Non-Functional Requirements (NFR)

## Performance

- A policy decision SHALL not spawn an LLM agent and SHALL perform bounded registry lookup and validation only.
- Deterministic BDD fixtures SHALL prove configured call, attempt, concurrency, and input-size ceilings without relying on model timing.
- Clean-install policy startup and one decision SHALL remain within the existing hook-service timeout budget; exact latency is measured during implementation.

## Security

- Authorization SHALL depend on trusted runtime provenance and exact contracts, never prompt text, labels, frontmatter, user-supplied environment variables, or `subagent_type` alone.
- Protected native Agent calls fail closed on policy initialization, authorization, or transport errors.
- Audit records SHALL redact prompts, secrets, tokens, and raw tool payloads.
- Direct hook-service route or loopback dispatch without trusted Workflow provenance SHALL not bypass policy.

## Reliability

- Registry and generated hook surfaces SHALL be validated for one-source parity.
- Retry and resume SHALL preserve completed outputs and never replay them solely because an independent sibling failed.
- Missing required reports SHALL yield partial or blocked status and explicit coverage gaps, not false completion.

## Usability

- Every denial SHALL include a stable reason code and concise instruction to use Dynamic Workflow with `dynamic-workflow-engineering`.
- Monitoring SHALL separate facts, inferences, unknowns, and recommended actions.
- Guarantee tier SHALL be visible and shall not overstate host capabilities.

## Portability

- Canonical marketplace install, repository dogfood, Windows, Docker, and dependency-absent execution SHALL consume the same policy and skill assets or declare a tested platform limitation.
