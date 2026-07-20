# Troubleshooting

## Prerequisite failures

- `ADMIN_REQUIRED`: rerun on the parent Hyper-V host in an elevated PowerShell session. Do not
  interpret an access-denied `Get-VM` call as an absent VM or missing Hyper-V role.
- Hyper-V cmdlets missing: enable Hyper-V on a supported Windows edition and complete the required
  feature activation before retrying.
- No virtual switch: create/select one explicitly; do not silently attach to an arbitrary switch.
- VM name collision: inspect the existing VM and state bundle. Replace only with explicit approval.
- ISO checksum mismatch: delete the partial file and obtain it again from the official source.

## Windows guest

- PowerShell Direct says credential invalid: wait for OOBE/account creation, verify the configured
  user, and inspect Panther logs offline. Do not repeatedly reset credentials blindly.
- WSL reports `WSL_E_OS_NOT_SUPPORTED`: compare the Windows build against the chosen WSL release;
  install an official servicing update, reboot only when the package requires it, then retry.
- Nested WSL fails: confirm `ExposeVirtualizationExtensions`, guest VirtualMachinePlatform and WSL
  features, and sufficient host virtualization support. Read the processor flag with
  `Get-VMProcessor` on the parent host; it cannot be repaired from inside the Windows guest.
- A root host reports `VMMonitorModeExtensions=False` or `SLAT=False`: do not conclude that nested
  virtualization is missing. First classify root host versus guest and run a real WSL kernel probe.
  An active Hyper-V host can stop exposing meaningful raw capability flags to the root partition.
- `ALLOW_GUEST_SHUTDOWN_REQUIRED`: save guest work, obtain explicit downtime approval, and rerun
  `Set-HyperVVmNestedVirtualization.ps1 -Action Apply -AllowGuestShutdown`. The script deliberately
  refuses hard power-off.
- `GRACEFUL_SHUTDOWN_TIMEOUT`: inspect guest integration services and shut the guest down manually.
  Do not retry with `-TurnOff` unless the user separately authorizes possible data loss.
- `E_UNEXPECTED`: use `Test-HyperVVmNestedVirtualization.ps1` to capture the host processor flag,
  guest topology, WSL processes, kernel probe, and bounded Lxss/Host Compute/Hyper-V event evidence.
  The error is a symptom, not proof of a nested-virtualization root cause.
- Unattend fails: inspect `Windows\Panther\setuperr.log` and `UnattendGC`; validate computer-name,
  pass, component architecture, image index, partition types, and media drive discovery.

## Ubuntu guest

- No IP address: inspect switch/DHCP and `Get-VMNetworkAdapter`; do not guess an address.
- SSH host key changed: never bypass strict checking. Confirm the VM identity and state bundle, then run `Connect-HyperVVm.ps1 -EnrollHostKey`; enrollment accepts the scanned key only when its SHA-256 fingerprint matches config or `state.json`.
- cloud-init incomplete: inspect `cloud-init status --long` and `/var/log/cloud-init-output.log`.
- Docker access denied: use `sudo` or deliberately add the user to `docker`; document that this is
  root-equivalent access.

## Docker and WSL

- systemd unavailable: verify `/etc/wsl.conf`, run `wsl --shutdown`, then inspect PID 1.
- BuildKit GC not enforced: check `/etc/docker/daemon.json`, daemon restart, timer state, and builder
  driver. `defaultKeepStorage` applies to the Docker driver; custom buildx builders need their own
  `buildkitd.toml`.
- sparse conversion fails: terminate the distro, verify current WSL syntax/version, and preserve a
  VHD backup before `--allow-unsafe`.
- Docker networking fails only inside the nested guest: start with NAT/double-NAT diagnostics.
  Enable MAC spoofing only when the network design needs layer-2 forwarding; it is an explicit
  `-EnableMacAddressSpoofing` action and is rollback-tracked.

## Measurement anomalies

- Working-set totals exceed guest used memory: shared pages are double-counted; use guest used RAM
  and Hyper-V demand as primary physical metrics.
- Large before/after drop after a reboot: repeat both sides from equivalent clean boots and identical
  stabilization delays.
- Shell processes disappear: check whether a disconnected desktop session was logged off; report
  this separately from service-host consolidation.

## Security profile

- Firewall profiles off while `mpssvc` remains running is expected; BFE/network dependencies may
  require the service.
- Defender tamper protection can reject policy/service changes. Report the refusal; do not bypass
  endpoint management.
- Protected Windows Update services may restore themselves. Verify policies, service states, and
  scheduled tasks after reboot; provide rollback metadata.
