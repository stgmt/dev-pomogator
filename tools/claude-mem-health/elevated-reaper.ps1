[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 65535)]
  [int]$Port,
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$HomeDir
)

# This helper is launched only after the unprivileged reaper gets Access Denied. It accepts no
# process id and independently proves the same constrained failure shape before it can terminate
# anything: unhealthy configured port -> listener reports a dead owner -> dead-parent chroma root
# -> direct Python worker child. It never changes a port or disables a hook.
$ErrorActionPreference = 'Stop'

function Test-WorkerHealthy([int]$CandidatePort) {
  try {
    $request = [System.Net.WebRequest]::Create("http://127.0.0.1:$CandidatePort/health")
    $request.Timeout = 1500
    $response = $request.GetResponse()
    try { return [int]$response.StatusCode -eq 200 } finally { $response.Close() }
  } catch {
    return $false
  }
}

try {
  # Keep the elevated action tied to the user's configured worker port. Missing settings use the
  # same 37777 fallback as the normal reaper; malformed settings never broaden the kill scope.
  $settingsPath = Join-Path $HomeDir '.claude-mem\settings.json'
  if (Test-Path -LiteralPath $settingsPath) {
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    if ($null -ne $settings.CLAUDE_MEM_WORKER_PORT -and [int]$settings.CLAUDE_MEM_WORKER_PORT -ne $Port) { exit 0 }
  } elseif ($Port -ne 37777) {
    exit 0
  }

  if (Test-WorkerHealthy $Port) { exit 0 }
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $listener) { exit 0 }
  if (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue) { exit 0 }

  $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  foreach ($root in $all | Where-Object { $_.Name -ieq 'chroma-mcp.exe' }) {
    if (Get-Process -Id $root.ParentProcessId -ErrorAction SilentlyContinue) { continue }
    $hasPythonChild = @($all | Where-Object {
      $_.ParentProcessId -eq $root.ProcessId -and $_.Name -match '^python(?:w)?\.exe$'
    }).Count -gt 0
    if (-not $hasPythonChild) { continue }
    & taskkill.exe /PID $root.ProcessId /T /F | Out-Null
  }
} catch {
  # The invoking hook is fail-open. No error should block the user's prompt.
}

exit 0
