param([int]$Port = 3212)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboardFile = Join-Path $root 'mold_dashboard.html'
$dataFile = Join-Path $root 'mold_shared_rows.json'
$prefix = "http://127.0.0.1:${Port}/"
$tempDataFile = Join-Path $root 'mold_shared_rows.tmp.json'
$drawingsDir = Join-Path $root 'drawings'

try {
  Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop
} catch {}

function ConvertTo-PlainObject {
  param([Parameter(Mandatory = $true)]$InputObject)

  if ($null -eq $InputObject) { return $null }

  if ($InputObject -is [System.Collections.IDictionary]) {
    $map = @{}
    foreach ($key in $InputObject.Keys) {
      $map[$key] = ConvertTo-PlainObject -InputObject $InputObject[$key]
    }
    return [pscustomobject]$map
  }

  if (($InputObject -is [System.Collections.IEnumerable]) -and -not ($InputObject -is [string])) {
    $items = @()
    foreach ($item in $InputObject) {
      $items += ,(ConvertTo-PlainObject -InputObject $item)
    }
    return ,$items
  }

  return $InputObject
}

function Invoke-WithRetry {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Action,
    [int]$MaxAttempts = 8,
    [int]$DelayMs = 150
  )

  $lastError = $null
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      return & $Action
    } catch {
      $lastError = $_
      if ($attempt -lt $MaxAttempts) {
        Start-Sleep -Milliseconds $DelayMs
      }
    }
  }
  throw $lastError
}

function Read-FileTextShared {
  param([Parameter(Mandatory = $true)][string]$Path)

  return Invoke-WithRetry -Action {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $true)
      try {
        $reader.ReadToEnd()
      } finally {
        $reader.Close()
      }
    } finally {
      $stream.Close()
    }
  }
}

function Write-FileTextAtomic {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  Invoke-WithRetry -Action {
    [System.IO.File]::WriteAllText($tempDataFile, $Content, [System.Text.Encoding]::UTF8)
    Move-Item -LiteralPath $tempDataFile -Destination $Path -Force
  } | Out-Null
}

function Write-JsonResponse {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][int]$StatusCode,
    [Parameter(Mandatory = $true)]$Object
  )

  $json = $Object | ConvertTo-Json -Depth 100 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = 'application/json; charset=utf-8'
  $Context.Response.ContentEncoding = [System.Text.Encoding]::UTF8
  $Context.Response.AddHeader('Access-Control-Allow-Origin', '*')
  $Context.Response.AddHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  $Context.Response.AddHeader('Access-Control-Allow-Headers', 'Content-Type')
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.Close()
}

function Write-TextResponse {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][int]$StatusCode,
    [Parameter(Mandatory = $true)][string]$Text,
    [string]$ContentType = 'text/plain; charset=utf-8'
  )

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = $ContentType
  $Context.Response.ContentEncoding = [System.Text.Encoding]::UTF8
  $Context.Response.AddHeader('Access-Control-Allow-Origin', '*')
  $Context.Response.AddHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  $Context.Response.AddHeader('Access-Control-Allow-Headers', 'Content-Type')
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.Close()
}

function Get-EmbeddedRows {
  if (-not (Test-Path -LiteralPath $dashboardFile)) { return @() }
  $html = Get-Content -LiteralPath $dashboardFile -Raw -Encoding UTF8
  $match = [regex]::Match($html, '<script id="mold-data" type="application/json">([\s\S]*?)</script>', 'IgnoreCase')
  if (-not $match.Success) { return @() }
  try {
    $rows = $match.Groups[1].Value | ConvertFrom-Json
    if ($rows -is [System.Array]) { return $rows }
  } catch {}
  return @()
}

function Ensure-DataFile {
  if (Test-Path -LiteralPath $dataFile) { return }
  $payload = @{
    rows = @(Get-EmbeddedRows)
    updatedAt = [DateTime]::UtcNow.ToString('o')
  }
  Write-FileTextAtomic -Path $dataFile -Content ($payload | ConvertTo-Json -Depth 100)
}

function Read-Payload {
  Ensure-DataFile
  try {
    $payload = Read-FileTextShared -Path $dataFile | ConvertFrom-Json
    if ($null -ne $payload.rows) { return $payload }
  } catch {}
  return @{
    rows = @()
    updatedAt = [DateTime]::UtcNow.ToString('o')
  }
}

