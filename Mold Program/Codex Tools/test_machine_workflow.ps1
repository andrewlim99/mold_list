$ErrorActionPreference = 'Stop'
$root = Join-Path (Split-Path $PSScriptRoot -Parent) 'Dashboard App'
. (Join-Path $root 'mold_management.ps1')
# Evidence and approval gates have their own integration suite in test_repair_reviews.ps1.
function Get-RepairReviewError { param($Order, [switch]$Final) return '' }

# All persistence is replaced before exercising the production state machine.
function Assert-ManagementMold { param($Identity) @{ moldNo = 'TEST-01'; description = 'Test mold' } }
function Invoke-ManagementLock { param([scriptblock]$Operation) & $Operation }
function Read-ManagementData { $script:testData }
function Write-ManagementData { param($Data) $script:testData = $Data }
$script:testData = [pscustomobject]@{ version = 1; events = @() }
function Send-TestEvent {
  param($Action, $Stage = '', $Equipment = '', $Kind = 'repair', $AssignmentId = 'main', $PmRequest = @{ team = 'CE'; requestedBy = 'Joseph' })
  $history = @($script:testData.events | Where-Object { $_.kind -eq $Kind })
  $receipt = @($history | Where-Object { $_.action -eq 'receive' }) | Select-Object -Last 1
  if ($Action -eq 'start-process' -and -not $Equipment -and $history.Count) { $Equipment = $history[-1].equipment }
  Save-ManagementEvent @{
    identity = 'TEST'; kind = $Kind; action = $Action; stage = $Stage; equipment = $Equipment
    assignmentId = $AssignmentId
    pmRequest = $PmRequest
    eventId = [guid]::NewGuid().ToString(); clickedAt = [DateTimeOffset]::UtcNow.ToString('o'); notes = 'Test note'
    jobId = if ($receipt) { $receipt.jobId } else { '' }
    expectedEventId = if ($history.Count) { $history[-1].id } else { '' }
  }
}
function Assert-Rejected {
  param([scriptblock]$Action)
  $count = $script:testData.events.Count
  $rejected = $false
  try { $null = & $Action } catch { $rejected = $true }
  if (-not $rejected -or $script:testData.events.Count -ne $count) { throw 'Invalid action changed history.' }
}
$null = Send-TestEvent 'receive'
Assert-Rejected { Send-TestEvent 'start-process' }
Assert-Rejected { Send-TestEvent 'stage' 'EDM' 'CNC 1' }
Assert-Rejected { Send-TestEvent 'stage' 'Polishing' 'Polishing' }
$result = Send-TestEvent 'stage' 'EDM' 'EDM 2'
 $result = Send-TestEvent 'stage' 'Waiting'
 if ($result.event.stage -ne 'Waiting' -or $result.event.equipment -or $result.event.completedStage) { throw 'Return to repair waiting failed.' }
 Assert-Rejected { Send-TestEvent 'start-process' }
 Assert-Rejected { Send-TestEvent 'stage' 'Waiting' 'EDM 1' }
 $result = Send-TestEvent 'stage' 'EDM' 'EDM 2'
