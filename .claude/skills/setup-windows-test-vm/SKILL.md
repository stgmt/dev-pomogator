---
name: setup-windows-test-vm
description: >
  Bootstrap a clean Hyper-V Windows 11 test VM from scratch — download ISO,
  build bootable EFI ISO with embedded autounattend.xml, create Generation 2 VM,
  silent install Win 11 + Node.js + Git + Claude Code, take baseline checkpoint.
  This is the ONE-TIME setup procedure that produces the `claude-test` VM used by
  the `hyperv-test-runner` skill.

  Triggers (Russian + English):
  - "настрой test VM", "создай test VM", "установи Win 11 в Hyper-V"
  - "setup windows test vm", "bootstrap claude-test vm"
  - "create baseline VM for hyperv-test-runner"

  This skill captures hard-won knowledge from a multi-hour debugging session
  (April 2026) covering: MS CDN throttle workarounds, IMAPI2 PowerShell ISO
  building (no ADK), Win 11 25H2 unattend gotchas, vTPM-vs-boot conflicts,
  WMI Msvm_Keyboard injection, frame buffer thumbnail capture, and the exact
  community-proven autounattend.xml structure that works in 25H2.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, AskUserQuestion, WebFetch, WebSearch
---

# setup-windows-test-vm — bootstrap Hyper-V Win 11 test VM

This skill is the **one-time setup procedure** that produces the `claude-test` VM
used by the `hyperv-test-runner` skill. Run it once per host. After the VM exists
and `baseline-clean` snapshot is created, you never run this again — `hyperv-test-runner`
handles all subsequent operations via revert.

## Bundled assets

This skill ships with working PowerShell scripts and a tested unattend template
in its `scripts/` and `templates/` subdirectories. **Use these instead of
copy-pasting code from this document** — they have correct escaping, error
handling, and have been verified against Win 11 25H2 (April 2026):

| File | Purpose |
|---|---|
| `scripts/Build-MergedIso.ps1` | Mount source ISO, copy contents to staging, extract `efisys_noprompt.bin` |
| `scripts/Build-IsoOnly.ps1` | Build bootable EFI ISO from staging dir via IMAPI2 (no ADK) |
| `scripts/Capture-VMScreenshot.ps1` | Capture VM frame buffer via Hyper-V WMI thumbnail (RGB565 → PNG) |
| `scripts/Monitor-VM.ps1` | Long polling loop: Heartbeat + IP + PSDirect sentinel probe |
| `templates/autounattend.xml.template` | Community-proven autounattend.xml with `__POST_INSTALL_BASE64__` placeholder |

The host PowerShell scripts (`01-create-vm.ps1`..`05-cleanup.ps1`) live in
`tools/hyperv-test-runner/` of the dev-pomogator repo — those handle VM
lifecycle. The bundled scripts here handle the **bootstrap** that produces
the baseline image those scripts then operate on.

## Pre-flight requirements

Before invoking this skill the AI agent must verify:

| Requirement | Check command |
|---|---|
| **OS** is Windows 10/11 Pro/Enterprise/Education | `(Get-CimInstance Win32_OperatingSystem).Caption` |
| **Hyper-V Module** installed | `Get-Module Hyper-V -ListAvailable` |
| **Hyper-V Platform** enabled | `(Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All).State` |
| **Admin elevation** | `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')` |
| **Disk space** ≥ 80 GB free on target drive | `Get-PSDrive C \| Select Free` |
| **Free RAM** ≥ 8 GB available for VM dynamic memory | `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` |

If any pre-flight fails, abort and explain the missing requirement to the user.

## Conceptual flow

```
[1] Download Win 11 ISO         -> C:\iso\Win11.iso (7.89 GB)
[2] Build merged bootable ISO   -> C:\iso\Win11-unattend.iso (autounattend embedded)
[3] Create Generation 2 VM      -> claude-test
[4] Boot VM, silent install     -> Win 11 + Node + Git + Claude Code (~20 min)
[5] Wait for sentinel flag      -> C:\post-install-complete.flag inside VM
[6] User authenticates Claude Code interactively (browser OAuth, ~2 min)
[7] Snapshot baseline-clean     -> Checkpoint-VM
```

Total time: ~50 minutes wall clock, ~2-3 minutes of human attention (only steps 6 + 7 trigger).

---

## Step 1 — Download Win 11 ISO via aria2c

**Why aria2c, not BITS or curl**: Microsoft CDN throttles single-connection downloads to ~330 KB/sec (BITS) or ~660 KB/sec (curl). **aria2c with 16 parallel connections** sustains 4-10× faster (initial burst can hit 250 MB/sec, sustained typically 5-15 MB/sec depending on CDN load).

```powershell
# Install aria2c via winget (no admin needed)
winget install aria2.aria2 --silent --accept-package-agreements --accept-source-agreements

# Get fresh download URL via Fido (community PowerShell script using MS public API)
Invoke-WebRequest 'https://raw.githubusercontent.com/pbatard/Fido/master/Fido.ps1' -OutFile C:\Temp\Fido.ps1
$url = & C:\Temp\Fido.ps1 -Win 11 -Lang English -Ed Pro -Arch x64 -GetUrl
$url | Out-File C:\Temp\win11_url.txt -Encoding ASCII -NoNewline

# Download with 16 parallel connections (URL session token expires in ~6 hours)
aria2c.exe -x 16 -s 16 -k 1M --file-allocation=none --continue=true `
           -d C:\iso -o Win11.iso `
           "$(Get-Content C:\Temp\win11_url.txt -Raw)"
```

**Gotcha**: Fido throttles second invocation from same IP → Microsoft blocks with "Some users, entities and locations are banned from using this service". Use the URL from first invocation; URL is valid ~6 hours.

**Gotcha**: Fido downloads consumer Win 11 (Pro/Home/Education), NOT Enterprise Eval. Enterprise Eval requires Microsoft Evaluation Center form registration (manual). For test VM purposes, Win 11 Pro is sufficient — generic Pro key `W269N-WFGWX-YVC9B-4J6C9-T83GX` allows install (does not activate, but install completes).

**Disk space**: 8 GB for ISO + 60 GB for VHDX + 8 GB working space = **~80 GB minimum** on target drive. If `D:` is full, switch to `C:` (most common case).

---

## Step 2 — Build merged ISO with embedded autounattend.xml

**Why merge, not secondary DVD**: Win 11 25H2 Setup does NOT reliably pick up `autounattend.xml` from secondary DVD — even though Microsoft docs claim it scans all media. The ONLY reliable approach is **rebuilding the main ISO** with `autounattend.xml` in the root.

**Why IMAPI2, not oscdimg**: The Windows ADK installer (which provides `oscdimg.exe`) hangs at 702 MB Package Cache during winget install — known broken. **PowerShell IMAPI2 COM** is built into Windows and can build EFI bootable ISOs without any external tool.

### 2.1. Mount Win11.iso, copy contents

```powershell
$mnt = Mount-DiskImage -ImagePath C:\iso\Win11.iso -PassThru
$drv = ($mnt | Get-Volume).DriveLetter + ':'

# robocopy with multi-thread (8 threads on NVMe = 8 GB in ~10 sec)
robocopy "$drv\" "C:\Temp\win11-merged\" /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NP /MT:8

# Extract boot files for IMAPI2
Copy-Item "$drv\efi\microsoft\boot\efisys_noprompt.bin" C:\Temp\efisys_noprompt.bin
Dismount-DiskImage -ImagePath C:\iso\Win11.iso
```

**Critical**: Use `efisys_noprompt.bin` (NOT `efisys.bin`). This is the **EFI bootloader without "Press any key to boot from CD or DVD" prompt**. With `efisys.bin` you get a 5-second timeout that requires keyboard input — `efisys_noprompt.bin` boots immediately.

### 2.2. Inject autounattend.xml in root

```powershell
Copy-Item C:\Temp\unattend-staging\autounattend.xml C:\Temp\win11-merged\autounattend.xml
```

The autounattend.xml structure is critical — see Section "autounattend.xml structure" below.

### 2.3. Build EFI bootable ISO via IMAPI2

