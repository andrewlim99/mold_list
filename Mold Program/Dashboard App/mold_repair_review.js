(function (root) {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const resultKeys = ['modification','doneBy','repairType','beforeValue','afterValue','beforePhoto','afterPhoto'];
  const photoUrl = id => /^[a-f0-9]{32}$/.test(id || '') ? (root.MoldApp ? root.MoldApp.apiBase : '') + '/api/management/photo/' + id : '';
  function normalize(order) {
    if (order.urgent == null) order.urgent = false;
    if (order.requestedCompletionDate == null) order.requestedCompletionDate = '';
    order.items.forEach(item => {
      if (!item.id) item.id = root.crypto.randomUUID();
      for (const key of ['repairType','beforeValue','afterValue','beforePhoto','afterPhoto','roomBy','roomAt','qcBy','qcAt','postQcBy','postQcAt','waiveReason','waivedBy','waivedAt']) {
        if (item[key] == null) item[key] = '';
      }
      for (const key of ['roomApproved','qcApproved','postQcApproved','waived']) {
        if (item[key] == null) item[key] = false;
      }
    });
    for (const key of ['preQcLeaderBy','preQcLeaderAt','qcLeaderBy','qcLeaderAt']) {
      if (order[key] == null) order[key] = '';
    }
    for (const key of ['preQcLeaderApproved','qcLeaderApproved']) {
      if (order[key] == null) order[key] = false;
    }
    return order;
  }
  function invalidate(order, item) {
    item.roomApproved = false; item.qcApproved = false;
    item.roomAt = ''; item.qcAt = '';
    item.postQcApproved = false; item.postQcAt = '';
    order.preQcLeaderApproved = false; order.preQcLeaderAt = '';
    order.qcLeaderApproved = false; order.qcLeaderAt = '';
  }
  function error(order, final = false, phase = 'RepairQC') {
    if (!order || !order.items.length) return 'Save the Work Order and item results first.';
    for (const [index, item] of order.items.entries()) {
      const prefix = 'Item ' + (index + 1) + ': ';
      if (item.waived) {
        if (!String(item.waiveReason || '').trim() || !String(item.waivedBy || '').trim()) return prefix + 'enter a Waive reason and operator.';
        continue;
      }
      if (!['Visual','Dimensional'].includes(item.repairType)) return prefix + 'choose Visual or Dimensional.';
      if (!String(item.doneBy || '').trim()) return prefix + 'enter the mold room operator.';
      if (item.repairType === 'Visual' && (!item.beforePhoto || !item.afterPhoto)) return prefix + 'upload Before and After photos.';
      if (item.repairType === 'Dimensional' && (!String(item.beforeValue || '').trim() || !String(item.afterValue || '').trim())) return prefix + 'enter Before and After measurements.';
      if (item.repairType === 'Dimensional' && (!/[0-9]/.test(item.beforeValue) || !/[0-9]/.test(item.afterValue))) return prefix + 'measurements must contain numeric values.';
      if (!item.roomApproved || !String(item.roomBy || '').trim()) return prefix + 'Mold Room Leader confirmation is required.';
      if (phase !== 'Data' && (!item.qcApproved || !String(item.qcBy || '').trim())) return prefix + 'Repair QC item confirmation is required.';
      if ((phase === 'PostQC' || final) && (!item.postQcApproved || !String(item.postQcBy || '').trim())) return prefix + 'Post-injection QC item confirmation is required.';
    }
    if ((['PreApproval','PostQC'].includes(phase) || final) && (!order.preQcLeaderApproved || !String(order.preQcLeaderBy || '').trim())) return 'Repair QC Leader approval is required before injection.';
    if (final && (!order.qcLeaderApproved || !String(order.qcLeaderBy || '').trim())) return 'Post-injection QC Leader approval of the entire request is required.';
    return '';
  }
  function fields(item, index) {
    const input = (key, label, max = 200) => '<label class="mm-field">' + label + '<input data-review-field="' + key + '" maxlength="' + max + '" value="' + esc(item[key]) + '"></label>';
    const check = (key, label) => '<label class="mm-review-check"><input type="checkbox" data-review-field="' + key + '"' + (item[key] ? ' checked' : '') + '> ' + label + '</label>';
    const photo = when => '<label class="mm-field mm-photo-picker">' + when + ' Photo<span class="mm-photo-button">Upload Photo</span><input type="file" aria-label="' + when + ' Photo" data-review-photo="' + when.toLowerCase() + 'Photo" data-review-index="' + index + '" accept="image/jpeg,image/png"></label>' +
      (photoUrl(item[when.toLowerCase() + 'Photo']) ? '<a class="mm-review-photo" href="' + photoUrl(item[when.toLowerCase() + 'Photo']) + '" target="_blank" rel="noopener"><img src="' + photoUrl(item[when.toLowerCase() + 'Photo']) + '" alt="' + when + ' photo for item ' + (index + 1) + '"></a>' : '');
    return '<div class="mm-review-fields"><label class="mm-field">Request Type<select data-review-field="repairType"><option value="">Select type</option>' + ['Visual','Dimensional'].map(type => '<option' + (item.repairType === type ? ' selected' : '') + '>' + type + '</option>').join('') + '</select></label>' +
      '<div class="mm-review-results">' + ['Before','After'].map(when => '<section>' + (item.repairType === 'Dimensional' ? input(when.toLowerCase() + 'Value', when + ' Measurement (with unit)') : '') + photo(when) + '</section>').join('') + '</div>' +
      '<div class="mm-review-signoffs"><section>' + input('roomBy','Mold Room Leader',100) + check('roomApproved','Confirmed') + '<small>' + esc(item.roomAt) + '</small></section>' +
      '<section>' + input('qcBy','Repair QC Inspector',100) + check('qcApproved','Repair Item Checked') + '<small>' + esc(item.qcAt) + '</small></section>' +
      '<section>' + input('postQcBy','Post-injection QC Inspector',100) + check('postQcApproved','Injected Tray Checked') + '<small>' + esc(item.postQcAt) + '</small></section></div>' +
      '<div class="mm-review-waive">' + check('waived','Waive') + input('waivedBy','Waive By',100) + input('waiveReason','Waive Reason',1000) + '</div></div>';
  }
  function finalFields(order) {
    return '<div class="mm-review-final"><h3>Repair QC Leader Approval (Before Injection)</h3><label class="mm-field">Repair QC Leader<input data-order-field="preQcLeaderBy" maxlength="100" value="' + esc(order.preQcLeaderBy) + '"></label>' +
      '<label class="mm-review-check"><input type="checkbox" data-order-field="preQcLeaderApproved"' + (order.preQcLeaderApproved ? ' checked' : '') + '> Repair Approved for Injection</label><small>' + esc(order.preQcLeaderAt) + '</small></div>' +
      '<div class="mm-review-final"><h3>Post-injection QC Leader Approval</h3><label class="mm-field">QC Leader<input data-order-field="qcLeaderBy" maxlength="100" value="' + esc(order.qcLeaderBy) + '"></label>' +
      '<label class="mm-review-check"><input type="checkbox" data-order-field="qcLeaderApproved"' + (order.qcLeaderApproved ? ' checked' : '') + '> Entire Request Approved</label><small>' + esc(order.qcLeaderAt) + '</small></div>';
  }
  function collect(container, order) {
    container.querySelectorAll('[data-order-row]').forEach(row => {
      const item = order.items[Number(row.dataset.orderRow)];
      const before = JSON.stringify(item);
      const previous = { ...item };
      row.querySelectorAll('[data-review-field]').forEach(input => { item[input.dataset.reviewField] = input.type === 'checkbox' ? input.checked : input.value; });
      if (resultKeys.some(key => String(previous[key] || '') !== String(item[key] || '')) || previous.waived !== item.waived || String(previous.waiveReason || '') !== String(item.waiveReason || '') || String(previous.waivedBy || '') !== String(item.waivedBy || '')) invalidate(order, item);
      if (previous.roomApproved !== item.roomApproved || previous.roomBy !== item.roomBy) { item.qcApproved = false; item.qcAt = ''; }
      if (previous.qcApproved !== item.qcApproved || previous.qcBy !== item.qcBy) { item.postQcApproved = false; item.postQcAt = ''; }
      const preKeys = [...resultKeys,'roomApproved','roomBy','qcApproved','qcBy','waived','waiveReason','waivedBy'];
      if (preKeys.some(key => String(previous[key] || '') !== String(item[key] || ''))) { order.preQcLeaderApproved = false; order.preQcLeaderAt = ''; }
      if (before !== JSON.stringify(item)) { order.qcLeaderApproved = false; order.qcLeaderAt = ''; }
    });
  }
  function details(item) {
    return '<div class="mm-review-saved"><strong>' + esc(item.repairType || 'Type not set') + '</strong>' +
      '<div>Before: ' + esc(item.beforeValue || '-') + ' | After: ' + esc(item.afterValue || '-') + '</div>' +
      ['beforePhoto','afterPhoto'].map((key, index) => photoUrl(item[key]) ? '<a href="' + photoUrl(item[key]) + '" target="_blank" rel="noopener">' + (index ? 'After Photo' : 'Before Photo') + '</a> ' : '').join('') +
      '<div>Mold Room Leader: ' + esc(item.roomBy || '-') + ' | ' + (item.roomApproved ? 'Confirmed ' + esc(item.roomAt) : 'Pending') + '</div><div>QC: ' + esc(item.qcBy || '-') + ' | ' + (item.qcApproved ? 'Checked ' + esc(item.qcAt) : 'Pending') + '</div>' +
      '<div>Post-injection QC: ' + esc(item.postQcBy || '-') + ' | ' + (item.postQcApproved ? 'Checked ' + esc(item.postQcAt) : 'Pending') + '</div>' +
      (item.waived ? '<div>WAIVED by ' + esc(item.waivedBy) + ': ' + esc(item.waiveReason) + ' ' + esc(item.waivedAt) + '</div>' : '') + '</div>';
  }
  root.MoldRepairReview = { normalize, invalidate, error, fields, finalFields, collect, details };
})(window);
