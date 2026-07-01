# Tasks

> v2: SessionStart bootstrap hook + doctor detection. Each task: `**Done When:**` with ≥1 checkbox, Status, Est.

## Phase 1: Bootstrap hook (Green)

- [x] Bootstrap hook with pure decision + non-interactive install + idempotency + fail-open -- @feature1 -- @feature2 -- @feature3 -- @feature4 — Status: DONE | Est: 90m
  _Requirements: [FR-1](FR.md#fr-1-bootstrap-decision-feature1), [FR-2](FR.md#fr-2-non-interactive-install-command-feature2), [FR-3](FR.md#fr-3-idempotency-and-backoff-feature3), [FR-4](FR.md#fr-4-fail-open-builtins-only-feature4)_
  **Done When:**
  - [x] `tools/claude-mem-bootstrap/install-claude-mem.ts` exists and is builtins-only
  - [x] @feature1 @feature2 @feature3 @feature4 scenarios pass
- [x] Register the hook in both manifests -- @feature3 — Status: DONE | Est: 15m
  _Requirements: [FR-3](FR.md#fr-3-idempotency-and-backoff-feature3)_
  **Done When:**
  - [x] hook present in `.claude-plugin/hooks.json` and `.claude/settings.json`
  - [x] registry-parity check is green

## Phase 2: Doctor (Green)

- [x] New doctor check C-CMEM (claude-mem installed?) -- @feature5 — Status: DONE | Est: 30m
  _Requirements: [FR-5](FR.md#fr-5-doctor-detection-feature5)_
  **Done When:**
  - [x] `claude-mem-plugin.ts` registered in `checks/index.ts`
  - [x] @feature5 scenarios pass (warning absent / ok present)
- [x] Fix doctor C11 to read the canonical `~/.claude.json` -- @feature6 — Status: DONE | Est: 15m
  _Requirements: [FR-6](FR.md#fr-6-doctor-reads-the-canonical-global-mcp-config-feature6)_
  **Done When:**
  - [x] `mcp-parse.ts` reads `~/.claude.json`
  - [x] @feature6 scenario passes

## Phase 3: BDD (Green)

- [x] Author the feature + step-defs + fixture driving real code -- @feature1 -- @feature5 — Status: DONE | Est: 60m
  _Requirements: [FR-1](FR.md#fr-1-bootstrap-decision-feature1), [FR-5](FR.md#fr-5-doctor-detection-feature5)_
  **Done When:**
  - [x] `tests/step_definitions/feature_claude_mem_bootstrap.ts` drives the real hook + checks
  - [x] CMEM001 scenarios green (local 11/11; Docker suite)
