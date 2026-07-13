# Functional Requirements (FR)

## FR-1: Название

The canonical `/report-issue` skill SHALL accept an issue description from the active Claude Code session, derive a clear issue title and Markdown body, sanitize sensitive and credential-shaped values before any GitHub interaction, and show the exact prepared title, body, repository target, and destination URL to the user.

**Acceptance criteria:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

**Use case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-2: Название

The skill SHALL NOT invoke a GitHub mutation command or create an issue until the user gives explicit approval for the displayed prepared report. Revising, declining, or not answering the approval prompt SHALL leave GitHub unchanged.

**Acceptance criteria:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

**Use case:** [UC-2](USE_CASES.md#uc-2-название)

## FR-3: Название

Before the creation-consent prompt, the skill SHALL use the locally installed GitHub CLI to search open issues in the resolved repository for materially similar reports. It SHALL display matching issue URLs and permit the user to continue only by explicitly confirming that a new issue is still wanted.

**Acceptance criteria:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)

**Use case:** [UC-3](USE_CASES.md#uc-3-название)

## FR-4: Название

When `gh` is missing, returns an error, or is installed but unauthenticated, the skill SHALL preserve the exact sanitized prepared Markdown and provide a filled `https://github.com/<owner>/<repo>/issues/new` URL. For an unauthenticated local CLI it SHALL explicitly instruct the user to run `gh auth login`; it SHALL never claim that an issue was created.

**Acceptance criteria:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)

**Use case:** [UC-4](USE_CASES.md#uc-4-название)

## FR-5: Название

The skill SHALL resolve the GitHub owner and repository from the checked-out repository metadata or a Git remote. For this feature's canonical distribution target, resolution SHALL fall back to `stgmt/dev-pomogator` when those sources are unavailable or non-GitHub. It SHALL display the resolved target before consent and use the same target for duplicate search, creation, and fallback URL.

**Acceptance criteria:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)

**Use case:** [UC-5](USE_CASES.md#uc-5-название)

## FR-N: Out of scope

The feature does not submit reports to any tracker other than GitHub, does not auto-create issues, and does not infer consent from a description, a command invocation, or a duplicate search result.
