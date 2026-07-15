# Use Cases

## UC-1: Install Codex-sub2api topology

1. User runs the Headroom beta installer and selects `codex-sub2api`.
2. Installer detects Docker on host or WSL.
3. Installer provisions Headroom and sub2api services.
4. Installer applies the Codex model profile to sub2api.
5. Installer writes Claude Code env routing to Headroom only after backup.
6. Installer runs health, model, and `/stats` verification.

## UC-2: Install Anthropic-direct topology

1. User selects `anthropic-direct`.
2. Installer skips sub2api.
3. Installer configures Headroom upstream to official Anthropic API behavior.
4. Installer verifies credentials without printing secrets.
5. Installer runs a tiny smoke request and dashboard `/stats` check.

## UC-3: Docker unavailable host fallback

1. Installer cannot use Docker on host or WSL.
2. Installer offers a host/headless install.
3. Installer uses isolated Python tooling such as pipx with retry.
4. Installer creates an autostart service appropriate to the OS.
5. Installer verifies `headroom proxy` is reachable after restart.

## UC-4: Existing Headroom is running in cache mode

1. Doctor finds `/stats.summary.mode = cache`.
2. Doctor explains that compression counters can remain zero in cache mode.
3. User opts into token mode.
4. Runtime is restarted or reconfigured safely.
5. Doctor runs a synthetic compressible workload and verifies compression.

## UC-5: Rollback

1. User reports Claude Code cannot connect after beta install.
2. Doctor finds the last backup and current route.
3. Doctor restores prior Claude settings.
4. Doctor stops only services it owns.
5. User can start Claude Code again without the beta proxy.

