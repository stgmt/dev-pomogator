# Research

## Контекст

CARL integration is a new dev-pomogator integration area: CARL rules/recall hooks must become a managed package path for dev-pomogator users, with Claude Code support first and Codex support sequenced after the Codex context-menu launcher path.

Current implementation baseline:

- [VERIFIED: local repo inventory command on 2026-07-07] The current repo has no `.carl/`, `.claude/hooks/carl-hook.py`, or `scripts/carl/` artifacts, so this spec starts from an implementation gap rather than extending tracked CARL code.
- [VERIFIED: local repo inventory command on 2026-07-07] The current repo has Codex artifacts at `.codex/config.toml`, `.codex/hooks.json`, and `.codex/agents/*.toml`; these are the current project-local Codex baseline.
- [VERIFIED: `codex-cli-support:FR-1`..`FR-5`] Existing specs already model Codex as a first-class platform with trusted project-local artifacts, existing artifact protection, version-aware hook capability checks, and deterministic hook orchestration.
- [VERIFIED: `context-menu:FR-8`..`FR-11`] Existing context-menu requirements already establish parallel Claude Code/Codex channels and Codex launch/trust handling; CARL Codex work should wait for that launcher path instead of inventing a parallel launcher.
- [VERIFIED: `pomogator-doctor:FR-3`, `FR-4`, `FR-11`, `FR-12`] Doctor already owns managed structure, hooks registry sync, version drift, and managed gitignore checks; CARL health/repair should extend that repair pattern.
- [VERIFIED: `dev-pomogator-canonical-plugin:FR-1`..`FR-6`] Canonical plugin layout, marketplace catalog, `/plugin install`, install scope, and `/reload-plugins` activation are already specified; CARL packaging must fit the canonical plugin distribution model.

User-provided context:

- [UNVERIFIED: user-provided context, not repo code] A CARL benchmark issue exists and should inform later research/reporting, but the current repo inventory does not verify its contents or implementation shape.

## Источники

- User task for `carl-integration` Discovery phase: intent, sequencing, doctor repair, hook warning behavior, and CARL benchmark issue context.
- [VERIFIED: `codex-cli-support:FR-1`..`FR-5`] Codex platform and hook constraints.
- [VERIFIED: `context-menu:FR-8`..`FR-11`] Parallel Claude/Codex context-menu channel constraints and Codex launcher dependency.
- [VERIFIED: `pomogator-doctor:FR-3`, `FR-4`, `FR-11`, `FR-12`] Doctor managed repair precedents.
- [VERIFIED: `dev-pomogator-canonical-plugin:FR-1`..`FR-6`] Canonical Claude Code plugin packaging and activation precedents.
- [VERIFIED: local repo inventory command on 2026-07-07] Current CARL artifacts are absent; current Codex artifacts are present.

## Технические находки

### CARL implementation gap

[VERIFIED: local repo inventory command on 2026-07-07] There is no current tracked `.carl/`, `.claude/hooks/carl-hook.py`, or `scripts/carl/` implementation to reuse directly. The implementation phase must therefore either create a new managed CARL package path or vendor/bridge real CARL artifacts after verifying their source, license, runtime, and expected output.

### Claude Code packaging path

[VERIFIED: `dev-pomogator-canonical-plugin:FR-1`..`FR-6`] dev-pomogator is distributed as a canonical Claude Code plugin with a defined plugin layout, marketplace catalog, install flow, install scopes, and activation via reload. CARL should be packaged as a managed plugin integration rather than as an undocumented local dotfile recipe.

[ASSUMED] Where supported, a normal dev-pomogator install/refresh should make CARL installable or active by default. This assumption must be checked against CARL's actual license/runtime requirements before implementation.

### Codex platform path

[VERIFIED: `codex-cli-support:FR-1`..`FR-5`] Codex integration must respect first-class platform status, project-local artifacts, existing artifact protection, version-aware hook capability checks, and deterministic hook orchestration.

[VERIFIED: `context-menu:FR-8`..`FR-11`] Codex CARL integration is sequenced after the context-menu Codex launcher/trust work. CARL must not introduce a second unmanaged Codex launch channel.

