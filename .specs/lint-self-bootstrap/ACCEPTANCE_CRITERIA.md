# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md)

WHEN a fresh checkout lacks the complete local lint runtime (`eslint` plus packages imported by `eslint.config.mjs`) THEN dev-pomogator SHALL prepare every declared package required by the lint config before executing the lint command.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md)

IF the complete local lint runtime is already present THEN dev-pomogator SHALL reuse it and SHALL NOT reinstall dependencies for that lint run.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md)

WHEN dependency preparation fails THEN dev-pomogator SHALL stop before lint execution and report the failed command plus the log location.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md)

WHEN a dogfood checkout or canonical plugin install invokes the supported lint verification path THEN dev-pomogator SHALL avoid relying on a globally installed eslint binary.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md)

IF package metadata and the lockfile disagree about any package in the lint runtime dependency set THEN dev-pomogator SHALL fail with an actionable lockfile-sync message instead of installing an untracked version.
