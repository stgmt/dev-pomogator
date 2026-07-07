# Fixtures

## Overview

No persistent domain-data fixtures are required. This feature verifies metadata, manifest files, and local CLI behavior.

Temporary filesystem fixtures may be used by future integration tests to simulate a Codex marketplace root and plugin install boundary without mutating the user's real global Codex configuration.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Temp Codex marketplace root | factory | OS temp directory created by test harness | per-scenario | `tools/codex-plugin-support/verify-whitelist.ts` |
| F-2 | Sample whitelist manifest copy | snapshot | temp copy of `.codex-plugin/plugin.json` | per-scenario | BDD step definition |

## Fixture Details

### F-1: Temp Codex marketplace root

- **Type:** factory
- **Format:** directory tree
- **Setup:** test harness creates a temporary marketplace root and copies the candidate plugin files into it
- **Teardown:** test harness removes the temporary directory
- **Dependencies:** none
- **Used by:** @feature5 scenarios
- **Assumptions:** Codex CLI can be invoked in a way that points at the temporary marketplace or emits JSON for inspection

### F-2: Sample whitelist manifest copy

- **Type:** snapshot
- **Format:** JSON
- **Setup:** test harness copies the committed manifest into the temp root
- **Teardown:** removed with F-1
- **Dependencies:** F-1
- **Used by:** @feature4 and @feature5 scenarios
- **Assumptions:** The committed manifest is the source under review

## Dependencies Graph

```text
F-1 -> F-2
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|------------------|-----|
| @feature1 | Whitelist entry required before Codex support claim | none | Metadata-only check can read committed files. |
| @feature4 | Codex packaging uses Codex-native manifest paths | F-2 | Manifest schema details finalized in implementation. |
| @feature5 | Supported status requires real Codex verification | F-1, F-2 | Exact CLI invocation will be finalized with the harness. |

## Notes

Do not use the user's real `%USERPROFILE%\.codex\config.toml` as a fixture. If future tests need config state, generate a temporary Codex home/config boundary and record the command used.
