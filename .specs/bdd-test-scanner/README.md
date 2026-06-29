# Bdd Test Scanner

A non-blocking SessionStart hook that scans a project for existing non-BDD test files and nudges the developer to migrate them (via the bdd-migrator agent) or file a GitHub issue to track the debt. It is distinct from the existing guard that denies creating NEW non-BDD tests — this one surfaces EXISTING ones. It ships to all plugin users, and pomogator-doctor verifies and repairs it.

## Ключевые идеи

- Non-blocking nudge at session start: counts existing non-BDD tests, never denies a tool call.
- Two resolution paths: run the bdd-migrator now, or file a GitHub issue (`gh`) to track the debt.
- Anti-noise: silent once a tracking issue covers the debt; re-fires only when new non-BDD tests appear.
- Reliable everywhere: builtins-only fail-open core; the `gh` dependency follows install-or-warn plus doctor-fix.

## Где лежит реализация

- **App-код**: `tools/bdd-test-scanner/`
- **Wiring**: `.claude-plugin/hooks.json` + `.claude/settings.json`; doctor check in the pomogator-doctor engine

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
