---
name: hyperv-vm
description: >-
  Provision, connect to, measure, optimize, verify, and roll back reusable Hyper-V virtual
  machines. Supports new Windows LTSC/Ubuntu guests and existing Windows 11 Hyper-V guests with
  PowerShell Direct/RDP or SSH; can repair nested virtualization, install WSL2 plus Docker CE
  without Docker Desktop, manage sparse VHD and BuildKit cache GC, compare equal-limit memory,
  and apply opt-in security/update policies. Triggers: "create VM", "Hyper-V VM",
  "Windows LTSC VM", "Windows 11 guest", "WSL2 in Hyper-V", "nested virtualization",
  "Ubuntu VM", "виртуальная машина", "виртуалка", "настрой VM", "оптимизируй VM".
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch
argument-hint: "<plan|apply|nested-plan|nested-apply|nested-verify|nested-rollback|connect|measure|optimize|verify|rollback>"
---

# hyperv-vm

Use the scripts in this skill. Never paste credentials into generated files, command history,
Git, unattended XML, cloud-init, logs, reports, or issue bodies.

## Safety and scope

1. Confirm the user controls the host and guest. Do not expose management ports beyond the
   selected Hyper-V switch.
2. Run `Test-HyperVVmPrerequisites.ps1` first. Stop on a name collision, missing ISO, insufficient
   free storage, unavailable switch, unsupported host feature, or failed checksum.
3. Default to `Plan`/`WhatIf`. `Apply` is permitted only after showing the resolved configuration.
4. ISO/image acquisition must use an official vendor URL supplied in config, or a local ISO with
   `expectedSha256`. Never obtain unofficial Windows images or bypass licensing/activation.
5. Existing VM replacement, VHD deletion, checkpoint deletion, security disabling, and update
   disabling require separate explicit approval. These flags default to false.
6. Reboots are never a first-line remediation. Reboot only when setup/feature activation requires
   it or when the user explicitly asks for end-to-end provisioning.
7. Distinguish the parent/root Hyper-V host from a Windows guest before diagnosing CPU flags.
   Once a hypervisor is active, `VMMonitorModeExtensions=False` and `SLAT=False` alone are not a
   failure verdict. A real WSL2 kernel response is stronger evidence than those two WMI fields.
8. Processor settings for an existing Windows guest change only on the parent Hyper-V host, in an
   elevated PowerShell session, while the VM is `Off`. A running guest requires explicit downtime
   approval and graceful shutdown; never substitute `Stop-VM -TurnOff` silently.
9. Nested virtualization does not require MAC spoofing for every topology. Keep it opt-in and use
   it only when the network design needs layer-2 forwarding rather than NAT/double-NAT.

## Configuration

Copy `references/config.example.psd1` outside the repository and edit it. Required secrets are
resolved at runtime in this order:

1. PowerShell SecretManagement (`SecretVault` + `SecretName`);
2. environment variable named by `AdminPasswordEnv` or `SshPrivateKeyPassphraseEnv`;
3. interactive `Read-Host -AsSecureString` when a terminal is available.

Never accept plaintext passwords in the config. Windows unattended installation uses a generated
one-time bootstrap secret; `Finalize-WindowsGuest.ps1` rotates it to the runtime secret before
verification and deletes autologon values. Linux uses an SSH public key by default; password SSH
is opt-in.

## Existing Windows 11 guest: nested virtualization repair

Use this path when Windows 11 already exists as a Hyper-V guest and WSL2 needs virtualization
extensions from the parent. Do not run the processor mutation inside the guest. This repair path
is generation-neutral: it reports the existing generation/configuration version and changes only
the processor flag plus an explicitly requested network setting. New provisioning remains Gen 2.

First produce a read-only plan on the parent host:

```powershell
$skill = '<plugin-root>\.claude\skills\hyperv-vm'
& "$skill\scripts\Set-HyperVVmNestedVirtualization.ps1" `
  -VMName '<existing-windows-11-vm>' -Action Plan
```

After showing the VM identity, generation, configuration version, state, processor count, current
flag, and state path, apply with explicit downtime approval:

```powershell
& "$skill\scripts\Set-HyperVVmNestedVirtualization.ps1" `
  -VMName '<existing-windows-11-vm>' -Action Apply -AllowGuestShutdown
```

The script records the previous processor/network state atomically, performs only a graceful
guest shutdown, changes `ExposeVirtualizationExtensions` while the VM is `Off`, restarts a guest
that was previously running, and waits for an OK heartbeat. `-EnableMacAddressSpoofing` is a
separate explicit option; it is not implied by nested virtualization.

Verify from both sides with a secure PowerShell Direct credential:

```powershell
& "$skill\scripts\Test-HyperVVmNestedVirtualization.ps1" `
  -VMName '<existing-windows-11-vm>' -WslDistribution 'Ubuntu-24.04'
```

Verification requires the host processor flag, Windows guest identity, `wsl --status`, distro
version 2, a real `microsoft-standard-WSL2` kernel response, `vmmemWSL`/`wslservice`, and Docker
daemon evidence unless `-SkipDocker` was requested. `E_UNEXPECTED` triggers bounded WSL/Host
Compute/Hyper-V event collection; it is not automatically classified as a nested-virtualization
root cause.

Rollback is also offline and restores only state captured by the corresponding apply:

```powershell
& "$skill\scripts\Set-HyperVVmNestedVirtualization.ps1" `
  -VMName '<existing-windows-11-vm>' -Action Rollback -AllowGuestShutdown
```

