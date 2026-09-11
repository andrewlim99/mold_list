param(
  [string]$WorkbookPath = '',
  [string]$DashboardFolder = ''
)

$ErrorActionPreference = 'Stop'

$rootFolder = Split-Path -Parent $PSScriptRoot
if (-not $WorkbookPath) {
  $WorkbookPath = Join-Path $rootFolder 'MOLD LIST 2026.04.30.xlsx'
}
if (-not $DashboardFolder) {
  $DashboardFolder = Join-Path $rootFolder 'Dashboard App'
}

function T($v) {
  if ($null -eq $v) { return '' }
  return ([string]$v).Trim()
}

function TN($v) {
  return (T $v).ToUpperInvariant()
}

function NormalizeHeader($v) {
  return ((T $v) -replace '\s+', ' ').Trim()
}

function Find-HeaderIndex($headers, [string[]]$patterns) {
  for ($i = 0; $i -lt $headers.Count; $i++) {
    $header = NormalizeHeader $headers[$i]
    foreach ($pattern in $patterns) {
      if ($header -match $pattern) { return $i }
    }
  }
  return -1
}

function Convert-ExcelDate($v) {
  $raw = T $v
  if (-not $raw) { return '' }
  $num = 0.0
  if ([double]::TryParse($raw, [ref]$num)) {
    try {
      return [DateTime]::FromOADate($num).ToString('yyyy-MM-dd')
    } catch {
      return $raw
    }
  }
  $dt = [DateTime]::MinValue
  if ([DateTime]::TryParse($raw, [ref]$dt)) {
    return $dt.ToString('yyyy-MM-dd')
  }
  return $raw
}

function Get-ColumnIndexFromRef([string]$ref) {
  if (-not $ref) { return -1 }
  $letters = ([regex]::Match($ref, '^[A-Z]+')).Value
  $sum = 0
  foreach ($ch in $letters.ToCharArray()) {
    $sum = ($sum * 26) + ([int][char]$ch - [int][char]'A' + 1)
  }
  return $sum - 1
}

function Get-SharedStrings($zip) {
  $entry = $zip.GetEntry('xl/sharedStrings.xml')
  if (-not $entry) { return @() }
  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.CheckCharacters = $false
  $stream = $entry.Open()
  try {
    $reader = [System.Xml.XmlReader]::Create($stream, $settings)
    try {
      $doc = New-Object System.Xml.XmlDocument
      $doc.Load($reader)
    } finally {
      $reader.Close()
    }
  } finally {
    $stream.Close()
  }
  $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $ns.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $items = @()
  foreach ($si in $doc.SelectNodes('//x:si', $ns)) {
    $texts = @()
    foreach ($t in $si.SelectNodes('.//x:t', $ns)) {
      $texts += $t.InnerText
    }
    $items += ($texts -join '')
  }
  return $items
}

function Get-SheetMap($zip) {
  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.CheckCharacters = $false

  $wbEntry = $zip.GetEntry('xl/workbook.xml')
  $relsEntry = $zip.GetEntry('xl/_rels/workbook.xml.rels')
  if (-not $wbEntry -or -not $relsEntry) {
    throw "Workbook structure is missing workbook.xml or workbook rels."
  }

  $wbStream = $wbEntry.Open()
  try {
    $wbReader = [System.Xml.XmlReader]::Create($wbStream, $settings)
    try {
      $wbDoc = New-Object System.Xml.XmlDocument
      $wbDoc.Load($wbReader)
    } finally {
      $wbReader.Close()
    }
  } finally {
    $wbStream.Close()
  }

  $relsStream = $relsEntry.Open()
  try {
    $relsReader = [System.Xml.XmlReader]::Create($relsStream, $settings)
    try {
      $relsDoc = New-Object System.Xml.XmlDocument
      $relsDoc.Load($relsReader)
    } finally {
      $relsReader.Close()
    }
  } finally {
    $relsStream.Close()
  }

  $wbNs = New-Object System.Xml.XmlNamespaceManager($wbDoc.NameTable)
  $wbNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $wbNs.AddNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')

  $relMap = @{}
  foreach ($rel in $relsDoc.SelectNodes('//*[local-name()="Relationship"]')) {
    $relMap[$rel.Id] = 'xl/' + $rel.Target.TrimStart('/')
  }

  $sheetMap = @{}
  foreach ($sheet in $wbDoc.SelectNodes('//x:sheets/x:sheet', $wbNs)) {
    $name = (T $sheet.GetAttribute('name'))
    $rid = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    if ($name -and $relMap.ContainsKey($rid)) {
      $sheetMap[$name] = $relMap[$rid]
    }
  }
  return $sheetMap
}

