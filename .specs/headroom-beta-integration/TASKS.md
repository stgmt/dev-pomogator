# Tasks

## Phase 0: Spec and Fixtures

- [x] Create `.specs/headroom-beta-integration/`.
- [ ] Add `/stats` fixtures for cache-mode zero savings and token-mode savings.
- [ ] Add Claude settings JSON fixtures with unknown keys and existing hooks.
- [ ] Add Docker/WSL detection fixtures.

## Phase 1: Planning Layer

- [x] Implement `tools/headroom-beta/detect-runtime.ts`. @feature3 @feature4
- [x] Implement `tools/headroom-beta/plan.ts`. @feature1 @feature2
- [x] Implement `tools/headroom-beta/headroom-flags.ts`. @feature5
- [x] Unit-test unsupported stale flag filtering. @feature5 @feature10

## Phase 2: Runtime Installers

- [x] Implement Docker-first profile generation/start. @feature3
- [ ] Implement `codex-sub2api` external dependency/pinned image path. @feature2
- [ ] Implement `anthropic-direct` runtime path. @feature2
- [ ] Implement host/headless fallback. @feature4
- [ ] Add autostart install/remove for Windows, Linux, and macOS. @feature4

## Phase 3: Safe Claude Settings

- [ ] Implement backup + atomic edit + rollback. @feature7
- [x] Preserve unknown keys and existing hooks. @feature7
- [x] Redact secrets in logs. @feature7

## Phase 4: Doctor and Verification

- [ ] Implement `/health` and `/stats` parser. @feature6
- [ ] Implement synthetic compression benchmark. @feature5 @feature6
- [ ] Implement topology-specific smoke tests. @feature2 @feature6
- [ ] Implement honest savings report. @feature8
- [ ] Add dashboard opener. @feature9

## Phase 5: Plugin Surface

- [x] Add `.claude/skills/headroom-beta/SKILL.md`. @feature9
- [x] Add command or documented invocation surface. @feature9
- [ ] Wire pomogator-doctor check without enabling beta by default. @feature1 @feature6
- [ ] Update README/docs with beta warning and rollback instructions. @feature8 @feature9

## Phase 6: Regression Tests

- [ ] Add BDD scenarios from `headroom-beta-integration.feature`. @feature10
- [ ] Add unit tests for stats classification. @feature8 @feature10
- [ ] Add integration test for settings rollback. @feature7 @feature10
- [ ] Add Docker/host fallback tests with mocked probes. @feature3 @feature4

## Phase 7: Validation

- [ ] Run spec verdict on `.specs/headroom-beta-integration`.
- [x] Run focused unit tests.
- [ ] Run BDD scenarios in Docker.
- [ ] Update GitHub issue #84 with spec path and implementation status after
      the spec lands in the repo.
