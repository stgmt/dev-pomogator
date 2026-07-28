[CmdletBinding()]
param(
    [Parameter(Mandatory,Position=0)][string]$Before,
    [Parameter(Mandatory,Position=1)][string]$After
)

$beforePath=(Resolve-Path -LiteralPath $Before).Path
$afterPath=(Resolve-Path -LiteralPath $After).Path
if ($beforePath -eq $afterPath) { throw 'Before and after reports must be different files' }
$beforeData = Get-Content -LiteralPath $beforePath -Raw | ConvertFrom-Json
$afterData = Get-Content -LiteralPath $afterPath -Raw | ConvertFrom-Json
if ($beforeData.Phase -ne 'before' -or $afterData.Phase -ne 'after') { throw 'Reports must have Phase=before and Phase=after respectively' }
foreach ($field in 'VMId','ConfigFingerprint','LimitsFingerprint','StabilizationSeconds','WorkloadFingerprint') {
    if ($beforeData.$field -ne $afterData.$field) { throw "Comparison invalid: $field changed" }
}
$beforeTime=[datetime]$beforeData.CapturedAt; $afterTime=[datetime]$afterData.CapturedAt
if ($afterTime -le $beforeTime) { throw 'After measurement must be newer than before measurement' }

$rows=@()
foreach($metric in 'VMAssignedMB','VMDemandMB'){
    if ($null -eq $beforeData.$metric -or $null -eq $afterData.$metric) { throw "Missing required metric: $metric" }
    $old=[double]$beforeData.$metric; $new=[double]$afterData.$metric
    $rows += [pscustomobject]@{Metric=$metric;Before=$old;After=$new;Delta=[math]::Round($new-$old,1);Percent=if($old){[math]::Round((($new-$old)/$old)*100,1)}else{$null}}
}
foreach($metric in 'UsedMB','AvailableMB'){
    if ($null -eq $beforeData.Guest.$metric -or $null -eq $afterData.Guest.$metric) { throw "Missing required guest metric: $metric" }
    $old=[double]$beforeData.Guest.$metric; $new=[double]$afterData.Guest.$metric
    $rows += [pscustomobject]@{Metric="Guest$metric";Before=$old;After=$new;Delta=[math]::Round($new-$old,1);Percent=if($old){[math]::Round((($new-$old)/$old)*100,1)}else{$null}}
}
[pscustomobject]@{Valid=$true;LimitsUnchanged=$true;WorkloadUnchanged=$true;Before=$beforeTime;After=$afterTime;Rows=$rows}
