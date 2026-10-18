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
const photo = { asset: 'assets/roomdrop-airb000180-hotel.jpg', alt: 'Siam Kempinski Hotel Bangkok - hotel photo' };
for (const option of catalogue.entries[0].bundle.options) option.photo = photo;
const requests = [];
const advisor = { available: true, status: 'test-injected', chat: async request => {
  requests.push(structuredClone(request));
  return { reply: request.message ? `Injected reply: ${request.message}` : 'Injected opening: compare flexibility and indicative savings.' };
} };
const server = createBookingDemoServer({ catalogue, advisor, now: () => new Date('2026-10-20T00:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const report = { status: 'started', storage: 'test-memory-session-with-actual-v3-arm', integratedFirestoreBrowser: 'separate-gate',
  checks: [], errors: [], external: [], screenshots: [] };
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue()
      : (report.external.push(route.request().url()), route.abort()));
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    const visible = id => page.locator('#' + id).waitFor({ state: 'visible' });
    const shot = async stage => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${stage} overflow at ${width}`);
      const path = join(output, `${stage}-${width}.png`); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path);
    };
    const checkLauncher = async stage => {
      const placement = await page.locator('#gemini-launcher').evaluate(button => {
        const box = button.getBoundingClientRect();
        const parent = button.parentElement.getBoundingClientRect();
        const targets = [...document.querySelectorAll('#offers .offer-ticket, #comparison .price-breakdown, #flexibility-warning, .review-actions')]
          .filter(element => element.getClientRects().length).map(element => element.getBoundingClientRect());
        return { inFlow: getComputedStyle(button).position === 'static', insideParent: box.top >= parent.top && box.bottom <= parent.bottom + 1,
          occludesContent: targets.some(target => box.left < target.right && box.right > target.left && box.top < target.bottom && box.bottom > target.top) };
      });
      assert.equal(placement.inFlow, true, `${stage}: Gemini launch button must stay in its heading`);
      assert.equal(placement.insideParent, true, `${stage}: Gemini launch button outside heading`);
      assert.equal(placement.occludesContent, false, `${stage}: Gemini overlaps card or consent/action content`);
    };
    const arm = async (target, minimum = 1000) => {
      await page.goto(origin + '/#setup-' + target); await visible('setup-screen');
      await page.locator('#judge-consent').check();
      await page.locator(`input[name="minimum-saving"][value="${minimum}"]`).check();
      await page.locator('#arm-watch').click(); await visible('armed-strip');
    };
    await arm(code);
    assert.match(await page.locator('#armed-detail').innerText(), /Replayed .*Captured .*not live/);
    assert.equal(await page.locator('#offers .offer-ticket').count(), 3); await checkLauncher('drops'); await shot('drops');
    assert.equal(await page.locator('#offers .photo-tag').filter({ hasText: /^Hotel photo$/ }).count(), 3);
    assert.equal(await page.locator('#offers img').evaluateAll(images => images.every(image => image.getAttribute('src') === '/assets/roomdrop-airb000180-hotel.jpg' && image.complete && image.naturalWidth > 0)), true);
    await page.locator('[data-offer-id="option-fixture-final-deluxe"]').focus(); await page.keyboard.press('Enter');
    await visible('comparison'); await checkLauncher('review'); await page.locator('#approve-offer').click();
    assert.equal(await page.locator('#comparison-photo img').getAttribute('src'), '/' + photo.asset);
    assert.equal(await page.locator('#comparison .review-photo > .photo-tag').innerText(), 'Hotel photo');
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
    assert.equal(await page.locator('#switch-to-photo img').getAttribute('src'), '/' + photo.asset);
    const initial = await (await context.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.equal(initial.confirmation.reservationCreated, false); assert.equal(initial.confirmation.quoteModified, false);
    assert.equal(initial.confirmation.customerRefund, null);
    const second = await browser.newContext();
    const theirs = await (await second.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.equal(theirs.watch, null); assert.equal(theirs.confirmation, null); await second.close();
    await arm(otherCode, 5000);
    assert.equal(await page.locator('#offers .photo-unavailable').count(), await page.locator('#offers .offer-ticket').count());
    assert.equal(await page.locator('#offers .photo-tag').count(), 0);
    const otherDetail = await page.locator('#armed-detail').innerText();
    // Hash routing must use the URL even when a host retains an older history-state object.
    await page.evaluate(code => {
      history.replaceState(history.state, '', '#drops-' + code);
      dispatchEvent(new HashChangeEvent('hashchange'));
    }, code);
    await page.locator('#booking-label').filter({ hasText: code }).waitFor({ timeout: 5000 });
    await page.evaluate(code => { location.hash = '#drops-' + code; }, otherCode);
    await page.locator('#booking-label').filter({ hasText: otherCode }).waitFor();
    await page.evaluate(code => { location.hash = '#drops-' + code; }, code);
    await page.locator('#booking-label').filter({ hasText: code }).waitFor();
    assert.notEqual(await page.locator('#armed-detail').innerText(), otherDetail);
    await page.evaluate(code => { location.hash = '#drops-' + code; }, otherCode);
    await page.locator('#booking-label').filter({ hasText: otherCode }).waitFor();
    assert.equal(await page.locator('#armed-detail').innerText(), otherDetail);
    await page.locator('#gemini-launcher').click(); await visible('gemini-dialog');
    assert.doesNotMatch(await page.locator('.gemini-log').innerText(), /Private to first code/);
    await page.keyboard.press('Escape');
    const untouched = await (await context.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.equal(untouched.confirmation.selectionId, initial.confirmation.selectionId);
    if (width === 320) {
      let release, seen;
      const held = new Promise(resolve => { release = resolve; }), requested = new Promise(resolve => { seen = resolve; });
      const watchUrl = '**/api/booking-demo/q/' + code + '/watch';
      await page.route(watchUrl, async route => { const response = await route.fetch(); seen(); await held; await route.fulfill({ response }); });
      await page.goto(origin + '/#setup-' + code); await visible('setup-screen');
      await page.locator('#arm-watch').click(); await requested;
      await page.evaluate(code => { location.hash = '#drops-' + code; }, otherCode);
      release();
      await page.locator('#booking-label').filter({ hasText: otherCode }).waitFor(); await visible('armed-strip');
      assert.equal(await page.locator('#armed-detail').innerText(), otherDetail);
      await page.unroute(watchUrl);
    }
    // A failed local image must remove the Hotel photo claim, just like an absent photo.
    await page.route('**/' + photo.asset, route => route.fulfill({ status: 404, body: '' }));
    await arm(code);
    await page.waitForFunction(() => document.querySelectorAll('#offers img').length === 0);
    assert.equal(await page.locator('#offers .photo-tag').count(), 0);
    assert.equal(await page.locator('#offers .photo-unavailable').count(), 3);
    await page.unroute('**/' + photo.asset);
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
      twoJudges: 'passed', twoCodes: 'passed', conversationIsolation: 'passed', rearm: 'passed', empty: 'passed', unavailable: 'passed',
      reviewedPhotos: 'passed', missingAndFailedPhotos: 'passed', hashNavigation: 'passed', launcherPlacement: 'passed' });
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }
finally {
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
}
