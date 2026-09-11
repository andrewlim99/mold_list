$folder=Split-Path -Parent $PSScriptRoot
$appFolder=Join-Path $folder 'Dashboard App'
$xlsx=Join-Path $folder 'MOLD LIST 2026.04.02.xlsx'
$lookupPath=Join-Path $appFolder 'mold_lookup.json'
$htmlPath=Join-Path $appFolder 'mold_dashboard.html'

function T($v){ if($null -eq $v){ return '' } return ([string]$v).Trim() }
function Norm($v){ return (T $v).ToUpperInvariant() }
function HeaderIndex($headers, $patterns){
  foreach($pattern in $patterns){
    for($i=0; $i -lt $headers.Count; $i++){
      if(($headers[$i] -replace '\s+',' ') -match $pattern){ return $i + 1 }
    }
  }
  return 0
}

$excel=New-Object -ComObject Excel.Application
$excel.Visible=$false
$excel.DisplayAlerts=$false
$wb=$excel.Workbooks.Open($xlsx)

$sheetConfigs=@(
  @{ Brand='Daewon'; Main='DW_MOLD'; Info='DW_MOLD INFO'; SapPatterns=@('SAP MOLD NO'); MainDescPatterns=@('^Description$'); MainMoldPatterns=@('^Mold No$'); MainSitePatterns=@('Site P/N'); InfoMoldPatterns=@('^Mold No$'); InfoItemPatterns=@('^Item No$'); InfoDescPatterns=@('^Description$') },
  @{ Brand='Peak'; Main='PEAK_MOLD'; Info='PEAK_MOLD INFO'; SapPatterns=@('PEAK MOLD NO \(SAP\)'); MainDescPatterns=@('^Description$'); MainMoldPatterns=@('^Mold No$'); MainSitePatterns=@('Site P/N'); InfoMoldPatterns=@('^Mold No$'); InfoItemPatterns=@('^Item No$'); InfoDescPatterns=@('^Description$') },
  @{ Brand='FRC'; Main='FRC_MOLD'; Info=''; SapPatterns=@('PEAK MOLD NO \(SAP\)'); MainDescPatterns=@('^Description$'); MainMoldPatterns=@('^Mold No$'); MainSitePatterns=@('Site P/N'); InfoMoldPatterns=@('^Mold No$'); InfoItemPatterns=@('^Item No$'); InfoDescPatterns=@('^Description$') }
)

$lookup = [ordered]@{}
$stats = @()

