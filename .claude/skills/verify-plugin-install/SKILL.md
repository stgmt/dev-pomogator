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

# verify-plugin-install — verify the plugin really installs + loads, headless in Docker

Claude Code 2.1.x ships a full **non-interactive plugin CLI** — the interactive `/plugin` TUI is NOT
the only path. The whole `marketplace add → install → load` flow is scriptable, so a clean-room Docker
test is achievable. Verified working 2026-05-27 (claude 2.1.152). This caught a real bug: a `plugin.json`
that passed `marketplace validate` but failed `install` because component fields were strings, not arrays.

## The non-interactive CLI (this is the key fact the docs/old notes got wrong)

```
claude plugin validate <path>                      # validate a plugin OR marketplace manifest
claude plugin marketplace add <path|repo|url>      # add marketplace (local DIRECTORY path works!)
claude plugin install <name>@<marketplace> -s user # install (scope: user|project|local)
claude plugin list --json                          # confirm installed + enabled
claude plugin uninstall <name>@<marketplace>
claude --plugin-dir <path> ...                     # load a plugin from a dir for ONE session (quick smoke)
```

Real on-disk layout (NOT `enabledPlugins`/`extraKnownMarketplaces` in settings.json — that does
nothing): `~/.claude/plugins/{installed_plugins.json, known_marketplaces.json, marketplaces/, cache/}`.
`install` copies the plugin into `cache/<marketplace>/<name>/<version>/`.

## plugin.json gotcha (the bug this skill exists to catch)

`skills`, `commands`, `hooks`, `mcpServers` MUST be **arrays of path strings**. A bare string passes
`claude plugin marketplace validate` but makes `claude plugin install` fail with
`hooks: Invalid input, commands: Invalid input, skills: Invalid input, mcpServers: Invalid input`.

```jsonc
// ❌ install fails (marketplace validate still passes — misleading)
"skills": ".claude/skills", "hooks": ".claude-plugin/hooks.json"
// ✅ correct
"skills": ["./.claude/skills"], "commands": ["./.claude/commands"],
"hooks": ["./.claude-plugin/hooks.json"], "mcpServers": ["./.mcp.json"]
```

Official marketplace plugins set NONE of these (they auto-discover from conventional `skills/`,
`commands/`, `hooks/hooks.json`, `.mcp.json`). dev-pomogator keeps everything under `.claude/` +
`.claude-plugin/`, so it MUST declare the custom paths — as arrays.

## The Docker recipe (the harness lives in tests/e2e + .dev-pomogator-tmp/plugin-e2e)

1. Image: `FROM node:22-slim` + `npm i -g @anthropic-ai/claude-code` + `useradd tester`.
2. Bind-mount the repo read-only at `/plugin`. Run as `--user tester` (NON-root — `--dangerously-skip-permissions`
   is refused under root).
3. In-container: `claude plugin validate /plugin` → `marketplace add /plugin` → `install dev-pomogator@stgmt -s user`
   → `plugin list --json`.
4. Headless load check: `claude -p "Reply OK" --dangerously-skip-permissions --debug --output-format stream-json --verbose`.
   PASS signals: install rc=0; `plugin list` shows `enabled:true`; the init event's `.skills[]` lists
   `dev-pomogator:<skill>` namespaced entries (e.g. `dev-pomogator:create-spec`, `:run-tests`,
   `:pomogator-doctor`); `result` is OK; no `MODULE_NOT_FOUND`.

### Auth in the container
- The local subscription proxy works: `-e ANTHROPIC_BASE_URL=http://host.docker.internal:3456 -e ANTHROPIC_API_KEY=proxy-dummy`
  + `--add-host=host.docker.internal:host-gateway`. It works even when `/health` reports
  `status:degraded / could not verify auth` (passthrough still routes). Bring it up with `proxy-up` first.
- Real `claude -p` makes a live billed LLM call (~$0.5 with a 1M context model). Keep the prompt one word.
- Steps 1–4 (validate/add/install/list) need NO auth — only the final `claude -p` load check does.

### Windows / Git-Bash gotchas
- Prefix the `docker run` with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` or paths like `/home/tester`
  get rewritten to `C:/Program Files/Git/...`.
- Do NOT pass `-e HOME=/home/tester` (gets mangled) — bake `ENV HOME=/home/tester` in the Dockerfile instead.

## Regression guard (no Docker, no auth — runs in the normal suite)
`tests/e2e/canonical-plugin.test.ts` asserts `plugin.json` declares `skills/commands/hooks/mcpServers`
as arrays. That alone would have caught this bug in CI. The full Docker install run is the manual /
on-demand deep check (needs claude CLI + auth), driven by this skill.

## Honest limits
- The literal interactive `/plugin` TUI (browse/trust prompts) isn't automatable — but `claude plugin
  install` IS the same install, scripted, so the meaningful question ("does it install + load?") is fully covered.
- Hook *firing* (vs just loading) needs a triggering event; skills-loaded + clean install + no
  MODULE_NOT_FOUND is the practical PASS bar. To check a hook concretely, assert its side effect.

## Sources
Verified empirically 2026-05-27 with claude 2.1.152: `claude plugin --help`, `claude plugin validate`
field-type probe (string→fail, array→pass), full container install run (`run6.log`).
