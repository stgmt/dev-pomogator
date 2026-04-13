# Design

## Architecture
```
Host (Win 11) → Docker Desktop WSL2 → dockur/windows (QEMU/KVM)
  /storage/data.img (Win disk), /oem/install.bat (post-install)
  Ports: 8006 (noVNC), 3389 (RDP)
D:\fixtures\ → *.img snapshots (NTFS, safe)
```

## Fixture lifecycle
1. `docker compose up` → install (~45 min first, ~30s reboot)
2. `oem/install.bat` → Node + Git + Claude Code
3. `docker-fixture save baseline` → D:\fixtures\baseline-clean.img
4. Test → `docker-fixture restore baseline` → clean

## Key decisions
- Вариант C (data.img copy) for fixtures
- Chocolatey (not winget)
- npm.cmd (not npm.ps1)
