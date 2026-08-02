# Dynamic Workflow Engineering

dev-pomogator ships one bounded-workflow skill and a default-deny policy goal: native Agent/subagent delegation is unavailable outside a trusted Dynamic Workflow contract. The specification separates enforceable runtime guarantees from skill/hook steering and refuses to call steering a complete ban.

## Ключевые идеи

- Keep the provided `dynamic-workflow-engineering` skill inside the existing marketplace plugin; do not create a nested plugin.
- Migrate every legitimate direct-Agent consumer to an exact bounded Workflow contract rather than granting compatibility exceptions.
- Admit only runtime-proven Workflow children; prompt text, labels, frontmatter, subtype, and caller-supplied IDs never authorize.
- Bound scope, calls, attempts, concurrency, discovery, context, and outputs; circuit-break unchanged retries.
- Preserve partial results, verify findings adversarially without rediscovery, and judge stop/resume from journal evidence.
- Publish `ENFORCED`, `STEERING_ONLY`, or `UNAVAILABLE` from real-host and clean-install evidence.

## Где лежит реализация

- **Skill:** `.claude/skills/dynamic-workflow-engineering/SKILL.md`
- **Policy and monitor:** `tools/dynamic-workflow-engineering/`
- **Hook authoring source:** `.claude-plugin/hooks.legacy.json`
- **Generated wiring:** `.claude-plugin/hooks.json`, `.claude/settings.json`, `tools/hook-service/registry.json`
- **BDD:** `tests/features/core/dynamic-workflow-engineering.feature`

## Current evidence boundary

Current main has no verified Agent-versus-Workflow PreToolUse policy. The generic hook-service path is not yet a trusted origin boundary and fails open on transport/setup errors. A real-host PoC is therefore the first implementation task; the release tier cannot be chosen from mocks or documentation alone.

[skip-spec-review-p1: `CODE_DRIFT_FR_ALREADY_DONE` warnings from spec-reality-check are false-positive pickaxe matches to older specs whose generic FR wording overlaps this new feature; current matcher inventory and missing bundled skill directly prove this feature is not shipped. `TASKS_FC_CONSISTENCY` INFO findings are covered by aggregate task blocks DWE-T03 through DWE-T08 rather than one task per file.]

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [RESEARCH.md](RESEARCH.md)
- [WORKFLOW_DOGFOOD.md](WORKFLOW_DOGFOOD.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)

## Second dogfood evidence boundary

The canonical specification also absorbs a second user-supplied harness postmortem. Its general lessons are requirements and planned evidence targets, not proof that this repository implements them. In particular, root/worktree mismatch, detached process writers, concurrent checkout mutation, foreign shared resources, masked terminal errors, partial apply, false probe RED, typed-count errors, mixed-run journals, stale monitors, unsafe resumes, context overflow, nested fan-out, and global-green observability are all treated as explicit failure classes.

The authoritative identity invariant is atomic:

`Agent/Workflow branch → repository root/worktree → process group → shared-resource lease → runId → proof phase`

Any broken binding blocks mutation and completion. The second incident remains `[USER-SUPPLIED][UNVERIFIED_FOR_THIS_REPOSITORY]`; original run-state, journals, process scans, terminal diagnostics, lease/mount evidence, and independent producer readback are required before replay. All tasks remain TODO, and this update does not claim implementation readiness.
