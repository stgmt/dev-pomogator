# Research

## Решение: dockur/windows

GitHub 35k+ stars. QEMU/KVM inside Docker. Auto-downloads Win 11 ISO, applies autounattend, boots via QEMU. noVNC :8006 + RDP :3389.

### Alternatives rejected
- Hyper-V VM: 8+ hours setup, Win 11 25H2 unattend broken
- Windows Sandbox: no persistence, no snapshots
- Native Windows containers: no GUI (Microsoft stance)

### Volume structure
```
/storage/data.img (10 GB actual, 64 GB sparse) — THE fixture
/storage/win11x64.iso (7.2 GB) — cached ISO
/storage/windows.{base,mac,rom,vars,ver} — firmware/config
```

### Fixture approach: Вариант C (data.img copy)
Docker named volume for fast ext4 I/O runtime. `D:\fixtures\*.img` copies on NTFS for safety. ~1-2 мин save/restore. `docker compose down -v` safe (fixtures untouched).

### Key gotchas
1. RAM_SIZE > available WSL2 memory → auto-adjusted
2. oem/install.bat one-time only (first boot)
3. MS CDN throttle: BITS 333KB/s, curl 660KB/s, aria2c 16x ~5-15MB/s
4. Chocolatey for pkg install (winget broken in PSDirect)
5. npm.cmd not npm.ps1 (execution policy)

## Windows containers на Linux — исследование (April 2026)

Нативных Windows containers для Linux **не существует** — нет Windows kernel.
Все решения = VM внутри container (QEMU/KVM).

### Сравнение решений

| Решение | Механизм | Perf | GUI | Для нас |
|---|---|---|---|---|
| **dockur/windows** | QEMU/KVM в Docker, полная Win | Near-native | noVNC + RDP | **Выбрано** |
| **WinBoat** | QEMU/KVM + FreeRDP RemoteApp, отдельные Win apps как Linux окна | Near-native | Интегрированные окна | Overkill для testing |
| **Wine в Docker** | Wine compatibility layer (не Windows) | Native | X11/VNC | Не подходит — нужна настоящая Windows |
| **ReactOS** | Open-source Win-compatible ОС | Lightweight | VNC | Ограниченная совместимость |

### WinBoat (альтернатива для будущего)

[WinBoat](https://windowsforum.com/threads/winboat-run-real-windows-apps-on-linux-with-kvm-in-docker-and-remoteapp.391795/) —
interesting для scenario когда нужно запустить **одно Windows приложение** на Linux host
как native окно (RemoteApp integration). Active development (2025-2026). Но для
dev-pomogator testing overkill — нам нужен full desktop, не single app.

### Sources

- [The Register: WinApps and WinBoat (Feb 2026)](https://www.theregister.com/2026/02/14/winapps_and_winboat/)
- [2026 State of Running Windows on Linux](https://www.linuxnest.com/the-2026-state-of-running-windows-applications-on-linux/)
- [Docker Wine — XDA](https://www.xda-developers.com/docker-wine-weird-container-run-windows-programs-on-linux/)

## Project Context
- `hyperv-test-runner` skill — parallel Hyper-V approach
- `setup-windows-test-vm` skill — Hyper-V setup knowledge
- `tests/hyperv-scenarios/` — reusable YAML catalog
