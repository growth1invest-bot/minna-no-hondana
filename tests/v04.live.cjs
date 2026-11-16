// Opt-in live check: real external responses, no page.route() or API mocks.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.BOOKS_TEST_ORIGIN || 'http://127.0.0.1:8764';
(async () => {
  // A managed proxy may require its own CA trust. An optional, explicit public-key pin
  // is restricted to the test browser; production HTML has no certificate overrides.
  const pin = process.env.PLAYWRIGHT_TEST_CA_SPKI;
  const browser = await chromium.launch({ args: pin ? ['--ignore-certificate-errors-spki-list=' + pin] : [] });
  const evidence = { mode: 'live-external-APIs-no-mocks', timestamp: new Date().toISOString(), origin, responses: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.on('response', r => {
      if (/googleapis\.com|openlibrary\.org|openbd\.jp/.test(r.url()))
        evidence.responses.push({ url: r.url(), status: r.status() });
    });
    await page.goto(origin + '/index-v04.html');
    async function run(text, kind) {
      await page.locator('#search-kind').selectOption(kind);
      await page.locator('#query').fill(text);
      await page.getByRole('button', { name: '検索', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('#search-message').textContent.includes('検索中'), {}, { timeout: 40000 });
      const result = { query: text, kind, message: await page.locator('#search-message').innerText(), titles: await page.locator('.result-info strong').allTextContents() };
      assert.ok(result.titles.length, result.message);
      return result;
    }
    await page.locator('#open-search').click();
    evidence.title = await run('吾輩は猫である', 'intitle');
    assert.ok(evidence.title.titles.length >= 2, 'Expected multiple live search results');
    const image = page.locator('.result img').first();
    await page.locator('.result').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const i = document.querySelector('.result img'); return i && i.complete && i.naturalWidth > 1 && i.style.opacity === '1'; }, {}, { timeout: 30000 });
    evidence.cover = await image.evaluate(i => ({ url: i.src, width: i.naturalWidth, height: i.naturalHeight }));
    assert.ok(evidence.cover.width > 1 && evidence.cover.height > 1);
    const checks = page.locator('.result input:not(:disabled)');
    await checks.nth(0).check(); await checks.nth(1).check();
    await page.locator('#destination').selectOption('want');
    await page.getByRole('button', { name: '選択した本を登録（2冊）' }).click();
    assert.equal(await page.locator('.book').count(), 2);
    await page.reload();
    await page.getByRole('button', { name: '読みたい本', exact: true }).click();
    assert.equal(await page.locator('.book').count(), 2);
    await page.locator('.book').first().click();
    await page.locator('#book-type').selectOption('read');
    await page.locator('#book-favorite').check();
    await page.locator('#save-detail').click();
    await page.reload();
    await page.getByRole('button', { name: 'お気に入り', exact: true }).click();
    assert.equal(await page.locator('.book').count(), 1);
    evidence.registration = { bulk: 2, reload: true, favorite: true, statusSwitch: true };
    await page.waitForFunction(() => { const i = document.querySelector('.book img'); return i && i.complete && i.naturalWidth > 1 && i.style.opacity === '1'; }, {}, { timeout: 30000 });
    await page.screenshot({ path: 'test-results/v04-live-shelf.png', fullPage: true });
    await page.locator('#open-search').click();
    evidence.author = await run('夏目漱石', 'inauthor');
    evidence.isbn = await run('9784101010014', 'isbn');
    await page.screenshot({ path: 'test-results/v04-live-isbn.png', fullPage: true });
    console.log(JSON.stringify(evidence, null, 2));
  } catch (error) {
    evidence.error = error.message;
    throw error;
  } finally {
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/v04-live.json', JSON.stringify(evidence, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
