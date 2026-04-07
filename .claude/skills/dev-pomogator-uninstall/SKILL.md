---
name: dev-pomogator-uninstall
description: Use when user asks to remove, uninstall, or delete dev-pomogator from the current project. Triggers on phrases like "удали dev-pomogator", "remove dev-pomogator", "uninstall dev-pomogator", "снеси dev-pomogator", "убери dev-pomogator", "снеси помогатор". Guides the agent through safe soft-removal via CLI-first then manual fallback, with safety checks and post-uninstall verification. Prefers preserving user-authored files.
allowed-tools: Read, Bash, Edit, Glob, Grep
---

# dev-pomogator Safe Uninstall

This skill guides an AI agent through **safely removing dev-pomogator** from a target project. Do **not** execute destructive commands without user confirmation. Follow the 5-step algorithm below in order.

Background: dev-pomogator installs managed files (tools, commands, rules, skills) and writes hooks to `.claude/settings.local.json`, plus adds a marker block to `.gitignore`. This skill cleanly removes all of that without touching user-authored files or the `~/.dev-pomogator/` global directory (unless user explicitly asks for full removal).

---

## Step 1: Safety Checks

**1a. Read package.json at repo root and refuse in dev-pomogator source repo.**

```bash
cat package.json
```

- If the JSON's `"name"` field equals `"dev-pomogator"` → **REFUSE** and stop immediately. Tell the user:
  > "This is the dev-pomogator source repository. Refusing to uninstall — your source files would be deleted. If you really want to clean the repo, do it manually."
- Otherwise, continue.

**1b. Identify the target project root.**

```bash
git rev-parse --show-toplevel
```

Remember this path — it's `repoRoot` for all subsequent steps.

**1c. Confirm with the user before proceeding.**

Say to the user (with their actual repoRoot substituted):

> "I will remove dev-pomogator from **{repoRoot}**. This will:
> - Delete managed files in `.dev-pomogator/tools/`, `.claude/rules/`, `.claude/skills/`, and managed `.claude/commands/`
> - Strip the dev-pomogator marker block from `.gitignore`
> - Clean dev-pomogator hooks/env from `.claude/settings.local.json`
> - Update `~/.config/dev-pomogator/config.json` to forget this project
>
> Your user-authored files and `~/.dev-pomogator/` global scripts will **not** be touched.
>
> Proceed? (yes/no)"

**Only continue on explicit "yes".** Any other answer → stop.

---

## Step 2: Scope Selection

Ask the user what scope they want:

> "Which scope?
>
> 1. **Project-only** (default): clean this project, leave `~/.dev-pomogator/` intact. Use this if you want to reinstall later or have dev-pomogator in other projects.
> 2. **Full**: also remove `~/.dev-pomogator/` global scripts. Use this only if you're done with dev-pomogator entirely."

- Default to **project-only** (personal-pomogator philosophy).
- If user picks Full, note that they'll need to run a global cleanup separately (e.g. `rm -rf ~/.dev-pomogator/`) — do **not** run it inside this skill without their explicit separate confirmation.

---

## Step 3: CLI-First Approach

Try the built-in CLI command first — it's safer than manual file manipulation.

**3a. Dry run:**

```bash
npx dev-pomogator uninstall --project --dry-run
```

- If the command succeeds: present the dry-run output to the user, ask:
  > "Dry run shows these files would be deleted:
  > {files list}
  >
  > Should I proceed with the actual uninstall? (yes/no)"
- On "yes" → run without `--dry-run`:
  ```bash
  npx dev-pomogator uninstall --project
  ```
- On "no" → stop.
- If the command exits non-zero or `dev-pomogator` is not found → proceed to Step 4 (Manual Fallback).

---

## Step 4: Manual Fallback (only if Step 3 failed)

Use this only if the CLI command is unavailable (stale installation, missing binary, corrupted install).

**4a. Read the managed file registry:**

```bash
cat ~/.config/dev-pomogator/config.json
```

Find `installedExtensions[*].managed[<repoRoot>]` — each entry has `commands`, `rules`, `tools`, `skills` arrays of `{ path, hash }` items.

**4b. Delete each managed file with path traversal guard.**

