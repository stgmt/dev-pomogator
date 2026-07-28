[CmdletBinding(SupportsShouldProcess)]
param([Parameter(Mandatory)][string]$ConfigPath)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
$paths = Get-StatePaths -Config $config
$mediaRoot = Join-Path $paths.StateDirectory 'provisioning-media'
New-Item -ItemType Directory -Force -Path $mediaRoot | Out-Null

function ConvertTo-XmlText([string]$Value) { [Security.SecurityElement]::Escape($Value) }
function New-IsoFromDirectory([string]$Source, [string]$Destination, [string]$Label) {
    $oscdimg = Get-Command oscdimg.exe -ErrorAction SilentlyContinue
    if ($oscdimg) {
        & $oscdimg.Source -m -o -u2 "-l$Label" $Source $Destination | Out-Null
    } else {
        $xorriso = Get-Command xorriso -ErrorAction SilentlyContinue
        if (-not $xorriso) { throw 'oscdimg.exe (Windows ADK) or xorriso is required to create provisioning media' }
        & $xorriso.Source -as mkisofs -V $Label -J -R -o $Destination $Source | Out-Null
    }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Destination)) { throw "Failed to create provisioning ISO: $Destination" }
}

if ($config.Guest -eq 'windows-ltsc') {
    $credential = Get-HyperVVmCredential -Config $config
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
    try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $source = Join-Path $mediaRoot 'windows'
    Remove-Item -LiteralPath $source -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $source | Out-Null
    $imageName = if ($config.Install.WindowsImageName) { [string]$config.Install.WindowsImageName } else { throw 'Install.WindowsImageName is required for unattended Windows setup' }
    $computerName = if ($config.Install.ComputerName) { [string]$config.Install.ComputerName } else { [string]$config.Name }
    $xml = @"
<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
  <settings pass="windowsPE">
    <component name="Microsoft-Windows-International-Core-WinPE" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
      <SetupUILanguage><UILanguage>$(ConvertTo-XmlText $config.Install.Locale)</UILanguage></SetupUILanguage>
      <InputLocale>$(ConvertTo-XmlText $config.Install.Locale)</InputLocale><SystemLocale>$(ConvertTo-XmlText $config.Install.Locale)</SystemLocale><UILanguage>$(ConvertTo-XmlText $config.Install.Locale)</UILanguage><UserLocale>$(ConvertTo-XmlText $config.Install.Locale)</UserLocale>
    </component>
    <component name="Microsoft-Windows-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
      <DiskConfiguration><Disk wcm:action="add"><DiskID>0</DiskID><WillWipeDisk>true</WillWipeDisk><CreatePartitions><CreatePartition wcm:action="add"><Order>1</Order><Type>EFI</Type><Size>260</Size></CreatePartition><CreatePartition wcm:action="add"><Order>2</Order><Type>MSR</Type><Size>16</Size></CreatePartition><CreatePartition wcm:action="add"><Order>3</Order><Type>Primary</Type><Extend>true</Extend></CreatePartition></CreatePartitions><ModifyPartitions><ModifyPartition wcm:action="add"><Order>1</Order><PartitionID>1</PartitionID><Format>FAT32</Format><Label>System</Label></ModifyPartition><ModifyPartition wcm:action="add"><Order>2</Order><PartitionID>3</PartitionID><Format>NTFS</Format><Label>Windows</Label><Letter>C</Letter></ModifyPartition></ModifyPartitions></Disk><WillShowUI>OnError</WillShowUI></DiskConfiguration>
      <ImageInstall><OSImage><InstallFrom><MetaData wcm:action="add"><Key>/IMAGE/NAME</Key><Value>$(ConvertTo-XmlText $imageName)</Value></MetaData></InstallFrom><InstallTo><DiskID>0</DiskID><PartitionID>3</PartitionID></InstallTo></OSImage></ImageInstall>
      <UserData><AcceptEula>true</AcceptEula></UserData><EnableFirewall>true</EnableFirewall>
    </component>
  </settings>
  <settings pass="specialize"><component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"><ComputerName>$(ConvertTo-XmlText $computerName)</ComputerName><TimeZone>$(ConvertTo-XmlText $config.Install.TimeZone)</TimeZone></component></settings>
  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-International-Core" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"><InputLocale>$(ConvertTo-XmlText $config.Install.Locale)</InputLocale><SystemLocale>$(ConvertTo-XmlText $config.Install.Locale)</SystemLocale><UILanguage>$(ConvertTo-XmlText $config.Install.Locale)</UILanguage><UserLocale>$(ConvertTo-XmlText $config.Install.Locale)</UserLocale></component>
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State"><OOBE><HideEULAPage>true</HideEULAPage><HideLocalAccountScreen>true</HideLocalAccountScreen><ProtectYourPC>1</ProtectYourPC></OOBE><UserAccounts><LocalAccounts><LocalAccount wcm:action="add"><Name>$(ConvertTo-XmlText $config.Access.AdminUser)</Name><Group>Administrators</Group><Password><Value>$(ConvertTo-XmlText $password)</Value><PlainText>true</PlainText></Password></LocalAccount></LocalAccounts></UserAccounts></component>
  </settings>
</unattend>
"@
    $xml | Set-Content -LiteralPath (Join-Path $source 'Autounattend.xml') -Encoding UTF8
    $iso = Join-Path $mediaRoot 'windows-unattend.iso'
    if ($PSCmdlet.ShouldProcess($iso, 'Create unattended Windows provisioning ISO')) { New-IsoFromDirectory $source $iso 'AUTOUNATTEND' }
    Remove-Item -LiteralPath $source -Recurse -Force
    $result = [ordered]@{ Guest='windows-ltsc'; IsoPath=$iso; CreatedAt=(Get-Date).ToUniversalTime().ToString('o') }
} else {
    $publicKeyPath = Resolve-ConfigPath -Config $config -Path $config.Access.SshPublicKeyPath
    $publicKey = (Get-Content -LiteralPath $publicKeyPath -Raw).Trim()
    $source = Join-Path $mediaRoot 'ubuntu'
    Remove-Item -LiteralPath $source -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $source | Out-Null
    $hostKey = Join-Path $source 'ssh_host_ed25519_key'
    & ssh-keygen -q -t ed25519 -N '' -C "hyperv-vm:$($config.Name)" -f $hostKey
    if ($LASTEXITCODE -ne 0) { throw 'ssh-keygen failed while creating the pinned guest host key' }
    $fingerprintLine = (& ssh-keygen -lf "$hostKey.pub" -E sha256 | Select-Object -First 1)
    $fingerprint = ([regex]::Match($fingerprintLine, 'SHA256:[A-Za-z0-9+/=]+')).Value
    if (-not $fingerprint) { throw 'Unable to derive generated Ubuntu SSH host-key fingerprint' }
    $privateLines = Get-Content -LiteralPath $hostKey | ForEach-Object { "      $_" }
    $publicHostKey = (Get-Content -LiteralPath "$hostKey.pub" -Raw).Trim()
    $disabledServices = @($config.Optimization.DisableServices | ForEach-Object { "  - $_" }) -join "`n"
    $userData = @"
#cloud-config
preserve_hostname: false
hostname: $($config.Name)
users:
  - name: $($config.Access.AdminUser)
    groups: [adm, sudo, docker]
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    ssh_authorized_keys:
      - $publicKey
ssh_pwauth: false
disable_root: true
ssh_deletekeys: false
write_files:
  - path: /etc/ssh/ssh_host_ed25519_key
    owner: root:root
    permissions: '0600'
    content: |
$($privateLines -join "`n")
  - path: /etc/ssh/ssh_host_ed25519_key.pub
    owner: root:root
    permissions: '0644'
    content: $publicHostKey
package_update: true
packages: [ca-certificates, curl, openssh-server]
runcmd:
  - [ sh, -c, 'install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc' ]
  - [ sh, -c, 'chmod a+r /etc/apt/keyrings/docker.asc && echo "deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu `$(. /etc/os-release && echo `$VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list' ]
  - [ sh, -c, 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin' ]
  - [ systemctl, enable, --now, ssh, docker ]
  - [ sh, -c, 'rm -f /var/lib/cloud/instance/scripts/*' ]
final_message: HYPERV_VM_CLOUD_INIT_COMPLETE
"@
    $metaData = "instance-id: $([guid]::NewGuid())`nlocal-hostname: $($config.Name)`n"
    $userData | Set-Content -LiteralPath (Join-Path $source 'user-data') -Encoding UTF8
    $metaData | Set-Content -LiteralPath (Join-Path $source 'meta-data') -Encoding ASCII
    $iso = Join-Path $mediaRoot 'ubuntu-nocloud.iso'
    if ($PSCmdlet.ShouldProcess($iso, 'Create Ubuntu NoCloud provisioning ISO')) { New-IsoFromDirectory $source $iso 'cidata' }
    Remove-Item -LiteralPath $source -Recurse -Force
    $result = [ordered]@{ Guest='ubuntu-server'; IsoPath=$iso; SshHostKeyFingerprint=$fingerprint; SshHostPublicKey=$publicHostKey; CreatedAt=(Get-Date).ToUniversalTime().ToString('o') }
}
Write-AtomicJson -InputObject $result -Path (Join-Path $paths.StateDirectory 'provisioning.json')
[pscustomobject]$result
