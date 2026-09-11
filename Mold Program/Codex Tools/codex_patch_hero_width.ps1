$path='\\192.168.231.8\CE Internal\4. CE WEEKLY REPORT\Mold List (禮拜五下班前)\mold_dashboard.html'
$content = Get-Content -LiteralPath $path -Raw
$content = $content.Replace('grid-template-columns:minmax(300px,360px) minmax(0,1fr)','grid-template-columns:minmax(250px,300px) minmax(0,1fr)')
$content = $content.Replace('h1{margin:22px 0 0;font-size:clamp(42px,4.2vw,64px);line-height:.92;letter-spacing:-.05em;word-break:keep-all;overflow-wrap:normal;max-width:8.5ch}','h1{margin:20px 0 0;font-size:clamp(38px,3.8vw,58px);line-height:.94;letter-spacing:-.05em;word-break:keep-all;overflow-wrap:normal;max-width:7.8ch}')
Set-Content -LiteralPath $path -Value $content -Encoding UTF8
