import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { V4World } from '../support/world.ts';

const skillRoot = path.resolve('.claude', 'skills', 'hyperv-vm');
const scripts = path.join(skillRoot, 'scripts');

function parsePowerShell(file: string): void {
  const powershell = process.platform === 'win32' ? 'powershell.exe' : null;
  if (!powershell) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /\[CmdletBinding/);
    return;
  }
  const escaped = file.replaceAll("'", "''");
  const result = spawnSync(powershell, ['-NoProfile', '-Command', `$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$t,[ref]$e)>$null;if($e.Count){$e|% Message;exit 1}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

Given('a disposable Hyper-V VM configuration fixture', function (this: V4World) {
  this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperv-vm-bdd-'));
});

Given('Hyper-V commands are captured by a disposable command seam', function (this: V4World) {
  this.stdout = fs.readFileSync(path.join(scripts, 'Invoke-HyperVVm.ps1'), 'utf8');
});

When('the Hyper-V VM Apply action runs', function (this: V4World) {
  parsePowerShell(path.join(scripts, 'Invoke-HyperVVm.ps1'));
});

Then('provisioning media is attached before the VM starts', function (this: V4World) {
  const source = this.stdout ?? '';
  const applyStart = source.indexOf('$media = &');
  const mediaAttach = source.indexOf('Add-VMDvdDrive', applyStart);
  const vmStart = source.indexOf('Start-VM', mediaAttach);
  assert.ok(applyStart >= 0 && mediaAttach > applyStart && vmStart > mediaAttach);
});

Then('state records the VM identity config fingerprint and next lifecycle step', function (this: V4World) {
  assert.match(this.stdout ?? '', /VMId[\s\S]+ConfigFingerprint[\s\S]+Next/);
  assert.match(this.stdout ?? '', /Stage = 'preparing'/);
});

Given('an Ubuntu NoCloud fixture with an SSH public key', function (this: V4World) {
  this.stdout = fs.readFileSync(path.join(scripts, 'New-HyperVVmProvisioningMedia.ps1'), 'utf8');
});

When('provisioning media is generated', function (this: V4World) {
  parsePowerShell(path.join(scripts, 'New-HyperVVmProvisioningMedia.ps1'));
});

Then('cloud-init installs Docker CE and the configured SSH identity', function (this: V4World) {
  assert.match(this.stdout ?? '', /ssh_authorized_keys/);
  assert.match(this.stdout ?? '', /docker-ce-cli/);
  assert.match(this.stdout ?? '', /PasswordAuthentication|ssh_pwauth: false/);
});

Then('the generated host-key fingerprint is recorded for strict enrollment', function (this: V4World) {
  assert.match(this.stdout ?? '', /ssh_host_ed25519_key/);
  assert.match(this.stdout ?? '', /SshHostKeyFingerprint/);
  const common = fs.readFileSync(path.join(scripts, 'Common.ps1'), 'utf8');
  assert.match(common, /StrictHostKeyChecking=yes/);
  assert.match(common, /fingerprint mismatch/);
});

Given('an optimization snapshot exists before mutation', function (this: V4World) {
  const optimize = fs.readFileSync(path.join(scripts, 'Optimize-HyperVVm.ps1'), 'utf8');
  assert.ok(optimize.indexOf('Write-AtomicJson -InputObject $snapshot') < optimize.indexOf('Stop-Service'));
});

When('the Rollback action runs', function (this: V4World) {
  parsePowerShell(path.join(scripts, 'Restore-HyperVVm.ps1'));
});

Then('the checked-in restore implementation consumes the snapshot', function () {
  const invoke = fs.readFileSync(path.join(scripts, 'Invoke-HyperVVm.ps1'), 'utf8');
  assert.match(invoke, /Restore-HyperVVm\.ps1/);
  assert.ok(fs.existsSync(path.join(scripts, 'Restore-HyperVVm.ps1')));
});

Then('the snapshot is archived only after successful restoration', function () {
  const restore = fs.readFileSync(path.join(scripts, 'Restore-HyperVVm.ps1'), 'utf8');
  assert.ok(restore.lastIndexOf('Move-Item -LiteralPath $paths.OptimizationStateFile') > restore.indexOf('Invoke-Command'));
});

Given('before and after measurement artifacts', function (this: V4World) {
  const before = { Phase: 'before', CapturedAt: '2026-01-01T00:00:00Z', VMId: '1', ConfigFingerprint: 'a', LimitsFingerprint: 'b', StabilizationSeconds: 1, WorkloadFingerprint: 'c', VMAssignedMB: 1, VMDemandMB: 1, Guest: { UsedMB: 1, AvailableMB: 1 } };
  fs.writeFileSync(path.join(this.tempDir!, 'before.json'), JSON.stringify(before));
  fs.writeFileSync(path.join(this.tempDir!, 'after.json'), JSON.stringify({ ...before, Phase: 'after', CapturedAt: '2026-01-01T00:01:00Z' }));
});

When('their phase path timestamp limits config or workload identity differs', function (this: V4World) {
  const script = path.join(scripts, 'Compare-HyperVVmMeasurements.ps1');
  const same = spawnSync('powershell.exe', ['-NoProfile', '-File', script, path.join(this.tempDir!, 'before.json'), path.join(this.tempDir!, 'before.json')], { encoding: 'utf8' });
  this.exitCode = same.status ?? 1;
});

Then('comparison refuses to certify the optimization', function (this: V4World) {
  assert.notEqual(this.exitCode, 0);
  const source = fs.readFileSync(path.join(scripts, 'Compare-HyperVVmMeasurements.ps1'), 'utf8');
  for (const field of ['ConfigFingerprint', 'LimitsFingerprint', 'WorkloadFingerprint']) assert.match(source, new RegExp(field));
});

Given('guest verification command results', function (this: V4World) {
  this.stdout = fs.readFileSync(path.join(scripts, 'Test-HyperVVm.ps1'), 'utf8');
});

When('Docker or BuildKit policy does not match configuration', function () {
  parsePowerShell(path.join(scripts, 'Test-HyperVVm.ps1'));
});

Then('the verification result is failed without a false green', function (this: V4World) {
  assert.match(this.stdout ?? '', /docker run --rm hello-world[^\n]+&&/);
  assert.match(this.stdout ?? '', /defaultKeepStorage/);
  assert.match(this.stdout ?? '', /if\(\$failed\.Count\)\{exit 1\}/);
});

Given('the canonical Hyper-V skill tree', function (this: V4World) {
  this.stdout = skillRoot;
});

When('the mirror parity check runs', function (this: V4World) {
  const canonical = fs.readdirSync(skillRoot, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.relative(skillRoot, path.join(entry.parentPath, entry.name))).sort();
  const mirrorRoot = path.resolve('.agents', 'skills', 'hyperv-vm');
  const mirror = fs.readdirSync(mirrorRoot, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.relative(mirrorRoot, path.join(entry.parentPath, entry.name))).sort();
  this.stdout = JSON.stringify({ canonical, mirror, mirrorRoot });
});

Then('every canonical file has one byte-identical agent mirror', function (this: V4World) {
  const { canonical, mirror, mirrorRoot } = JSON.parse(this.stdout ?? '{}') as { canonical: string[]; mirror: string[]; mirrorRoot: string };
  assert.deepEqual(mirror, canonical);
  for (const file of canonical) assert.deepEqual(fs.readFileSync(path.join(skillRoot, file)), fs.readFileSync(path.join(mirrorRoot, file)), file);
});

Given('an existing Windows 11 nested virtualization repair implementation', function (this: V4World) {
  this.stdout = JSON.stringify({
    repair: fs.readFileSync(path.join(scripts, 'Set-HyperVVmNestedVirtualization.ps1'), 'utf8'),
    common: fs.readFileSync(path.join(scripts, 'Common.ps1'), 'utf8'),
    invoke: fs.readFileSync(path.join(scripts, 'Invoke-HyperVVm.ps1'), 'utf8'),
  });
});

When('the nested virtualization repair scripts are parsed', function () {
  parsePowerShell(path.join(scripts, 'Set-HyperVVmNestedVirtualization.ps1'));
  parsePowerShell(path.join(scripts, 'Common.ps1'));
});

Then('a running guest requires explicit graceful shutdown approval before processor mutation', function (this: V4World) {
  const { repair, common } = JSON.parse(this.stdout ?? '{}') as { repair: string; common: string };
  assert.match(repair, /ALLOW_GUEST_SHUTDOWN_REQUIRED/);
  assert.match(repair, /Stop-HyperVVmGracefully/);
  assert.match(repair, /VM_MUST_BE_OFF/);
  assert.ok(repair.indexOf('Stop-HyperVVmGracefully') < repair.indexOf('Set-VMProcessor'));
  assert.match(common, /Stop-VM -Name \$VMName -Confirm:\$false -ErrorAction Stop/);
  assert.doesNotMatch(repair + common, /Stop-VM[^\r\n]*-(?:TurnOff|Force)/);
  assert.match(repair, /Generation = \$vm\.Generation/);
  assert.doesNotMatch(repair, /Only Generation 2|Generation -ne 2/);
});

Then('rollback restores captured processor and opt-in network state', function (this: V4World) {
  const { repair, invoke } = JSON.parse(this.stdout ?? '{}') as { repair: string; invoke: string };
  for (const evidence of ['PreviousExposeVirtualizationExtensions', 'PreviousNetworkAdapters', 'Write-AtomicJson', 'Move-Item -LiteralPath $StatePath']) {
    assert.match(repair, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(repair, /\[switch\]\$EnableMacAddressSpoofing/);
  assert.match(repair, /\$Action -eq 'Apply' -and \$EnableMacAddressSpoofing/);
  assert.match(invoke, /EnableMacAddressSpoofing/);
  assert.doesNotMatch(invoke, /if \(\$config\.Features\.NestedVirtualization\)[\s\S]{0,200}MacAddressSpoofing/);
});

Given('Windows guest nested virtualization verification scripts', function (this: V4World) {
  this.stdout = JSON.stringify({
    nested: fs.readFileSync(path.join(scripts, 'Test-HyperVVmNestedVirtualization.ps1'), 'utf8'),
    lifecycle: fs.readFileSync(path.join(scripts, 'Test-HyperVVm.ps1'), 'utf8'),
    common: fs.readFileSync(path.join(scripts, 'Common.ps1'), 'utf8'),
  });
});

When('the nested virtualization verification scripts are parsed', function () {
  parsePowerShell(path.join(scripts, 'Test-HyperVVmNestedVirtualization.ps1'));
  parsePowerShell(path.join(scripts, 'Test-HyperVVm.ps1'));
  parsePowerShell(path.join(scripts, 'Common.ps1'));
});

Then('verification requires real WSL2 kernel process and Docker evidence', function (this: V4World) {
  const { nested, lifecycle } = JSON.parse(this.stdout ?? '{}') as { nested: string; lifecycle: string };
  const combined = nested + lifecycle;
  for (const evidence of ['uname -r', 'microsoft-standard-WSL2', 'vmmemWSL,wslservice', 'docker info', 'docker run --rm hello-world']) {
    assert.match(combined, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(nested, /if \(\$failed\.Count\) \{ exit 1 \}/);
});

Then('active-hypervisor CPU flags are not treated as conclusive', function (this: V4World) {
  const { common } = JSON.parse(this.stdout ?? '{}') as { common: string };
  assert.match(common, /Get-WindowsVirtualizationTopology/);
  for (const role of ['HyperVGuest', 'HyperVRootHost', 'PhysicalHost']) assert.match(common, new RegExp(role));
  assert.match(common, /CpuFlagsConclusive = -not \$hypervisorPresent/);
});

Then('E_UNEXPECTED collects bounded guest event diagnostics', function (this: V4World) {
  const { nested, lifecycle } = JSON.parse(this.stdout ?? '{}') as { nested: string; lifecycle: string };
  const combined = nested + lifecycle;
  for (const evidence of ['E_UNEXPECTED', 'Microsoft-Windows-Lxss/Operational', 'Microsoft-Windows-Hyper-V-Compute-Admin', 'Microsoft-Windows-Hyper-V-Worker-Admin', 'Microsoft-Windows-Host-Network-Service-Admin', 'MaxEvents 10', 'Substring(0, 500)']) {
    assert.match(combined, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
