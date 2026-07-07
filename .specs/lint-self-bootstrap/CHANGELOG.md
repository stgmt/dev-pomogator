# Changelog

## 2026-07-07

- Created `lint-self-bootstrap` spec after `npm run lint` failed because eslint was not installed locally.
- Captured user requirement: dev-pomogator must install/provide lint tooling it needs for its own checks, especially for fresh users.
- Added FR/AC/BDD/TASKS coverage for local pinned lint dependency, reuse path, actionable setup failure, plugin/dogfood self-sufficiency, and lockfile consistency.
