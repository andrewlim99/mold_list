function Save-WholeOrderApproval {
  param($Payload, $Data, $Job, $Mold)
  $roles = @('Mold Leader','Mold QC','Post-injection QC','Post-injection QC Leader')
  $role = [string]$Payload.approval.role
  if ($role -eq 'Repair QC') { $role = 'Mold QC' }
  $by = ([string]$Payload.approval.by).Trim()
  $reason = ([string]$Payload.approval.reason).Trim()
  $decision = [string]$Payload.approval.decision
  if ($role -notin $roles -or $decision -notin @('Approve','Reject')) { throw 'Choose a valid approval decision.' }
  if (-not $by -or $by.Length -gt 100) { throw 'Enter the approver name.' }
  if ($reason.Length -gt 2000 -or ($decision -eq 'Reject' -and -not $reason)) { throw 'Enter a rejection reason (maximum 2000 characters).' }
  $saved = @($Job | Where-Object workOrder)
  if (-not $saved.Count) { throw 'Save the Work Order first.' }
  $order = $saved[-1].workOrder | ConvertTo-Json -Depth 30 | ConvertFrom-Json
  $progress = @($Job | Where-Object { $_.action -in @('receive','stage','add-machine','start-process','process-complete') } | Group-Object { if ($_.assignmentId) { $_.assignmentId } else { 'main' } } | ForEach-Object { $_.Group[-1] })
  $now = [DateTimeOffset]::UtcNow.ToString('o')
  if ($decision -eq 'Approve') {
    $check = if ($role -eq 'Mold Leader') { 'moldChecked' } elseif ($role -eq 'Mold QC') { 'moldQcChecked' } else { '' }
    if ($check -and @($order.items | Where-Object { -not $_.$check -and -not $_.waived }).Count) { throw "Complete every $role item check before approving." }
    if ($role -eq 'Mold QC' -and @($order.items | Where-Object { -not $_.roomApproved }).Count) { throw 'Mold Leader approval is required.' }
    if ($role -eq 'Post-injection QC' -and -not $order.preQcLeaderApproved) { throw 'Repair QC approval is required.' }
    if ($role -eq 'Post-injection QC Leader' -and @($order.items | Where-Object { -not $_.postQcApproved }).Count) { throw 'Post-injection QC approval is required.' }
    $required = if ($role -in @('Mold Leader','Mold QC')) { 'Repair QC Approval' } else { 'QC Final Approval' }
    if (-not @($progress | Where-Object { ($_.stage -eq $required -and $_.processStatus -eq 'In Progress') -or ($_.action -eq 'process-complete' -and $_.completedStage -eq $required) }).Count) { throw "Start $required before approving." }
    if (@($progress | Where-Object { $_.stage -notin @($required,'Awaiting Next Process') }).Count) { throw 'Finish the other machine assignments before approving.' }
    # A whole-order decision applies to every item. Evidence and waiver rules stay unchanged.
    if ($role -eq 'Mold Leader') {
      foreach ($item in $order.items) {
        $item.roomApproved = $true; $item.roomBy = $by; $item.roomAt = $now
        $item.qcApproved = $false; $item.qcAt = ''; $item.postQcApproved = $false; $item.postQcAt = ''
      }
      $problem = Get-RepairReviewError $order -Phase 'Data'
      $order.preQcLeaderApproved = $false; $order.preQcLeaderAt = ''; $order.qcLeaderApproved = $false; $order.qcLeaderAt = ''
    } elseif ($role -eq 'Mold QC') {
      $problem = Get-RepairReviewError $order -Phase 'Data'
      foreach ($item in $order.items) {
        $item.qcApproved = $true; $item.qcBy = $by; $item.qcAt = $now
        $item.postQcApproved = $false; $item.postQcAt = ''
      }
      $order.preQcLeaderApproved = $true; $order.preQcLeaderBy = $by; $order.preQcLeaderAt = $now
      $order.qcLeaderApproved = $false; $order.qcLeaderAt = ''
    } elseif ($role -eq 'Post-injection QC') {
      $problem = Get-RepairReviewError $order -Phase 'PreApproval'
      foreach ($item in $order.items) { $item.postQcApproved = $true; $item.postQcBy = $by; $item.postQcAt = $now }
      $order.qcLeaderApproved = $false; $order.qcLeaderAt = ''
      $order | Add-Member -NotePropertyName postQcComment -NotePropertyValue $reason -Force
    } else {
      $problem = Get-RepairReviewError $order -Phase 'PostQC'
      $order.qcLeaderApproved = $true; $order.qcLeaderBy = $by; $order.qcLeaderAt = $now
    }
    if ($problem) { throw $problem }
  } else {
    foreach ($item in $order.items) {
      foreach ($prefix in @('room','qc','postQc')) { $item.($prefix + 'Approved') = $false; $item.($prefix + 'At') = '' }
      foreach ($prefix in @('mold','moldQc')) {
        $item | Add-Member -NotePropertyName ($prefix + 'Checked') -NotePropertyValue $false -Force
        $item | Add-Member -NotePropertyName ($prefix + 'CheckedAt') -NotePropertyValue '' -Force
      }
    }
    $order.preQcLeaderApproved = $false; $order.preQcLeaderAt = ''; $order.qcLeaderApproved = $false; $order.qcLeaderAt = ''
  }
  $targets = if ($decision -eq 'Reject') { $progress } else { @($progress[0]) }
  $added = @()
  foreach ($target in $targets) {
    $entry = [pscustomobject]@{
      id = if (-not $added.Count) { [string]$Payload.eventId } else { [guid]::NewGuid().ToString() }
      identity = [string]$Payload.identity; kind = 'repair'; jobId = [string]$Payload.jobId
      action = if ($decision -eq 'Reject') { 'stage' } else { 'note' }
      assignmentId = if ($target.assignmentId) { $target.assignmentId } else { 'main' }
      stage = if ($decision -eq 'Reject') { 'Waiting' } else { $target.stage }
      equipment = if ($decision -eq 'Reject') { '' } else { $target.equipment }
      processStatus = if ($decision -eq 'Reject') { 'Waiting' } else { $target.processStatus }
      completedStage = ''; completedEquipment = ''; at = $now; savedAt = $now
      approvalDecision = @{ role = $role; by = $by; decision = $decision; reason = $reason; at = $now }
      notes = "$role - $decision by $by" + $(if ($reason) { ": $reason" } else { '' })
      workOrder = $order; workOrderNo = $order.requestNo
      moldNo = $Mold.moldNo; description = $Mold.description; customer = $Mold.customer; brand = $Mold.brand
    }
    $added += $entry
  }
  $Data.events = @($Data.events) + $added
  Write-ManagementData $Data
  return @{ ok = $true; event = $added[0]; events = @($Data.events) }
}
