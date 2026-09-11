const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1888, height: 1200 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let events = [], posted = null;
    // Management requests never reach production while testing UI mutations.
    await page.route('**/api/management**', async route => {
      if (route.request().method() === 'POST') {
        const payload = posted = route.request().postDataJSON();
        const previous = events.filter(event => event.identity === payload.identity && event.kind === payload.kind && (event.assignmentId || 'main') === payload.assignmentId).at(-1);
        const event = { ...previous, assignmentId: payload.action === 'add-machine' ? payload.eventId : payload.assignmentId, id: payload.eventId, action: payload.action, at: new Date().toISOString() };
        if (payload.action === 'start-process') event.processStatus = 'In Progress';
        else if (payload.action === 'process-complete') Object.assign(event, { stage: 'Awaiting Next Process', equipment: '', processStatus: '' });
        else if (['stage', 'add-machine'].includes(payload.action)) Object.assign(event, { stage: payload.stage, equipment: payload.equipment, processStatus: 'Waiting' });
        else throw new Error('Unexpected test mutation: ' + payload.action);
        events.push(event);
        await route.fulfill({ json: { ok: true, events, event } });
      } else await route.fulfill({ json: { ok: true, events, workOrderFormVersion: 1 } });
    });
    await page.goto('http://127.0.0.1:3212/mold_dashboard.html');
    await page.waitForFunction(() => window.MoldApp && window.MoldApp.getRows().length > 3);
    const rows = await page.evaluate(() => [...new Map(window.MoldApp.getRows().map(row => [window.MoldManagementCore.identity(row), row])).values()].slice(0, 3).map(row => ({ ...row, identity: window.MoldManagementCore.identity(row) })));
    rows.forEach((row, index) => {
      const kind = index === 2 ? 'pm' : 'repair';
      const common = { identity: row.identity, kind, jobId: 'job-' + index, at: new Date().toISOString(), moldNo: row.moldNo, description: row.description };
      events.push({ ...common, id: 'receipt-' + index, action: 'receive', stage: 'Waiting' });
      events.push({ ...common, id: 'state-' + index, action: index === 2 ? 'in' : 'stage', stage: index === 2 ? 'In Progress' : 'EDM', equipment: index === 2 ? '' : 'EDM ' + (index === 0 ? '2' : '1'), processStatus: index === 0 ? 'Waiting' : 'In Progress' });
    });
    await page.locator('#managementMode').click();
    const machine = name => page.locator('[data-machine="' + name + '"]');
    await machine('EDM 1').getByRole('button').waitFor();
    assert.equal(await machine('EDM 2').getByRole('button').count(), 0);
    assert.equal(await machine('PM').getByRole('button').count(), 1);
    await page.locator('#tableBody tr[data-index="0"]').click();
    await page.locator('#managementStage').waitFor();
    assert.equal(await page.locator('#managementPmTab').isVisible(), false);
    assert.equal(await page.locator('#managementRepairTab').isVisible(), true);
    assert(await page.evaluate(() => !!(document.querySelector('#managementProcessControls').compareDocumentPosition(document.querySelector('.mm-order-form')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    await page.locator('#managementClose').click();
    await machine('PM').getByRole('button').click();
    await page.locator('[data-management-action="in"]').waitFor();
    assert.equal(await page.locator('#managementPmTab').isVisible(), true);
    assert.equal(await page.locator('#managementRepairTab').isVisible(), false);
    assert.equal(await page.locator('#managementStage').count(), 0);
    await page.locator('#managementClose').click();
    assert.match(await machine('EDM 1').innerText(), new RegExp(rows[1].moldNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await page.locator('[data-machine-name="EDM 2"] .mm-machine-open').click();
    await page.locator('#machineItemsDialog').waitFor();
    assert.equal(await page.locator('#machineItemsDialog [data-machine-identity]').count(), 1);
    assert.equal(await page.locator('#managementMachineQueue button').count(), 0);
    await page.locator('#machineItemsDialog [data-machine-identity]').click();
    assert.equal(await page.locator('[data-management-action="stage"]').isDisabled(), true);
    await page.locator('#managementStage').selectOption({ label: 'EDM 3' });
    assert.equal(await page.locator('[data-management-action="start-process"]').isDisabled(), true);
    assert.equal(await page.locator('[data-management-action="stage"]').isEnabled(), true);
    await page.locator('#managementStage').selectOption('');
    assert.equal(await page.locator('[data-management-action="start-process"]').isEnabled(), true);
    await page.locator('[data-management-action="start-process"]').click();
    await machine('EDM 2').getByRole('button').waitFor();
    assert.equal(posted.action, 'start-process');
    await page.locator('[data-management-action="process-complete"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-machine="EDM 2"] button'));
    await page.locator('#managementStage').selectOption({ label: 'CNC 3' });
    await page.locator('[data-management-action="stage"]').click();
    await page.waitForFunction(() => document.querySelector('.mm-status').textContent.includes('CNC 3 / Waiting'));
    assert.equal(posted.equipment, 'CNC 3');
    assert.equal(posted.stage, 'CNC');
    assert.equal(await machine('CNC 3').getByRole('button').count(), 0);
    await page.locator('[data-management-action="start-process"]').click();
    await machine('CNC 3').getByRole('button').waitFor();
    await page.locator('#managementStage').selectOption({ label: 'EDM 2' });
    await page.locator('[data-management-action="add-machine"]').click();
    await page.waitForFunction(() => document.querySelector('#managementAssignment').options.length === 2);
    assert.equal(await machine('CNC 3').getByRole('button').count(), 1);
    assert.equal(await machine('EDM 2').getByRole('button').count(), 0);
    const branch = await page.locator('#managementAssignment').inputValue();
    assert.notEqual(branch, 'main');
    await page.locator('[data-management-action="start-process"]').click();
    await machine('EDM 2').getByRole('button').waitFor();
    assert.equal(posted.assignmentId, branch);
    assert.equal(await machine('CNC 3').getByRole('button').count(), 1);
    const state = await page.evaluate(key => {
      const core = window.MoldManagementCore;
      return { core: !!core };
    }, rows[0].identity);
    assert(state.core);
    await page.locator('#managementClose').click();
    await machine('CNC 3').getByRole('button').click();
    assert.equal(await page.locator('#managementAssignment').inputValue(), 'main');
    await page.locator('[data-management-action="process-complete"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-machine="CNC 3"] button'));
    assert.equal(await machine('EDM 2').getByRole('button').count(), 1);
    await page.locator('#managementClose').click();
    await machine('EDM 2').getByRole('button').click();
    assert.equal(await page.locator('#managementAssignment').inputValue(), branch);
    await page.locator('#managementStage').selectOption({ label: 'Assemble' });
    await page.locator('[data-management-action="stage"]').click();
    await page.waitForFunction(() => document.querySelector('.mm-status').textContent.includes('Assemble / Waiting'));
    await page.locator('[data-management-action="start-process"]').click();
    await machine('Assemble').getByRole('button').waitFor();
    assert.equal(await page.locator('[data-management-action="out"]').isDisabled(), true);
    await page.locator('#managementStage').selectOption({ label: 'Tray Injection QC' });
    assert.equal(await page.locator('[data-management-action="add-machine"]').isDisabled(), true);
    await page.locator('[data-management-action="stage"]').click();
    await page.waitForFunction(() => document.querySelector('.mm-status').textContent.includes('Tray Injection QC / Waiting'));
    assert.equal(await page.locator('[data-management-action="out"]').isDisabled(), true);
    await page.locator('[data-management-action="start-process"]').click();
    await machine('Tray Injection QC').getByRole('button').waitFor();
    assert.equal(await page.locator('[data-management-action="out"]').isEnabled(), true);
    await page.locator('#managementClose').click();
    for (const width of [1888, 1220, 390]) {
      await page.setViewportSize({ width, height: 1200 });
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        boxes: [...document.querySelectorAll('.mm-room-machine')].map(element => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
      }));
      assert.equal(layout.overflow, false);
      assert.equal(layout.boxes.length, 11);
      assert(layout.boxes.every(box => Math.abs(box.width - layout.boxes[0].width) < 1 && box.height === 230));
    }
    await page.setViewportSize({ width: 1888, height: 1200 });
    await page.screenshot({ path: 'C:/Users/USER/AppData/Local/Temp/mold-equipment-board.png', fullPage: true });
    await page.locator('#moldListMode').click();
    assert.equal(await page.locator('#managementBoardArea').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('PASS: queue exclusion, machine start/complete/transfer, PM display, equal box sizes, responsive scrolling, Dashboard restoration. All management writes mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