function Parse-RequestPayload {
  param([string]$Body)

  if ([string]::IsNullOrWhiteSpace($Body)) {
    return @{ rows = @() }
  }

  $trimmed = $Body.TrimStart([char]0xFEFF, [char]0x200B, [char]0x00)

  try {
    return $trimmed | ConvertFrom-Json
  } catch {
    if ('System.Web.Script.Serialization.JavaScriptSerializer' -as [type]) {
      $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
      $serializer.MaxJsonLength = [int]::MaxValue
      $parsed = $serializer.Deserialize($trimmed, [object])
      return ConvertTo-PlainObject -InputObject $parsed
    }
    throw
  }
}

function Get-IdentityText {
  param($Value)

  if ($null -eq $Value) { return '' }
  return (([string]$Value).Replace([char]0x00A0, ' ').Trim().ToUpperInvariant())
}

function Get-IdentityMoldNo {
  param($Value)

  return ((Get-IdentityText -Value $Value) -replace '\s+', '')
}

function Get-RowIdentity {
  param($Row)

  if ($null -eq $Row) { return '' }

  return ([string]::Join('|', @(
    (Get-IdentityText -Value $Row.brand),
    (Get-IdentityMoldNo -Value $Row.moldNo)
  )))
}

function Clean-SlipLockText {
  param([string]$Value)

  if ($null -eq $Value) { return '' }
  return ([string]$Value).Replace('(', '').Replace(')', '').Trim()
}

function Normalize-Row {
  param($Row)

  if ($null -eq $Row) { return $Row }
  if ($Row.PSObject.Properties.Name -contains 'slipLock') {
    $Row.slipLock = Clean-SlipLockText -Value ([string]$Row.slipLock)
  }
  return $Row
}

function Get-RowCompletenessScore {
  param($Row)

  if ($null -eq $Row) { return 0 }
  $score = 0
  foreach ($name in $Row.PSObject.Properties.Name) {
    $value = [string]$Row.$name
    if ($value.Trim()) { $score += 1 }
  }
  if ([string]$Row.warningConfirmed) { $score += 1 }
  if ([string]$Row.sitePn) { $score += 2 }
  if ([string]$Row.sapMoldNo) { $score += 1 }
  return $score
}

function Merge-DedupedRows {
  param([object[]]$Rows)

  $best = @{}
  $order = New-Object System.Collections.Generic.List[string]
  foreach ($row in $Rows) {
    $row = Normalize-Row -Row $row
    $identityKey = Get-RowIdentity -Row $row
    if (-not $best.ContainsKey($identityKey)) {
      $best[$identityKey] = $row
      [void]$order.Add($identityKey)
      continue
    }
    $current = $best[$identityKey]
    if ((Get-RowCompletenessScore -Row $row) -ge (Get-RowCompletenessScore -Row $current)) {
      $best[$identityKey] = $row
    }
  }

  $merged = New-Object System.Collections.ArrayList
  foreach ($key in $order) {
    [void]$merged.Add($best[$key])
  }
  return @($merged)
}

function Backup-SharedDataFile {
  param([string]$Reason = 'save')
  if (-not (Test-Path -LiteralPath $dataFile)) { return $null }
  $stamp = [DateTime]::UtcNow.ToString('yyyyMMdd_HHmmss_fffffff')
  $safeReason = $Reason -replace '[^a-zA-Z0-9_-]', '_'
  $backupPath = Join-Path $root ("mold_shared_rows.backup_${safeReason}_${stamp}.json")
  Copy-Item -LiteralPath $dataFile -Destination $backupPath -Force
  return $backupPath
}

