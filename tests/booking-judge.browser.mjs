// Judge flow browser check on the curated fixture catalogue (tests/fixtures/curated-bookings.json) served through the
// booking storage read interface with memory sessions: start grid -> Original Booking -> setup -> armed (by keyboard),
// a failed arm, reload of the committed receipt, Drops -> Review -> Confirmed, cannot-start paths and an eligibility
// change over time, at 320, 768 and 1440 px. No live supplier, Altovo or Gemini calls. Listens on port 0.
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createMemorySessionStorage } from '../app/quotation-session-storage.mjs';
import { curated, plannedBookings } from './fixtures/roomdrop-harness.mjs';

const output = resolve('.local/judge-flow/browser'); await mkdir(output, { recursive: true });
let playwright; try { playwright = await import('playwright'); } catch { playwright = await import(pathToFileURL(join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
const cache = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'ms-playwright');
const builds = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
const browser = await playwright.chromium.launch({ headless: true, executablePath: join(cache, builds[0], 'chrome-win64/chrome.exe') });
// The fixture's Siam card has its reviewed S0.5 hotel photo; the Hyatt card has none and keeps the honest fallback.
// Neither has a booked-room photo (the emulator walk, tests/booking-emulator.browser.mjs, covers one).
const SIAM_ALT = 'Siam Kempinski Hotel Bangkok and its pool gardens';
const start = async (now, input = curated()) => {
  const server = createBookingDemoServer({ bookingStorage: plannedBookings(input), sessionStorage: createMemorySessionStorage({ now }), now });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, origin: 'http://127.0.0.1:' + server.address().port };
};
const servers = [];
const { origin } = servers[servers.push(await start(() => new Date('2026-10-20T00:00:00Z'))) - 1];
const report = { status: 'started', checks: [], errors: [], external: [], screenshots: [] };
const SIAM = 'AIRB000180'; const HYATT = 'AIRB000179';
try {
  for (const width of [320, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 1440 ? 'no-preference' : 'reduce' });
    await context.route('**/*', route => [origin, ...servers.map(item => item.origin)].includes(new URL(route.request().url()).origin) ? route.continue()
      : (report.external.push(route.request().url()), route.abort()));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/status of 503/.test(m.text())) report.errors.push(m.text()); });
    const visible = id => page.locator('#' + id).waitFor({ state: 'visible' });
    const active = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('name') || document.activeElement?.className);
    const focused = async id => assert.equal(await page.evaluate(() => document.activeElement?.id), id, width + ' focus ' + id);
    // Presses Tab until the element matching `selector` has focus: the judge's own keyboard path.
    const tabTo = async selector => {
      for (let i = 0; i < 20; i += 1) {
        if (await page.evaluate(s => document.activeElement?.matches(s), selector)) return;
        await page.keyboard.press('Tab');
      }
      assert.fail(width + ' could not tab to ' + selector + ', at ' + await active());
    };
    const shot = async (stage, fullPage = true) => {
      assert.doesNotMatch(await page.locator('body').innerText(), /fictional|potential refund after|AirBorneo|[–—]/i, stage);
      assert.equal(await page.locator('img[src*="altovo" i], img[alt*="altovo" i], img[alt*="airborneo" i]').count(), 0, stage + ' partner branding');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), stage + ' overflow at ' + width);
      for (const button of await page.locator('button:visible').all()) assert((await button.boundingBox()).height >= 44, stage + ' small control at ' + width);
      const path = join(output, stage + '-' + width + '.png'); await page.screenshot({ path, fullPage }); report.screenshots.push(path);
    };
    // The journey strip: which of the three steps is current, from the visible screen.
    const step = async expected => assert.equal(await page.locator('#journey-strip [aria-current="step"]').getAttribute('data-step'), String(expected), width + ' journey step');
    // The hand-off after the committed arm: leave the booking site, then open the RoomDrop app by keyboard.
    const handoff = async (email = null) => {
      await visible('handoff'); await focused('open-roomdrop'); await step(2);
      assert.equal(await page.locator('#checking-title').innerText(), 'Drop Watch armed');
      assert.match(await page.locator('#checking-status').innerText(), /You're leaving the booking site\./);
      assert.equal(await page.locator('#handoff-text').innerText(), 'In real life your drop arrives by email. For this demo we open the RoomDrop app now.');
      assert.equal(await page.locator('#handoff-email').isVisible(), Boolean(email));
      if (email) assert.match(await page.locator('#handoff-email').innerText(), new RegExp(email.replace(/[*.]/g, '\\$&')));
      await page.keyboard.press('Enter');
    };
    const arm = async (choice, expectEmpty = false) => {
      await page.locator(`input[name="minimum-saving"][value="${choice}"]`).check();
      await page.locator('#arm-watch').click();
      await visible('checking-screen');
      assert.match(await page.locator('#checking-replay').innerText(), /Replayed check · captured 18 Oct 2026, 12:10 UTC · not live/);
      // Re-arms happen after the saved address exists, which they keep.
      await handoff('j***@example.test');
      await visible('armed-strip'); await focused('armed-title');
      assert.equal(await page.locator('#offer-empty').isVisible(), expectEmpty);
    };

    // F6 start grid: curated photo/city/dates/price/scenario cards, no code or link input.
    await page.goto(origin); await visible('catalogue-screen');
    assert.equal(new URL(page.url()).hash, '#start'); assert.equal(await page.locator('#customer-steps').isVisible(), false);
    assert.equal(await page.locator('.catalogue-card').count(), 2);
    assert.equal(await page.locator('#content input:visible, #content textarea:visible').count(), 0, 'no free-text code or share-link input');
    const siamCard = page.locator(`[data-code="${SIAM}"]`); const hyattCard = page.locator(`[data-code="${HYATT}"]`);
    assert.match(await siamCard.locator('.watch-tag').innerText(), /Drop Watch ready/);
    assert.equal(await siamCard.locator('.scenario-label').innerText(), 'Free cancellation');
    assert.match(await siamCard.innerText(), /Bangkok, Thailand[\s\S]*17 Feb - 18 Feb · 1 night[\s\S]*MYR 2,335\.52/);
    // A reviewed photo loads and is labelled as the hotel's; no photo means the drawn fallback and no label.
    assert.equal(await siamCard.locator('img.card-photo').getAttribute('alt'), SIAM_ALT);
    await page.waitForFunction(code => document.querySelector(`[data-code="${code}"] img.card-photo`)?.naturalWidth > 0, SIAM);
    assert.equal(await siamCard.locator('.photo-tag').innerText(), 'Hotel photo');
    assert.match(await hyattCard.locator('.watch-tag').innerText(), /Cannot start: non-refundable/);
    assert.equal(await hyattCard.locator('.scenario-label').count(), 0);
    assert.equal(await hyattCard.locator('.photo-fallback').getAttribute('aria-label'), 'No photo yet · Kuala Lumpur');
    assert.equal(await hyattCard.locator('.photo-tag').count(), 0);
    assert.equal(await page.locator('#journey-strip li').count(), 3); await step(1);
    assert.match(await page.locator('#journey-strip').innerText(), /Pick a booking[\s\S]*Made on Altovo's booking engine, not part of this submission\. RoomDrop starts at the confirmation\.[\s\S]*Set up a drop[\s\S]*RoomDrop[\s\S]*Invite on the confirmation page \(or in the confirmation email\)\.[\s\S]*Get your drop[\s\S]*RoomDrop app[\s\S]*Cheaper room found\? It arrives by email\./);
    await shot('start');

    // F6 Original Booking, opened by keyboard; refresh keeps the page.
    await siamCard.locator('.catalogue-open').focus(); await page.keyboard.press('Enter');
    await visible('booked-screen'); await focused('booked-title');
    assert.equal(new URL(page.url()).hash, '#booked-' + SIAM);
    const booked = await page.locator('#booked-screen').innerText();
    assert.match(booked, /Your agency booked this/i);
    assert.match(booked, /Altovo staging quotation standing in for a confirmed booking - captured 18 Oct 2026/); await step(2);
    assert.match(booked, /Free cancellation until 14 Feb 2027, 16:58 UTC/); assert.match(booked, /MYR 2,335\.52/); assert.match(booked, /1 guest/);
    assert.equal(await page.locator('#booked-screen button.primary:visible').count(), 1, 'one primary action');
    assert.equal(await page.locator('#setup-drop').innerText(), 'Set up a drop');
    assert.equal(await page.locator('#booked-photo img.card-photo').getAttribute('alt'), SIAM_ALT);
    assert.equal(await page.locator('#booked-photo-tag').innerText(), 'Hotel photo');
    assert.equal(await page.locator('#booked-room').isVisible(), false, 'no room photo without a reviewed one');
    if (width === 768) { await page.reload(); await visible('booked-screen'); }
    await page.waitForFunction(() => document.querySelector('#booked-photo img')?.naturalWidth > 0);
    await shot('booked');

    // F7a setup by keyboard: consent is required, then a failed arm stays retryable and never shows armed.
    await page.locator('#booked-title').focus(); await tabTo('#setup-drop'); await page.keyboard.press('Enter');
    await visible('setup-screen'); await focused('setup-title');
    assert.equal(await page.locator('input[name="minimum-saving"]').count(), 4);
    assert.match(await page.locator('#minimum-options').innerText(), /Any drop\s+MYR 10 or more/);
    await tabTo('input[name="minimum-saving"]:checked'); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('input[name="minimum-saving"][value="5000"]').isChecked(), true);
    await tabTo('#arm-watch'); await page.keyboard.press('Enter');
    await page.getByText('Tick the box so RoomDrop may check this booking').waitFor(); await focused('judge-consent');
    await page.keyboard.press('Space'); assert.equal(await page.locator('#judge-consent').isChecked(), true);
    // The optional delivery email, by keyboard: a malformed address is flagged in place, then corrected.
    assert.match(await page.locator('label[for="delivery-email"]').innerText(), /Where should we send your drop\?/);
    assert.match(await page.locator('#delivery-consent').innerText(), /^Use this email only to send my drop\. Email delivery is not live yet; it is kept only with this 1-hour demo session\.$/);
    await page.locator('#delivery-email').focus(); await page.keyboard.type('judge@example'); await page.keyboard.press('Tab');
    assert.equal(await page.locator('#delivery-problem').innerText(), 'Check the email address, or leave it empty.');
    assert.equal(await page.locator('#delivery-email').getAttribute('aria-invalid'), 'true');
    await page.locator('#delivery-email').focus(); await page.keyboard.type('.test');
    assert.equal(await page.locator('#delivery-problem').isVisible(), false);
    await step(2);
    await shot('setup');
    let failed = 0;
    await page.route(`**/api/booking-demo/q/${SIAM}/watch`, route => (failed += 1, route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"DEMO_UNAVAILABLE"}}' })));
    await tabTo('#arm-watch'); await page.keyboard.press('Enter');
    await page.getByText('Your Drop Watch could not be armed. Please try again.').waitFor();
    assert.equal(failed, 1);
    assert.deepEqual([await page.locator('#setup-screen').isVisible(), await page.locator('#armed-strip').isVisible(), await page.locator('#checking-screen').isVisible()], [true, false, false]);
    assert.equal(new URL(page.url()).hash, '#setup-' + SIAM); assert.equal(await page.locator('#arm-watch').isDisabled(), false);
    await shot('arm-failed');
    await page.unroute(`**/api/booking-demo/q/${SIAM}/watch`);
    const armed = page.waitForResponse(response => response.url().endsWith(`/q/${SIAM}/watch`) && response.request().method() === 'POST');
    await page.locator('#arm-watch').focus(); await page.keyboard.press('Enter');
    const receipt = await (await armed).json();
    await visible('checking-screen');
    assert.match(await page.locator('#checking-replay').innerText(), /Replayed check · captured 18 Oct 2026, 12:10 UTC · not live/);
    await shot('checking', false);
    await visible('handoff'); await shot('handoff');
    await handoff();
    await visible('armed-strip'); await focused('armed-title'); await step(3);
    assert.deepEqual([receipt.watch.revision, receipt.watch.minimumSavingMinor, receipt.dropOptionIds.length], [1, 5000, 2]);
    assert.equal(new URL(page.url()).hash, '#drops-' + SIAM);
    const detail = await page.locator('#armed-detail').innerText();
    assert.equal(detail, 'Drops of MYR 50 or more · replayed check from 18 Oct 2026, 12:10 UTC');
    assert.equal(await page.locator('#offers .offer-ticket').count(), 2);
    await shot('armed');

    // Reload after arming shows the same committed receipt.
    await page.reload(); await visible('armed-strip');
    assert.equal(await page.locator('#armed-detail').innerText(), detail);
    assert.deepEqual(await page.evaluate(async code => (await (await fetch('/api/booking-demo/q/' + code)).json()).watch, SIAM), receipt.watch);

    // The arm request with a delivery email, as judge.armRequestBody builds it (Part 2's arm() sends it): the
    // address commits with the arm and comes back masked only. Synthetic address.
    const emailed = await page.evaluate(async ({ code, revision }) => {
      const data = await (await fetch('/api/booking-demo/q/' + code)).json();
      const response = await fetch('/api/booking-demo/q/' + code + '/watch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
        body: JSON.stringify({ snapshotVersion: data.snapshotVersion, consent: true, minimumSavingMinor: 5000, expectedRevision: revision, deliveryEmail: 'judge@example.test' }) });
      return response.text();
    }, { code: SIAM, revision: receipt.watch.revision });
    assert.doesNotMatch(emailed, /judge@/); assert.equal(JSON.parse(emailed).watch.delivery.maskedEmail, 'j***@example.test');
    await page.reload(); await visible('armed-strip');
    // Re-arm with new minima (existing Drops screens consume the receipt); the saved address shows masked and is kept.
    await page.goBack(); await page.goForward(); await visible('armed-strip');
    await page.locator('#change-minimum').click(); await visible('setup-screen');
    assert.equal(await page.locator('#delivery-saved-email').innerText(), 'j***@example.test');
    assert.equal(await page.locator('input[name="minimum-saving"][value="5000"]').isChecked(), true);
    assert.equal(await page.locator('#arm-watch').innerText(), 'Update my Drop Watch');
    await page.locator('input[name="minimum-saving"][value="25000"]').check(); await page.locator('#arm-watch').click();
    await visible('checking-screen'); await shot('handoff-email', false); await handoff('j***@example.test');
    await visible('armed-strip'); assert.equal(await page.locator('#offer-empty').isVisible(), true);
    assert.doesNotMatch(await page.locator('body').innerText(), /judge@/);
    assert.match(await page.locator('#offer-empty').innerText(), /No drops above your minimum yet/);
    await shot('empty');
    await page.locator('#lower-minimum').click(); await visible('setup-screen'); await arm(1000);
    assert.equal(await page.locator('#offers .offer-ticket').count(), 3);
    assert.equal((await page.evaluate(async code => (await (await fetch('/api/booking-demo/q/' + code)).json()).watch, SIAM)).revision, 4);

    const first = page.locator('#offers .offer-action').first(); await first.focus(); await page.keyboard.press('Enter');
    await visible('comparison'); assert.match(new URL(page.url()).hash, /^#review-AIRB000180$/);
    if (await page.locator('#flexibility-warning').isVisible()) await page.locator('#accept-reduced-flexibility').check();
    await shot('review');
    await page.locator('#approve-offer').click(); await visible('simulated-switch'); await focused('switch-stage');
    assert.equal(new URL(page.url()).hash, '#confirmed-AIRB000180');
    assert.match(await page.locator('#switch-reassurance').innerText(), /No reservation, cancellation, payment or refund was made/);
    await shot('confirmed');
    await page.reload(); await visible('simulated-switch');
    await page.goBack(); await visible('comparison'); await page.goBack(); await visible('armed-strip');

    // Cannot start: the reason, with the setup action shown but disabled; direct setup links fall back.
    await page.locator('.brand').click(); await visible('catalogue-screen'); await focused('catalogue-title');
    await hyattCard.locator('.catalogue-open').click(); await visible('booked-screen'); await visible('booked-blocked');
    assert.equal(await page.locator('#setup-drop').isDisabled(), true);
    assert.equal(await page.locator('#setup-drop').getAttribute('aria-describedby'), 'blocked-title');
    assert.match(await page.locator('#booked-blocked').innerText(), /non-refundable/i);
    assert.match(await page.locator('#booked-screen').innerText(), /Non-refundable/);
    assert.equal(await page.locator('#booked-photo-tag').isVisible(), false, 'no photo tag on the fallback');
    assert.equal(await page.locator('#booked-room').isVisible(), false);
    await shot('cannot-start');
    await page.goto(origin + '/#setup-' + HYATT); await visible('booked-blocked');
    await page.locator('#pick-another').click(); await visible('catalogue-screen');
    await page.goBack(); await visible('booked-blocked');
    report.checks.push({ width, start: 'passed', booked: 'passed', keyboard: 'passed', consentRequired: 'passed', failedArm: 'passed', armed: 'passed',
      reloadReceipt: 'passed', minimumFilter: 'passed', empty: 'passed', review: 'passed', confirmed: 'passed', backForward: 'passed', cannotStart: 'passed' });
    await context.close();
  }

  // Eligibility is evaluated at the actual time: once free cancellation ends the card and the page say so.
  const late = servers[servers.push(await start(() => new Date('2027-02-15T00:00:00Z'))) - 1];
  const context = await browser.newContext({ viewport: { width: 768, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === late.origin ? route.continue() : (report.external.push(route.request().url()), route.abort()));
  const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(late.origin); await page.locator('#catalogue-screen').waitFor({ state: 'visible' });
  const card = page.locator(`[data-code="${SIAM}"]`);
  assert.match(await card.locator('.watch-tag').innerText(), /Cannot start: free cancellation ended/);
  assert.equal(await card.locator('.scenario-label').count(), 0, 'an ended scenario is not advertised');
  // A supplied photo still renders after the window closes; the other card keeps the fallback.
  assert.equal(await card.locator('img.card-photo').getAttribute('alt'), SIAM_ALT);
  assert.equal(await page.locator(`[data-code="${HYATT}"] .photo-fallback`).count(), 1);
  await page.screenshot({ path: join(output, 'ended-start-768.png'), fullPage: true }); report.screenshots.push(join(output, 'ended-start-768.png'));
  await page.goto(late.origin + '/#setup-' + SIAM); await page.locator('#booked-blocked').waitFor({ state: 'visible' });
  assert.match(await page.locator('#blocked-title').innerText(), /Free cancellation has ended/);
  assert.equal(await page.locator('#setup-drop').isDisabled(), true);
  await page.screenshot({ path: join(output, 'ended-booked-768.png'), fullPage: true }); report.screenshots.push(join(output, 'ended-booked-768.png'));
  await context.close();
  report.checks.push({ width: 768, endedEligibility: 'passed' });
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'passed';
} catch (e) { report.status = 'failed'; report.error = e.message + ' @ ' + (e.stack.split('\n').find(l => l.includes('booking-judge.browser')) ?? ''); process.exitCode = 1; }
finally {
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  await browser.close(); await Promise.all(servers.map(({ server }) => new Promise(r => { server.closeAllConnections(); server.close(r); })));
}
