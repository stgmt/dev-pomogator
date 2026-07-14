# Lint Self Bootstrap

Dev-pomogator requires lint verification after code edits, but the current `npm run lint` path can fail before linting if eslint or the packages imported by `eslint.config.mjs` are not installed locally. This spec makes the lint verification path self-sufficient: the complete lint runtime is declared, locked, and prepared before lint execution.

## Ключевые идеи

- `npm run lint` must reach a real lint result, not a missing executable error.
- Lint tooling should be local and pinned through package metadata/lockfile, not global.
- Fresh users should get an automatic or actionable setup path when the lint dependency is missing.

## Где лежит реализация

- **Package metadata**: `package.json`
- **Lockfile**: `package-lock.json`
- **Optional wrapper**: `tools/lint-self-bootstrap/run-lint.ts`
- **BDD steps**: `tests/step_definitions/feature_lint_self_bootstrap.ts`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [RESEARCH.md](RESEARCH.md)
- [FR.md](FR.md)
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