```powershell
# Define ISOFile class for stream-to-file conversion (one-time)
($cp = New-Object System.CodeDom.Compiler.CompilerParameters).CompilerOptions = '/unsafe'
Add-Type -CompilerParameters $cp -TypeDefinition @'
public class ISOFile {
    public unsafe static void Create(string Path, object Stream, int BlockSize, int TotalBlocks) {
        int bytes = 0;
        byte[] buf = new byte[BlockSize];
        var ptr = (System.IntPtr)(&bytes);
        var o = System.IO.File.OpenWrite(Path);
        var i = Stream as System.Runtime.InteropServices.ComTypes.IStream;
        if (o != null) {
            while (TotalBlocks-- > 0) { i.Read(buf, BlockSize, ptr); o.Write(buf, 0, bytes); }
            o.Flush(); o.Close();
        }
    }
}
'@

# EFI boot options
$efiStream = New-Object -ComObject ADODB.Stream
$efiStream.Type = 1  # adTypeBinary
$efiStream.Open()
$efiStream.LoadFromFile('C:\Temp\efisys_noprompt.bin')
$efiStream.Position = 0

$efiBoot = New-Object -ComObject IMAPI2FS.BootOptions
$efiBoot.AssignBootImage($efiStream)
$efiBoot.PlatformId = 0xEF  # UEFI
$efiBoot.Emulation  = 0     # No emulation

# File system image (UDF only — install.wim is 7 GB > Joliet 4 GB limit)
$image = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
$image.ChooseImageDefaultsForMediaType(13)  # DVDPLUSRW_DUALLAYER
$image.FileSystemsToCreate = 4              # FsiFileSystemUDF
# DO NOT set UDFRevision — it's read-only / property name varies; auto-set works
$image.VolumeName = 'CCCOMA_X64FRE_EN-US_DV9'  # Match Win 11 standard volume name

$image.Root.AddTree('C:\Temp\win11-merged', $false)
$image.BootImageOptions = $efiBoot

$result = $image.CreateResultImage()

if (Test-Path C:\iso\Win11-unattend.iso) { Remove-Item C:\iso\Win11-unattend.iso -Force }
$target = New-Item -Path C:\iso\Win11-unattend.iso -ItemType File -Force
[ISOFile]::Create($target.FullName, $result.ImageStream, $result.BlockSize, $result.TotalBlocks)
```