function Save-DrawingUpload {
  param($Payload)

  if ($null -eq $Payload) { throw 'Missing upload payload.' }
  $fileName = [string]$Payload.fileName
  $moldNo = [string]$Payload.moldNo
  $kind = [string]$Payload.kind
  $customer = [string]$Payload.customer
  $contentBase64 = [string]$Payload.contentBase64
  if ([string]::IsNullOrWhiteSpace($contentBase64)) { throw 'Missing PDF content.' }
  if ([string]::IsNullOrWhiteSpace($fileName) -or ([IO.Path]::GetExtension($fileName).ToLowerInvariant() -ne '.pdf')) { throw 'Only PDF files can be uploaded.' }

  if (-not (Test-Path -LiteralPath $drawingsDir -PathType Container)) {
    New-Item -ItemType Directory -Path $drawingsDir -Force | Out-Null
  }

  $safeBase = if ([string]::IsNullOrWhiteSpace($moldNo)) { [IO.Path]::GetFileNameWithoutExtension($fileName) } else { $moldNo }
  $familyMatch = [regex]::Match($safeBase.Trim(), '^[A-Za-z]+\d+')
  if ($familyMatch.Success) { $safeBase = $familyMatch.Value.ToUpperInvariant() }
  $safeBase = ($safeBase -replace '[\\/:*?"<>|]+', '_').Trim()
  if ([string]::IsNullOrWhiteSpace($safeBase)) { $safeBase = 'drawing' }
  if ($kind -match '^(?i)marketing$') {
    $safeCustomer = ($customer -replace '[\\/:*?"<>|]+', '_').Trim().ToUpperInvariant()
    if ([string]::IsNullOrWhiteSpace($safeCustomer)) { throw 'Missing Marketing drawing customer.' }
    $safeBase = $safeBase + '_' + $safeCustomer + '_marketing'
  }
  $targetName = $safeBase + '.pdf'
  $targetPath = Join-Path $drawingsDir $targetName

  $bytes = [Convert]::FromBase64String($contentBase64)
  if ($bytes.Length -lt 4 -or [System.Text.Encoding]::ASCII.GetString($bytes,0,4) -ne '%PDF') { throw 'The selected file does not look like a PDF.' }
  [IO.File]::WriteAllBytes($targetPath, $bytes)

  return @{ ok = $true; path = ('drawings/' + $targetName); fileName = $targetName; size = $bytes.Length }
}

function Test-RowCountDropIsUnsafe {
  param([int]$CurrentCount, [int]$IncomingCount)
  if ($CurrentCount -lt 50) { return $false }
  if ($IncomingCount -eq 0) { return $true }
  $minimumAllowed = [Math]::Floor($CurrentCount * 0.8)
  return ($IncomingCount -lt $minimumAllowed)
}
function Write-Payload {
  param([object[]]$Rows)
  $normalizedRows = @()
  foreach ($row in $Rows) {
    $normalizedRows += ,(Normalize-Row -Row $row)
  }
  $payload = @{
    rows = @($normalizedRows)
    updatedAt = [DateTime]::UtcNow.ToString('o')
  }
  Write-FileTextAtomic -Path $dataFile -Content ($payload | ConvertTo-Json -Depth 100)
  try { Remove-ExpiredMoldBackups -Kind Products } catch { Write-Warning ('Backup cleanup skipped: ' + $_.Exception.Message) }
  return $payload
}

function Get-StaticContentType {
  param([string]$Path)
  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.js'   { 'application/javascript; charset=utf-8' }
    '.css'  { 'text/css; charset=utf-8' }
    '.ico'  { 'image/x-icon' }
    '.pdf'  { 'application/pdf' }
    default { 'application/octet-stream' }
  }
}

function Write-StaticFile {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][string]$RequestPath
  )

  $relative = if ([string]::IsNullOrWhiteSpace($RequestPath) -or $RequestPath -eq '/') { 'mold_dashboard.html' } else { $RequestPath.TrimStart('/') }
  $relative = [System.Uri]::UnescapeDataString($relative)
  $fullPath = Join-Path $root $relative
  $resolvedRoot = [IO.Path]::GetFullPath($root)
  $resolvedPath = [IO.Path]::GetFullPath($fullPath)

  if (-not $resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-TextResponse -Context $Context -StatusCode 403 -Text 'Forbidden'
    return
  }
  if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
    Write-TextResponse -Context $Context -StatusCode 404 -Text 'Not found'
    return
  }

  $bytes = [IO.File]::ReadAllBytes($resolvedPath)
  $Context.Response.StatusCode = 200
  $Context.Response.ContentType = Get-StaticContentType -Path $resolvedPath
  $Context.Response.AddHeader('Access-Control-Allow-Origin', '*')
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.Close()
}

. (Join-Path $root 'mold_management.ps1')