function Get-SheetRows($zip, [string]$sheetPath, $sharedStrings) {
  $entry = $zip.GetEntry($sheetPath)
  if (-not $entry) { throw "Sheet entry not found: $sheetPath" }

  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.CheckCharacters = $false
  $stream = $entry.Open()
  try {
    $reader = [System.Xml.XmlReader]::Create($stream, $settings)
    try {
      $doc = New-Object System.Xml.XmlDocument
      $doc.Load($reader)
    } finally {
      $reader.Close()
    }
  } finally {
    $stream.Close()
  }

  $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $ns.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')

  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($rowNode in $doc.SelectNodes('//x:sheetData/x:row', $ns)) {
    $rowMap = @{}
    foreach ($cell in $rowNode.SelectNodes('x:c', $ns)) {
      $cellRef = $cell.GetAttribute('r')
      $colIndex = Get-ColumnIndexFromRef $cellRef
      if ($colIndex -lt 0) { continue }
      $cellType = $cell.GetAttribute('t')
      $valueNode = $cell.SelectSingleNode('x:v', $ns)
      $textNodes = $cell.SelectNodes('.//x:t', $ns)
      $value = ''
      if ($cellType -eq 's' -and $valueNode) {
        $ssIndex = 0
        if ([int]::TryParse($valueNode.InnerText, [ref]$ssIndex) -and $ssIndex -ge 0 -and $ssIndex -lt $sharedStrings.Count) {
          $value = $sharedStrings[$ssIndex]
        }
      } elseif ($cellType -eq 'inlineStr' -or $textNodes.Count -gt 0) {
        $parts = @()
        foreach ($t in $textNodes) { $parts += $t.InnerText }
        $value = $parts -join ''
      } elseif ($valueNode) {
        $value = $valueNode.InnerText
      }
      $rowMap[$colIndex] = $value
    }
    $rows.Add($rowMap)
  }
  return $rows
}

function Get-Table($zip, [string]$sheetPath, $sharedStrings) {
  $rawRows = Get-SheetRows -zip $zip -sheetPath $sheetPath -sharedStrings $sharedStrings
  if ($rawRows.Count -eq 0) {
    return [pscustomobject]@{ Headers = @(); Rows = @() }
  }

  $headerMap = $rawRows[0]
  $headerIndexes = @($headerMap.Keys | Sort-Object)
  $headers = @()
  foreach ($idx in $headerIndexes) {
    $headers += T $headerMap[$idx]
  }

  $rows = New-Object System.Collections.Generic.List[object]
  for ($r = 1; $r -lt $rawRows.Count; $r++) {
    $source = $rawRows[$r]
    $obj = [ordered]@{}
    for ($i = 0; $i -lt $headerIndexes.Count; $i++) {
      $colIdx = $headerIndexes[$i]
      $obj[$headers[$i]] = if ($source.ContainsKey($colIdx)) { T $source[$colIdx] } else { '' }
    }
    $rows.Add([pscustomobject]$obj)
  }

  return [pscustomobject]@{ Headers = $headers; Rows = [object[]]$rows.ToArray() }
}

function First-NonEmpty([string[]]$values) {
  foreach ($value in $values) {
    if (T $value) { return T $value }
  }
  return ''
}