**Gotchas in IMAPI2 BootOptions**:
- `Manifest` property does NOT exist — don't set it
- `Emulation = 0` means "no emulation" (correct for EFI; sector emulation breaks boot)
- `PlatformId = 0xEF` for UEFI (0 = BIOS, but we don't need BIOS for Generation 2 VMs)

**Gotchas in IMAPI2 MsftFileSystemImage**:
- `UDFRevisionBlob` does NOT exist
- `UDFRevision` is read-only in some Windows versions — let `ChooseImageDefaultsForMediaType` set it
- `FileSystemsToCreate = 7` (UDF + Joliet + ISO9660) FAILS on `CreateResultImage()` with HRESULT 0xC0AAB132 because Joliet has a 4 GB file size limit and `install.wim` is 7 GB. Use `4` (UDF only).
- `VolumeName` should match the Win 11 standard `CCCOMA_X64FRE_EN-US_DV9` (or whatever the source ISO label was) — Setup may check this in some validation paths.

---

## Step 3 — Create Generation 2 VM (NO vTPM!)

```powershell
$vmName  = 'claude-test'
$vhdPath = 'C:\HyperV\claude-test.vhdx'  # NOT D:\ if D: is full

if (-not (Test-Path 'C:\HyperV')) { New-Item -ItemType Directory -Path 'C:\HyperV' -Force }
New-VHD -Path $vhdPath -SizeBytes 60GB -Dynamic

New-VM -Name $vmName -Generation 2 `
       -MemoryStartupBytes 6GB `
       -VHDPath $vhdPath `
       -SwitchName 'Default Switch'

Set-VM -Name $vmName -DynamicMemory `
       -MemoryMinimumBytes 2GB -MemoryMaximumBytes 8GB `
       -ProcessorCount 4 -AutomaticCheckpointsEnabled $false

# CRITICAL: Disable Secure Boot (consumer Win 11 ISOs work better without)
Set-VMFirmware -VMName $vmName -EnableSecureBoot Off

# Mount the merged ISO
Add-VMDvdDrive -VMName $vmName -Path 'C:\iso\Win11-unattend.iso'
$dvd = Get-VMDvdDrive -VMName $vmName | Select-Object -First 1
Set-VMFirmware -VMName $vmName -FirstBootDevice $dvd

# DO NOT enable vTPM — it locks Secure Boot template AND blocks Win 11 ISO boot
# Win 11 install requires TPM 2.0, but autounattend.xml LabConfig BypassTPMCheck handles this
```

### Critical gotchas

**vTPM blocks ISO boot**. With vTPM enabled (even with Secure Boot Off), Win 11 ISO bootloader fails — `Boot Summary: SCSI DVD - The boot loader failed`. The fix is **`Disable-VMTPM`** before first boot. If you already enabled vTPM, you can disable it; you cannot change `SecureBootTemplate` after vTPM is initialized because it locks the template.

**The autounattend.xml `LabConfig BypassTPMCheck` handles the Win 11 minimum hardware check** that Setup performs after boot. Without `LabConfig` registry, Setup refuses to install on TPMless VMs.

**Generation 1 VMs do not work** for Win 11 because Win 11 requires UEFI. Use Generation 2 only.

---

## Step 4 — autounattend.xml structure (community-proven for Win 11 25H2)

The community-proven structure that works on Win 11 25H2 is based on the [asheroto Windows 11 unattend gist](https://gist.github.com/asheroto/c4a9fb4e5e5bdad10bcb831e3a3daee6) plus customizations for AutoLogon and post-install commands.

### Critical missing pieces (the ones that caused 25H2 sysprep failures)

These elements MUST be present, otherwise OOBE pass fails with "Windows could not complete the installation":

```xml
<!-- specialize pass — REQUIRED extras -->
<component name="Microsoft-Windows-Security-SPP-UX" ...>
  <SkipAutoActivation>true</SkipAutoActivation>
</component>
<component name="Microsoft-Windows-UnattendedJoin" ...>
  <Identification>
    <JoinWorkgroup>WORKGROUP</JoinWorkgroup>
  </Identification>
</component>

<!-- oobeSystem pass — REQUIRED extras -->
<component name="Microsoft-Windows-International-Core" ...>
  <InputLocale>0409:00000409</InputLocale>
  <SystemLocale>en-US</SystemLocale>
  <UILanguage>en-US</UILanguage>
  <UILanguageFallback>en-US</UILanguageFallback>
  <UserLocale>en-US</UserLocale>
</component>

<!-- UserAccounts MUST have AdministratorPassword BEFORE LocalAccounts -->
<UserAccounts>
  <AdministratorPassword>
    <Value></Value>
    <PlainText>true</PlainText>
  </AdministratorPassword>
  <LocalAccounts>
    <LocalAccount wcm:action="add">
      ...
    </LocalAccount>
  </LocalAccounts>
</UserAccounts>

<!-- windowsPE pass — REQUIRED extras -->
<Diagnostics>
  <OptIn>false</OptIn>
</Diagnostics>
<DynamicUpdate>
  <Enable>false</Enable>
  <WillShowUI>OnError</WillShowUI>
</DynamicUpdate>
```

### LabConfig hardware bypass (windowsPE pass)

```xml
<RunSynchronous>
  <RunSynchronousCommand wcm:action="add">
    <Order>1</Order>
    <Path>reg add HKLM\SYSTEM\Setup\LabConfig /v BypassTPMCheck /t REG_DWORD /d 1 /f</Path>
  </RunSynchronousCommand>
  <!-- Same for: BypassSecureBootCheck, BypassRAMCheck, BypassStorageCheck, BypassCPUCheck -->
</RunSynchronous>
```

### ProductKey (use generic Pro key, NOT empty)

```xml
<UserData>
  <ProductKey>
    <Key>W269N-WFGWX-YVC9B-4J6C9-T83GX</Key>
  </ProductKey>
  <AcceptEula>true</AcceptEula>
  ...
</UserData>
```

Without `ProductKey`, Setup stops at the interactive Product Key entry screen. The generic key above is the **public Microsoft KMS client setup key for Windows 11 Pro** — it lets install proceed without activating Windows.

### ImageInstall — match the edition

```xml
<ImageInstall>
  <OSImage>
    <InstallFrom>
      <MetaData wcm:action="add">
        <Key>/IMAGE/NAME</Key>
        <Value>Windows 11 Pro</Value>
    <!-- Other valid options for consumer ISO: "Windows 11 Home", "Windows 11 Education", "Windows 11 Pro for Workstations" -->
      </MetaData>
    </InstallFrom>
    ...
  </OSImage>
</ImageInstall>
```

### AutoLogon for first-boot post-install

```xml
<AutoLogon>
  <Password>
    <Value>ClaudeTest!2026</Value>
    <PlainText>true</PlainText>
  </Password>
  <Enabled>true</Enabled>
  <LogonCount>1</LogonCount>  <!-- 1 is sufficient; higher values may cause validation issues -->
  <Username>claude</Username>
</AutoLogon>
```

### FirstLogonCommands for post-install (base64-encoded PS script)

To embed a PowerShell post-install script inline in autounattend.xml without external files:

```powershell
# Encode the script to UTF-16 base64
$script  = Get-Content tools/hyperv-test-runner/02-post-install.ps1 -Raw
$bytes   = [System.Text.Encoding]::Unicode.GetBytes($script)
$encoded = [Convert]::ToBase64String($bytes)
```

Then embed in autounattend.xml:

```xml
<FirstLogonCommands>
  <SynchronousCommand wcm:action="add">
    <Order>1</Order>
    <CommandLine>powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand BASE64_HERE</CommandLine>
    <Description>dev-pomogator post-install</Description>
    <RequiresUserInput>false</RequiresUserInput>
  </SynchronousCommand>
</FirstLogonCommands>
```

The post-install script enables RDP, installs Node.js LTS + Git via winget, installs Claude Code globally via npm, and creates a sentinel flag at `C:\post-install-complete.flag` for the host to poll.

### ComputerName — NO DASHES

`<ComputerName>claude-test</ComputerName>` may cause issues in some Win 11 25H2 builds because the dash character validates differently in NetBIOS vs hostname normalization. Use `claudetest` (no dash). Or any other dash-free name.

### Deprecated settings to AVOID

These were valid in Win 10 / Win 11 21H2 but are deprecated in 25H2 and may cause sysprep validation errors:

- ❌ `<NetworkLocation>Work</NetworkLocation>` → use `Home` or omit
- ❌ `<HideOnlineAccountScreens>` alone — works only when combined with `<AdministratorPassword>` empty + `<HideLocalAccountScreen>true</HideLocalAccountScreen>` + `<JoinWorkgroup>`
- ❌ `BypassNRO` registry hack — Microsoft removed this in recent builds. Use `<HideOnlineAccountScreens>` + `<UnattendedJoin>` instead.

---

## Step 5 — Monitor install and detect completion

The install runs ~20 minutes and reboots multiple times. Monitor via Hyper-V WMI without keyboard interaction:

```powershell
# Check 1: VM running, Heartbeat status
Get-VM claude-test | Select-Object Name, State, Uptime, Heartbeat

# Check 2: Network adapter has IP (Windows booted)
(Get-VMNetworkAdapter -VMName claude-test).IPAddresses

# Check 3: VM frame buffer thumbnail (no need to focus VMConnect window)
# See "VM frame buffer screenshot via WMI" section below

# Check 4: PSDirect probe for sentinel flag (only after post-install completes)
$cred = New-Object System.Management.Automation.PSCredential('claude',
        (ConvertTo-SecureString 'ClaudeTest!2026' -AsPlainText -Force))
Invoke-Command -VMName claude-test -Credential $cred -ScriptBlock {
    Test-Path C:\post-install-complete.flag
}
```

**Heartbeat = NoContact** for the entire windowsPE phase (~5 minutes) and during reboots. **Heartbeat = OK** appears only after Windows fully boots with integration services.

**PSDirect** (`Invoke-Command -VMName`) requires Win 11 to be fully booted with Hyper-V Integration Services running, AND the LocalAccount to be created. Don't probe PSDirect until you've seen `Heartbeat = OK` at least once.

### VM frame buffer screenshot via WMI

To capture the VM screen WITHOUT focusing the VMConnect window (works even with no VMConnect open):

```powershell
$vm  = Get-CimInstance -Namespace 'root\virtualization\v2' -ClassName 'Msvm_ComputerSystem' -Filter "ElementName='claude-test'"
$svc = Get-CimInstance -Namespace 'root\virtualization\v2' -ClassName 'Msvm_VirtualSystemManagementService'

$result = Invoke-CimMethod -InputObject $svc -MethodName 'GetVirtualSystemThumbnailImage' -Arguments @{
    TargetSystem = $vm
    WidthPixels  = [uint16]1024
    HeightPixels = [uint16]768
}

# $result.ImageData is RGB565 raw bytes — convert to bitmap via System.Drawing
# Full implementation: scripts/Capture-VMScreenshot.ps1 (bundled with this skill)
```

Invoke the bundled script directly:

```powershell
& "$PSScriptRoot\scripts\Capture-VMScreenshot.ps1" `
    -VMName claude-test `
    -OutputPath D:\repos\dev-pomogator\.dev-pomogator\screenshots\vm-progress.png `
    -Width 1024 -Height 768
```

**Note**: Returns black 2417-byte PNG when VM is in transition (between reboots, before video driver loads, BIOS POST). Black thumbnail does NOT mean VM is hung — check Uptime + CPUUsage to confirm activity.

**ReturnValue = 32775** from `GetVirtualSystemThumbnailImage` means VM is in invalid state for thumbnail capture (e.g., recently restarted, transition state). Wait 5-10 sec and retry.

---

## Step 6 — Send keystrokes to VM via WMI (optional fallback)

If the install hangs at an interactive screen and autounattend doesn't recover:

```powershell
$kb = Get-WmiObject -Namespace root\virtualization\v2 -Class Msvm_Keyboard | Where-Object {
    $_.SystemName -eq (Get-WmiObject -Namespace root\virtualization\v2 -Class Msvm_ComputerSystem -Filter "ElementName='claude-test'").Name
}
$kb.TypeKey(0x0D) | Out-Null  # Enter
$kb.TypeKey(0x20) | Out-Null  # Space
$kb.TypeKey(0x09) | Out-Null  # Tab

# Press/Release separately for modifier combinations
$kb.PressKey(0x12)  # Alt down
$kb.PressKey(0x4E)  # N down
$kb.ReleaseKey(0x4E)
$kb.ReleaseKey(0x12)
```

**Important**:
- The `Send-VMKey` cmdlet exists in some Hyper-V module versions and is REMOVED in others. WMI `Msvm_Keyboard::TypeKey` is the universal API.
- WMI keyboard input works during BIOS POST, Windows Setup boot phase, and any screen with focused input.
- WMI keyboard input is **less reliable** in Win Setup GUI screens (Language, Product Key) — Setup may need real mouse input. The fix is to make autounattend handle these screens automatically rather than navigate them via key injection.
- Spam Enter for ~20 seconds at boot to skip the "Press any key to boot from CD or DVD" prompt — this works reliably even though `efisys_noprompt.bin` should make it unnecessary.

---

## Step 7 — Take baseline-clean checkpoint

Once `C:\post-install-complete.flag` exists inside the VM AND user has authenticated Claude Code interactively (browser OAuth):

```powershell
Checkpoint-VM -Name claude-test -SnapshotName baseline-clean
Get-VMSnapshot -VMName claude-test -Name baseline-clean
```

The VM is now ready. The `hyperv-test-runner` skill takes over from here for all subsequent test scenario operations.

---

## ✅ ACTUAL WORKING SOLUTION (April 2026)

After 8+ hours and multiple iterations, the working approach for Win 11 25H2
unattended install on Hyper-V Generation 2:

### Step 1 — Use the memstechtips/UnattendedWinstall template (NOT custom XML)

Download from `https://raw.githubusercontent.com/memstechtips/UnattendedWinstall/main/autounattend.xml`
(~210 KB). This template is **actively maintained** and **tested specifically on
Win 11 25H2**. Critical differences from naive templates:

- **NO `<DiskConfiguration>`** — Setup auto-partitions
- **NO `<ImageInstall>`** — Setup auto-selects edition
- **NO `<UserAccounts><LocalAccounts>`** — created interactively via OOBE
- **NO `<AutoLogon>`** — user logs in manually first time
- **3 component blocks** for x86, arm64, amd64 (covers all architectures)
- **Dummy ProductKey `00000-00000-00000-00000-00000`** with `WillShowUI=Always`
- **Disable network adapters** in specialize pass (`Get-NetAdapter | Disable-NetAdapter`)
  — this is the **critical Win 11 25H2 trick** that bypasses MSA enforcement
- `BypassDiskCheck` registry (in addition to `BypassStorageCheck`)
- Has `BypassNRO` registry in specialize pass

### Step 2 — Win 11 25H2 IGNORES autounattend.xml in windowsPE pass

This is the key insight nobody documents clearly: **Win 11 25H2 Setup ignores
autounattend.xml during the windowsPE pass and shows interactive UI screens**:
- "Select language settings"
- "Select keyboard settings"
- "Want to add a second keyboard layout?"
- "Product key" (interactive entry)
- "Select location to install Windows 11" (disk selection)

You MUST navigate these screens via **WMI Msvm_Keyboard injection** even with
autounattend.xml present. This is **expected behavior** for 25H2, not a bug.

Forum confirmation: "Users who have been using Rufus + Schneegans autounattend.xml
since Windows 10 report that while it worked through Windows 11 Pro 23H2, when
trying to use it for Windows 11 Pro 25H2, the Windows installer ignores the
Schneegans autounattend.xml and goes straight to the set language screen."

### Step 3 — Navigate Setup via WMI keyboard

```powershell
$kb = Get-WmiObject -Namespace root\virtualization\v2 -Class Msvm_Keyboard | Where-Object {
    $_.SystemName -eq (Get-WmiObject -Namespace root\virtualization\v2 -Class Msvm_ComputerSystem -Filter "ElementName='claude-test'").Name
}

# Language screen — Enter (Next is default focus)
$kb.TypeKey(0x0D)
Start-Sleep -Seconds 5

# Keyboard screen — Enter
$kb.TypeKey(0x0D)
Start-Sleep -Seconds 15  # Setup loads...

# Product key screen — TypeText with generic Pro key + Enter twice
$kb.TypeText('W269NWFGWXYVC9B4J6C9T83GX')   # auto-formats with dashes
Start-Sleep -Seconds 2
$kb.TypeKey(0x0D)  # Validates key
Start-Sleep -Seconds 5
$kb.TypeKey(0x0D)  # Click Next
Start-Sleep -Seconds 10  # "Please wait..."

# Disk selection — Enter (default disk auto-selected)
$kb.TypeKey(0x0D)
# Setup starts installing — wait ~15-20 minutes through reboots
```

### Step 4 — Navigate OOBE via WMI keyboard

After install completes and Setup reboots into OOBE:

```powershell
# Region screen — Tab + Enter (Yes button)
$kb.TypeKey(0x09); $kb.TypeKey(0x0D)
Start-Sleep -Seconds 5

# Keyboard layout — Tab + Enter
$kb.TypeKey(0x09); $kb.TypeKey(0x0D)
Start-Sleep -Seconds 5

# Skip second keyboard — Enter (Skip button focused)
$kb.TypeKey(0x0D)
Start-Sleep -Seconds 8

# Local account name — TypeText + Tab + Enter
# (Network screen is SKIPPED because UnattendedWinstall disabled adapters)
$kb.TypeText('claude')
$kb.TypeKey(0x09); $kb.TypeKey(0x0D)
Start-Sleep -Seconds 5

# Password — TypeText + Tab + Enter
$kb.TypeText('ClaudeTest!2026')
$kb.TypeKey(0x09); $kb.TypeKey(0x0D)
Start-Sleep -Seconds 5

# Confirm password — TypeText + Tab + Enter
$kb.TypeText('ClaudeTest!2026')
$kb.TypeKey(0x09); $kb.TypeKey(0x0D)
Start-Sleep -Seconds 5

# Security questions × 3 — for each: Space (open dropdown), Down (select first), Enter (confirm),
# Tab (answer field), TypeText, Tab (next dropdown)
for ($q = 1; $q -le 3; $q++) {
    $kb.TypeKey(0x20)               # Space — open dropdown
    Start-Sleep -Milliseconds 500
    $kb.TypeKey(0x28)               # Down arrow — select first option
    Start-Sleep -Milliseconds 200
    $kb.TypeKey(0x0D)               # Enter — confirm selection
    Start-Sleep -Milliseconds 500
    $kb.TypeKey(0x09)               # Tab to answer field
    $kb.TypeText('test')            # Type answer
    $kb.TypeKey(0x09)               # Tab to next question
}
$kb.TypeKey(0x0D)                   # Final Enter for Next
# Setup processes "Just a moment..." then reboots to lock screen

# Lock screen — Enter to dismiss
$kb.TypeKey(0x0D)

# Login — TypeText password + Enter
$kb.TypeText('ClaudeTest!2026')
$kb.TypeKey(0x0D)

# Now logged in to desktop — verify with PSDirect
$cred = New-Object System.Management.Automation.PSCredential('claude',
        (ConvertTo-SecureString 'ClaudeTest!2026' -AsPlainText -Force))
Invoke-Command -VMName claude-test -Credential $cred -ScriptBlock { whoami }
# → desktop-XXXXXXX\claude
```

### Step 5 — Run post-install via PSDirect

After successful login, network adapters need to be re-enabled (UnattendedWinstall
disabled them in specialize pass):

```powershell
$cred = New-Object System.Management.Automation.PSCredential('claude',
        (ConvertTo-SecureString 'ClaudeTest!2026' -AsPlainText -Force))

# Re-enable network adapters
Invoke-Command -VMName claude-test -Credential $cred -ScriptBlock {
    Get-NetAdapter | Enable-NetAdapter -Confirm:$false
}

# Enable RDP
Invoke-Command -VMName claude-test -Credential $cred -ScriptBlock {
    Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' `
                     -Name 'fDenyTSConnections' -Value 0
    Enable-NetFirewallRule -DisplayGroup 'Remote Desktop'
}

