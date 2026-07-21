# Design

## Реализуемые требования

- [FR-1](FR.md#fr-1-setup-decision-and-install-guidance) setup decision and install guidance
- [FR-2](FR.md#fr-2-mcp-only-auto-config) MCP-only auto config
- [FR-3](FR.md#fr-3-idempotency-backoff-and-opt-out) idempotency, backoff, and opt-out
- [FR-4](FR.md#fr-4-doctor-classification) doctor classification
- [FR-5](FR.md#fr-5-live-recovery-runbook) live recovery runbook
- [FR-6](FR.md#fr-6-hook-safe-degradation) hook safe degradation
- [FR-7](FR.md#fr-7-optional-force-ctx-policy) optional force-ctx policy
- [FR-8](FR.md#fr-8-windows-and-worktree-guidance) Windows/worktree guidance
- [FR-9](FR.md#fr-9-honest-value-boundary) honest value boundary

## Components

- `tools/context-mode-setup/` — new builtins-only setup/repair decision engine and SessionStart entrypoint.
- `tools/context-mode-health/` — new doctor probe helpers for registry, manifest, process, handshake, and hook-safety classification.
- `.agents/skills/pomogator-doctor/` or canonical doctor engine — add context-mode check row and remediation text.
- `.Codex/hooks.json` and plugin hook manifest — register SessionStart setup/health if implementation chooses hook deployment.
- `docs` or skill guidance surface — user-facing install/recovery/value boundary notes.
- `tests/step_definitions/feature_context_mode_integration.ts` — BDD step definitions using real-shaped fixtures.

## Где лежит реализация

- Reference bootstrap: `tools/claude-mem-bootstrap/install-claude-mem.ts`
- Reference health/reaper: `tools/claude-mem-health/health-check.ts`
- Reference hook registration: `.Codex/hooks.json`
- New implementation target: `tools/context-mode-setup/`, `tools/context-mode-health/`, doctor check files, and BDD steps.

## Algorithm

1. Setup hook resolves a single Claude home root and opt-out state.
2. It reads `installed_plugins.json` and optional MCP-only config evidence.
3. It returns one explicit proposed status [UNVERIFIED]: `PLUGIN_REGISTERED` [UNVERIFIED], `MCP_ONLY_CONFIGURED` [UNVERIFIED], `INSTALL_MISSING` [UNVERIFIED], `SKIP_OPTOUT` [UNVERIFIED], or `SKIP_BACKOFF` [UNVERIFIED].
4. It exits 0 in every branch. Missing install emits exact user instructions; MCP-only path edits settings only when explicitly selected by policy.
5. Doctor performs deeper probes: plugin registry, plugin manifest command, live process evidence, JSON-RPC handshake, and hook safety.
6. Doctor maps evidence to a root-cause status and prints a least-disruptive repair runbook.
7. Optional force-ctx hook checks tool availability first, then path class, then returns pass-through or CASE-A redirect.

## Data Contracts

See [context-mode-integration_SCHEMA.md](context-mode-integration_SCHEMA.md). Status and fixture constants in this spec are proposed implementation vocabulary unless marked with real-code evidence.

## Key Decisions

### Decision: Full install remains user-guided because `/plugin` is interactive

**Требование:** [FR-1](FR.md#fr-1-setup-decision-and-install-guidance)

**Rationale:** `/plugin` is an interactive Claude Code command. Treating it as a shell command would create a false-green installer and violate the claude-mem-style fail-open contract.

**Trade-off:** First full plugin install still needs a user action unless MCP-only mode is selected.

**Alternatives considered:**
- Shell out to `/plugin` — rejected because hooks cannot drive Claude Code slash-command UI.
- Skip setup entirely — rejected because users need exact install/recovery instructions and doctor visibility.

### Decision: MCP-only mode is a separate explicit path

**Требование:** [FR-2](FR.md#fr-2-mcp-only-auto-config)

**Rationale:** MCP-only can be safer for hook-sensitive setups because it avoids global context-mode advisory hooks while still exposing `ctx_*` tools.

**Trade-off:** MCP-only does not provide the full plugin slash-command/hook experience.

**Alternatives considered:**
- Always force full plugin install — rejected because it cannot be automated safely from SessionStart.
- Always configure MCP-only — rejected because it may surprise users who expected full plugin behavior.

### Decision: Setup state is explicit and retry-bounded

**Требование:** [FR-3](FR.md#fr-3-idempotency-backoff-and-opt-out)

**Rationale:** Hook execution must be boring: one home root, one explicit result, no repeated slow repair attempts, and exit 0 even when JSON or filesystem state is malformed.

**Trade-off:** A retry lock can delay recovery hints after a transient failure.

**Alternatives considered:**
- Retry on every SessionStart — rejected because it can turn a transient failure into repeated startup noise.
- Throw on malformed JSON — rejected because hook failures block the user for a recoverable config problem.

### Decision: Doctor classifies mechanisms, not symptoms

**Требование:** [FR-4](FR.md#fr-4-doctor-classification)

**Rationale:** #139 proves config poisoning and mid-session MCP death look similar to the user but require different repair paths.

**Trade-off:** Doctor needs more probes and fixtures than a simple manifest check.

**Alternatives considered:**
- Generic "restart Claude Code" warning — rejected because it hides the root cause and wastes session state.
- Only checking `installed_plugins.json` — rejected because it misses live MCP death.

### Decision: Live MCP death recovery is least-disruptive first

**Требование:** [FR-5](FR.md#fr-5-live-recovery-runbook)

**Rationale:** When registration is healthy but stdio MCP is dead, the right next move is heal plus `/mcp` reconnect and handshake verification before discarding the session.

**Trade-off:** The runbook is longer than a single restart instruction.

**Alternatives considered:**
- Always restart Claude Code — rejected because it loses useful session state before trying the targeted reconnect.
- Only run the heal script — rejected because config repair cannot respawn a dead live stdio child by itself.

### Decision: Hooks fail open when ctx tools are unavailable

**Требование:** [FR-6](FR.md#fr-6-hook-safe-degradation)

**Rationale:** A hook that redirects to dead `ctx_*` tools turns a recoverable crash into an interaction trap.

**Trade-off:** Some raw output may enter context while context-mode is down.

**Alternatives considered:**
- Keep denying and tell user to reconnect — rejected because the denied operation may be the only path to recovery.
- Disable hooks permanently after one failure — rejected because transient MCP reconnect should restore behavior.

### Decision: Force-ctx is optional, path-classed, and kill-switchable

**Требование:** [FR-7](FR.md#fr-7-optional-force-ctx-policy)

**Rationale:** context-mode helps most on large generated/data/log artifacts. Source, config, and active spec files often need exact bytes for edits, so a broad deny policy would break normal work.

**Trade-off:** Selective routing saves less context than a blanket redirect.

**Alternatives considered:**
- Redirect every read-like action to ctx tools — rejected because edit workflows and dead-MCP recovery need native reads.
- Never ship force-ctx guidance — rejected because large generated artifacts are a real value case when ctx tools are healthy.

### Decision: Windows/worktree gotchas are first-class output

**Требование:** [FR-8](FR.md#fr-8-windows-and-worktree-guidance)

**Rationale:** The known #91 frictions are deterministic and should be encoded once instead of rediscovered in every session.

**Trade-off:** Guidance becomes platform-specific and slightly longer.

**Alternatives considered:**
- Put gotchas only in issue comments — rejected because implementation agents and users need them at the point of failure.
- Hide worktree limitations — rejected because `ctx_execute_file` root confinement changes the correct tool choice.

### Decision: Value claims are bounded by measured workflow

**Требование:** [FR-9](FR.md#fr-9-honest-value-boundary)

**Rationale:** Existing measurements show context-mode is real but not universal savings for disciplined grep/pipe agents.

**Trade-off:** The feature sounds less magical.

**Alternatives considered:**
- Repeat upstream percentage claims — rejected because those often compare against naive raw-output baselines.
- Claim context-mode is useless — rejected because large raw artifacts and session survival remain valid value cases.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE [UNVERIFIED]
**TEST_FORMAT:** BDD [UNVERIFIED]
**Framework:** Cucumber.js
**Install Command:** already installed in repo BDD workflow
**Evidence:** Existing repo step definitions live under `tests/step_definitions/`; AGENTS.md mandates `npm test` through Docker/WSL for E2E BDD.
**Verdict:** Use real-shaped filesystem fixtures in temp homes; cleanup per scenario is required.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/step_definitions/*.ts` | step definitions | per feature | Existing BDD steps for specs | Yes, add a feature-specific file. |

### Новые step definitions

| Файл | Scope | Что делает | По аналогии с |
|------|-------|------------|---------------|
| `tests/step_definitions/feature_context_mode_integration.ts` | `@feature1`..`@feature9` | Binds executable CTXMODE scenarios to real-shaped fixtures, setup/doctor modules, hook-safety checks, and documentation assertions. | existing feature-specific step definition files |

### Cleanup Strategy

Each scenario creates an isolated temp home containing real-shaped `installed_plugins.json`, `.claude-plugin/plugin.json`, optional global settings, and fake process/handshake fixtures. The shared Cucumber temp-dir cleanup in `tests/hooks/before-after.ts` removes the temp root after the scenario; context-mode steps do not require a feature-specific hook tag.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| healthy plugin registry | `tests/fixtures/context-mode/installed_plugins.healthy.json` | `enabledPlugins["context-mode@context-mode"] === true` | shared |
| poisoned plugin registry | `tests/fixtures/context-mode/installed_plugins.poisoned.json` | plugin present but disabled/missing enabled flag | shared |
| malformed registry | `tests/fixtures/context-mode/installed_plugins.malformed.json` | verifies fail-open malformed JSON behavior | shared |
| plugin manifest | `tests/fixtures/context-mode/plugin.manifest.json` | MCP command points at `node start.mjs` | shared |
| dead MCP process snapshot | `tests/fixtures/context-mode/process.dead.json` | doctor classifies live MCP death | shared |
| hook payload unavailable | `tests/fixtures/context-mode/hook.ctx-unavailable.json` | hook classification when ctx tools are missing | shared |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `contextModeHome` | string | Given temp-home step | setup/doctor steps | Isolated fake Claude home |
| `doctorResult` | object | When doctor runs | Then assertions | Classification and remediation output |
| `hookResult` | object | When hook runs | Then assertions | Permission decision and message |
