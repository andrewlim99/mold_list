(function (root) {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const resultKeys = ['modification','doneBy','repairType','beforeValue','afterValue','beforePhoto','afterPhoto','beforePhotos','afterPhotos'];
  const photos = (item, key) => Array.isArray(item[key + 's']) ? item[key + 's'] : item[key] ? [item[key]] : [];
  const photoUrl = id => /^[a-f0-9]{32}$/.test(id || '') ? (root.MoldApp ? root.MoldApp.apiBase : '') + '/api/management/photo/' + id : '';
  const uuid = () => {
    const crypto = root.crypto || root.msCrypto;
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (crypto && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  };
  function normalize(order) {
    if (order.postQcComment == null) order.postQcComment = '';
    if (order.urgent == null) order.urgent = false;
    if (order.requestedCompletionDate == null) order.requestedCompletionDate = '';
    order.items.forEach(item => {
      for (const [prefix, legacy] of [['mold','room'],['moldQc','qc']]) {
        if (item[prefix + 'Checked'] == null) item[prefix + 'Checked'] = !!item[legacy + 'Approved'];
        if (item[prefix + 'CheckedBy'] == null) item[prefix + 'CheckedBy'] = item[legacy + 'By'] || '';
        if (item[prefix + 'CheckedAt'] == null) item[prefix + 'CheckedAt'] = item[legacy + 'At'] || '';
      }
      for (const key of ['beforePhoto','afterPhoto']) {
        item[key + 's'] = [...new Set(photos(item, key))];
        item[key] = item[key + 's'][0] || '';
      }
      if (!item.id) item.id = uuid();
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
    item.moldChecked = false; item.moldQcChecked = false;
    item.moldCheckedAt = ''; item.moldQcCheckedAt = '';
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
      if (!String(item.doneBy || '').trim()) return prefix + 'enter the mold team technician.';
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
    const photo = when => {
      const key = when.toLowerCase() + 'Photo', ids = photos(item, key);
      return '<label class="mm-field mm-photo-picker">' + when + ' Photo<span class="mm-photo-button">Upload Photo</span><small class="mm-photo-status">' + (ids.length ? 'Photo uploaded' : 'No photo selected') + '</small><input type="file" multiple style="position:absolute;width:1px;height:1px;padding:0;clip-path:inset(50%);overflow:hidden" aria-label="' + when + ' Photo" data-review-photo="' + key + '" data-review-index="' + index + '" accept="image/jpeg,image/png"></label>' +
        '<div class="mm-photo-gallery">' + ids.map((id, photoIndex) => '<div><a class="mm-review-photo" href="' + photoUrl(id) + '" target="_blank" rel="noopener"><img src="' + photoUrl(id) + '" alt="' + when + ' Photo ' + (photoIndex + 1) + '"></a><button type="button" data-photo-remove="' + photoIndex + '" data-photo-key="' + key + '" data-photo-item="' + index + '" title="Remove photo" aria-label="Remove photo">&times;</button></div>').join('') + '</div>';
    };
    return '<div class="mm-review-fields"><label class="mm-field">Request Type<select data-review-field="repairType"><option value="">Select type</option>' + ['Visual','Dimensional'].map(type => '<option' + (item.repairType === type ? ' selected' : '') + '>' + type + '</option>').join('') + '</select></label>' +
      '<div class="mm-review-results">' + ['Before','After'].map(when => '<section>' + (item.repairType === 'Dimensional' ? input(when.toLowerCase() + 'Value', when + ' Measurement (with unit)') : '') + photo(when) + '</section>').join('') + '</div>' +
      '<div class="mm-item-checks">' + [['mold','Mold Leader'],['moldQc','Mold QC']].map(([prefix, label]) =>
        '<section>' + input(prefix + 'CheckedBy', label, 100) + check(prefix + 'Checked', 'Item Checked') +
        '<time class="mm-item-check-date" title="Taiwan time (UTC+08:00)">' + (item[prefix + 'CheckedAt'] ?
          esc(root.MoldManagementCore.taiwanDay(item[prefix + 'CheckedAt']) + ' ' + new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).format(new Date(item[prefix + 'CheckedAt']))) : '-') +
        '</time></section>').join('') + '</div>' +
      '<div class="mm-review-waive">' + check('waived','Waive') + input('waivedBy','Waive By',100) + input('waiveReason','Waive Reason',1000) + '</div></div>';
  }
  function preFields(order) {
    return '<div class="mm-review-final"><h3>Repair QC Leader Approval (Before Injection)</h3><label class="mm-field">Repair QC Leader<input data-order-field="preQcLeaderBy" maxlength="100" value="' + esc(order.preQcLeaderBy) + '"></label>' +
      '<label class="mm-review-check"><input type="checkbox" data-order-field="preQcLeaderApproved"' + (order.preQcLeaderApproved ? ' checked' : '') + '> Repair Approved for Injection</label><small>' + esc(order.preQcLeaderAt) + '</small></div>';
  }
  function finalFields(order) {
    const items = order.items.filter(item => !item.waived);
    const names = [...new Set(items.map(item => item.postQcBy || ''))];
    const inspector = names.length === 1 ? names[0] : '';
    return '<div class="mm-review-final"><h3>Post-injection QC Inspector</h3>' +
      '<label class="mm-field">Post-injection QC Inspector<input data-review-field="postQcBy" maxlength="100" value="' + esc(inspector) + '"></label>' +
      '<label class="mm-review-check"><input type="checkbox" data-review-field="postQcApproved"' + (items.length && items.every(item => item.postQcApproved) ? ' checked' : '') +
      '> All Items Checked</label><label class="mm-field">QC Comment<textarea data-post-qc-comment maxlength="2000" rows="3">' + esc(order.postQcComment) + '</textarea></label></div>' +
      '<div class="mm-review-final"><h3>Post-injection QC Leader Approval</h3><label class="mm-field">QC Leader<input data-order-field="qcLeaderBy" maxlength="100" value="' + esc(order.qcLeaderBy) + '"></label>' +
      '<label class="mm-review-check"><input type="checkbox" data-order-field="qcLeaderApproved"' + (order.qcLeaderApproved ? ' checked' : '') + '> Entire Request Approved</label><small>' + esc(order.qcLeaderAt) + '</small></div>';
  }
  function collect(container, order) {
    const items = order.items.filter(item => !item.waived);
    const names = [...new Set(items.map(item => item.postQcBy || ''))];
    const inspector = container.querySelector('[data-review-field="postQcBy"]');
    const checked = container.querySelector('[data-review-field="postQcApproved"]');
    const groupChanged = inspector && checked && (inspector.value !== (names.length === 1 ? names[0] : '') ||
      checked.checked !== !!(items.length && items.every(item => item.postQcApproved)));
    const comment = container.querySelector('[data-post-qc-comment]');
    if (comment && comment.value !== order.postQcComment) {
      order.postQcComment = comment.value;
      order.qcLeaderApproved = false; order.qcLeaderAt = '';
    }
    container.querySelectorAll('[data-order-row]').forEach(row => {
      const item = order.items[Number(row.dataset.orderRow)];
      const before = JSON.stringify(item);
      const previous = { ...item };
      row.querySelectorAll('[data-review-field]').forEach(input => { item[input.dataset.reviewField] = input.type === 'checkbox' ? input.checked : input.value; });
      if (previous.moldChecked !== item.moldChecked || previous.moldCheckedBy !== item.moldCheckedBy) {
        item.moldCheckedAt = ''; item.moldQcChecked = false; item.moldQcCheckedAt = '';
        item.roomApproved = false; item.roomAt = ''; item.qcApproved = false; item.qcAt = '';
      }
      if (previous.moldQcChecked !== item.moldQcChecked || previous.moldQcCheckedBy !== item.moldQcCheckedBy) {
        item.moldQcCheckedAt = ''; item.qcApproved = false; item.qcAt = '';
      }
      if (groupChanged && !item.waived) {
        item.postQcBy = inspector.value;
        item.postQcApproved = checked.checked;
      }
      if (resultKeys.some(key => String(previous[key] || '') !== String(item[key] || '')) || previous.waived !== item.waived || String(previous.waiveReason || '') !== String(item.waiveReason || '') || String(previous.waivedBy || '') !== String(item.waivedBy || '')) invalidate(order, item);
      if (previous.roomApproved !== item.roomApproved || previous.roomBy !== item.roomBy) { item.qcApproved = false; item.qcAt = ''; }
      if (previous.qcApproved !== item.qcApproved || previous.qcBy !== item.qcBy) { item.postQcApproved = false; item.postQcAt = ''; }
      const preKeys = [...resultKeys,'moldChecked','moldCheckedBy','moldQcChecked','moldQcCheckedBy','roomApproved','roomBy','qcApproved','qcBy','waived','waiveReason','waivedBy'];
      if (preKeys.some(key => String(previous[key] || '') !== String(item[key] || ''))) { order.preQcLeaderApproved = false; order.preQcLeaderAt = ''; }
      if (before !== JSON.stringify(item)) { order.qcLeaderApproved = false; order.qcLeaderAt = ''; }
    });
  }
  function details(item) {
    return '<div class="mm-review-saved"><strong>' + esc(item.repairType || 'Type not set') + '</strong>' +
      '<div>Before: ' + esc(item.beforeValue || '-') + ' | After: ' + esc(item.afterValue || '-') + '</div>' +
      [['mold','Mold Leader'],['moldQc','Mold QC']].map(([prefix,label]) => '<div>' + label + ': ' + esc(item[prefix + 'CheckedBy'] || '-') + ' | ' +
        (item[prefix + 'Checked'] ? 'Checked ' + esc(item[prefix + 'CheckedAt']) : 'Pending') + '</div>').join('') +
      ['beforePhoto','afterPhoto'].map((key, index) => photos(item, key).map((id, photoIndex) => '<a href="' + photoUrl(id) + '" target="_blank" rel="noopener">' + (index ? 'After Photo' : 'Before Photo') + ' ' + (photoIndex + 1) + '</a> ').join('')).join('') +
      '<div>Mold Room Leader: ' + esc(item.roomBy || '-') + ' | ' + (item.roomApproved ? 'Confirmed ' + esc(item.roomAt) : 'Pending') + '</div><div>QC: ' + esc(item.qcBy || '-') + ' | ' + (item.qcApproved ? 'Checked ' + esc(item.qcAt) : 'Pending') + '</div>' +
      '<div>Post-injection QC: ' + esc(item.postQcBy || '-') + ' | ' + (item.postQcApproved ? 'Checked ' + esc(item.postQcAt) : 'Pending') + '</div>' +
      (item.waived ? '<div>WAIVED by ' + esc(item.waivedBy) + ': ' + esc(item.waiveReason) + ' ' + esc(item.waivedAt) + '</div>' : '') + '</div>';
  }
  root.MoldRepairReview = { normalize, invalidate, error, fields, preFields, finalFields, collect, details };
})(window);
