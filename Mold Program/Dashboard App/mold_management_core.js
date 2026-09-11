(function (root) {
  'use strict';
  const stages = ['Welding', 'CNC', 'EDM', 'Assemble', 'Outsourcing', 'Repair QC Approval', 'Tray Injection', 'QC Final Approval'];
  const equipment = ['Welding', 'CNC 1', 'CNC 2', 'CNC 3', 'EDM 1', 'EDM 2', 'EDM 3', 'Assemble', 'Outsourcing', 'Repair QC Approval', 'Tray Injection', 'QC Final Approval'];
  const stageName = name => ({ 'Data Update': 'Repair QC Approval', 'Repair QC': 'Repair QC Approval', 'QC Inspection': 'QC Final Approval' }[name] || name);
  const normalizeStageEvent = event => ({ ...event,
    stage: stageName(event.stage === 'Tray Injection QC' ? 'Tray Injection' : event.stage),
    equipment: stageName(event.equipment === 'Tray Injection QC' ? 'Tray Injection' : event.equipment),
    completedStage: stageName(event.completedStage === 'Tray Injection QC' ? 'QC Final Approval' : event.completedStage),
    completedEquipment: stageName(event.completedEquipment === 'Tray Injection QC' ? 'QC Final Approval' : event.completedEquipment) });
  const processOf = name => /^CNC [123]$/.test(name) ? 'CNC' : /^EDM [123]$/.test(name) ? 'EDM' : name;
  const nonEnglish = /[\u3400-\u9fff\uac00-\ud7af\u3040-\u30ff]/;
  const identity = row => String(row.brand || '').replace(/\u00a0/g, ' ').trim().toUpperCase() + '|' +
    String(row.moldNo || '').replace(/\s/g, '').toUpperCase();
  function jobs(events, key, kind) {
    const result = [];
    for (const stored of events) {
      const event = normalizeStageEvent(stored);
      if (event.identity !== key || event.kind !== kind) continue;
      if (event.action === 'receive') result.push({ id: event.jobId, received: event.at, stage: 'Waiting', events: [] });
      const job = result.find(item => item.id === event.jobId);
      if (!job) continue;
      job.events.push(event);
      if (event.workOrder) {
        job.urgent = event.workOrder.urgent === true;
        job.requestedCompletionDate = event.workOrder.requestedCompletionDate || '';
      }
      if (kind === 'repair') {
        job.assignments = job.assignments || [];
        const assignmentId = event.assignmentId || 'main';
        let assignment = job.assignments.find(item => item.assignmentId === assignmentId);
        if (!assignment) {
          assignment = { assignmentId, events: [] };
          job.assignments.push(assignment);
        }
        assignment.events.push(event);
        if (!['note', 'out', 'cancel'].includes(event.action)) {
          assignment.stage = event.stage;
          assignment.equipment = event.equipment || (['Welding', 'Assemble', 'Outsourcing', 'Repair QC Approval', 'Tray Injection', 'QC Final Approval'].includes(event.stage) ? event.stage : '');
          assignment.processStatus = event.processStatus || (stages.includes(event.stage) ? 'In Progress' : '');
        }
      }
      if (event.action !== 'note') {
        job.stage = event.stage;
        job.equipment = event.equipment || (['Welding', 'Assemble', 'Outsourcing', 'Repair QC Approval', 'Tray Injection', 'QC Final Approval'].includes(event.stage) ? event.stage : '');
        job.processStatus = event.processStatus || (stages.includes(event.stage) ? 'In Progress' : '');
      }
      if (event.action === 'in') job.in = event.at;
      if (event.action === 'out') job.out = event.at;
      if (event.action === 'out' || event.action === 'cancel') job.closed = true;
    }
    return result;
  }
  function active(events, key, kind) { return jobs(events, key, kind).find(job => !job.closed) || null; }
  function matches(events, key, filter) {
    if (filter === 'All') return true;
    const pm = active(events, key, 'pm'), repair = active(events, key, 'repair');
    if (filter === 'Urgent') return !!repair && repair.urgent === true;
    return filter === 'PM Waiting' ? !!pm && pm.stage === 'Waiting' :
      filter === 'PM In Progress' ? !!pm && pm.stage !== 'Waiting' :
      filter === 'Repair Waiting' ? !!repair && repair.assignments.some(item => ['Waiting', 'Awaiting Next Process'].includes(item.stage)) :
      filter === 'Under Repair' ? !!repair && repair.assignments.some(item => stages.includes(item.stage)) :
      !!repair && repair.assignments.some(item => item.stage === filter);
  }
  function taiwanDay(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
  }
  function completions(events, day, stage = 'All', kind = 'repair') {
    const seen = new Set();
    return events.map(normalizeStageEvent).filter(event => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      if (event.historyHidden) return false;
      if (kind === 'pm') return event.kind === 'pm' && event.action === 'out' && taiwanDay(event.at) === day && (stage === 'All' || stage === 'PM');
      if (kind !== 'repair') return false;
      return event.kind === 'repair' && ['stage', 'process-complete', 'out'].includes(event.action) &&
        stages.includes(event.completedStage) && taiwanDay(event.at) === day &&
        (stage === 'All' || event.completedStage === stage);
    }).sort((a, b) => new Date(b.at) - new Date(a.at));
  }
  function extract(workbook, XLSX) {
    return workbook.SheetNames.filter(name => {
      const meta = (workbook.Workbook && workbook.Workbook.Sheets || []).find(sheet => sheet.name === name);
      return !meta || !meta.Hidden;
    }).map(name => {
      const sheet = workbook.Sheets[name];
      const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
      if (range && (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1) > 200000) {
        throw new Error('Work Order sheet is too large. Upload only the Work Order form.');
      }
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
      const sourceRows = rows.map(row => row.map(value => String(value).trim()).filter(Boolean));
      const source = sourceRows.filter(row => row.length).map(row => row.join(' | ')).join('\n');
      if (source.length > 200000) throw new Error('Work Order text exceeds the 200,000-character limit.');
      const heading = /repair\s*(details?|description|content|instructions?)|modification\s*(details?|description|content|instructions?)|work\s*(description|content|details?)|description\s*of\s*(work|repair)|scope\s*of\s*work|\u7dad\u4fee\u5167\u5bb9|\u4fee\u6a21\u5167\u5bb9|\u4fee\u6539\u5167\u5bb9/i;
      const boundary = /^(approved|prepared|checked|approval|signature|total|delivery\s*date|due\s*date|material|customer|mold\s*(no|number)|work\s*order\s*(no|number))\b/i;
      const action = /\b(polish(?:ing)?|weld(?:ing)?|repair|rework|modify|modification|replace|replacement|cnc|edm|assembl(?:e|y|ing)|grind(?:ing)?|machin(?:e|ing)|clean(?:ing)?|insert|damage|scratch|burr|dimension|cavity|core|vent|ejector)\b/i;
      const candidates = [];
      let inSection = false;
      for (const row of sourceRows) {
        if (!row.length) continue;
        const labelIndex = row.findIndex(cell => heading.test(cell));
        if (labelIndex !== -1) {
          inSection = true;
          const ownText = row[labelIndex].replace(heading, '').replace(/^[\s:：/|\-]+/, '').trim();
          const content = [ownText, ...row.slice(labelIndex + 1)].filter(Boolean).join(' | ');
          if (content) candidates.push(content);
          continue;
        }
        if (inSection && boundary.test(row[0])) inSection = false;
        if (inSection || row.some(cell => action.test(cell))) candidates.push(row.join(' | '));
      }
      // Preserve source wording. Mixed-language lines require review, not guessed translation.
      const repairSource = [...new Set(candidates)].join('\n');
      const english = repairSource.split(/\r?\n/).filter(line => /[a-z]/i.test(line) && !nonEnglish.test(line)).join('\n');
      const orderMatch = source.match(/(?:work\s*order\s*(?:no\.?|number|#)|w\/?o\s*(?:no\.?|number|#))\s*[:：|#\s]+([^|\n]+)/i);
      const moldNos = [...new Set((source.match(/\bF[PDCR]\d{4,}(?:-\d+[A-Z]?)?/gi) || []).map(value => value.toUpperCase()))];
      return { name, source, repairSource, english, needsEnglish: nonEnglish.test(repairSource),
        workOrderNo: orderMatch ? orderMatch[1].trim() : '', moldNos };
    });
  }
  const api = { stages, equipment, processOf, nonEnglish, identity, jobs, active, matches, taiwanDay, completions, extract };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoldManagementCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

