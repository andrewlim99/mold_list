# Management events are separate from product snapshots and protected by an SMB file lock.
$managementFile = Join-Path $root 'mold_management.json'
$managementLockFile = Join-Path $root 'mold_management.lock'
$workOrdersDir = Join-Path $root 'work_orders'
. (Join-Path $root 'mold_backup_retention.ps1')
. (Join-Path $root 'mold_repair_review.ps1')
. (Join-Path $root 'mold_approvals.ps1')

function Read-ManagementData {
  if (-not [IO.File]::Exists($managementFile)) {
    return [pscustomobject]@{ version = 1; events = @() }
  }
  $data = (Read-FileTextShared -Path $managementFile) | ConvertFrom-Json
  if ($null -eq $data -or $data.version -ne 1 -or $null -eq $data.events) {
    throw 'Management history could not be read. No records were overwritten.'
  }
  return $data
}

function Invoke-ManagementLock {
  param([scriptblock]$Operation)
  $lock = Invoke-WithRetry -Action {
    [IO.File]::Open($managementLockFile, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  }
  try { & $Operation } finally { $lock.Dispose() }
}

function Write-ManagementData {
  param($Data)
  $temp = $managementFile + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
  try {
    [IO.File]::WriteAllText($temp, ($Data | ConvertTo-Json -Depth 40), (New-Object Text.UTF8Encoding($false)))
    if ([IO.File]::Exists($managementFile)) {
      $backupDir = Join-Path $root 'Backups'
      [IO.Directory]::CreateDirectory($backupDir) | Out-Null
      $backup = Join-Path $backupDir ('mold_management_' + [DateTime]::UtcNow.ToString('yyyyMMdd_HHmmss_fffffff') + '.json')
      [IO.File]::Copy($managementFile, $backup, $false)
    }
    Move-Item -LiteralPath $temp -Destination $managementFile -Force
    try { Remove-ExpiredMoldBackups -Kind Management } catch { Write-Warning ('Backup cleanup skipped: ' + $_.Exception.Message) }
  } finally {
    if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }
  }
}

function Assert-ManagementMold {
  param([string]$Identity)
  $found = @((Read-Payload).rows | Where-Object { (Get-RowIdentity $_) -eq $Identity })
  if (-not $Identity -or -not $found.Count) {
    throw 'This mold was not found in shared data. Refresh the Mold List.'
  }
  return $found[0]
}

