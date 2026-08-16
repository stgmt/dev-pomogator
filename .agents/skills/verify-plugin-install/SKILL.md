---
name: verify-plugin-install
description: |
  Verify the dev-pomogator canonical plugin installs and loads (skills + hooks) in a clean
  Docker container, fully non-interactively, using the real `claude plugin` CLI. Use when asked to
  "проверь установку плагина", "test /plugin install", "e2e install в докере", "verify plugin loads",
  "smoke-test the plugin install", or to close the canonical-plugin spec's e2e checkbox.
  EN triggers: "verify plugin install", "headless plugin test", "test plugin in docker", "does the plugin load".
  Do NOT use for: the normal vitest suite (that's /run-tests), or editing plugin code.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/verify-plugin-install`](../.claude/skills/verify-plugin-install/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
