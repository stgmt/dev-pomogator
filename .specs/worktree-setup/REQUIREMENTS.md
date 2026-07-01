# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-atomic-worktreebranch-creation-from-main) | Atomic worktree+branch creation | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-full-installer-bootstrap-with-global-config-registration) | Full installer bootstrap + global config | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-self-heal-hint-for-orphan-worktrees-via-tsx-runnerjs) | Self-heal hint for orphan worktrees | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-pr-creation-via-three-layer-config-resolution) | PR creation via three-layer config | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-gh-authentication-pre-flight-check) | gh auth pre-flight | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-worktree-doctorcjs-standalone-diagnostic) | worktree-doctor.cjs diagnostic | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-session-pilot-integration-contract) | session-pilot integration contract | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-invocation-from-sibling-worktree-warn-offer-continue) | Invocation-from-sibling warn flow | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-10](FR.md#fr-10-local-envconfig-file-synchronization-into-fresh-worktree) | Local env/config file sync into worktree | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature9 | Draft |
| [FR-11](FR.md#fr-11-build-and-dependency-synchronization) | Build & dependency sync (npm install + build) | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11) | @feature10 | Draft |
| [FR-12](FR.md#fr-12-devcontainer-integration) | DevContainer integration (--devcontainer up + post-create build) | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12) | @feature11 | Draft |
| [FR-9](FR.md#fr-9-out-of-scope-explicit) | Out of Scope (session transfer, cleanup batch, self-dogfood refactor) | N/A | N/A | OUT_OF_SCOPE |

## Functional Requirements

- [FR-1: Atomic worktree+branch creation](FR.md#fr-1-atomic-worktreebranch-creation-from-main)
- [FR-2: Full installer bootstrap with global config](FR.md#fr-2-full-installer-bootstrap-with-global-config-registration)
- [FR-3: Self-heal hint for orphan worktrees](FR.md#fr-3-self-heal-hint-for-orphan-worktrees-via-tsx-runnerjs)
- [FR-4: PR creation via three-layer config](FR.md#fr-4-pr-creation-via-three-layer-config-resolution)
- [FR-5: gh authentication pre-flight](FR.md#fr-5-gh-authentication-pre-flight-check)
- [FR-6: worktree-doctor.cjs standalone diagnostic](FR.md#fr-6-worktree-doctorcjs-standalone-diagnostic)
- [FR-7: session-pilot integration contract](FR.md#fr-7-session-pilot-integration-contract)
- [FR-8: Invocation-from-sibling warn flow](FR.md#fr-8-invocation-from-sibling-worktree-warn-offer-continue)
- [FR-10: Local env/config file synchronization](FR.md#fr-10-local-envconfig-file-synchronization-into-fresh-worktree)
- [FR-11: Build and dependency synchronization](FR.md#fr-11-build-and-dependency-synchronization)
- [FR-12: DevContainer integration](FR.md#fr-12-devcontainer-integration)
- [FR-9: Out of Scope explicit declarations](FR.md#fr-9-out-of-scope-explicit)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — NFR-P1 through NFR-P5 (5s end-to-end budget, doctor quick <50ms, self-heal <5ms overhead, npm install/build outside budget)
- [Security](NFR.md#security) — NFR-S1 through NFR-S6 (env file mode 0600, path traversal, /api/bootstrap whitelist, no auto repo create, no hardcoded identifiers, secret-aware env-sync copy)
- [Reliability](NFR.md#reliability) — NFR-R1 through NFR-R8 (atomic writes, idempotent re-run, no auto-cleanup on failure, stable exit codes, deduplication persistence, best-effort env-sync, run-log, port-allocation concurrency)
- [Usability](NFR.md#usability) — NFR-U1 through NFR-U6 (error+next-step, self-documenting env, summary block, populated defaults, one-line hints, per-step status)

## Acceptance Criteria

- [AC-1 (FR-1): atomic worktree+branch](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): installer bootstrap](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): self-heal hint](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): PR resolution layers](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): gh auth pre-flight](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): doctor exit semantics](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): session-pilot contract](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8): invocation-from-sibling](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-10 (FR-10): local env/config file sync](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
- [AC-11 (FR-11): build & dependency sync](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
- [AC-12 (FR-12): devcontainer integration](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)

## Verification Matrix (CHK)

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2.
> Hook `requirements-chk-guard` enforces format: ID `CHK-FR{n}-{nn}`, Traces To must include FR + (AC | @feature | UC),
> Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A},
> Status ∈ {Draft, In Progress, Verified, Blocked}.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Skill creates worktree via `git worktree add -b` (atomic) | FR-1, AC-1, @feature1 | BDD scenario | Draft | — |
| CHK-FR1-02 | Slug regex validation refuses invalid input | FR-1, AC-1 | Unit test | Draft | input fuzz: empty, leading dash, uppercase, >50 chars |
| CHK-FR1-03 | Pre-flight branch-exists check routes to UC-4 idempotency | FR-1, AC-1, UC-4 | Integration test | Draft | spawn 2 invocations with same slug, second must enter reuse path |
| CHK-FR2-01 | Skill invokes `node <main>/bin/cli.js --claude --all` with cwd=new-worktree | FR-2, AC-2, @feature2 | Integration test | Draft | spy on spawnSync args |
| CHK-FR2-02 | After installer exits 0, projectPath registered in global config | FR-2, AC-2 | Integration test | Draft | read ~/.dev-pomogator/config.json after bootstrap |
| CHK-FR2-03 | If registration absent, skill prints "Bootstrap incomplete" + retry command | FR-2, AC-2 | Integration test | Draft | mock partial install state |
| CHK-FR3-01 | tsx-runner emits exactly one JSONL line per missing-target invocation | FR-3, AC-3, @feature3 | Integration test | Draft | spawn hook with missing target, count JSONL lines |
| CHK-FR3-02 | stderr hint emitted only once per (worktree, session) tuple | FR-3, AC-3 | Integration test | Draft | 2 hook firings in same session, count stderr matches |
| CHK-FR3-03 | No-living-main fallback hint contains no hardcoded npx URL | FR-3, AC-3, NFR-S5 | Integration test | Draft | grep stderr output for `stgmt` or `github:` literal |
| CHK-FR4-01 | Layer 0 creates env file with stub template if absent | FR-4, AC-4, @feature4 | Integration test | Draft | rm env, invoke, verify file exists with header comments |
| CHK-FR4-02 | Layer 1 hit: env present + valid → skip investigation | FR-4, AC-4 | Integration test | Draft | spy on `gh repo view --json` not called when env hit |
| CHK-FR4-03 | Layer 2 paths a/b derive owner/repo from real commands + validate | FR-4, AC-4 | Integration test | Draft | feed skill known-good remote, verify resolution |
| CHK-FR4-04 | Layer 3 AskUserQuestion populates derived default (non-blank) | FR-4, AC-4, NFR-U4 | Manual review | Draft | inspect AskUserQuestion call args in transcript |
| CHK-FR4-05 | No-PR flag: zero gh/git push calls and zero env file writes | FR-4, AC-4 | Integration test | Draft | spy on subprocess invocations |
| CHK-FR5-01 | gh auth status non-zero → refuse before git worktree add | FR-5, AC-5 | Integration test | Draft | mock gh auth failure, assert no worktree created |
| CHK-FR6-01 | Doctor exit codes mapped to status strings (0/1/2/3) | FR-6, AC-6, @feature6 | Integration test | Draft | spawn doctor with controlled state, assert stdout `status=` |
| CHK-FR6-02 | Doctor `--quick` completes <50ms | FR-6, AC-6, NFR-P2 | Integration test | Draft | timed spawnSync, assert duration |
| CHK-FR7-01 | session-pilot indexer reads `tools_present` from doctor `--quick` | FR-7, AC-7, @feature7 | Integration test | Draft | cross-worktree: run session-pilot indexer fixture, assert field present |
| CHK-FR7-02 | /api/bootstrap rejects non-whitelisted worktree_path with 403 | FR-7, AC-7, NFR-S3 | Integration test | Draft | POST arbitrary path, assert 403 |
| CHK-FR8-01 | Invocation from sibling triggers AskUserQuestion warn+continue/abort | FR-8, AC-8, @feature8 | Integration test | Draft | spawn skill from sibling cwd, assert prompt |
| CHK-FR8-02 | Continue-from-main reroots subsequent ops to main path | FR-8, AC-8 | Integration test | Draft | verify spawned git/node calls use main cwd |
| CHK-FR10-01 | Skill copies gitignored root `.env.test` into new worktree byte-identical | FR-10, AC-10, @feature9 | Integration test | Draft | create worktree with .env.test in main, assert content equal |
| CHK-FR10-02 | `.devcontainer/.env` regenerated with unique ports, not byte-copied | FR-10, AC-10, @feature9 | Integration test | Draft | assert HOST_NOVNC_PORT differs from main's |
| CHK-FR10-03 | Secret-bearing copied env emits one stderr warning naming file, no value | FR-10, AC-10, NFR-S6 | Integration test | Draft | env with api_key; assert warn line, secret value absent from stderr |
| CHK-FR10-04 | Existing target env file skipped (no overwrite), re-run idempotent | FR-10, AC-10, NFR-R6 | Integration test | Draft | pre-create target, assert unchanged + audit action=skipped |
| CHK-FR10-05 | Candidate selection runtime-derived, no hardcoded `.env.test` literal | FR-10, AC-10, NFR-S5 | Integration test | Draft | repo with custom-named env file; assert it syncs |
| CHK-FR1-04 | Target dir exists but not a worktree → refuse with exit 2 (no git worktree add) | FR-1, AC-1 | Integration test | Draft | pre-create dir at target path, assert refusal + no worktree |
| CHK-FR2-04 | Installer resolving to ancestor repo (nested worktree) → skill errors, no wrong-root bootstrap | FR-2, AC-2 | Integration test | Draft | nest worktree under outer git repo, assert mismatch error |
| CHK-FR11-01 | `npm install` runs when worktree node_modules absent | FR-11, AC-11, @feature10 | Integration test | Draft | fresh worktree, spy npm install invoked with cwd=worktree |
| CHK-FR11-02 | `npm run build` runs when dist absent or stale vs src | FR-11, AC-11, @feature10 | Integration test | Draft | touch src newer than dist, assert build invoked |
| CHK-FR11-03 | `--skip-build` skips install+build and prints manual commands | FR-11, AC-11 | Integration test | Draft | pass flag, assert no npm spawn + hint printed |
| CHK-FR11-04 | Build/install failure → hint + continue, worktree preserved (no rollback) | FR-11, AC-11, NFR-R3 | Integration test | Draft | force npm exit≠0, assert worktree still exists + retry hint |
| CHK-FR12-01 | `--devcontainer` runs docker compose build+up with unique ports + derived project name | FR-12, AC-12, @feature11 | Integration test | Draft | spy docker compose args, assert cwd + project name |
| CHK-FR12-02 | Docker failure → manual command hint + continue (best-effort) | FR-12, AC-12, NFR-R3 | Integration test | Draft | force docker exit≠0, assert worktree preserved + hint |
| CHK-FR12-03 | No `--devcontainer` flag → zero docker commands | FR-12, AC-12 | Integration test | Draft | spy subprocess, assert no docker invocation |
| CHK-FR12-04 | post-create.sh runs npm install + build idempotently when package.json exists | FR-12, AC-12 | Integration test | Draft | run post-create twice, assert install skipped 2nd time |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario or unit/integration test via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when linked test passes; manual reviews record outcome in Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 36
- Verified: 0
- In Progress: 0
- Draft: 36
- Blocked: 0