## Workflow

### 1. Plan and validate

```powershell
$skill = '<plugin-root>\.claude\skills\hyperv-vm'
& "$skill\scripts\Test-HyperVVmPrerequisites.ps1" -ConfigPath .\vm.psd1
& "$skill\scripts\Invoke-HyperVVm.ps1" -Action Plan -ConfigPath .\vm.psd1
```

Show: guest type, VM name, generation, CPU, static/dynamic RAM, VHD size/type, switch, install
source + SHA-256, management transport, exposed ports, optional profiles, destructive actions,
and expected reboots.

### 2. Provision

```powershell
& "$skill\scripts\Invoke-HyperVVm.ps1" -Action Apply -ConfigPath .\vm.psd1
```

`Apply` creates unattended/NoCloud media, journals before mutation, creates the VM, attaches media,
and starts it. After Windows OOBE, run `Finalize-WindowsGuest.ps1`; when it reports a required
reboot, reboot and execute the emitted WSL/Docker setup command. For Ubuntu, wait for
`cloud-init status --wait`, then pin the generated host identity before the first SSH command:

```powershell
& "$skill\scripts\Connect-HyperVVm.ps1" -ConfigPath .\vm.psd1 -EnrollHostKey
```

Profiles:

- `windows-ltsc`: Generation 2, UEFI/Secure Boot, unattended install, PowerShell
  Direct verification, optional RDP. If `InstallWslDocker` is true, enable nested virtualization,
  WSL2, Ubuntu, systemd, Docker CE, BuildKit GC, sparse VHD, and a prune timer.
- `ubuntu-server`: Generation 2, Microsoft UEFI CA Secure Boot, cloud-init NoCloud ISO, SSH key
  login, optional Docker CE. Verify with SSH using strict host-key checking and a dedicated
  `known_hosts` file.

### 3. Connect

```powershell
& "$skill\scripts\Connect-HyperVVm.ps1" -ConfigPath .\vm.psd1
```

- Windows: prefer PowerShell Direct (`New-PSSession -VMName`) because it requires no guest network
  or inbound firewall rule. Use RDP only when enabled in config.
- Ubuntu: use SSH key auth. Discover the guest IP from `Get-VMNetworkAdapter` and fail if ambiguous.
  Print the exact SSH command but never print the private-key passphrase.

### 4. Measure before optimization

```powershell
& "$skill\scripts\Measure-HyperVVm.ps1" -ConfigPath .\vm.psd1 -Phase before
```

Keep VM limits, workload, uptime stabilization delay, Docker state, and container set identical.
Measure host free RAM, Hyper-V assigned/demand, guest used/available RAM, process/service counts,
WSL memory, Docker daemon RSS, container count, and configuration fingerprint. A report is invalid
when limits or fingerprint differ.

### 5. Optimize

```powershell
& "$skill\scripts\Optimize-HyperVVm.ps1" -ConfigPath .\vm.psd1 -Profile Conservative
```

`Conservative` is default and reversible:

- Windows: disable only config-selected services irrelevant to the declared role; remove stale
  autologon; consolidate service hosts only when measured; preserve networking, PowerShell Direct,
  Hyper-V integration, WSL, Docker, and user-selected access.
- WSL: `autoMemoryReclaim`, sparse VHD, systemd Docker, BuildKit GC and timer. Do not call a lower
  memory cap an operating-system optimization.
- Ubuntu: disable only config-selected unused services/packages and preserve SSH/network/cloud-init
  until provisioning finishes.

`DisableSecurity`, `DisableFirewall`, and `DisableUpdates` are independent, high-risk opt-ins.
Warn that they reduce defense, snapshot state first, write rollback metadata, and verify the VM is
not reachable from untrusted networks. Keep BFE/network dependencies intact when firewall profiles
are disabled.

### 6. Measure after and verify

```powershell
& "$skill\scripts\Measure-HyperVVm.ps1" -ConfigPath .\vm.psd1 -Phase after
& "$skill\scripts\Compare-HyperVVmMeasurements.ps1" -Before .\hyperv-vm-reports\before.json -After .\hyperv-vm-reports\after.json
& "$skill\scripts\Test-HyperVVm.ps1" -ConfigPath .\vm.psd1
```

Required checks:

- VM running, heartbeat healthy, requested CPU/RAM/VHD/network/nested virtualization;
- Windows login via PowerShell Direct or Linux login via SSH;
- WSL distro version 2 when selected;
- Docker service active and `docker run --rm hello-world` succeeds;
- sparse VHD and cache policy/timer match config;
- security/update state matches explicit config;
- no secret appears in artifacts;
- before/after limits and workload fingerprints match.

### 7. Roll back

```powershell
& "$skill\scripts\Invoke-HyperVVm.ps1" -Action Rollback -ConfigPath .\vm.psd1
```

Rollback uses the state bundle under the configured `StateDirectory`. It restores service startup
modes, policies, firewall profiles, update settings, service-host threshold, WSL config, and VM
memory configuration. It does not delete a VM or VHD unless `AllowDelete=true` and the user confirms
that exact path/name.

## Output

Return:

1. state/report paths;
2. VM connection method (no secret values);
3. before/after table with unchanged-limit proof;
4. verification results and any skipped checks;
5. rollback command;
6. risks introduced by opt-in security/update settings.

See `references/design.md` and `references/troubleshooting.md` for contracts and known failure modes.
