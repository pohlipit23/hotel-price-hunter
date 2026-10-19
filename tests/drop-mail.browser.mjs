// Drop email browser check on the curated fixture catalogue, with memory sessions, the memory drop mail store and
// the capture transport: at 320, 768, 1024 and 1440 px the captured email HTML renders without overflow, its images
// load from the app origin and it keeps the replay label; then a fresh browser context opens the email's link,
// the token leaves the address bar at once, the Drops page loads and the judge approves a Drop. A used-up link
// lands on the start page with a friendly note. No live supplier, provider or model calls. Listens on port 0.
// Also writes the owner's review copies to .local/drop-mail-preview: the Drop and nothing-yet emails as HTML
// (images pointed at the hosted origin) plus screenshots at 375 and 600 px (images from this run's server).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createMemorySessionStorage } from '../app/quotation-session-storage.mjs';
import { createCaptureTransport, createDropMailer, createMemoryDropMailStore } from '../app/drop-mail.mjs';
import { REPLAY_LABEL } from '../app/domain/drop-mail-template.mjs';
import { INBOX_GONE } from '../app/public/booking-judge.js';
import { plannedBookings, visit } from './fixtures/roomdrop-harness.mjs';
import { localChromium } from './browser-chromium.mjs';

const output = resolve('.local/drop-mail/browser'); await mkdir(output, { recursive: true });
const preview = resolve('.local/drop-mail-preview'); await mkdir(preview, { recursive: true });
const HOSTED = 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app';
const FONTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
const SIAM = 'AIRB000180';
let playwright; try { playwright = await import('playwright'); } catch { playwright = await import(pathToFileURL(join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
const browser = await playwright.chromium.launch({ headless: true, executablePath: localChromium() });
const now = () => new Date('2026-10-20T00:00:00Z');
const bookingStorage = plannedBookings();
const transport = createCaptureTransport({ from: 'drops@roomdrop.example', environment: {} });
const store = createMemoryDropMailStore({ environment: {}, now });
const server = createBookingDemoServer({ bookingStorage, sessionStorage: createMemorySessionStorage({ now }), now,
  mail: createDropMailer({ store, transport, pepper: 'p'.repeat(40), now }) });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const report = { status: 'started', checks: [], errors: [], external: [], fonts: 0, screenshots: [], previews: [] };
const { contentVersion } = await bookingStorage.getBooking(SIAM);
// A judge arms through the API with an address; the capture transport holds the email it would send.
async function armedEmail(minimumSavingMinor, index) {
  const judge = await visit(origin);
  const response = await judge.post(SIAM, 'watch', { snapshotVersion: contentVersion, consent: true, minimumSavingMinor, deliveryEmail: `judge${index}@example.test` });
  assert.equal(response.status, 200); assert.equal((await response.json()).watch.delivery.status, 'scheduled');
  const message = transport.sent.at(-1); assert.equal(message.to, `judge${index}@example.test`);
  return { message, token: /#inbox-AIRB000180~([A-Za-z0-9_-]{43})"/.exec(message.html)[1] };
}
const blockExternal = async (context, { fonts = false } = {}) => context.route('**/*', route => {
  const target = new URL(route.request().url()).origin;
  if (target === origin) return route.continue();
  if (FONTS.includes(target)) { report.fonts += 1; return fonts ? route.continue() : route.abort(); }
  report.external.push(route.request().url()); return route.abort();
});
try {
  let index = 0;
  for (const width of [320, 768, 1024, 1440]) {
    const drop = await armedEmail(5000, ++index); const empty = await armedEmail(1_000_000, ++index);
    // The email itself, as a mail client would show it in a pane this wide.
    const mailContext = await browser.newContext({ viewport: { width: Math.min(width, 600), height: 900 } });
    await blockExternal(mailContext);
    const mailPage = await mailContext.newPage(); mailPage.on('pageerror', e => report.errors.push(e.message));
    for (const [kind, { message }] of [['drop', drop], ['nothing-yet', empty]]) {
      await mailPage.setContent(message.html.replaceAll(HOSTED, origin), { waitUntil: 'load' });
      const text = await mailPage.locator('body').innerText();
      assert.ok(text.includes(REPLAY_LABEL), kind + ' replay label'); assert.doesNotMatch(text, /[\u2013\u2014]/);
      assert.match(text, kind === 'drop' ? /Your room dropped[\s\S]*-121[\s\S]*See my drops/ : /No drop yet[\s\S]*Open my Drop Watch/);
      if (kind === 'nothing-yet') assert.doesNotMatch(text, /Your room dropped|more drop/);
      assert(await mailPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), kind + ' overflow at ' + width);
      assert(await mailPage.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0 && image.alt !== undefined)), kind + ' images at ' + width);
      const button = mailPage.getByRole('link', { name: kind === 'drop' ? 'See my drops' : 'Open my Drop Watch' });
      assert((await button.boundingBox()).height >= 44, kind + ' button size at ' + width);
      assert.equal(await button.getAttribute('href'), `${origin}/#inbox-${SIAM}~${(kind === 'drop' ? drop : empty).token}`);
      const path = join(output, `email-${kind}-${width}.png`); await mailPage.screenshot({ path, fullPage: true }); report.screenshots.push(path);
    }
    await mailContext.close();

    // A fresh browser (no RoomDrop cookie) follows the Drop email's button, then approves on the Drops page.
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await blockExternal(context);
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(`${origin}/#inbox-${SIAM}~${drop.token}`);
    await page.waitForFunction(code => location.hash === '#drops-' + code, SIAM);
    assert.doesNotMatch(page.url(), new RegExp(drop.token.replace(/[-]/g, '\\-')));
    await page.locator('#booking-label').filter({ hasText: /^Original Booking/ }).waitFor();
    await page.locator('#offers .offer-ticket').first().waitFor();
    assert.equal(await page.locator('#offers .offer-ticket').count(), 2);
    assert.equal(await page.evaluate(() => location.href.includes('inbox')), false);
    const path = join(output, `inbox-drops-${width}.png`); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path);
    await page.locator('#offers .offer-action').first().click(); await page.locator('#approve-offer').waitFor({ state: 'visible' });
    if (await page.locator('#flexibility-warning').isVisible()) await page.locator('#accept-reduced-flexibility').check();
    await page.locator('#approve-offer').click(); await page.locator('#simulated-switch').waitFor({ state: 'visible' });
    const confirmed = join(output, `inbox-confirmed-${width}.png`); await page.screenshot({ path: confirmed, fullPage: true }); report.screenshots.push(confirmed);
    await context.close();
    report.checks.push({ width, email: 'passed', inbox: 'passed', approved: 'passed' });
  }

  // A used-up link: three opens in other browsers, then a fourth lands on the start page with a friendly note.
  const { token } = await armedEmail(5000, ++index);
  for (let use = 0; use < 3; use += 1) {
    const response = await fetch(`${origin}/api/booking-demo/q/${SIAM}/inbox`, { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    assert.equal(response.status, 200);
  }
  const context = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion: 'reduce' });
  await blockExternal(context); const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(`${origin}/#inbox-${SIAM}~${token}`);
  await page.locator('#catalogue-screen').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).hash, '#start'); assert.equal(await page.locator('#page-status').innerText(), INBOX_GONE);
  const gone = join(output, 'inbox-used-375.png'); await page.screenshot({ path: gone, fullPage: true }); report.screenshots.push(gone);
  await context.close(); report.checks.push({ width: 375, usedLink: 'passed' });

  // The owner's review copies: HTML pointed at the hosted origin, screenshots rendered with this run's images and the brand fonts.
  const samples = { drop: (await armedEmail(5000, ++index)).message, 'nothing-yet': (await armedEmail(1_000_000, ++index)).message };
  for (const [kind, message] of Object.entries(samples)) {
    const file = join(preview, `${kind}.html`); await writeFile(file, message.html.replaceAll(origin, HOSTED)); report.previews.push(file);
    await writeFile(join(preview, `${kind}.txt`), `Subject: ${message.subject}\n\n${message.text.replaceAll(origin, HOSTED)}\n`);
    for (const width of [375, 600]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
      await blockExternal(context, { fonts: true }); const page = await context.newPage();
      await page.setContent(message.html, { waitUntil: 'networkidle' });
      const path = join(preview, `${kind}-${width}.png`); await page.screenshot({ path, fullPage: true }); report.previews.push(path);
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'passed';
} catch (e) { report.status = 'failed'; report.error = e.message + ' @ ' + (e.stack.split('\n').find(l => l.includes('drop-mail.browser')) ?? ''); process.exitCode = 1; }
finally {
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(r => { server.closeAllConnections(); server.close(r); });
}
