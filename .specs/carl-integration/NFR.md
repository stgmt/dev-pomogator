# Non-Functional Requirements

## Performance

- **NFR-Performance-1: bounded hook overhead.** The managed CARL hook SHALL use a bounded local execution budget. A numeric p95 target SHALL remain draft until calibrated from a provenance-complete real CARL artifact.
- **NFR-Performance-2: bounded failure.** A timeout, hung runtime, or malformed response SHALL not stall SessionStart, UserPromptSubmit, or the host agent workflow indefinitely.
- **NFR-Performance-3: concise context.** Agent-visible CARL context and warnings SHALL be concise; raw logs and recall payloads SHALL remain in structured diagnostics.
- **NFR-Performance-4: honest benchmark.** Recall regression gates SHALL use only metrics supported by a real producer artifact, including latency, token overhead, and recall quality where available.

## Security and ownership

- **NFR-Security-1: no secrets.** Managed config, reports, fixtures, and warnings SHALL not contain API keys, tokens, credentials, or private recall payloads.
- **NFR-Security-2: managed boundary.** Install and repair SHALL mutate only managed files, markers, manifest entries, or deterministic managed keys.
- **NFR-Security-3: safe diagnostics.** Agent-visible diagnostics SHALL identify the failure class without exposing unnecessary environment values or sensitive paths.
- **NFR-Security-4: external provenance.** Any external runtime, vendored file, downloaded artifact, or producer output SHALL carry source, license, and integrity evidence before it is treated as distributable or ready.

## Reliability

- **NFR-Reliability-1: fail open, never silent.** CARL failure SHALL allow the primary workflow to continue and SHALL be visible through agent context and doctor/log reporting.
- **NFR-Reliability-2: idempotence.** Repeated installation, adaptation, and repair SHALL converge without duplicate hook entries, source-hash churn beyond expected metadata, or user-config corruption.
- **NFR-Reliability-3: honest states.** Unsupported, missing, stale, broken-runtime, user-conflict, and deferred states SHALL not be collapsed into healthy.
- **NFR-Reliability-4: real-artifact proof.** Final readiness SHALL require a real distributed hook execution path and, when recall is enabled, a provenance-complete real recall artifact or captured producer output; dispatcher/runner files alone and a manifest entry written without execution SHALL remain degraded.
- **NFR-Reliability-5: adaptation ordering.** SessionStart adaptation SHALL complete before UserPromptSubmit consumes the project-local manifest, and the manifest SHALL retain source-hash, alias, and `ru:needs-alias` evidence for the adapted rule and skill domains.

## Usability

- **NFR-Usability-1: clear warning.** Fail-open output SHALL say that CARL did not run and instruct the agent to tell the user CARL guidance/recall was unavailable.
- **NFR-Usability-2: actionable doctor.** Doctor output SHALL include state, cause/evidence, and next action such as repair, verify runtime, install prerequisite, resolve conflict, or defer Codex.
- **NFR-Usability-3: reviewable claims.** Reports SHALL separate verified repository facts, assumptions, fixture-backed evidence, and unverified external behavior.
- **NFR-Usability-4: platform clarity.** Claude Code and Codex results SHALL be reported independently.

## Compatibility

- **NFR-Compatibility-1: Claude Code first.** Claude Code project-local installation is the first supported platform path.
- **NFR-Compatibility-2: Codex gated.** Codex requires context-menu launcher, project-local dispatcher, and version-aware hook capability evidence.
- **NFR-Compatibility-3: canonical plugin.** Distributed hooks and managed files SHALL work for plugin users without this repository's development dependencies.
- **NFR-Compatibility-4: dependency-absent.** Plugin-distributed CARL code SHALL be bundled, builtins-only, or fail-open on missing optional dependencies; an unhandled module-resolution error SHALL not crash the host hook path.
