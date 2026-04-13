---
description: Run ESLint on the codebase and fix what you can
allowed-tools: Bash, Read, Edit
---

# /lint

Run linting and fix issues.

1. Execute `npm run lint` and capture output.
2. For each error or warning, read the file and apply the minimal fix.
3. Re-run `npm run lint` until clean or only unfixable warnings remain.
4. Report a one-line summary: `lint: N fixed, M remaining`.
