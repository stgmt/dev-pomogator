# File Changes

| File | Change | Requirement | Contract |
|---|---|---|---|
| `tools/spec-mcp-server/scripts/spec-door.ts` | Modify | [FR-20](FR.md#fr-20-opt-in-batched-spec-door-transaction-for-run-tests-feature20) | Add the spec-door MCP transaction operation: validate every ordered dispatch command before executing any, reject invalid batches atomically, and return a transaction id with one outcome per command. |
| `.claude/skills/run-tests/SKILL.md` | Modify | [FR-20](FR.md#fr-20-opt-in-batched-spec-door-transaction-for-run-tests-feature20) | Define explicit `--batch` invocation, default single-command behavior when absent, dispatch-only input, displayed transaction summary, and endpoint-unavailable error without partial fallback. |
| `.claude-plugin/hooks.json` | No change | [FR-20](FR.md#fr-20-opt-in-batched-spec-door-transaction-for-run-tests-feature20) | Batch behavior is an explicit skill-to-MCP request and introduces no hook or guard registration. |
| `.specs/tui-test-runner/tui-test-runner.feature` | Modify | [FR-20](FR.md#fr-20-opt-in-batched-spec-door-transaction-for-run-tests-feature20) | Add WRAP002_01–WRAP002_06 scenarios covering default-off behavior, ordering, atomic rejection, complete outcomes, unavailable endpoint, and validation preservation. |
