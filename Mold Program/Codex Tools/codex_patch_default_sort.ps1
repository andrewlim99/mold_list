$path='\\192.168.231.8\CE Internal\4. CE WEEKLY REPORT\Mold List (禮拜五下班前)\mold_dashboard.html'
$content = Get-Content -LiteralPath $path -Raw
$content = $content.Replace("var state={search:'',brand:'All',status:'All',customer:'All',origin:'All',quickStatus:'All',sortKey:'',sortDir:'asc'};","var state={search:'',brand:'All',status:'All',customer:'All',origin:'All',quickStatus:'All',sortKey:'moldNo',sortDir:'asc'};")
$old = @"
function sortFiltered(filtered){if(!state.sortKey){return filtered;} filtered.sort(function(x,y){var av=text(x.row[state.sortKey]); var bv=text(y.row[state.sortKey]); var cmp=compareValues(av,bv); if(cmp===0){ cmp=x.index-y.index; } return state.sortDir==='asc'?cmp:-cmp;}); return filtered;}
"@
$new = @"
function brandSortRank(row){return text(row.brand)==='Peak'?0:1;}
function sortFiltered(filtered){if(!state.sortKey){return filtered;} filtered.sort(function(x,y){var cmp=0, av, bv; if(state.sortKey==='moldNo'){ cmp=brandSortRank(x.row)-brandSortRank(y.row); if(cmp===0){ av=text(x.row[state.sortKey]); bv=text(y.row[state.sortKey]); cmp=compareValues(av,bv); } } else { av=text(x.row[state.sortKey]); bv=text(y.row[state.sortKey]); cmp=compareValues(av,bv); } if(cmp===0){ cmp=x.index-y.index; } return state.sortDir==='asc'?cmp:-cmp;}); return filtered;}
"@
$content = $content.Replace($old,$new)
Set-Content -LiteralPath $path -Value $content -Encoding UTF8
