# Design

## Implemented Requirements

- [FR-1: Init](FR.md#fr-1-init)
- [FR-2: Parallel Claude Code and Codex Channels](FR.md#fr-2-parallel-claude-code-and-codex-channels)
- [FR-3: Context Menu as First Whitelisted Codex Plugin Surface](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface)
- [FR-4: Codex-Native Packaging Contract](FR.md#fr-4-codex-native-packaging-contract)
- [FR-5: Real Codex CLI Verification Gate](FR.md#fr-5-real-codex-cli-verification-gate)
- [FR-6: Stale Claim Rejection](FR.md#fr-6-stale-claim-rejection)

## Components

- Codex whitelist spec artifacts: this `.specs/codex-init/` directory defines the support gate.
- Codex marketplace metadata: `.agents/plugins/marketplace.json` will list supported Codex plugin entries.
- Codex plugin manifest: `.codex-plugin/plugin.json` will describe the dev-pomogator Codex plugin bundle.
- Existing Claude plugin metadata: `.Codex-plugin/` remains a sibling channel until separately deprecated.
- First whitelisted feature implementation: `tools/context-menu/postinstall.ts` and launch scripts under `scripts/`.
- Verification layer: BDD scenarios plus integration checks around `codex plugin` behavior.

## Where Implementation Lives

- Whitelist spec: `.specs/codex-init/`
- First feature spec: `.specs/context-menu/`
- Codex plugin files: `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`
- Context-menu code: `tools/context-menu/postinstall.ts`
- Launch scripts: planned `scripts/launch-Codex-tui.ps1`, existing `scripts/launch-claude-tui.ps1`
- Doctor checks: `.agents/skills/pomogator-doctor/scripts/engine/checks/context-menu.ts`

## Algorithm

1. Research the real Codex plugin contract from official docs, local CLI output, and local plugin cache examples.
2. Add a whitelist entry only when the feature has Codex manifest, marketplace, runtime, and verification evidence.
3. Keep existing Claude Code artifacts as a separate channel.
4. For the first entry, route feature-specific launcher details to `.specs/context-menu/`.
5. Verify support status through real Codex CLI behavior or an integration harness that exercises the same command surface.

## API

No network/API endpoint is introduced by this feature. The integration surface is local CLI and filesystem state:

- `codex plugin marketplace list`
- `codex plugin add <plugin>@<marketplace>`
- `codex plugin list --json`
- Codex-facing manifest files in `.codex-plugin/` and `.agents/plugins/`

## Key Decisions

### Decision: Use a whitelist instead of blanket Codex plugin migration

**Требование:** [FR-1](FR.md#fr-1-init)

**Rationale:** The repo contains historical Claude-oriented plugin claims and stale Codex assumptions. A whitelist forces each Codex-supported surface to carry evidence.

**Trade-off:** Support expands more slowly because each plugin surface needs explicit research and verification.

**Alternatives considered:**
- Rename Claude plugin metadata to Codex metadata everywhere — rejected because it risks breaking existing Claude users and would hide behavior differences.
- Treat all Claude plugin surfaces as Codex-compatible — rejected because Codex manifest paths, hook trust, and CLI commands differ.

### Decision: Make context-menu the first whitelist entry

**Требование:** [FR-2](FR.md#fr-2-parallel-claude-code-and-codex-channels)

**Rationale:** The user specifically requested context-menu support, and the feature already has a spec, installer, launch scripts, and doctor drift checks.

**Trade-off:** The whitelist initially covers only one feature and does not solve all plugin distribution drift in the repo.

**Alternatives considered:**
- Start with the full dev-pomogator plugin bundle — rejected because the blast radius is too large for the first Codex support gate.
- Start with a synthetic sample plugin — rejected because it would not address the user's immediate right-click launch workflow.

### Decision: Keep context-menu behavior owned by the sibling context-menu spec

**Требование:** [FR-3](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface)

**Rationale:** `codex-init` owns the whitelist and support-status gate, while `.specs/context-menu/` already owns Nilesoft, launch scripts, privilege, logging, and trust behavior.

**Trade-off:** Two specs must stay linked: this spec gates support status, and the sibling spec owns detailed launcher behavior.

**Alternatives considered:**
- Move all context-menu launcher requirements into `codex-init` — rejected because it would duplicate and fork the existing context-menu spec.
- Keep only context-menu changes without a whitelist spec — rejected because Codex plugin support needs a repeatable support gate for future plugin surfaces.

### Decision: Use Codex-native lowercase plugin paths

**Требование:** [FR-4](FR.md#fr-4-codex-native-packaging-contract)

**Rationale:** Official Codex documentation and local cache examples use `.codex-plugin/plugin.json` plus `.agents/plugins/marketplace.json`; uppercase `.Codex-plugin/` is not the verified Codex-native path.

**Trade-off:** The repo will temporarily carry both Claude/legacy and Codex metadata paths.

**Alternatives considered:**
- Reuse `.Codex-plugin/` as Codex-native — rejected because the current official docs and local cache evidence do not support that claim.
- Store Codex metadata only in docs — rejected because the real Codex CLI needs manifest and marketplace files to load plugin entries.

### Decision: Require executable verification before Supported status

**Требование:** [FR-5](FR.md#fr-5-real-codex-cli-verification-gate)

**Rationale:** Marketplace files and manifests can exist while plugin visibility or runtime loading still fails. The whitelist status needs executable evidence.

**Trade-off:** Some environments may not have the Codex CLI available, so an equivalent integration harness is allowed when it exercises the same local contract.

**Alternatives considered:**
- Accept documentation links as Supported evidence — rejected because docs do not prove this repo's files load.
- Require only full global plugin install — rejected because it would mutate user state and make local CI brittle.

### Decision: Mark Claude-derived Codex claims as drift until verified

**Требование:** [FR-6](FR.md#fr-6-stale-claim-rejection)

**Rationale:** Codex and Claude differ in launch flags, trust files, and plugin metadata paths. A copied Claude claim is unsafe unless Codex docs, CLI output, or a real harness confirms it.

**Trade-off:** Claims that look obvious still need proof, which adds small research overhead.

**Alternatives considered:**
- Treat Claude behavior as a fallback source — rejected because it would preserve the exact class of drift this feature is meant to prevent.
- Allow unverified claims with TODO markers — rejected because TODO-backed support status would look implemented to future agents.

## BDD Test Infrastructure

**Classification:** TEST_DATA_NONE
**TEST_DATA:** TEST_DATA_NONE [VERIFIED: package.json]
**TEST_FORMAT:** BDD [VERIFIED: package.json]
**Framework:** Cucumber.js [VERIFIED: package.json]
**Install Command:** already installed
**Evidence:** `package.json` has `"test:bdd": "node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js"` and devDependency `"@cucumber/cucumber": "^12.9.0"`.
**Verdict:** No data hooks or fixtures are required for whitelist scenarios. Integration checks that mutate temp plugin/marketplace state must use temporary directories and must not edit user global Codex config without an explicit test harness boundary.