function New-ManagementOrder {
  param($InputOrder, $PreviousOrder, $Events, $Mold, [DateTimeOffset]$Now, [string]$Identity = '')
  $team = ([string]$InputOrder.team).Trim().ToUpperInvariant()
  $requestedBy = ([string]$InputOrder.requestedBy).Trim()
  $reason = ([string]$InputOrder.reason).Trim()
  $rev = if ($PreviousOrder) { [string]$PreviousOrder.rev } else { [string]$Mold.rev }
  $urgent = $InputOrder.urgent -eq $true
  $requestedCompletionDate = if ($urgent) { ([string]$InputOrder.requestedCompletionDate).Trim() } else { '' }
  if ($requestedCompletionDate) {
    $parsedDueDate = [datetime]::MinValue
    if (-not [datetime]::TryParseExact($requestedCompletionDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$parsedDueDate)) {
      throw 'Enter a valid requested completion date.'
    }
  }
  if ($team -notmatch '^[A-Z][A-Z&-]{0,15}$') { throw 'Enter a valid team code (for example CE).' }
  if (-not $PreviousOrder -and $team -notin @('CE','FOL')) { throw 'Choose CE or FOL.' }
  if (-not $requestedBy -or $requestedBy.Length -gt 100) { throw 'Enter Request By (maximum 100 characters).' }
  $requesters = Get-ManagementRequesters
  if ($requesters[$team] -cnotcontains $requestedBy -and -not ($PreviousOrder -and [string]$PreviousOrder.requestedBy -ceq $requestedBy)) {
    throw 'Choose Request By for the selected team.'
  }
  if (-not $reason -or $reason.Length -gt 500) { throw 'Enter Reason (maximum 500 characters).' }
  if ($rev.Length -gt 100) { throw 'Rev. exceeds 100 characters.' }
  $items = @($InputOrder.items)
  if ($items.Count -lt 1 -or $items.Count -gt 100) { throw 'Enter between 1 and 100 modification items.' }
  $cleanItems = @()
  $itemIndex = 0
  $itemIds = @{}
  foreach ($item in $items) {
    $modification = ([string]$item.modification).Trim()
    $doneBy = ([string]$item.doneBy).Trim()
    if (-not $modification -or $modification.Length -gt 10000) { throw 'Enter a modification for every row (maximum 10,000 characters).' }
    if ($doneBy.Length -gt 100) { throw 'Done By exceeds 100 characters.' }
    $previousItem = $null
    if ($PreviousOrder) {
      $matches = @($PreviousOrder.items | Where-Object { $_.id -and $_.id -eq $item.id })
      if ($matches.Count) { $previousItem = $matches[0] }
      elseif ($itemIndex -lt @($PreviousOrder.items).Count -and -not $PreviousOrder.items[$itemIndex].id) { $previousItem = $PreviousOrder.items[$itemIndex] }
    }
    $cleanItem = ConvertTo-RepairReviewItem $item $previousItem $Identity $Now
    if ($itemIds.ContainsKey($cleanItem.id)) { throw 'Duplicate repair item IDs.' }
    $itemIds[$cleanItem.id] = $true
    $cleanItems += $cleanItem
    $itemIndex++
  }
  if ($PreviousOrder) {
    if ($team -ne $PreviousOrder.team) { throw 'The team cannot change after the request number is assigned.' }
    $requestNo = [string]$PreviousOrder.requestNo
    $requestDate = [string]$PreviousOrder.requestDate
  } else {
    $requestDate = $Now.ToOffset([TimeSpan]::FromHours(8)).ToString('yyyy-MM-dd')
    $prefix = $requestDate.Replace('-', '') + '-' + $team
    $pattern = '^' + [regex]::Escape($prefix) + '([0-9]+)$'
    $max = 0
    foreach ($existing in $Events) {
      if ([string]$existing.workOrderNo -match $pattern) { $max = [Math]::Max($max, [int]$Matches[1]) }
    }
    $requestNo = $prefix + ($max + 1).ToString('D2')
  }
  $order = [pscustomobject]@{
    requestNo = $requestNo; requestDate = $requestDate; team = $team; requestedBy = $requestedBy
    rev = $rev; reason = $reason; items = $cleanItems
    urgent = $urgent; requestedCompletionDate = $requestedCompletionDate
    moldNo = if ($PreviousOrder) { $PreviousOrder.moldNo } else { [string]$Mold.moldNo }
    description = if ($PreviousOrder) { $PreviousOrder.description } else { [string]$Mold.description }
    qcLeaderApproved = $false; qcLeaderBy = ([string]$InputOrder.qcLeaderBy).Trim(); qcLeaderAt = ''
    postQcComment = ([string]$InputOrder.postQcComment).Trim()
    preQcLeaderApproved = $false; preQcLeaderBy = ([string]$InputOrder.preQcLeaderBy).Trim(); preQcLeaderAt = ''
  }
  if ($order.qcLeaderBy.Length -gt 100) { throw 'QC Leader name exceeds 100 characters.' }
  $comparisonItems = @($PreviousOrder.items | Where-Object { $null -ne $_ } | ForEach-Object {
    $copy = $_ | ConvertTo-Json -Depth 12 | ConvertFrom-Json
    foreach ($prefix in @('mold','moldQc')) {
      $legacy = if ($prefix -eq 'mold') { 'room' } else { 'qc' }
      if ($null -eq $copy.($prefix + 'Checked')) {
        $copy | Add-Member -NotePropertyName ($prefix + 'Checked') -NotePropertyValue ($copy.($legacy + 'Approved') -eq $true) -Force
        $copy | Add-Member -NotePropertyName ($prefix + 'CheckedBy') -NotePropertyValue ([string]$copy.($legacy + 'By')) -Force
        $copy | Add-Member -NotePropertyName ($prefix + 'CheckedAt') -NotePropertyValue ([string]$copy.($legacy + 'At')) -Force
      }
    }
    foreach ($key in @('beforePhoto','afterPhoto')) {
      $listKey = $key + 's'
      if ($null -eq $copy.$listKey) {
        $ids = if ($copy.$key) { @($copy.$key) } else { @() }
        $copy | Add-Member -NotePropertyName $listKey -NotePropertyValue @($ids) -Force
      }
    }
    $copy
  })
  $allFields = @($cleanItems[0].PSObject.Properties.Name | Sort-Object)
  $unchanged = $PreviousOrder -and (($cleanItems | Select-Object $allFields | ConvertTo-Json -Depth 12 -Compress) -ceq ($comparisonItems | Select-Object $allFields | ConvertTo-Json -Depth 12 -Compress)) -and $rev -ceq [string]$PreviousOrder.rev -and $reason -ceq [string]$PreviousOrder.reason -and $requestedBy -ceq [string]$PreviousOrder.requestedBy
  $preFields = @('id','moldChecked','moldCheckedBy','moldCheckedAt','moldQcChecked','moldQcCheckedBy','moldQcCheckedAt','modification','doneBy','repairType','beforeValue','afterValue','beforePhoto','afterPhoto','beforePhotos','afterPhotos','roomApproved','roomBy','roomAt','qcApproved','qcBy','qcAt','waived','waiveReason','waivedBy','waivedAt')
  $preUnchanged = $PreviousOrder -and (($cleanItems | Select-Object $preFields | ConvertTo-Json -Depth 12 -Compress) -ceq ($comparisonItems | Select-Object $preFields | ConvertTo-Json -Depth 12 -Compress)) -and $rev -ceq [string]$PreviousOrder.rev -and $reason -ceq [string]$PreviousOrder.reason -and $requestedBy -ceq [string]$PreviousOrder.requestedBy
  if ($order.preQcLeaderBy.Length -gt 100) { throw 'Repair QC Leader name exceeds 100 characters.' }
  if ($InputOrder.preQcLeaderApproved -eq $true -and $preUnchanged) {
    $problem = Get-RepairReviewError $order
    if ($problem) { throw $problem }
    if (-not $order.preQcLeaderBy) { throw 'Enter the Repair QC Leader name.' }
    $order.preQcLeaderApproved = $true
    $order.preQcLeaderAt = if ($PreviousOrder.preQcLeaderApproved -eq $true -and $PreviousOrder.preQcLeaderBy -ceq $order.preQcLeaderBy) { $PreviousOrder.preQcLeaderAt } else { $Now.ToString('o') }
  }
  if ($order.postQcComment.Length -gt 2000) { throw 'QC Comment exceeds 2000 characters.' }
  $unchanged = $unchanged -and $order.postQcComment -ceq ([string]$PreviousOrder.postQcComment).Trim() -and $order.preQcLeaderApproved -eq ($PreviousOrder.preQcLeaderApproved -eq $true) -and $order.preQcLeaderBy -ceq [string]$PreviousOrder.preQcLeaderBy
  if ($InputOrder.qcLeaderApproved -eq $true -and $unchanged) {
    $problem = Get-RepairReviewError $order -Phase 'PostQC'
    if ($problem) { throw $problem }
    if (-not $order.qcLeaderBy) { throw 'Enter the QC Leader name.' }
    $order.qcLeaderApproved = $true
    $order.qcLeaderAt = if ($PreviousOrder.qcLeaderApproved -eq $true -and $PreviousOrder.qcLeaderBy -ceq $order.qcLeaderBy) { $PreviousOrder.qcLeaderAt } else { $Now.ToString('o') }
  }
  return $order
}

