$path='\\192.168.231.8\CE Internal\4. CE WEEKLY REPORT\Mold List (禮拜五下班前)\mold_dashboard.html'
$content = Get-Content -LiteralPath $path -Raw

$content = $content.Replace('<div class="field"><label for="entryDesignType">Design Type</label><input id="entryDesignType" type="text"></div>','<div class="field"><label for="entryDesignType">Design Type</label><select id="entryDesignType"><option value="">Blank</option><option value="Tapered">Tapered</option><option value="Flat seating">Flat seating</option><option value="Ball support">Ball support</option><option value="Corner support">Corner support</option></select></div>')

$old = @"
function storageGet(key){try{return window.localStorage?localStorage.getItem(key):null;}catch(e){return null;}}
function storageSet(key,val){try{if(window.localStorage){localStorage.setItem(key,val);}}catch(e){}}
"@
$new = @"
function storageGet(key){try{return window.localStorage?localStorage.getItem(key):null;}catch(e){return null;}}
function storageSet(key,val){try{if(window.localStorage){localStorage.setItem(key,val);}}catch(e){}}
function normalizeDesignType(value){
  var raw=text(value).trim();
  var normalized=raw.toLowerCase().replace(/[^a-z]+/g,' ');
  if(!raw){return '';}
  if(normalized.indexOf('corner support')>-1){return 'Corner support';}
  if(normalized.indexOf('ball support')>-1){return 'Ball support';}
  if(normalized.indexOf('flat seating')>-1 || normalized.indexOf('seating plane')>-1 || normalized.indexOf('seating pane')>-1 || normalized.indexOf('qfp')>-1 || normalized.indexOf('shelf')>-1){return 'Flat seating';}
  if(normalized.indexOf('tapered')>-1 || normalized.indexOf('slope')>-1){return 'Tapered';}
  return raw;
}
"@
$content = $content.Replace($old, $new)

$old = @"
  if(!text(rows[i].designType)){ rows[i].designType=text(lookup.designType); }
  if(!text(rows[i].slipLock)){ rows[i].slipLock=text(lookup.slipLock); }
"@
$new = @"
  rows[i].designType=normalizeDesignType(text(rows[i].designType) || text(lookup.designType));
  if(!text(rows[i].slipLock)){ rows[i].slipLock=text(lookup.slipLock); }
"@
$content = $content.Replace($old, $new)

$old = @"
function clearForm(){byId('entryBrand').value='Daewon'; byId('entryMoldNo').value=''; byId('entrySapMoldNo').value=''; byId('entryRevision').value=''; byId('entryDescription').value=''; byId('entryCustomer').value=''; byId('entryOrigin').value=''; byId('entrySitePn').value=''; byId('entryDate').value=''; byId('entryTrayWeight').value=''; byId('entryMaterialDwg').value=''; byId('entryMaterialProduction').value=''; byId('entryMatrix').value=''; byId('entryCellCount').value=''; byId('entryZGap').value=''; byId('entryDesignType').value=''; byId('entrySlipLock').value=''; byId('entrySlipLock').parentNode.className='field'; byId('entryHeatTreatCore').value='No'; byId('entryCoatingCheck').value='Progress Required'; byId('entryStatus').value='In Production';}
"@
$new = @"
function clearForm(){byId('entryBrand').value='Daewon'; byId('entryMoldNo').value=''; byId('entrySapMoldNo').value=''; byId('entryRevision').value=''; byId('entryDescription').value=''; byId('entryCustomer').value=''; byId('entryOrigin').value=''; byId('entrySitePn').value=''; byId('entryDate').value=''; byId('entryTrayWeight').value=''; byId('entryMaterialDwg').value=''; byId('entryMaterialProduction').value=''; byId('entryMatrix').value=''; byId('entryCellCount').value=''; byId('entryZGap').value=''; byId('entryDesignType').value=''; byId('entrySlipLock').value=''; byId('entrySlipLock').parentNode.className='field'; byId('entryHeatTreatCore').value='No'; byId('entryCoatingCheck').value='Progress Required'; byId('entryStatus').value='In Production';}
"@
$content = $content.Replace($old, $new)