try {
  $listener = [System.Net.HttpListener]::new()
  $listener.Prefixes.Add($prefix)
  $listener.Start()
  Write-Host "Mold shared server running at ${prefix}mold_dashboard.html"
  Write-Host "Shared data file: $dataFile"

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $path = $request.Url.AbsolutePath

    if ($request.HttpMethod -eq 'OPTIONS') {
      $context.Response.StatusCode = 204
      $context.Response.AddHeader('Access-Control-Allow-Origin', '*')
      $context.Response.AddHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      $context.Response.AddHeader('Access-Control-Allow-Headers', 'Content-Type')
      $context.Response.Close()
      continue
    }

    if (Invoke-ManagementRequest -Context $context) { continue }

    if ($request.HttpMethod -eq 'GET' -and $path -eq '/api/health') {
      Write-JsonResponse -Context $context -StatusCode 200 -Object @{ ok = $true; dataFile = $dataFile }
      continue
    }

    if ($request.HttpMethod -eq 'GET' -and $path -eq '/api/rows') {
      Write-JsonResponse -Context $context -StatusCode 200 -Object (Read-Payload)
      continue
    }

    if ($request.HttpMethod -eq 'POST' -and $path -eq '/api/rows') {
      try {
        $encoding = if ($request.ContentEncoding) { $request.ContentEncoding } else { [System.Text.Encoding]::UTF8 }
        $reader = New-Object System.IO.StreamReader($request.InputStream, $encoding, $true)
        $body = $reader.ReadToEnd()
        $reader.Close()
        $parsed = Parse-RequestPayload -Body $body
        $currentPayload = Read-Payload
        $incomingRows = @($parsed.rows)
        $currentCount = @($currentPayload.rows).Count
        $incomingCount = $incomingRows.Count
        if (Test-RowCountDropIsUnsafe -CurrentCount $currentCount -IncomingCount $incomingCount) {
          $backupPath = Backup-SharedDataFile -Reason 'rejected_rows_drop'
          Write-JsonResponse -Context $context -StatusCode 409 -Object @{
            ok = $false
            error = ('Refusing to overwrite shared data: incoming row count {0} is too low compared with current {1}.' -f $incomingCount, $currentCount)
            currentCount = $currentCount
            incomingCount = $incomingCount
            backup = $backupPath
          }
          continue
        }
        $backupPath = Backup-SharedDataFile -Reason 'rows_save'
        $payload = Write-Payload -Rows $incomingRows
        Write-JsonResponse -Context $context -StatusCode 200 -Object @{ ok = $true; count = @($payload.rows).Count; updatedAt = $payload.updatedAt; backup = $backupPath }
      } catch {
        Write-JsonResponse -Context $context -StatusCode 400 -Object @{ ok = $false; error = ('Invalid JSON payload: ' + $_.Exception.Message) }
      }
      continue
    }

    if ($request.HttpMethod -eq 'POST' -and $path -eq '/api/drawing-upload') {
      try {
        $encoding = if ($request.ContentEncoding) { $request.ContentEncoding } else { [System.Text.Encoding]::UTF8 }
        $reader = New-Object System.IO.StreamReader($request.InputStream, $encoding, $true)
        $body = $reader.ReadToEnd()
        $reader.Close()
        $parsed = Parse-RequestPayload -Body $body
        Write-JsonResponse -Context $context -StatusCode 200 -Object (Save-DrawingUpload -Payload $parsed)
      } catch {
        Write-JsonResponse -Context $context -StatusCode 400 -Object @{ ok = $false; error = ('Drawing upload failed: ' + $_.Exception.Message) }
      }
      continue
    }

    if ($request.HttpMethod -eq 'POST' -and $path -eq '/api/row-save') {
      try {
        $encoding = if ($request.ContentEncoding) { $request.ContentEncoding } else { [System.Text.Encoding]::UTF8 }
        $reader = New-Object System.IO.StreamReader($request.InputStream, $encoding, $true)
        $body = $reader.ReadToEnd()
        $reader.Close()
        $parsed = Parse-RequestPayload -Body $body
        $currentPayload = Read-Payload
        $currentRows = @($currentPayload.rows)
        $incomingRow = $parsed.row
        $mode = [string]$parsed.mode
        $originalIdentity = [string]$parsed.originalIdentity
        $rowUpdatedAt = [DateTime]::UtcNow.ToString('o')
        if ($incomingRow.PSObject.Properties.Name -contains '_updatedAt') {
          $incomingRow._updatedAt = $rowUpdatedAt
        } else {
          $incomingRow | Add-Member -NotePropertyName '_updatedAt' -NotePropertyValue $rowUpdatedAt
        }
        if (-not ($incomingRow.PSObject.Properties.Name -contains '_updateSummary') -or -not [string]$incomingRow._updateSummary) {
          $fallbackSummary = if ($mode -eq 'edit') { 'Product updated' } else { 'New product added' }
          $incomingRow | Add-Member -NotePropertyName '_updateSummary' -NotePropertyValue $fallbackSummary -Force
        }
        if ($mode -eq 'edit' -and $originalIdentity) {
          $nextRows = New-Object System.Collections.ArrayList
          $existingRow = $null
          foreach ($row in $currentRows) {
            if ((Get-RowIdentity -Row $row) -eq $originalIdentity) {
              $existingRow = $row
              continue
            }
            [void]$nextRows.Add($row)
          }
          $subMoldsTouched = $false
          if ($incomingRow.PSObject.Properties.Name -contains '_subMoldsTouched') {
            $subMoldsTouched = [string]$incomingRow._subMoldsTouched -eq 'Y'
          }
          if (-not $subMoldsTouched -and $existingRow -and ($existingRow.PSObject.Properties.Name -contains 'subMolds')) {
            $existingSubMolds = @($existingRow.subMolds)
            if ($existingSubMolds.Count -gt 0) {
              if ($incomingRow.PSObject.Properties.Name -contains 'subMolds') {
                $incomingRow.subMolds = $existingRow.subMolds
              } else {
                $incomingRow | Add-Member -NotePropertyName 'subMolds' -NotePropertyValue $existingRow.subMolds
              }
            }
          }
          if ($incomingRow.PSObject.Properties.Name -contains '_subMoldsTouched') {
            $incomingRow.PSObject.Properties.Remove('_subMoldsTouched')
          }
          $currentRows = @($incomingRow) + @($nextRows)
        } else {
          if ($incomingRow.PSObject.Properties.Name -contains '_subMoldsTouched') {
            $incomingRow.PSObject.Properties.Remove('_subMoldsTouched')
          }
          $currentRows = @($incomingRow) + $currentRows
        }

        $currentRows = Merge-DedupedRows -Rows $currentRows

        $backupPath = Backup-SharedDataFile -Reason 'row_save'
        $payload = Write-Payload -Rows $currentRows
        Write-JsonResponse -Context $context -StatusCode 200 -Object @{
          ok = $true
          count = @($payload.rows).Count
          updatedAt = $payload.updatedAt
          backup = $backupPath
        }
      } catch {
        Write-JsonResponse -Context $context -StatusCode 400 -Object @{ ok = $false; error = ('Row save failed: ' + $_.Exception.Message) }
      }
      continue
    }

    if ($request.HttpMethod -eq 'POST' -and $path -eq '/api/row-delete') {
      try {
        $encoding = if ($request.ContentEncoding) { $request.ContentEncoding } else { [System.Text.Encoding]::UTF8 }
        $reader = New-Object System.IO.StreamReader($request.InputStream, $encoding, $true)
        $body = $reader.ReadToEnd()
        $reader.Close()
        $parsed = Parse-RequestPayload -Body $body
        $currentPayload = Read-Payload
        $currentRows = @($currentPayload.rows)
        $originalIdentity = [string]$parsed.originalIdentity
        $nextRows = @()
        $removed = $false

        foreach ($row in $currentRows) {
          if (-not $removed -and $originalIdentity -and ((Get-RowIdentity -Row $row) -eq $originalIdentity)) {
            $removed = $true
            continue
          }
          $nextRows += ,$row
        }

        if (-not $removed) {
          Write-JsonResponse -Context $context -StatusCode 404 -Object @{ ok = $false; error = 'Delete target not found.' }
          continue
        }

        $payload = Write-Payload -Rows $nextRows
        Write-JsonResponse -Context $context -StatusCode 200 -Object @{
          ok = $true
          count = @($payload.rows).Count
          updatedAt = $payload.updatedAt
        }
      } catch {
        Write-JsonResponse -Context $context -StatusCode 400 -Object @{ ok = $false; error = ('Row delete failed: ' + $_.Exception.Message) }
      }
      continue
    }

    if ($request.HttpMethod -eq 'GET') {
      Write-StaticFile -Context $context -RequestPath $path
      continue
    }

    Write-TextResponse -Context $context -StatusCode 405 -Text 'Method not allowed'
  }
} finally {
  if ($listener) {
    $listener.Stop()
    $listener.Close()
  }
}

