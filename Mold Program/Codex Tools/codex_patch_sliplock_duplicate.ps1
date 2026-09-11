$path='\\192.168.231.8\CE Internal\4. CE WEEKLY REPORT\Mold List (禮拜五下班前)\mold_dashboard.html'
$content = Get-Content -LiteralPath $path -Raw

$old = @"
.message{font-size:13px;min-height:18px;margin-top:12px}.message.ok{color:var(--accent)}.message.warn{color:#8f3d09}.table-panel{overflow:hidden}
"@
$new = @"
.message{font-size:13px;min-height:18px;margin-top:12px}.message.ok{color:var(--accent)}.message.warn{color:#8f3d09}.message.dup{color:#b42318}.field.duplicate label{color:#b42318}.field.duplicate input{border-color:#b42318;background:#fff1f1;color:#b42318}.duplicate-text{color:#b42318;font-weight:700}.table-panel{overflow:hidden}
"@
$content = $content.Replace($old, $new)

$old = @"
function setMessage(message, kind){entryMessage.className='message ' + (kind||''); entryMessage.innerHTML=htmlEscape(message||'');}
"@
$new = @"
function setMessage(message, kind){entryMessage.className='message ' + (kind||''); entryMessage.innerHTML=htmlEscape(message||'');}
function normalizeSlipLockValue(v){return text(v).replace(/\s+/g,'').toUpperCase();}
function isMeaningfulSlipLockValue(v){var n=normalizeSlipLockValue(v); return !!n && n!=='.' && n!=='NONE' && n!=='N/A';}
function findSlipLockDuplicateIndex(value, ignoreIndex){var normalized=normalizeSlipLockValue(value), i; if(!isMeaningfulSlipLockValue(value)){return -1;} for(i=0;i<rows.length;i++){if(i===ignoreIndex){continue;} if(normalizeSlipLockValue(rows[i].slipLock)===normalized){return i;}} return -1;}
function updateSlipLockWarning(){var input=byId('entrySlipLock'); var field=input&&input.parentNode; var value=input?input.value:''; var dupIndex=findSlipLockDuplicateIndex(value, editIndex); if(field){field.className=dupIndex>-1?'field duplicate':'field';} if(dupIndex>-1){setMessage('Duplicate Slip Lock with ' + text(rows[dupIndex].moldNo) + '.', 'dup'); return dupIndex;} if(text(entryMessage.className).indexOf('dup')>-1){setMessage('', '');} return -1;}
"@
$content = $content.Replace($old, $new)

$old = @"
function renderTable(){var filtered=filterRows(), html='', i, item, row; resultCount.innerHTML=String(filtered.length); for(i=0;i<filtered.length;i++){item=filtered[i]; row=item.row; html += '<tr data-index="'+item.index+'"><td>'+htmlEscape(row.brand)+'</td><td class="mono">'+htmlEscape(row.moldNo)+'</td><td>'+htmlEscape(row.rev)+'</td><td>'+htmlEscape(row.description)+'</td><td>'+htmlEscape(row.customer)+'</td><td>'+htmlEscape(row.origin)+'</td><td class="mono">'+htmlEscape(row.sitePn)+'</td><td>'+htmlEscape(row.registrationDate)+'</td><td>'+htmlEscape(row.trayWeight)+'</td><td>'+htmlEscape(row.materialDwg)+'</td><td>'+htmlEscape(row.materialProduction)+'</td><td>'+htmlEscape(row.matrix)+'</td><td>'+htmlEscape(row.cellCount)+'</td><td>'+htmlEscape(row.zGap)+'</td><td>'+htmlEscape(row.designType)+'</td><td>'+htmlEscape(row.slipLock)+'</td><td>'+htmlEscape(row.heatTreatCore)+'</td><td>'+htmlEscape(row.coatingCheck)+'</td><td><span class="status-pill status-'+slugify(row.keyStatus)+'">'+htmlEscape(row.keyStatus)+'</span></td><td class="mono">'+htmlEscape(row.sapMoldNo)+'</td></tr>'; } tableBody.innerHTML=html;}
"@
$new = @"
function renderTable(){var filtered=filterRows(), html='', i, item, row, slipLockClass; resultCount.innerHTML=String(filtered.length); for(i=0;i<filtered.length;i++){item=filtered[i]; row=item.row; slipLockClass=findSlipLockDuplicateIndex(row.slipLock, item.index)>-1?'duplicate-text':''; html += '<tr data-index="'+item.index+'"><td>'+htmlEscape(row.brand)+'</td><td class="mono">'+htmlEscape(row.moldNo)+'</td><td>'+htmlEscape(row.rev)+'</td><td>'+htmlEscape(row.description)+'</td><td>'+htmlEscape(row.customer)+'</td><td>'+htmlEscape(row.origin)+'</td><td class="mono">'+htmlEscape(row.sitePn)+'</td><td>'+htmlEscape(row.registrationDate)+'</td><td>'+htmlEscape(row.trayWeight)+'</td><td>'+htmlEscape(row.materialDwg)+'</td><td>'+htmlEscape(row.materialProduction)+'</td><td>'+htmlEscape(row.matrix)+'</td><td>'+htmlEscape(row.cellCount)+'</td><td>'+htmlEscape(row.zGap)+'</td><td>'+htmlEscape(row.designType)+'</td><td class="'+slipLockClass+'">'+htmlEscape(row.slipLock)+'</td><td>'+htmlEscape(row.heatTreatCore)+'</td><td>'+htmlEscape(row.coatingCheck)+'</td><td><span class="status-pill status-'+slugify(row.keyStatus)+'">'+htmlEscape(row.keyStatus)+'</span></td><td class="mono">'+htmlEscape(row.sapMoldNo)+'</td></tr>'; } tableBody.innerHTML=html;}
"@
$content = $content.Replace($old, $new)

$old = @"
function clearForm(){byId('entryBrand').value='Daewon'; byId('entryMoldNo').value=''; byId('entrySapMoldNo').value=''; byId('entryRevision').value=''; byId('entryDescription').value=''; byId('entryCustomer').value=''; byId('entryOrigin').value=''; byId('entrySitePn').value=''; byId('entryDate').value=''; byId('entryTrayWeight').value=''; byId('entryMaterialDwg').value=''; byId('entryMaterialProduction').value=''; byId('entryMatrix').value=''; byId('entryCellCount').value=''; byId('entryZGap').value=''; byId('entryDesignType').value=''; byId('entrySlipLock').value=''; byId('entryHeatTreatCore').value='No'; byId('entryCoatingCheck').value='Progress Required'; byId('entryStatus').value='In Production';}
"@
$new = @"
function clearForm(){byId('entryBrand').value='Daewon'; byId('entryMoldNo').value=''; byId('entrySapMoldNo').value=''; byId('entryRevision').value=''; byId('entryDescription').value=''; byId('entryCustomer').value=''; byId('entryOrigin').value=''; byId('entrySitePn').value=''; byId('entryDate').value=''; byId('entryTrayWeight').value=''; byId('entryMaterialDwg').value=''; byId('entryMaterialProduction').value=''; byId('entryMatrix').value=''; byId('entryCellCount').value=''; byId('entryZGap').value=''; byId('entryDesignType').value=''; byId('entrySlipLock').value=''; byId('entrySlipLock').parentNode.className='field'; byId('entryHeatTreatCore').value='No'; byId('entryCoatingCheck').value='Progress Required'; byId('entryStatus').value='In Production';}
"@
$content = $content.Replace($old, $new)

$old = @"
function openEditor(mode, index){editorPanel.className='editor-panel open'; editIndex=(typeof index==='number')?index:-1; setMessage('', ''); if(mode==='edit' && index>-1){var row=rows[index]; if(/^peak$/i.test(text(row.origin))){ row.origin='SZ'; } editorTitle.innerHTML='Edit Product'; byId('entryBrand').value=text(row.brand)||'Daewon'; byId('entryMoldNo').value=text(row.moldNo); byId('entrySapMoldNo').value=text(row.sapMoldNo); byId('entryRevision').value=text(row.rev); byId('entryDescription').value=text(row.description); byId('entryCustomer').value=text(row.customer); byId('entryOrigin').value=text(row.origin); byId('entrySitePn').value=text(row.sitePn); byId('entryDate').value=text(row.registrationDate); byId('entryTrayWeight').value=text(row.trayWeight); byId('entryMaterialDwg').value=text(row.materialDwg); byId('entryMaterialProduction').value=text(row.materialProduction); byId('entryMatrix').value=text(row.matrix); byId('entryCellCount').value=text(row.cellCount); byId('entryZGap').value=text(row.zGap); byId('entryDesignType').value=text(row.designType); byId('entrySlipLock').value=text(row.slipLock); byId('entryHeatTreatCore').value=text(row.heatTreatCore)||'No'; byId('entryCoatingCheck').value=text(row.coatingCheck); byId('entryStatus').value=text(row.keyStatus)||'In Production'; } else { editorTitle.innerHTML='Add Product'; clearForm(); } }
"@
$new = @"
function openEditor(mode, index){editorPanel.className='editor-panel open'; editIndex=(typeof index==='number')?index:-1; setMessage('', ''); if(mode==='edit' && index>-1){var row=rows[index]; if(/^peak$/i.test(text(row.origin))){ row.origin='SZ'; } editorTitle.innerHTML='Edit Product'; byId('entryBrand').value=text(row.brand)||'Daewon'; byId('entryMoldNo').value=text(row.moldNo); byId('entrySapMoldNo').value=text(row.sapMoldNo); byId('entryRevision').value=text(row.rev); byId('entryDescription').value=text(row.description); byId('entryCustomer').value=text(row.customer); byId('entryOrigin').value=text(row.origin); byId('entrySitePn').value=text(row.sitePn); byId('entryDate').value=text(row.registrationDate); byId('entryTrayWeight').value=text(row.trayWeight); byId('entryMaterialDwg').value=text(row.materialDwg); byId('entryMaterialProduction').value=text(row.materialProduction); byId('entryMatrix').value=text(row.matrix); byId('entryCellCount').value=text(row.cellCount); byId('entryZGap').value=text(row.zGap); byId('entryDesignType').value=text(row.designType); byId('entrySlipLock').value=text(row.slipLock); byId('entryHeatTreatCore').value=text(row.heatTreatCore)||'No'; byId('entryCoatingCheck').value=text(row.coatingCheck); byId('entryStatus').value=text(row.keyStatus)||'In Production'; } else { editorTitle.innerHTML='Add Product'; clearForm(); } updateSlipLockWarning(); }
"@
$content = $content.Replace($old, $new)

$old = @"
function closeEditor(){editorPanel.className='editor-panel'; editIndex=-1; setMessage('', '');}
"@
$new = @"
function closeEditor(){editorPanel.className='editor-panel'; editIndex=-1; byId('entrySlipLock').parentNode.className='field'; setMessage('', '');}
"@
$content = $content.Replace($old, $new)

$old = @"
byId('entryHeatTreatCore').onchange=function(){ if(this.value==='Yes'){ byId('entryCoatingCheck').value='N/A'; } else if(!byId('entryCoatingCheck').value || byId('entryCoatingCheck').value==='N/A'){ byId('entryCoatingCheck').value='Progress Required'; } };
"@
$new = @"
byId('entryHeatTreatCore').onchange=function(){ if(this.value==='Yes'){ byId('entryCoatingCheck').value='N/A'; } else if(!byId('entryCoatingCheck').value || byId('entryCoatingCheck').value==='N/A'){ byId('entryCoatingCheck').value='Progress Required'; } };
byId('entrySlipLock').oninput=function(){ updateSlipLockWarning(); };
"@
$content = $content.Replace($old, $new)

$old = @"
byId('saveEntry').onclick=function(){var record=buildRecord(); if(!record){setMessage('Mold No and Description are required.', 'warn'); return;} if(editIndex>-1){rows[editIndex]=record; setMessage('Product updated.', 'ok');} else {rows.unshift(record); setMessage('Product added.', 'ok');} saveRows(); sync(); closeEditor();};
"@
$new = @"
byId('saveEntry').onclick=function(){var record=buildRecord(), dupIndex, savedIndex; if(!record){setMessage('Mold No and Description are required.', 'warn'); return;} dupIndex=findSlipLockDuplicateIndex(record.slipLock, editIndex); if(editIndex>-1){rows[editIndex]=record; savedIndex=editIndex;} else {rows.unshift(record); savedIndex=0;} saveRows(); sync(); if(dupIndex>-1){openEditor('edit', savedIndex); setMessage('Duplicate Slip Lock with ' + text(rows[dupIndex].moldNo) + '. Saved and highlighted in red.', 'dup'); return;} setMessage(editIndex>-1?'Product updated.':'Product added.', 'ok'); closeEditor();};
"@
$content = $content.Replace($old, $new)

Set-Content -LiteralPath $path -Value $content -Encoding UTF8
