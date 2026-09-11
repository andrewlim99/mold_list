const assert = require('node:assert/strict');
const core = require('../Dashboard App/mold_management_core.js');
const base = { identity: 'TEST', kind: 'repair', jobId: 'job', at: '2026-09-10T02:00:00Z' };
const events = [
  { ...base, id: 'r', action: 'receive', stage: 'Waiting', workOrder: { requestNo: 'TEST-01' } },
  { ...base, id: 'c', action: 'process-complete', stage: 'Awaiting Next Process', completedStage: 'CNC' },
  { ...base, id: 's', action: 'stage', stage: 'EDM', equipment: 'EDM 1', processStatus: 'In Progress' }
];
assert.equal(core.completions(events, '2026-09-10').length, 1);
const before = core.active(events, 'TEST', 'repair');
const cleared = events.map(event => ({ ...event, historyHidden: true }));
assert.equal(core.completions(cleared, '2026-09-10').length, 0);
assert.equal(core.completions(cleared, '2026-09-10', 'CNC').length, 0);
const after = core.active(cleared, 'TEST', 'repair');
assert.equal(after.stage, before.stage);
assert.equal(after.equipment, before.equipment);
assert.deepEqual(after.events[0].workOrder, before.events[0].workOrder);
cleared.push({ ...base, id: 'new', action: 'process-complete', stage: 'Awaiting Next Process', completedStage: 'EDM' });
assert.deepEqual(core.completions(cleared, '2026-09-10').map(event => event.id), ['new']);
assert.equal(core.completions([{ ...base, kind: 'pm', id: 'pm', action: 'out', historyHidden: true }], '2026-09-10', 'All', 'pm').length, 0);
assert.equal(core.completions([{ ...base, kind: 'pm', id: 'pm', action: 'out' }], '2026-09-10', 'All', 'pm').length, 1);
console.log('PASS: cleared completions excluded; new completions counted; Work Order and active process preserved. No production data written.');