function Normalize-Flag($value) {
  $v = TN $value
  if (-not $v) { return '' }
  if ($v -eq 'O' -or $v -eq '0') { return 'O' }
  if ($v -match '^(YES|Y|TRUE|T)$') { return 'O' }
  return ''
}

function Build-StatusFlags($row) {
  $parts = @()
  if (T $row.tfByTw) { $parts += 'TF BY TW: O' }
  if (T $row.transferMold) { $parts += 'Transfer Mold: O' }
  if (T $row.eol) { $parts += 'EOL: O' }
  if (T $row.shippedOut) { $parts += 'Shipped out Mold: O' }
  if (T $row.fabricationInProgress) { $parts += 'Fabrication In Progress: O' }
  if (T $row.stopFabrication) { $parts += 'Stop Fabrication: O' }
  if (T $row.inProduction) { $parts += 'In Production: O' }
  if ($parts.Count -eq 0 -and (T $row.statusNote)) { $parts += 'Manual review needed' }
  return ($parts -join ' | ')
}

function Build-KeyStatus($row) {
  if (T $row.eol) { return 'EOL' }
  if (T $row.shippedOut) { return 'Shipped Out' }
  if (T $row.stopFabrication) { return 'Stop Fabrication' }
  if (T $row.fabricationInProgress) { return 'Fabrication In Progress' }
  if (T $row.inProduction) { return 'In Production' }
  if (T $row.transferMold) { return 'Transfer Mold' }
  if (T $row.tfByTw) { return 'TF by TW' }
  if (T $row.statusNote) { return 'Check Status Note' }
  return 'Unclassified'
}

function Get-RowIdentity($row) {
  return [string]::Join('|', @(
    (T $row.brand),
    (T $row.moldNo),
    (T $row.registrationDate),
    (T $row.description),
    (T $row.customer)
  ))
}

function Get-RowCompletenessScore($row) {
  $score = 0
  foreach ($name in $row.PSObject.Properties.Name) {
    if (T $row.$name) { $score += 1 }
  }
  if (T $row.sitePn) { $score += 2 }
  if (T $row.sapMoldNo) { $score += 1 }
  return $score
}

function Merge-DedupedRows($rows) {
  $best = @{}
  $order = New-Object System.Collections.Generic.List[string]
  foreach ($row in $rows) {
    $identity = Get-RowIdentity $row
    if (-not $best.ContainsKey($identity)) {
      $best[$identity] = $row
      [void]$order.Add($identity)
      continue
    }
    if ((Get-RowCompletenessScore $row) -ge (Get-RowCompletenessScore $best[$identity])) {
      $best[$identity] = $row
    }
  }
  $merged = New-Object System.Collections.Generic.List[object]
  foreach ($identity in $order) {
    $merged.Add($best[$identity])
  }
  return [object[]]$merged.ToArray()
}

function Get-RowValue($row, $headers, [string[]]$patterns) {
  $index = Find-HeaderIndex $headers $patterns
  if ($index -lt 0) { return '' }
  $key = $headers[$index]
  return T $row.$key
}

