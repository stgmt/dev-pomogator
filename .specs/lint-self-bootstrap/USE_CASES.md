# Use Cases

## UC-1: Fresh checkout runs lint without a hidden manual dependency step

A maintainer or agent starts from a checkout where `node_modules` exists partially or not at all, and the eslint binary is absent. The lint command should prepare the required dependency path before executing lint.

- Detect that the configured lint command needs `eslint`.
- Verify whether `node_modules/.bin/eslint` is present.
- If missing, run the supported dependency preparation path.
- Execute lint through the local project toolchain.
- Return the real lint result, not a shell-level missing-command failure.

## UC-2: Existing dependency install is reused

A developer already has the correct dependency tree installed. The bootstrap should not slow every lint run by reinstalling packages.

- Detect that the local eslint binary exists.
- Skip dependency installation.
- Run the configured lint command normally.
- Preserve the existing command output and exit code.

## UC-3: Install failure is clear and actionable

A clean machine cannot install dependencies because npm, network, or cache setup is broken. The user should see the real setup failure, not an opaque `eslint is not recognized` message.

- Attempt the supported dependency preparation command.
- Capture the install exit code and log path.
- Stop before lint execution if dependency preparation failed.
- Print the exact next diagnostic step and where the log was saved.

## UC-4: Canonical plugin users are not forced to know repo internals

A user who installed dev-pomogator through the canonical plugin path triggers a verification or diagnostic path that needs lint tooling. The plugin should either ship the required runnable artifact or bootstrap dependencies through the repo-supported path.

- Resolve the plugin or project root correctly.
- Avoid assuming a globally installed eslint.
- Avoid requiring users to manually run an undocumented setup command.
- Keep behavior consistent between dogfood repo and installed plugin users.

## UC-5: Lockfile and package metadata stay in sync

A maintainer changes the lint dependency. The project should keep the dependency declared and locked so future installs are reproducible.

- Declare the lint runner in package metadata.
- Update the lockfile in the same change.
- Verify that the bootstrap path uses the locked local dependency.
- Fail loudly if package metadata and lockfile are inconsistent.
