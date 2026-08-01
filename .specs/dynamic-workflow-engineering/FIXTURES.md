# Fixtures

## Overview

Fixtures model policy contracts, trusted and forged invocation envelopes, clean plugin homes, and journal-shaped versions of the two supplied dogfood incidents. Journal fixtures preserve event structure and failure signatures but contain no user secrets or raw prompts.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Consumer contract matrix | static | `tests/fixtures/dynamic-workflow-engineering/consumer-contracts.json` | per-feature | policy step definitions |
| F-2 | Finite inventory incident journal | static | `tests/fixtures/dynamic-workflow-engineering/journals/incident-1.jsonl` | per-feature | monitor step definitions |
| F-3 | Partial useful review journal | static | `tests/fixtures/dynamic-workflow-engineering/journals/incident-2.jsonl` | per-feature | monitor step definitions |
| F-4 | Clean plugin home | factory | generated temporary directory | per-scenario | install step definitions |

## Fixture Details

### F-1: Consumer contract matrix

- **Type:** static file
- **Format:** JSON
- **Setup:** load valid, expired, forged-origin, forbidden-subtype, duplicate, oversized, and budget-exhausted cases
- **Teardown:** none
- **Dependencies:** none
- **Used by:** @feature1, @feature2, @feature4, @feature5, @feature11
- **Assumptions:** fixture schema equals the policy runtime schema

### F-2: Finite inventory incident journal

- **Type:** sanitized snapshot derived from the user-supplied incident shape
- **Format:** NDJSON
- **Setup:** copy to a scenario-local journal path
- **Teardown:** remove the scenario-local copy
- **Dependencies:** none
- **Used by:** @feature6, @feature7, @feature8, @feature10, @feature13
- **Assumptions:** exact supplied metrics remain product input until original trace provenance is attached

### F-3: Partial useful review journal

- **Type:** sanitized snapshot derived from the user-supplied incident shape
- **Format:** NDJSON
- **Setup:** copy to a scenario-local journal path
- **Teardown:** remove the scenario-local copy
- **Dependencies:** none
- **Used by:** @feature7, @feature8, @feature9, @feature10, @feature13
- **Assumptions:** includes completed findings, exhausted branch, physical retries, and missing synthesis input

### F-4: Clean plugin home

- **Type:** factory
- **Format:** directory plus environment
- **Setup:** create isolated HOME/config/cache and install the canonical local marketplace plugin
- **Teardown:** stop task-owned processes and remove only the generated home
- **Dependencies:** packaged plugin artifact
- **Used by:** @feature3, @feature11, @feature12
- **Assumptions:** repository node_modules is hidden and assets resolve via CLAUDE_PLUGIN_ROOT

## Dependencies Graph

`F-1 → policy scenarios`

`F-2 + F-3 → monitor, circuit, synthesis, and resume scenarios`

`packaged plugin → F-4 → install and real-host scenarios`

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1-2 | admission and denial | F-1 | real-host native event remains mandatory |
| @feature3 | installed skill and steering | F-4 | none after canonical install passes |
| @feature4-6 | bounds and circuit | F-1, F-2 | none |
| @feature7-10 | monitor, partial result, verification, resume | F-2, F-3 | original incident provenance remains external evidence |
| @feature11-12 | fail-closed audit and tier | F-1, F-4 | host capability may yield a lower tier |
| @feature13 | dogfood regression | F-2, F-3 | preserve USER_ASSERTION_ONLY provenance |

## Notes

Fixtures must mirror real policy schema and current workflow journal fields. Hand-authored extra fields cannot serve as positive proof. Before DONE, capture one actual current-runtime journal and compare parsed ground truth independently.
