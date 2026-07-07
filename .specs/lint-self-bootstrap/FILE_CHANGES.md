# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

| Path | Action | Reason |
|------|--------|--------|
| `package.json` | edit | Declare the lint runner and route lint through the supported local verification path for [FR-1](FR.md), [FR-5](FR.md). |
| `package-lock.json` | edit | Pin the lint dependency so fresh installs are reproducible for [FR-5](FR.md). |
| `tools/lint-self-bootstrap/run-lint.ts` | create | Provide an explicit self-bootstrap lint wrapper if package-script-only declaration is insufficient for [FR-1](FR.md), [FR-3](FR.md). |
| `tests/step_definitions/feature_lint_self_bootstrap.ts` | create | Drive real package metadata and lint bootstrap behavior through BDD for [FR-1](FR.md) through [FR-5](FR.md). |
| `cucumber.json` | edit | Register the new BDD feature so Docker cucumber can execute the lint bootstrap scenarios. |
| `.specs/lint-self-bootstrap/lint-self-bootstrap.feature` | edit | Define traceable scenarios for the lint self-bootstrap behavior. |