function Build-InfoLookup($table, [string]$brand) {
  $headers = $table.Headers
  $byMold = @{}
  $byItem = @{}
  $byDesc = @{}
  $dwgMap = @{}

  foreach ($row in $table.Rows) {
    $moldNo = Get-RowValue $row $headers @('^Mold No$')
    $itemNo = Get-RowValue $row $headers @('^Item No$')
    $desc = Get-RowValue $row $headers @('^Description$')
    $dwgNo = Get-RowValue $row $headers @('^Dwg No$')

    $entry = [ordered]@{
      pkgType = Get-RowValue $row $headers @('^PKG Type$')
      pkgThickness = Get-RowValue $row $headers @('^PKG Thick$')
      matrix = Get-RowValue $row $headers @('^Matrix$')
      cellCount = Get-RowValue $row $headers @('Cell Cnt')
      designType = Get-RowValue $row $headers @('Design Type')
      zGap = Get-RowValue $row $headers @('Z-gap')
      slipLock = Get-RowValue $row $headers @('^Slip Lock$')
      hl = Get-RowValue $row $headers @('^H/L$')
      dwgNo = $dwgNo
    }

    if ($moldNo -and -not $byMold.ContainsKey((TN $moldNo))) { $byMold[(TN $moldNo)] = $entry }
    if ($itemNo -and -not $byItem.ContainsKey((TN $itemNo))) { $byItem[(TN $itemNo)] = $entry }
    if ($desc -and -not $byDesc.ContainsKey((TN $desc))) { $byDesc[(TN $desc)] = $entry }
    if ($moldNo -and $dwgNo) { $dwgMap["$brand|$moldNo"] = $dwgNo }
  }

  return [pscustomobject]@{
    ByMold = $byMold
    ByItem = $byItem
    ByDesc = $byDesc
    DwgMap = $dwgMap
  }
}

function Match-Info($info, [string]$moldNo, [string]$sitePn, [string]$description) {
  $moldKey = TN $moldNo
  $itemKey = TN $sitePn
  $descKey = TN $description
  if ($moldKey -and $info.ByMold.ContainsKey($moldKey)) { return $info.ByMold[$moldKey] }
  if ($itemKey -and $info.ByItem.ContainsKey($itemKey)) { return $info.ByItem[$itemKey] }
  if ($descKey -and $info.ByDesc.ContainsKey($descKey)) { return $info.ByDesc[$descKey] }
  return $null
}

function New-BaseRow {
  return [ordered]@{
    brand = ''
    moldNo = ''
    warningConfirmed = ''
    sapMoldNo = ''
    origin = ''
    description = ''
    rev = ''
    sitePn = ''
    registrationDate = ''
    customer = ''
    trayWeight = ''
    materialDwg = ''
    materialProduction = ''
    excelAA = ''
    excelAE = ''
    matrix = ''
    cellCount = ''
    zGap = ''
    pkgType = ''
    pkgThickness = ''
    hl = ''
    designType = ''
    slipLock = ''
    heatTreatCore = ''
    coatingCheck = ''
    tfByTw = ''
    tfByFrc = ''
    transferMold = ''
    eol = ''
    shippedOut = ''
    fabricationInProgress = ''
    stopFabrication = ''
    inProduction = ''
    statusNote = ''
    statusFlags = ''
    keyStatus = ''
  }
}

