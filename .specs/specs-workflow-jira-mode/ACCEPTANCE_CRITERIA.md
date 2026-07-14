# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-jirasourcemd-presence-triggers-jirasourcepreserved-tracing-checks-feature100)

WHEN {событие} THEN {система} SHALL {действие}.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-jira-imperative-trace-in-frmd-section-suppresses-the-jirasourcepreserved-warning-for-that-section-feature101)

IF {условие} THEN {система} SHALL {действие}.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-absence-of-jirasourcemd-makes-jirasourcepreserved-rule-a-no-op-feature102)

WHEN {событие} AND {условие} THEN {система} SHALL {действие}.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-ac-sections-without-jira-acceptance-or-evidence-emit-jirasourcepreserved-warning-feature103)

WHEN {событие} THEN {система} SHALL {действие}.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-feature-scenarios-without-jira-trace-comment-emit-jirasourcepreserved-warning-feature104)

IF {условие} THEN {система} SHALL {действие}.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-checkjiradrift-detects-cache-vs-live-state-divergence-and-fail-opens-when-mcp-unavailable-feature105)

WHEN Jira cache is absent or live Jira cannot be reached THEN drift checking SHALL fail open with no blocking findings.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-jira-mode-template-files-are-distributed-with-the-spec-generator-feature106)

WHEN canonical plugin packaging is inspected THEN Jira-mode templates SHALL be present in the exported create-spec skill folder and the cache schema SHALL remain in specs-generator templates.

