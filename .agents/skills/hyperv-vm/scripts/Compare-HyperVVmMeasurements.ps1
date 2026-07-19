[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Before,
    [Parameter(Mandatory)][string]$After
)

$beforeData = Get-Content -LiteralPath $Before -Raw | ConvertFrom-Json
$afterData = Get-Content -LiteralPath $After -Raw | ConvertFrom-Json
$invalid = [Collections.Generic.List[string]]::new()
foreach ($field in 'VMId','LimitsFingerprint','StabilizationSeconds','Workload') {
    if ($beforeData.$field -ne $afterData.$field) { $invalid.Add("$field differs") }
}
if ($invalid.Count) {
    [pscustomobject]@{ Valid = $false; Reasons = @($invalid); Before = $Before; After = $After }
    exit 1
}

$rows = foreach ($metric in 'VMAssignedMB','VMDemandMB') {
    $old = [double]$beforeData.$metric
    $new = [double]$afterData.$metric
    [pscustomobject]@{ Metric=$metric; Before=$old; After=$new; Delta=[math]::Round($new-$old,1); Percent=if($old){[math]::Round((($new-$old)/$old)*100,1)}else{$null} }
}
if ($beforeData.Guest.PSObject.Properties.Name -contains 'UsedMB') {
    $old = [double]$beforeData.Guest.UsedMB; $new = [double]$afterData.Guest.UsedMB
    $rows += [pscustomobject]@{ Metric='GuestUsedMB'; Before=$old; After=$new; Delta=[math]::Round($new-$old,1); Percent=if($old){[math]::Round((($new-$old)/$old)*100,1)}else{$null} }
}
[pscustomobject]@{ Valid=$true; LimitsUnchanged=$true; Rows=@($rows) }
