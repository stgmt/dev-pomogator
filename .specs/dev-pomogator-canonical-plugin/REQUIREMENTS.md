# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-canonical-plugin-layout) | Canonical plugin layout | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-fr-9) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-marketplace-catalog-claude-pluginmarketplacejson) | Marketplace catalog | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-fr-3) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-distribution-через-plugin-marketplace-add) | Distribution via /plugin marketplace add | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-install-через-plugin-install-dev-pomogatorstgmt) | Install via /plugin install | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-4-fr-5-fr-6) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-scope-aware-install-userprojectlocal) | Scope-aware install (user/project/local) | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-4-fr-5-fr-6) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-activation-через-reload-plugins) | Activation via /reload-plugins | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-4-fr-5-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-migration-v1-v2-documentation--optional-cleanup-script) | Migration v1 → v2 cleanup | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-7), [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-cursor-support-removal) | Cursor support removal | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-single-canonical-plugin-manifest) | Single canonical plugin manifest | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-fr-9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-update-path-через-plugin-marketplace-update) | Update path | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-fr-9) | @feature10 | Draft |
| [FR-11](FR.md#fr-11-desktop-compatibility-via-canonical-ui) | Desktop compatibility | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-11) | @feature11 | Draft |
| [FR-12](FR.md#fr-12-uninstall-via-plugin-uninstall) | Uninstall via /plugin uninstall | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-12) | @feature12 | Draft |

## Functional Requirements

- [FR-1: Canonical plugin layout](FR.md#fr-1-canonical-plugin-layout)
- [FR-2: Marketplace catalog](FR.md#fr-2-marketplace-catalog-claude-pluginmarketplacejson)
- [FR-3: Distribution via /plugin marketplace add](FR.md#fr-3-distribution-через-plugin-marketplace-add)
- [FR-4: Install via /plugin install](FR.md#fr-4-install-через-plugin-install-dev-pomogatorstgmt)
- [FR-5: Scope-aware install](FR.md#fr-5-scope-aware-install-userprojectlocal)
- [FR-6: Activation via /reload-plugins](FR.md#fr-6-activation-через-reload-plugins)
- [FR-7: Migration v1 → v2 cleanup](FR.md#fr-7-migration-v1-v2-documentation--optional-cleanup-script)
- [FR-8: Cursor support removal](FR.md#fr-8-cursor-support-removal)
- [FR-9: Single canonical plugin manifest](FR.md#fr-9-single-canonical-plugin-manifest)
- [FR-10: Update path](FR.md#fr-10-update-path-через-plugin-marketplace-update)
- [FR-11: Desktop compatibility](FR.md#fr-11-desktop-compatibility-via-canonical-ui)
- [FR-12: Uninstall](FR.md#fr-12-uninstall-via-plugin-uninstall)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1, FR-9): Canonical layout build assertions](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-fr-9)
- [AC-2 (FR-2, FR-3): Marketplace add registration](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-fr-3)
- [AC-3 (FR-4, FR-5, FR-6): Install + scope + reload flow](ACCEPTANCE_CRITERIA.md#ac-3-fr-4-fr-5-fr-6)
- [AC-4 (FR-7): Migration cleanup script](ACCEPTANCE_CRITERIA.md#ac-4-fr-7)
- [AC-5 (FR-7): Migration idempotent on no-v1 project](ACCEPTANCE_CRITERIA.md#ac-5-fr-7)
- [AC-6 (FR-12): Uninstall canonical](ACCEPTANCE_CRITERIA.md#ac-6-fr-12)
- [AC-7 (FR-11): Desktop UI plugin browser](ACCEPTANCE_CRITERIA.md#ac-7-fr-11)
- [AC-8 (FR-8): --cursor exits with v2 error](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)

## Verification Matrix (CHK)

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2.
> Hook `requirements-chk-guard` enforces format: ID `CHK-FR{n}-{nn}`, Traces To must include FR + (AC | @feature | UC),
> Verification Method ∈ (BDD scenario, Unit test, Manual review, Integration test, N/A),
> Status ∈ (Draft, In Progress, Verified, Blocked).

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | `.claude-plugin/plugin.json` имеет required fields name/version/description/author | FR-1, AC-1, @feature1 | Integration test | Draft | tests/e2e/canonical-plugin.test.ts |
| CHK-FR1-02 | Repo содержит canonical sub-dirs skills/, commands/, .mcp.json + `.claude-plugin/hooks.json` | FR-1, AC-1, @feature1 | Integration test | Draft | filesystem assertions |
| CHK-FR1-03 | `.claude-plugin/` contains ONLY plugin.json + marketplace.json + hooks.json (no other files) | FR-1, AC-1, @feature1 | Unit test | Draft | directory listing assertion |
| CHK-FR2-01 | `.claude-plugin/marketplace.json` valid per Anthropic schema | FR-2, AC-2, @feature2 | Integration test | Draft | tests/e2e/marketplace-json.test.ts schema validation |
| CHK-FR2-02 | marketplace.json содержит required name/owner/plugins fields | FR-2, AC-2, @feature2 | Unit test | Draft | parse + assert |
| CHK-FR2-03 | Plugin entry source="./" resolves correctly to repo root | FR-2, AC-2, @feature2 | Manual review | Draft | manual `/plugin install` smoke test |
| CHK-FR3-01 | `/plugin marketplace add stgmt/dev-pomogator` works (manual verification) | FR-3, AC-2, @feature3 | Manual review | Draft | smoke test in real Claude Code session |
| CHK-FR4-01 | `/plugin install dev-pomogator@stgmt` works (manual verification) | FR-4, AC-3, @feature4 | Manual review | Draft | smoke test |
| CHK-FR5-01 | --scope user is default (writes to ~/.claude/settings.json) | FR-5, AC-3, @feature5 | Manual review | Draft | smoke test |
| CHK-FR5-02 | --scope project writes to .claude/settings.json (committed) | FR-5, AC-3, @feature5 | Manual review | Draft | smoke test |
| CHK-FR5-03 | --scope local writes to .claude/settings.local.json (gitignored) | FR-5, AC-3, @feature5 | Manual review | Draft | smoke test |
| CHK-FR6-01 | `/reload-plugins` activates plugin in current CLI session | FR-6, AC-3, @feature6 | Manual review | Draft | post-install verification |
| CHK-FR6-02 | Desktop UI auto-reloads after plugin install через UI | FR-6, AC-7, @feature6 | Manual review | Draft | Desktop UX verification |
| CHK-FR7-01 | migrate-v1-to-v2.ts detects v1 install через .claude-plugin/plugin.json version | FR-7, AC-4, @feature7 | Integration test | Draft | tests/e2e/migration-v1-to-v2.test.ts |
| CHK-FR7-02 | Cleanup script removes managed project files | FR-7, AC-4, @feature7 | Integration test | Draft | filesystem assertions |
| CHK-FR7-03 | Cleanup script backups user-modified files | FR-7, AC-4, @feature7 | Integration test | Draft | content hash mismatch fixture |
| CHK-FR7-04 | Cleanup script removes .gitignore managed block | FR-7, AC-4, @feature7 | Integration test | Draft | .gitignore content assertion |
| CHK-FR7-05 | Cleanup script idempotent (no v1 → exit 0 informational) | FR-7, AC-5, @feature7 | Integration test | Draft | re-run after cleanup |
| CHK-FR8-01 | edge-debug-port manifest has platforms=["claude"] (no cursor) | FR-8, AC-8, @feature8 | Unit test | Draft | tests/e2e/cursor-removal.test.ts |
| CHK-FR8-02 | --cursor on legacy CLI exits non-zero с v2 error message | FR-8, AC-8, @feature8 | Integration test | Draft | spawnSync assertion |
| CHK-FR8-03 | package.json description and keywords have no Cursor | FR-8, @feature8 | Unit test | Draft | parse + assert |
| CHK-FR9-01 | hand-maintained manifest set complete; drift test asserts hooks.json↔disk | FR-9, AC-1, @feature9 | Integration test | Draft | tests/e2e/canonical-plugin.test.ts — каждая hooks.json команда резолвится в on-disk tools/ скрипт и vice-versa |
| CHK-FR10-01 | marketplace.json version field synchronized с plugin.json version | FR-10, @feature10 | Unit test | Draft | parse оба + assert equal |
| CHK-FR11-01 | Skills visible в Claude Desktop after canonical install | FR-11, AC-7, @feature11 | Manual review | Draft | Desktop UI verification |
| CHK-FR12-01 | `/plugin uninstall dev-pomogator@stgmt` removes cache + enabledPlugins entry | FR-12, AC-6, @feature12 | Manual review | Draft | post-uninstall filesystem check |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to BDD scenario, integration test, или manual review.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when linked test passes; manual reviews record outcome in Notes.
4. **Manual reviews unavoidable** для FR-3, FR-4, FR-11, FR-12 потому что Anthropic-managed install/uninstall flow невозможно полностью simulate в isolated tests без real Claude Code session.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` или explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 24
- Verified: 0
- In Progress: 0
- Draft: 24
- Blocked: 0
