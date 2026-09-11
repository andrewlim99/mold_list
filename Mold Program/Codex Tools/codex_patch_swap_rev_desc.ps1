$path='\\192.168.231.8\CE Internal\4. CE WEEKLY REPORT\Mold List (禮拜五下班前)\mold_dashboard.html'
$content = Get-Content -LiteralPath $path -Raw
$content = $content.Replace('<th data-sort="moldNo">Mold No<span class="sort-mark"></span></th><th data-sort="rev">Revision<span class="sort-mark"></span></th><th data-sort="description">Description<span class="sort-mark"></span></th>','<th data-sort="moldNo">Mold No<span class="sort-mark"></span></th><th data-sort="description">Description<span class="sort-mark"></span></th><th data-sort="rev">Revision<span class="sort-mark"></span></th>')
$content = $content.Replace("<td class=\"mono\">'+htmlEscape(row.moldNo)+'</td><td>'+htmlEscape(row.rev)+'</td><td>'+htmlEscape(row.description)+'</td>","<td class=\"mono\">'+htmlEscape(row.moldNo)+'</td><td>'+htmlEscape(row.description)+'</td><td>'+htmlEscape(row.rev)+'</td>")
Set-Content -LiteralPath $path -Value $content -Encoding UTF8