Assert-Rejected { Send-TestEvent 'start-process' 'CNC' 'CNC 1' }
if ($result.event.processStatus -ne 'Waiting' -or $result.event.completedStage) { throw 'Assignment must only queue work.' }
Assert-Rejected { Send-TestEvent 'process-complete' }
Assert-Rejected { Send-TestEvent 'out' }
$result = Send-TestEvent 'stage' 'EDM' 'EDM 3'
if ($result.event.completedStage) { throw 'Moving queued work counted a completion.' }
$result = Send-TestEvent 'start-process'
if ($result.event.equipment -ne 'EDM 3' -or $result.event.processStatus -ne 'In Progress') { throw 'Machine start failed.' }
Assert-Rejected { Send-TestEvent 'start-process' }
$result = Send-TestEvent 'note'
if ($result.event.equipment -ne 'EDM 3' -or $result.event.processStatus -ne 'In Progress') { throw 'Note changed machine state.' }
$result = Send-TestEvent 'stage' 'CNC' 'CNC 1'
if ($result.event.completedEquipment -ne 'EDM 3' -or $result.event.completedStage -ne 'EDM' -or $result.event.processStatus -ne 'Waiting') { throw 'Complete and transfer failed.' }
$null = Send-TestEvent 'start-process'
$result = Send-TestEvent 'process-complete'
if ($result.event.completedEquipment -ne 'CNC 1' -or $result.event.stage -ne 'Awaiting Next Process' -or $result.event.equipment) { throw 'Process completion failed.' }
$null = Send-TestEvent 'stage' 'Assemble' 'Assemble'
Assert-Rejected { Send-TestEvent 'out' }
$null = Send-TestEvent 'start-process'
$null = Send-TestEvent 'process-complete'
Assert-Rejected { Send-TestEvent 'out' }
$null = Send-TestEvent 'stage' 'Tray Injection QC' 'Tray Injection QC'
Assert-Rejected { Send-TestEvent 'out' }
$null = Send-TestEvent 'start-process'
$null = Send-TestEvent 'process-complete'
$result = Send-TestEvent 'out'
if ($result.event.stage -ne 'Completed' -or $result.event.completedStage) { throw 'QC completion duplicated.' }
$null = Send-TestEvent 'receive' '' '' 'pm'
$null = Send-TestEvent 'in' '' '' 'pm'
$result = Send-TestEvent 'out' '' '' 'pm'
if ($result.event.stage -ne 'Completed') { throw 'PM workflow regressed.' }
$null = Send-TestEvent 'receive'
Assert-Rejected { Send-TestEvent 'stage' 'Tray Injection QC' 'Tray Injection QC' }
$null = Send-TestEvent 'stage' 'Assemble' 'Assemble'
$null = Send-TestEvent 'start-process'
Assert-Rejected { Send-TestEvent 'out' }
Assert-Rejected { Send-TestEvent 'add-machine' 'Tray Injection QC' 'Tray Injection QC' }
$transfer = Send-TestEvent 'stage' 'Tray Injection QC' 'Tray Injection QC'
if ($transfer.event.completedStage -ne 'Assemble') { throw 'Assembly completion missing on QC transfer.' }
$null = Send-TestEvent 'start-process'
$result = Send-TestEvent 'out'
if ($result.event.completedEquipment -ne 'Tray Injection QC') { throw 'Direct QC completion failed.' }
'PASS: machine assignment, queue/start, transfers, notes, completion, assembly gate, and PM compatibility. No production data written.'
$null = Send-TestEvent 'receive'
$null = Send-TestEvent 'stage' 'CNC' 'CNC 1'
$null = Send-TestEvent 'start-process'
$parallel = Send-TestEvent 'add-machine' 'EDM' 'EDM 2'
$branch = $parallel.event.assignmentId
if ($branch -eq 'main' -or $parallel.event.completedStage) { throw 'Parallel assignment completed existing work.' }
Assert-Rejected { Send-TestEvent 'add-machine' 'EDM' 'EDM 2' }
Assert-Rejected { Send-TestEvent 'stage' 'EDM' 'EDM 2' }
Assert-Rejected { Send-TestEvent 'start-process' '' 'CNC 1' 'repair' '' }
$null = Send-TestEvent 'start-process' '' 'EDM 2' 'repair' $branch
$result = Send-TestEvent 'note'
if ($result.event.equipment -ne 'CNC 1' -or $result.event.processStatus -ne 'In Progress') { throw 'Parallel start changed original assignment.' }
$null = Send-TestEvent 'stage' 'Assemble' 'Assemble'
$null = Send-TestEvent 'start-process'
Assert-Rejected { Send-TestEvent 'out' }
$null = Send-TestEvent 'stage' 'Tray Injection QC' 'Tray Injection QC'
$null = Send-TestEvent 'start-process'
Assert-Rejected { Send-TestEvent 'out' }
$null = Send-TestEvent 'process-complete' '' '' 'repair' $branch
$result = Send-TestEvent 'out'
if ($result.event.completedStage -ne 'Tray Injection QC') { throw 'Parallel repair completion failed.' }
'PASS: parallel queues, independent start/completion, duplicate machine rejection, and all-branches completion gate.'
Assert-Rejected { Send-TestEvent 'receive' -Kind 'pm' -PmRequest @{} }
Assert-Rejected { Send-TestEvent 'receive' -Kind 'pm' -PmRequest @{ team = 'CE'; requestedBy = 'Sophia' } }
$name = [string][char]0x963f + [char]0x6689
$result = Send-TestEvent 'receive' -Kind 'pm' -PmRequest @{ team = 'FOL'; requestedBy = $name }
if ($result.event.pmRequest.requestedBy -cne $name) { throw 'FOL requester was not saved.' }
$null = Send-TestEvent 'in' -Kind 'pm'
$result = Send-TestEvent 'out' -Kind 'pm'
if ($result.event.pmRequest.team -ne 'FOL' -or $result.event.pmRequest.requestedBy -cne $name) { throw 'PM requester changed during processing.' }
'PASS: PM requester required, team/name validation, FOL name, PM In/Out persistence.'
$null = Send-TestEvent 'receive'
$result = Send-TestEvent 'stage' 'Outsourcing' 'Outsourcing'
if ($result.event.processStatus -ne 'Waiting') { throw 'Outsourcing queue failed.' }
Assert-Rejected { Send-TestEvent 'process-complete' }
$null = Send-TestEvent 'start-process'
Assert-Rejected { Send-TestEvent 'out' }
$result = Send-TestEvent 'process-complete'
if ($result.event.completedStage -ne 'Outsourcing' -or $result.event.completedEquipment -ne 'Outsourcing') { throw 'Outsourcing completion failed.' }
$null = Send-TestEvent 'stage' 'Assemble' 'Assemble'
$null = Send-TestEvent 'start-process'
$null = Send-TestEvent 'stage' 'Tray Injection QC' 'Tray Injection QC'
$null = Send-TestEvent 'start-process'
$null = Send-TestEvent 'out'
'PASS: Outsourcing, mandatory post-assembly QC, QC completion and parallel work gate.'
