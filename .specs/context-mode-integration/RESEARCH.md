# Research

## Problem

`context-mode` is useful but fragile as a global Claude Code integration. The canonical issue #139 records two distinct failure classes: plugin config poisoning and mid-session stdio MCP death. The feature must make dev-pomogator install/repair behavior as safe as the existing claude-mem bootstrap/reaper while using context-mode's own scriptable Claude plugin CLI surface.

## Hypotheses

| H# | Statement | Status | Evidence |
|----|-----------|--------|----------|
| H1 | context-mode full plugin install cannot be executed non-interactively from a SessionStart shell hook via `/plugin`, but the Claude plugin CLI exposes a scriptable equivalent. | [VERIFIED] | #139/#84 context-mode consolidation plus local `claude plugin marketplace add --help` and `claude plugin install --help`. |
| H2 | The claude-mem reference pattern is the right safety model: fail-open, idempotent, builtins-only, opt-out/backoff, doctor evidence. | [VERIFIED] | `tools/claude-mem-bootstrap/install-claude-mem.ts:15-20`, `tools/claude-mem-health/health-check.ts:24-26`. |
| H3 | context-mode needs root-cause classification, not symptom restart advice. | [VERIFIED] | #139 distinguishes `CONFIG_POISONED` and `MCP_DEAD_IN_SESSION`; feedback memory requires root-cause-not-symptom. |
| H4 | Windows/worktree frictions must be encoded in docs/tests. | [VERIFIED] | #91: shell=bash, `ctx_execute_file` root confinement, compound shell prefix gotcha. |
| H5 | context-mode value should be stated narrowly. | [VERIFIED] | #91 A/B notes: parity for disciplined grep/pipe agents; value for large raw artifacts/session survival. |

## Existing Implementation Reference

| File | Verified Role |
|------|---------------|
| `tools/claude-mem-bootstrap/install-claude-mem.ts` | SessionStart bootstrap: explicit decisions, opt-out, installed detection, detached install, six-hour backoff, exit 0. |
| `tools/claude-mem-health/health-check.ts` | Health/reaper: probe, classify, surgical repair, fail-open contract, Windows-specific behavior. |
| `.Codex/hooks.json` | Registers claude-mem health and bootstrap as SessionStart hooks via `tools/_shared/bootstrap.cjs`. |
| `audit-reports/context-mode-canonical-issue-139.md` | Canonical context-mode runbook and requirement source derived from #84/#90/#91/#139. |

## Requirement Analysis

The user directive "устанавливается как claude-mem" means:

1. Same safety contract: SessionStart-safe, idempotent, fail-open, builtins-only, observable, opt-out/backoff.
2. Same operational surface: doctor can detect missing/broken state and give a concrete repair.
3. Same implementation quality: real-shaped fixtures, no hand-typed fantasy config shapes, and no symptom-only classification.
4. Different install mechanism: claude-mem runs a non-interactive `npx` installer; context-mode uses the non-interactive `claude plugin marketplace add` + `claude plugin install` CLI path, with slash-command instructions as fallback.

## Project Context & Constraints

### Existing Patterns & Extensions

- dev-pomogator ships Claude Code lifecycle hooks through `.Codex/hooks.json` for dogfood and `.claude-plugin/hooks.json` for canonical plugin distribution; hook changes must keep those surfaces aligned.
- Existing claude-mem reference code lives in `tools/claude-mem-bootstrap/install-claude-mem.ts` and `tools/claude-mem-health/health-check.ts`; context-mode should reuse the safety contract, not the exact install mechanism.
- Hook code shipped to users must be deps-absent safe: builtins-only or bundled, fail-open on missing runtime/dependencies, and no hard dependency on repo `node_modules`.

### Relevant Rules

- Docker/WSL BDD is the canonical test path for this repo; host BDD runs are forbidden by project rules.
- Fixtures must mirror real artifacts: `installed_plugins.json`, plugin manifest, Claude global settings, and process snapshots must preserve real key shapes.

### Architectural Constraints Summary

- Feedback memory requires root-cause classification before repair advice; config poisoning and live MCP death must not collapse into one restart instruction.
- External/upstream attribution must first check dev-pomogator-shipped components and issue #139, because this repo owns hooks, launchers, and doctor behavior around Claude Code.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hook blocks session startup | High | All hook paths exit 0, use timeouts, and suppress repeated output through backoff. |
| Doctor treats live MCP death as config poisoning | High | Separate evidence probes: registry, manifest command, live process, JSON-RPC handshake. |
| Hook redirects to dead ctx tools | High | Tool availability guard; fail open when tools are absent. |
| MCP-only config overwrites user settings | High | Atomic backup, merge-only write, preserve unrelated keys. |
| Tests use fake config shapes | Medium | Fixtures must mirror real `installed_plugins.json`, plugin manifest, and settings artifacts. |
| Value docs overpromise savings | Medium | Explicit value boundary in FR-9 and docs. |

## Verified CLI / Tool Notes

- `gh issue view` supports `--json`, `--jq`, `--comments`, and `--repo`; verified via `gh issue view --help`.
- `tools/specs-generator/scaffold-spec.ts --help` is not supported in this repo; spec creation was performed through MCP `create_spec`, which wraps the engine scaffold.
