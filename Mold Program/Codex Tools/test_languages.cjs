const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/management**', route => {
      assert.equal(route.request().method(), 'GET');
      return route.fulfill({ json: { ok: true, events: [], workOrderFormVersion: 1, repairReviewVersion: 1 } });
    });
    await page.goto('http://127.0.0.1:3212/mold_dashboard.html');
    await page.waitForSelector('#languageSelect');
    const rows = await page.evaluate(() => JSON.stringify(window.MoldApp.getRows()));
    await page.selectOption('#languageSelect', 'zh-Hant');
    await page.waitForFunction(() => document.documentElement.lang === 'zh-Hant');
    assert.equal(await page.locator('#saveEntry').textContent(), '儲存');
    assert.match(await page.locator('#searchInput').getAttribute('placeholder'), /模具編號/);
    assert.equal(await page.locator('#entryStatus option[value="In Production"]').textContent(), '生產中');
    await page.selectOption('#entryStatus', 'In Production');
    assert.equal(await page.locator('#entryStatus').inputValue(), 'In Production');
    assert.equal(await page.evaluate(() => JSON.stringify(window.MoldApp.getRows())), rows);
    await page.screenshot({ path: 'C:/Users/USER/AppData/Local/Temp/mold-language-dashboard.png' });
    await page.locator('#managementMode').click();
    await page.waitForFunction(() => document.querySelector('.hero-panel h1').textContent.includes('模具管理'));
    assert.equal(await page.locator('[data-management-filter="Repair QC Approval"] .card-label').textContent(), '維修 QC 核准');
    await page.locator('#tableBody tr[data-index]').first().click();
    await page.waitForSelector('dialog[open]');
    console.log('Untranslated dialog:', await page.locator('dialog[open]').evaluate(el => [...el.querySelectorAll('button,label,legend,h2,h3,option')].filter(e => e.getClientRects().length && /^[A-Za-z]/.test(e.textContent.trim())).map(e => e.textContent.trim()).slice(0,60)));
    await page.screenshot({ path: 'C:/Users/USER/AppData/Local/Temp/mold-language-dialog.png' });
    await page.locator('#managementRepairTab').click();
    await page.waitForFunction(() => document.querySelector('#managementSaveOrder').textContent.includes('儲存'));
    assert.equal(await page.locator('[data-review-field="repairType"] option[value="Visual"]').textContent(), '外觀');
    await page.selectOption('[data-review-field="repairType"]', 'Dimensional');
    assert.equal(await page.locator('[data-review-field="repairType"]').inputValue(), 'Dimensional');
    await page.locator('[data-order-field="urgent"]').check();
    await page.locator('[data-order-field="requestedCompletionDate"]').fill('2026-09-20');
    await page.screenshot({ path: 'C:/Users/USER/AppData/Local/Temp/mold-language-repair.png' });
    const printResult = await page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.MoldWorkOrder.printable({
        team: 'CE', requestNo: 'TEST', description: 'Visual', moldNo: 'FP0001-01', requestedBy: 'Ray',
        requestDate: '2026-09-11', rev: 'A', reason: 'Repair', items: [{ modification: 'Visual', doneBy: 'Ray', repairType: 'Visual' }]
      }, ''), 'text/html');
      window.MoldI18n.apply(doc);
      return [doc.documentElement.lang, doc.querySelector('h1').textContent, doc.querySelector('.meta td').textContent];
    });
    assert.deepEqual(printResult, ['zh-Hant', '模具維修工單（CE）', 'Visual']);
    await page.selectOption('#languageSelect', 'en', { force: true }).catch(async () => {
      await page.evaluate(() => document.querySelector('dialog[open]').close());
      await page.selectOption('#languageSelect', 'en');
    });
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.equal(await page.locator('#saveEntry').textContent(), 'Save');
    assert.equal(await page.locator('#searchInput').getAttribute('placeholder'), 'Mold No, Sub Mold, description, customer, material');
    assert.equal(await page.locator('#entryStatus option[value="In Production"]').textContent(), 'In Production');
    const leftovers = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const found = [];
      while (walker.nextNode()) {
        const node = walker.currentNode, el = node.parentElement;
        if (!el || el.closest('script,style,[translate="no"],#languageSelect,#tableBody td,#managementProduct,textarea,option') || !el.getClientRects().length) continue;
        if (/[\uac00-\ud7a3\u3400-\u9fff]/.test(node.nodeValue)) found.push(node.nodeValue.trim());
      }
      return [...new Set(found)];
    });
    assert.deepEqual(leftovers, [], 'Non-English UI remains after switching back');
    await page.selectOption('#languageSelect', 'zh-Hant');
    await page.reload();
    await page.waitForFunction(() => document.documentElement.lang === 'zh-Hant');
    assert.equal(await page.locator('#languageSelect').inputValue(), 'zh-Hant');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
    console.log('PASS: language switching, persistence, canonical option values, data preservation, dynamic management UI, mobile width. No writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
