import assert from 'node:assert/strict';
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { createQuotationDemoServer } from '../app/quotation-demo-server.mjs';

const input = process.argv.find(arg => arg.startsWith('--snapshot='))?.slice(11);
if (!input) throw Error('Provide a private prepared quotation snapshot.');
const bundle = JSON.parse(await readFile(resolve(input), 'utf8'));
const output = resolve('.local/quotation-demo/browser'); await mkdir(output, { recursive: true });
let playwright; try { playwright = await import('playwright'); }
catch { playwright = await import(pathToFileURL(join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
const cache = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'ms-playwright');
const builds = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (builds[0] ? join(cache, builds[0], 'chrome-win64/chrome.exe') : undefined);
const server = createQuotationDemoServer({ bundle }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const report = { status: 'started', checks: [], screenshots: [], errors: [], blockedExternal: [] };
try {
  for (const width of [320, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (report.blockedExternal.push(route.request().url()), route.abort()));
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(origin); await page.locator('#quote-content').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#quote-hotel').textContent(), bundle.baseline.hotel.name);
    assert.equal(await page.locator('.quote-option').count(), bundle.options.length);
    const inspect = async stage => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${stage} overflows at ${width}`);
      for (const button of await page.locator('button:visible').all()) { const box = await button.boundingBox(); assert(box.height >= 44, `${stage} undersized control`); }
      const name = `${stage}-${width}.png`; await page.screenshot({ path: join(output, name), fullPage: true }); report.screenshots.push(name);
    };
    await inspect('options'); await page.locator('.quote-option button').first().click(); await page.locator('#quote-review-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#quote-demo-consent').isChecked(), false);
    await page.locator('#quote-confirm').click(); await page.getByRole('alert').filter({ hasText: /acknowledgements/ }).waitFor();
    if (width === 320) {
      await page.locator('#review-heading').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'quote-demo-consent');
      await page.keyboard.press('Space'); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'quote-confirm');
      await inspect('review'); await page.keyboard.press('Enter');
    } else { await page.locator('#quote-demo-consent').check(); await inspect('review'); await page.locator('#quote-confirm').click(); }
    await page.locator('#quote-confirmed-screen').waitFor({ state: 'visible' });
    assert.match(await page.locator('#quote-confirmed-screen').innerText(), /No hotel reservation was created/);
    await inspect('confirmed'); await page.reload(); await page.locator('#quote-confirmed-screen').waitFor({ state: 'visible' });
    const api = await (await context.request.get(origin + '/api/quotation-demo')).json();
    assert.equal(api.confirmation.reservationCreated, false); assert.equal(api.confirmation.quoteModified, false);
    assert.doesNotMatch(JSON.stringify(api), /rateDetail|privateReferences|gatewayRequestId/);
    await page.locator('#quote-restart').click();
    const nonref = bundle.options.findIndex(option => option.freeCancellation !== true);
    if (nonref >= 0) {
      await page.locator('.quote-option button').nth(nonref).click();
      assert.equal(await page.locator('#quote-demo-consent').isChecked(), false);
      await page.locator('#quote-demo-consent').check(); await page.locator('#quote-confirm').click();
      await page.getByRole('alert').filter({ hasText: /acknowledgements/ }).waitFor();
      await page.locator('#quote-flexibility-consent').check(); await page.locator('#quote-confirm').click();
      await page.locator('#quote-confirmed-screen').waitFor({ state: 'visible' });
    }
    await page.locator('#quote-restart').click(); await page.keyboard.press('Tab');
    report.checks.push({ width, optionsReviewConfirmation: 'passed', refresh: 'passed', acknowledgement: 'passed', nonRefundable: nonref >= 0 ? 'passed' : 'not-present' });
    await context.close();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.blockedExternal, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; throw error; }
finally {
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  console.log(JSON.stringify(report, null, 2));
}
