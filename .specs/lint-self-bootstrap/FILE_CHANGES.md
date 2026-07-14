# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

| Path | Action | Reason |
|------|--------|--------|
| `package.json` | edit | Declare the lint runner and route lint through the supported local verification path for [FR-1](FR.md), [FR-5](FR.md). |
| `package-lock.json` | edit | Pin the lint dependency so fresh installs are reproducible for [FR-5](FR.md). |
| `tools/lint-self-bootstrap/run-lint.cjs` | create/edit | Provide the builtins-only runtime self-bootstrap lint wrapper used by `npm run lint`, so a fresh checkout can prepare local eslint and every `eslint.config.mjs` package before running lint for [FR-1](FR.md), [FR-2](FR.md), [FR-3](FR.md), [FR-5](FR.md). |
| `tools/lint-self-bootstrap/run-lint.ts` | edit | Keep the TypeScript import surface as a thin delegate to the CJS runtime for BDD and internal callers without duplicating bootstrap logic for [FR-2](FR.md), [FR-3](FR.md). |
| `tests/step_definitions/feature_lint_self_bootstrap.ts` | create | Drive real package metadata and lint bootstrap behavior through BDD for [FR-1](FR.md) through [FR-5](FR.md). |
| `cucumber.json` | edit | Register the new BDD feature so Docker cucumber can execute the lint bootstrap scenarios. |
| `.specs/lint-self-bootstrap/lint-self-bootstrap.feature` | edit | Define traceable scenarios for the lint self-bootstrap behavior. |