function Get-ManagementRequesters {
  return @{ CE = @('Joseph','Hugo','Ray','Rita','Joey','Jack'); FOL = @('Sophia','Yun', ([string][char]0x963f + [char]0x6689)) }
}

function Save-ManagementEvent {
  param($Payload)
  $identity = [string]$Payload.identity
  $kind = [string]$Payload.kind
  $action = [string]$Payload.action
  $eventId = [string]$Payload.eventId
  $guidValue = [guid]::Empty
  if (-not [guid]::TryParse($eventId, [ref]$guidValue)) { throw 'Invalid event ID.' }
  if ($kind -notin @('pm', 'repair')) { throw 'Invalid management category.' }
  if ($action -notin @('receive', 'in', 'out', 'stage', 'add-machine', 'start-process', 'process-complete', 'note', 'cancel', 'delete-job', 'clear-job-history')) { throw 'Invalid management action.' }
  if ($kind -eq 'repair' -and $action -eq 'delete-job') { throw 'Repair requests cannot be deleted from History. Refresh the page to clear history only.' }
  $moldSnapshot = Assert-ManagementMold $identity
  return Invoke-ManagementLock {
    $data = Read-ManagementData
    $duplicate = @($data.events | Where-Object { $_.id -eq $eventId })
    if ($duplicate.Count) {
      if ($duplicate[0].identity -ne $identity -or $duplicate[0].kind -ne $kind -or $duplicate[0].action -ne $action) { throw 'Event ID already used.' }
      return @{ ok = $true; event = $duplicate[0]; events = @($data.events) }
    }
    # Normalize a copy for workflow decisions without rewriting historical records.
    $history = @($data.events | Where-Object { $_.identity -eq $identity -and $_.kind -eq $kind } | ForEach-Object {
      $entry = $_ | ConvertTo-Json -Depth 30 -Compress | ConvertFrom-Json
      foreach ($field in @('stage','equipment','completedStage','completedEquipment')) {
        if ($entry.$field -in @('Data Update','Repair QC')) { $entry.$field = 'Repair QC Approval' }
        elseif ($entry.$field -eq 'QC Inspection') { $entry.$field = 'QC Final Approval' }
      }
      $entry
    })
    $last = if ($history.Count) { $history[-1] } else { $null }
    if ([string]$Payload.expectedEventId -ne [string]$last.id) { throw 'CONFLICT: This history changed on another computer. Refresh and try again.' }
    $receipts = @($history | Where-Object { $_.action -eq 'receive' })
    $receipt = if ($receipts.Count) { $receipts[-1] } else { $null }
    $job = @($history | Where-Object { $receipt -and $_.jobId -eq $receipt.jobId })
    $closed = @($job | Where-Object { $_.action -in @('out','cancel') }).Count -gt 0
    $active = $receipt -and -not $closed
    if ($null -ne $Payload.approval) {
      if ($kind -ne 'repair' -or $action -ne 'note' -or -not $active -or $Payload.jobId -ne $receipt.jobId) { throw 'No matching open repair request.' }
      return Save-WholeOrderApproval $Payload $data $job $moldSnapshot
    }
    $stage = ''
    $completedStage = ''
    $equipment = ''
    $processStatus = ''
    $completedEquipment = ''
    $assignmentId = if ($kind -eq 'repair') { 'main' } else { '' }
    $notes = ([string]$Payload.notes).Trim()
    $pmRequest = $null
    if ($kind -eq 'pm') {
      if ($action -eq 'receive') {
        $team = ([string]$Payload.pmRequest.team).Trim().ToUpperInvariant()
        $requestedBy = ([string]$Payload.pmRequest.requestedBy).Trim()
        $requesters = Get-ManagementRequesters
        if ($team -notin @('CE','FOL') -or $requesters[$team] -cnotcontains $requestedBy) { throw 'Choose a PM request team and Request By for that team.' }
        $pmRequest = [pscustomobject]@{ team = $team; requestedBy = $requestedBy }
      } elseif ($receipt) { $pmRequest = $receipt.pmRequest }
    }
    $workOrder = $null
    if ($null -ne $Payload.workOrder) {
      if ($kind -ne 'repair' -or $action -notin @('receive','note')) { throw 'Work Orders can only be saved when receiving or updating a repair.' }
      $previousOrders = @($job | Where-Object { $null -ne $_.workOrder })
      $previousOrder = if ($action -ne 'receive' -and $previousOrders.Count) { $previousOrders[-1].workOrder } else { $null }
      $workOrder = New-ManagementOrder $Payload.workOrder $previousOrder @($data.events) $moldSnapshot ([DateTimeOffset]::UtcNow) $identity
      foreach ($item in $workOrder.items) {
        $old = @($previousOrder.items | Where-Object id -eq $item.id) | Select-Object -First 1
        foreach ($prefix in @('room','qc','postQc')) {
          if ($item.($prefix + 'Approved') -and (-not $old.($prefix + 'Approved') -or $item.($prefix + 'By') -cne $old.($prefix + 'By'))) {
            throw 'Use the header approval buttons.'
          }
        }
      }
      foreach ($prefix in @('preQcLeader','qcLeader')) {
        if ($workOrder.($prefix + 'Approved') -and (-not $previousOrder.($prefix + 'Approved') -or $workOrder.($prefix + 'By') -cne $previousOrder.($prefix + 'By'))) {
          throw 'Use the header approval buttons.'
        }
      }
      $currentProcesses = @($job | Where-Object { $_.action -in @('receive','stage','add-machine','start-process','process-complete') } | Group-Object { if ($_.assignmentId) { $_.assignmentId } else { 'main' } } | ForEach-Object { $_.Group[-1] })
      $itemCheckPhase = @($currentProcesses | Where-Object { $_.stage -in @('Assemble','Repair QC Approval') -and $_.processStatus -eq 'In Progress' }).Count -gt 0
      foreach ($item in $workOrder.items) {
        $old = @($previousOrder.items | Where-Object id -eq $item.id) | Select-Object -First 1
        foreach ($prefix in @('mold','moldQc')) {
          $legacy = if ($prefix -eq 'mold') { 'room' } else { 'qc' }
          $oldCheckAt = if ($null -ne $old.($prefix + 'CheckedAt')) { $old.($prefix + 'CheckedAt') } else { $old.($legacy + 'At') }
          if ($item.($prefix + 'Checked') -and $item.($prefix + 'CheckedAt') -ne $oldCheckAt -and -not $itemCheckPhase) { throw 'Start Assemble or Repair QC Approval before checking items.' }
        }
      }
      $repairQcActive = @($currentProcesses | Where-Object { ($_.stage -eq 'Repair QC Approval' -and $_.processStatus -eq 'In Progress') -or ($_.action -eq 'process-complete' -and $_.completedStage -eq 'Repair QC Approval') }).Count -gt 0
      $postQcActive = @($currentProcesses | Where-Object { ($_.stage -eq 'QC Final Approval' -and $_.processStatus -eq 'In Progress') -or ($_.action -eq 'process-complete' -and $_.completedStage -eq 'QC Final Approval') }).Count -gt 0
      foreach ($reviewItem in $workOrder.items) {
        $oldItem = @($previousOrder.items | Where-Object id -eq $reviewItem.id) | Select-Object -First 1
        if ($reviewItem.qcApproved -and (-not $oldItem.qcApproved -or $reviewItem.qcBy -cne $oldItem.qcBy) -and -not $repairQcActive) { throw 'Start Repair QC before recording item QC confirmation.' }
        if ($reviewItem.postQcApproved -and (-not $oldItem.postQcApproved -or $reviewItem.postQcBy -cne $oldItem.postQcBy) -and -not $postQcActive) { throw 'Start QC Final Approval after injection before recording post-injection QC.' }
      }
      if ($workOrder.preQcLeaderApproved -and (-not $previousOrder.preQcLeaderApproved -or $workOrder.preQcLeaderBy -cne $previousOrder.preQcLeaderBy) -and -not $repairQcActive) { throw 'Start Repair QC before Repair QC Leader approval.' }
      if ($workOrder.qcLeaderApproved -and (-not $previousOrder.qcLeaderApproved -or $workOrder.qcLeaderBy -cne $previousOrder.qcLeaderBy)) {
        if (-not $postQcActive) { throw 'Start QC Final Approval before final QC Leader approval.' }
      }
      $lines = @()
      for ($i = 0; $i -lt $workOrder.items.Count; $i++) {
        $item = $workOrder.items[$i]
        $lines += ('{0}. {1}' -f ($i + 1), $item.modification) + $(if ($item.doneBy) { ' [Done by: ' + $item.doneBy + ']' } else { '' })
      }
      $notes = $lines -join "`n"
    }
    if ($notes.Length -gt 20000) { throw 'Repair details are too long (maximum 20,000 characters).' }
    if ($action -in @('delete-job','clear-job-history')) {
      $targetJobId = [string]$Payload.jobId
      if (-not $targetJobId -or -not @($receipts | Where-Object { $_.jobId -eq $targetJobId }).Count) {
        throw 'Choose an existing request to delete.'
      }
      if ($action -eq 'clear-job-history') {
        foreach ($entry in @($data.events | Where-Object { $_.identity -eq $identity -and $_.kind -eq $kind -and $_.jobId -eq $targetJobId })) {
          $entry | Add-Member -NotePropertyName historyHidden -NotePropertyValue $true -Force
        }
      } else {
        $data.events = @($data.events | Where-Object { -not ($_.identity -eq $identity -and $_.kind -eq $kind -and $_.jobId -eq $targetJobId) });
      }
      Write-ManagementData $data;
      return @{ ok = $true; event = $null; events = @($data.events); purged = $true }
    }
    if ($action -eq 'receive') {
      if ($active) { throw 'An open job already exists for this mold and category.' }
      if ($kind -eq 'repair' -and -not $notes) { throw 'Enter the repair details in English.' }
      $jobId = $eventId
      $stage = 'Waiting'
    } else {
      if (-not $active -or [string]$Payload.jobId -ne [string]$receipt.jobId) { throw 'No matching open job. Refresh the history.' }
      $jobId = $receipt.jobId
      $allProgress = @($job | Where-Object { $_.action -in @('receive','in','stage','add-machine','start-process','process-complete') })
      $assignments = @{}
      foreach ($entry in $allProgress) {
        $entryKey = if ([string]$entry.assignmentId) { [string]$entry.assignmentId } else { 'main' }
        $assignments[$entryKey] = $entry
      }
      if ($kind -eq 'repair') {
        if ([string]$Payload.assignmentId) { $assignmentId = [string]$Payload.assignmentId }
        elseif ($assignments.Count -gt 1 -and $action -notin @('note','cancel')) { throw 'Select a machine assignment before changing its process.' }
        if (-not $assignments.ContainsKey($assignmentId)) { throw 'Machine assignment was not found. Refresh and try again.' }
      }
      $progress = @($allProgress | Where-Object { $kind -eq 'pm' -or ([string]$_.assignmentId -eq $assignmentId) -or (-not [string]$_.assignmentId -and $assignmentId -eq 'main') })
      $stage = [string]$progress[-1].stage
      $equipment = [string]$progress[-1].equipment
      $processStatus = [string]$progress[-1].processStatus
      if ($stage -eq 'Tray Injection QC') { $stage = 'Tray Injection' }
      if ($equipment -eq 'Tray Injection QC') { $equipment = 'Tray Injection' }
      if (-not $equipment -and $stage -in @('Welding','Assemble','Outsourcing','Repair QC Approval','Tray Injection','QC Final Approval')) { $equipment = $stage }
      if (-not $processStatus -and $stage -in @('Polishing','Welding','CNC','EDM','Assemble','Outsourcing','Repair QC Approval','Tray Injection','QC Final Approval')) { $processStatus = 'In Progress' }
      if ($kind -eq 'repair' -and ($action -eq 'out' -or ($action -in @('stage','process-complete') -and $stage -in @('Repair QC Approval','Tray Injection','QC Final Approval','Awaiting Next Process')))) {
        $savedOrders = @($job | Where-Object { $_.workOrder })
        $savedOrder = if ($savedOrders.Count) { $savedOrders[-1].workOrder } else { $null }
        $reviewStage = if ($stage -eq 'Awaiting Next Process') { [string]$progress[-1].completedStage } else { $stage }
        $phase = switch ($reviewStage) { 'Repair QC Approval' { 'PreApproval' }; 'Tray Injection' { 'PreApproval' }; 'QC Final Approval' { 'PostQC' }; default { '' } }
        $problem = if ($phase -or $action -eq 'out') { Get-RepairReviewError $savedOrder -Final:($action -eq 'out') -Phase $phase } else { '' }
        if ($problem) { throw $problem }
      }
      if ($kind -eq 'pm') {
        if ($action -eq 'in') {
          if ($stage -ne 'Waiting') { throw 'PM In has already been recorded.' }
          $stage = 'In Progress'
        } elseif ($action -eq 'out') {
          if ($stage -ne 'In Progress') { throw 'Record PM In before PM Out.' }
          $stage = 'Completed'
        } elseif ($action -notin @('note','cancel')) { throw 'Invalid PM action.' }
      } else {
        if ($action -in @('stage','add-machine')) {
          $next = [string]$Payload.stage
          $nextEquipment = [string]$Payload.equipment
          $allowedEquipment = @{ Waiting = @(''); Welding = @('Welding'); CNC = @('CNC 1','CNC 2','CNC 3'); EDM = @('EDM 1','EDM 2','EDM 3'); Assemble = @('Assemble'); Outsourcing = @('Outsourcing'); 'Repair QC Approval' = @('Repair QC Approval'); 'Tray Injection' = @('Tray Injection'); 'QC Final Approval' = @('QC Final Approval') }
          if ($next -notin @('Waiting','Welding','CNC','EDM','Assemble','Outsourcing','Repair QC Approval','Tray Injection','QC Final Approval')) { throw 'Choose a valid repair stage.' }
          if ($next -eq 'Repair QC Approval') {
            $assemblyFinished = ($stage -eq 'Assemble' -and $processStatus -eq 'In Progress') -or ($stage -eq 'Awaiting Next Process' -and $progress[-1].action -eq 'process-complete' -and $progress[-1].completedStage -eq 'Assemble')
            if ($action -ne 'stage' -or -not $assemblyFinished) { throw 'Complete Assemble and move this assignment to Repair QC Approval.' }
          }
          if ($next -eq 'Tray Injection') {
            $requiredStage = 'Repair QC Approval'
            $ready = ($stage -eq $requiredStage -and $processStatus -eq 'In Progress') -or ($stage -eq 'Awaiting Next Process' -and $progress[-1].action -eq 'process-complete' -and $progress[-1].completedStage -eq $requiredStage)
            if ($action -ne 'stage' -or -not $ready) { throw "Complete $requiredStage before moving to $next." }
          }
          if ($next -eq 'QC Final Approval') {
            $injectionFinished = ($stage -eq 'Tray Injection' -and $processStatus -eq 'In Progress') -or ($stage -eq 'Awaiting Next Process' -and $progress[-1].action -eq 'process-complete' -and $progress[-1].completedStage -eq 'Tray Injection')
            if ($action -ne 'stage' -or -not $injectionFinished) { throw 'Complete Tray Injection and move this assignment to QC Final Approval.' }
          }
          if ($nextEquipment -notin $allowedEquipment[$next]) { throw 'Choose a valid machine for this process.' }
          if ($action -eq 'add-machine' -and -not $nextEquipment) { throw 'Choose a machine for the parallel queue.' }
          foreach ($key in $assignments.Keys) {
            $otherEquipment = [string]$assignments[$key].equipment
            if (-not $otherEquipment -and $assignments[$key].stage -in @('Welding','Assemble','Outsourcing','Repair QC Approval','Tray Injection','QC Final Approval')) { $otherEquipment = [string]$assignments[$key].stage }
            if ($nextEquipment -and $otherEquipment -eq $nextEquipment -and ($key -ne $assignmentId -or $action -eq 'add-machine')) { throw 'This request already has work assigned to this machine.' }
          }
          if ($next -eq $stage -and $nextEquipment -eq $equipment) { throw 'This repair is already assigned to this machine.' }
          if ($action -eq 'stage' -and $processStatus -eq 'In Progress' -and $stage -in @('Polishing','Welding','CNC','EDM','Assemble','Outsourcing','Repair QC Approval','Tray Injection','QC Final Approval') -and ($next -ne $stage -or $equipment)) {
            $completedStage = $stage
            $completedEquipment = $equipment
          }
          $stage = $next
          $equipment = $nextEquipment
          $processStatus = 'Waiting'
          if ($action -eq 'add-machine') { $assignmentId = $eventId }
        } elseif ($action -eq 'start-process') {
          if ($stage -notin @('Welding','CNC','EDM','Assemble','Outsourcing','Repair QC Approval','Tray Injection','QC Final Approval') -or -not $equipment -or $processStatus -ne 'Waiting') { throw 'Assign this request to a machine before starting work.' }
          if ([string]$Payload.equipment -ne $equipment) { throw 'Move to Queue before starting work on the selected machine.' }
          $processStatus = 'In Progress'
        } elseif ($action -eq 'process-complete') {
          if ($stage -notin @('Polishing','Welding','CNC','EDM','Assemble','Outsourcing','Repair QC Approval','Tray Injection','QC Final Approval')) { throw 'No active process to complete. Start a repair process first.' }
          if ($processStatus -ne 'In Progress') { throw 'Start work before completing this process.' }
          $completedStage = $stage
          $completedEquipment = $equipment
          $stage = 'Awaiting Next Process'
          $equipment = ''
          $processStatus = ''
        } elseif ($action -eq 'out') {
          foreach ($key in $assignments.Keys) {
            if ($key -ne $assignmentId -and $assignments[$key].stage -ne 'Awaiting Next Process') { throw 'Complete the other machine assignments before completing this repair.' }
          }
          $qcFinished = $stage -eq 'Awaiting Next Process' -and $progress[-1].action -eq 'process-complete' -and $progress[-1].completedStage -in @('QC Final Approval','Tray Injection QC')
          if ($stage -ne 'QC Final Approval' -and -not $qcFinished) { throw 'Complete QC Final Approval before completing the repair.' }
          if ($stage -eq 'QC Final Approval') {
            if ($processStatus -ne 'In Progress') { throw 'Start QC Final Approval before completing the repair.' }
            $completedStage = 'QC Final Approval'
            $completedEquipment = $equipment
          }
          $stage = 'Completed'
          $equipment = ''
          $processStatus = ''
        } elseif ($action -notin @('note','cancel')) { throw 'Invalid repair action.' }
      }
      if ($action -eq 'cancel') { $stage = 'Cancelled'; if (-not $notes) { throw 'Enter a cancellation reason.' } }
      if ($action -eq 'note' -and -not $notes) { throw 'Enter a history note.' }
    }
    if ($kind -eq 'repair' -and -not $workOrder -and $notes -match '[\p{IsCJKUnifiedIdeographs}\p{IsHangulSyllables}\p{IsHiragana}\p{IsKatakana}]') {
      throw 'Repair history must be in English. Keep the original wording in the Work Order attachment.'
    }
    $attachment = $null
    if ([string]$Payload.attachmentId) {
      $attachmentId = [string]$Payload.attachmentId
      if ($attachmentId -notmatch '^[a-f0-9]{32}$') { throw 'Invalid Work Order attachment.' }
      $metaPath = Join-Path $workOrdersDir ($attachmentId + '.json')
      if (-not [IO.File]::Exists($metaPath)) { throw 'Work Order attachment was not found.' }
      $attachment = (Read-FileTextShared $metaPath) | ConvertFrom-Json
      if ($attachment.identity -ne $identity) { throw 'This Work Order belongs to another mold.' }
    }
    $clicked = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$Payload.clickedAt, [ref]$clicked)) { throw 'Invalid event time.' }
    $now = [DateTimeOffset]::UtcNow
    if ([Math]::Abs(($now - $clicked).TotalHours) -gt 24) { throw 'Computer clock differs by more than 24 hours. Check the clock and try again.' }
    $orderNo = ([string]$Payload.workOrderNo).Trim()
    if ($workOrder) { $orderNo = $workOrder.requestNo }
    if (-not $orderNo -and $action -ne 'receive') {
      $orderRecords = @($job | Where-Object { [string]$_.workOrderNo })
      if ($orderRecords.Count) { $orderNo = [string]$orderRecords[-1].workOrderNo }
    }
    $event = [pscustomobject]@{
      id = $eventId; identity = $identity; kind = $kind; action = $action; jobId = $jobId
      assignmentId = $assignmentId
      stage = $stage; at = $clicked.ToUniversalTime().ToString('o'); savedAt = $now.ToString('o')
      notes = $notes; workOrderNo = $orderNo; attachment = $attachment
      workOrder = $workOrder
      pmRequest = $pmRequest
      completedStage = $completedStage
      equipment = $equipment; processStatus = $processStatus; completedEquipment = $completedEquipment
      repairDetails = if ($kind -eq 'repair' -and $receipt -and $action -ne 'receive') {
        $savedOrders = @($job | Where-Object { $null -ne $_.workOrder })
        if ($workOrder) { $notes } elseif ($savedOrders.Count) { [string]$savedOrders[-1].notes } else { [string]$receipt.notes }
      } else { '' }
      moldNo = [string]$moldSnapshot.moldNo; brand = [string]$moldSnapshot.brand
      description = [string]$moldSnapshot.description; customer = [string]$moldSnapshot.customer
    }
    $data.events = @($data.events) + @($event)
    Write-ManagementData $data
    return @{ ok = $true; event = $event; events = @($data.events) }
  }
}