function Add-MainRows($table, [string]$brand, [string]$sheetKind, $infoLookup, [hashtable]$lookupMap, [hashtable]$aaeMap, [hashtable]$dwgNoMap, [System.Collections.Generic.List[object]]$outRows) {
  $headers = $table.Headers
  foreach ($row in $table.Rows) {
    $moldNo = Get-RowValue $row $headers @('^Mold No$')
    if (-not $moldNo) { continue }

    $origin = Get-RowValue $row $headers @('^Origin$')
    $description = Get-RowValue $row $headers @('^Description$')
    $rev = First-NonEmpty @(
      Get-RowValue $row $headers @('^Rev\.$'),
      Get-RowValue $row $headers @('^Rev$')
    )
    $sitePn = Get-RowValue $row $headers @('Site P/N')
    $customer = Get-RowValue $row $headers @('^Customer$')
    $registrationDate = Convert-ExcelDate (Get-RowValue $row $headers @('Registration Date'))
    $statusText = Get-RowValue $row $headers @('^STATUS$')
    $pBin = Get-RowValue $row $headers @('^P-BIN$')
    $sapMoldNo = ''
    $trayWeight = ''
    $materialDwg = ''
    $materialProduction = ''
    $heatTreat = ''
    $statusNote = $statusText
    $tfByTw = ''
    $tfByFrc = ''
    $transferMold = ''
    $eol = ''
    $shippedOut = ''
    $fabricationInProgress = ''
    $stopFabrication = ''
    $inProduction = ''

    switch ($sheetKind) {
      'DW' {
        $sapMoldNo = Get-RowValue $row $headers @('SAP MOLD NO')
        $trayWeight = Get-RowValue $row $headers @('Tray Weight')
        $materialDwg = Get-RowValue $row $headers @('Material in DWG')
        $materialProduction = Get-RowValue $row $headers @('Material in produciton', 'Material in production')
        $tfByTw = Normalize-Flag (Get-RowValue $row $headers @('RETURN TO DW'))
        $transferMold = Normalize-Flag (Get-RowValue $row $headers @('TRANSFER MOLD'))
        $eol = Normalize-Flag (Get-RowValue $row $headers @('^EOL$'))
        $fabricationInProgress = Normalize-Flag (Get-RowValue $row $headers @('FABRICATION IN PROGRESS'))
        $stopFabrication = Normalize-Flag (Get-RowValue $row $headers @('STOP FABRICATION'))
        $inProduction = Normalize-Flag (Get-RowValue $row $headers @('IN PRODUCTION'))
      }
      'PEAK' {
        $sapMoldNo = Get-RowValue $row $headers @('PEAK MOLD NO \(SAP\)')
        $trayWeight = Get-RowValue $row $headers @('Tray Weight')
        $materialDwg = Get-RowValue $row $headers @('Material in DWG')
        $materialProduction = Get-RowValue $row $headers @('Material in produciton', 'Material in production')
        $heatTreat = Get-RowValue $row $headers @('Heat Treatement', 'Heat Treatment')
        $tfByTw = Normalize-Flag (Get-RowValue $row $headers @('RETURN TO PEAK'))
        $transferMold = Normalize-Flag (Get-RowValue $row $headers @('TRF MOLD', 'TRF Mold', 'TRF MOLD'))
        $eol = Normalize-Flag (Get-RowValue $row $headers @('^EOL$'))
        $fabricationInProgress = Normalize-Flag (Get-RowValue $row $headers @('FABRICATION IN PROGRESS'))
        $stopFabrication = Normalize-Flag (Get-RowValue $row $headers @('STOP FABRICATION'))
        $inProduction = Normalize-Flag (Get-RowValue $row $headers @('IN PRODUCTION'))
      }
      'FRC' {
        $trayWeight = Get-RowValue $row $headers @('^Weight$')
        $materialDwg = Get-RowValue $row $headers @('Material \(DWG\)', 'Material \(Dwg\)')
        $materialProduction = Get-RowValue $row $headers @('Material \(In production\)', 'Material \(In Production\)')
        $tfByTw = Normalize-Flag (Get-RowValue $row $headers @('TF BY FRC'))
        $transferMold = Normalize-Flag (Get-RowValue $row $headers @('TF mold'))
        $eol = Normalize-Flag (Get-RowValue $row $headers @('^EOL$'))
        $shippedOut = Normalize-Flag (Get-RowValue $row $headers @('Shipped out Mold'))
        $fabricationInProgress = Normalize-Flag (Get-RowValue $row $headers @('Fabrication in Progress'))
        $stopFabrication = Normalize-Flag (Get-RowValue $row $headers @('Stop Fabrication'))
        $inProduction = Normalize-Flag (Get-RowValue $row $headers @('IN PRODUCTION'))
      }
    }

    $info = Match-Info -info $infoLookup -moldNo $moldNo -sitePn $sitePn -description $description
    $lookupEntry = [ordered]@{
      sapMoldNo = $sapMoldNo
      pkgType = if ($info) { T $info.pkgType } else { '' }
      pkgThickness = if ($info) { T $info.pkgThickness } else { '' }
      matrix = if ($info) { T $info.matrix } else { '' }
      cellCount = if ($info) { T $info.cellCount } else { '' }
      designType = if ($info) { T $info.designType } else { '' }
      zGap = if ($info) { T $info.zGap } else { '' }
      slipLock = if ($info) { T $info.slipLock } else { '' }
      hl = if ($info) { T $info.hl } else { '' }
    }
    $lookupMap["$brand|$moldNo"] = $lookupEntry
    $aaeMap["$brand|$moldNo"] = [ordered]@{ ae = $statusText; aa = $pBin }
    if ($info -and (T $info.dwgNo)) { $dwgNoMap["$brand|$moldNo"] = T $info.dwgNo }

    $base = New-BaseRow
    $base.brand = $brand
    $base.moldNo = $moldNo
    $base.sapMoldNo = $sapMoldNo
    $base.origin = $origin
    $base.description = $description
    $base.rev = $rev
    $base.sitePn = $sitePn
    $base.registrationDate = $registrationDate
    $base.customer = $customer
    $base.trayWeight = $trayWeight
    $base.materialDwg = $materialDwg
    $base.materialProduction = $materialProduction
    $base.excelAA = $pBin
    $base.excelAE = $statusText
    if ($info) {
      $base.matrix = T $info.matrix
      $base.cellCount = T $info.cellCount
      $base.zGap = T $info.zGap
      $base.pkgType = T $info.pkgType
      $base.pkgThickness = T $info.pkgThickness
      $base.hl = T $info.hl
      $base.designType = T $info.designType
      $base.slipLock = T $info.slipLock
    }
    $base.heatTreatCore = $heatTreat
    $base.tfByTw = $tfByTw
    $base.tfByFrc = $tfByFrc
    $base.transferMold = $transferMold
    $base.eol = $eol
    $base.shippedOut = $shippedOut
    $base.fabricationInProgress = $fabricationInProgress
    $base.stopFabrication = $stopFabrication
    $base.inProduction = $inProduction
    $base.statusNote = $statusNote
    $base.statusFlags = Build-StatusFlags $base
    $base.keyStatus = Build-KeyStatus $base

    $outRows.Add([pscustomobject]$base)
  }
}