[UNVERIFIED] The exact Codex hook output contract for injecting agent-visible warnings/context still needs current Codex documentation or runtime verification.

### Doctor repair path

[VERIFIED: `pomogator-doctor:FR-3`, `FR-4`, `FR-11`, `FR-12`] Doctor already checks managed structure, hook registry sync, version matching, and managed gitignore blocks. CARL should add a doctor check that can classify states such as healthy, missing, stale, unsupported, broken dependency, and repairable drift.

[ASSUMED] Repair should be opt-in when it mutates project/user files, but the detection/report should always be visible when doctor runs.

### Hook failure visibility

[ASSUMED] CARL hooks should fail open so a broken recall/rule path does not block the main agent session.

[UNVERIFIED] The exact Claude Code and Codex mechanisms for injecting hook warnings into chat/agent-visible context must be verified before coding. The required behavior is clear: if CARL cannot run, the AI agent must see a warning reminding it to tell the user that CARL guidance was unavailable.

### CARL external details and benchmark issue

[VERIFIED: `tests/fixtures/carl/manifest.json`, `tests/fixtures/carl/smoke.stdout.txt`, `tests/fixtures/carl/bench.stdout.tsv`] Real CARL runtime evidence was captured on 2026-07-07 from sibling repo `E:/repos/presentation-reels`. The captured producer uses `.carl/carl.json`, `.claude/hooks/carl-hook.py`, `scripts/carl/smoke-carl-hooks.mjs`, and `scripts/carl/bench-carl-hooks.mjs`; the hook commands in that repo point Claude Code and Codex UserPromptSubmit events at `carl-hook.py` through PowerShell-spawned Python.

[VERIFIED: `tests/fixtures/carl/smoke.stdout.txt`] The real smoke run reports `CARL smoke OK`, `domains=116`, `neutral_chars=691`, Claude debug prompt loading `CORE__DONT_BLAME_INFRA_BEFORE_TRACING` and `CORE__REPRODUCE_NOT_THEORIZE`, and Codex debug prompt loading `CORE__REPRODUCE_NOT_THEORIZE`.

[VERIFIED: `tests/fixtures/carl/bench.stdout.tsv`] The real benchmark run reports `old_bulk_autoload_chars=683575`, `iterations=5`, and five rows (`neutral-continue`, `ru-debug-root-cause`, `render-legibility`, `feature-index`, `codex-ru-debug`) with p50/p95 timings, injected context chars, estimated tokens, thresholds, and loaded-domain summaries.

[NEEDS_CONFIRMATION: `tests/fixtures/carl/manifest.json`] The sibling CARL source artifacts were untracked in `presentation-reels` at capture time (`.carl/`, `.claude/hooks/carl-hook.py`, `.codex/`, `scripts/carl/`). This capture verifies real CARL producer shape and benchmark behavior, but dev-pomogator still needs an explicit source/vendor decision and plugin-distributed runtime proof before claiming CARL is implemented here.

[UNVERIFIED] CARL's final dev-pomogator packaging source, accepted license/source-of-truth, recall backend durability, and Claude Code/Codex warning transport remain implementation-phase research items.

## Где лежит реализация

- Current CARL implementation: none found in tracked repo inventory for `.carl/`, `.claude/hooks/carl-hook.py`, or `scripts/carl/` [VERIFIED: local repo inventory command on 2026-07-07].
- Current Codex baseline: `.codex/config.toml`, `.codex/hooks.json`, `.codex/agents/*.toml` [VERIFIED: local repo inventory command on 2026-07-07].
- Likely future installer/repair code: `tools/` and/or `.claude/skills/pomogator-doctor/` integration points [ASSUMED: exact file ownership deferred to Requirements/Design].
- Likely future plugin registration: `.claude-plugin/hooks.json` and canonical plugin package files [ASSUMED: exact CARL hook registration deferred to Requirements/Design].
- Likely future Codex registration: `.codex/hooks.json` dispatcher integration after context-menu/Codex launcher support [ASSUMED: capability check required before implementation].

## Выводы

