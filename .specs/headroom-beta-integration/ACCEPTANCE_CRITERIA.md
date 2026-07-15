# Acceptance Criteria

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-beta-opt-in-gate)

WHEN dev-pomogator is installed normally THEN Headroom beta SHALL remain
disabled unless the user explicitly opts in.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-topology-selection)

WHEN the beta installer runs THEN it SHALL require exactly one topology value:
`codex-sub2api` or `anthropic-direct`.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-docker-first-runtime)

IF Docker is reachable on host or WSL THEN the installer SHALL generate and
start the Docker runtime profile and SHALL verify Headroom `/health` before
editing Claude Code routing.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-host-headless-fallback)

IF Docker is not reachable THEN the installer SHALL offer a host/headless
fallback and SHALL verify the created autostart unit before reporting success.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-peak-headroom-configuration)

WHEN Headroom is installed in optimization profile THEN `/stats.summary.mode`
SHALL report `token`, and a synthetic compressible workload SHALL make either
`tokens.proxy_compression_saved` or an equivalent compression counter increase.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-verification-and-doctor)

WHEN the user runs Headroom beta doctor THEN the report SHALL include health,
mode, topology, compression savings, prefix-cache savings, tool-search/RTK
savings, and last smoke-test evidence.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-safe-claude-settings-management)

WHEN Claude Code settings are mutated THEN a timestamped backup SHALL exist,
unknown JSON keys SHALL be preserved, and rollback SHALL restore the prior file.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-honest-savings-reporting)

WHEN Token Savings is zero THEN the doctor SHALL explain the specific observed
reason, such as cache mode, no compressible traffic, unsupported compression
dependencies, or a failed synthetic workload.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-packaged-skills-and-user-docs)

WHEN the plugin manifest is inspected THEN Headroom beta skills/commands SHALL
be packaged and discoverable without replacing existing Meridian proxy skills.

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-regression-coverage)

WHEN the regression suite runs THEN it SHALL cover the failure classes listed in
FR-10 with deterministic fixtures or isolated integration tests.
