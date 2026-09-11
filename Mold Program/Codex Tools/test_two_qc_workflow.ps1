$ErrorActionPreference = 'Stop'
$root = Join-Path (Split-Path $PSScriptRoot -Parent) 'Dashboard App'
. (Join-Path $root 'mold_management.ps1')
function Assert-ManagementMold { param($Identity) @{ moldNo = 'TEST-01'; description = 'Test mold' } }
function Invoke-ManagementLock { param([scriptblock]$Operation) & $Operation }
function Read-ManagementData { $script:data }
function Write-ManagementData { param($Data) $script:data = $Data }
$script:data = [pscustomobject]@{ version = 1; events = @() }
function Send {
  param($Action, $Stage = '', $Order = $null)
  $receipt = @($script:data.events | Where-Object action -eq 'receive') | Select-Object -Last 1
  $last = @($script:data.events) | Select-Object -Last 1
  $payload = @{ identity = 'TEST'; kind = 'repair'; action = $Action; stage = $Stage; equipment = $Stage; eventId = [guid]::NewGuid().ToString(); clickedAt = [DateTimeOffset]::UtcNow.ToString('o'); notes = 'Test'; assignmentId = 'main'; jobId = $receipt.jobId; expectedEventId = $last.id }
  if ($Order) { $payload.workOrder = $Order }
  Save-ManagementEvent $payload
}
function Order { @($script:data.events | Where-Object workOrder)[-1].workOrder | ConvertTo-Json -Depth 30 | ConvertFrom-Json }
function Reject { param([scriptblock]$Action)
  $count = $script:data.events.Count
  $failed = $false
  try { $null = & $Action } catch { $failed = $true }
  if (-not $failed -or $script:data.events.Count -ne $count) { throw 'Invalid transition accepted.' }
}
$order = @{ team = 'CE'; requestedBy = 'Joseph'; reason = 'Repair'; items = @(@{ id = [guid]::NewGuid().ToString(); modification = 'Adjust cavity'; doneBy = 'Operator'; repairType = 'Dimensional'; beforeValue = ''; afterValue = '' }) }
$null = Send 'receive' -Order $order
$order = Order
$order.urgent = $true
$order.requestedCompletionDate = '2026-09-15'
$null = Send 'note' -Order $order
if (-not (Order).urgent -or (Order).requestedCompletionDate -ne '2026-09-15') { throw 'Urgency was not saved.' }
$order.requestedCompletionDate = '2026-02-30'
Reject { Send 'note' -Order $order }
$order = Order
$order.urgent = $false
$null = Send 'note' -Order $order
if ((Order).urgent -or (Order).requestedCompletionDate) { throw 'Urgency was not cleared.' }
$null = Send 'stage' 'Assemble'
$null = Send 'start-process' 'Assemble'
Reject { Send 'stage' 'Tray Injection' }
$null = Send 'stage' 'Repair QC Approval'
$null = Send 'start-process' 'Repair QC Approval'
# Old active Data Update records must enter the merged workflow without data migration.
$script:data.events[-1].stage = 'Data Update'
$script:data.events[-1].equipment = 'Data Update'
Reject { Send 'stage' 'Tray Injection' }
Reject { Send 'process-complete' }
$order = Order
$order.items[0].beforeValue = '1.2 mm'; $order.items[0].afterValue = '1.3 mm'
$null = Send 'note' -Order $order
$order = Order
$order.items[0].roomBy = 'Room Leader'; $order.items[0].roomApproved = $true
$null = Send 'note' -Order $order
$order = Order
$order.items[0].qcBy = 'Repair Inspector'; $order.items[0].qcApproved = $true
$null = Send 'note' -Order $order
Reject { Send 'stage' 'Tray Injection' }
$order = Order
$order.items[0].qcBy = 'Repair Inspector'; $order.items[0].qcApproved = $true
$null = Send 'note' -Order $order
Reject { Send 'stage' 'Tray Injection' }
$order = Order
$order.preQcLeaderBy = 'Repair QC Leader'; $order.preQcLeaderApproved = $true
$null = Send 'note' -Order $order
if (-not (Order).preQcLeaderApproved -or (Order).qcLeaderApproved) { throw 'Separate pre-injection approval failed.' }
$null = Send 'stage' 'Tray Injection'
$null = Send 'start-process' 'Tray Injection'
Reject { Send 'out' }
$order = Order
$order.items[0].postQcBy = 'Post Inspector'; $order.items[0].postQcApproved = $true
Reject { Send 'note' -Order $order }
$null = Send 'stage' 'QC Final Approval'
$null = Send 'start-process' 'QC Final Approval'
Reject { Send 'out' }
$order = Order
$order.qcLeaderBy = 'Final Leader'; $order.qcLeaderApproved = $true
Reject { Send 'note' -Order $order }
$order = Order
$order.items[0].postQcBy = 'Post Inspector'; $order.items[0].postQcApproved = $true
$null = Send 'note' -Order $order
if (-not (Order).preQcLeaderApproved) { throw 'Post QC erased pre-injection approval.' }
Reject { Send 'out' }
$order = Order
$order.qcLeaderBy = 'Final Leader'; $order.qcLeaderApproved = $true
$null = Send 'note' -Order $order
if (-not (Order).qcLeaderApproved -or -not (Order).preQcLeaderApproved) { throw 'Two approvals missing.' }
$approved = Order
$order.items[0].afterValue = '1.4 mm'
$null = Send 'note' -Order $order
if ((Order).qcLeaderApproved -or (Order).preQcLeaderApproved -or (Order).items[0].postQcApproved) { throw 'Changed data retained approvals.' }
Reject { Send 'out' }
# Restore the approved snapshot only in this in-memory fixture to verify final closure.
$script:data.events[-1].workOrder = $approved
$null = Send 'out'
'PASS: merged Repair QC Approval -> Injection -> QC Final Approval. Legacy Data Update, urgency, approval and stale-data gates verified. No production data writes.'
