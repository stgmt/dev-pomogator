# Design

## Implemented Requirements

- [FR-1: Beta opt-in gate](FR.md#fr-1-beta-opt-in-gate)
- [FR-2: Topology selection](FR.md#fr-2-topology-selection)
- [FR-3: Docker-first runtime](FR.md#fr-3-docker-first-runtime)
- [FR-4: Host headless fallback](FR.md#fr-4-host-headless-fallback)
- [FR-5: Peak Headroom configuration](FR.md#fr-5-peak-headroom-configuration)
- [FR-6: Verification and doctor](FR.md#fr-6-verification-and-doctor)
- [FR-7: Safe Claude settings management](FR.md#fr-7-safe-claude-settings-management)
- [FR-8: Honest savings reporting](FR.md#fr-8-honest-savings-reporting)
- [FR-9: Packaged skills and user docs](FR.md#fr-9-packaged-skills-and-user-docs)
- [FR-10: Regression coverage](FR.md#fr-10-regression-coverage)

## Components

### `tools/headroom-beta/`

New tool directory for installer and doctor logic.

Planned modules:

- `detect-runtime.ts`: Docker, WSL Docker, OS, Python, pipx, Node checks.
- `plan.ts`: Build an install plan from topology, runtime, and current state.
- `headroom-flags.ts`: Parse `headroom proxy --help` and produce supported
  flags.
- `claude-settings.ts`: Safe backup, atomic edit, rollback.
- `doctor.ts`: Read `/health`, `/stats`, logs, and topology config.
- `benchmark.ts`: Synthetic requests that prove compression counters move.

### `.claude/skills/headroom-beta/`

Skill with focused operations:

- install;
- doctor;
- dashboard;
- switch topology;
- rollback;
- uninstall.

### Docker runtime

Docker-first runtime should own:

- Headroom image built with required extras;
- optional sub2api service for `codex-sub2api`;
- persistent `headroom-data` volume;
- logs mounted for doctor;
- healthchecks.

The existing `stgmt/sub2api` fork should be consumed as an external dependency
or pinned image. dev-pomogator should not duplicate sub2api source.

### Host/headless runtime

Host fallback should use isolated Python tooling and OS autostart:

- Windows: Task Scheduler.
- Linux: user systemd service.
- macOS: LaunchAgent.

The fallback must produce the same config and doctor evidence shape as Docker.

## Key Decisions

### Decision: Keep Headroom beta opt-in

**Требование:** [FR-1](FR.md#fr-1-beta-opt-in-gate)

**Rationale:** Headroom changes the global Claude Code request path. A normal
dev-pomogator install must stay safe for users who did not ask for proxy routing.

### Decision: Model routing is a topology choice

**Требование:** [FR-2](FR.md#fr-2-topology-selection)

**Rationale:** Codex-sub2api and Anthropic-direct have different auth, billing,
model mapping, diagnostics, and failure modes. Mixing them makes errors opaque.

### Decision: Prefer Docker when available

**Требование:** [FR-3](FR.md#fr-3-docker-first-runtime)

**Rationale:** Docker gives reproducible Headroom extras, persistent volumes,
health checks, and clean sub2api composition without polluting host Python.

### Decision: Provide a host/headless fallback

**Требование:** [FR-4](FR.md#fr-4-host-headless-fallback)

**Rationale:** Some users lack Docker on host and WSL. Headroom can still run as
a local service if installed carefully with isolated Python tooling and
autostart.

### Decision: Derive Headroom flags from installed CLI help

**Требование:** [FR-5](FR.md#fr-5-peak-headroom-configuration)

**Rationale:** Issue #88 referenced `--code-aware`, but live Headroom 0.31.0 did
not expose that flag. The installer must use supported flags, not stale docs.

### Decision: Doctor owns proof, not the installer banner

**Требование:** [FR-6](FR.md#fr-6-verification-and-doctor)

**Rationale:** A service can be healthy while Token Savings is zero. Doctor must
read runtime stats and run a synthetic workload before claiming optimization.

### Decision: Treat Claude settings as critical global state

**Требование:** [FR-7](FR.md#fr-7-safe-claude-settings-management)

**Rationale:** Existing dev-pomogator users often have many hooks and plugins in
global Claude settings. Beta routing must preserve and roll back that state.

### Decision: Report savings by layer

**Требование:** [FR-8](FR.md#fr-8-honest-savings-reporting)

**Rationale:** Prefix-cache dollars, compression tokens, tool-search schema
deferral, and RTK/context-tool savings are different mechanisms. Combining them
would overstate Headroom proxy compression.

### Decision: Ship a dedicated Headroom beta skill

**Требование:** [FR-9](FR.md#fr-9-packaged-skills-and-user-docs)

**Rationale:** Existing `proxy-up` and `use-claude-subscription` skills are
Meridian-specific. Headroom needs separate language and diagnostics.

### Decision: Fixture the known failure modes

**Требование:** [FR-10](FR.md#fr-10-regression-coverage)

**Rationale:** The risk is operational drift: cache mode with zero savings,
unsupported flags, unsafe binds, and settings corruption. Fixtures make those
failures deterministic.

## Runtime Modes

### Codex-sub2api

Claude Code points to Headroom. Headroom forwards Anthropic-compatible traffic
to sub2api. sub2api maps Claude aliases to Codex/OpenAI models.

Required smoke evidence:

- Headroom `/health` upstream is healthy.
- sub2api `/health` is healthy.
- a tiny Claude Code or `/v1/messages` request reaches the expected model route.
- GPT-5.6 max effort remains `reasoning_effort=max` when selected.

### Anthropic-direct

Claude Code points to Headroom. Headroom forwards to Anthropic API behavior.

Required smoke evidence:

- Headroom `/health` is healthy.
- credentials are present but redacted in output.
- a tiny request succeeds or returns a clear auth/quota error.

## Savings Verification

Doctor must separate:

1. proxy compression token savings;
2. provider prefix-cache cost/tokens;
3. tool-search schema deferral;
4. RTK/context-tool filtering;
5. output-shaping estimates.

This prevents the dashboard's `Token Savings = 0` from being misread when prefix
cache savings are nonzero.

## Rollback

Rollback restores:

- Claude settings backup;
- prior dev-pomogator Headroom config;
- owned autostart unit;
- owned Docker compose profile state.

Rollback must not remove user-created Headroom installs that are outside
dev-pomogator ownership.

