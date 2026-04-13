# hyperv-test-runner

Disposable Hyper-V VM with preinstalled Windows 11 Enterprise + Node.js + Git + Claude
Code, plus an AI agent skill (`.claude/skills/hyperv-test-runner/`) and a YAML test catalog
(`tests/hyperv-scenarios/`) for repeatable testing of dev-pomogator install / uninstall
on a clean Windows baseline.

Spec: [`.specs/hyperv-test-runner/`](../../.specs/hyperv-test-runner/)

## Layout

```
tools/hyperv-test-runner/
├── lib/common.ps1               shared helpers (Test-IsAdmin, Wait-VMReady, ...)
├── 01-create-vm.ps1             create VM with vTPM + ISO + unattend (one-time)
├── 02-post-install.ps1          runs INSIDE VM via SetupComplete.cmd (auto)
├── 03-checkpoint.ps1            create a named snapshot (e.g. baseline-clean)
├── 04-revert-and-launch.ps1     daily test driver: revert + start + vmconnect
├── 05-cleanup.ps1               permanently destroy VM (requires -Confirm/-Force)
├── unattend/
│   ├── autounattend.xml         silent Win 11 install template
│   └── SetupComplete.cmd        first-boot hook → 02-post-install.ps1
└── README.md                    this file
```

## Prerequisites (one-time, host)

- Windows 11 Pro / Enterprise / Education with Hyper-V Module installed
- Admin elevation in PowerShell
- ~60 GB free disk space
- Win 11 Enterprise Eval ISO downloaded to `D:\iso\Win11_Enterprise_Eval.iso`
  (Microsoft Evaluation Center: https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise)
- Optional but recommended for full automation: Windows ADK installed (provides
  `oscdimg.exe` for building the unattend ISO). Without it, `01-create-vm.ps1` warns
  and you'll need to run `02-post-install.ps1` manually inside the VM after Windows install.
- For the AI orchestration skill: `Install-Module powershell-yaml -Scope CurrentUser -Force`

## Quick Start — First Time Setup (UC-1)

```powershell
# 1. From host, admin PowerShell:
.\tools\hyperv-test-runner\01-create-vm.ps1 -IsoPath D:\iso\Win11_Enterprise_Eval.iso

# 2. Wait ~30 min for unattend Win 11 install + auto post-install
#    (monitor via VMConnect window that opens automatically)

# 3. After C:\post-install-complete.flag appears inside VM,
#    open VMConnect, login to Claude Code interactively:
#       claude
#    (browser opens, complete OAuth)

# 4. From host (admin), create the baseline checkpoint:
.\tools\hyperv-test-runner\03-checkpoint.ps1 -Snapshot baseline-clean
```

You now have a `claude-test` VM with `baseline-clean` snapshot containing
preinstalled Win 11 + Node.js + Git + Claude Code (authenticated).

## Quick Start — Daily Use (UC-2)

```powershell
# Revert to clean baseline + start + open VMConnect (~10 sec):
.\tools\hyperv-test-runner\04-revert-and-launch.ps1 -Snapshot baseline-clean
```

For full-screen multi-monitor RDP via mstsc (instead of VMConnect):

```powershell
# Get IP from last revert output, then:
mstsc /v:<vm-ip> /multimon
```

## AI Agent Skill

For automated test orchestration, see `.claude/skills/hyperv-test-runner/SKILL.md`.

Trigger phrases (Russian + English):

- **Run scenario**: "запусти HV001", "протестируй в VM", "test in clean windows", "проверь на чистой винде"
- **Save baseline**: "сохрани state машины как baseline", "save VM state as baseline"
- **Extend catalog**: "добавь сценарий для X в hyperv catalog", "add hyperv test for X"

## Cleanup

```powershell
# Remove VM + snapshots, keep VHDX:
.\tools\hyperv-test-runner\05-cleanup.ps1 -Confirm

# Also delete VHDX file:
.\tools\hyperv-test-runner\05-cleanup.ps1 -Confirm -RemoveVHDX
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Hyper-V Module missing` | Hyper-V Platform не установлен | Admin: `Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All` + reboot |
| `Not elevated` | Run from non-admin shell | Re-launch PowerShell as Administrator |
| `oscdimg.exe not found` | Windows ADK не установлен | Install Windows ADK или run 02-post-install.ps1 manually inside VM |
| `Snapshot not found` | Передал неправильное имя checkpoint | `Get-VMSnapshot -VMName claude-test` для списка |
| `Timeout: VM did not acquire IPv4` | Сеть не настроена в guest | Проверь Default Switch + virtual NIC внутри VM |
| Win 11 install hangs at OOBE | Unattend.xml не подцепился | Проверь что secondary DVD с unattend mounted в VM, проверь boot order |

## See also

- [`.specs/hyperv-test-runner/`](../../.specs/hyperv-test-runner/) — full specification
- [`.specs/hyperv-test-runner/README.md`](../../.specs/hyperv-test-runner/README.md) — design rationale + Roadmap v0..v4
- [`tests/hyperv-scenarios/`](../../tests/hyperv-scenarios/) — YAML test catalog
- [`.claude/skills/hyperv-test-runner/`](../../.claude/skills/hyperv-test-runner/) — AI agent skill
