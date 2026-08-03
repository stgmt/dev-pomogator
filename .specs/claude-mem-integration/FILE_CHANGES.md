# File Changes

| Path | Action | Scope |
|---|---|---|
| `tools/claude-mem-bootstrap/install-claude-mem.ts` | edit | Pure decision, exact non-interactive launch, atomic backoff, provenance, and fail-open entrypoint (FR-1..FR-4). |
| `tools/claude-mem-bootstrap/claude-mem-state.ts` | create | Canonical effective-home, installed evidence, config, port, and version resolver (FR-1, FR-3, FR-5, FR-6). |
| `tools/claude-mem-health/health-check.ts` | edit | Bounded worker health, cancellation, pure reaper decision, and Windows-only surgical cleanup (FR-4, FR-7). |
| `.claude-plugin/hooks.json` | edit | Canonical SessionStart and supported PreToolUse hook registrations using `CLAUDE_PLUGIN_ROOT`. |
| `.claude/settings.json` | edit | Repository dogfood lifecycle registration parity. |
| `.codex/hooks.json` | edit | Explicit lifecycle registration or documented platform-event limitation. |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/claude-mem-plugin.ts` | edit | `C-CMEM` uses canonical installed-state resolver (FR-5). |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/claude-mem-worker.ts` | edit | `C-CMEM-W` differentiates config, port, version, and worker health (FR-5, FR-7). |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/mcp-parse.ts` | edit | Merge project config with global `~/.claude.json` (FR-6). |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` | edit | Register centralized claude-mem diagnostics. |
| `.claude/skills/pomogator-doctor/SKILL.md` | edit | Document `C-CMEM` and `C-CMEM-W` outcomes/remediation. |
| `Dockerfile.test.base` | edit | Preserve offline default rail; allow explicitly selected real-install dependencies only. |
| `cucumber.docker.json` | edit | Separate offline default and explicit network-enabled real-install profile. |
| `tests/features/claude-mem-e2e.feature` | edit | Real-install opt-in, isolated-home, provenance, manifest/MCP/worker/version assertions. |
| `tests/features/core/CORE019_claude-mem-integration.feature` | edit | Migrate stale installer-era contracts to current bootstrap behavior. |
| `tests/features/plugins/suggest-rules/PLUGIN002_claude-mem.feature` | edit | Remove stale Chroma endpoint assumptions. |
| `tests/step_definitions/feature_claude_mem_bootstrap.ts` | edit | Offline decision, exact-launch, home-resolution, doctor, and global-MCP BDD seams. |
| `tests/step_definitions/feature_claude_mem_e2e.ts` | edit | Explicit real-install verification against real manifest/MCP/worker/version artifact. |
| `tests/step_definitions/feature_claude_mem_reaper.ts` | edit | Bounded timeout, hook matrix, platform boundary, and selective reaper BDD. |
| `tests/fixtures/claude-mem-bootstrap/record-launcher.cjs` | edit | Record exact command, environment, version policy, and outcome without network. |
| `tests/fixtures/claude-mem/black-hole-worker.cjs` | create | Local TCP accept-without-response fixture for cancellation proof. |
| `tests/fixtures/claude-mem/responsive-worker.cjs` | create | Local positive-control fixture with expected health envelope. |
| `external/upstream-claude-mem-session-init-client` | create | Upstream PR artifact: deadline, AbortSignal cleanup, and no-context fail-open for #92/#93. |
| `external/upstream-claude-mem-session-init-tests` | create | Upstream TDD artifact: responsive, refused, non-200, black-hole, config, and leaked-handle cases. |

- ACCEPTANCE_CRITERIA.md: add AC-2.1 (FR-2)

| `tools/claude-mem-bootstrap/install-claude-mem.ts` | edit | [FR-2](FR.md#fr-2-non-interactive-install-command-feature2) — detached spawn errors stay fail-open and migration uses active-route credential precedence. |
| `tests/step_definitions/feature_claude_mem_bootstrap.ts` | edit | [FR-2](FR.md#fr-2-non-interactive-install-command-feature2) — real launcher/migration and spawn-error regression for AC-2.1. |