1. CARL is currently not implemented in this repo, so the spec must define a new managed integration lifecycle: install, verify, repair, fail-open warning, and review.
2. Claude Code packaging should follow canonical plugin constraints; Codex packaging should follow the existing Codex project-local/version-aware dispatcher model.
3. `pomogator-doctor` is the right user-facing repair surface for CARL drift because it already owns managed structure, hook registry, version, and gitignore checks.
4. External CARL runtime shape and benchmark output are now partially verified by `tests/fixtures/carl/manifest.json`, `smoke.stdout.txt`, and `bench.stdout.tsv`; remaining unknowns are the accepted dev-pomogator source/vendor path, final packaging, warning transport, and plugin-distributed runtime proof.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| dead-integration-guard | `.claude/rules/testing/dead-integration-guard.md` | Installed artifacts are not enough; a runtime consumer and real e2e are required. | CARL hook/package distribution | CARL installer, hook runtime, doctor repair tests |
| verify-against-real-artifact | `.claude/rules/testing/verify-against-real-artifact.md` | Parser/hook fixtures must mirror real producer output. | CARL hook output and benchmark issue evidence | CARL research, BDD fixtures, doctor diagnostics |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Critical flows need real end-to-end checks, not only unit tests. | Install/doctor/hook flows | CARL verification plan |
| no-host-bdd-runs | `.claude/rules/pomogator/no-host-bdd-runs.md` | BDD verification must run through Docker, not host cucumber. | Later BDD scenarios | CARL scenario verification |
| spec-authoring-via-subskills | `.claude/rules/spec-authoring-via-subskills.md` | Form docs should be filled by sanctioned automators. | Discovery/Requirements/Tasks form docs | This Discovery fill uses MCP door + skip marker |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| Codex platform spec | `.specs/codex-cli-support/FR.md` | First-class Codex platform, project-local artifacts, version-aware hook capability, deterministic dispatcher. | CARL Codex path must use this model. |
| Context-menu spec | `.specs/context-menu/FR.md` | Parallel Claude/Codex channels and Codex launcher/trust handling. | CARL Codex work is sequenced after this launcher path. |
| Pomogator doctor spec | `.specs/pomogator-doctor/FR.md` | Managed structure, hook registry, version, and gitignore checks. | CARL repair should extend doctor checks. |
| Canonical plugin spec | `.specs/dev-pomogator-canonical-plugin/FR.md` | Canonical plugin layout, marketplace/install/activation constraints. | CARL Claude Code packaging must fit canonical plugin distribution. |
| Current Codex artifacts | `.codex/config.toml`, `.codex/hooks.json`, `.codex/agents/*.toml` | Existing project-local Codex configuration and agents. | Baseline for future Codex CARL dispatcher integration. |

### Architectural Constraints Summary

- CARL must not be documented as working until a real runtime consumer invokes it and an end-to-end check proves the managed hook path.
- CARL must preserve user-owned config and only mutate clearly managed blocks/artifacts.
- Codex CARL support is gated by the Codex launcher/hook capability path; unsupported Codex versions must receive honest unsupported status, not a fake install.
- Broken CARL must be visible to the agent/user as degraded mode and must not silently remove expected recall/rule context.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| External CARL file layout, hook contract, runtime dependencies, or benchmark issue details differ from assumptions. | High | High | Keep all CARL external details marked [UNVERIFIED] until later research verifies the real CARL source/docs/artifacts and captures real hook output. |
| CARL files are installed but never consumed by a real hook runtime, creating a dead integration. | Medium | High | Require a runtime consumer check plus an e2e scenario that forces the managed hook to execute and fail if the hook is not wired. |
| Broken CARL hook fails silently, causing the agent and user to trust a session that missed expected recall/rule context. | Medium | High | Implement fail-open warning injection into agent-visible context and test an induced failure path. |
| Doctor repair overwrites user-owned CARL or hook configuration. | Medium | High | Use managed markers/blocks, preserve unrelated config, and test repair against mixed managed/user-owned artifacts. |
| Codex hook capability or launcher sequencing is not ready when CARL work starts. | High | Medium | Gate Codex CARL tasks behind context-menu/Codex launcher completion and version-aware capability checks; keep Claude Code path independent. |