$old = @"
function openEditor(mode, index){editorPanel.className='editor-panel open'; editIndex=(typeof index==='number')?index:-1; setMessage('', ''); if(mode==='edit' && index>-1){var row=rows[index]; if(/^peak$/i.test(text(row.origin))){ row.origin='SZ'; } editorTitle.innerHTML='Edit Product'; byId('entryBrand').value=text(row.brand)||'Daewon'; byId('entryMoldNo').value=text(row.moldNo); byId('entrySapMoldNo').value=text(row.sapMoldNo); byId('entryRevision').value=text(row.rev); byId('entryDescription').value=text(row.description); byId('entryCustomer').value=text(row.customer); byId('entryOrigin').value=text(row.origin); byId('entrySitePn').value=text(row.sitePn); byId('entryDate').value=text(row.registrationDate); byId('entryTrayWeight').value=text(row.trayWeight); byId('entryMaterialDwg').value=text(row.materialDwg); byId('entryMaterialProduction').value=text(row.materialProduction); byId('entryMatrix').value=text(row.matrix); byId('entryCellCount').value=text(row.cellCount); byId('entryZGap').value=text(row.zGap); byId('entryDesignType').value=text(row.designType); byId('entrySlipLock').value=text(row.slipLock); byId('entryHeatTreatCore').value=text(row.heatTreatCore)||'No'; byId('entryCoatingCheck').value=text(row.coatingCheck); byId('entryStatus').value=text(row.keyStatus)||'In Production'; } else { editorTitle.innerHTML='Add Product'; clearForm(); } updateSlipLockWarning(); }
"@
$new = @"
function openEditor(mode, index){editorPanel.className='editor-panel open'; editIndex=(typeof index==='number')?index:-1; setMessage('', ''); if(mode==='edit' && index>-1){var row=rows[index]; if(/^peak$/i.test(text(row.origin))){ row.origin='SZ'; } editorTitle.innerHTML='Edit Product'; byId('entryBrand').value=text(row.brand)||'Daewon'; byId('entryMoldNo').value=text(row.moldNo); byId('entrySapMoldNo').value=text(row.sapMoldNo); byId('entryRevision').value=text(row.rev); byId('entryDescription').value=text(row.description); byId('entryCustomer').value=text(row.customer); byId('entryOrigin').value=text(row.origin); byId('entrySitePn').value=text(row.sitePn); byId('entryDate').value=text(row.registrationDate); byId('entryTrayWeight').value=text(row.trayWeight); byId('entryMaterialDwg').value=text(row.materialDwg); byId('entryMaterialProduction').value=text(row.materialProduction); byId('entryMatrix').value=text(row.matrix); byId('entryCellCount').value=text(row.cellCount); byId('entryZGap').value=text(row.zGap); byId('entryDesignType').value=normalizeDesignType(row.designType); byId('entrySlipLock').value=text(row.slipLock); byId('entryHeatTreatCore').value=text(row.heatTreatCore)||'No'; byId('entryCoatingCheck').value=text(row.coatingCheck); byId('entryStatus').value=text(row.keyStatus)||'In Production'; } else { editorTitle.innerHTML='Add Product'; clearForm(); } updateSlipLockWarning(); }
"@
$content = $content.Replace($old, $new)

