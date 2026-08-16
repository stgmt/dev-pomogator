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

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/worktree-setup`](../.claude/skills/worktree-setup/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
