// Integrated acceptance gate. Requires the actual Part 1 modules and fixture in this worktree.
// It never substitutes memory storage, fake arming, production data or a live model call.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';

const output = resolve('.local/part2-firestore-browser'); await mkdir(output, { recursive: true });
const report = { status: 'started', proof: 'actual-Part-1-and-Part-2', checks: [], screenshots: [], errors: [], external: [] };
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
      readFile(new URL('./fixtures/curated-bookings.json', import.meta.url), 'utf8').then(JSON.parse),
    ]);
  } catch (failure) {
    if (['ERR_MODULE_NOT_FOUND', 'ENOENT'].includes(failure.code)) throw Object.assign(Error('Part 1 dependencies are not integrated into this worktree.'), { code: 'PART1_DEPENDENCIES_UNAVAILABLE' });
    throw failure;
  }
  const { Firestore } = await import('@google-cloud/firestore');
  firestore = new Firestore({ projectId: 'demo-roomdrop-part2', host: '127.0.0.1:8281', ssl: false });
  prefix = 'roomdropPart2Browser' + randomBytes(8).toString('hex');
  const now = () => new Date('2026-10-20T00:00:00Z');
  const bookingStorage = bookingModule.createBookingStorage({ firestore, prefix });
  const otherCode = 'PART2002', extra = structuredClone(input.entries[0]);
  extra.code = otherCode; extra.bundle.baseline.quotationCode = otherCode;
  const { schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated } = extra.bundle;
  extra.bundle.snapshotVersion = createHash('sha256').update(JSON.stringify({ schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated })).digest('hex');
  input.entries.push(extra); input.cards.push({ ...input.cards[0], code: otherCode, order: 3 });
  await bookingStorage.importBundle(input, { execute: true, now });
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
  const code = input.entries[0].code;
  for (const width of [320, 768, 1024, 1440]) {
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
      await page.locator('#arm-watch').click(); await visible('armed-strip');
    };
    await arm(code, 1000); await shot('drops');
    assert.match(await page.locator('#armed-detail').innerText(), /Replayed .*Captured .*not live/);
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
    await closeServer(); await start(port); // Same cookie/origin, independent server state, same Firestore.
    await page.reload(); await visible('simulated-switch');
    const restored = await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.deepEqual(restored.watch, mine.watch); assert.deepEqual(restored.confirmation, mine.confirmation);
    assert.ok(restored.conversation?.chatHistory.length, 'Durable conversation missing from bootstrap projection');
    await arm(otherCode, 5000);
    assert.deepEqual((await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json()).confirmation, mine.confirmation);
    await arm(code, 25000); assert.equal(await page.locator('#offers .offer-ticket').count(), 0);
    const rearmed = await (await judge.request.get(origin + '/api/booking-demo/q/' + code)).json();
    assert.equal(rearmed.confirmation, null); await shot('empty');
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