For each `ManagedFileEntry.path`:
1. Verify the path is **inside** `repoRoot` (path must not start with `..` or be absolute after resolution) — if it escapes, skip and log.
2. Delete:
   - Linux/macOS: `rm -f "{repoRoot}/{path}"`
   - Windows: `Remove-Item -Force "{repoRoot}/{path}"` via PowerShell

Track deleted paths for the final report.

**4c. Prune empty parent directories.**

Walk up from each deleted file. For each parent under `{repoRoot}`:
- If the directory is empty → `rmdir`
- Stop when hitting a non-empty directory or `repoRoot`

Particularly expect to prune:
- `.claude/rules/<subfolder>/` (after removing all rule files)
- `.claude/skills/<name>/` (after removing skill dirs)
- `.dev-pomogator/tools/<name>/` (after removing tool files)
- `.dev-pomogator/` itself (if entirely managed)

**4d. Remove the gitignore marker block.**

Use the **Edit** tool to remove the block bounded by these markers from `.gitignore`:

```
# >>> dev-pomogator (managed — do not edit) >>>
...block contents...
# <<< dev-pomogator (managed — do not edit) <<<
```

Preserve all lines outside the markers. If the markers are not found, skip this step.

**4e. Clean `.claude/settings.local.json`.**

Use the **Read** tool to load `.claude/settings.local.json`. Use the **Edit** tool to remove any hook entries whose `command` field contains:
- `.dev-pomogator/tools/`
- `.dev-pomogator/scripts/`
- `tsx-runner.js`
- `tsx-runner-bootstrap.cjs`

Also remove env keys from `settings.local.json.env` that match managed env names (cross-reference with config.json `envRequirements`).

Preserve user keys (e.g. `theme`, user-authored hooks).

**4f. Update `~/.config/dev-pomogator/config.json`.**

Use the **Edit** tool to:
- Remove `repoRoot` from each `installedExtensions[i].projectPaths` array
- Delete `installedExtensions[i].managed[repoRoot]` key

Preserve other projects' entries untouched.

---

## Step 5: Verification

After either Step 3 or Step 4 completes, verify the clean state:

**5a. Git status check.**

```bash
git status --porcelain
```

Assert that **no output lines** reference:
- `.claude/rules/` (managed rule files)
- `.claude/skills/` (managed skill files)
- `.dev-pomogator/`
- `.claude/settings.local.json`

If any appear → something wasn't cleaned. Report which files remain.

**5b. Gitignore block check.**

Use the **Grep** tool on `.gitignore` to ensure no line matches `>>> dev-pomogator`. If found → the block wasn't removed, investigate.

**5c. Settings.local.json check.**

```bash
cat .claude/settings.local.json 2>/dev/null || echo "file absent (OK)"
```

If the file exists, use **Grep** to check that it does **not** contain:
- `tsx-runner.js`
- `tsx-runner-bootstrap.cjs`
- `.dev-pomogator/tools/`

If found → settings.local.json wasn't cleaned, investigate.

**5d. Report to the user.**

Summarize:
> "Uninstall complete.
> - **{N} files deleted**
> - **Gitignore marker block removed**: yes/no
> - **settings.local.json cleaned**: yes/no
> - **Config updated**: yes/no
> - **Git status**: clean (0 dev-pomogator paths) / {list if any remain}
>
> You can reinstall dev-pomogator later with `npx dev-pomogator --claude --all`.
> Your `~/.dev-pomogator/` global scripts are still intact for use in other projects."

---

## What this skill does NOT do

- Does **not** delete `~/.dev-pomogator/` (global scripts, config.json, node_modules) unless user explicitly asks in Step 2.
- Does **not** touch user-authored files (files tracked in git at the same paths — installer already skipped those via collision detection).
- Does **not** force operations without user confirmation at each critical step.
- Does **not** run in the dev-pomogator source repo (Step 1a refuse).
- Does **not** push any changes to git — user commits the cleanup themselves if desired.

## Rollback

If the uninstall goes wrong and user wants to roll back:

```bash
npx dev-pomogator --claude --all
```

This re-runs the full installer, which will recreate managed files, re-add the gitignore block, and re-write `.claude/settings.local.json`. User-authored files will still be preserved (collision detection).