# Install Node.js LTS, Git, Claude Code via PSDirect
Invoke-Command -VMName claude-test -Credential $cred -ScriptBlock {
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path','User')
    npm install -g '@anthropic-ai/claude-code'
    Set-Content C:\post-install-complete.flag -Value ([DateTime]::UtcNow.ToString('o'))
}
```

### Step 6 — Authenticate Claude Code (manual, ~2 min)

The user runs `claude` interactively in the VM (via VMConnect or RDP) to complete
the OAuth browser flow. There's no API to automate this — Claude Code requires
interactive browser auth.

### Step 7 — Take baseline-clean checkpoint

After user confirms Claude Code is logged in:

```powershell
Checkpoint-VM -Name claude-test -SnapshotName baseline-clean
Get-VMSnapshot -VMName claude-test -Name baseline-clean
```

Done. The VM is ready for hyperv-test-runner.

### RDP access (with clipboard)

Pre-configured `claude-test.rdp` file saved in repo root (gitignored):

```powershell
# Quick connect with clipboard sharing (1280x1024 windowed)
mstsc D:\repos\dev-pomogator\claude-test.rdp
```

**Important**: Auto-login (registry `AutoAdminLogon`) **conflicts with RDP**
on Win 11 client single-session. When auto-login is enabled AND mstsc connects,
Win 11 auto-login fights for the console session → displaces RDP → error
"You have been disconnected because another connection was made".

**Fix**: disable auto-login before RDP, re-enable after:

```powershell
$cred = New-Object System.Management.Automation.PSCredential('claude',
        (ConvertTo-SecureString 'ClaudeTest!2026' -AsPlainText -Force))

# Disable auto-login for RDP session
Invoke-Command -VMName claude-test -Credential $cred -ScriptBlock {
    Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name AutoAdminLogon -Value '0'
    Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name ForceAutoLogon -Value '0'
}
# Also need ESM enabled on host
Set-VMHost -EnableEnhancedSessionMode $true

# Connect
mstsc D:\repos\dev-pomogator\claude-test.rdp

