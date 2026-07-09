# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-claude-code-managed-carl-install)

WHEN a supported Claude Code project installs or refreshes dev-pomogator THEN the CARL integration SHALL create or refresh the managed Claude Code CARL artifacts with dev-pomogator owner and version markers.

WHEN the installer runs repeatedly on an already managed CARL integration THEN it SHALL leave the resulting managed artifacts byte-equivalent except for expected version or timestamp metadata.

IF the real CARL runtime layout is still [UNVERIFIED] THEN the implementation SHALL keep the CARL runtime command and artifact shape marked [UNVERIFIED] and SHALL NOT close FR-1 as done.

WHEN a Russian prompt reaches the CARL runner THEN the runner SHALL use project `.carl/` language metadata to determine whether Russian rules/recall domains are available, and SHALL report a degraded language state instead of healthy empty recall when Russian coverage is missing or stale.

WHEN a project rule or skill is added or changed THEN the CARL adaptation script SHALL refresh `.carl/carl.json`, update source hashes, and make the source discoverable for Russian CARL recall when safe Russian aliases exist.

IF the adaptation script cannot derive safe Russian aliases for a rule or skill THEN it SHALL record a partial language state such as `ru:needs-alias` instead of inventing misleading Russian trigger terms.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent)

IF no runnable CARL runtime consumer is present THEN installer, doctor, and reporting surfaces SHALL return a degraded state rather than `healthy`, `installed`, `active`, or `ready`.

WHEN CARL artifacts are absent, stale, unsupported, or missing dependencies THEN the diagnostic output SHALL name the exact missing condition and preserve the rest of the dev-pomogator install flow.

WHEN a check observes only files on disk without executing the hook consumer THEN the check SHALL NOT treat that evidence as a green CARL integration verdict.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof)

WHEN the managed CARL hook is installed THEN a normal plugin-user hook launcher or dispatcher SHALL invoke the CARL runner through the same command path that is registered in the distributed plugin configuration.

WHEN the BDD runtime-consumer scenario runs THEN it SHALL fail if the CARL runner file exists but no launcher or dispatcher actually calls it.

IF test fixtures or benchmark fixtures model CARL output THEN those fixtures SHALL either be captured from the real CARL producer or remain explicitly marked [UNVERIFIED] and barred from final done evidence.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-fail-open-warning-injection)

WHEN the managed CARL hook encounters a missing dependency, timeout, malformed output, unsupported mode, or runtime exception THEN the hook SHALL exit in fail-open mode so the main agent session can continue.

WHEN the hook fails open THEN agent-visible context SHALL include a concise warning that CARL did not run and that the AI agent must tell the user CARL guidance/recall was unavailable.

WHEN the hook succeeds THEN it SHALL NOT inject a false failure warning.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-doctor-health-and-repair)

WHEN `pomogator-doctor` runs its CARL check THEN it SHALL classify the integration as one of `healthy`, `missing`, `stale`, `broken-runtime`, `unsupported`, `user-conflict`, or `repairable`.

IF managed CARL artifacts are missing or stale AND repair is enabled THEN doctor SHALL reinstall or refresh only those managed artifacts and report the before/after state.

IF CARL runtime dependencies or platform capabilities are unavailable THEN doctor SHALL report `broken-runtime` or `unsupported` with an actionable hint rather than overwriting configuration.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration)

WHEN the installer or doctor writes CARL settings into a shared configuration file THEN every managed region SHALL be bounded by explicit managed markers, a managed manifest entry, or a deterministic managed object key.

IF a user-authored CARL hook, rule, or setting exists outside the managed region THEN repair SHALL preserve it unchanged.

IF a user-authored entry conflicts with the managed CARL key THEN the integration SHALL report `user-conflict` and SHALL NOT overwrite the user entry without an explicit repair decision.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites)

IF the Codex context-menu launcher or Codex hook dispatcher prerequisite is not available THEN Codex CARL installation SHALL remain disabled or reported unsupported while Claude Code CARL behavior remains unaffected.

WHEN the Codex path is enabled THEN CARL SHALL register through the Codex deterministic dispatcher and project-local artifact model rather than by copying Claude Code hook files.

WHEN the installed Codex version lacks the required hook capability THEN CARL SHALL report a version-aware unsupported state and SHALL NOT claim Codex CARL is healthy.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-review-audit-and-reporting)

WHEN the CARL implementation is reviewed THEN the report SHALL cover managed install, runtime hook consumption, fail-open warnings, doctor repair, user-config preservation, Codex sequencing, and benchmark evidence.

IF a CARL claim depends on external CARL behavior THEN the report SHALL mark that claim `[VERIFIED]`, `[UNVERIFIED]`, or `[ASSUMED]` with evidence or an explicit research gap.

WHEN files exist but the hook consumer was not exercised THEN the review SHALL flag a fake-green risk instead of accepting the integration as complete.

WHEN the Russian CARL self-evaluation report runs THEN it SHALL compare each curated Russian prompt against expected loaded domains, record false positives and false negatives, and propose concrete alias, normalization, ranking, or context-budget optimizations for every observed gap.

IF a Russian prompt evaluation uses captured sibling output rather than a dev-pomogator-owned runtime THEN the report SHALL mark the result as fixture-backed evidence and SHALL NOT claim dev-pomogator Russian CARL is ready.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate)

IF CARL recall is enabled THEN a benchmark SHALL run against a real CARL recall artifact or real CARL runtime output before the recall feature is marked done.

WHEN the first real benchmark is accepted THEN the implementation SHALL record a baseline for latency, token overhead, and recall quality metrics that are actually supported by CARL evidence.

WHEN a captured CARL fixture is used as benchmark evidence THEN the baseline SHALL cite its provenance ledger, captured source hashes, and producer ground truth.

IF no numeric threshold has been verified from a real CARL artifact or approved external requirement THEN the benchmark SHALL remain in draft mode and SHALL NOT invent a pass/fail threshold.