$old = @"
function buildRecord(){var moldNo=text(byId('entryMoldNo').value).trim(), description=text(byId('entryDescription').value).trim(); if(!moldNo || !description){ return null; } var keyStatus=byId('entryStatus').value; var heatTreatCore=byId('entryHeatTreatCore').value; var coatingCheck=text(byId('entryCoatingCheck').value).trim(); if(heatTreatCore==='Yes'){ coatingCheck='N/A'; } else if(!coatingCheck){ coatingCheck='Progress Required'; } return {brand:byId('entryBrand').value,moldNo:moldNo,sapMoldNo:text(byId('entrySapMoldNo').value).trim(),origin:(function(v){ return /^peak$/i.test(v)?'SZ':(/^frc$/i.test(v)?'TW':v); })(text(byId('entryOrigin').value).trim()),description:description,rev:text(byId('entryRevision').value).trim(),sitePn:text(byId('entrySitePn').value).trim(),registrationDate:text(byId('entryDate').value).trim(),customer:text(byId('entryCustomer').value).trim(),trayWeight:text(byId('entryTrayWeight').value).trim(),materialDwg:text(byId('entryMaterialDwg').value).trim(),materialProduction:text(byId('entryMaterialProduction').value).trim(),matrix:text(byId('entryMatrix').value).trim(),cellCount:text(byId('entryCellCount').value).trim(),zGap:text(byId('entryZGap').value).trim(),designType:text(byId('entryDesignType').value).trim(),slipLock:text(byId('entrySlipLock').value).trim(),heatTreatCore:heatTreatCore,coatingCheck:coatingCheck,tfByTw:keyStatus==='TF by TW'?'O':'', tfByFrc:'',transferMold:keyStatus==='Transfer Mold'?'O':'',eol:keyStatus==='EOL'?'O':'',shippedOut:keyStatus==='Shipped Out'?'O':'',fabricationInProgress:keyStatus==='Fabrication In Progress'?'O':'',stopFabrication:keyStatus==='Stop Fabrication'?'O':'',inProduction:keyStatus==='In Production'?'O':'',statusNote:keyStatus==='Check Status Note'?'Manual review needed':'',statusFlags:statusFlagsFromStatus(keyStatus),keyStatus:keyStatus};}
"@
$new = @"
function buildRecord(){var moldNo=text(byId('entryMoldNo').value).trim(), description=text(byId('entryDescription').value).trim(); if(!moldNo || !description){ return null; } var keyStatus=byId('entryStatus').value; var heatTreatCore=byId('entryHeatTreatCore').value; var coatingCheck=text(byId('entryCoatingCheck').value).trim(); if(heatTreatCore==='Yes'){ coatingCheck='N/A'; } else if(!coatingCheck){ coatingCheck='Progress Required'; } return {brand:byId('entryBrand').value,moldNo:moldNo,sapMoldNo:text(byId('entrySapMoldNo').value).trim(),origin:(function(v){ return /^peak$/i.test(v)?'SZ':(/^frc$/i.test(v)?'TW':v); })(text(byId('entryOrigin').value).trim()),description:description,rev:text(byId('entryRevision').value).trim(),sitePn:text(byId('entrySitePn').value).trim(),registrationDate:text(byId('entryDate').value).trim(),customer:text(byId('entryCustomer').value).trim(),trayWeight:text(byId('entryTrayWeight').value).trim(),materialDwg:text(byId('entryMaterialDwg').value).trim(),materialProduction:text(byId('entryMaterialProduction').value).trim(),matrix:text(byId('entryMatrix').value).trim(),cellCount:text(byId('entryCellCount').value).trim(),zGap:text(byId('entryZGap').value).trim(),designType:normalizeDesignType(byId('entryDesignType').value),slipLock:text(byId('entrySlipLock').value).trim(),heatTreatCore:heatTreatCore,coatingCheck:coatingCheck,tfByTw:keyStatus==='TF by TW'?'O':'', tfByFrc:'',transferMold:keyStatus==='Transfer Mold'?'O':'',eol:keyStatus==='EOL'?'O':'',shippedOut:keyStatus==='Shipped Out'?'O':'',fabricationInProgress:keyStatus==='Fabrication In Progress'?'O':'',stopFabrication:keyStatus==='Stop Fabrication'?'O':'',inProduction:keyStatus==='In Production'?'O':'',statusNote:keyStatus==='Check Status Note'?'Manual review needed':'',statusFlags:statusFlagsFromStatus(keyStatus),keyStatus:keyStatus};}
"@
$content = $content.Replace($old, $new)

Set-Content -LiteralPath $path -Value $content -Encoding UTF8
