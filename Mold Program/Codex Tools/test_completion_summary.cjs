const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = { identity: 'TEST|TEST-01', jobId: 'test', kind: 'repair', action: 'process-complete', stage: 'Awaiting Next Process', moldNo: 'TEST-01', description: 'Test mold description', at: '2026-09-10T03:00:00Z' };
    const events = [
      { ...base, id: '1', completedStage: 'EDM', completedEquipment: 'EDM 1' },
      { ...base, id: '2', completedStage: 'EDM', completedEquipment: 'EDM 2' },
      { ...base, id: '3', completedStage: 'CNC', completedEquipment: 'CNC 1', historyHidden: true },
      { ...base, id: '4', kind: 'pm', action: 'out' },
      { ...base, id: '5', completedStage: 'CNC', completedEquipment: '', at: '2026-09-10T04:00:00Z' },
      { ...base, id: '6', completedStage: 'EDM', completedEquipment: 'EDM 3', at: '2026-09-09T04:00:00Z' }
    ];
    await page.route('**/api/management**', route => {
      assert.equal(route.request().method(), 'GET');
      return route.fulfill({ json: { ok: true, events, workOrderFormVersion: 1 } });
    });
    await page.goto('http://127.0.0.1:3212/mold_dashboard.html');
    await page.locator('#managementMode').click();
    await page.locator('#managementReportDay').fill('2026-09-10');
    await page.locator('#managementReportDay').press('Enter');
    await page.locator('#managementReportRows [data-report-identity]').first().waitFor();
    const listBefore = await page.locator('#managementReportRows').innerText();
    await page.getByRole('button', { name: 'Summary', exact: true }).click();
    const box = name => page.locator('[data-summary-machine="' + name + '"]');
    await box('EDM 1').waitFor();
    assert.equal(await box('EDM 1').locator('[data-summary-event]').count(), 1);
    assert.equal(await box('EDM 2').locator('[data-summary-event]').count(), 1);
    assert.equal(await box('CNC 1').locator('[data-summary-event]').count(), 0);
    assert.equal(await box('PM').locator('[data-summary-event]').count(), 1);
    assert.equal(await box('CNC / Unspecified machine').locator('[data-summary-event]').count(), 1);
    assert.match(await page.locator('#managementSummaryCount').innerText(), /1 molds \| 4 completions/);
    assert.equal(await page.locator('#managementReportRows').innerText(), listBefore);
    await page.locator('#managementSummaryDialog').screenshot({ path: 'C:/Users/USER/AppData/Local/Temp/mold-completion-summary.png' });
    for (const width of [1000, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.locator('#managementSummaryDialog').evaluate(element => element.scrollWidth <= element.clientWidth));
    }
    await page.keyboard.press('Escape');
    await page.locator('#managementReportStage').selectOption('EDM');
    await page.locator('#managementReportSummary').click();
    assert.equal(await page.locator('[data-summary-machine]').count(), 3);
    assert.match(await page.locator('#managementSummaryCount').innerText(), /2 completions/);
    await page.keyboard.press('Escape');
    await page.locator('#managementReportDay').fill('2026-09-08');
    await page.locator('#managementReportDay').press('Enter');
    await page.locator('#managementReportSummary').click();
    assert.equal(await page.locator('[data-summary-event]').count(), 0);
    assert.match(await page.locator('#managementSummaryCount').innerText(), /0 completions/);
    assert.deepEqual(errors, []);
    console.log('PASS: machine grouping, PM, hidden exclusion, date/process filters, unknown equipment, unchanged list, responsive popup. All data mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
