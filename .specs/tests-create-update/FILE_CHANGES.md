# File Changes

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/tests-create-update/SKILL.md` | create | Skill: 5-step workflow, Assertion Selection Table, 7 anti-pattern rules, compliance report template |
| `extensions/test-quality/tools/test-quality/compliance_check.ts` | create | PostToolUse hook: scan test file for anti-patterns, block if found |
| `extensions/test-quality/extension.json` | edit | Добавить skill (skills + skillFiles) + hook (PostToolUse) + toolFiles |
| `tests/features/plugins/test-quality/PLUGIN016_tests-create-update.feature` | create | BDD scenarios (13 штук) matching FR-1..FR-8 |
| `tests/e2e/tests-create-update.test.ts` | create | E2E тесты: SKILL.md + hook + compliance check |
