# sandbox-test-runner

Disposable Windows VM (Windows Sandbox) for testing dev-pomogator install / uninstall against a clean Windows environment, using `tests/fixtures/typical-claude-user/` as the target project.

## Files

| File | Purpose |
|---|---|
| `dev-pomogator-test.wsb` | Sandbox config: maps fixture (read-only) + bootstrap, runs `setup.ps1` on login |
| `bootstrap/setup.ps1` | Verifies mounts, prints fixture state, leaves a ready terminal |

## Prerequisites (one-time, host)

```powershell
# Run as Administrator, then reboot
Enable-WindowsOptionalFeature -Online -FeatureName "Containers-DisposableClientVM" -All
```

Host requirements: Windows 11 Pro / Enterprise / Education, virtualization enabled in BIOS, ≥ 8 GB RAM.

## Usage

1. Double-click `dev-pomogator-test.wsb` (or run from terminal)
2. Sandbox boots in ~5 seconds; bootstrap prints fixture inventory
3. Inside sandbox: install Node + Claude Code + dev-pomogator (commands shown by bootstrap)
4. Close window → all sandbox state is destroyed

## Why Sandbox vs full VM

- Pristine on every launch (no snapshot management)
- ~5 sec boot, ~4 GB RAM
- Built into Windows Pro (no ISO download, no license)
- Mapped folders: host repo is read-only inside sandbox → no accidental host writes
- Networking enabled by default (npm install works)
