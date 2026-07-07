# Non-Functional Requirements (NFR)

## Performance

- **NFR-Performance-1: Hook latency budget.** The managed CARL hook path SHALL use a bounded local overhead budget, but the first numeric p95 target SHALL remain draft until it is calibrated by real CARL hook/benchmark evidence. No invented numeric threshold is accepted as final evidence.
- **NFR-Performance-2: Fail-open timeout.** The hook runner SHALL enforce a bounded timeout so CARL failure cannot stall agent startup, prompt processing, or hook execution indefinitely.
- **NFR-Performance-3: Token budget.** Any CARL warning or injected context SHALL be concise by default and SHALL avoid dumping raw CARL logs into the agent context; verbose diagnostics belong in logs or doctor output.
- **NFR-Performance-4: Benchmark regression gate.** If CARL recall is enabled, a real-artifact benchmark SHALL track latency, token overhead, and any verified recall-quality metric before those metrics can gate regressions.

## Security

- **NFR-Security-1: No secrets in managed artifacts.** Managed CARL config, reports, fixtures, and hook warnings SHALL NOT contain API keys, tokens, credentials, or user-private recall payloads.
- **NFR-Security-2: Preserve user trust boundary.** Repair SHALL mutate only managed CARL blocks/artifacts unless the user explicitly approves conflict resolution.
- **NFR-Security-3: Safe diagnostics.** Agent-visible CARL warnings SHALL describe the failure class without exposing sensitive paths or raw environment values beyond what is needed for safe remediation.
- **NFR-Security-4: External runtime verification.** CARL external runtime downloads, vendored files, or generated artifacts SHALL be verified for source, license, and integrity before distribution. [UNVERIFIED: no CARL source/license/runtime evidence exists in current repo inventory]

## Reliability

- **NFR-Reliability-1: Fail open, never silent.** CARL hook failure SHALL not block the main agent workflow, but the failure SHALL be visible to the agent and available to doctor/log reporting.
- **NFR-Reliability-2: Idempotent install and repair.** Repeated installer and doctor repair runs SHALL converge to the same managed state without duplicating hook entries or corrupting user-owned config.
- **NFR-Reliability-3: Honest unsupported state.** Unsupported Claude Code or Codex capability SHALL be represented as `unsupported`, not as healthy or missing.
- **NFR-Reliability-4: Real-artifact verification.** Final done evidence SHALL include a real hook execution path and, if recall is enabled, a real CARL recall artifact or captured producer output.

## Usability

- **NFR-Usability-1: Clear warning copy.** The fail-open warning SHALL say plainly that CARL did not run and that the agent should tell the user CARL guidance/recall was unavailable.
- **NFR-Usability-2: Actionable doctor output.** Doctor CARL findings SHALL include a state, cause, and next action such as repair, install prerequisite, verify external CARL runtime, or defer Codex path.
- **NFR-Usability-3: Reviewable evidence.** Reports SHALL separate verified repo facts, assumptions, and unverified external CARL details so maintainers can review risk without reading hook internals.
- **NFR-Usability-4: Platform-specific clarity.** Claude Code and Codex statuses SHALL be reported separately so unsupported Codex prerequisites do not obscure a healthy Claude Code CARL path.

## Compatibility

- **NFR-Compatibility-1: Claude Code first.** Claude Code managed installation is the first supported platform path for this spec.
- **NFR-Compatibility-2: Codex gated.** Codex support SHALL require the context-menu Codex launcher and Codex hook dispatcher prerequisites, plus a version-aware hook capability check.
- **NFR-Compatibility-3: Canonical plugin distribution.** Distributed hook entries and managed files SHALL work in canonical plugin installs where plugin users do not have this repository's development dependencies installed.
- **NFR-Compatibility-4: Deps-absent behavior.** Plugin-distributed CARL hook code SHALL either be bundled, builtins-only, or fail-open on missing optional dependencies; it SHALL NOT crash the whole hook path with an unhandled module-resolution error.