function Replace-One([string]$text, [string]$pattern, [string]$replacement) {
  return [regex]::Replace($text, $pattern, $replacement, [System.Text.RegularExpressions.RegexOptions]::Singleline)
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
  throw "Workbook not found: $WorkbookPath"
}

$htmlPath = Join-Path $DashboardFolder 'mold_dashboard.html'
$sharedRowsPath = Join-Path $DashboardFolder 'mold_shared_rows.json'
$lookupJsonPath = Join-Path $DashboardFolder 'mold_lookup.json'

$timestamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$backupDir = Join-Path (Join-Path $DashboardFolder 'Backups') $timestamp
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item -LiteralPath $htmlPath -Destination (Join-Path $backupDir 'mold_dashboard.html') -Force
Copy-Item -LiteralPath $sharedRowsPath -Destination (Join-Path $backupDir 'mold_shared_rows.json') -Force
Copy-Item -LiteralPath $lookupJsonPath -Destination (Join-Path $backupDir 'mold_lookup.json') -Force

$zip = [System.IO.Compression.ZipFile]::OpenRead($WorkbookPath)
try {
  $sharedStrings = Get-SharedStrings $zip
  $sheetMap = Get-SheetMap $zip

  $dwMain = Get-Table -zip $zip -sheetPath $sheetMap['DW_MOLD'] -sharedStrings $sharedStrings
  $dwInfo = Get-Table -zip $zip -sheetPath $sheetMap['DW_MOLD INFO'] -sharedStrings $sharedStrings
  $peakMain = Get-Table -zip $zip -sheetPath $sheetMap['PEAK_MOLD'] -sharedStrings $sharedStrings
  $peakInfo = Get-Table -zip $zip -sheetPath $sheetMap['PEAK_MOLD INFO'] -sharedStrings $sharedStrings
  $frcMain = Get-Table -zip $zip -sheetPath $sheetMap['FRC_MOLD'] -sharedStrings $sharedStrings
  $frcInfo = Get-Table -zip $zip -sheetPath $sheetMap['FRC_MOLD INFO'] -sharedStrings $sharedStrings

  $dwInfoLookup = Build-InfoLookup -table $dwInfo -brand 'Daewon'
  $peakInfoLookup = Build-InfoLookup -table $peakInfo -brand 'Peak'
  $frcInfoLookup = Build-InfoLookup -table $frcInfo -brand 'FRC'

  $lookupMap = @{}
  $aaeMap = @{}
  $dwgNoMap = @{}
  $rowList = New-Object System.Collections.Generic.List[object]

  Add-MainRows -table $dwMain -brand 'Daewon' -sheetKind 'DW' -infoLookup $dwInfoLookup -lookupMap $lookupMap -aaeMap $aaeMap -dwgNoMap $dwgNoMap -outRows $rowList
  Add-MainRows -table $peakMain -brand 'Peak' -sheetKind 'PEAK' -infoLookup $peakInfoLookup -lookupMap $lookupMap -aaeMap $aaeMap -dwgNoMap $dwgNoMap -outRows $rowList
  Add-MainRows -table $frcMain -brand 'FRC' -sheetKind 'FRC' -infoLookup $frcInfoLookup -lookupMap $lookupMap -aaeMap $aaeMap -dwgNoMap $dwgNoMap -outRows $rowList

  $rows = Merge-DedupedRows ([object[]]$rowList.ToArray())
  $lookupJson = ($lookupMap | ConvertTo-Json -Depth 6 -Compress)
  $rowsJson = ($rows | ConvertTo-Json -Depth 6 -Compress)
  $aaeJson = ($aaeMap | ConvertTo-Json -Depth 5 -Compress)
  $dwgJson = ($dwgNoMap | ConvertTo-Json -Depth 4 -Compress)

  $sharedPayload = [ordered]@{
    updatedAt = (Get-Date).ToString('s')
    rows = $rows
  }

  Set-Content -LiteralPath $lookupJsonPath -Value ($lookupMap | ConvertTo-Json -Depth 6) -Encoding UTF8
  Set-Content -LiteralPath $sharedRowsPath -Value ($sharedPayload | ConvertTo-Json -Depth 6) -Encoding UTF8

  $html = Get-Content -LiteralPath $htmlPath -Raw
  $html = Replace-One $html '<script id="mold-data" type="application/json">.*?</script>' ('<script id="mold-data" type="application/json">' + $rowsJson + '</script>')
  $html = Replace-One $html '<script id="mold-lookup" type="application/json">.*?</script>' ('<script id="mold-lookup" type="application/json">' + $lookupJson + '</script>')
  $html = Replace-One $html 'var dwgNoMap=.*?;\s*var excelAAEMap=' ('var dwgNoMap=' + $dwgJson + ';' + [Environment]::NewLine + 'var excelAAEMap=')
  $html = Replace-One $html 'var excelAAEMap=.*?;\s*var datasetKey=' ('var excelAAEMap=' + $aaeJson + ';' + [Environment]::NewLine + 'var datasetKey=')
  Set-Content -LiteralPath $htmlPath -Value $html -Encoding UTF8

  $dwCount = ($rows | Where-Object { $_.brand -eq 'Daewon' }).Count
  $peakCount = ($rows | Where-Object { $_.brand -eq 'Peak' }).Count
  $frcCount = ($rows | Where-Object { $_.brand -eq 'FRC' }).Count
  $withSlip = ($rows | Where-Object { T $_.slipLock }).Count
  $withStatus = ($rows | Where-Object { T $_.excelAE }).Count

  Write-Output ("UPDATED workbook={0} total={1} Daewon={2} Peak={3} FRC={4} slipLock={5} status={6} backup={7}" -f (Split-Path $WorkbookPath -Leaf), $rows.Count, $dwCount, $peakCount, $frcCount, $withSlip, $withStatus, $backupDir)
} finally {
  $zip.Dispose()
}