function Save-ManagementWorkOrder {
  param($Payload)
  $null = Assert-ManagementMold ([string]$Payload.identity)
  $name = [IO.Path]::GetFileName([string]$Payload.fileName)
  $ext = [IO.Path]::GetExtension($name).ToLowerInvariant()
  if ($ext -notin @('.xlsx','.xls','.xlsm')) { throw 'Choose an Excel Work Order (.xlsx, .xls or .xlsm).' }
  if (([string]$Payload.contentBase64).Length -gt 28MB) { throw 'Work Order is too large (maximum 20 MB).' }
  $bytes = [Convert]::FromBase64String([string]$Payload.contentBase64)
  if ($bytes.Length -gt 20MB -or $bytes.Length -lt 8) { throw 'Invalid Work Order file size.' }
  $zip = $bytes[0] -eq 0x50 -and $bytes[1] -eq 0x4b
  $ole = [BitConverter]::ToString($bytes,0,8) -eq 'D0-CF-11-E0-A1-B1-1A-E1'
  if (-not ($zip -or ($ext -eq '.xls' -and $ole))) { throw 'This file does not look like an Excel workbook.' }
  $source = [string]$Payload.sourceText
  if ($source.Length -gt 200000) { throw 'Extracted Work Order text is too long.' }
  [IO.Directory]::CreateDirectory($workOrdersDir) | Out-Null
  $id = [guid]::NewGuid().ToString('N')
  $meta = [pscustomobject]@{
    id = $id; identity = [string]$Payload.identity; fileName = $name
    path = 'work_orders/' + $id + $ext; uploadedAt = [DateTime]::UtcNow.ToString('o')
    sourceText = $source; sheet = [string]$Payload.sheet
  }
  [IO.File]::WriteAllBytes((Join-Path $workOrdersDir ($id + $ext)), $bytes)
  [IO.File]::WriteAllText((Join-Path $workOrdersDir ($id + '.json')), ($meta | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
  return @{ ok = $true; attachment = $meta }
}

function Invoke-ManagementRequest {
  param($Context)
  $request = $Context.Request
  $path = $request.Url.AbsolutePath
  if ($path -notlike '/api/management*') { return $false }
  try {
    if ($request.HttpMethod -eq 'GET' -and $path -eq '/api/management') {
      $data = Invoke-ManagementLock { Read-ManagementData }
      Write-JsonResponse $Context 200 @{ ok = $true; events = @($data.events); workOrderFormVersion = 1; repairReviewVersion = 1 }
    } elseif ($request.HttpMethod -eq 'GET' -and $path -match '^/api/management/photo/([a-f0-9]{32})$') {
      $id = $Matches[1]
      $meta = (Read-FileTextShared (Join-Path $repairPhotosDir ($id + '.json'))) | ConvertFrom-Json
      if ($meta.extension -notin @('.png','.jpg')) { throw 'Invalid photo type.' }
      $bytes = [IO.File]::ReadAllBytes((Join-Path $repairPhotosDir ($id + $meta.extension)))
      $Context.Response.ContentType = if ($meta.extension -eq '.png') { 'image/png' } else { 'image/jpeg' }
      $Context.Response.Headers['X-Content-Type-Options'] = 'nosniff'
      $Context.Response.ContentLength64 = $bytes.Length
      $Context.Response.OutputStream.Write($bytes,0,$bytes.Length)
      $Context.Response.Close()
    } elseif ($request.HttpMethod -eq 'POST' -and $path -in @('/api/management/event','/api/management/work-order','/api/management/photo')) {
      if ($request.ContentLength64 -gt 30MB -or $request.ContentLength64 -lt 0) { throw 'Request exceeds the 30 MB limit.' }
      $reader = New-Object IO.StreamReader($request.InputStream, [Text.Encoding]::UTF8, $true)
      try { $payload = Parse-RequestPayload ($reader.ReadToEnd()) } finally { $reader.Dispose() }
      $result = if ($path -eq '/api/management/event') { Save-ManagementEvent $payload } elseif ($path -eq '/api/management/photo') { Save-RepairPhoto $payload } else { Save-ManagementWorkOrder $payload }
      Write-JsonResponse $Context 200 $result
    } else { Write-JsonResponse $Context 404 @{ ok = $false; error = 'Management endpoint not found.' } }
  } catch {
    $status = if ($_.Exception.Message -like 'CONFLICT:*') { 409 } else { 400 }
    Write-JsonResponse $Context $status @{ ok = $false; error = $_.Exception.Message }
  }
  return $true
}
