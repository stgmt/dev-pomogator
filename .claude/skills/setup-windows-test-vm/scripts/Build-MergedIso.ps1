# Build-MergedIso.ps1 — extract Win11.iso, inject autounattend.xml, rebuild as
# bootable EFI ISO using efisys_noprompt.bin (no Press-any-key timeout).

$ErrorActionPreference = 'Stop'

$srcIso  = 'C:\iso\Win11.iso'
$stage   = 'C:\Temp\win11-merged'
$outIso  = 'C:\iso\Win11-unattend.iso'
$unattend = 'C:\Temp\unattend-staging\autounattend.xml'

# --- Step 1: Mount source ISO ---
Write-Host '=== Step 1: Mount Win11.iso ===' -ForegroundColor Cyan
$mnt = Mount-DiskImage -ImagePath $srcIso -PassThru
$drv = ($mnt | Get-Volume).DriveLetter + ':'
$volName = (Get-Volume -DriveLetter ($mnt | Get-Volume).DriveLetter).FileSystemLabel
Write-Host "  Mounted at $drv (label='$volName')"

# --- Step 2: Copy contents to staging dir ---
Write-Host ''
Write-Host '=== Step 2: Copy ISO content to staging dir (~8 GB, may take 3-10 min) ===' -ForegroundColor Cyan
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$copyStart = Get-Date
robocopy "$drv\" "$stage\" /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NP /NJH /NJS /MT:8 | Out-Null
$copyDur = (Get-Date) - $copyStart
Write-Host "  Copy done in $([math]::Round($copyDur.TotalSeconds, 0))s"

# --- Step 3: Inject autounattend.xml ---
Write-Host ''
Write-Host '=== Step 3: Inject autounattend.xml into root of staging dir ===' -ForegroundColor Cyan
Copy-Item $unattend "$stage\autounattend.xml" -Force
Write-Host "  $unattend -> $stage\autounattend.xml"

# --- Step 4: Extract efisys_noprompt.bin to temp location ---
Write-Host ''
Write-Host '=== Step 4: Extract efisys_noprompt.bin (no Press-any-key prompt) ===' -ForegroundColor Cyan
$bootBin = 'C:\Temp\efisys_noprompt.bin'
Copy-Item "$drv\efi\microsoft\boot\efisys_noprompt.bin" $bootBin -Force
$etfsBin = 'C:\Temp\etfsboot.com'
Copy-Item "$drv\boot\etfsboot.com" $etfsBin -Force
Write-Host '  Boot files extracted'

# --- Step 5: Dismount source ISO ---
Dismount-DiskImage -ImagePath $srcIso | Out-Null
Write-Host '  Source ISO dismounted'

# --- Step 6: Build bootable EFI ISO via IMAPI2 ---
Write-Host ''
Write-Host '=== Step 6: Build bootable EFI ISO via IMAPI2 ===' -ForegroundColor Cyan

# Define ISOFile class for stream-to-file conversion
($cp = New-Object System.CodeDom.Compiler.CompilerParameters).CompilerOptions = '/unsafe'
if (!('ISOFile' -as [type])) {
    Add-Type -CompilerParameters $cp -TypeDefinition @'
public class ISOFile {
    public unsafe static void Create(string Path, object Stream, int BlockSize, int TotalBlocks) {
        int bytes = 0;
        byte[] buf = new byte[BlockSize];
        var ptr = (System.IntPtr)(&bytes);
        var o = System.IO.File.OpenWrite(Path);
        var i = Stream as System.Runtime.InteropServices.ComTypes.IStream;
        if (o != null) {
            while (TotalBlocks-- > 0) {
                i.Read(buf, BlockSize, ptr);
                o.Write(buf, 0, bytes);
            }
            o.Flush();
            o.Close();
        }
    }
}
'@
}

# EFI boot options
$efiBoot = New-Object -ComObject IMAPI2FS.BootOptions
$efiStream = New-Object -ComObject ADODB.Stream -Property @{ Type = 1 }  # adFileTypeBinary
$efiStream.Open()
$efiStream.LoadFromFile($bootBin)
$efiBoot.AssignBootImage($efiStream)
$efiBoot.Manifest    = 2     # FsiBootMediaType_EFI
$efiBoot.PlatformId  = 0xEF  # EFI
$efiBoot.Emulation   = 0     # No emulation

# Build the file system image
$image = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
$image.ChooseImageDefaultsForMediaType(13)  # DVDPLUSRW_DUALLAYER
$image.FileSystemsToCreate = 7              # UDF + Joliet + ISO9660
$image.UDFRevision = 0x102                  # UDF 1.02 (Win standard)
if ($volName) {
    $image.VolumeName = $volName
} else {
    $image.VolumeName = 'CCCOMA_X64FRE_EN-US_DV9'
}

# Add merged content
Write-Host "  Adding tree from $stage..."
$image.Root.AddTree($stage, $false)

# Set EFI boot image
$image.BootImageOptions = $efiBoot

Write-Host '  Generating ISO stream...'
$result = $image.CreateResultImage()

if (Test-Path $outIso) { Remove-Item $outIso -Force }
$target = New-Item -Path $outIso -ItemType File -Force
[ISOFile]::Create($target.FullName, $result.ImageStream, $result.BlockSize, $result.TotalBlocks)

$sz = (Get-Item $outIso).Length
Write-Host "  ISO created: $outIso ($([math]::Round($sz / 1GB, 2)) GB)"

# --- Step 7: Cleanup staging dir (saves ~8 GB) ---
Write-Host ''
Write-Host '=== Step 7: Cleanup staging dir ===' -ForegroundColor Cyan
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
Write-Host '  Staging dir removed'

Write-Host ''
Write-Host '=== DONE ===' -ForegroundColor Green
Write-Host "Output: $outIso"
