# File Changes

Planned implementation files.

| Path | Action | Reason |
|------|--------|--------|
| `.specs/headroom-beta-integration/*` | create | Feature spec and traceability for issues #84/#88 |
| `tools/headroom-beta/detect-runtime.ts` | create | Runtime detection for Docker, WSL Docker, and host fallback |
| `tools/headroom-beta/plan.ts` | create | Build safe install/repair plan |
| `tools/headroom-beta/headroom-flags.ts` | create | Version-aware Headroom flag selection |
| `tools/headroom-beta/profile.ts` | create | Default profile, Claude settings patch, wrapper/startup/runtime templates |
| `tools/headroom-beta/install.ts` | create | Opt-in CLI installer and dry-run planner |
| `tools/headroom-beta/claude-settings.ts` | create | Backup, atomic edit, rollback |
| `tools/headroom-beta/doctor.ts` | create | Health/stats/topology checks |
| `tools/headroom-beta/benchmark.ts` | create | Synthetic compression verification |
| `tools/headroom-beta/docker/*` | create | Docker compose/templates for Headroom beta |
| `tools/headroom-beta/autostart/*` | create | OS-specific autostart helpers |
| `tools/headroom-beta/__tests__/profile.test.ts` | create | Focused regression tests for settings, wrapper, WSL URL, flags, and planning |
| `.claude/skills/headroom-beta/SKILL.md` | create | User-facing install/doctor/rollback skill |
| `.claude/commands/headroom-beta.md` | create | Slash-command invocation hints |
| `package.json` | edit | Add `headroom:beta` script |
| `.claude-plugin/hooks.json` | edit | Optional ensure hook only after opt-in |
| `.claude-plugin/plugin.json` | edit | Package new skill/command if required |
| `.claude/skills/pomogator-doctor/*` | edit | Add beta status check without enabling beta |
| `tests/features/headroom-beta-integration.feature` | create | BDD scenarios |
| `tests/step_definitions/feature_headroom_beta.ts` | create | Step definitions |
| `tests/fixtures/headroom-beta/*` | create | Stats/settings/runtime fixtures |
| `README.md` | edit | Optional beta documentation |
