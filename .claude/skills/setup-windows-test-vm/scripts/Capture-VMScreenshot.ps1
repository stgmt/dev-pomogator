param(
    [string]$VMName = 'claude-test',
    [string]$OutputPath = 'C:\Temp\vm-screenshot.png',
    [int]$Width = 1280,
    [int]$Height = 720
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

# Get the VM and management service via WMI
$vm  = Get-CimInstance -Namespace 'root\virtualization\v2' -ClassName 'Msvm_ComputerSystem' -Filter "ElementName='$VMName'"
$svc = Get-CimInstance -Namespace 'root\virtualization\v2' -ClassName 'Msvm_VirtualSystemManagementService'

if (-not $vm) { throw "VM '$VMName' not found" }

# Request the thumbnail (RGB565 raw bytes)
$result = Invoke-CimMethod -InputObject $svc -MethodName 'GetVirtualSystemThumbnailImage' -Arguments @{
    TargetSystem = $vm
    WidthPixels  = [uint16]$Width
    HeightPixels = [uint16]$Height
}

if ($result.ReturnValue -ne 0) {
    throw "GetVirtualSystemThumbnailImage failed with ReturnValue=$($result.ReturnValue)"
}

$bytes = $result.ImageData
if (-not $bytes -or $bytes.Length -eq 0) {
    throw "Empty image data - VM may not be running yet"
}

# RGB565 → 24-bit bitmap (use LockBits for speed)
$bmp  = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$rect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)

$stride  = $data.Stride
$ptr     = $data.Scan0
$rgb24   = New-Object byte[] ($stride * $Height)

$srcIdx = 0
for ($y = 0; $y -lt $Height; $y++) {
    $rowStart = $y * $stride
    for ($x = 0; $x -lt $Width; $x++) {
        $low  = $bytes[$srcIdx]
        $high = $bytes[$srcIdx + 1]
        $srcIdx += 2

        $val = ($high -shl 8) -bor $low
        $r = (($val -shr 11) -band 0x1F) -shl 3
        $g = (($val -shr 5)  -band 0x3F) -shl 2
        $b = ( $val          -band 0x1F) -shl 3

        $dst = $rowStart + ($x * 3)
        $rgb24[$dst]     = [byte]$b
        $rgb24[$dst + 1] = [byte]$g
        $rgb24[$dst + 2] = [byte]$r
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($rgb24, 0, $ptr, $rgb24.Length)
$bmp.UnlockBits($data)

$dir = Split-Path $OutputPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$sz = (Get-Item $OutputPath).Length
Write-Host "Saved: $OutputPath ($sz bytes, $($Width)x$($Height))"
