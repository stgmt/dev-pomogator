# Pinator — Acceptance Criteria (EARS)

## AC-1 (FR-1): Inactive path is silent
**FR:** [FR-1](FR.md#fr-1)
WHEN no task, approved executing plan, active spec work, or native goal is active THEN the hook SHALL approve before classifier/judge entry with no warning, scan, fire, or marker I/O. Completion prose SHALL remain inert. Disabled/malformed/unknown input SHALL fail open and inactive shadow SHALL not record.

## AC-2 (FR-2): Task ownership and closure
**FR:** [FR-2](FR.md#fr-2)
WHEN owned tasks are pending/in-progress THEN task context SHALL contain them; WHEN the final becomes completed/deleted THEN task source SHALL close. Failed updates, re-keying, and unrelated reminder/List/Get rows SHALL not create extra open work.

## AC-3 (FR-3): Valid plan approval only
**FR:** [FR-3](FR.md#fr-3)
WHEN either verified successful correlated ExitPlanMode result shape occurs THEN plan SHALL activate with path/hash; rejected, validation-failed, uncorrelated, stale, and mere-file cases SHALL not, and newer approval SHALL supersede old.

## AC-4 (FR-4): Plan completion is ALL-not-ANY
**FR:** [FR-4](FR.md#fr-4)
WHEN one linked commitment completes THEN only it closes. WHEN any commitment lacks result-confirmed evidence THEN plan remains active. `blocked|awaiting` MAY approve without closure. All-evidenced-complete or explicit abandon/supersede SHALL close the proper plan.

## AC-5 (FR-5): Active mapped spec work
**FR:** [FR-5](FR.md#fr-5)
WHEN session selection/mutation and open mapped task/phase coexist THEN spec SHALL activate; read-only/global backlog SHALL not. `.feature` requires mapped work. Multiple active specs SHALL all remain visible and close independently.

## AC-6 (FR-6): Verified independent native goal
**FR:** [FR-6](FR.md#fr-6)
WHEN latest verified goal_status is `met:false` THEN exact condition SHALL activate; WHEN `met:true` THEN it SHALL deactivate. Clear/resume SHALL use captured artifacts. Native goal and Pinator SHALL remain independent without cross-completion or unbounded loops.

## AC-7 (FR-7): Four-source merge
**FR:** [FR-7](FR.md#fr-7)
WHEN task, plan, spec, and goal are active THEN one deterministic packet SHALL contain all four with provenance, duplicate links, and explicit conflicts.

## AC-8 (FR-8): Current bounded packet
**FR:** [FR-8](FR.md#fr-8)
WHEN transcript assistant text differs from `last_assistant_message` THEN the packet SHALL use the latter. Secrets, large outputs, full history, and irrelevant prompts SHALL be absent; truncation SHALL be explicit.

## AC-9 (FR-9): Result-confirmed per-commitment judgment
**FR:** [FR-9](FR.md#fr-9)
WHEN tools are successful, failed, or result-less THEN only successful result-confirmed IDs SHALL support completion. Any actionable commitment SHALL block despite completed siblings. Legitimate blocked/awaiting MAY approve without closure, and async alone SHALL not activate.

## AC-10 (FR-10): Conditional state and warning
**FR:** [FR-10](FR.md#fr-10)
WHEN active context needs judge and token is absent THEN warn without blocking; inactive SHALL stay silent. Same-revision retries SHALL be bounded; changed revision SHALL not be released by stale state.

## AC-11 (FR-11): Old arming paths are absent
**FR:** [FR-11](FR.md#fr-11)
WHEN gray, next-section, blocker, gate-meta, first-spec, works-done, not-found, verified, PASS/FAIL, «готово», or «дальше» signals appear without an authoritative source THEN they SHALL have no activation effect.

## AC-12 (FR-12): Shared parser and shipped clients
**FR:** [FR-12](FR.md#fr-12)
WHEN all collectors use one transcript THEN they SHALL consume one shared bounded event set. The deps-absent Claude bundle SHALL work. Codex SHALL use a proven adapter or explicit observable fail-open.
