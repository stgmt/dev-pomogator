# Research

## Контекст

During implementation of `claude-mem-midsession-reaper`, the post-edit verification command `npm run lint` failed before linting any source code because the local environment did not contain an `eslint` executable. The command output was: `'eslint' is not recognized as an internal or external command, operable program or batch file.` This means the quality gate can fail for a missing tool rather than for a real lint finding.

## Источники

- `package.json` — current lint script is `eslint .claude tools`.
- `package-lock.json` — checked during the session; root `devDependencies.eslint` was missing and there were no `node_modules/eslint` lockfile entries.
- `.claude/rules/pomogator/post-edit-verification.md` — requires `npm run lint` after code changes.
- Session command evidence — `npm run lint` exited before eslint execution because the executable was missing.

## Технические находки

### Lint command depends on an undeclared local binary

`package.json` defines `npm run lint` as `eslint .claude tools`, but eslint is not currently declared in package metadata. On Windows this fails as a shell missing-command error when no global eslint is available.

### The verification rule assumes lint is runnable

The post-edit verification rule requires `npm run lint`, so dev-pomogator must make that command self-sufficient for its own repository. Otherwise every fresh user or agent can be blocked before reaching the real code check.

### The safest distribution model is local, pinned tooling

A global eslint dependency would make results depend on the user's machine. A local dependency declared in `package.json` and locked in `package-lock.json` gives a reproducible version and lets `npm run lint` resolve `node_modules/.bin/eslint` automatically.

## Где лежит реализация

- Lint script and dependency declaration: `package.json`
- Dependency lock: `package-lock.json`
- Verification rule requiring lint: `.claude/rules/pomogator/post-edit-verification.md`
- Possible bootstrap or diagnostic entry points: `tools/`, `.claude/skills/pomogator-doctor/`, `.claude-plugin/hooks.json`

## Выводы

The immediate defect is not a lint finding; it is missing lint infrastructure. The feature should make the lint path self-bootstrap or self-contained enough that fresh users get a real lint result. The minimum viable fix is to declare and lock eslint locally; a stronger follow-up is a bootstrap/doctor check that notices a missing local lint binary and runs the supported install path or prints an actionable repair.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| post-edit-verification | `.claude/rules/pomogator/post-edit-verification.md` | Code changes require `npm run lint` before commit. | Any code edit. | FR-1, FR-2 |
| dead-integration-guard | `.claude/rules/testing/dead-integration-guard.md` | Plugin-distributed runtime code cannot rely on absent `node_modules` unless bundled, builtins-only, or fail-open. | Hook/plugin code using dependencies. | FR-3, NFR-Reliability |
| finish-the-deploy-dont-hand-off | `.claude/rules/pomogator/finish-the-deploy-dont-hand-off.md` | Do not hand routine setup steps to the user when the tool can do them. | Missing local setup. | FR-1, FR-4 |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| package scripts | `package.json` | Central declaration for lint/build/test commands. | Lint dependency must match the script. |
| npm lockfile | `package-lock.json` | Reproducible dependency versions. | Prevents unpinned auto-install drift. |
| pomogator doctor | `.claude/skills/pomogator-doctor/` | Environment diagnostics and fix hints. | Candidate place to detect missing lint tooling. |

### Architectural Constraints Summary

The lint runner should be local and pinned, not global. Any hook or plugin-distributed runtime path must either avoid eslint entirely or bootstrap/fail-open cleanly, because canonical plugin installs do not guarantee `node_modules` exists. Verification commands can require dependency installation, but the failure must be explicit and actionable.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Auto-installing lint tooling hides version drift or installs a moving latest version. | Medium | High | Declare eslint in `package.json`, update `package-lock.json`, and run through the local project dependency path only. |
| Plugin users without `node_modules` hit a runtime hook that imports eslint directly. | Medium | High | Keep lint bootstrap out of always-on hooks unless bundled or fail-open; use package scripts or doctor checks for dependency setup. |
| A broken network/npm cache turns a code lint check into a confusing install failure. | Medium | Medium | Capture install failure separately and print the command/log path before returning a non-zero setup result. |
| Reinstalling on every lint run makes verification slow. | Low | Medium | Check for the local eslint binary first and skip install when dependencies are already present. |
