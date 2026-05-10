# Changelog

All notable changes to this **spec** are documented here. For implementation changelog see [`extensions/session-pilot/CHANGELOG.md`](../../extensions/session-pilot/CHANGELOG.md).

## [Unreleased]

Tracking for v0.2 spec evolution. No spec changes pending — current 0.1.0 is the v0.1.0 implementation contract.

## [0.1.0] - 2026-05-10

### Added — spec scaffold + content (Phase 6a)

- **USER_STORIES.md** — 8 stories with v3 form (Priority + Why + Independent Test + Acceptance Scenarios) covering multi-repo dashboard, one-click resume, reboot survival, pagination, modal viewer, multi-sort, plugin distribution, cross-OS access
- **USE_CASES.md** — 11 use cases covering happy paths (UC-1..UC-10) + edge cases (UC-11: unforeseen encoding variant)
- **FR.md** — 20 functional requirements with @feature1..@feature20 tags + cross-refs to ACs and Use Cases
- **NFR.md** — Performance/Security/Reliability/Usability/Compatibility + 4-rule «Anti-халява» section enforcing skill scenario verification
- **ACCEPTANCE_CRITERIA.md** — 20 EARS-format acceptance criteria with FR cross-references
- **session-pilot.feature** — 22 BDD scenarios (SP002..SP017 implemented Phase 1-7 + SP018..SP023 deferred to v0.2 with @v02 tag) covering all FRs
- **RESEARCH.md** — Zellij action injection findings, cross-OS path encoding analysis, Claude write-batching empirical observation, SWR pattern, pagination alternatives, 6-row Risk Assessment
- **DESIGN.md** — 9 key decisions (KD-1: MOVE not rewrite, KD-2: pagination Alt A→B→C progression with decision matrix, KD-3: Zellij `-n` flag gotcha, KD-4: SWR ETag+localStorage, KD-5: cross-OS encoding, KD-6: 300s LIVE threshold, KD-7: vendored libs, KD-8: native `<dialog>`, KD-9: SessionStart hook over systemd)
- **REQUIREMENTS.md** — 40-row CHK verification matrix (28 Verified Phase 1-7, 12 Draft for v0.2)
- **TASKS.md** — 35 tasks with v3 form (Done When + Status + Est) tracked across Phase 1-7 + v0.2 backlog
- **FILE_CHANGES.md** — 30 files mapped to FR refs with Phase tracking
- **session-pilot_SCHEMA.md** — full API contract for 7 endpoints + localStorage SWR cache schema + KDL templates + 7 env vars + 6 cross-endpoint validation invariants

### Added — competitor analysis (Phase 2)

- **COMPETITIVE_ANALYSIS.md** — 3518-word dedicated artifact analyzing vibe-kanban / agent-of-empires / ccmanager / kanna / claudito / claude-code-web / claudecodeui. Includes per-tool deep dives, 30-feature master matrix, P0/P1/P2/P3 «Features WE LACK» backlog, 10-feature «Features WE HAVE that they lack» differentiation list, v0.2/v0.3/v0.4 roadmap. Method: research-workflow skill with [VERIFIED]/[SINGLE_SOURCE] markers.

### Added — fixture inventory (Phase 6c)

- **FIXTURES.md** — synthetic JSONL fixture inventory + expected encoding variants table + B-1 lm-saas regression case + per-test fixture references

### Phase progression

| Phase | Date | Spec deliverable | Implementation |
|-------|------|------------------|----------------|
| Phase 1 | 2026-05-09 | (n/a — code MOVE only) | 9 prototype files moved to extensions/session-pilot/tools/session-pilot/ |
| Phase 2 | 2026-05-09 | COMPETITIVE_ANALYSIS.md | (research-only artifact) |
| Phase 3 | 2026-05-09 | (n/a — code phase) | POST /api/launch + 4-button frontend + KDL templates |
| Phase 3b | 2026-05-09 | (n/a — bug fix) | LIVE_THRESHOLD_SEC 90→300, --diagnose-livecycle CLI |
| Phase 4 | 2026-05-09 | DESIGN.md «Pagination strategy» section | (decision documented; implementation = Alt A current) |
| Phase 5 | deferred v0.2 | (Tabulator UX deferred) | Tabulator + modal + Intl.RelativeTimeFormat — T28-T33 |
| Phase 6a | 2026-05-09..10 | 13-file spec scaffold + populate | (no code) |
| Phase 6b | 2026-05-10 | (n/a — skill+rules) | SKILL.md + 4 rules |
| Phase 6c | 2026-05-10 | FIXTURES.md, REQUIREMENTS.md, TASKS.md, SCHEMA.md, README.md, CHANGELOG.md | tests/test_encode_path.py + test_launch_idempotent.py |
| Phase 7 | 2026-05-10 | (validation only) | audit-spec.ts 0 errors, extension-layout-validate.ts exit 0, 11/11 tests pass |

### Spec audit status

- `audit-spec.ts -Path .specs/session-pilot` — 0 ERROR-severity findings
- `requirements-chk-guard` validates 40 CHK rows
- `task-form-guard` validates 35 tasks (Done When + Status + Est)
- `extension-layout-validate.ts` — exit 0
- 39 LOGIC_GAP findings remain (informational; v0.2 work)

### Known gaps for v0.2 (per audit)

- **Test strength** — current 11 tests are weak per strong-tests skill review (permissive matchers, no mutation feedback, no cleanup, happy-path bias). T26 to add mutmut + strengthen.
- **Phase 5 deferred** — Tabulator + modal + Intl.RelativeTimeFormat + vi-style filter + SessionStart hook wiring all queued T28-T33.
- **Documentation** — distribution README for fresh-machine install (T35).

## [0.0.x] - 2026-05-09 (pre-spec, prototype iteration in main session)

Pre-spec exploration: prototype evolved through user-driven iterations as `worktree-dashboard.py` in `.dev-pomogator/bin/` (gitignored scratch). Key milestones from main-branch session (no formal spec yet):

- 2026-05-09 ~16:00 — initial prototype with /api/index + /api/claude
- 2026-05-09 ~17:00 — SWR ETag/304 + localStorage cache added
- 2026-05-09 ~18:00 — netsh portproxy WSL+Windows host access
- 2026-05-09 ~19:00 — progress bar + visibilitychange listener
- 2026-05-09 ~20:00 — multi-key sort table prep + competitor research begun
- 2026-05-09 ~21:00 — plan formalized; spec scaffolding started in worktree

This pre-spec history is informational only. v0.1.0 is the first formally specified release.
