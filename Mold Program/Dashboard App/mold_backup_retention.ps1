function Remove-ExpiredMoldBackups {
  param(
    [ValidateSet('Products','Management')][string]$Kind,
    [ValidateRange(1,1000)][int]$Keep = 30,
    [switch]$Preview
  )
  $appRoot = [IO.Path]::GetFullPath($root).TrimEnd('\')
  $directory = if ($Kind -eq 'Management') { Join-Path $appRoot 'Backups' } else { $appRoot }
  $directory = [IO.Path]::GetFullPath($directory).TrimEnd('\')
  if ($directory -ne $appRoot -and $directory -ne (Join-Path $appRoot 'Backups')) { throw 'Invalid backup directory.' }
  if (-not [IO.Directory]::Exists($directory)) { return }
  # Only routine snapshots are eligible; rejected-save and manual backups remain intact.
  $pattern = if ($Kind -eq 'Products') {
    '^mold_shared_rows\.backup_(?:row_save|rows_save|save)_\d{8}_\d{6}(?:_\d{7})?\.json$'
  } else { '^mold_management_\d{8}_\d{6}_\d{7}\.json$' }
  $backups = @(Get-ChildItem -LiteralPath $directory -File -ErrorAction Stop |
    Where-Object { $_.Name -match $pattern -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
    Sort-Object @{ Expression = { [regex]::Match($_.Name, '\d{8}_\d{6}(?:_\d{7})?').Value }; Descending = $true }, Name)
  foreach ($file in @($backups | Select-Object -Skip $Keep)) {
    $path = [IO.Path]::GetFullPath($file.FullName)
    if ([IO.Path]::GetDirectoryName($path) -ne $directory -or [IO.Path]::GetFileName($path) -notmatch $pattern) {
      throw 'Backup path validation failed.'
    }
    if ($Preview) { $file } else { Remove-Item -LiteralPath $path -ErrorAction Stop }
  }
}
