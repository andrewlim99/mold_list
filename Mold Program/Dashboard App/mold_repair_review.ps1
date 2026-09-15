$repairPhotosDir = Join-Path $root 'repair_photos'

function Get-RepairReviewError {
  param($Order, [switch]$Final, [string]$Phase = 'RepairQC')
  if (-not $Order -or -not @($Order.items).Count) { return 'Save the structured Work Order and item results before moving to the next process.' }
  $index = 0
  foreach ($item in $Order.items) {
    $index++
    $prefix = "Item ${index}: "
    if ($item.waived -eq $true) {
      if (-not ([string]$item.waiveReason).Trim() -or -not ([string]$item.waivedBy).Trim()) { return ($prefix + 'enter a Waive reason and operator.') }
      continue
    }
    if ($item.repairType -notin @('Visual','Dimensional')) { return ($prefix + 'choose Visual or Dimensional.') }
    if (-not ([string]$item.doneBy).Trim()) { return ($prefix + 'enter the mold team technician.') }
    if ($item.repairType -eq 'Visual' -and (-not $item.beforePhoto -or -not $item.afterPhoto)) { return ($prefix + 'upload Before and After photos.') }
    if ($item.repairType -eq 'Dimensional' -and (-not ([string]$item.beforeValue).Trim() -or -not ([string]$item.afterValue).Trim())) { return ($prefix + 'enter Before and After measurements.') }
    if ($item.repairType -eq 'Dimensional' -and ($item.beforeValue -notmatch '[0-9]' -or $item.afterValue -notmatch '[0-9]')) { return ($prefix + 'measurements must contain numeric values.') }
    if ($item.roomApproved -ne $true -or -not ([string]$item.roomBy).Trim()) { return ($prefix + 'Mold Room Leader confirmation is required.') }
    if ($Phase -ne 'Data' -and ($item.qcApproved -ne $true -or -not ([string]$item.qcBy).Trim())) { return ($prefix + 'Repair QC item confirmation is required.') }
    if (($Phase -eq 'PostQC' -or $Final) -and ($item.postQcApproved -ne $true -or -not ([string]$item.postQcBy).Trim())) { return ($prefix + 'Post-injection QC item confirmation is required.') }
  }
  if (($Phase -in @('PreApproval','PostQC') -or $Final) -and ($Order.preQcLeaderApproved -ne $true -or -not ([string]$Order.preQcLeaderBy).Trim())) { return 'Repair QC Leader approval is required before injection.' }
  if ($Final -and ($Order.qcLeaderApproved -ne $true -or -not ([string]$Order.qcLeaderBy).Trim())) { return 'Post-injection QC Leader approval of the entire request is required.' }
  return ''
}

