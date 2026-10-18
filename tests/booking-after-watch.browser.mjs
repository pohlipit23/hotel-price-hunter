// Part 2 UI evidence against the existing memory receipt seam. This does not prove hosted persistence.
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';

const output = resolve('.local/part2-browser'); await mkdir(output, { recursive: true });
let playwright;
try { playwright = await import('playwright'); }
catch { playwright = await import(pathToFileURL(join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
const builds = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
const browser = await playwright.chromium.launch({ headless: true, executablePath: join(cache, builds[0], 'chrome-win64/chrome.exe') });
const catalogue = altovoCatalogueFixture(), code = 'AIRB000180', otherCode = 'PART2002';
const other = structuredClone(catalogue.entries[0]); other.code = otherCode; other.bundle.baseline.quotationCode = otherCode;
// Deliberately share snapshot/option aliases to prove the UI also binds conversation state to code.
catalogue.entries.push(other);
const requests = [];
const advisor = { available: true, status: 'test-injected', chat: async request => {
  requests.push(structuredClone(request));
  return { reply: request.message ? `Injected reply: ${request.message}` : 'Injected opening: compare flexibility and indicative savings.' };
} };
const server = createBookingDemoServer({ catalogue, advisor, now: () => new Date('2026-10-20T00:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const report = { status: 'started', storage: 'memory-receipt-seam', integratedFirestoreBrowser: 'blocked-awaiting-Part-1',
  armRequestAdapter: 'test-only: removes expectedRevision for the legacy non-revisioned base server; v3 revision checks have separate proof',
  checks: [], errors: [], external: [], screenshots: [] };
try {
  for (const width of [320, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue()
      : (report.external.push(route.request().url()), route.abort()));
    // The owned UI now sends the v3 field; the untouched Part 1 base branch predates it.
    await context.route('**/api/booking-demo/q/*/watch', route => {
      const { expectedRevision, ...legacyBody } = route.request().postDataJSON();
      assert.equal(expectedRevision, 0); // These legacy receipts have no revision.
      return route.continue({ postData: JSON.stringify(legacyBody) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    const visible = id => page.locator('#' + id).waitFor({ state: 'visible' });
    const shot = async stage => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${stage} overflow at ${width}`);
      const path = join(output, `${stage}-${width}.png`); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path);
    };
    const arm = async (target, minimum = 1000) => {
      await page.goto(origin + '/#setup-' + target); await visible('setup-screen');
      await page.locator('#judge-consent').check();
      await page.locator(`input[name="minimum-saving"][value="${minimum}"]`).check();
      await page.locator('#arm-watch').click(); await visible('armed-strip');
    };
    await arm(code);
    assert.match(await page.locator('#armed-detail').innerText(), /Replayed .*Captured .*not live/);
    assert.equal(await page.locator('#offers .offer-ticket').count(), 3); await shot('drops');
    await page.locator('[data-offer-id="option-fixture-final-deluxe"]').focus(); await page.keyboard.press('Enter');
    await visible('comparison'); await page.locator('#approve-offer').click();
    assert.match(await page.locator('#review-message').innerText(), /confirm the cancellation flexibility/);
    await page.locator('#accept-reduced-flexibility').check();
    await page.locator('#gemini-launcher').click(); await visible('gemini-dialog');
    await page.locator('#stay-question-dialog').fill('Private to first code'); await page.locator('#gemini-dialog .stay-chat-send').click();
    await page.locator('#gemini-dialog').getByText('Injected reply: Private to first code', { exact: true }).waitFor();
    await shot('chat'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#gemini-dialog').isVisible(), false);
    await page.reload(); await visible('comparison'); // Review survives refresh via its history option id.
    await page.locator('#accept-reduced-flexibility').check(); await shot('review');
    await page.locator('#approve-offer').click(); await visible('simulated-switch');
    assert.match(await page.locator('#switch-reassurance').innerText(), /Original|original/);
    await shot('confirmed'); await page.reload(); await visible('simulated-switch');
    const initial = await (await context.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.equal(initial.confirmation.reservationCreated, false); assert.equal(initial.confirmation.quoteModified, false);
    assert.equal(initial.confirmation.customerRefund, null);
    const second = await browser.newContext();
    const theirs = await (await second.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.equal(theirs.watch, null); assert.equal(theirs.confirmation, null); await second.close();
    await arm(otherCode);
    await page.locator('#gemini-launcher').click(); await visible('gemini-dialog');
    assert.doesNotMatch(await page.locator('.gemini-log').innerText(), /Private to first code/);
    await page.keyboard.press('Escape');
    const untouched = await (await context.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.equal(untouched.confirmation.selectionId, initial.confirmation.selectionId);
    await arm(code, 25000); assert.equal(await page.locator('#offers .offer-ticket').count(), 0);
    assert.match(await page.locator('#offer-empty').innerText(), /captured check/);
    await page.goto(origin + '/#confirmed-' + code); await visible('armed-strip');
    assert.equal(await page.locator('#simulated-switch').isVisible(), false); await shot('empty-after-rearm');
    // Intercept only the public bootstrap to exercise an unavailable receipt, distinct from an empty capture.
    await page.route('**/api/booking-demo/q/' + code, async route => {
      const response = await route.fetch(); const data = await response.json(); data.watch.firstCheck.status = 'unavailable';
      await route.fulfill({ response, json: data });
    });
    await page.reload(); await visible('armed-strip');
    assert.match(await page.locator('#offer-empty').innerText(), /unavailable/);
    assert.equal(await page.locator('#lower-minimum').isVisible(), false); await shot('unavailable');
    await context.close();
    report.checks.push({ width, keyboard: 'passed', reviewRefresh: 'passed', receipt: 'passed', confirmationRefresh: 'passed',
      twoJudges: 'passed', twoCodes: 'passed', conversationIsolation: 'passed', rearm: 'passed', empty: 'passed', unavailable: 'passed' });
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }
finally {
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
}
