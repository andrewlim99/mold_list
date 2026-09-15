(function () {
  'use strict';
  const app = window.MoldApp, core = window.MoldManagementCore, workOrders = window.MoldWorkOrder;
  if (!app || !core || !workOrders) return;
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const filters = ['PM Waiting', 'PM In Progress', 'Repair Waiting', ...core.stages, 'Urgent'];
  const machineDefinitions = [['cnc3','CNC 3','Skin Down'],['edm1','EDM 1','FAI, Repair'],['edm2','EDM 2','FAI, Repair'],['edm3','EDM 3','Skin Down'],
    ['assembly','Assemble','Processing Table'],['welding','Welding','Laser Welding'],['cnc1','CNC 1','FAI, Repair'],['cnc2','CNC 2','EDM Head'],['pm','PM','Ultrasonic Cleaning'],['outsourcing','Outsourcing','External Repair'],['repairqc','Repair QC Approval','Before Injection'],['injection','Tray Injection','Injection Queue'],['trayqc','QC Final Approval','After Injection']];
  let enabled = false, events = [], loaded = false, filter = 'All', busy = false, selected = null;
  let reportDay = core.taiwanDay(new Date()), reportStage = 'All';
  let category = 'pm', returnFocus = null, draft = null;
  let orderFormAvailable = false;
  let reviewAvailable = false;
  const defaultDraft = () => ({ pm: '', pmTeam: 'CE', pmRequestedBy: '', repair: '', workOrderNo: '', order: null, orderBase: '' });
  const orderDirty = () => draft && draft.order && JSON.stringify(draft.order) !== draft.orderBase;
  function resetOrderDraft() {
    const job = core.active(events, selected.identity, 'repair');
    const saved = job && job.events.filter(event => event.workOrder).slice(-1)[0];
    draft.order = saved ? workOrders.copy(saved.workOrder) : workOrders.blank(selected.row);
    draft.orderBase = JSON.stringify(draft.order);
  }
  const time = value => value ? new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(new Date(value)) : '-';
  const uuid = () => {
    const crypto = window.crypto || window.msCrypto;
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (crypto && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  };

  const nav = document.createElement('nav');
  nav.className = 'management-nav';
  nav.setAttribute('aria-label', 'Mold workspace');
  // Lucide layout-dashboard and wrench icons.
  const icon = content => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + content + '</svg>';
  nav.innerHTML = '<button type="button" id="moldListMode" aria-pressed="true" aria-label="Mold List Dashboard" title="Mold List Dashboard">' +
    icon('<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>') +
    '</button><button type="button" id="managementMode" aria-pressed="false" aria-label="Mold Management" title="Mold Management">' +
    icon('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>') + '</button>';
  const title = document.querySelector('.hero-panel h1');
  const dashboardTitle = title.textContent;
  const titleRow = document.createElement('div');
  titleRow.className = 'mold-title-row';
  title.before(titleRow);
  titleRow.append(title, nav);
  const daily = document.createElement('section');
  daily.id = 'managementDaily';
  daily.hidden = true;
  daily.innerHTML = '<div class="mm-daily-toolbar"><h2>Daily Process Completions</h2>' +
    '<label for="managementReportDay">Date (Taiwan)</label>' +
    '<button id="managementPreviousDay" type="button" title="Previous day" aria-label="Previous day">&lsaquo;</button>' +
    '<input id="managementReportDay" type="text" inputmode="numeric" aria-label="Completion date, YYYY-MM-DD" placeholder="YYYY-MM-DD" value="' + reportDay + '">' +
    '<button id="managementNextDay" type="button" title="Next day" aria-label="Next day">&rsaquo;</button>' +
    '<button id="managementToday" type="button">Today</button>' +
    '<select id="managementReportStage" aria-label="Completed process">' + ['All', 'PM', ...core.stages].map(value =>
      '<option value="' + value + '">' + (value === 'All' ? 'All Processes' : value) + '</option>').join('') +
    '</select><button id="managementReportExport" type="button">Download Excel</button>' +
    '<button id="managementReportSummary" type="button" title="Summary" aria-label="Summary" aria-haspopup="dialog">' +
    icon('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>') + '</button></div>' +
    '<div id="managementReportError" role="status"></div><div id="managementReportCount" class="mm-daily-count" role="status"></div>' +
    '<div id="managementReportRows" class="mm-daily-rows"></div>';
  document.querySelector('.hero').after(daily);
  const workspace = document.createElement('div');
  workspace.id = 'managementWorkspace';
  const listArea = document.createElement('div');
  listArea.id = 'managementListArea';
  const boardArea = document.createElement('section');
  boardArea.id = 'managementBoardArea';
  boardArea.setAttribute('aria-label', 'Mold room layout and status board');
  boardArea.innerHTML = '<h2 class="mm-layout-title">Mold Repair Status</h2>' +
    '<div class="mm-room-scroll"><div class="mm-room-layout">' +
    machineDefinitions.map(item =>
      '<section class="mm-room-machine mm-room-' + item[0] + '" data-machine-name="' + item[1] + '" aria-label="' + item[1] + '"><header><button type="button" class="mm-machine-open" aria-haspopup="dialog" aria-label="View ' + item[1] + ' items"><strong>' + item[1] +
      '</strong><span>' + item[2] + '</span></button></header><div class="mm-machine-items" data-machine="' + item[1] + '"></div></section>').join('') +
      '</div></div><section class="mm-machine-queue"><h3>Unassigned</h3><div id="managementMachineQueue"></div></section>';
  const machineDialog = document.createElement('dialog');
  machineDialog.id = 'machineItemsDialog';
  machineDialog.setAttribute('aria-labelledby', 'machineItemsTitle');
  machineDialog.innerHTML = '<header class="mm-header"><h2 id="machineItemsTitle"></h2><button type="button" class="mm-close" aria-label="Close" title="Close">&times;</button></header><div id="machineItemsBody"></div>';
  document.body.appendChild(machineDialog);
  let viewedMachine = '', machineLists = new Map();
  machineDialog.querySelector('.mm-close').onclick = () => machineDialog.close();
  machineDialog.addEventListener('click', event => {
    const button = event.target.closest('[data-machine-identity]');
    if (!button) return;
    const row = app.getRows().find(item => core.identity(item) === button.dataset.machineIdentity);
    if (row) { machineDialog.close(); open(row, null, button.dataset.kind, button.dataset.assignment); }
  });
  function renderMachineDetails() {
    if (!viewedMachine) return;
    $('machineItemsTitle').textContent = viewedMachine;
    const lists = machineLists.get(viewedMachine) || { running: [], waiting: [] };
    $('machineItemsBody').innerHTML = loaded ? [['In Progress', lists.running], ['Waiting', lists.waiting]].map(([label, items]) =>
      '<section><h3>' + label + ' <span>' + items.length + '</span></h3>' + (items.join('') || '<p class="mm-machine-empty">No items</p>') + '</section>').join('') : '<p class="mm-machine-empty">Management history unavailable</p>';
  }
  boardArea.onclick = event => {
    const button = event.target.closest('[data-machine-identity]');
    if (busy) return;
    if (button) {
      const row = app.getRows().find(item => core.identity(item) === button.dataset.machineIdentity);
      if (row) open(row, null, button.dataset.kind, button.dataset.assignment);
      return;
    }
    const box = event.target.closest('[data-machine-name]');
    if (box) {
      viewedMachine = box.dataset.machineName;
      renderMachineDetails();
      machineDialog.showModal();
      refresh();
    }
  };
  daily.before(workspace);
  workspace.append(listArea, boardArea);
  listArea.append(daily, document.querySelector('.filters'), document.querySelector('.toolbar'), document.querySelector('.table-panel'));
  const connection = document.createElement('div');
  connection.id = 'managementConnection';
  connection.setAttribute('role', 'status');
  daily.prepend(connection);
  const dialog = document.createElement('dialog');
  dialog.id = 'managementDialog';
  dialog.setAttribute('aria-labelledby', 'managementTitle');
  dialog.innerHTML = '<header class="mm-header"><div><h2 id="managementTitle">Mold Management</h2>' +
    '<div id="managementProduct" class="mm-subtitle"></div></div>' +
    '<section id="managementApprovals"></section><button type="button" id="managementClose" class="mm-close" title="Close" aria-label="Close">&times;</button></header>' +
    '<div class="mm-content"><div class="mm-tabs" role="tablist" aria-label="Management category">' +
    '<button id="managementPmTab" role="tab" aria-controls="managementBody" aria-selected="true">Mold PM</button>' +
    '<button id="managementRepairTab" role="tab" aria-controls="managementBody" aria-selected="false">Mold Modification / Repair</button>' +
    '</div><div id="managementMessage" class="mm-message" role="status"></div>' +
    '<section id="managementBody" role="tabpanel" aria-labelledby="managementPmTab"></section>' +
    '<section class="mm-history"><div id="managementHistory"></div></section></div>';
  document.body.appendChild(dialog);
  const photoDialog = document.createElement('dialog');
  photoDialog.id = 'managementPhotoPreview';
  photoDialog.setAttribute('aria-label', 'Photo Preview');
  photoDialog.innerHTML = '<div class="mm-photo-preview-head"><strong>Photo Preview</strong><button type="button" title="Close photo" aria-label="Close photo">&times;</button></div><img alt="">';
  document.body.appendChild(photoDialog);
  photoDialog.querySelector('button').onclick = () => photoDialog.close();
  photoDialog.addEventListener('cancel', event => {
    event.preventDefault();
    event.stopPropagation();
    photoDialog.close();
  });
  photoDialog.addEventListener('close', () => photoDialog.querySelector('img').removeAttribute('src'));
  $('managementBody').addEventListener('click', event => {
    const link = event.target.closest('a.mm-review-photo');
    if (!link) return;
    event.preventDefault();
    const preview = photoDialog.querySelector('img');
    preview.src = link.href;
    preview.alt = link.querySelector('img').alt;
    photoDialog.showModal();
  });
  const completionDialog = document.createElement('dialog');
  completionDialog.id = 'managementCompletionDialog';
  completionDialog.setAttribute('aria-labelledby', 'managementCompletionTitle');
  completionDialog.innerHTML = '<header class="mm-header"><h2 id="managementCompletionTitle"></h2><button type="button" class="mm-close" aria-label="Close" title="Close">&times;</button></header><div id="managementCompletionCount"></div><div id="managementCompletionRows"></div>';
  document.body.appendChild(completionDialog);
  completionDialog.querySelector('.mm-close').onclick = () => completionDialog.close();
  completionDialog.onclick = event => {
    const button = event.target.closest('[data-report-identity]');
    if (!button) return;
    const row = app.getRows().find(item => core.identity(item) === button.dataset.reportIdentity);
    if (row) { completionDialog.close(); open(row, null, reportStage === 'PM' ? 'pm' : 'repair'); }
    else $('managementCompletionCount').textContent = 'This mold is no longer in the current Mold List. Its completion record is retained.';
  };
  function renderCompletionDialog() {
    $('managementCompletionTitle').textContent = reportStage + ' Completed | ' + reportDay;
    $('managementCompletionCount').textContent = $('managementReportCount').textContent;
    $('managementCompletionRows').innerHTML = $('managementReportRows').innerHTML;
  }

  const summaryDialog = document.createElement('dialog');
  summaryDialog.id = 'managementSummaryDialog';
  summaryDialog.setAttribute('aria-labelledby', 'managementSummaryTitle');
  summaryDialog.innerHTML = '<header class="mm-header"><h2 id="managementSummaryTitle"></h2><button type="button" class="mm-close" title="Close" aria-label="Close">&times;</button></header><div id="managementSummaryCount" role="status"></div><div id="managementSummaryGrid" class="mm-room-layout"></div>';
  document.body.appendChild(summaryDialog);
  summaryDialog.querySelector('.mm-close').onclick = () => summaryDialog.close();
  summaryDialog.onclick = event => {
    const button = event.target.closest('[data-summary-event]');
    if (!button) return;
    const record = events.find(item => item.id === button.dataset.summaryEvent);
    const row = record && app.getRows().find(item => core.identity(item) === record.identity);
    if (row) { summaryDialog.close(); open(row, null, record.kind, record.assignmentId || 'main'); }
    else $('managementSummaryCount').textContent = 'This mold is no longer in the current Mold List. Its completion record is retained.';
  };
  function renderSummaryDialog() {
    $('managementSummaryTitle').textContent = 'Daily Completion Summary | ' + reportDay + ' | ' + (reportStage === 'All' ? 'All Processes' : reportStage);
    const completed = loaded ? (reportStage === 'PM' ? [] : core.completions(events, reportDay, reportStage))
      .concat(['All','PM'].includes(reportStage) ? core.completions(events, reportDay, 'All', 'pm') : [])
      .sort((a, b) => new Date(b.at) - new Date(a.at)) : [];
    const definitions = machineDefinitions.filter(item => reportStage === 'All' || core.processOf(item[1]) === reportStage);
    const groups = new Map(definitions.map(item => [item[1], []]));
    for (const record of completed) {
      const machine = record.kind === 'pm' ? 'PM' : record.completedEquipment;
      const key = groups.has(machine) ? machine : (record.completedStage + ' / Unspecified machine');
      if (!groups.has(key)) { groups.set(key, []); definitions.push(['unspecified', key, '']); }
      groups.get(key).push(record);
    }
    const rows = new Map(app.getRows().map(row => [core.identity(row), row]));
    $('managementSummaryCount').textContent = loaded ? new Set(completed.map(item => item.identity)).size + ' molds | ' + completed.length + ' completions' : 'Management history unavailable';
    $('managementSummaryGrid').innerHTML = definitions.map(([style, name, description]) => {
      const records = groups.get(name);
      return '<section class="mm-room-machine mm-room-' + style + '" data-summary-machine="' + esc(name) + '"><header><h3>' + esc(name) +
        '</h3><p>' + esc(description) + '</p><div class="mm-summary-total">Completed <strong>' + records.length + '</strong></div></header><div class="mm-machine-items">' +
        (records.map(record => {
          const row = rows.get(record.identity) || {};
          return '<button type="button" class="mm-machine-item" data-summary-event="' + esc(record.id) + '"><strong>' + esc(record.moldNo || row.moldNo || record.identity) +
            '</strong><span>' + esc(record.description || row.description) + '</span><small>' + esc(time(record.at)) + '</small></button>';
        }).join('') || '<p class="mm-machine-empty">' + (loaded ? 'No completions' : 'Unavailable') + '</p>') + '</div></section>';
    }).join('');
  }
  $('managementReportSummary').onclick = () => { renderSummaryDialog(); summaryDialog.showModal(); refresh(); };

  function message(value, success) {
    $('managementMessage').textContent = value || '';
    $('managementMessage').className = 'mm-message' + (success ? ' success' : '');
  }
  async function api(path, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(app.apiBase + path, {
        method: payload ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        headers: payload ? { 'Content-Type': 'application/json; charset=utf-8' } : {},
        body: payload ? JSON.stringify(payload) : undefined
      });
      const content = await response.text();
      let data;
      try { data = JSON.parse(content); } catch (_) { throw new Error('Management server is unavailable. Restart start_mold_shared_server.cmd.'); }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Management request failed.');
      return data;
    } finally { clearTimeout(timer); }
  }
  async function refresh() {
    try {
      const data = await api('/api/management');
      if (!Array.isArray(data.events)) throw new Error('Management history response is invalid.');
      events = data.events;
      orderFormAvailable = data.workOrderFormVersion === 1;
      reviewAvailable = data.repairReviewVersion === 1;
      if (selected && draft) { collectDraft(); if (!orderDirty()) resetOrderDraft(); }
      loaded = true;
      $('managementConnection').dataset.error = 'false';
      if (enabled) $('managementConnection').textContent = 'Management connected';
      if (enabled) app.render();
      return true;
    } catch (error) {
      loaded = false;
      $('managementConnection').dataset.error = 'true';
      if (enabled) { $('managementConnection').textContent = error.message; renderCards(); }
      if (dialog.open) message(error.message);
      return false;
    }
  }
  function renderCards() {
    if (!enabled) return;
    renderMachineBoard();
    $('cards').innerHTML = filters.map((name, index) => {
      const count = loaded ? app.getRows().filter(row => core.matches(events, core.identity(row), name)).length : '-';
      const isProcess = core.stages.includes(name);
      const isPM = name === 'PM In Progress';
      const processJobs = isProcess && loaded ? app.getRows().flatMap(row => {
        const job = core.active(events, core.identity(row), 'repair');
        return job ? job.assignments : [];
      }).filter(item => item.stage === name) : [];
      const processNote = loaded ? processJobs.filter(job => job.processStatus === 'In Progress').length + ' working / ' +
        processJobs.filter(job => job.processStatus === 'Waiting').length + ' waiting' : 'Unavailable';
      const completed = core.completions(events, reportDay, isPM ? 'All' : name, isPM ? 'pm' : 'repair');
      const doneCount = loaded ? new Set(completed.map(event => event.identity)).size : '-';
      const notes = ['Awaiting PM In', 'Awaiting PM Out', 'Awaiting a process'];
      return '<article class="card' + (name === 'Urgent' ? ' mm-urgent-card' : '') + (filter === name ? ' is-active' : '') + '">' +
        '<button class="mm-card-current" type="button" aria-pressed="' + (filter === name) + '" data-management-filter="' + name + '">' +
        '<span class="card-label">' + name + '</span><span class="card-value">' + count + '</span>' +
        '<span class="card-note">' + (name === 'Urgent' ? 'Open urgent repairs' : isPM ? (notes[index] + ' / PM completed today: ' + doneCount) : (isProcess ? processNote : notes[index])) + '</span></button>' +
        (isProcess || isPM ? '<button type="button" class="mm-card-done" data-completed-process="' + (isPM ? 'PM' : name) + '" aria-label="' + name +
          ' completed molds on ' + reportDay + '"><span>Completed <strong>' + doneCount + '</strong></span><small>' + reportDay + '</small></button>' : '') + '</article>';
    }).join('');
    renderDaily();
    if (completionDialog.open) renderCompletionDialog();
    if (summaryDialog.open) renderSummaryDialog();
  }

  function renderMachineBoard() {
    const machines = new Map([...boardArea.querySelectorAll('[data-machine]')].map(element => [element.dataset.machine, []]));
    machineLists = new Map([...machines.keys()].map(name => [name, { running: [], waiting: [] }]));
    const waiting = [];
    const rows = new Map(app.getRows().map(row => [core.identity(row), row]));
    if (loaded) rows.forEach((row, key) => {
      ['repair', 'pm'].forEach(kind => {
        const job = core.active(events, key, kind);
        if (!job) return;
        (kind === 'pm' ? [job] : job.assignments).forEach(assignment => {
        const equipment = kind === 'pm' ? 'PM' : assignment.equipment;
        const running = kind === 'pm' ? job.stage === 'In Progress' : assignment.processStatus === 'In Progress';
        const urgent = kind === 'repair' && job.urgent;
        const item = '<button type="button" class="mm-machine-item' + (urgent ? ' mm-urgent-item' : '') + '" data-machine-identity="' + esc(key) + '" data-kind="' + kind + '" data-assignment="' + esc(assignment.assignmentId || 'main') + '">' +
          '<strong>' + esc(row.moldNo) + '</strong><span>' + esc(row.description) + '</span>' +
          (urgent ? '<small>URGENT' + (job.requestedCompletionDate ? ' | Due: ' + esc(job.requestedCompletionDate) : '') + '</small>' : '') + '</button>';
        if (machines.has(equipment)) {
          machineLists.get(equipment)[running ? 'running' : 'waiting'].push(item);
          if (running) machines.get(equipment).push(item);
        } else waiting.push('<div class="mm-queue-item"><span>' + esc(equipment || (kind === 'pm' ? 'PM' : assignment.stage)) +
          (running && !equipment ? ' / Assign equipment' : ' / Waiting') + '</span>' + item + '</div>');
        });
      });
    });
    boardArea.querySelectorAll('[data-machine]').forEach(element => {
      element.innerHTML = loaded ? machines.get(element.dataset.machine).join('') || '<p class="mm-machine-empty">Idle</p>' : '<p class="mm-machine-empty">Unavailable</p>';
    });
    $('managementMachineQueue').innerHTML = loaded ? waiting.join('') || '<p class="mm-machine-empty">No waiting items</p>' : '<p class="mm-machine-empty">Unavailable</p>';
    if (machineDialog.open) renderMachineDetails();
  }
  function reportRecords() {
    const molds = new Map(app.getRows().map(row => [core.identity(row), row]));
    const reportKind = reportStage === 'PM' ? 'pm' : 'repair';
    const reportFilter = reportStage === 'PM' ? 'All' : reportStage;
    return core.completions(events, reportDay, reportFilter, reportKind).map(event => {
      const row = molds.get(event.identity) || {};
      const completedStage = event.completedEquipment || event.completedStage || (event.kind === 'pm' ? 'PM' : '-');
      return { event: Object.assign({}, event, { completedStage }), moldNo: event.moldNo || row.moldNo || event.identity.split('|').slice(1).join('|'),
        description: event.description || row.description || '', customer: event.customer || row.customer || '' };
    });
  }
  function renderDaily() {
    if (!enabled) return;
    const records = loaded ? reportRecords() : [];
    const recordsLabel = reportStage === 'PM' ? 'PM completions' : 'process completions';
    const recordsMessage = reportStage === 'PM' ? 'No PM completions on ' : 'No process completions on ';
    $('managementReportCount').textContent = loaded ? new Set(records.map(record => record.event.identity)).size +
      ' molds | ' + records.length + ' ' + recordsLabel : 'Management history unavailable';
    $('managementReportExport').disabled = !loaded || !records.length;
    $('managementReportRows').innerHTML = records.length ? '<div role="table" aria-label="Completed products">' +
      '<div class="mm-daily-row mm-daily-heading" role="row">' + ['Process','Mold No','Description','Customer','Completed At','Work Order','Details'].map(label =>
        '<div role="columnheader">' + label + '</div>').join('') + '</div>' + records.map(record =>
        '<div class="mm-daily-row" role="row"><div role="cell">' + esc(record.event.completedStage) +
        '</div><div role="cell"><button class="mm-report-mold" type="button" data-report-identity="' + esc(record.event.identity) + '">' + esc(record.moldNo) +
        '</button></div><div role="cell">' + esc(record.description) + '</div><div role="cell">' + esc(record.customer) +
        '</div><div role="cell">' + time(record.event.at) + '</div><div role="cell">' + esc(record.event.workOrderNo) +
        '</div><div role="cell">' + esc(record.event.notes || record.event.repairDetails) + '</div></div>').join('') + '</div>' :
      '<p class="mm-empty">' + (loaded ? recordsMessage + esc(reportDay) + '.' : 'Refresh to load completion records.') + '</p>';
  }
  function changeReportDay(value) {
    const parsed = new Date(value + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      $('managementReportError').textContent = 'Enter a valid date in YYYY-MM-DD format.'; return;
    }
    reportDay = value;
    $('managementReportDay').value = value;
    $('managementReportError').textContent = '';
    renderCards();
  }
  function moveReportDay(offset) {
    const value = new Date(reportDay + 'T00:00:00Z');
    value.setUTCDate(value.getUTCDate() + offset);
    changeReportDay(value.toISOString().slice(0, 10));
  }
  function decorateRows() {
    if (!enabled) return;
    document.querySelectorAll('#tableBody tr[data-index]').forEach(tr => {
      const row = app.getRows()[Number(tr.dataset.index)];
      if (!row || !loaded) return;
      const key = core.identity(row), pm = core.active(events, key, 'pm'), repair = core.active(events, key, 'repair');
      tr.classList.toggle('mm-urgent-row', !!repair && repair.urgent);
      if (!pm && !repair) return;
      const badges = document.createElement('div');
      badges.className = 'management-badges';
      badges.innerHTML = [pm && ['PM', pm.stage], repair && ['Repair', repair.assignments.map(item => item.equipment ? item.equipment + ' / ' + item.processStatus : item.stage).join('; ')]].filter(Boolean).map(item =>
        '<span class="management-badge' + (item[1] === 'Waiting' ? ' waiting' : '') + '">' + esc(item.join(': ')) + '</span>').join('');
      if (repair && repair.urgent) badges.insertAdjacentHTML('afterbegin', '<span class="management-badge mm-urgent-label">URGENT' +
        (repair.requestedCompletionDate ? ' | Due: ' + esc(repair.requestedCompletionDate) : '') + '</span>');
      tr.cells[2].appendChild(badges);
    });
  }
  async function setMode(value) {
    if (busy) return;
    if (dialog.open && !closeDialog()) return;
    enabled = value;
    title.textContent = enabled ? 'Mold Management' : dashboardTitle;
    app.closeEditor();
    app.clearQuickStatus();
    filter = 'All';
    document.body.classList.toggle('management-mode', enabled);
    if (enabled) {
      const search = $('searchInput').value;
      $('resetFilters').click();
      $('searchInput').value = search;
      $('searchInput').dispatchEvent(new Event('input', { bubbles: true }));
    }
    $('managementMode').setAttribute('aria-pressed', String(enabled));
    $('moldListMode').setAttribute('aria-pressed', String(!enabled));
    $('moldListMode').setAttribute('aria-current', enabled ? 'false' : 'page');
    daily.hidden = !enabled;
    document.querySelector('.table-title').textContent = enabled ? 'Mold Management' : 'Unified Mold List';
    if (!enabled) $('managementConnection').textContent = '';
    else $('managementConnection').textContent = 'Loading management history...';
    app.render();
    if (enabled) await refresh();
  }
  function setFilter(value) {
    filter = value;
    app.render();
  }
  function updateOrderNumber() {
    if (!draft || !draft.order || draft.order.requestNo || !$('managementRequestNo')) return;
    $('managementRequestNo').value = loaded ? workOrders.nextNumber(events, draft.order.team) : 'Loading...';
    $('managementRequestDate').value = core.taiwanDay(new Date());
  }
  function collectDraft() {
    if (!draft) return;
    const note = $('managementNotes');
    if (note) draft[category] = note.value;
    if ($('managementPmTeam')) draft.pmTeam = $('managementPmTeam').value;
    if ($('managementPmRequester')) draft.pmRequestedBy = $('managementPmRequester').value;
    if (draft.order) workOrders.collect($('managementBody'), draft.order);
  }
  function closeDialog() {
    if (busy) return false;
    collectDraft();
    if (draft && (draft.pm.trim() || draft.repair.trim() || orderDirty()) &&
        !window.confirm('Discard the unsaved management entry?')) return false;
    dialog.close();
    selected = null;
    draft = null;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    return true;
  }
  async function open(row, subIndex, initialCategory = 'pm', assignmentId = 'main') {
    if (busy) return;
    selected = { identity: core.identity(row), row, subIndex };
    draft = defaultDraft();
    draft.assignmentId = assignmentId;
    resetOrderDraft();
    category = initialCategory;
    returnFocus = document.activeElement;
    app.closeEditor();
    $('managementProduct').textContent = row.moldNo + ' | ' + (row.customer || '-') + '\n' + row.description +
      (Number.isInteger(subIndex) ? '\nPhysical mold: ' + row.moldNo + ' (shared by its Sub Molds)' : '');
    message('');
    renderDialog();
    dialog.showModal();
    $('managementClose').focus();
    await refresh();
    if (selected && dialog.open) { collectDraft(); renderDialog(); }
  }
  function historyHtml() {
    const eventTime = event => Date.parse(event.at || event.savedAt) || 0;
    const list = core.jobs(events, selected.identity, category).map(job => ({
      ...job, events: job.events.slice().reverse().sort((a, b) => eventTime(b) - eventTime(a))
    })).reverse().sort((a, b) => eventTime(b.events[0]) - eventTime(a.events[0]));
    const hasList = list.length > 0;
    const heading = '<div class="mm-history-header"><h3>History</h3></div>';
    if (!hasList) return heading + '<p class="mm-empty">No ' + (category === 'pm' ? 'PM' : 'repair') + ' history.</p>';
    const labels = { receive:'Received', in:'PM In', out:category === 'pm' ? 'PM Out' : 'Repair completed', stage:'Machine / process changed', 'add-machine':'Parallel machine queued', 'start-process':'Work started', 'process-complete':'Process completed', note:'Record added', cancel:'Cancelled' };
    return heading + list.map(job => {
      const order = job.events.find(event => event.workOrderNo || (event.workOrder && event.workOrder.requestNo));
      const requestNo = order ? order.workOrderNo || order.workOrder.requestNo : '';
      const visibleEvents = job.events.filter(event => !event.historyHidden);
      const savedOrder = job.events.find(event => event.workOrder);
      const status = !job.closed && job.equipment ? job.equipment + ' / ' + job.processStatus : job.stage;
      return '<details class="mm-history-job" data-history-job="' + esc(job.id) + '"><summary>' +
      time(job.events[0].at || job.events[0].savedAt) + (requestNo ? ' &middot; ' + esc(requestNo) : '') +
      ' &middot; ' + esc(status) + ' &middot; ' + visibleEvents.length + ' records</summary>' +
      '<div class="mm-actions"><button type="button" class="mm-danger" data-delete-job="' + esc(job.id) +
      '" title="' + (category === 'repair' ? 'Clear history; keep Work Order' : 'Delete this PM request') + '" aria-label="' + (category === 'repair' ? 'Clear history; keep Work Order' : 'Delete this PM request') + '"' +
      (loaded && !busy && visibleEvents.length ? '' : ' disabled') + '>' +
      icon('<path d="M3 6h18M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M10 10v7M14 10v7"/>') +
      '</button></div>' + (!visibleEvents.length && savedOrder ? '<p>Work Order: ' + esc(savedOrder.workOrder.requestNo) + '</p>' +
        workOrders.table(savedOrder.workOrder) + '<button type="button" data-print-order="' + esc(savedOrder.id) + '">Print Work Order</button>' : '') + visibleEvents.map(event => {
        const attachment = event.attachment;
        const link = attachment && /^work_orders\/[a-f0-9]{32}\.(xlsx|xls|xlsm)$/.test(attachment.path) ?
          '<a href="' + app.apiBase + '/' + attachment.path + '" download="' + esc(attachment.fileName) + '">' + esc(attachment.fileName) + '</a>' : '';
        return '<div class="mm-event"><time>' + time(event.at) + '</time><div><strong>' + labels[event.action] +
          (event.action === 'stage' ? ': ' + esc(event.stage) : '') + '</strong>' +
          (event.equipment ? '<p>Machine: ' + esc(event.equipment) + ' | ' + esc(event.processStatus) + '</p>' : '') +
          (event.completedStage ? '<p>Completed process: ' + esc(event.completedEquipment || event.completedStage) + '</p>' : '') +
          (event.pmRequest ? '<p>Team: ' + esc(event.pmRequest.team) + ' | Request By: ' + esc(event.pmRequest.requestedBy) + '</p>' : '') +
          (event.workOrderNo ? '<p>Work Order: ' + esc(event.workOrderNo) + '</p>' : '') +
          (event.workOrder ? '<p>Team: ' + esc(event.workOrder.team) + ' | Request By: ' + esc(event.workOrder.requestedBy) +
            ' | Rev.: ' + esc(event.workOrder.rev) + '</p><p>Reason: ' + esc(event.workOrder.reason) + '</p>' +
            workOrders.table(event.workOrder) + '<button type="button" data-print-order="' + esc(event.id) + '">Print Work Order</button>' :
            (event.notes ? '<p translate="no">' + esc(event.notes) + '</p>' : '')) + link +
          (attachment && attachment.sourceText ? '<details class="mm-source"><summary>Original Work Order text</summary><pre>' + esc(attachment.sourceText) + '</pre></details>' : '') +
          '</div></div>';
      }).join('') + '</details>';
    }).join('');
  }
  function renderDialog() {
    if (!selected) return;
    const pmJob = core.active(events, selected.identity, 'pm');
    const repairJob = core.active(events, selected.identity, 'repair');
    if (pmJob && !repairJob) category = 'pm';
    if (repairJob && !pmJob) category = 'repair';
    $('managementPmTab').hidden = !!repairJob && !pmJob;
    $('managementRepairTab').hidden = !!pmJob && !repairJob;
    const activeJob = core.active(events, selected.identity, category);
    const assignment = activeJob && category === 'repair' ? activeJob.assignments.find(item => item.assignmentId === draft.assignmentId) || activeJob.assignments[0] : null;
    if (assignment) draft.assignmentId = assignment.assignmentId;
    const active = assignment ? Object.assign({}, activeJob, assignment, { id: activeJob.id }) : activeJob;
    const isPm = category === 'pm';
    renderApprovals(activeJob, isPm);
    $('managementPmTab').setAttribute('aria-selected', String(isPm));
    $('managementRepairTab').setAttribute('aria-selected', String(!isPm));
    $('managementBody').setAttribute('aria-labelledby', isPm ? 'managementPmTab' : 'managementRepairTab');
    const disabled = !loaded || busy;
    const button = (action, label, off, style) => '<button type="button" data-management-action="' + action + '"' +
      (off || disabled ? ' disabled' : '') + ' class="' + (style || '') + '">' + label + '</button>';
    let body = '<div class="mm-status"><strong>' + esc(active ? (active.equipment ? active.equipment + ' / ' + active.processStatus : active.stage) : 'No open ' + (isPm ? 'PM' : 'repair')) +
      '</strong><span>Taiwan time (UTC+08:00)</span></div>';
    if (isPm) {
      const latest = active || core.jobs(events, selected.identity, category).slice(-1)[0];
      const request = active && active.events.find(event => event.action === 'receive');
      if (active) {
        body += '<p>Team: ' + esc(request && request.pmRequest ? request.pmRequest.team : '-') + ' | Request By: ' + esc(request && request.pmRequest ? request.pmRequest.requestedBy : '-') + '</p>';
      } else {
        body += '<div class="mm-actions"><label class="mm-field">Team<select id="managementPmTeam"' + (disabled ? ' disabled' : '') + '>' + ['CE','FOL'].map(team =>
          '<option' + (draft.pmTeam === team ? ' selected' : '') + '>' + team + '</option>').join('') + '</select></label>' +
          '<label class="mm-field">Request By<select id="managementPmRequester"' + (disabled ? ' disabled' : '') + '><option value="">Select name</option>' + (workOrders.requesters[draft.pmTeam] || []).map(name =>
          '<option value="' + esc(name) + '"' + (draft.pmRequestedBy === name ? ' selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></label></div>';
      }
      body += '<dl class="mm-times">' + [['Received', latest && latest.received], ['In', latest && latest.in], ['Out', latest && latest.out]].map(item =>
        '<div><dt>' + item[0] + '</dt><dd>' + time(item[1]) + '</dd></div>').join('') + '</dl>';
      body += '<div class="mm-actions">' + button('receive', 'Request PM', !!active, 'mm-primary') +
        button('in', 'PM In', !active || active.stage !== 'Waiting') + button('out', 'PM Out', !active || active.stage !== 'In Progress') + '</div>';
    } else {
      if (!orderFormAvailable && loaded) body += '<p class="mm-message">Restart the Mold shared server to enable Work Order entry.</p>';
      body += workOrders.form(draft.order, selected.row, disabled || !orderFormAvailable,
        loaded ? workOrders.nextNumber(events, draft.order.team) : 'Loading...');
      body += '<div class="mm-actions"><button type="button" id="managementSaveOrder" class="mm-primary"' +
        (disabled || !orderFormAvailable ? ' disabled' : '') + '>' + (active ? 'Save Work Order' : 'Save &amp; Receive Repair') + '</button>' +
        (draft.order.requestNo ? '<button type="button" id="managementPrintOrder">Print Saved Work Order</button>' : '') +
        (active ? button('cancel', 'Cancel Request', false, 'mm-danger') :
          '<button type="button" id="managementResetOrder"' + (busy ? ' disabled' : '') + '>Reset Form</button>') + '</div>';
    }
    if (isPm || active) body += '<label class="mm-field">' + (isPm ? 'PM Note' : 'History Note (English)') +
      '<textarea id="managementNotes" maxlength="20000" rows="4">' + esc(draft[category]) + '</textarea></label>';
    if (!isPm) {
      body += '<div id="managementProcessControls" class="mm-actions">';
      if (active) {
        const running = active.processStatus === 'In Progress';
        const latestProgress = active.events.filter(event => ['receive', 'stage', 'start-process', 'process-complete'].includes(event.action)).slice(-1)[0];
        const canCompleteRepair = activeJob.assignments.every(item => item.assignmentId === draft.assignmentId || item.stage === 'Awaiting Next Process') &&
          ((active.stage === 'QC Final Approval' && running) || (active.stage === 'Awaiting Next Process' &&
          latestProgress && latestProgress.action === 'process-complete' && latestProgress.completedStage === 'QC Final Approval'));
        const follows = stage => (active.stage === stage && running) || (active.stage === 'Awaiting Next Process' && latestProgress && latestProgress.completedStage === stage);
        const canEnterRepairQC = follows('Assemble');
        const canEnterInjection = follows('Repair QC Approval');
        const canEnterQC = (active.stage === 'Tray Injection' && running) || (active.stage === 'Awaiting Next Process' && latestProgress && latestProgress.completedStage === 'Tray Injection');
        body += '<label class="mm-field" style="margin:0">Current Assignment<select id="managementAssignment"' + (disabled ? ' disabled' : '') + '>' + activeJob.assignments.map((item, index) =>
          '<option value="' + esc(item.assignmentId) + '"' + (item.assignmentId === draft.assignmentId ? ' selected' : '') + '>' + esc((index + 1) + '. ' + (item.equipment || item.stage) + (item.processStatus ? ' / ' + item.processStatus : '')) + '</option>').join('') + '</select></label>';
        body += '<label class="mm-field" style="margin:0">Next Stage / Machine<select id="managementStage"><option value="">Select next stage / machine</option>' + ['Repair Waiting', ...core.equipment].map(machine =>
          '<option' + (active.equipment === machine || (machine === 'Repair Waiting' && active.stage === 'Waiting') || (machine === 'QC Final Approval' && !canEnterQC) || (machine === 'Tray Injection' && !canEnterInjection) || (machine === 'Repair QC Approval' && !canEnterRepairQC) ? ' disabled' : '') + '>' + machine + '</option>').join('') + '</select></label>' +
          button('stage', running && active.equipment ? 'Complete &amp; Move to Queue' : 'Move to Queue', true) +
          button('add-machine', 'Add Parallel Queue', true) +
          button('start-process', 'Start Work', active.processStatus !== 'Waiting' || !active.equipment, 'mm-primary') +
          button('process-complete', 'Complete Process', !core.stages.includes(active.stage) || !running) +
          button('out', active.stage === 'QC Final Approval' ? 'Complete QC &amp; Repair' : 'Complete Repair', !canCompleteRepair);
        const reviewProblem = ['Repair QC Approval','Tray Injection','QC Final Approval'].includes(active.stage) ? window.MoldRepairReview.error(draft.order, active.stage === 'QC Final Approval', active.stage === 'QC Final Approval' ? 'PostQC' : 'PreApproval') : '';
        if (reviewProblem) body += '<p class="mm-review-pending" role="status">' + esc(reviewProblem) + '</p>';
      }
      body += '</div>';
    }
    if (active) body += '<div class="mm-actions">' + button('note', 'Add Record', false) +
      (isPm ? button('cancel', 'Cancel Job', false, 'mm-danger') : '') + '</div>';
    $('managementBody').innerHTML = body;
    $('managementBody').querySelectorAll('[data-review-field]').forEach(input => {
      input.onchange = () => { collectDraft(); renderDialog(); };
    });
    const postComment = $('managementBody').querySelector('[data-post-qc-comment]');
    if (postComment) postComment.onchange = () => { collectDraft(); renderDialog(); };
    $('managementBody').querySelectorAll('[data-review-photo]').forEach(input => {
      input.onchange = () => uploadRepairPhoto(input);
      input.addEventListener('cancel', event => event.stopPropagation());
    });
    $('managementBody').querySelectorAll('[data-photo-remove]').forEach(button => {
      button.onclick = () => {
        if (busy) return;
        collectDraft();
        const item = draft.order.items[Number(button.dataset.photoItem)], key = button.dataset.photoKey;
        item[key + 's'].splice(Number(button.dataset.photoRemove), 1);
        item[key] = item[key + 's'][0] || '';
        window.MoldRepairReview.invalidate(draft.order, item);
        renderDialog();
      };
    });
    if ($('managementPmTeam')) $('managementPmTeam').onchange = () => {
      collectDraft(); draft.pmRequestedBy = ''; renderDialog();
    };
    const processControls = $('managementProcessControls');
    if (active && processControls) $('managementBody').querySelector('.mm-status').after(processControls);
    if ($('managementAssignment')) $('managementAssignment').onchange = () => {
      collectDraft();
      draft.assignmentId = $('managementAssignment').value;
      renderDialog();
    };
    if (active && $('managementStage')) $('managementStage').onchange = () => {
      const nextSelected = !!$('managementStage').value;
      processControls.querySelector('[data-management-action="stage"]').disabled = disabled || !nextSelected;
      processControls.querySelector('[data-management-action="add-machine"]').disabled = disabled || !nextSelected || ['Repair Waiting', 'Repair QC Approval', 'Tray Injection', 'QC Final Approval'].includes($('managementStage').value);
      processControls.querySelector('[data-management-action="start-process"]').disabled = disabled || nextSelected || active.processStatus !== 'Waiting' || !active.equipment;
    };
    $('managementHistory').innerHTML = historyHtml();
    const teamSelect = $('managementBody').querySelector('[data-order-field="team"]');
    const urgentToggle = $('managementBody').querySelector('[data-order-field="urgent"]');
    if (urgentToggle) urgentToggle.onchange = () => {
      collectDraft();
      if (!draft.order.urgent) draft.order.requestedCompletionDate = '';
      renderDialog();
    };
    if (teamSelect) teamSelect.onchange = () => {
      collectDraft();
      draft.order.requestedBy = draft.order.team === 'FOL' ? 'Sophia' : '';
      renderDialog();
    };
    if ($('managementSaveOrder')) $('managementSaveOrder').onclick = () => saveEvent(active ? 'note' : 'receive', true);
    if ($('managementResetOrder')) $('managementResetOrder').onclick = () => {
      if (busy) return;
      collectDraft();
      if (orderDirty() && !window.confirm('Clear this unsaved Work Order?')) return;
      draft.repair = '';
      draft.workOrderNo = '';
      resetOrderDraft();
      message('');
      renderDialog();
      dialog.scrollTop = 0;
    };
    if ($('managementAddItem')) $('managementAddItem').onclick = () => {
      collectDraft(); draft.order.items.push({ modification: '', doneBy: '' }); renderDialog();
      $('managementBody').querySelector('[data-order-row]:last-child textarea').focus();
    };
    $('managementBody').querySelectorAll('[data-order-remove]').forEach(button => {
      button.onclick = () => { collectDraft(); draft.order.items.splice(Number(button.dataset.orderRemove), 1); renderDialog(); };
    });
    if ($('managementPrintOrder')) $('managementPrintOrder').onclick = () => {
      const saved = activeJob.events.filter(event => event.workOrder).slice(-1)[0];
      printOrder(saved);
    };
    $('managementBody').querySelectorAll('[data-management-action]').forEach(button => {
      button.onclick = () => saveEvent(button.dataset.managementAction);
    });
  }
  function printOrder(event) {
    if (!event || !event.workOrder) return;
    try { workOrders.print(event.workOrder); } catch (error) { message(error.message); }
  }
  function renderApprovals(job, isPm) {
    const panel = $('managementApprovals');
    panel.hidden = isPm;
    if (isPm) { panel.innerHTML = ''; return; }
    const order = draft.order;
    const items = order.items || [];
    const roles = [
      ['Mold Leader', items.length && items.every(item => item.roomApproved), items.map(item => item.roomBy).filter(Boolean), items.map(item => item.roomAt).filter(Boolean).sort().slice(-1)[0]],
      ['Mold QC', order.preQcLeaderApproved, [order.preQcLeaderBy], order.preQcLeaderAt],
      ['Post-injection QC', items.length && items.every(item => item.postQcApproved), items.map(item => item.postQcBy).filter(Boolean), items.map(item => item.postQcAt).filter(Boolean).sort().slice(-1)[0]],
      ['Post-injection QC Leader', order.qcLeaderApproved, [order.qcLeaderBy], order.qcLeaderAt]
    ];
    const last = job && job.events.filter(event => event.approvalDecision).slice(-1)[0];
    panel.innerHTML = '<div class="mm-approval-grid">' + roles.map(([role, approved, names, approvedAt], index) => {
      const rejected = !approved && last && last.approvalDecision.role === role && last.approvalDecision.decision === 'Reject';
      const required = index < 2 ? 'Repair QC Approval' : 'QC Final Approval';
      const phaseReady = job && job.assignments.some(item => (item.stage === required && item.processStatus === 'In Progress') ||
        (item.stage === 'Awaiting Next Process' && item.events.slice(-1)[0].completedStage === required));
      const previousReady = index === 0 || roles[index - 1][1];
      const itemsReady = index > 1 || items.every(item => item.waived || item[index === 0 ? 'moldChecked' : 'moldQcChecked']);
      const stamp = approved ? approvedAt : rejected ? last.approvalDecision.at || last.at : '';
      const validStamp = stamp && Number.isFinite(new Date(stamp).getTime());
      const dateLabel = validStamp ? core.taiwanDay(stamp) : '-';
      const clockLabel = validStamp ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(stamp)) : '';
      return '<div class="mm-approval-role ' + (approved ? 'is-approved' : rejected ? 'is-rejected' : 'is-pending') + '"><strong>' + esc(role) + '</strong><div class="mm-approval-status">' +
        '<small>' + (approved ? 'Approved' : rejected ? 'Rejected' : 'Pending') + '</small><div class="mm-approval-buttons"><button type="button" data-whole-approval="' + index + '" data-decision="Approve" title="Approve" aria-label="Approve ' + esc(role) + '"' +
        (!job || busy || !phaseReady || !previousReady || !itemsReady || approved ? ' disabled' : '') + '>' + icon('<path d="m5 12 4 4L19 6"/>') + '</button>' +
        '<button type="button" data-whole-approval="' + index + '" data-decision="Reject" title="Reject" aria-label="Reject ' + esc(role) + '"' +
        (!job || busy ? ' disabled' : '') + '>' + icon('<path d="m6 6 12 12M18 6 6 18"/>') + '</button></div></div>' +
        '<span class="mm-approval-name" translate="no">' + esc(approved ? [...new Set(names)].join(', ') || '-' : rejected ? last.approvalDecision.by : '-') + '</span>' +
        '<time class="mm-approval-date" title="Taiwan time (UTC+08:00)"' + (validStamp ? ' datetime="' + esc(stamp) + '"' : '') +
        '><span>' + dateLabel + '</span><span>' + clockLabel + '</span></time></div>';
    }).join('') + '</div>';
    panel.querySelectorAll('[data-whole-approval]').forEach(button => {
      button.onclick = async () => {
        if (busy || !job) return;
        collectDraft();
        if (orderDirty()) { message('Save Work Order changes before approving or rejecting.'); return; }
        const role = roles[Number(button.dataset.wholeApproval)][0], decision = button.dataset.decision;
        const by = window.prompt('Approver name');
        if (by == null) return;
        if (!by.trim()) { message('Enter the approver name.'); return; }
        const reason = window.prompt(decision === 'Reject' ? 'Rejection reason (required)' : 'Approval comment (optional)', '');
        if (reason == null) return;
        if (decision === 'Reject' && !reason.trim()) { message('Enter a rejection reason.'); return; }
        busy = true; renderDialog();
        try {
          const lastEvent = events.filter(event => event.identity === selected.identity && event.kind === 'repair').slice(-1)[0];
          const result = await api('/api/management/event', { eventId: uuid(), identity: selected.identity, kind: 'repair', action: 'note',
            jobId: job.id, expectedEventId: lastEvent.id, approval: { role, decision, by: by.trim(), reason: reason.trim() } });
          events = result.events; resetOrderDraft(); app.render();
          message(decision === 'Reject' ? 'Rejected. Returned to Repair Waiting.' : 'Approval saved.', true);
        } catch (error) { message(error.message); }
        finally { busy = false; renderDialog(); renderCards(); }
      };
    });
  }
  async function uploadRepairPhoto(input) {
    const index = Number(input.dataset.reviewIndex), key = input.dataset.reviewPhoto;
    const photoMessage = (text, ok = false) => {
      message(text, ok);
      const picker = $('managementBody').querySelector(`[data-review-index="${index}"][data-review-photo="${key}"]`);
      const status = picker && picker.closest('.mm-photo-picker').querySelector('.mm-photo-status');
      if (status) { status.textContent = text; status.style.color = ok ? '#047857' : '#b91c1c'; }
    };
    if (!selected || busy || !reviewAvailable) { message('Restart the shared server to enable repair photos.'); return; }
    const files = Array.from(input.files);
    if (!files.length) return;
    if (files.some(file => !['image/jpeg','image/png'].includes(file.type) || file.size > 5 * 1024 * 1024)) { photoMessage('Choose a JPEG or PNG photo up to 5 MB.'); return; }
    collectDraft();
    const item = draft.order.items[index];
    if (!item) return;
    const uploadedBy = String(item.doneBy || draft.order.requestedBy || '').trim();
    if (!uploadedBy) { photoMessage('Select Request By before uploading photos.'); return; }
    if (item[key + 's'].length + files.length > 20) { photoMessage('Up to 20 photos are allowed for each Before / After section.'); return; }
    busy = true;
    $('managementClose').disabled = true;
    renderDialog();
    message('Uploading photo...');
    let uploadError = '';
    try {
      for (const file of files) {
      const contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Photo could not be read.'));
        reader.readAsDataURL(file);
      });
      const result = await api('/api/management/photo', { identity: selected.identity, itemId: item.id, uploadedBy, contentBase64 });
      if (!item[key + 's'].includes(result.photoId)) item[key + 's'].push(result.photoId);
      item[key] = item[key + 's'][0] || '';
      window.MoldRepairReview.invalidate(draft.order, item);
      }
      message('Photo uploaded. Save Work Order to record the change.', true);
    } catch (error) { uploadError = error.message + ' Previously uploaded photos are retained. Save Work Order to keep them.'; }
    finally {
      busy = false; $('managementClose').disabled = false; renderDialog();
      photoMessage(uploadError || 'Photo uploaded. Save Work Order to record the change.', !uploadError);
    }
  }
  async function deleteHistory(jobId) {
    if (!selected || !loaded || busy) return;
    const targetKind = category;
    const historyLabel = targetKind === 'pm' ? 'PM' : 'Repair';
    const targetEvents = events.filter(event => event.identity === selected.identity && event.kind === targetKind);
    const targetJob = core.jobs(events, selected.identity, targetKind).find(job => job.id === jobId);
    if (!targetJob) { message('This request is no longer available. Refresh the history.'); return; }
    const activeJob = core.active(events, selected.identity, targetKind);
    const deletingActive = activeJob && activeJob.id === jobId;
    const moldLabel = selected.row.moldNo + ' - ' + (selected.row.customer || '-');
    const order = targetJob.events.find(event => event.workOrderNo);
    if (!window.confirm((targetKind === 'repair' ? 'Clear displayed repair history for ' : 'Delete this PM request for ') + moldLabel + '?\n' +
      time(targetJob.received) + (order ? ' | ' + order.workOrderNo : '') +
      (targetKind === 'repair' ? '\nThe cleared history will also be removed from Completed counts and lists. The Work Order and current process will be retained.' : '\nThis PM request and its history will be removed. Automatic backups are retained.'))) return;
    collectDraft();
    busy = true;
    $('managementClose').disabled = true;
    renderDialog();
    message('Deleting ' + historyLabel + ' history...');
    const payload = {
      identity: selected.identity, kind: targetKind, action: targetKind === 'repair' ? 'clear-job-history' : 'delete-job', clickedAt: new Date().toISOString(),
      eventId: uuid(), expectedEventId: targetEvents[targetEvents.length - 1].id, jobId
    };
    try {
      const result = await api('/api/management/event', payload);
      events = result.events;
      if (draft && deletingActive && targetKind !== 'repair') {
        draft[targetKind] = '';
        if (targetKind === 'repair') {
          draft.workOrderNo = '';
          resetOrderDraft();
        }
      }
      message(targetKind === 'repair' ? 'History cleared. Work Order and current process retained.' : 'PM history was deleted.', true);
    } catch (error) {
      await refresh();
      message(error.name === 'AbortError' ? 'Delete timed out. Refresh and try again.' : error.message);
    } finally {
      busy = false;
      $('managementClose').disabled = false;
      renderDialog();
      app.render();
    }
  }
  $('managementHistory').onclick = event => {
    const clear = event.target.closest('[data-delete-job]');
    if (clear) {
      deleteHistory(clear.dataset.deleteJob);
      return;
    }
    const button = event.target.closest('[data-print-order]');
    if (button) printOrder(events.find(item => item.id === button.dataset.printOrder));
  };
  async function saveEvent(action, orderSave = false) {
    if (busy || !loaded || !selected) return;
    if (action === 'start-process' && $('managementStage') && $('managementStage').value) {
      message('Move to Queue before starting work on the selected machine.'); return;
    }
    const clickedAt = new Date().toISOString();
    collectDraft();
    const cancelRequest = category === 'repair' && action === 'cancel';
    if (category === 'pm' && action === 'receive' && !(workOrders.requesters[draft.pmTeam] || []).includes(draft.pmRequestedBy)) {
      message('Choose a PM request team and Request By for that team.'); return;
    }
    if (orderSave) {
      if (!reviewAvailable) { message('Restart the shared server to enable repair results and approvals.'); return; }
      if (!orderFormAvailable) { message('Restart the Mold shared server to enable Work Order entry.'); return; }
      const error = workOrders.validate(draft.order);
      if (error) { message(error); return; }
    } else if (category === 'repair' && !cancelRequest && orderDirty()) {
      message('Save the Work Order changes before updating the repair stage or adding a history note.'); return;
    }
    const notes = cancelRequest ? 'Repair request cancelled.' : (orderSave ? workOrders.summary(draft.order) : draft[category].trim());
    if ((action === 'note' || action === 'cancel' || (action === 'receive' && category === 'repair')) && !notes) {
      message(action === 'cancel' ? 'Enter a cancellation reason in the note field.' : 'Enter the ' + (category === 'pm' ? 'PM note.' : 'repair details in English.')); return;
    }
    if (category === 'repair' && !orderSave && core.nonEnglish.test(notes)) { message('Enter the history note in English.'); return; }
    if (action === 'cancel' && !window.confirm(cancelRequest ?
      'Cancel this repair request and return to a new Work Order? Unsaved changes will be discarded. Saved history will be retained.' :
      'Cancel the current job? Its history will be retained.')) return;
    const active = core.active(events, selected.identity, category);
    const assignment = active && category === 'repair' ? active.assignments.find(item => item.assignmentId === draft.assignmentId) || active.assignments[0] : active;
    const lastProgress = assignment && assignment.events.filter(event => ['receive','stage','start-process','process-complete'].includes(event.action)).slice(-1)[0];
    const reviewStage = assignment && (assignment.stage === 'Awaiting Next Process' ? lastProgress && lastProgress.completedStage : assignment.stage);
    const nextMachine = $('managementStage') ? $('managementStage').value : '';
    if (category === 'repair' && !orderSave && (action === 'out' || (['stage','process-complete'].includes(action) && ['Repair QC Approval','Tray Injection','QC Final Approval'].includes(reviewStage)))) {
      if (!reviewAvailable) { message('Restart the shared server to enable repair results and approvals.'); return; }
      const savedOrder = active && active.events.filter(event => event.workOrder).slice(-1)[0];
      const phase = reviewStage === 'QC Final Approval' ? 'PostQC' : 'PreApproval';
      const problem = window.MoldRepairReview.error(savedOrder && savedOrder.workOrder, action === 'out', phase);
      if (problem) { message(problem); return; }
    }
    const previous = events.filter(event => event.identity === selected.identity && event.kind === category).slice(-1)[0];
    const payload = { identity: selected.identity, kind: category, action, clickedAt, eventId: uuid(),
      jobId: active ? active.id : '', expectedEventId: previous ? previous.id : '', notes,
      assignmentId: assignment && category === 'repair' ? assignment.assignmentId : '',
      workOrderNo: category === 'repair' ? draft.workOrderNo : '',
      equipment: action === 'start-process' && assignment ? assignment.equipment : ($('managementStage') ? $('managementStage').value : ''),
      stage: $('managementStage') ? core.processOf($('managementStage').value) : '' };
    if (payload.stage === 'Repair Waiting') { payload.stage = 'Waiting'; payload.equipment = ''; }
    if (orderSave) payload.workOrder = workOrders.copy(draft.order);
    if (category === 'pm' && action === 'receive') payload.pmRequest = { team: draft.pmTeam, requestedBy: draft.pmRequestedBy };
    busy = true;
    $('managementClose').disabled = true;
    renderDialog();
    message('Saving...');
    let cancelled = false;
    try {
      const result = await api('/api/management/event', payload);
      events = result.events;
      if (action === 'add-machine') draft.assignmentId = result.event.assignmentId;
      if (!orderSave) draft[category] = '';
      if (category === 'repair') { draft.workOrderNo = ''; resetOrderDraft(); }
      cancelled = cancelRequest;
      message(cancelled ? 'Request cancelled. You can create a new request.' :
        (result.event.workOrder ? result.event.workOrder.requestNo + ' | ' : '') + 'Saved at ' + time(result.event.at) + '.', true);
    } catch (error) {
      await refresh();
      const saved = events.find(event => event.id === payload.eventId);
      if (saved) {
        if (action === 'add-machine') draft.assignmentId = saved.assignmentId;
        if (!orderSave) draft[category] = '';
        if (category === 'repair') { draft.workOrderNo = ''; resetOrderDraft(); }
        cancelled = cancelRequest;
        message(cancelled ? 'Request cancelled. You can create a new request.' : 'Saved at ' + time(saved.at) + '.', true);
      } else message(error.name === 'AbortError' ? 'Save timed out. Refresh the history before retrying.' : error.message);
    } finally {
      busy = false;
      $('managementClose').disabled = false;
      renderDialog();
      if (cancelled) dialog.scrollTop = 0;
      app.render();
    }
  }
  window.MoldManagement = {
    get active() { return enabled; }, renderCards, decorateRows,
    matches: row => !enabled || filter === 'All' || (loaded && core.matches(events, core.identity(row), filter))
  };
  $('managementMode').onclick = () => setMode(true);
  $('moldListMode').onclick = event => { event.preventDefault(); setMode(false); };
  $('managementClose').onclick = closeDialog;
  dialog.addEventListener('cancel', event => {
    if (event.target !== dialog) return;
    event.preventDefault();
    closeDialog();
  });
  ['managementPmTab', 'managementRepairTab'].forEach((id, index) => {
    $(id).onclick = () => {
      if (busy) return;
      collectDraft(); category = index ? 'repair' : 'pm'; message(''); renderDialog();
    };
  });
  $('tableBody').addEventListener('click', event => {
    if (!enabled) return;
    const tr = event.target.closest('tr[data-index]');
    if (!tr) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const row = app.getRows()[Number(tr.dataset.index)];
    if (row) open(row, tr.hasAttribute('data-sub-index') ? Number(tr.dataset.subIndex) : null);
  }, true);
  $('cards').addEventListener('click', event => {
    if (!enabled) return;
    event.stopImmediatePropagation();
    const done = event.target.closest('[data-completed-process]');
    if (done) {
      reportStage = done.dataset.completedProcess;
      $('managementReportStage').value = reportStage;
      renderDaily();
      renderCompletionDialog();
      completionDialog.showModal();
      refresh();
      return;
    }
    const card = event.target.closest('[data-management-filter]');
    if (card) setFilter(filter === card.dataset.managementFilter ? 'All' : card.dataset.managementFilter);
  }, true);
  $('cards').addEventListener('keydown', event => {
    if (enabled && (event.key === 'Enter' || event.key === ' ') && event.target.hasAttribute('data-management-filter')) {
      event.preventDefault(); event.target.click();
    }
  });
  $('resetFilters').addEventListener('click', () => { filter = 'All'; }, true);
  $('managementReportDay').onchange = event => changeReportDay(event.target.value.trim());
  $('managementReportDay').onkeydown = event => { if (event.key === 'Enter') changeReportDay(event.target.value.trim()); };
  $('managementPreviousDay').onclick = () => moveReportDay(-1);
  $('managementNextDay').onclick = () => moveReportDay(1);
  $('managementToday').onclick = () => changeReportDay(core.taiwanDay(new Date()));
  $('managementReportStage').onchange = event => { reportStage = event.target.value; renderDaily(); };
  $('managementReportRows').onclick = event => {
    const button = event.target.closest('[data-report-identity]');
    if (!button) return;
    const row = app.getRows().find(item => core.identity(item) === button.dataset.reportIdentity);
    if (row) open(row, null, 'repair');
    else $('managementReportError').textContent = 'This mold is no longer in the current Mold List. Its completion record is retained.';
  };
  $('managementReportExport').onclick = () => {
    if (!loaded) return;
    if (!window.XLSX) { $('managementReportError').textContent = 'Excel reader is unavailable. Refresh the page.'; return; }
    const data = [['Process', 'Mold No', 'Description', 'Customer', 'Completed At (Taiwan)', 'Work Order', 'Details'],
      ...reportRecords().map(record => [record.event.completedStage, record.moldNo, record.description, record.customer,
        time(record.event.at), record.event.workOrderNo || '', record.event.notes || record.event.repairDetails || ''])];
    const workbook = window.XLSX.utils.book_new();
    if (window.MoldI18n) data[0] = data[0].map(window.MoldI18n.t);
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet(data), 'Process Completions');
    window.XLSX.writeFile(workbook, 'Mold_Process_Completions_' + reportDay + '_' + reportStage + '.xlsx');
  };
  setInterval(() => {
    if (enabled && !busy && !document.hidden) {
      if (dialog.open) updateOrderNumber();
      else refresh();
    }
  }, 15000);
  if (window.location.hash === '#mold-management') setMode(true);
})();



