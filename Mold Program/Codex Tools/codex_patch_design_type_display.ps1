$path='\\192.168.231.8\CE Internal\4. CE WEEKLY REPORT\Mold List (禮拜五下班前)\mold_dashboard.html'
$content = Get-Content -LiteralPath $path -Raw

$replacements = @(
  @('Flat seating pane design','Flat seating'),
  @('Flat seating plane design','Flat seating'),
  @('Flat Seating Plane Design','Flat seating'),
  @('Ball support design','Ball support'),
  @('Ball Support Design','Ball support'),
  @('Corner support design','Corner support'),
  @('Tapered wall design','Tapered'),
  @('Shelf','Flat seating'),
  @('Slope','Tapered'),
  @('QFP design','Flat seating'),
  @('QFP','Flat seating')
)
foreach($pair in $replacements){
  $content = $content.Replace($pair[0], $pair[1])
}

$content = $content.Replace("<td>"+"'+htmlEscape(row.designType)+'"+"</td>","<td>"+"'+htmlEscape(normalizeDesignType(row.designType))+'"+"</td>")
Set-Content -LiteralPath $path -Value $content -Encoding UTF8
