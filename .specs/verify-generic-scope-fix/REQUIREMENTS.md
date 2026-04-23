# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-skill-workflow--mechanical-reach-analysis-per-variant) | Skill workflow — mechanical reach analysis | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-pretooluse-hook--block-commit-without-fresh-verification) | PreToolUse hook — block without fresh verification | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature1 | Draft |
| [FR-3](FR.md#fr-3-escape-hatch-with-audit-trail) | Escape hatch + audit trail | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-docstest-dampening--anti-over-application) | Docs/test dampening (anti-over-application) | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl) | Marker invalidation (diff-hash + TTL) | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature2 | Draft |
| [FR-6](FR.md#fr-6-weighted-suspicionscore-heuristic) | Weighted suspicionScore heuristic | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature1 | Draft |
| [FR-7](FR.md#fr-7-fail-loud-on-unreachable-variant--explicit-counter-h3) | Fail-loud on unreachable variant | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature1 | Draft |
| [FR-8](FR.md#fr-8-skill-frontmatter--disable-model-invocation-pattern) | Skill frontmatter disable-model-invocation | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature5 | Draft |
| [FR-9](FR.md#fr-9-integration-with-dev-pomogator-extension-system) | dev-pomogator extension integration | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature5 | Draft |

## User Story → FR mapping

| User Story | Linked FR | Linked UC |
|------------|-----------|-----------|
| [US-1: agent protected from no-op scope expansion](USER_STORIES.md#us-1-claude-code-agent-zashchishchyon-ot-no-op-scope-expansion-feature1-feature2) | FR-1, FR-2, FR-5, FR-6, FR-7 | UC-1, UC-3, UC-4 |
| [US-2: reviewer sees auditable escape hatch](USER_STORIES.md#us-2-reviewer-vidit-auditable-escape-hatch-feature3) | FR-3 | UC-5 |
| [US-3: agent not blocked on trivial diffs](USER_STORIES.md#us-3-agent-ne-blokiruyetsya-na-trivialnykh-diff-akh-feature4) | FR-4 | UC-2 |
| [US-4: maintainer protected from self-invocation H2](USER_STORIES.md#us-4-maintainer-zashchishchyon-ot-self-invocation-h2-patterna-feature5) | FR-8, FR-9 | (integration) |

## Use Case → FR mapping

| Use Case | Linked FR |
|----------|-----------|
| [UC-1: Happy path](USE_CASES.md#uc-1-happy-path--agent-verifies-enum-expansion-commit-proceeds-feature1) | FR-1, FR-2, FR-5 |
| [UC-2: Docs-only diff](USE_CASES.md#uc-2-docs-only-diff--zero-friction-feature4) | FR-4 |
| [UC-3: Missing verification](USE_CASES.md#uc-3-missing-verification--stocktaking-like-incident-blocked-feature1) | FR-2, FR-6 |
| [UC-4: Stale marker](USE_CASES.md#uc-4-stale-marker--agent-changed-diff-after-verification-feature2) | FR-5 |
| [UC-5: Escape hatch](USE_CASES.md#uc-5-escape-hatch--legitimate-bypass-with-audit-trail-feature3) | FR-3 |

## Functional Requirements

- [FR-1: Skill workflow — mechanical reach analysis per variant](FR.md#fr-1-skill-workflow--mechanical-reach-analysis-per-variant)
- [FR-2: PreToolUse hook — block commit without fresh verification](FR.md#fr-2-pretooluse-hook--block-commit-without-fresh-verification)
- [FR-3: Escape hatch with audit trail](FR.md#fr-3-escape-hatch-with-audit-trail)
- [FR-4: Docs/test dampening — anti-over-application](FR.md#fr-4-docstest-dampening--anti-over-application)
- [FR-5: Marker invalidation — diff-hash pin + TTL](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl)
- [FR-6: Weighted suspicionScore heuristic](FR.md#fr-6-weighted-suspicionscore-heuristic)
- [FR-7: Fail-loud on unreachable variant](FR.md#fr-7-fail-loud-on-unreachable-variant--explicit-counter-h3)
- [FR-8: Skill frontmatter — disable-model-invocation pattern](FR.md#fr-8-skill-frontmatter--disable-model-invocation-pattern)
- [FR-9: Integration with dev-pomogator extension system](FR.md#fr-9-integration-with-dev-pomogator-extension-system)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — P-1..P-4 (hook <500ms, scoreDiff <50ms, GC <100ms, skill unbounded)
- [Security](NFR.md#security) — S-1..S-5 (reason ≥8ch, path traversal, session scoping, append-only audit, no secret logging)
- [Reliability](NFR.md#reliability) — R-1..R-5 (fail-open, no-git safety, atomic write, corrupt marker resilience, TTL always enforced)
- [Usability](NFR.md#usability) — U-1..U-5 (deny ≤1000ch actionable, structured skill output, zero friction on TN, escape hatch docs, install-time opt-in)

## Acceptance Criteria

- [AC-1 (FR-1): Skill workflow execution + marker write](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)
- [AC-2 (FR-2): Hook deny semantics + fail-open conditions](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature1)
- [AC-3 (FR-3): Escape hatch match + audit log append](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature3)
- [AC-4 (FR-4): Docs-only short-circuit + mixed dampening](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature4)
- [AC-5 (FR-5): Marker invalidation conditions + GC](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature2)
- [AC-6 (FR-6): scoreDiff computation rules](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature1)
- [AC-7 (FR-7): Unreachable variant → should_ship: false semantics](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature1)
- [AC-8 (FR-8): SKILL.md frontmatter schema](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-feature5)
- [AC-9 (FR-9): extension.json schema + installer copy paths](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-feature5)
