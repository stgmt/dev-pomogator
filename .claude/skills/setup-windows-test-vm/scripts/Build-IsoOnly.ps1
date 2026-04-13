# Build-IsoOnly.ps1 — build bootable EFI ISO from existing staging dir
# (staging dir + boot files already prepared by Build-MergedIso.ps1)

$ErrorActionPreference = 'Stop'

$stage   = 'C:\Temp\win11-merged'
$outIso  = 'C:\iso\Win11-unattend.iso'
$bootBin = 'C:\Temp\efisys_noprompt.bin'
$volName = 'CCCOMA_X64FRE_EN-US_DV9'

if (-not (Test-Path $stage))   { throw "Staging dir missing: $stage" }
if (-not (Test-Path $bootBin)) { throw "Boot file missing: $bootBin" }

Write-Host '=== Building bootable EFI ISO via IMAPI2 ===' -ForegroundColor Cyan

# ISOFile class
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
$efiStream = New-Object -ComObject ADODB.Stream
$efiStream.Type = 1  # adTypeBinary
$efiStream.Open()
$efiStream.LoadFromFile($bootBin)
$efiStream.Position = 0

$efiBoot = New-Object -ComObject IMAPI2FS.BootOptions
$efiBoot.AssignBootImage($efiStream)
$efiBoot.PlatformId = 0xEF
$efiBoot.Emulation  = 0
Write-Host '  EFI boot options set'

# File system image
$image = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
$image.ChooseImageDefaultsForMediaType(13)  # DVDPLUSRW_DUALLAYER
# UDF only — install.wim 7 GB > 4 GB Joliet limit
$image.FileSystemsToCreate = 4  # FsiFileSystemUDF
$image.VolumeName  = $volName
Write-Host "  Volume name: $volName, UDFRevision auto: $($image.UDFRevision)"

# Add files
Write-Host "  Adding tree from $stage..."
$image.Root.AddTree($stage, $false)

# Apply boot options
$image.BootImageOptions = $efiBoot

# Create ISO
Write-Host '  Generating ISO stream...'
$result = $image.CreateResultImage()

if (Test-Path $outIso) { Remove-Item $outIso -Force }
$target = New-Item -Path $outIso -ItemType File -Force
[ISOFile]::Create($target.FullName, $result.ImageStream, $result.BlockSize, $result.TotalBlocks)

$sz = (Get-Item $outIso).Length
Write-Host ''
Write-Host "DONE: $outIso ($([math]::Round($sz / 1GB, 2)) GB)" -ForegroundColor Green
