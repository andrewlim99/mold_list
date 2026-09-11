const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    let events = [], posted = null;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/management**', async route => {
      if (route.request().method() === 'POST') {
        posted = route.request().postDataJSON();
        const event = { ...posted, id: posted.eventId, jobId: posted.eventId, stage: 'Waiting', at: posted.clickedAt };
        events.push(event);
        await route.fulfill({ json: { ok: true, events, event } });
      } else await route.fulfill({ json: { ok: true, events, workOrderFormVersion: 1 } });
    });
    await page.goto('http://127.0.0.1:3212/mold_dashboard.html');
    await page.locator('#managementMode').click();
    await page.locator('#tableBody tr[data-index]').first().click();
    await page.locator('#managementPmTeam').waitFor();
    await page.locator('[data-management-action="receive"]').click();
    assert.equal(posted, null);
    await page.locator('#managementPmRequester').selectOption('Joseph');
    await page.locator('#managementPmTeam').selectOption('FOL');
    assert.equal(await page.locator('#managementPmRequester').inputValue(), '');
    assert.deepEqual(await page.locator('#managementPmRequester option').allTextContents(), ['Select name', 'Sophia', 'Yun', '\u963f\u6689']);
    await page.locator('#managementRepairTab').click();
    await page.locator('[data-order-field="team"]').selectOption('FOL');
    assert((await page.locator('[data-order-field="requestedBy"] option').allTextContents()).includes('\u963f\u6689'));
    await page.locator('#managementPmTab').click();
    await page.locator('#managementPmRequester').selectOption('\u963f\u6689');
    await page.locator('[data-management-action="receive"]').click();
    await page.waitForFunction(() => !document.querySelector('#managementPmTeam'));
    assert.deepEqual(posted.pmRequest, { team: 'FOL', requestedBy: '\u963f\u6689' });
    assert.match(await page.locator('#managementBody').innerText(), /FOL.*\u963f\u6689/);
    assert.match(await page.locator('#managementHistory').innerText(), /History/);
    await page.locator('#managementHistory summary').click();
    assert.match(await page.locator('#managementHistory').innerText(), /FOL.*\u963f\u6689/);
    assert.deepEqual(errors, []);
    console.log('PASS: PM required requester, team reset, shared FOL names, saved request and history. All writes mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