foreach($cfg in $sheetConfigs){
  try {
    $mainWs=$wb.Worksheets.Item($cfg.Main)
  } catch {
    $stats += ($cfg.Brand + ': main sheet missing')
    continue
  }
  $main=$mainWs.UsedRange.Value2
  $mainRows=$main.GetLength(0)
  $mainCols=$main.GetLength(1)
  $mainHeaders=@()
  for($c=1; $c -le $mainCols; $c++){ $mainHeaders += (T $main[1,$c]) }
  $mainMoldCol=HeaderIndex $mainHeaders $cfg.MainMoldPatterns
  $mainSiteCol=HeaderIndex $mainHeaders $cfg.MainSitePatterns
  $mainDescCol=HeaderIndex $mainHeaders $cfg.MainDescPatterns
  $sapCol=HeaderIndex $mainHeaders $cfg.SapPatterns

  $infoByMold=@{}
  $infoByItem=@{}
  $infoByDesc=@{}

  if($cfg.Info){
    try {
      $infoWs=$wb.Worksheets.Item($cfg.Info)
      $info=$infoWs.UsedRange.Value2
      $infoRows=$info.GetLength(0)
      $infoCols=$info.GetLength(1)
      $infoHeaders=@()
      for($c=1; $c -le $infoCols; $c++){ $infoHeaders += (T $info[1,$c]) }
      $infoMoldCol=HeaderIndex $infoHeaders $cfg.InfoMoldPatterns
      $infoItemCol=HeaderIndex $infoHeaders $cfg.InfoItemPatterns
      $infoDescCol=HeaderIndex $infoHeaders $cfg.InfoDescPatterns
      $pkgTypeCol=HeaderIndex $infoHeaders @('^PKG Type$')
      $pkgThicknessCol=HeaderIndex $infoHeaders @('^PKG Thick$')
      $matrixCol=HeaderIndex $infoHeaders @('^Matrix$')
      $cellCol=HeaderIndex $infoHeaders @('Cell Cnt')
      $designCol=HeaderIndex $infoHeaders @('Design Type')
      $zGapCol=HeaderIndex $infoHeaders @('Z-gap')
      $slipLockCol=HeaderIndex $infoHeaders @('^Slip Lock$')
      for($r=2; $r -le $infoRows; $r++){
        $entry=[ordered]@{
          pkgType = if($pkgTypeCol){ T $info[$r,$pkgTypeCol] } else { '' }
          pkgThickness = if($pkgThicknessCol){ T $info[$r,$pkgThicknessCol] } else { '' }
          matrix = if($matrixCol){ T $info[$r,$matrixCol] } else { '' }
          cellCount = if($cellCol){ T $info[$r,$cellCol] } else { '' }
          designType = if($designCol){ T $info[$r,$designCol] } else { '' }
          zGap = if($zGapCol){ T $info[$r,$zGapCol] } else { '' }
          slipLock = if($slipLockCol){ T $info[$r,$slipLockCol] } else { '' }
        }
        if(($entry.pkgType + $entry.pkgThickness + $entry.matrix + $entry.cellCount + $entry.designType + $entry.zGap + $entry.slipLock) -eq ''){ continue }
        $infoMold = if($infoMoldCol){ Norm $info[$r,$infoMoldCol] } else { '' }
        $infoItem = if($infoItemCol){ Norm $info[$r,$infoItemCol] } else { '' }
        $infoDesc = if($infoDescCol){ Norm $info[$r,$infoDescCol] } else { '' }
        if($infoMold -and -not $infoByMold.ContainsKey($infoMold)){ $infoByMold[$infoMold]=$entry }
        if($infoItem -and -not $infoByItem.ContainsKey($infoItem)){ $infoByItem[$infoItem]=$entry }
        if($infoDesc -and -not $infoByDesc.ContainsKey($infoDesc)){ $infoByDesc[$infoDesc]=$entry }
      }
    } catch {
    }
  }

  $brandMatches=0
  for($r=2; $r -le $mainRows; $r++){
    $moldNo = if($mainMoldCol){ T $main[$r,$mainMoldCol] } else { '' }
    if(-not $moldNo){ continue }
    $sitePn = if($mainSiteCol){ T $main[$r,$mainSiteCol] } else { '' }
    $desc = if($mainDescCol){ T $main[$r,$mainDescCol] } else { '' }
    $sap = if($sapCol){ T $main[$r,$sapCol] } else { '' }
    $match = $null
    $moldKey = Norm $moldNo
    $siteKey = Norm $sitePn
    $descKey = Norm $desc
    if($moldKey -and $infoByMold.ContainsKey($moldKey)){ $match = $infoByMold[$moldKey] }
    elseif($siteKey -and $infoByItem.ContainsKey($siteKey)){ $match = $infoByItem[$siteKey] }
    elseif($descKey -and $infoByDesc.ContainsKey($descKey)){ $match = $infoByDesc[$descKey] }
    if($match){ $brandMatches++ }
    $lookup[($cfg.Brand + '|' + $moldNo)] = [ordered]@{
      sapMoldNo = $sap
      pkgType = if($match){ $match.pkgType } else { '' }
      pkgThickness = if($match){ $match.pkgThickness } else { '' }
      matrix = if($match){ $match.matrix } else { '' }
      cellCount = if($match){ $match.cellCount } else { '' }
      designType = if($match){ $match.designType } else { '' }
      zGap = if($match){ $match.zGap } else { '' }
      slipLock = if($match){ $match.slipLock } else { '' }
    }
  }
  $stats += ($cfg.Brand + ': ' + $brandMatches + ' matched')
}

$json = $lookup | ConvertTo-Json -Depth 5 -Compress
Set-Content -LiteralPath $lookupPath -Value $json -Encoding UTF8

$html = Get-Content -LiteralPath $htmlPath -Raw
$html = [regex]::Replace($html,'(?s)<script id="mold-lookup" type="application/json">.*?</script>','<script id="mold-lookup" type="application/json">' + $json + '</script>',1)
Set-Content -LiteralPath $htmlPath -Value $html -Encoding UTF8

Write-Output ('REBUILT_LOOKUP ' + ($stats -join ' | '))
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb)|Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel)|Out-Null