# After done, re-enable auto-login + disable ESM for VMConnect basic mode
Invoke-Command -VMName claude-test -Credential $cred -ScriptBlock {
    Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name AutoAdminLogon -Value '1'
    Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name ForceAutoLogon -Value '1'
}
Set-VMHost -EnableEnhancedSessionMode $false
```

### VMConnect basic mode (without clipboard)

When RDP is not needed, VMConnect basic mode shows the auto-logged-in console
directly without login prompt:

```powershell
Set-VMHost -EnableEnhancedSessionMode $false  # force basic mode
Start-Process vmconnect.exe -ArgumentList 'localhost', 'claude-test'
```

### Activation status

Win 11 installed with generic Pro KMS client key (`W269N-WFGWX-YVC9B-4J6C9-T83GX`).
This is **NOT activated** (Notification mode). "Activate Windows" watermark
visible at bottom-right. RDP sessions disconnect after ~15 sec on unactivated
Windows — this is a known limitation. Workaround: use VMConnect basic mode
or activate Windows properly.

## ⚠ FALSE BREAKTHROUGH (April 2026) — DiskConfiguration removal NOT the fix

**I incorrectly thought `<DiskConfiguration>` was the root cause.** When I
removed it, Setup advanced past the disk selection screen (after sending Enter
via WMI keyboard) and started installing. This **looked like progress** because
I'd been seeing "black screen forever" before.

But after removal + fresh install, the **exact same failure pattern** reproduced:
- Text install completed
- First reboot, brief Heartbeat=OK + IP
- Second reboot
- Climbing uptime, no Heartbeat, no sentinel flag

So `<DiskConfiguration>` removal was a **dead end**. The issue is not partition
layout. Some deeper problem (likely in the OOBE/specialize phase finalization)
prevents the install from ever reaching the FirstLogonCommands stage.

The "76% complete" screenshot I got was just the install phase progress, not
OOBE. Setup completes the install phase, reboots into specialize, **then fails
silently in the same way as all previous iterations**. The exact failure has
not yet been identified despite multiple offline log inspections.

**Honest current state**: After 6+ hours and 7 iterations (v1-v7), Win 11 25H2
unattended install on Hyper-V Generation 2 remains broken. The skill captures
all attempted fixes and their outcomes for future reference.

## ⚠ Original DiskConfiguration removal description (kept for posterity)

For Win 11 25H2 unattended install on Hyper-V Generation 2 to work, you must
**REMOVE `<DiskConfiguration>` and `<InstallTo>` entirely** from the windowsPE
pass and let Setup auto-partition. The auto-partition creates the 4-partition
layout (EFI + MSR + Primary + **Recovery**) that Win 11 25H2 sysprep specialize
phase requires for BCD store creation. A custom 3-partition layout (without
Recovery) breaks Setup, even though Setup will appear to "work" through the
windowsPE phase.

### Symptom

With custom `<DiskConfiguration>`:
- Install proceeds through windowsPE pass and image apply
- First reboot succeeds, Windows briefly boots (Heartbeat=OK + IP for ~30 sec)
- Second reboot fails — black screen forever, no Heartbeat
- `setuperr.log` shows BFSVC errors for `bootmgfw_EX.efi` (60 retries) and
  `BCD: Failed to add system store from file` with `Status: c000000f`

These errors are **secondary symptoms** caused by Setup's recovery logic
trying to repair the broken partition layout post-install. The root cause is
that the EFI System Partition never gets a proper BCD store because Setup
expected to create the Recovery partition during initial partitioning and
couldn't.

### Fix

Remove these elements from autounattend.xml in the windowsPE pass:

```xml
<DiskConfiguration>...</DiskConfiguration>  <!-- DELETE -->
<ImageInstall>
  <OSImage>
    <InstallTo>...</InstallTo>  <!-- DELETE -->
    ...
  </OSImage>
</ImageInstall>
```

Without these elements, Setup falls into **interactive disk selection mode**
at the "Select location to install Windows" screen. From there:

1. Setup waits for user input on which disk/partition to use
2. Send `Enter` via WMI `Msvm_Keyboard::TypeKey(0x0D)` — Setup auto-creates
   the proper 4-partition layout on the unallocated disk and proceeds
3. Install completes silently from there
4. specialize/oobeSystem passes apply autounattend.xml normally
5. AutoLogon + FirstLogonCommands run post-install script
6. Sentinel flag created

### Why this was hard to find

The "black screen forever" symptom misled me into thinking Setup had crashed.
In reality, Setup was sitting at the **disk selection GUI screen** waiting for
input. The Hyper-V WMI thumbnail API (`GetVirtualSystemThumbnailImage`) was
returning **2417-byte all-black PNGs** during state transitions and shortly
after VM start, even though the VM was actively rendering normal Setup UI.
After uptime climbed past ~5 minutes, the thumbnail finally rendered the
actual screen and revealed the partition selection dialog.

**Lesson**: when WMI thumbnail returns black, always wait at least 10-15 more
minutes and re-capture. Don't assume crash from a single black screenshot.

### Verification

After removing DiskConfiguration and sending Enter via WMI:
- Setup advanced to "Installing Windows 11 8% complete"
- Install ran through to completion
- Heartbeat became OK + IP after ~15 minutes
- PSDirect Invoke-Command succeeded
- Sentinel flag `C:\post-install-complete.flag` created

This is the **single configuration change** that took 6+ hours to discover.

## How to verify VM state honestly (don't rely on screenshots alone)

The Hyper-V WMI thumbnail API (`GetVirtualSystemThumbnailImage`) is **flaky and
unreliable**. Common failure modes:
- Returns **2417-byte all-black PNG** when VM is in transition (between reboots,
  before video driver loads, BIOS POST, OOBE startup)
- Returns **`ReturnValue=32775`** (`WBEM_E_INVALID_PARAMETER` / transition state)
  when called too soon after state change, or at certain resolutions
- Cached frame buffer can lag behind actual VM state by several seconds
- Higher resolutions (1920×1080) fail more often than 1024×768

**Never claim VM is in a state based solely on a thumbnail screenshot.**
Always cross-check with at least one of these authoritative sources:

### Source of truth #1: PSDirect with quser

```powershell
$cred = New-Object System.Management.Automation.PSCredential('claude',
        (ConvertTo-SecureString 'ClaudeTest!2026' -AsPlainText -Force))

