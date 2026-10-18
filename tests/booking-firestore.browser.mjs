// Integrated acceptance gate. Requires the actual Part 1 modules and fixture in this worktree.
// It never substitutes memory storage, fake arming, production data or a live model call.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { watchBlocker } from '../app/domain/altovo-quotation.mjs';
import { agencyMinimumSavingMinor } from '../app/public/drop-watch.js';

const args = process.argv.slice(2), existing = args.includes('--existing');
const inputPath = args.find(arg => arg.startsWith('--catalogue='))?.slice(12);
const existingPrefix = args.find(arg => arg.startsWith('--prefix='))?.slice(9) ?? 'roomdrop';
assert.ok(args.every(arg => arg === '--existing' || arg.startsWith('--catalogue=') || arg.startsWith('--prefix=')) && existing === Boolean(inputPath));
assert.match(existingPrefix, /^roomdrop(?:Part2[A-Za-z0-9]{1,60})?$/);
const output = resolve(existing ? '.local/part2-firestore-real-browser' : '.local/part2-firestore-browser'); await mkdir(output, { recursive: true });
const report = { status: 'started', proof: 'actual-Part-1-and-Part-2', catalogue: existing ? 'reviewed-real-capture-emulator-only' : 'synthetic-fixture', clock: existing ? 'actual-UTC' : 'injected-test-clock', checks: [], screenshots: [], errors: [], external: [] };
let browser, firestore, server, prefix;
const closeServer = async () => { if (server) { const value = server; server = null; await new Promise(resolve => { value.closeAllConnections(); value.close(resolve); }); } };
try {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-roomdrop-part2');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8281');
  assert.ok(!process.env.K_SERVICE && process.env.NODE_ENV !== 'production');
  let bookingModule, sessionModule, input;
  try {
    [bookingModule, sessionModule, input] = await Promise.all([
      import('../app/booking-storage.mjs'), import('../app/quotation-session-storage.mjs'),
      readFile(inputPath ? resolve(inputPath) : new URL('./fixtures/curated-bookings.json', import.meta.url), 'utf8').then(JSON.parse),
    ]);
  } catch (failure) {
    if (['ERR_MODULE_NOT_FOUND', 'ENOENT'].includes(failure.code)) throw Object.assign(Error('Part 1 dependencies are not integrated into this worktree.'), { code: 'PART1_DEPENDENCIES_UNAVAILABLE' });
    throw failure;
  }
  const { Firestore } = await import('@google-cloud/firestore');
  firestore = new Firestore({ projectId: 'demo-roomdrop-part2', host: '127.0.0.1:8281', ssl: false });
  prefix = 'roomdropPart2Browser' + randomBytes(8).toString('hex');
  const now = existing ? () => new Date() : () => new Date('2026-10-20T00:00:00Z');
  const bookingStorage = bookingModule.createBookingStorage({ firestore, prefix: existing ? existingPrefix : prefix });
  if (!existing) {
  const otherCode = 'PART2002', extra = structuredClone(input.entries[0]);
  extra.code = otherCode; extra.bundle.baseline.quotationCode = otherCode;
  const { schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated } = extra.bundle;
  extra.bundle.snapshotVersion = createHash('sha256').update(JSON.stringify({ schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated })).digest('hex');
  input.entries.push(extra); input.cards.push({ ...input.cards[0], code: otherCode, order: 3 });
  await bookingStorage.importBundle(input, { execute: true, now });
  }
  const loaded = await bookingModule.loadHostedCatalogue(bookingStorage);
  const sessionStorage = sessionModule.createFirestoreSessionStorage({ firestore, prefix, now, catalogueCodes: loaded.entries.map(entry => entry.code) });
  const originals = JSON.stringify(await Promise.all(loaded.entries.map(entry => bookingStorage.getBooking(entry.code))));
  const advisor = { available: true, status: 'test-injected', chat: async () => ({ reply: 'Injected durable Gemini comparison.' }) };
  const start = async (port = 0) => {
    server = createBookingDemoServer({ reviewedCatalogue: loaded, bookingStorage, sessionStorage, now, advisor });
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve)); return server.address().port;
  };
  const port = await start(), origin = 'http://127.0.0.1:' + port;
  let playwright;
  try { playwright = await import('playwright'); }
  catch { playwright = await import(pathToFileURL(join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
  const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
  const builds = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  browser = await playwright.chromium.launch({ headless: true, executablePath: join(cache, builds[0], 'chrome-win64/chrome.exe') });
  const eligible = loaded.entries.filter(entry => watchBlocker(entry.bundle.baseline, now()) === null && entry.bundle.options.length);
  assert.ok(eligible.length >= 2, 'Two currently eligible captured bookings are required');
  const code = eligible[0].code, otherCode = existing ? eligible[1].code : 'PART2002';
  const minimum = agencyMinimumSavingMinor(eligible[0].bundle.baseline.quotedRetail.currency);
  const otherMinimum = agencyMinimumSavingMinor(loaded.entries.find(entry => entry.code === otherCode).bundle.baseline.quotedRetail.currency);
  for (const width of [320, 390, 768, 1024, 1440]) {
    const judge = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const second = await browser.newContext();
    await judge.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue()
      : (report.external.push(new URL(route.request().url()).origin), route.abort()));
    const page = await judge.newPage(); page.on('pageerror', failure => report.errors.push(failure.message));
    const visible = id => page.locator('#' + id).waitFor({ state: 'visible' });
    const shot = async stage => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${stage} overflow at ${width}`);
      const path = join(output, `${stage}-${width}.png`); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path);
    };
    const arm = async (target, minimum) => {
      await page.goto(origin + '/#setup-' + target); await visible('setup-screen'); await page.locator('#judge-consent').check();
      await page.locator(`input[name="minimum-saving"][value="${minimum}"]`).check();
      await page.locator('#delivery-email').fill('judge-private@example.test');
      await page.locator('#arm-watch').click(); await visible('handoff');
      assert.match(await page.locator('#handoff-email').innerText(), /j\*\*\*@example.test/);
      await page.locator('#open-roomdrop').click(); await visible('armed-strip');
      assert.equal(await page.locator('#customer-steps').isVisible(), false);
    };
    if (existing && width === 320) {
      const listing = await (await judge.request.get(origin + '/api/booking-demo/catalogue')).json();
      assert.equal(listing.entries.length, loaded.entries.length); report.catalogueChecks = [];
      for (const entry of listing.entries) {
        const data = await (await judge.request.get(origin + '/api/booking-demo/q/' + entry.code)).json();
        const response = await judge.request.post(origin + '/api/booking-demo/q/' + entry.code + '/watch', {
          headers: { Origin: origin, 'X-CSRF-Token': data.csrfToken }, data: { snapshotVersion: data.snapshotVersion, consent: true,
            minimumSavingMinor: data.agencyMinimumSavingMinor, expectedRevision: data.watch?.revision ?? 0 } });
        const result = await response.json();
        if (data.blocker) { assert.equal(response.status(), 409); assert.equal(result.error.reason, data.blocker); }
        else { assert.equal(response.status(), 200); assert.equal(result.watch.firstCheck.captureStatus, data.capture.status); }
        report.catalogueChecks.push({ code: entry.code, blocker: data.blocker, status: response.status(), captureStatus: data.capture.status });
      }
    }
    await arm(code, minimum); await shot('drops');
    assert.match(await page.locator('#armed-detail').innerText(), /Replayed .*Captured .*not live/);
    assert.equal(await page.locator('#gemini-launcher').evaluate(button => {
      const box = button.getBoundingClientRect();
      return getComputedStyle(button).position === 'static' && [...document.querySelectorAll('#offers .offer-ticket')].every(card => {
        const bounds = card.getBoundingClientRect();
        return box.bottom <= bounds.top || box.top >= bounds.bottom || box.right <= bounds.left || box.left >= bounds.right;
      });
    }), true, 'Gemini must not overlap Drop content');
    const withPhotos = loaded.entries.find(entry => entry.code === code).bundle.options.every(option => option.photo);
    if (withPhotos) {
      await page.waitForFunction(() => [...document.querySelectorAll('#offers img')].every(image => image.complete && image.naturalWidth > 0));
      assert.equal(await page.locator('#offers .photo-tag').filter({ hasText: /^Hotel photo$/ }).count(), await page.locator('#offers .offer-ticket').count());
      assert.equal(await page.locator('#offers img').evaluateAll(images => images.every(image => /^\/assets\/roomdrop-[a-z0-9-]+\.jpg$/.test(image.getAttribute('src')))), true);
    }
    await page.locator('#offers .offer-action').first().focus(); await page.keyboard.press('Enter'); await visible('comparison');
    if (await page.locator('#flexibility-warning').isVisible()) await page.locator('#accept-reduced-flexibility').check();
    await page.locator('#gemini-launcher').click(); await visible('gemini-dialog');
    await page.locator('#gemini-dialog').getByText('Injected durable Gemini comparison.', { exact: true }).waitFor();
    await page.keyboard.press('Escape'); await page.locator('#approve-offer').click(); await visible('simulated-switch'); await shot('confirmed');
    const mine = await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.ok(mine.confirmation?.selectionId, 'Committed confirmation missing from bootstrap');
    assert.equal(mine.confirmation.reservationCreated, false); assert.equal(mine.confirmation.quoteModified, false); assert.equal(mine.confirmation.customerRefund, null);
    const theirs = await (await second.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.equal(theirs.watch, null); assert.equal(theirs.confirmation, null);
    const theirArm = await second.request.post(origin + '/api/booking-demo/q/' + code + '/watch', { headers: { Origin: origin, 'X-CSRF-Token': theirs.csrfToken },
      data: { snapshotVersion: theirs.snapshotVersion, consent: true, minimumSavingMinor: minimum * 5, expectedRevision: 0 } });
    assert.equal(theirArm.status(), 200);
    const unchanged = await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.deepEqual(unchanged.watch, mine.watch); assert.deepEqual(unchanged.confirmation, mine.confirmation);
    await closeServer(); await start(port); // Same cookie/origin, independent server state, same Firestore.
    await page.reload(); await visible('simulated-switch');
    const restored = await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.deepEqual(restored.watch, mine.watch); assert.deepEqual(restored.confirmation, mine.confirmation);
    assert.equal((await (await second.request.get(origin + '/api/booking-demo/q/' + code)).json()).watch.minimumSavingMinor, minimum * 5);
    assert.ok(restored.conversation?.chatHistory.length, 'Durable conversation missing from bootstrap projection');
    await arm(otherCode, otherMinimum);
    if (existing) {
      const otherDetail = await page.locator('#armed-detail').innerText();
      const thirdCode = 'AIRB000182';
      const third = await (await judge.request.get(origin + '/api/booking-demo/q/' + thirdCode)).json();
      assert.equal((await judge.request.post(origin + '/api/booking-demo/q/' + thirdCode + '/watch', {
        headers: { Origin: origin, 'X-CSRF-Token': third.csrfToken }, data: { snapshotVersion: third.snapshotVersion, consent: true,
          minimumSavingMinor: third.agencyMinimumSavingMinor * 5, expectedRevision: third.watch?.revision ?? 0 } })).status(), 200);
      await page.evaluate(code => { location.hash = '#drops-' + code; }, thirdCode);
      await page.locator('#booking-label').filter({ hasText: thirdCode }).waitFor();
      assert.notEqual(await page.locator('#armed-detail').innerText(), otherDetail);
      await page.evaluate(code => { location.hash = '#drops-' + code; }, otherCode);
      await page.locator('#booking-label').filter({ hasText: otherCode }).waitFor();
      assert.equal(await page.locator('#armed-detail').innerText(), otherDetail);
      await shot('hash-navigation-182-to-181');
    }
    assert.deepEqual((await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json()).confirmation, mine.confirmation);
    const beforeRearm = await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json();
    const emptyMinimum = Math.max(25000, ...beforeRearm.options.map(option => option.indicativeDifferenceMinor + minimum));
    const armed = await judge.request.post(origin + '/api/booking-demo/q/' + code + '/watch', { headers: { Origin: origin, 'X-CSRF-Token': beforeRearm.csrfToken },
      data: { snapshotVersion: beforeRearm.snapshotVersion, consent: true, minimumSavingMinor: emptyMinimum, expectedRevision: beforeRearm.watch.revision } });
    assert.equal(armed.status(), 200);
    assert.deepEqual((await armed.json()).dropOptionIds, []);
    await page.goto(origin + '/#drops-' + code); await page.reload(); await visible('armed-strip');
    assert.equal(await page.locator('#offers .offer-ticket').count(), 0);
    const rearmed = await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.equal(rearmed.confirmation, null); await shot('empty');
    const staleTab = await judge.newPage();
    await staleTab.goto(origin + '/#setup-' + code); await staleTab.locator('#setup-screen').waitFor({ state: 'visible' });
    const newer = await judge.request.post(origin + '/api/booking-demo/q/' + code + '/watch', { headers: { Origin: origin, 'X-CSRF-Token': rearmed.csrfToken },
      data: { snapshotVersion: rearmed.snapshotVersion, consent: true, minimumSavingMinor: minimum * 5, expectedRevision: rearmed.watch.revision } });
    assert.equal(newer.status(), 200); const newerReceipt = await newer.json();
    await staleTab.locator('#arm-watch').click();
    await staleTab.locator('#setup-message').filter({ hasText: /changed.*Reload/ }).waitFor();
    assert.equal(await staleTab.locator('#checking-screen').isVisible(), false);
    assert.deepEqual((await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json()).watch, newerReceipt.watch);
    const staleShot = join(output, `stale-tab-${width}.png`); await staleTab.screenshot({ path: staleShot, fullPage: true }); report.screenshots.push(staleShot);
    await staleTab.close();
    report.checks.push({ width, arm: 'passed', qualifyingDrops: 'passed', confirm: 'passed', restart: 'passed', context: 'passed', isolation: 'passed', rearm: 'passed' });
    await judge.close(); await second.close();
  }
  assert.equal(JSON.stringify(await Promise.all(loaded.entries.map(entry => bookingStorage.getBooking(entry.code)))), originals);
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'passed';
} catch (failure) {
  report.status = failure.code === 'PART1_DEPENDENCIES_UNAVAILABLE' ? 'blocked' : 'failed';
  report.code = failure.code ?? 'ACCEPTANCE_FAILED'; report.message = failure.message; process.exitCode = report.status === 'blocked' ? 2 : 1;
} finally {
  await browser?.close(); await closeServer();
  if (firestore) {
    try {
      // Delete only this run's explicit test namespace, including nested immutable Drops and capacity records.
      for (const collection of await firestore.listCollections()) {
        if (prefix && collection.id.startsWith(prefix)) await firestore.recursiveDelete(collection);
      }
    } finally { await firestore.terminate(); }
  }
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
