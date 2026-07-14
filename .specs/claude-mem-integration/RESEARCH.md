# Research

## Problem

Поддержка claude-mem сейчас распределена между bootstrap installer, двумя независимыми installed-state detector, worker health/reaper, doctor, тремя hook registries, Docker base build, opt-in real installer test и legacy BDD. Основная спека описывает только часть текущего v2 поведения, а отдельная GREEN reaper-спека закрывает локальную Windows mitigation #75. Issues #92/#93 фиксируют оставшийся upstream defect: `session-init` может ждать недоступный worker до внешнего 60-секундного hook timeout.

## Current Production Flow

| Stage | Implementation | Verified behavior |
|---|---|---|
| Install decision | `tools/claude-mem-bootstrap/install-claude-mem.ts` | opt-out → installed → 6h backoff → install |
| Installer command | same | `npx -y claude-mem install --ide claude-code --provider claude --model claude-haiku-4-5-20251001 --runtime worker`; Windows via `cmd /c`; detached, no TTY |
| Installed detection | bootstrap + doctor copy | manifest `claude-mem@*`, then `.worker.pid` or `claude-mem.db` fallback |
| Worker config | `~/.claude-mem/settings.json` | default port 37777; `CLAUDE_MEM_WORKER_PORT` override |
| Health/reaper | `tools/claude-mem-health/health-check.ts` | `/api/health`, 1.5s timeout, Windows orphan signature, SessionStart + debounced PreToolUse, fail-open |
| Doctor | `C-CMEM`, `C-CMEM-W`, `C11` | plugin presence, worker health/failure counter, canonical global `~/.claude.json` parse |
| Distribution | `.claude-plugin/hooks.json` | SessionStart reaper/bootstrap and PreToolUse reaper via `CLAUDE_PLUGIN_ROOT` |
| Dogfood/Codex | `.claude/settings.json`, `.codex/hooks.json` | Claude dogfood mirrors all hooks; Codex lacks PreToolUse reaper without an explicit contract |
| Docker | `Dockerfile.test.base` | clones/builds moving upstream source cache; not proof of registered installed artifact |
| Real install E2E | `tests/features/claude-mem-e2e.feature` | opt-in, network-dependent, isolated HOME/USERPROFILE, manifest/detection proof |

## Verified Findings

### F-1: Installation is real but version policy is not centralized

Bootstrap invokes a real upstream installer but uses unpinned `npx -y claude-mem`. Comments refer to an older verified version while live environments and upstream can move independently. A central spec must define exact supported/pinned artifact provenance and update semantics.

### F-2: Installed-state detection is duplicated

Bootstrap and `pomogator-doctor` independently inspect the same manifest/PID/DB artifacts. The doctor says it mirrors bootstrap, but no shared implementation enforces parity. A central resolver must distinguish registered plugin, residual runtime artifacts, healthy worker, and incompatible version.

### F-3: Post-install ownership is underspecified

The upstream installer owns plugin/MCP registration, while dev-pomogator owns invocation and verification. Current bootstrap detection does not prove MCP/config/worker readiness. The central contract must verify outputs without reimplementing upstream installation.

### F-4: Docker proof is split and incomplete

Default Docker BDD covers deterministic reaper decisions and hook registration, not actual installation or worker lifecycle. The real installer scenario is separate and network-dependent. Docker base cloning/building upstream source is not equivalent to installing and registering the plugin in runtime HOME.

### F-5: Legacy feature contracts drifted

`CORE019_claude-mem-integration.feature` and `PLUGIN002_claude-mem.feature` contain old MCP/Chroma and `/health`/`/api/readiness` assumptions. Current production health uses `/api/health` on the worker port and the local reaper explicitly replaces the old Chroma:8000 architecture check.

### F-6: #75 local mitigation is already implemented

