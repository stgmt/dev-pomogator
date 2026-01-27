# File Changes

## New Files

| Path | Description |
|------|-------------|
| `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` | Main hook script |
| `extensions/specs-workflow/tools/specs-validator/completeness.ts` | Spec completeness checker |
| `extensions/specs-workflow/tools/specs-validator/parsers/md-parser.ts` | MD file parser |
| `extensions/specs-workflow/tools/specs-validator/parsers/feature-parser.ts` | Feature file parser |
| `extensions/specs-workflow/tools/specs-validator/matcher.ts` | Tag matcher |
| `extensions/specs-workflow/tools/specs-validator/reporter.ts` | Report generator |
| `extensions/specs-workflow/cursor/rules/specs-validation.mdc` | Cursor rule |
| `extensions/specs-workflow/claude/rules/specs-validation.md` | Claude rule |
| `tests/features/plugins/specs-workflow/PLUGIN005_specs-validator.feature` | BDD scenarios |
| `tests/e2e/specs-validator.test.ts` | E2E tests |

## Modified Files

| Path | Change |
|------|--------|
| `extensions/specs-workflow/extension.json` | Add `hooks` section for cursor and claude |
| `src/installer/memory.ts` | Add function to copy validate-specs.ts |

## Generated Files (Runtime)

| Path | When |
|------|------|
| `.specs/{feature}/validation-report.md` | On each prompt if spec is complete |
| `~/.dev-pomogator/logs/specs-validator.log` | On error |

## Installation Artifacts

| Path | Description |
|------|-------------|
| `~/.dev-pomogator/scripts/validate-specs.ts` | Copied from extension |
| `~/.cursor/hooks/hooks.json` | Hook registration |
| `.claude/settings.json` | Hook registration (Claude) |
