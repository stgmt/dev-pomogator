# Hyper-V VM skill design

## Goals

- Reproduce Windows LTSC and Ubuntu Server Hyper-V guests without machine-specific paths.
- Keep secrets outside repository artifacts and generated media.
- Support reliable login: PowerShell Direct/RDP for Windows; SSH keys for Linux.
- Install Docker CE without Docker Desktop, including WSL2 Docker on Windows guests.
- Repair nested virtualization safely for an existing Windows 11 Hyper-V guest.
- Make optimization measurable, role-based, reversible, and independent from resource caps.

## State machine

`absent -> planned -> media-ready -> created -> os-installed -> access-ready -> features-ready -> optimized -> verified`

Each transition writes a JSON state record atomically. Re-running resumes at the first incomplete
transition after validating existing artifacts. A mismatch in VM ID, VHD path, ISO hash, or config
fingerprint stops execution instead of replacing resources.

## Secret contract

Configuration contains only secret references. Scripts resolve a `SecureString` from
SecretManagement, an environment variable, or an interactive prompt. Secrets must not be passed in
PowerShell command-line arguments. Generated unattended/cloud-init media must use either SSH public
keys or a one-time random bootstrap secret. The bootstrap secret is removed after the final account
credential is set.

## Windows profile

- Generation 2; Microsoft Windows Secure Boot; optional vTPM.
- Installation source must be local and hash-verified, or downloaded from a configured official URL.
- PowerShell Direct is the primary transport and verification channel.
- WSL2 requires nested virtualization and a Windows build supported by the selected WSL release.
- Docker runs under Ubuntu systemd; no Docker Desktop dependency.

## Existing Windows 11 guest profile

An existing guest follows a separate, bounded state machine:

`observed -> shutdown-approved -> off -> processor-updated -> restarted -> runtime-verified`

`Set-HyperVVmNestedVirtualization.ps1` runs only on the parent host with administrator rights. It
captures VM identity, processor state, and the network-adapter state before mutation. A running VM
is changed only with `-AllowGuestShutdown`; shutdown is graceful and a timeout preserves the VM for
manual recovery instead of using `-TurnOff`. Rollback validates VM identity, restores only captured
values, and archives the snapshot after success. The existing-guest repair is generation-neutral:
Generation 1 and Generation 2 guests are reported and handled without reprovisioning, while the
new-VM Windows profile remains Generation 2.

Topology is classified from SMBIOS plus `HypervisorPresent`; raw processor flags are evidence but
not a topology oracle. On a root partition with an active hypervisor, false VM-monitor/SLAT fields
do not override a successful WSL2 kernel probe. On the Windows guest, verification requires both
the parent `ExposeVirtualizationExtensions` flag and live guest evidence: PowerShell Direct,
distribution version 2, `microsoft-standard-WSL2`, WSL processes, and optionally Docker daemon.

MAC spoofing is orthogonal to processor virtualization. It remains off unless explicitly requested
for a layer-2 forwarding design; ordinary NAT/double-NAT does not silently enable it.

## Ubuntu profile

- Generation 2; Microsoft UEFI Certificate Authority Secure Boot.
- Ubuntu Server ISO plus generated NoCloud seed ISO.
- SSH public-key authentication, `PasswordAuthentication no` by default.
- Docker CE from Docker's signed apt repository; the user is added to `docker` only when explicitly
  configured because the group grants root-equivalent access.

## Measurement validity

A before/after comparison is valid only when these fields match:

- VM ID and generation;
- CPU count;
- static/dynamic memory settings and all byte limits;
- WSL memory/swap settings;
- workload ID and running-container manifest;
- stabilization delay;
- guest build/kernel and Docker version.

Changing a cap is reported as capacity tuning, never as guest optimization.

## Optimization and rollback

Every optimization atomically records prior service modes, policy/registry values, firewall profiles,
service-host threshold, and WSL config before mutation. `Restore-HyperVVm.ps1` consumes that versioned
snapshot, restores only captured values, and archives it only after success. Repeated optimization is
refused until the active snapshot is restored; missing/foreign values are left untouched and reported.

Security/update changes are separate profile flags and are never implied by `Conservative`.