`.specs/claude-mem-midsession-reaper/` is GREEN with six Docker-passed scenarios. It remains a bounded sub-spec for surgical Windows recovery. Its task/status trace must be reconciled, but its requirements must not be copied into the main upstream-timeout work.

### F-7: #92/#93 root cause is worker availability

Measured context injection is fast when worker is healthy. The 60-second sink occurs during worker unavailability/version recycle/fixed-port wedge. Store size, credential warnings and Chroma search latency are not the root cause. The upstream correction is a hook-internal worker request deadline with no-context fail-open.

## Target Ownership Model

`.specs/claude-mem-integration/` becomes the single ownership spec for:

1. supported/pinned claude-mem artifact and non-interactive install command;
2. HOME/USERPROFILE resolution, opt-out and backoff;
3. shared installed-state/config/version resolver;
4. upstream-owned plugin/MCP registration plus downstream post-install verification;
5. worker settings, health and doctor semantics;
6. canonical/dogfood/Codex hook matrix;
7. deterministic default Docker BDD and explicit real-install profile;
8. Linux/Docker and Windows/WSL variants;
9. bounded upstream `session-init` fail-open contract for #92/#93;
10. cross-spec dependency on GREEN `claude-mem-midsession-reaper` for #75.

## PoC Evidence Contract

Before STOP #1, the spec must retain reproducible evidence for:

- exact installer `--help` and pinned package/version/revision;
- responsive worker real hook command output;
- refused and black-hole worker elapsed time/output;
- post-install manifest/settings/MCP/worker artifacts in isolated HOME;
- default Docker offline fixture and network real-install profile boundaries;
- Windows process snapshot provenance for reaper safety.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Moving unpinned upstream package changes flags or hook behavior | High | High | Pin exact supported version/revision; verify installer help and real installed entrypoint in Docker |
| Shared detector migration changes existing fallback semantics | Medium | High | First add parity BDD over manifest, PID, DB, stale and corrupted states; then refactor bootstrap and doctor to one resolver |
| Mock-only Docker test passes while real hook is disabled | High | High | Require positive responsive-worker control and assert actual installed manifest entrypoint/version before black-hole test |
| Network-dependent real install makes default suite flaky | High | Medium | Keep deterministic offline lifecycle scenarios in default profile and separate explicit network profile with provenance/time budget |
| Reaper kills unrelated process on port 37777 | Low | High | Preserve Windows-only dead-owner + claude-mem signature predicate and record-only kill seam tests |
| Legacy CORE019/PLUGIN002 scenarios silently disappear | Medium | Medium | Build source-to-executable scenario matrix; migrate current use cases and explicitly retire stale endpoint/Chroma assumptions |
| Upstream PR is merged but not released or downstream still installs latest | Medium | High | Keep #93 open until exact released artifact is pinned and supply-chain BDD passes |
| Codex lacks an equivalent PreToolUse event | Medium | Low | Document hook matrix explicitly and test intentional platform divergence instead of pretending parity |

## Sources

- Bootstrap install and detection: `tools/claude-mem-bootstrap/install-claude-mem.ts`.
- Worker health/reaper: `tools/claude-mem-health/health-check.ts`.
- Doctor detection/health: `.claude/skills/pomogator-doctor/scripts/engine/checks/claude-mem-plugin.ts`, `claude-mem-worker.ts`, `mcp-parse.ts`.
- Hook distribution: `.claude-plugin/hooks.json`, `.claude/settings.json`, `.codex/hooks.json`.
- Docker/real install: `Dockerfile.test.base`, `cucumber.docker.json`, `tests/features/claude-mem-e2e.feature`, `tests/step_definitions/feature_claude_mem_e2e.ts`.
- Legacy contracts: `tests/features/core/CORE019_claude-mem-integration.feature`, `tests/features/plugins/suggest-rules/PLUGIN002_claude-mem.feature`.
- Issue evidence: GitHub #75, #92, #93 and `tools/claude-mem-health/TASK-pin-hook-timeout-cause-20260707.md`.
