---
description: Prepare a sanitized GitHub issue draft and submit it only after approval
allowed-tools: Bash, AskUserQuestion
argument-hint: "<issue description>"
---

# /report-issue

Use the `report-issue` skill for the approval-first workflow.

1. Accept the issue description, or ask for it when `$ARGUMENTS` is empty.
2. Run the reporter preview and show its exact repository, title, body, and approval digest.
3. Ask for explicit confirmation; then rerun using that exact digest.
4. Say an issue was created only for `status: "created"` with a URL. For duplicate,
   unavailable, unauthenticated, or error outcomes, show the saved Markdown draft and filled
   GitHub URL. For an unauthenticated installed GitHub CLI, tell the user to run `gh auth login`.

$ARGUMENTS
