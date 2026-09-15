(function (root) {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const blank = row => root.MoldRepairReview.normalize({ team: 'CE', requestedBy: '', rev: row.rev || '', reason: '',
    items: [{ modification: '', doneBy: '' }] });
  const copy = order => root.MoldRepairReview.normalize(JSON.parse(JSON.stringify(order)));
  const requesters = { CE: ['Joseph', 'Hugo', 'Ray', 'Rita', 'Joey', 'Jack'], FOL: ['Sophia', 'Yun', '\u963f\u6689'] };
  const summary = order => order.items.map((item, index) =>
    (index + 1) + '. ' + item.modification + (item.doneBy ? ' [Done by: ' + item.doneBy + ']' : '')).join('\n');
  function validate(order) {
    if (order.urgent && order.requestedCompletionDate && (!/^\d{4}-\d{2}-\d{2}$/.test(order.requestedCompletionDate) ||
      !Number.isFinite(Date.parse(order.requestedCompletionDate)) ||
      new Date(order.requestedCompletionDate).toISOString().slice(0, 10) !== order.requestedCompletionDate)) return 'Enter a valid requested completion date.';
    if (!order.requestNo && !['CE', 'FOL'].includes(order.team)) return 'Choose CE or FOL.';
    if (!order.requestedBy.trim()) return 'Enter Request By.';
    if (!order.requestNo && !(requesters[order.team] || []).includes(order.requestedBy)) return 'Choose Request By for the selected team.';
    if (!order.reason.trim()) return 'Enter Reason.';
    if (!order.items.length || order.items.length > 100) return 'Enter between 1 and 100 modification items.';
    if (order.items.some(item => !item.modification.trim())) return 'Enter a modification for every row or remove the empty row.';
    if (order.items.some(item => !['Visual','Dimensional'].includes(item.repairType))) return 'Choose Visual or Dimensional for every repair item.';
    if (order.items.some(item => item.waived && (!String(item.waiveReason || '').trim() || !String(item.waivedBy || '').trim()))) return 'Waive requires a reason and operator name.';
    if (summary(order).length > 20000) return 'Modification details exceed 20,000 characters.';
    return '';
  }
  function nextNumber(events, team, date = new Date()) {
    const prefix = root.MoldManagementCore.taiwanDay(date).replaceAll('-', '') + '-' + team;
    let max = 0;
    for (const event of events) {
      const number = String(event.workOrderNo || '');
      if (!number.startsWith(prefix)) continue;
      const suffix = number.slice(prefix.length);
      if (/^[0-9]+$/.test(suffix)) max = Math.max(max, Number(suffix));
    }
    return prefix + String(max + 1).padStart(2, '0');
  }
  function form(order, row, disabled, numberPreview) {
    root.MoldRepairReview.normalize(order);
    const input = (key, label, max, readonly) => '<label class="mm-field">' + label +
      '<input data-order-field="' + key + '" maxlength="' + max + '" value="' + esc(order[key]) + '"' +
      (readonly ? ' readonly' : '') + '></label>';
    return '<fieldset class="mm-order-form"' + (disabled ? ' disabled' : '') + '><legend>Repair Work Order</legend>' +
      '<div class="mm-order-meta"><label class="mm-field">Description<input readonly value="' + esc(order.description || row.description) + '"></label>' +
      '<label class="mm-field">Mold No.<input readonly value="' + esc(order.moldNo || row.moldNo) + '"></label>' +
      '<label class="mm-field">Request Date<input id="managementRequestDate" readonly value="' + esc(order.requestDate || root.MoldManagementCore.taiwanDay(new Date())) + '"></label>' +
      '<label class="mm-field">Request No.<input id="managementRequestNo" readonly title="' +
      (order.requestNo ? 'Saved request number' : 'Preview. The final number is assigned when saved.') + '" value="' + esc(order.requestNo || numberPreview) + '"></label>' +
      '<label class="mm-field">Team<select data-order-field="team"' + (order.requestNo ? ' disabled' : '') + '>' +
      [...new Set(['CE', 'FOL', ...(order.requestNo ? [order.team] : [])])].map(team =>
        '<option value="' + esc(team) + '"' + (team === order.team ? ' selected' : '') + '>' + esc(team) + '</option>').join('') +
      '</select></label><label class="mm-field">Request By<select data-order-field="requestedBy"><option value="">Select name</option>' +
      [...new Set([...(requesters[order.team] || []), ...(order.requestNo && order.requestedBy ? [order.requestedBy] : [])])].map(name =>
        '<option value="' + esc(name) + '"' + (name === order.requestedBy ? ' selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></label>' +
      input('rev', 'Rev.', 100, true) + input('reason', 'Reason', 500, false) +
      '<label class="mm-urgent-toggle"><input type="checkbox" data-order-field="urgent"' + (order.urgent ? ' checked' : '') + '> Urgent</label>' +
      '<label class="mm-field">Requested Completion Date<input type="text" placeholder="YYYY-MM-DD" inputmode="numeric" maxlength="10" autocomplete="off" data-order-field="requestedCompletionDate" value="' +
      esc(order.requestedCompletionDate) + '"' + (order.urgent ? '' : ' disabled') + '></label></div>' +
      '<div class="mm-order-items"><div class="mm-order-item mm-order-heading"><span>No.</span><span>Modification</span><span>Mold Team Technician</span><span></span></div>' +
      order.items.map((item, index) => '<div class="mm-order-item" data-order-row="' + index + '"><span class="mm-order-number">' + (index + 1) + '</span>' +
        '<textarea data-order-item="modification" aria-label="Modification ' + (index + 1) + '" maxlength="10000" rows="2">' + esc(item.modification) + '</textarea>' +
        '<input data-order-item="doneBy" aria-label="Done By ' + (index + 1) + '" maxlength="100" value="' + esc(item.doneBy) + '">' +
        '<button type="button" data-order-remove="' + index + '" title="Remove row" aria-label="Remove row ' + (index + 1) + '"' +
        (order.items.length === 1 ? ' disabled' : '') + '>&times;</button>' + root.MoldRepairReview.fields(item, index) + '</div>').join('') + '</div>' +
      '<button type="button" id="managementAddItem"' + (order.items.length >= 100 ? ' disabled' : '') + '>+ Add Row</button></fieldset>';
  }
  function collect(container, order) {
    container.querySelectorAll('[data-order-field]').forEach(input => { order[input.dataset.orderField] = input.type === 'checkbox' ? input.checked : input.value; });
    if (container.querySelector('[data-order-row]')) {
      const changed = [];
      order.items = Array.from(container.querySelectorAll('[data-order-row]'), row => {
        const item = order.items[Number(row.dataset.orderRow)];
        const modification = row.querySelector('[data-order-item="modification"]').value;
        const doneBy = row.querySelector('[data-order-item="doneBy"]').value;
        if (item.modification !== modification || item.doneBy !== doneBy) changed.push(Number(row.dataset.orderRow));
        return { ...item, modification, doneBy };
      });
      root.MoldRepairReview.collect(container, order);
      changed.forEach(index => root.MoldRepairReview.invalidate(order, order.items[index]));
    }
  }
  function table(order) {
    return (order.urgent ? '<p class="mm-urgent-label" style="color:#b91c1c;font-weight:700">URGENT | Requested Completion Date: ' +
      esc(order.requestedCompletionDate || 'Not set') + '</p>' : '') +
      '<table class="mm-saved-items"><thead><tr><th>No.</th><th>Modification</th><th>Mold Team Technician</th></tr></thead><tbody>' +
      order.items.map((item, index) => '<tr><td>' + (index + 1) + '</td><td>' + esc(item.modification) +
        root.MoldRepairReview.details(item) + '</td><td>' + esc(item.doneBy) + '</td></tr>').join('') + '</tbody></table>' +
        '<p>Mold QC: ' + esc(order.preQcLeaderBy || '-') + ' | ' + (order.preQcLeaderApproved ? 'Approved' : 'Pending') + ' ' + esc(order.preQcLeaderAt) + '</p>' +
        '<p>QC Comment: <span translate="no">' + esc(order.postQcComment || '-') + '</span></p>' +
        '<p>Post-injection QC Leader: ' + esc(order.qcLeaderBy || '-') + ' | ' + (order.qcLeaderApproved ? 'Approved' : 'Pending') + ' ' + esc(order.qcLeaderAt) + '</p>';
  }
  function printable(order, logo) {
    const approval = (title, lastTeam) => '<section class="approval-section"><h2>' + title + '</h2><table class="approval-signatures"><tbody><tr>' +
      ['FOL', 'MD', lastTeam].map(team => '<td>' + team + '</td>').join('') + '</tr></tbody></table></section>';
    const inspection = title => '<section class="approval-section"><h2>' + title + '</h2><table class="approval-inspection"><colgroup><col style="width:20%"><col style="width:10%"><col style="width:70%"></colgroup><tbody>' +
      '<tr><td>Pass</td><td class="check-cell"><span class="print-checkbox"></span></td><td rowspan="2" class="signature-cell">Signature <span class="signature-line"></span></td></tr>' +
      '<tr><td>Fail</td><td class="check-cell"><span class="print-checkbox"></span></td></tr></tbody></table></section>';
    const approvals = '<div class="work-order-approvals">' +
      approval('Pre-modification Approval \u52a0\u5de5\u524d\u78ba\u8a8d', 'QC') +
      inspection('Injection Test Results \u5c04\u51fa\u6e2c\u8a66\u7d50\u679c') +
      inspection('Sample Tray Inspection Results \u677f\u5b50\u6aa2\u67e5\u7d50\u679c') +
      approval('After Modification Release \u52a0\u5de5\u5f8c\u53ef\u751f\u7522', 'QA') + '</div>';
    const requestItems = '<table class="mm-saved-items"><thead><tr><th>No.</th><th>Modification</th><th>Request Type</th></tr></thead><tbody>' +
      order.items.map((item, index) => '<tr><td>' + (index + 1) + '</td><td translate="no">' + esc(item.modification) +
        '</td><td>' + esc(item.repairType || '') + '</td></tr>').join('') + '</tbody></table>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(order.requestNo) + '</title><style>' +
      '@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#000;margin:20px;width:190mm}' +
      '#printPage{position:relative;width:190mm;height:276mm;overflow:hidden}#printSheet{position:absolute;top:0;left:0;width:190mm;transform-origin:top left;display:flex;flex-direction:column}#printSheet>header,#printSheet>table,#printSheet>.work-order-approvals{flex-shrink:0}.handwriting-space{flex:1 0 144px;min-height:144px;display:flex;flex-direction:column;margin-top:-1px;border-top:1px solid #111}.handwriting-row{flex:1;min-height:24px;display:grid;grid-template-columns:7% 75% 18%;border-bottom:1px solid #111;border-left:1px solid #111}.handwriting-row span{border-right:1px solid #111}' +
      'header{display:grid;grid-template-columns:140px minmax(0,1fr) 140px;align-items:center;padding-bottom:12px}header img{width:140px;height:auto}h1{font-size:18px;font-weight:500;text-align:center;margin:0}' +
      'table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #111;padding:6px 5px;overflow-wrap:anywhere;white-space:pre-wrap;font-weight:400}' +
      '.meta th{width:19%;text-align:left}.meta td{width:31%}.mm-saved-items th:first-child{width:7%}.mm-saved-items th:last-child{width:18%}' +
      '.mm-saved-items td:first-child{text-align:center}.mm-saved-items td{vertical-align:top}.mm-saved-items{margin-top:-1px}' +
      '.work-order-approvals{margin-top:-1px;break-inside:avoid;page-break-inside:avoid}.approval-section{border:1px solid #111;margin-top:-1px;break-inside:avoid}' +
      '.approval-section h2{font-size:12px;line-height:18px;font-weight:400;text-align:center;margin:0;padding:3px;border-bottom:1px solid #ddd}' +
      '.approval-section td{border:0;padding:4px 6px}.approval-signatures td{width:33.333%;height:48px;vertical-align:top;border-right:1px solid #ddd}.approval-signatures td:last-child{border-right:0}' +
      '.approval-inspection td{height:26px}.approval-inspection tr:first-child td:not(.signature-cell){border-bottom:1px solid #ddd}.approval-inspection .check-cell{text-align:center;border-left:1px solid #ddd;border-right:1px solid #ddd}' +
      '.print-checkbox{display:inline-block;width:16px;height:16px;border:1px solid #000;vertical-align:middle}.signature-cell{text-align:right;vertical-align:bottom;white-space:nowrap}.signature-line{display:inline-block;width:145px;height:18px;border-bottom:1px solid #111;margin-left:8px;vertical-align:bottom}' +
      'thead{display:table-header-group}tr{break-inside:avoid}button{margin-bottom:16px;padding:8px 16px;cursor:pointer}@media print{body{margin:0}button{display:none}}' +
      '</style></head><body><button type="button" onclick="fitWorkOrder();window.print()">Print / Save PDF</button><main id="printPage"><div id="printSheet"><header><img src="' + esc(logo) +
      '" alt="PEAK"><h1>Mold Repair Work Order (' + esc(order.team) + ')</h1></header><table class="meta"><tbody>' +
      '<tr><th>Description</th><td>' + esc(order.description) + '</td><th>Request Date</th><td>' + esc(order.requestDate) + '</td></tr>' +
      '<tr><th>Mold No.</th><td>' + esc(order.moldNo) + '</td><th>Request No.</th><td>' + esc(order.requestNo) + '</td></tr>' +
      '<tr><th>Rev.</th><td>' + esc(order.rev) + '</td><th>Request By</th><td>' + esc(order.requestedBy) + '</td></tr>' +
      '<tr><th>Reason</th><td colspan="3">' + esc(order.reason) + '</td></tr>' +
      (order.urgent ? '<tr><th style="color:#b91c1c">URGENT</th><td>Yes</td><th>Requested Completion Date</th><td>' + esc(order.requestedCompletionDate || 'Not set') + '</td></tr>' : '') +
      '</tbody></table>' + requestItems + '<div class="handwriting-space" aria-hidden="true">' +
      Array.from({ length: 6 }, () => '<div class="handwriting-row"><span></span><span></span><span></span></div>').join('') + '</div>' + approvals + '</div></main>' +
      '<script>function fitWorkOrder(){var sheet=document.getElementById("printSheet"),page=document.getElementById("printPage");sheet.style.transform="none";sheet.style.height="auto";var scale=Math.min(1,(page.clientHeight-2)/sheet.scrollHeight,(page.clientWidth-2)/sheet.scrollWidth);sheet.style.height=((page.clientHeight-2)/scale)+"px";sheet.style.transform="scale("+scale+")";}' +
      'window.addEventListener("beforeprint",fitWorkOrder);window.addEventListener("load",fitWorkOrder);document.fonts.ready.then(fitWorkOrder);document.querySelectorAll("img").forEach(function(img){img.addEventListener("load",fitWorkOrder);img.addEventListener("error",fitWorkOrder);});fitWorkOrder();</script></body></html>';
  }
  function print(order) {
    const popup = window.open('', '_blank');
    if (!popup) throw new Error('Allow pop-ups to open the printable Work Order.');
    popup.opener = null;
    popup.document.open();
    popup.document.write(printable(order, new URL('assets/peak-logo.png', window.location.href).href));
    popup.document.close();
    if (root.MoldI18n) {
      root.MoldI18n.apply(popup.document);
      if (popup.fitWorkOrder) popup.fitWorkOrder();
    }
  }
  root.MoldWorkOrder = { blank, copy, summary, validate, nextNumber, form, collect, table, printable, print, requesters };
})(window);
