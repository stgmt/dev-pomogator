# Troubleshooting

## Prerequisite failures

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
  features, and sufficient host virtualization support.
- Unattend fails: inspect `Windows\Panther\setuperr.log` and `UnattendGC`; validate computer-name,
  pass, component architecture, image index, partition types, and media drive discovery.

## Ubuntu guest

- No IP address: inspect switch/DHCP and `Get-VMNetworkAdapter`; do not guess an address.
- SSH host key changed: confirm the VM identity and state bundle before removing the old key.
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
