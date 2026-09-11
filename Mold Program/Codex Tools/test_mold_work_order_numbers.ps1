param([string]$AppRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) 'Dashboard App'))
$ErrorActionPreference = 'Stop'
$root = $env:TEMP
. (Join-Path $AppRoot 'mold_management.ps1')
function Assert-Equal($Actual, $Expected) {
  if ($Actual -ne $Expected) { throw "Expected '$Expected', got '$Actual'." }
}
$inputOrder = [pscustomobject]@{ team = 'ce'; requestedBy = 'Ray Chen'; rev = '0B'; reason = 'NPI Tuning'; items = @([pscustomobject]@{ modification = 'Polish cavity'; doneBy = '' }) }
$mold = [pscustomobject]@{ moldNo = 'FP9001-01'; description = 'Test product' }
$first = New-ManagementOrder $inputOrder $null @() $mold ([DateTimeOffset]'2026-09-09T15:59:59Z')
Assert-Equal $first.requestNo '20260909-CE01'
$next = New-ManagementOrder $inputOrder $null @([pscustomobject]@{ workOrderNo = $first.requestNo }) $mold ([DateTimeOffset]'2026-09-09T16:00:00Z')
Assert-Equal $next.requestNo '20260910-CE01'
$hundredth = New-ManagementOrder $inputOrder $null @([pscustomobject]@{ workOrderNo = '20260910-CE99' }) $mold ([DateTimeOffset]'2026-09-10T02:00:00Z')
Assert-Equal $hundredth.requestNo '20260910-CE100'
$revision = New-ManagementOrder $inputOrder $first @() $mold ([DateTimeOffset]'2026-09-12T02:00:00Z')
Assert-Equal $revision.requestNo $first.requestNo
Assert-Equal $revision.requestDate '2026-09-09'
$inputOrder.team = 'QA'
$threw = $false
try { New-ManagementOrder $inputOrder $first @() $mold ([DateTimeOffset]'2026-09-12T02:00:00Z') | Out-Null } catch { $threw = $true }
Assert-Equal $threw $true
'PASS: Taiwan midnight reset, case normalization, numbering past 99, saved number/date preservation, team immutability.'

