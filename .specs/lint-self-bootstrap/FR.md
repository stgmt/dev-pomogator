# Functional Requirements (FR)

## FR-1: Provide the lint runner required by the project

Dev-pomogator SHALL declare the lint runner used by `npm run lint` in project package metadata so a fresh checkout can install it locally and execute the configured lint script without depending on a global eslint installation.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md)

## FR-2: Reuse an existing local lint install

When the local lint executable is already present, the lint verification path SHALL reuse it and SHALL NOT reinstall dependencies on every run.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md)

## FR-3: Report dependency setup failures clearly

When lint dependency preparation fails, dev-pomogator SHALL report an actionable setup failure with the failed command and log location rather than surfacing a raw `eslint is not recognized` or `command not found` message.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md)

## FR-4: Keep plugin and dogfood verification self-sufficient

Dev-pomogator SHALL keep its own lint verification path self-sufficient for fresh dogfood checkouts and canonical plugin users, without requiring users to know hidden repository setup steps.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md)

## FR-5: Keep dependency versions reproducible

Dev-pomogator SHALL keep lint dependency declarations and the lockfile in sync so lint bootstrapping installs a reproducible local version instead of an unpinned latest global tool.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-5](USE_CASES.md)
