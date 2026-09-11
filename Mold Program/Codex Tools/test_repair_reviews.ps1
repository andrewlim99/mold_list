$ErrorActionPreference = 'Stop'
$root = Join-Path (Split-Path $PSScriptRoot -Parent) 'Dashboard App'
. (Join-Path $root 'mold_management.ps1')
function Assert-ManagementMold { param($Identity) @{ moldNo = 'TEST-01'; description = 'Test mold' } }
function Invoke-ManagementLock { param([scriptblock]$Operation) & $Operation }
function Read-ManagementData { $script:testData }
function Write-ManagementData { param($Data) $script:testData = $Data }
function Read-FileTextShared { param($Path) [IO.File]::ReadAllText($Path) }
$script:testData = [pscustomobject]@{ version = 1; events = @() }
function Send {
  param($Action, $Stage = '', $Equipment = '', $Order = $null)
  $history = @($script:testData.events)
  $receipt = @($history | Where-Object action -eq 'receive') | Select-Object -Last 1
  $payload = @{ identity = 'TEST'; kind = 'repair'; action = $Action; stage = $Stage; equipment = $Equipment; eventId = [guid]::NewGuid().ToString(); clickedAt = [DateTimeOffset]::UtcNow.ToString('o'); notes = 'Test record'; assignmentId = 'main'
    jobId = if ($receipt) { $receipt.jobId } else { '' }; expectedEventId = if ($history.Count) { $history[-1].id } else { '' } }
  if ($Order) { $payload.workOrder = $Order }
  Save-ManagementEvent $payload
}
function CurrentOrder { @($script:testData.events | Where-Object workOrder)[-1].workOrder | ConvertTo-Json -Depth 20 | ConvertFrom-Json }
function Reject { param([scriptblock]$Action)
  $count = $script:testData.events.Count
  $failed = $false
  try { $null = & $Action } catch { $failed = $true }
  if (-not $failed -or $script:testData.events.Count -ne $count) { throw 'Invalid action was accepted or changed history.' }
}
$order = @{ team = 'CE'; requestedBy = 'Joseph'; rev = 'A'; reason = 'Repair'; items = @(@{ id = [guid]::NewGuid().ToString(); modification = 'Adjust cavity'; doneBy = 'Operator'; repairType = 'Dimensional' }) }
$null = Send 'receive' -Order $order
$null = Send 'stage' 'CNC' 'CNC 1'
$null = Send 'start-process' '' 'CNC 1'
Reject { Send 'process-complete' }
Reject { Send 'stage' 'EDM' 'EDM 1' }
$order = CurrentOrder
$order.items[0].beforeValue = '1.20 mm'; $order.items[0].afterValue = '1.25 mm'
$null = Send 'note' -Order $order
$order = CurrentOrder
$order.items[0].roomBy = 'Room Leader'; $order.items[0].roomApproved = $true
$null = Send 'note' -Order $order
if (-not (CurrentOrder).items[0].roomApproved) { throw 'Room approval missing.' }
Reject { Send 'process-complete' }
$order = CurrentOrder
$order.items[0].qcBy = 'QC Inspector'; $order.items[0].qcApproved = $true
$null = Send 'note' -Order $order
if (-not (CurrentOrder).items[0].qcApproved) { throw 'QC approval missing.' }
$order = CurrentOrder
$order.items[0].afterValue = '1.26 mm'
$null = Send 'note' -Order $order
if ((CurrentOrder).items[0].roomApproved -or (CurrentOrder).items[0].qcApproved) { throw 'Changed data retained approvals.' }
Reject { Send 'process-complete' }
$order = CurrentOrder
$order.items[0].roomBy = 'Room Leader'; $order.items[0].roomApproved = $true
$null = Send 'note' -Order $order
$order = CurrentOrder
$order.items[0].qcBy = 'QC Inspector'; $order.items[0].qcApproved = $true
$null = Send 'note' -Order $order
$null = Send 'process-complete'
$null = Send 'stage' 'Assemble' 'Assemble'
$null = Send 'start-process' '' 'Assemble'
Reject { Send 'out' }
Reject { Send 'stage' 'QC Inspection' 'QC Inspection' }
$null = Send 'stage' 'Tray Injection' 'Tray Injection'
Reject { Send 'out' }
Reject { Send 'stage' 'QC Inspection' 'QC Inspection' }
$null = Send 'start-process' '' 'Tray Injection'
Reject { Send 'out' }
$null = Send 'process-complete'
$null = Send 'stage' 'QC Inspection' 'QC Inspection'
$null = Send 'start-process' '' 'QC Inspection'
Reject { Send 'out' }
$order = CurrentOrder
$order.qcLeaderBy = 'QC Leader'; $order.qcLeaderApproved = $true
$null = Send 'note' -Order $order
if (-not (CurrentOrder).qcLeaderApproved) { throw 'Final approval missing.' }
$order = CurrentOrder
$order.reason = 'Updated repair'
$null = Send 'note' -Order $order
if ((CurrentOrder).qcLeaderApproved) { throw 'Changed request retained final approval.' }
Reject { Send 'out' }
$order = CurrentOrder
$order.qcLeaderApproved = $true
$null = Send 'note' -Order $order
$null = Send 'out'

$order = @{ team = 'FOL'; requestedBy = 'Sophia'; reason = 'Visual repair'; items = @(@{ id = [guid]::NewGuid().ToString(); modification = 'Surface'; doneBy = 'Operator'; repairType = 'Visual' }) }
$null = Send 'receive' -Order $order
$null = Send 'stage' 'EDM' 'EDM 1'
$null = Send 'start-process' '' 'EDM 1'
Reject { Send 'process-complete' }
$order = CurrentOrder
$order.items[0].waived = $true
Reject { Send 'note' -Order $order }
$order.items[0].waiveReason = 'Urgent trial'; $order.items[0].waivedBy = 'Room Leader'
$null = Send 'note' -Order $order
$null = Send 'process-complete'
if (-not (CurrentOrder).items[0].waivedAt) { throw 'Waive audit time missing.' }

$repairPhotosDir = Join-Path ([IO.Path]::GetTempPath()) ('mold-photo-test-' + [guid]::NewGuid().ToString('N'))
$photo = Save-RepairPhoto @{ identity = 'TEST'; itemId = $order.items[0].id; uploadedBy = 'Operator'; contentBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=' }
$order = CurrentOrder
$order.items[0].waived = $false; $order.items[0].beforePhoto = $photo.photoId; $order.items[0].afterPhoto = $photo.photoId
$null = Send 'note' -Order $order
$order = CurrentOrder
$order.items[0].roomApproved = $true; $order.items[0].roomBy = 'Leader'
$null = Send 'note' -Order $order
$order = CurrentOrder
$order.items[0].qcApproved = $true; $order.items[0].qcBy = 'Inspector'
$null = Send 'note' -Order $order
if (Get-RepairReviewError (CurrentOrder)) { throw 'Visual evidence did not pass review.' }
$order = CurrentOrder
$order.items[0].id = [guid]::NewGuid().ToString()
Reject { Send 'note' -Order $order }
'PASS: measurements, visual photo ownership, sequenced approvals, changed-result invalidation, process gates, final QC approval, Waive audit. No production data writes.'
