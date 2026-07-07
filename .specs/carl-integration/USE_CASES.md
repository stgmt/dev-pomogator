# Use Cases

## UC-1: Название

**Supported Claude Code install gets managed CARL artifacts.**

A dev-pomogator user installs or refreshes the plugin in a supported Claude Code environment and expects CARL rules/recall hooks to work without a separate manual setup.

- Detect that the current environment supports the Claude Code CARL integration path.
- Create or refresh dev-pomogator-managed CARL artifacts idempotently.
- Preserve any user-owned CARL or hook configuration that is outside the managed block.
- Record enough marker/version data for `pomogator-doctor` to verify the managed artifacts later.
- Result: Claude Code sessions can receive CARL guidance where supported, and unsupported setups degrade with a visible warning rather than a broken install.

## UC-2: Название

**Doctor detects and repairs missing CARL integration.**

A user suspects CARL is not working, or a hook file was removed/staled, and runs `pomogator-doctor` to diagnose the dev-pomogator environment.

- Doctor checks for managed CARL structure, hook registration, version marker, and executable/runtime availability.
- Doctor reports whether CARL is healthy, missing, stale, unsupported, or broken.
- When repair is requested, doctor reinstalls only the managed CARL artifacts and leaves unrelated user configuration intact.
- Result: the user can recover CARL integration through the normal dev-pomogator repair flow instead of hand-editing dotfiles.

## UC-3: Название

**Broken CARL hook warns the agent and user instead of failing silently.**

The managed CARL hook is configured, but its runtime or recall backend cannot run during an agent session.

- The hook catches the failure and chooses fail-open behavior so the main agent workflow can continue.
- The hook injects a concise warning into agent-visible chat/context that says CARL did not run.
- The warning explicitly reminds the AI agent to tell the user that CARL guidance/recall was unavailable.
- The hook emits enough diagnostic detail for doctor or logs to identify the missing dependency, timeout, or unsupported mode.
- Result: the session is not blocked, but degraded CARL behavior is visible to both the agent and the user.

## UC-4: Название

**Codex plugin path is integrated after context-menu launcher support.**

After the Codex context-menu launcher and Codex hook dispatcher path are available, a dev-pomogator user expects CARL to work for Codex too.

- Treat Codex as a first-class platform, not as a copy of Claude Code hook files.
- Use the Codex version-aware hook capability model before installing or enabling CARL on the Codex path.
- Register CARL through the deterministic Codex dispatcher and project-local artifact model when supported.
- If the installed Codex version lacks the required hook capability, report an unsupported status and keep Claude Code CARL behavior unchanged.
- Result: Codex receives managed CARL support only after the platform prerequisites exist and only through the safe dispatcher path.

## UC-5: Название

**Fresh install has no CARL code yet, so implementation starts from a verified gap.**

A maintainer checks the current repository before designing CARL implementation and confirms there are no existing CARL artifacts to reuse directly.

- Verify that `.carl/`, `.claude/hooks/carl-hook.py`, and `scripts/carl/` are absent in the current repo inventory.
- Verify that `.codex/config.toml`, `.codex/hooks.json`, and `.codex/agents/*.toml` exist and form the current Codex artifact baseline.
- Mark CARL external behavior and benchmark details as unverified until researched against the real CARL source/documentation or user-provided artifact.
- Result: the spec starts from an honest implementation gap rather than claiming CARL code already exists in the repo.

## UC-6: Later review checks install, repair, warning, and sequencing

Before implementation is called ready, maintainers review the CARL integration across the installer, doctor, hook runtime, and Codex sequencing.

- Review the Claude Code managed install path against canonical plugin layout and hook distribution rules.
- Review doctor checks against managed structure, hook registry, version, and gitignore repair patterns.
- Review broken-hook warning behavior with an injected-failure scenario.
- Review Codex integration only after context-menu/Codex hook prerequisites are present.
- Result: review covers the full CARL lifecycle instead of only confirming that files were copied.