function ConvertTo-RepairReviewItem {
  param($InputItem, $PreviousItem, [string]$Identity, [DateTimeOffset]$Now)
  $id = ([string]$InputItem.id).Trim()
  if (-not $id) { $id = if ($PreviousItem.id) { [string]$PreviousItem.id } else { [guid]::NewGuid().ToString() } }
  $guid = [guid]::Empty
  if (-not [guid]::TryParse($id, [ref]$guid)) { throw 'Invalid repair item ID.' }
  $clean = [ordered]@{ id = $id }
  foreach ($key in @('modification','doneBy','repairType','beforeValue','afterValue','beforePhoto','afterPhoto','roomBy','qcBy','postQcBy','waiveReason','waivedBy')) {
    $clean[$key] = ([string]$InputItem.$key).Trim()
    $limit = if ($key -eq 'modification') { 10000 } elseif ($key -eq 'waiveReason') { 1000 } else { 200 }
    if ($clean[$key].Length -gt $limit) { throw "Item field $key exceeds $limit characters." }
  }
  if ($clean.repairType -notin @('Visual','Dimensional')) { throw 'Choose Visual or Dimensional for each repair item. Refresh the page if the Type field is missing.' }
  foreach ($key in @('beforePhoto','afterPhoto')) {
    $listKey = $key + 's'
    $ids = if ($null -ne $InputItem.$listKey) { @($InputItem.$listKey) } elseif ($clean[$key]) { @($clean[$key]) } else { @() }
    $ids = @($ids | Select-Object -Unique)
    if ($ids.Count -gt 20) { throw 'Up to 20 photos are allowed for each Before / After section.' }
    $clean[$listKey] = @($ids)
    $clean[$key] = if ($ids.Count) { [string]$ids[0] } else { '' }
    foreach ($photo in $ids) {
    if (-not $photo) { throw 'Invalid repair photo ID.' }
    if ($photo -notmatch '^[a-f0-9]{32}$') { throw 'Invalid repair photo ID.' }
    $metaFile = Join-Path $repairPhotosDir ($photo + '.json')
    if (-not [IO.File]::Exists($metaFile)) { throw 'Repair photo not found. Upload the photo again.' }
    $meta = (Read-FileTextShared $metaFile) | ConvertFrom-Json
    if ($meta.identity -ne $Identity -or $meta.itemId -ne $id) { throw 'The photo belongs to a different mold or repair item.' }
    if (-not [IO.File]::Exists((Join-Path $repairPhotosDir ($photo + $meta.extension)))) { throw 'Repair photo file is missing.' }
    }
  }
  $changed = -not $PreviousItem
  foreach ($key in @('beforePhoto','afterPhoto')) {
    $listKey = $key + 's'
    $oldIds = if ($null -ne $PreviousItem.$listKey) { @($PreviousItem.$listKey) } elseif ($PreviousItem.$key) { @($PreviousItem.$key) } else { @() }
    if (($clean[$listKey] -join ',') -cne ($oldIds -join ',')) { $changed = $true }
  }
  foreach ($key in @('modification','doneBy','repairType','beforeValue','afterValue','beforePhoto','afterPhoto')) {
    if ([string]$clean[$key] -cne [string]$PreviousItem.$key) { $changed = $true }
  }
  $clean.waived = $InputItem.waived -eq $true
  $checkChanged = $false
  $roomCheckChanged = $false
  foreach ($prefix in @('mold','moldQc')) {
    $legacy = if ($prefix -eq 'mold') { 'room' } else { 'qc' }
    $flag = $prefix + 'Checked'; $by = $flag + 'By'; $at = $flag + 'At'
    $oldFlag = if ($null -ne $PreviousItem.$flag) { $PreviousItem.$flag -eq $true } else { $PreviousItem.($legacy + 'Approved') -eq $true }
    $oldBy = if ($null -ne $PreviousItem.$by) { [string]$PreviousItem.$by } else { [string]$PreviousItem.($legacy + 'By') }
    $oldAt = if ($null -ne $PreviousItem.$at) { [string]$PreviousItem.$at } else { [string]$PreviousItem.($legacy + 'At') }
    $clean[$flag] = if ($null -ne $InputItem.$flag) { $InputItem.$flag -eq $true -and -not $changed } else { $oldFlag -and -not $changed }
    $clean[$by] = if ($null -ne $InputItem.$by) { ([string]$InputItem.$by).Trim() } else { $oldBy }
    if ($clean[$by].Length -gt 100 -or ($clean[$flag] -and -not $clean[$by])) { throw 'Enter the item checker name (maximum 100 characters).' }
    if ($prefix -eq 'moldQc' -and $clean[$flag] -and -not $clean.moldChecked) { throw 'Complete the Mold Leader item check first.' }
    if ($clean[$flag] -ne $oldFlag -or $clean[$by] -cne $oldBy) { $checkChanged = $true }
    if ($prefix -eq 'mold' -and $checkChanged) { $roomCheckChanged = $true }
    $clean[$at] = if ($clean[$flag]) { if ($oldFlag -and $clean[$by] -ceq $oldBy -and $oldAt) { $oldAt } else { $Now.ToString('o') } } else { '' }
  }
  if ($clean.waived -and (-not $clean.waiveReason -or -not $clean.waivedBy)) { throw 'Waive requires a reason and operator name.' }
  $clean.waivedAt = if ($clean.waived) {
    if ($PreviousItem.waived -eq $true -and $clean.waiveReason -ceq $PreviousItem.waiveReason -and $clean.waivedBy -ceq $PreviousItem.waivedBy -and -not $changed) { $PreviousItem.waivedAt } else { $Now.ToString('o') }
  } else { '' }
  $reviewChanged = $changed -or $checkChanged -or $clean.waived -ne ($PreviousItem.waived -eq $true) -or $clean.waiveReason -cne [string]$PreviousItem.waiveReason -or $clean.waivedBy -cne [string]$PreviousItem.waivedBy
  $clean.roomApproved = $InputItem.roomApproved -eq $true -and -not $changed -and -not $roomCheckChanged -and $clean.waived -eq ($PreviousItem.waived -eq $true) -and $clean.waiveReason -ceq [string]$PreviousItem.waiveReason -and $clean.waivedBy -ceq [string]$PreviousItem.waivedBy
  $clean.qcApproved = $InputItem.qcApproved -eq $true -and -not $reviewChanged
  $clean.postQcApproved = $InputItem.postQcApproved -eq $true -and -not $reviewChanged
  if (($clean.roomApproved -or $clean.moldChecked) -and -not $clean.waived) {
    if ($clean.roomApproved -and -not $clean.roomBy) { throw 'Enter the Mold Room Leader name.' }
    if (-not $clean.doneBy -or ($clean.repairType -eq 'Visual' -and (-not $clean.beforePhoto -or -not $clean.afterPhoto)) -or ($clean.repairType -eq 'Dimensional' -and (-not $clean.beforeValue -or -not $clean.afterValue))) { throw 'Save complete Before/After results before Mold Room Leader confirmation.' }
    if ($clean.repairType -eq 'Dimensional' -and ($clean.beforeValue -notmatch '[0-9]' -or $clean.afterValue -notmatch '[0-9]')) { throw 'Before/After measurements must contain numeric values.' }
  }
  if ($clean.roomApproved -ne ($PreviousItem.roomApproved -eq $true) -or $clean.roomBy -cne [string]$PreviousItem.roomBy) { $clean.qcApproved = $false }
  if ($clean.qcApproved -and (-not $clean.roomApproved -or -not $clean.qcBy)) { throw 'Mold Room Leader confirmation and QC name are required before QC confirmation.' }
  if ($clean.qcApproved -ne ($PreviousItem.qcApproved -eq $true) -or $clean.qcBy -cne [string]$PreviousItem.qcBy) { $clean.postQcApproved = $false }
  if ($clean.postQcApproved -and (-not $clean.qcApproved -or -not $clean.postQcBy)) { throw 'Repair QC confirmation and post-injection QC inspector name are required.' }
  foreach ($role in @('room','qc','postQc')) {
    $flag = $role + 'Approved'; $by = $role + 'By'; $at = $role + 'At'
    $clean[$at] = if ($clean[$flag]) {
      if ($PreviousItem.$flag -eq $true -and [string]$PreviousItem.$by -ceq $clean[$by] -and $PreviousItem.$at) { $PreviousItem.$at } else { $Now.ToString('o') }
    } else { '' }
  }
  return [pscustomobject]$clean
}

