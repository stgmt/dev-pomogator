---
name: worktree-setup
description: >
  Create a ready-to-work git worktree in one command: atomic branch+worktree off main, dev-pomogator bootstrap,
  sync of lost local env files, npm install + build, standalone doctor verification, optional draft PR, and optional
  devcontainer bring-up. Also self-heals orphan worktrees (hint via tsx-runner) and works on any repo/owner without
  hardcoded identifiers. Triggers (RU): «создай worktree», «новый worktree», «worktree для», «сделай ветку в worktree»,
  «worktree + PR», «worktree с девконтейнером». Triggers (EN): «create worktree», «new worktree», «worktree for»,
  «set up a worktree», «worktree + PR», «worktree with devcontainer». Do NOT use for: removing/merging worktrees
  (that is launch-worktree.ps1's job), non-git projects, or read-only worktree inspection.
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion, Skill
---

# worktree-setup

Creates a new git worktree at a sibling path `<main-parent>/<main-basename>-<slug>` on branch `feat/<slug>`,
then makes it ready to work: installs dev-pomogator tools, copies lost local env files, builds the project,
verifies with a doctor, and optionally opens a draft PR and/or brings up the devcontainer.

The mechanical steps live in `scripts/orchestrate.ts`; this skill drives it and handles the interactive
decisions (sibling-invocation warning, PR owner/repo confirmation) that a script cannot.

## Inputs

- **slug** (required): kebab-case `^[a-z][a-z0-9-]*[a-z0-9]$`, 1–50 chars. Extract from the user's phrase.
- **--pr=draft** (optional): push the branch and open a draft GitHub PR (FR-4/FR-5).
- **--skip-build** (optional): skip `npm install` + `npm run build` (FR-11).
- **--devcontainer** (optional): after setup, run `docker compose build && up -d` for the worktree (FR-12).

## Workflow

1. **Parse intent** — derive `slug` and any flags from the user's request. If no slug is clear, ask once
   (plain question, one line) for the feature slug.
2. **Run the orchestrator** (non-interactive steps):
   ```bash
   npx tsx tools/worktree-setup/orchestrate.ts <slug> [--pr=draft] [--skip-build] [--devcontainer]
   ```
   In the dev-pomogator source repo the path is `.claude/skills/worktree-setup/scripts/orchestrate.ts`.
   The orchestrator prints a per-step summary and, when it needs a human decision, prints a line
   `NEEDS_INPUT: <kind> ...` and exits with a distinct code instead of guessing.
3. **Handle `NEEDS_INPUT: sibling`** (FR-8) — the command was invoked from inside another worktree, not main.
   Ask the user via AskUserQuestion: «Continue from main» / «Abort». On *Continue*, re-run the orchestrator with
   `--from-main`. On *Abort*, stop and print `cd <main>` hint.
4. **Handle `NEEDS_INPUT: pr-repo`** (FR-4 Layer 3) — owner/repo could not be resolved from env, git remote, or
   `gh` API. Ask the user via AskUserQuestion with the orchestrator's suggested default (`<gh-login>/<main-basename>`).
   Validate the answer by re-running with `--pr-repo=<owner>/<repo>`; on `gh repo view` 404, surface the
   `gh repo create` hint (never auto-create — NFR-S4).
5. **Read the summary** — the orchestrator ends with a per-step block (created / bootstrapped / env-synced / built /
   devcontainer / doctor / pr) marked ✓ done, ⚠ skipped, ✗ failed, plus the suggested `wt -d <path> claude` command.
   Relay it to the user. Each run appends one JSONL line to `~/.dev-pomogator/logs/worktree-setup.jsonl`.

## Step order (what the orchestrator does)

1. gh auth pre-flight (only if `--pr=draft`) → refuse before any git op if not authenticated (FR-5).
2. Slug validation; main worktree detection (`git worktree list --porcelain` first entry).
3. CWD-vs-main check → `NEEDS_INPUT: sibling` if not main (FR-8).
4. Branch pre-flight (`git show-ref`) + directory pre-flight (existing non-worktree dir → refuse) (FR-1).
5. `git -C <main> worktree add -b feat/<slug> <sibling>` (FR-1).
6. Bootstrap: `node <main>/bin/cli.js --claude --all` cwd=worktree; verify projectPath == worktree, not an ancestor (FR-2).
7. env-sync: copy gitignored root `.env*` (minus `.env.example`), regenerate `.devcontainer/.env` with unique ports,
   warn on secrets, skip existing (FR-10).
8. build/deps-sync: `npm install` (if no node_modules) + `npm run build` (if dist absent/stale), unless `--skip-build` (FR-11).
9. devcontainer (only `--devcontainer`): `docker compose build && up -d` with unique ports — best-effort (FR-12).
10. doctor: `worktree-doctor.cjs` full mode in the new worktree (FR-6).
11. PR (only `--pr=draft`): three-layer owner/repo resolution → push → `gh pr create --draft` (FR-4).
12. run-log + per-step summary (NFR-R7/U6).

## Guarantees

- **Best-effort, no rollback**: a failed bootstrap/env/build/devcontainer prints a retry hint and continues; the
  worktree is preserved for debugging (NFR-R3).
- **No hardcoded identifiers**: owner/repo derived at runtime (env → git remote → gh api → ask); works on forks (NFR-S5).
- **Idempotent**: re-running on an existing worktree enters reuse, skips already-present env files, skips up-to-date build.
- **Coexists** with `tools/devcontainer/.../launch-worktree.ps1` (Docker/VNC workflow) — reuses its port logic, does not replace it.

## References

- Spec: `.specs/worktree-setup/` (FR-1..FR-12, AC, @feature1..@feature11).
- Doctor output format + JSONL schemas: `.specs/worktree-setup/worktree-setup_SCHEMA.md`.
