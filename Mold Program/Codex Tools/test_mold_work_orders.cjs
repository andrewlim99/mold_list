'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { chromium } = require(process.env.MOLD_PLAYWRIGHT || 'playwright');
const source = path.resolve(__dirname, '../Dashboard App');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-order-qa-'));
const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const processes = [], browserErrors = [];
let browser;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function startServer(port) {
  const proc = spawn(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(fixture, 'mold_shared_server.ps1'), '-Port', String(port)], { windowsHide: true });
  processes.push(proc);
  let output = '';
  proc.stdout.on('data', data => { output += data; });
  proc.stderr.on('data', data => { output += data; });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (proc.exitCode !== null) throw new Error(output);
    try { if ((await fetch('http://127.0.0.1:' + port + '/api/health')).ok) return; } catch (_) {}
    await sleep(200);
  }
  throw new Error('Test server unavailable: ' + output);
}
async function freePort() {
  const server = require('node:net').createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function request(base, payload, ok = true) {
  const response = await fetch(base + '/api/management/event', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json();
  assert.equal(data.ok, ok, JSON.stringify(data));
  return data;
}
const order = team => ({ team, requestedBy: 'Ray Chen', rev: '0B', reason: 'NPI Tuning',
  items: [{ modification: '\u516c\u6a21 X RIBs W=2.20mm, H=2.80mm', doneBy: '' }, { modification: 'Polish cavity', doneBy: 'Alex' }] });
function receipt(index, team = 'CE') {
  return { identity: 'PEAK|FP900' + index + '-01', kind: 'repair', action: 'receive', eventId: randomUUID(),
    clickedAt: new Date().toISOString(), expectedEventId: '', jobId: '', workOrder: order(team) };
}
async function main() {
  fs.mkdirSync(path.join(fixture, 'assets'));
  for (const name of ['mold_shared_server.ps1', 'mold_management.ps1', 'mold_dashboard.html', 'mold_management.js',
    'mold_management_core.js', 'mold_work_order.js', 'mold_management.css', 'assets/peak-logo.png', 'assets/xlsx.full.min.js']) {
    fs.copyFileSync(path.join(source, name), path.join(fixture, name));
  }
  const rows = Array.from({ length: 8 }, (_, index) => ({ brand: 'PEAK', moldNo: 'FP900' + (index + 1) + '-01',
    description: 'KBG77.5X77.5 4.88 0103 12', rev: '0B', customer: 'MICRON', keyStatus: 'In Production' }));
  fs.writeFileSync(path.join(fixture, 'mold_shared_rows.json'), JSON.stringify({ updatedAt: new Date().toISOString(), rows }));
  const port = await freePort(), secondPort = await freePort();
  await startServer(port);
  await startServer(secondPort);
  const base = 'http://127.0.0.1:' + port, secondBase = 'http://127.0.0.1:' + secondPort;
  const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
  const caps = await (await fetch(base + '/api/management')).json();
  assert.equal(caps.workOrderFormVersion, 1);
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(base + '/mold_dashboard.html#mold-management');
  await page.locator('#managementMode[aria-pressed="true"]').waitFor();
  for (const width of [1440, 1220, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('.mold-title-row').evaluate(row => {
      const title = row.querySelector('h1').getBoundingClientRect();
      const nav = row.querySelector('nav').getBoundingClientRect();
      const panel = row.parentElement.getBoundingClientRect();
      return title.right <= nav.left && nav.right <= panel.right && nav.bottom <= panel.bottom;
    }), true);
    await page.locator('.hero-panel').screenshot({ path: path.join(fixture, 'header-management-' + width + '.png') });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#moldListMode').click();
  assert.equal(await page.locator('#moldListMode').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#managementDaily').isVisible(), false);
  await page.locator('.hero-panel').screenshot({ path: path.join(fixture, 'header-dashboard.png') });
  await page.locator('#managementMode').click();
  await page.locator('#managementConnection').getByText('Management connected', { exact: true }).waitFor();
  await page.locator('#tableBody tr[data-index]').first().click();
  await page.locator('#managementRepairTab').click();
  await page.locator('#managementSaveOrder:enabled').waitFor();
  assert.equal(await page.locator('[data-order-field="rev"]').inputValue(), '0B');
  await page.locator('#managementSaveOrder').click();
  assert.match(await page.locator('#managementMessage').innerText(), /Request By/);
  await page.locator('[data-order-field="requestedBy"]').fill('Ray Chen');
  assert.equal(await page.locator('#managementRequestNo').inputValue(), day + '-CE01');
  await page.locator('[data-order-field="team"]').selectOption('FOL');
  assert.equal(await page.locator('#managementRequestNo').inputValue(), day + '-FOL01');
  assert.equal(await page.locator('[data-order-field="requestedBy"]').inputValue(), 'Ray Chen');
  await page.locator('[data-order-field="team"]').selectOption('CE');
  assert.equal(await page.locator('#managementRequestNo').inputValue(), day + '-CE01');
  await page.locator('[data-order-field="reason"]').fill('NPI Tuning');
  await page.locator('[data-order-item="modification"]').fill('\u516c\u6a21 X RIBs W=2.20mm, H=2.80mm');
  await page.locator('#managementAddItem').click();
  await page.locator('[data-order-item="modification"]').nth(1).fill('Polish cavity');
  await page.locator('[data-order-item="doneBy"]').nth(1).fill('Alex');
  await page.locator('#managementAddItem').click();
  await page.locator('[data-order-remove="2"]').click();
  assert.equal(await page.locator('[data-order-row]').count(), 2);
  await page.locator('#managementPmTab').click();
  await page.locator('#managementRepairTab').click();
  assert.equal(await page.locator('[data-order-item="doneBy"]').nth(1).inputValue(), 'Alex');
  await page.locator('#managementSaveOrder').click();
  await page.locator('#managementMessage').filter({ hasText: day + '-CE01' }).waitFor();
  assert.equal(await page.locator('.mm-status strong').innerText(), 'Waiting');
  assert.equal(await page.locator('[data-order-field="team"]').isDisabled(), true);
  await page.locator('[data-order-item="doneBy"]').first().fill('Chris');
  await page.locator('[data-management-action="stage"]').click();
  assert.match(await page.locator('#managementMessage').innerText(), /Save the Work Order/);
  await page.locator('#managementSaveOrder').click();
  await page.locator('#managementMessage').filter({ hasText: 'Saved at' }).waitFor();
  await page.locator('#managementClose').click();
  await page.locator('#tableBody tr[data-index]').first().click();
  await page.locator('#managementRepairTab').click();
  await page.locator('#managementSaveOrder:enabled').waitFor();
  assert.equal(await page.locator('[data-order-item="doneBy"]').first().inputValue(), 'Chris');
  await page.screenshot({ path: path.join(fixture, 'work-order-desktop.png') });
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#managementPrintOrder').click();
  const printPage = await popupPromise;
  await printPage.waitForLoadState();
  assert.equal(await printPage.locator('.mm-saved-items tbody tr').count(), 2);
  assert.match(await printPage.locator('body').innerText(), new RegExp(day + '-CE01'));
  assert.equal(await printPage.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), true);
  await printPage.screenshot({ path: path.join(fixture, 'work-order-print.png'), fullPage: true });
  await printPage.pdf({ path: path.join(fixture, 'work-order.pdf'), preferCSSPageSize: true, printBackground: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(fixture, 'work-order-mobile.png') });
  assert.equal(await page.locator('#managementDialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await page.locator('#managementClose').click();
  await page.reload();
  await page.locator('#managementConnection').getByText('Management connected', { exact: true }).waitFor();
  const before = await (await fetch(base + '/api/management')).json();
  assert.equal(before.events.length, 2);
  assert.equal(before.events[0].workOrder.items[0].doneBy, '');
  assert.equal(before.events[1].workOrder.items[0].doneBy, 'Chris');
  const second = receipt(2);
  const saved = await request(base, second);
  assert.equal(saved.event.workOrderNo, day + '-CE02');
  const retry = await request(base, second);
  assert.equal(retry.events.length, saved.events.length);
  assert.equal(retry.event.id, saved.event.id);
  const fol = await request(base, receipt(3, 'FOL'));
  assert.equal(fol.event.workOrderNo, day + '-FOL01');
  const invalid = receipt(4);
  invalid.workOrder.items = [{ modification: '', doneBy: 'Alex' }];
  await request(base, invalid, false);
  const concurrent = await Promise.all([request(base, receipt(4)), request(secondBase, receipt(5))]);
  assert.deepEqual(concurrent.map(data => data.event.workOrderNo).sort(), [day + '-CE03', day + '-CE04']);
  const stale = { ...second, action: 'note', eventId: randomUUID(), jobId: saved.event.jobId, expectedEventId: '' };
  await request(base, stale, false);
  const stage = await request(base, { ...second, workOrder: undefined, action: 'stage', stage: 'CNC',
    eventId: randomUUID(), jobId: saved.event.jobId, expectedEventId: saved.event.id });
  assert.equal(stage.event.stage, 'CNC');
  assert.equal(stage.event.workOrderNo, day + '-CE02');
  const update = await request(base, { ...second, action: 'note', eventId: randomUUID(),
    jobId: saved.event.jobId, expectedEventId: stage.event.id, workOrder: { ...order('CE'), reason: 'Updated reason' } });
  assert.equal(update.event.workOrderNo, day + '-CE02');
  assert.equal(update.event.stage, 'CNC');
  const pm = await request(base, { ...receipt(6), workOrder: undefined, kind: 'pm' });
  assert.equal(pm.event.stage, 'Waiting');
  const persisted = JSON.parse(fs.readFileSync(path.join(fixture, 'mold_management.json'), 'utf8'));
  assert.equal(persisted.events.filter(event => event.action === 'receive' && event.kind === 'repair').length, 5);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, 'mold_shared_rows.json'), 'utf8')).rows, rows);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#tableBody tr[data-index]').first().click();
  await page.locator('#managementRepairTab').click();
  await page.locator('#managementSaveOrder:enabled').waitFor();
  await page.locator('[data-order-item="modification"]').first().fill('Unsaved changes before cancellation');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Cancel Request', exact: true }).click();
  assert.equal(await page.locator('[data-order-item="modification"]').first().inputValue(), 'Unsaved changes before cancellation');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cancel Request', exact: true }).click();
  await page.locator('#managementMessage').filter({ hasText: 'Request cancelled.' }).waitFor();
  assert.equal(await page.locator('#managementSaveOrder').innerText(), 'Save & Receive Repair');
  assert.equal(await page.locator('#managementRequestNo').inputValue(), day + '-CE05');
  assert.equal(await page.locator('[data-order-field="requestedBy"]').inputValue(), '');
  assert.equal(await page.locator('[data-order-row]').count(), 1);
  assert.equal(await page.locator('[data-order-item="modification"]').inputValue(), '');
  assert.equal(await page.locator('#managementDialog').evaluate(el => el.scrollTop), 0);
  const afterCancel = await (await fetch(base + '/api/management')).json();
  assert.equal(afterCancel.events.at(-1).action, 'cancel');
  assert.equal(afterCancel.events.at(-1).workOrderNo, day + '-CE01');
  assert.equal(afterCancel.events[0].workOrder.items[0].doneBy, '');
  await page.locator('[data-order-field="requestedBy"]').fill('Discard draft');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#managementResetOrder').click();
  assert.equal(await page.locator('[data-order-field="requestedBy"]').inputValue(), '');
  assert.equal((await (await fetch(base + '/api/management')).json()).events.length, afterCancel.events.length);
  await page.locator('[data-order-field="requestedBy"]').fill('Ray Chen');
  await page.locator('[data-order-field="reason"]').fill('New request after cancellation');
  await page.locator('[data-order-item="modification"]').fill('New repair item');
  await page.locator('#managementSaveOrder').click();
  await page.locator('#managementMessage').filter({ hasText: day + '-CE05' }).waitFor();
  assert.deepEqual(browserErrors, []);
  console.log(JSON.stringify({ ok: true, fixture, checks: 'UI save/edit/reopen, rows, print/PDF, mobile, daily team numbering, idempotency, cross-server locking, validation, conflict, stage and PM compatibility' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  for (const proc of processes) {
    if (proc.exitCode === null) {
      const closed = new Promise(resolve => proc.once('exit', resolve));
      proc.kill();
      await closed;
    }
  }
  console.log('QA artifacts: ' + fixture);
});
