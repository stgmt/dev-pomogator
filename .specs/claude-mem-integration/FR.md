# Functional Requirements (FR)

> v2 replacement for the deleted v1 installer: SessionStart bootstrap, doctor detection, safe worker recovery, and separately selected real-install proof.

## FR-1: Bootstrap decision @feature1

The bootstrap SHALL return `install` only when claude-mem is absent, `DEV_POMOGATOR_CLAUDE_MEM` is not `off`, and no fresh retry lock exists. It SHALL otherwise return exactly `skip-optout`, `skip-installed`, or `skip-backoff`, in that evaluation order. Installed state SHALL be resolved from the manifest or claude-mem worker/database evidence without treating malformed JSON as installed.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)

## FR-2: Non-interactive install command @feature2

For `install`, the hook SHALL launch `npx -y claude-mem install --ide claude-code --provider claude --model claude-haiku-4-5-20251001 --runtime worker` detached and without a TTY, with `DO_NOT_TRACK=1`, `CI=1`, and `CLAUDE_MEM_ONLINE_OPTIN=false`; Windows SHALL invoke it through `cmd /c`. The supported package/version policy, invoked package specifier, resolved installed version, and outcome SHALL be recorded. An unresolved version SHALL be reported as unverified, never as a successful verified install.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2)

## FR-3: Idempotency and backoff @feature3

The hook SHALL be a no-op when `installed_plugins.json` contains `claude-mem@*`, `~/.claude-mem/.worker.pid` or `~/.claude-mem/claude-mem.db` exists, or the user opts out. After launch it SHALL atomically stamp `~/.dev-pomogator/.claude-mem-bootstrap.lock` and suppress a new launch for six hours. `USERPROFILE` is authoritative on Windows when set; otherwise `HOME` is used consistently for every probe, lock, and report in one run.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature3)

## FR-4: Fail-open builtins-only @feature4

Bootstrap and health hooks SHALL use Node built-ins only and SHALL never block session start. Malformed input, filesystem failures, launch errors, unavailable worker, malformed configuration, refused/non-200 health response, and response black holes SHALL exit 0 with `{continue:true,suppressOutput:true}` and no fabricated memory context. Timeouts SHALL cancel request handles so failure cannot keep the hook alive.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature4)

## FR-5: Doctor detection @feature5

`pomogator-doctor` check `C-CMEM` SHALL use the same canonical installed-state contract as bootstrap, report `warning` with a local install hint when absent, and `ok` when present. Its worker companion SHALL independently distinguish absent installation, malformed config, unreachable worker, and healthy worker, with resolved port and version evidence.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature5)

## FR-6: Doctor reads the canonical global MCP config @feature6

Doctor check `C11` SHALL read project `.mcp.json` and canonical user-global `~/.claude.json`, not the non-existent `~/.claude/mcp.json`. Following an explicit real install, verification SHALL independently report manifest presence, MCP registration, worker reachability, and detected version; no failed component may be reported verified.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature6)

## FR-7: Worker reaper heals a wedged port @feature7

On native Windows only, when the worker is unreachable and its configured port is held by a dead owner, the reaper SHALL kill only orphaned processes whose command line carries a claude-mem signature and whose parent is dead, then reset `hook-failures.json` `consecutiveFailures` to zero. It SHALL not kill for a healthy worker, non-Windows/WSL environment, free port, live owner, or unrelated process. `DEV_POMOGATOR_CLAUDE_MEM_REAP=off` disables reaping. Canonical plugin and dogfood hook manifests SHALL register lifecycle hooks consistently, while the default Docker BDD suite remains offline and a real-install profile requires explicit network opt-in, isolated home, and provenance.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature7)