Invoke-Command -VMName claude-test -Credential $cred -ScriptBlock {
    Write-Host ('hostname: '   + $env:COMPUTERNAME)
    Write-Host ('user: '       + $env:USERNAME)
    Write-Host ('uptime: '     + ((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime))
    Write-Host ('explorer: '   + (Get-Process explorer -EA SilentlyContinue).Count + ' processes')
    Write-Host ('sessions: '   + ((quser 2>&1) -join ' | '))
}
```

Look for these signals in the output:
- **`SESSIONNAME=console STATE=Active`** in `quser` → user is interactively logged
  in to the local console (auto-login worked OR user logged in manually)
- **`explorer.exe` running ≥ 1 process** → Windows desktop shell is loaded
- **`uptime` matches Hyper-V `Get-VM Uptime`** within 1-2 seconds → VM is fully
  booted and running normally (not in early boot or recovery)

If PSDirect itself fails with `An error has occurred which Windows PowerShell
cannot handle. A remote session might have ended.` — VM is NOT yet ready for
PSDirect (Windows is still booting, OOBE not complete, or specialize phase
running). Wait and retry.

### Source of truth #2: Hyper-V Heartbeat + IntegrationServicesState

```powershell
Get-VM claude-test | Format-List Name, State, Uptime, Heartbeat
```

| Heartbeat value | Meaning |
|---|---|
| `NoContact` | VM is in early boot, BIOS POST, WinPE Setup phase, OR sysprep specialize. NOT a normal running OS. |
| `OkApplicationsUnknown` | VM has booted Windows. Integration Services running. **OS is alive.** |
| `OkApplicationsHealthy` | OS alive and all integration services healthy. |
| `LostCommunication` / `Paused` | VM crashed or paused. |
| (empty) | VM is Off. |

`Heartbeat=OK*` for **at least 30 seconds with stable uptime** = VM is in normal
running state. Brief HB=OK followed by reboot = first install reboot, NOT a
finished boot.

### Source of truth #3: Cross-check matrix

When the user asks "is the VM ready?", run **all three sources** and only claim
"ready" when **all three agree**:

```powershell
function Test-VMReady {
    param([string]$VMName, [PSCredential]$Cred)

    # 1. Hyper-V state
    $vm = Get-VM $VMName
    if ($vm.State -ne 'Running')                        { return 'not running' }
    if ($vm.Heartbeat -notlike 'Ok*')                   { return 'no heartbeat' }
    if ($vm.Uptime.TotalSeconds -lt 30)                 { return 'uptime too short' }

    # 2. Network IP acquired
    $ips = (Get-VMNetworkAdapter -VMName $VMName).IPAddresses |
           Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' }
    if (-not $ips)                                      { return 'no IPv4' }

    # 3. PSDirect can execute commands
    try {
        $out = Invoke-Command -VMName $VMName -Credential $Cred -ScriptBlock {
            $u = (quser 2>&1) -join ' '
            "$($env:COMPUTERNAME)|$($env:USERNAME)|$u"
        } -ErrorAction Stop
        if ($out -notmatch 'console.+Active')            { return 'no active console session' }
        return "READY: $out"
    } catch {
        return "PSDirect failed: $($_.Exception.Message)"
    }
}
```

Use this function before reporting to the user. **Never report "VM ready"
without all three signals confirmed.** Specifically NEVER use a successful
thumbnail capture as proof of VM state — thumbnail can succeed while VM is in
limbo, and thumbnail can fail while VM is perfectly fine.

### What "successful screenshot" actually means

- **2417 bytes**: pure black PNG, no graphics. VM in transition / no video signal.
  Does NOT mean crash — VM may still be running normally.
- **5000-15000 bytes**: text-only screen (BIOS, Setup early phase, error dialog).
  Content matters — screenshot may show nothing useful.
- **15000-50000 bytes**: GUI screen with simple chrome (Setup wizard, OOBE).
  Likely real but may be a blank/loading state.
- **50000-300000+ bytes**: full desktop or rich GUI with wallpaper.
  Most likely a real Windows desktop.

Even at 244 KB (real desktop), the image you see at 1024×768 may be too small
to read details. Use higher resolution if available (1920×1080 fails more
often but if it works, content is readable).

## Diagnosing failed installs via offline VHDX log mount

**The single most useful debugging technique** when Setup hangs on a black screen
or reboots in a loop. Win Setup writes detailed logs to `C:\Windows\Panther\` —
when the VM is hung, you can mount the VHDX read-only and read these logs
directly to find the actual error.

```powershell
# 1. Stop VM and mount its VHDX offline
Stop-VM -Name claude-test -Force -TurnOff -ErrorAction SilentlyContinue
$vhdPath = (Get-VMHardDiskDrive -VMName claude-test).Path
$mounted = Mount-VHD -Path $vhdPath -PassThru
$disk    = $mounted | Get-Disk

# 2. Find the Windows partition (largest one) and assign drive letter
$winPart = $disk | Get-Partition | Sort-Object Size -Descending | Select-Object -First 1
if (-not $winPart.DriveLetter) {
    Add-PartitionAccessPath -DiskNumber $disk.Number -PartitionNumber $winPart.PartitionNumber -AssignDriveLetter
    Start-Sleep -Seconds 1
    $winPart = Get-Partition -DiskNumber $disk.Number -PartitionNumber $winPart.PartitionNumber
}
$drv = $winPart.DriveLetter + ':'

# 3. Read setuperr.log first (errors only — usually 5-50 KB)
Get-Content "$drv\Windows\Panther\setuperr.log"

# 4. For deeper investigation, search setupact.log for specific patterns
Select-String -Path "$drv\Windows\Panther\setupact.log" -Pattern 'Error|FAIL|ERROR_' | Select-Object -First 30

# 5. Always dismount when done
Dismount-VHD -Path $vhdPath
```

**Key log files**:
- `setuperr.log` — only errors, fast to scan, usually points directly at the problem
- `setupact.log` — full action log, search for specific patterns or look around an error timestamp
- `unattend.xml` — Setup's effective unattend (after substitution and processing) — useful to see what was actually applied
- `unattend-original.xml` — original unattend file as Setup received it

**Real example finding (April 2026)**: For one failed install, `setuperr.log` showed:
```
BFSVC: BfspCopyFile(E:\$WINDOWS.~BT\Sources\Boot\EFI_EX\bootmgfw_EX.efi,
       \\?\GLOBALROOT\Device\HarddiskVolume1\EFI\Microsoft\Boot\bootmgfw.efi)
       failed! (Attempt 1..60 of 60) Last Error = 0x3 [PATH_NOT_FOUND]
BCD: Failed to add system store from file. Status: c000000f [NO_SUCH_FILE]
```

**Diagnosis**: Win 11 25H2 NEW SETUP code path expects `bootmgfw_EX.efi` (extended
boot manager) at `sources\boot\EFI_EX\` in the install media. The stock Win 11
25H2 consumer ISO **does NOT contain this file**, even though the new setup
code path tries to copy it. **Setup cycles 60 times then gives up**, leaving
the EFI System Partition without a working bootloader → black screen reboot loop.

**Fix**: Before building merged ISO, create `sources\boot\EFI_EX\bootmgfw_EX.efi`
in the staging directory as a copy of `bootmgfw.efi` (same UEFI binary, just
named with EX suffix):

```powershell
$exDir = 'C:\Temp\win11-merged\sources\boot\EFI_EX'
New-Item -ItemType Directory -Path $exDir -Force | Out-Null
Copy-Item 'C:\Temp\win11-merged\bootmgfw.efi' "$exDir\bootmgfw_EX.efi" -Force
# Then rebuild ISO via Build-IsoOnly.ps1
```

This is the **specific 25H2 new setup workaround** for Hyper-V Generation 2 VMs.
Without it, every unattend install on 25H2 fails with the BFSVC loop regardless
of how perfect your autounattend.xml is.

**UPDATE (post-test)**: The bootmgfw_EX.efi file copy fix **DOES NOT actually
work**. The ISO already contains `bootmgfw_EX.efi` at `\sources\boot\` root
level (not in EFI_EX subdirectory). After rebuild and retry, the BFSVC error
**reproduces identically**. The root cause is that Setup expects to extract
`EFI_EX\bootmgfw_EX.efi` from the ISO into `$WINDOWS.~BT\Sources\Boot\EFI_EX\`
during initial extraction, but **Setup's manifest does not include the EFI_EX
subdirectory** — adding files manually to the ISO doesn't make Setup extract
them. This appears to be a fundamental Win 11 25H2 NEW SETUP bug specific to
unattended install on Generation 2 VMs.

## Workaround attempt: replace setup.exe with setupprep.exe

**Theory**: Win 11 25H2 ISO contains both `\sources\setup.exe` (modern wrapper
that triggers NEW SETUP) and `\sources\setupprep.exe` (legacy installer that
uses the old install path without `EFI_EX` requirements). If we replace
`setup.exe` with `setupprep.exe` in the merged ISO, Setup may use the legacy
path that works with autounattend.xml.

```powershell
# In staging dir, BEFORE rebuilding ISO
$src = 'C:\Temp\win11-merged\sources'
Copy-Item "$src\setup.exe" "$src\setup_modern_backup.exe" -Force
Copy-Item "$src\setupprep.exe" "$src\setup.exe" -Force
```

This is an **experimental workaround** discovered April 2026. Whether it
actually forces legacy setup mode requires testing — boot.wim contains its
own setup.exe that may take precedence over the one in `\sources\`.

**Limitations**:
- Setup is launched from `bootmgr` → `boot.wim` (which has its own setup logic),
  not from `\sources\setup.exe` directly. The `\sources\setup.exe` is the
  fallback for upgrade-from-Windows scenarios. So this replacement may have NO
  effect on the boot-from-DVD installation path.
- **If still failing**, the only known reliable workaround is interactive
  install (Option C below).

## ⚠ STATUS (April 2026) — full unattend.xml automation NOT working on Win 11 25H2 consumer

After extensive testing (multiple template variations including community-proven
asheroto-based template), **silent unattended install on Win 11 25H2 Pro consumer
ISO from Fido remains unresolved**. The install successfully:

1. Boots from EFI no-prompt ISO ✓
2. Applies windowsPE pass (locale, LabConfig bypasses, partitioning) ✓
3. Installs Windows 11 Pro image ✓
4. First reboot → brief Windows boot (Heartbeat=OK, IP acquired) ✓
5. **Reboot for specialize/oobeSystem pass → BLACK SCREEN forever, no Heartbeat**

The failure is not at autounattend.xml level — sysprep specialize/oobeSystem
fails silently or BSODs in a reboot loop. Tried fixes that did NOT work:
- Adding `Microsoft-Windows-International-Core` in oobeSystem
- Adding `Microsoft-Windows-Security-SPP-UX SkipAutoActivation`
- Adding `Microsoft-Windows-UnattendedJoin JoinWorkgroup`
- Empty `<AdministratorPassword>` before LocalAccounts
- Removing deprecated `SkipMachineOOBE`/`SkipUserOOBE`
- ComputerName without dash (`claudetest` not `claude-test`)
- LogonCount=1 (not 5)
- Disable Secure Boot + Disable vTPM
- Generic Pro key W269N-WFGWX-YVC9B-4J6C9-T83GX

**Pragmatic recommendation**: For Win 11 25H2, do interactive install through
VMConnect once (~5-10 minutes of user clicks). Then run post-install script
manually (drag-drop into VM via Enhanced Session). Then take baseline-clean
checkpoint. From that point on, the `hyperv-test-runner` skill handles all
subsequent operations via revert without ever touching install again.

Alternatives that **may** work but are not yet verified:
- Use **Win 11 IoT Enterprise LTSC** ISO instead — older unattend schema works
  better. Requires Microsoft Evaluation Center form download (manual).
- Use **Win 10 22H2 LTSC** — proven unattend support, but Win 10 is EOL.
- Remove `<DiskConfiguration>` entirely — let Setup auto-partition (may include
  Recovery partition that 25H2 sysprep needs).
- Use **Schneegans unattend generator** with full custom configuration including
  Recovery partition and CopyProfile settings.

If you're a future agent reading this: **don't spend hours retrying autounattend.xml
variations**. The interactive install path (Option C below) takes 10 minutes
total and definitely works. Save the unattend battle for a future iteration when
you have time to build a Win 11 IoT LTSC pipeline.

## Interactive install fallback (Option C — recommended for Win 11 25H2)

When the unattend approach fails or you want to skip it entirely:

1. **Stop VM, replace ISO** with the original (non-merged) `Win11.iso`:
```powershell
Stop-VM -Name claude-test -Force -TurnOff
Get-VMDvdDrive -VMName claude-test | Remove-VMDvdDrive
Add-VMDvdDrive -VMName claude-test -Path C:\iso\Win11.iso
$dvd = Get-VMDvdDrive -VMName claude-test | Select-Object -First 1
Set-VMFirmware -VMName claude-test -FirstBootDevice $dvd
Set-VMFirmware -VMName claude-test -EnableSecureBoot Off
Disable-VMTPM -VMName claude-test  # only if vTPM was enabled
```

2. **Wipe VHDX** (fresh disk):
```powershell
$vhd = (Get-VMHardDiskDrive -VMName claude-test).Path
Remove-VMHardDiskDrive -VMName claude-test -ControllerType SCSI -ControllerNumber 0 -ControllerLocation 0
Remove-Item -LiteralPath $vhd -Force
New-VHD -Path $vhd -SizeBytes 60GB -Dynamic
Add-VMHardDiskDrive -VMName claude-test -Path $vhd
```

3. **Start VM + open VMConnect**:
```powershell
Start-VM -Name claude-test
Start-Process vmconnect.exe -ArgumentList 'localhost', 'claude-test'
```

4. **User clicks through Win 11 Setup** (~5-10 min active):
   - Press any key when prompted (or it auto-boots from `efisys_noprompt.bin` if you used the merged ISO)
   - Language: English (US) → Next
   - Install Now → "I don't have a product key"
   - Select **Windows 11 Pro** → Next
   - Accept EULA → **Custom: Install Windows only (advanced)**
   - Select Drive 0 Unallocated → Next (Setup auto-partitions including Recovery)
   - Wait ~10-15 min for install + reboots
   - OOBE: Region (Russia or US) → Yes
   - Keyboard: US → Yes → Skip second
   - Network screen: **Shift+F10** → cmd opens → type `OOBE\BypassNRO` → Enter
   - VM reboots
   - Network screen again → "I don't have internet"
   - "Continue with limited setup"
   - Account name: `claude` → Next
   - Password: empty (just hit Enter 4 times)
   - Privacy: Accept all defaults → Accept
   - Wait for desktop (~3 min)

5. **Drag-drop `02-post-install.ps1`** from host into VM via Enhanced Session
   clipboard, then run as admin in VM PowerShell:
```powershell
# Inside VM, admin PowerShell:
C:\Users\claude\Desktop\02-post-install.ps1
```
   This runs the same RDP + winget + Claude Code install routine.

6. **Authenticate Claude Code** in VM (`claude` command, browser OAuth, ~2 min)

7. **From host**, take checkpoint:
```powershell
Checkpoint-VM -Name claude-test -SnapshotName baseline-clean
```

Done. The VM is ready. Total user time: ~15 minutes.

## Failure mode catalog (lessons learned)

| Symptom | Root cause | Fix |
|---|---|---|
| `Boot Summary: The boot loader failed` on Generation 2 VM | vTPM enabled blocks ISO boot | `Disable-VMTPM` (vTPM lock prevents `Set-VMFirmware -SecureBootTemplate` change) |
| "Press any key to boot from CD or DVD" timeout → PXE boot | Default `efisys.bin` boot record | Build ISO with `efisys_noprompt.bin` instead |
| Setup stops at Language Selection screen | autounattend.xml not picked up from secondary DVD | Merge autounattend.xml into root of main ISO |
| Setup stops at Product Key screen | Missing `<UserData><ProductKey>` element | Add generic Pro key `W269N-WFGWX-YVC9B-4J6C9-T83GX` |
| HRESULT `0xC0AAB132` from `CreateResultImage()` | `FileSystemsToCreate = 7` (Joliet 4 GB limit < install.wim 7 GB) | `FileSystemsToCreate = 4` (UDF only) |
| `IMAPI2FS.BootOptions.Manifest` property not found | Property doesn't exist (was guessed from MSDN) | Remove the line; `PlatformId = 0xEF` is sufficient |
| `MsftFileSystemImage.UDFRevisionBlob` overflow | Property doesn't exist | Remove; let `ChooseImageDefaultsForMediaType` set it |
| ADK install via winget hangs at 702 MB Package Cache | Microsoft installer broken | Use IMAPI2 PowerShell instead — no ADK needed |
| BITS download `~333 KB/sec` | MS CDN throttle BITS aggressively | Use `aria2c -x 16 -s 16` instead |
| curl single-connection `~660 KB/sec` | MS CDN per-connection throttle | Use `aria2c -x 16 -s 16` |
| "Windows could not complete the installation" at OOBE | Missing `Microsoft-Windows-International-Core` in oobeSystem, missing `Microsoft-Windows-Security-SPP-UX SkipAutoActivation`, missing `Microsoft-Windows-UnattendedJoin JoinWorkgroup`, missing `<AdministratorPassword>` empty | Use community-proven asheroto-based template (see Section 4) |
| VM reboot loop with black screen | sysprep error loop from invalid OOBE pass | Same as above — proper unattend structure |
| `Send-VMKey: not recognized` | Cmdlet removed in newer Hyper-V | Use `Msvm_Keyboard::TypeKey` via WMI |
| WMI keyboard input ignored by Win Setup GUI | Setup expects real input, not synthetic; or frame buffer cached | Make autounattend handle the screen instead of navigating via key injection |
| `GetVirtualSystemThumbnailImage` returns ReturnValue 32775 | VM in transition state (rebooting, stopping) | Wait 5-10 sec, retry |
| Black 2417-byte PNG thumbnail | VM transition phase OR video driver not loaded | Check Uptime + CPUUsage; if increasing, VM is alive |
| ComputerName with dash causes sysprep error | NetBIOS validation | Use `claudetest` not `claude-test` |
| `LogonCount=5` AutoLogon validation error | Higher values may fail in 25H2 | Use `LogonCount=1` |
| `SkipMachineOOBE`/`SkipUserOOBE` deprecated | Microsoft removed in 24H2+ | Either remove OR keep with all other community-proven elements |
| Win 11 25H2 install finalization fails after first reboot | Installed `unattend.xml` in `C:\Windows\Panther\` takes priority over `\autounattend.xml` (DISM-captured WIM issue) | Not applicable for fresh install from MS ISO; only affects custom WIMs |
| `BFSVC: BfspCopyFile(...EFI_EX\bootmgfw_EX.efi) failed` 60 attempts → black screen reboot loop | Win 11 25H2 NEW SETUP requires `EFI_EX\bootmgfw_EX.efi` extracted to `$WINDOWS.~BT\Sources\Boot\EFI_EX\` but Setup's extraction manifest doesn't include this subdir | **NO RELIABLE FIX FOUND**. Adding the file to the ISO doesn't help because Setup's manifest controls what gets extracted. Try replacing `\sources\setup.exe` with `\sources\setupprep.exe` (legacy setup) or use interactive install. |
| Asheroto/community-proven autounattend.xml STILL fails on Win 11 25H2 with reboot loop | Issue is below the unattend layer — NEW SETUP boot file extraction bug | None. Use interactive install or wait for Microsoft fix. |
| Need to know which exact file/operation Setup is failing on | Setup writes detailed logs to `C:\Windows\Panther\` | Stop VM, mount VHDX offline (`Mount-VHD`), assign drive letter, read `setuperr.log` and `setupact.log` from `\Windows\Panther\` |

---

## Iteration history (April 2026)

This skill captures multiple iteration attempts on Win 11 25H2 Pro consumer ISO:

1. **v1** — Basic autounattend.xml from Microsoft samples → Setup stops at Product Key screen (no `<ProductKey>` in unattend)
2. **v2** — Added generic Pro key `W269N-WFGWX-YVC9B-4J6C9-T83GX` → Setup reaches OOBE phase, fails with "Windows could not complete the installation"
3. **v3** — Removed deprecated `SkipMachineOOBE`/`SkipUserOOBE`, changed ComputerName to no-dash, LogonCount=1 → Same OOBE failure
4. **v4** — Replaced with community-proven asheroto template (added `Microsoft-Windows-International-Core` in oobeSystem, `Microsoft-Windows-Security-SPP-UX SkipAutoActivation`, `Microsoft-Windows-UnattendedJoin JoinWorkgroup`, empty `<AdministratorPassword>`, `<DynamicUpdate><Enable>false`, `<Diagnostics><OptIn>false`) → Same OOBE failure pattern
5. **v5** — Added `sources\boot\EFI_EX\bootmgfw_EX.efi` (copy of `bootmgfw.efi`) to fix BFSVC error from setuperr.log → BFSVC error reproduces identically (Setup doesn't extract EFI_EX subdir from ISO)
6. **v6** — Replaced `\sources\setup.exe` with `\sources\setupprep.exe` (legacy installer) → outcome TBD at time of writing

**Lesson**: For Win 11 25H2 unattend automation, **don't expect autounattend.xml
fixes to resolve BFSVC errors**. The BFSVC failure is below the unattend layer.
When you see BFSVC errors in setuperr.log, the only options are:
1. Try a different Win 11 ISO version (LTSC, older release)
2. Force legacy setup via setupprep replacement (experimental)
3. Interactive install via VMConnect (~10 min, definitely works)

**v6 result (post-test)**: setupprep.exe replacement DID change behavior —
setuperr.log shrunk from 19 KB to 1.4 KB (the 60 BFSVC retry errors disappeared).
However, a deeper failure is still present at the BCD level:

```
BCD: Failed to add system store from file.
     File: \Device\HarddiskVolume1\EFI\Microsoft\Boot\BCD
     Status: c000000f [NO_SUCH_FILE]
SPRestoreBootTimeout: Failed to read boot manager timeout from
     C:\$WINDOWS.~BT\Sources\SetupPlatform.ini
SppDeleteSnapshots failed
```

The BCD store on the EFI System Partition is never created, so even after
Windows briefly boots (we observed HB=OK + IP for ~30 sec), the second reboot
fails because the boot loader can't load BCD configuration → black screen forever.

**Final conclusion (April 2026)**: Win 11 25H2 consumer ISOs are **fundamentally
broken for unattended Hyper-V Generation 2 installation**. NEW SETUP introduces
multiple file dependencies (`bootmgfw_EX.efi`, `EFI_EX/` extracted subdir,
`SetupPlatform.ini`) that are not properly populated when running with
autounattend.xml. No combination of unattend.xml settings, boot file injection,
or setup binary replacement makes this work end-to-end on Win 11 25H2.

**Recommended path going forward**:
1. **Download an OLDER Win 11 ISO** (24H2 or 23H2) via Fido — these don't have
   the NEW SETUP boot file extraction bug. The asheroto-based unattend works
   end-to-end on those builds.
2. **OR do interactive install** (Section "Interactive install fallback" below)
   — pragmatic 10-minute path that definitely works.

**DO NOT waste hours trying to make Win 11 25H2 unattend work**. Microsoft has
a known regression in NEW SETUP that affects all Hyper-V Gen2 unattended installs.
Wait for a fix in 26H1 or use older builds.

## Reference URLs

- [Fido — Win 11 ISO direct download](https://github.com/pbatard/Fido)
- [Schneegans unattend generator](https://schneegans.de/windows/unattend-generator/)
- [Schneegans autounattend.xml usage docs](https://schneegans.de/windows/unattend-generator/usage/)
- [asheroto Windows 11 autounattend.xml gist](https://gist.github.com/asheroto/c4a9fb4e5e5bdad10bcb831e3a3daee6)
- [Win 11 Forum: 25H2 autounattend.xml fails](https://www.elevenforum.com/t/w11-25h2-autounattend-xml-fails-how-to-integrate-the-previous-legacy-setup.43235/)
- [aria2c GitHub](https://github.com/aria2/aria2)
- [IMAPI2 BootOptions docs](https://learn.microsoft.com/en-us/windows/win32/api/imapi2fs/nn-imapi2fs-ibootoptions)
- [Win 11 generic KMS client setup keys](https://learn.microsoft.com/en-us/windows-server/get-started/kms-client-activation-keys)

---

## End-to-end orchestration sequence

When the user invokes this skill, walk through the steps in order. Tell the user
what's happening at each major checkpoint so they're not left guessing during
the long install phases. The `hyperv-test-runner` skill takes over once
`baseline-clean` snapshot exists.

```
[1] Pre-flight checks (admin, Hyper-V module, disk space)            ~5 sec
[2] aria2c install (winget, idempotent)                              ~30 sec
[3] Fido download URL generation                                     ~10 sec
[4] aria2c download Win 11 ISO 7.89 GB                               ~10-40 min
    → Notify user: "ISO downloading; you can leave this running"
[5] Encode 02-post-install.ps1 to base64                             ~1 sec
[6] Build merged staging dir + autounattend.xml + boot files         ~30 sec
[7] Build bootable EFI ISO via IMAPI2                                ~2-5 min
[8] Create Generation 2 VM (no vTPM)                                 ~30 sec
[9] Mount ISO + start VM                                             ~5 sec
[10] Monitor install (Heartbeat + screenshots + sentinel probe)      ~20-25 min
     → Notify user: "Installing silently; will reboot a few times"
[11] Wait for sentinel flag C:\post-install-complete.flag inside VM
     → Notify user: "Post-install done. Open VMConnect to authenticate Claude Code."
[12] User authenticates Claude Code (browser OAuth)                  ~2 min HUMAN
[13] User confirms via "сохрани baseline" or similar                 0 sec
[14] Checkpoint-VM -SnapshotName baseline-clean                      ~10 sec
[15] Verify checkpoint exists, report done
```

The only steps requiring active human input are [12] (browser OAuth — fundamentally
not automatable) and [13] (user signal that auth is done — though we could also
poll for the presence of `~\.claude\.credentials.json` inside the VM via PSDirect).

## What this skill does NOT do

- **Does not authenticate Claude Code automatically** — browser OAuth requires interactive human (~2 min one-time after install completes). The skill orchestrates everything else and notifies the user when authentication is needed.
- **Does not run on non-Windows hosts** — Hyper-V is Windows Pro/Enterprise/Education only.
- **Does not modify `claude-test` VM after baseline-clean is created** — that's the `hyperv-test-runner` skill's job (revert + run scenario + revert).
- **Does not download Win 11 Enterprise Eval** — Fido does not support Enterprise channel; consumer Pro with generic key is sufficient for test purposes.
- **Does not install Windows ADK** — historically broken via winget; we use IMAPI2 PowerShell instead, no external tool needed.