function Save-RepairPhoto {
  param($Payload)
  $identity = [string]$Payload.identity
  $null = Assert-ManagementMold $identity
  $guid = [guid]::Empty
  if (-not [guid]::TryParse([string]$Payload.itemId, [ref]$guid)) { throw 'Invalid repair item.' }
  if (-not ([string]$Payload.uploadedBy).Trim() -or ([string]$Payload.uploadedBy).Length -gt 100) { throw 'Enter the mold team technician before uploading photos.' }
  if (([string]$Payload.contentBase64).Length -gt 7MB) { throw 'Photo exceeds 5 MB.' }
  $bytes = [Convert]::FromBase64String([string]$Payload.contentBase64)
  if ($bytes.Length -lt 8 -or $bytes.Length -gt 5MB) { throw 'Choose a JPEG or PNG photo up to 5 MB.' }
  $png = [BitConverter]::ToString($bytes,0,8) -eq '89-50-4E-47-0D-0A-1A-0A'
  $jpeg = $bytes[0] -eq 255 -and $bytes[1] -eq 216 -and $bytes[2] -eq 255
  if (-not $png -and -not $jpeg) { throw 'Only JPEG and PNG photos are accepted.' }
  $id = [guid]::NewGuid().ToString('N')
  $ext = if ($png) { '.png' } else { '.jpg' }
  $meta = @{ id = $id; identity = $identity; itemId = [string]$Payload.itemId; extension = $ext; uploadedBy = ([string]$Payload.uploadedBy).Trim(); uploadedAt = [DateTimeOffset]::UtcNow.ToString('o') }
  [IO.Directory]::CreateDirectory($repairPhotosDir) | Out-Null
  [IO.File]::WriteAllBytes((Join-Path $repairPhotosDir ($id + $ext)), $bytes)
  [IO.File]::WriteAllText((Join-Path $repairPhotosDir ($id + '.json')), ($meta | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
  return @{ ok = $true; photoId = $id }
}
