---
name: report-issue
description: >-
  Prepare and submit a dev-pomogator GitHub issue from a user's description. Generate a
  sanitized local draft, show its repository/title/body and exact approval digest, and create
  only after the user approves the unchanged digest. If GitHub CLI is unavailable,
  unauthenticated, or fails, preserve the Markdown draft and provide a filled GitHub new-issue
  URL. Triggers: "report issue", "file an issue", "bug report", "сообщить о баге",
  "создай issue", "заведи issue".
allowed-tools: Bash, AskUserQuestion
argument-hint: "<issue description>"
---

# report-issue

Use only `tools/report-issue/cli.ts` for this workflow. The reporter sanitizes credentials
and home paths, selects the repository, writes fallback drafts under
`.dev-pomogator/report-issue/`, and returns JSON. Never use a hand-written GitHub command.

## Workflow

1. Obtain an issue description. Ask when the command argument is empty. Pass the description
   unchanged to the reporter; it is the authority for sanitization, repository, title, body,
   and digest.
2. Run the reporter through the bundled bootstrap loader with JSON on standard input:

   ```bash
   node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT||'.','tools','_shared','bootstrap.cjs'))" -- "tools/report-issue/cli.ts"
   ```

   First input: `{"description":"<user description>"}`. Do not provide
   `approvedDigest` or `openBrowser` yet.

3. For `needs_approval`, show exactly the sanitized `repository`, `draft.title`,
   `draft.body`, and `draft.digest` returned by the reporter. Ask explicitly whether
   to submit that exact digest; do not paraphrase or regenerate it.
4. After an unambiguous yes, rerun with the same description and exact returned digest:

   `{"description":"<same description>","approvedDigest":"<exact digest>","openBrowser":true}`

   If the draft changes, get a fresh preview and confirmation.

## Interpret the result

- `created` with a non-empty `url`: report that URL; only this result means an issue
  exists on GitHub.
- `duplicate`: show its number, title, and URL; no new issue was created.
- `needs_approval`: no GitHub or browser action occurred; return to confirmation.
- `fallback`: show the saved `draftPath` and filled `url`. If GitHub CLI is
  unauthenticated, tell the user to run `gh auth login`. For missing CLI, timeout, duplicate
  search failure, or create failure, retain the draft and provide the URL; never claim creation.

On reporter error or malformed JSON, say the local reporter failed and do not claim an issue
was created.

## Safety invariants

- Explicit confirmation is mandatory before create or browser opening.
- `approvedDigest` must byte-for-byte equal the preview digest.
- Show only reporter-returned sanitized fields; never echo credentials from the description.
- Do not call `gh issue create` directly.
