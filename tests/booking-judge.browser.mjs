// Judge flow browser check on the curated fixture catalogue (tests/fixtures/curated-bookings.json) served through the
// booking storage read interface with memory sessions: start grid -> the agency's confirmation page -> RoomDrop's setup
// modal (open/close by Esc, X, backdrop and Back) -> armed (by keyboard), a failed arm, the armed add-on after closing,
// reload of the committed receipt, Drops -> Review -> Confirmed, cannot-start paths and an eligibility change over
// time, at 320, 768 and 1440 px. No live supplier, Altovo or Gemini calls. Listens on port 0.
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createMemorySessionStorage } from '../app/quotation-session-storage.mjs';
import { curated, plannedBookings } from './fixtures/roomdrop-harness.mjs';
import { localChromium } from './browser-chromium.mjs';

const output = resolve('.local/judge-flow/browser'); await mkdir(output, { recursive: true });
let playwright; try { playwright = await import('playwright'); } catch { playwright = await import(pathToFileURL(join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
const browser = await playwright.chromium.launch({ headless: true, executablePath: localChromium() });
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
    // The closeout's YouTube embed is expected; it is blocked (no live call) and counted apart from other external requests.
    await context.route('**/*', route => [origin, ...servers.map(item => item.origin)].includes(new URL(route.request().url()).origin) ? route.continue()
      : new URL(route.request().url()).origin === 'https://www.youtube-nocookie.com' ? (report.closeoutVideo = (report.closeoutVideo ?? 0) + 1, route.abort())
      : (report.external.push(route.request().url()), route.abort()));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/status of 503/.test(m.text())) report.errors.push(m.text()); });
    const visible = id => page.locator('#' + id).waitFor({ state: 'visible' });
    // The Drops list (the armed strip is always hidden now). #deal-list is in the static markup, so after a reload
    // also wait for the loaded booking label before reading its content.
    const drops = async () => { await visible('deal-list'); await page.locator('#booking-label').filter({ hasText: /^Original Booking/ }).waitFor(); };
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
    // Which site header the screen shows: none on the start grid, the plain agency mark on booking pages, the RoomDrop
    // logo in the RoomDrop app. The old demo tag is hidden; the judge bar carries the 'Judge demo' badge.
    const site = async expected => assert.deepEqual(
      [await page.locator('.site-header').isVisible(), await page.locator('#agency-brand').isVisible(), await page.locator('.brand').isVisible(), await page.locator('.demo-tag').isVisible()],
      { none: [false, false, false, false], agency: [true, true, false, false], roomdrop: [true, false, true, false] }[expected], width + ' site header ' + expected);
    // The hand-off after the committed arm: leave the booking site, then open the RoomDrop app by keyboard.
    const handoff = async (email = null) => {
      await visible('handoff'); await focused('open-roomdrop'); await step(2); await site('agency');
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
      await drops(); await focused('changes-title');
      assert.equal(await page.locator('#offer-empty').isVisible(), expectEmpty);
    };

    // F6 start grid: curated photo/city/dates/price/scenario cards, no code or link input.
    await page.goto(origin); await visible('catalogue-screen');
    assert.equal(new URL(page.url()).hash, '#start'); assert.equal(await page.locator('#customer-steps').isVisible(), false);
    assert.equal(await page.locator('.catalogue-card').count(), 1, 'non-refundable bookings are not offered to judges');
    assert.equal(await page.locator('#content input:visible, #content textarea:visible').count(), 0, 'no free-text code or share-link input');
    const siamCard = page.locator(`[data-code="${SIAM}"]`); const hyattCard = page.locator(`[data-code="${HYATT}"]`);
    assert.match(await siamCard.locator('.watch-tag').innerText(), /Drop Watch ready/);
    assert.equal(await siamCard.locator('.scenario-label').innerText(), 'Free cancellation');
    assert.match(await siamCard.innerText(), /Bangkok, Thailand[\s\S]*17 Feb - 18 Feb · 1 night[\s\S]*MYR 2,335\.52/);
    // A reviewed photo loads with no label; photos speak for themselves.
    assert.equal(await siamCard.locator('img.card-photo').getAttribute('alt'), SIAM_ALT);
    await page.waitForFunction(code => document.querySelector(`[data-code="${code}"] img.card-photo`)?.naturalWidth > 0, SIAM);
    assert.equal(await page.locator('#catalogue-screen .photo-tag').count(), 0, 'catalogue photos carry no label');
    assert.equal(await hyattCard.count(), 0);
    assert.equal(await page.locator('#journey-strip li').count(), 3); await step(1); await site('none');
    // The journey strip lives in the judge-only bar, outside the product frame.
    assert.deepEqual([await page.locator('#judge-bar').isVisible(), await page.locator('#judge-bar #journey-strip').count(),
      await page.locator('#app-frame #journey-strip').count(), await page.locator('#judge-bar .judge-bar-badge').textContent()], [true, 1, 0, 'Judge demo']);
    assert.match(await page.locator('#journey-strip').innerText(), /Pick a booking[\s\S]*Made on Altovo's booking engine, not part of this submission\. RoomDrop starts at the confirmation\.[\s\S]*Set up a drop[\s\S]*RoomDrop[\s\S]*Invite on the confirmation page \(or in the confirmation email\)\.[\s\S]*Get your drop[\s\S]*RoomDrop app[\s\S]*Cheaper room found\? It arrives by email\./);
    await shot('start');

    // F6 the agency's confirmation page with the RoomDrop add-on, opened by keyboard; refresh keeps the page.
    await siamCard.locator('.catalogue-open').focus(); await page.keyboard.press('Enter');
    await visible('booked-screen'); await focused('booked-title');
    assert.equal(new URL(page.url()).hash, '#booked-' + SIAM);
    const booked = await page.locator('#booked-screen').innerText();
    assert.match(booked, /Your booking is confirmed\s+Confirmation no\. AIRB000180/);
    assert.match(booked, /Altovo staging quotation standing in for a confirmed booking - captured 18 Oct 2026/); await step(2); await site('agency');
    assert.equal(await page.locator('#agency-brand').innerText(), 'Travel Agency');
    assert.equal(await page.locator('#judge-bar-text').innerText(), "This is your travel agency's confirmation page. The framed box is the RoomDrop widget.");
    assert.match(await page.locator('#agency-nav').innerText(), /My trips\s+Help/);
    assert.equal(await page.locator('#agency-nav a, #agency-nav button').count(), 0, 'the agency menu is for looks only');
    assert.match(booked, /Check-in\s+Wed 17 Feb 2027[\s\S]*Check-out\s+Thu 18 Feb 2027/); assert.match(booked, /Room\s+Executive Suite/); assert.match(booked, /Meals\s+Breakfast/);
    assert.match(booked, /Free cancellation until 14 Feb 2027, 16:58 UTC\*/); assert.match(booked, /\*Subject to the hotel's full cancellation terms\./);
    assert.match(booked, /Total paid\s+MYR 2,335\.52/); assert.match(booked, /1 guest/); assert.match(booked, /Lead guest[\s\S]*Manage booking/);
    // The add-on: one short pitch, one button, powered by RoomDrop.
    assert.equal(await page.locator('#drop-offer').getAttribute('data-state'), 'ready');
    assert.match(await page.locator('#drop-offer').innerText(), /^Prices often drop after you book\.\s+We'll watch this one for you\.\s+Set up a drop\s+Powered by\s*$/);
    assert.equal(await page.locator('#drop-offer .powered-logo img').getAttribute('alt'), 'RoomDrop');
    assert.equal(await page.locator('#booked-screen button.primary:visible').count(), 1, 'one primary action');
    assert.equal(await page.locator('#setup-drop').innerText(), 'Set up a drop');
    assert.equal(await page.locator('#booked-photo img.card-photo').getAttribute('alt'), SIAM_ALT);
    assert.deepEqual([await page.locator('#booked-photo-tag').count(), await page.locator('#booked-screen .photo-tag').count()], [0, 0], 'the booked photo carries no label');
    assert.equal(await page.locator('#booked-room').isVisible(), false, 'no room photo without a reviewed one');
    if (width === 768) { await page.reload(); await visible('booked-screen'); }
    await page.waitForFunction(() => document.querySelector('#booked-photo img')?.naturalWidth > 0);
    await shot('booked');

    // The add-on opens RoomDrop's modal over the page (#setup-). Esc, the X, the backdrop and Back each close it and
    // return focus to the add-on's button; focus stays in the modal while it is open.
    const modalOpen = () => page.locator('#drop-modal').evaluate(dialog => dialog.open);
    const closedOnPage = async how => {
      await page.waitForFunction(() => !document.querySelector('#drop-modal').open);
      await page.waitForFunction(code => location.hash === '#booked-' + code, SIAM);
      await page.waitForFunction(() => document.activeElement?.id === 'setup-drop');
      assert.deepEqual([await page.locator('#booked-screen').isVisible(), await page.locator('#setup-screen').isVisible()], [true, false], width + ' closed by ' + how);
    };
    const opensModal = async () => {
      await page.keyboard.press('Enter'); await visible('setup-screen'); await focused('setup-title');
      assert.equal(new URL(page.url()).hash, '#setup-' + SIAM); assert.equal(await modalOpen(), true);
      assert.equal(await page.locator('#booked-screen').isVisible(), true, 'the agency page stays behind the modal'); await step(2); await site('agency');
    };
    await page.locator('#setup-drop').focus(); await opensModal();
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => Boolean(document.activeElement?.closest('#drop-modal'))), width + ' focus left the modal at ' + await active());
    }
    await page.keyboard.press('Escape'); await closedOnPage('Esc');
    await opensModal(); await page.locator('#drop-close').click(); await closedOnPage('X');
    await opensModal(); await page.mouse.click(4, 4); await closedOnPage('backdrop');
    await opensModal(); await page.goBack(); await closedOnPage('Back');
    // A #setup- link opens the page with the modal already open, also on a fresh load.
    await page.evaluate(code => { location.hash = '#setup-' + code; }, SIAM); await visible('setup-screen'); await focused('setup-title');
    await page.reload(); await visible('setup-screen'); await focused('setup-title');
    assert.deepEqual([await modalOpen(), await page.locator('#booked-screen').isVisible()], [true, true]);
    await page.keyboard.press('Escape'); await closedOnPage('Esc after a direct link');

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
    assert.match(await page.locator('label[for="delivery-email"]').innerText(), /Email my drop to\s+Optional/);
    assert.match(await page.locator('#delivery-consent').innerText(), /^Use this email only to send my drop\. Email delivery is not live yet; it is kept only with this 1-hour demo session\.$/);
    await page.locator('#delivery-email').focus(); await page.keyboard.type('judge@example'); await page.keyboard.press('Tab');
    assert.equal(await page.locator('#delivery-problem').innerText(), 'Check the email address, or leave it empty.');
    assert.equal(await page.locator('#delivery-email').getAttribute('aria-invalid'), 'true');
    await page.locator('#delivery-email').focus(); await page.keyboard.type('.test');
    assert.equal(await page.locator('#delivery-problem').isVisible(), false);
    await step(2); await site('agency');
    await shot('setup');
    let failed = 0;
    await page.route(`**/api/booking-demo/q/${SIAM}/watch`, route => (failed += 1, route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"DEMO_UNAVAILABLE"}}' })));
    await tabTo('#arm-watch'); await page.keyboard.press('Enter');
    await page.getByText('RoomDrop is unavailable right now. Please try again.').waitFor();
    assert.equal(failed, 1);
    assert.deepEqual([await page.locator('#setup-screen').isVisible(), await page.locator('#deal-list').isVisible(), await page.locator('#checking-screen').isVisible()], [true, false, false]);
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
    await handoff('j***@example.test');
    // Entering the app plays the launch splash for the full 5s (2s with reduced motion) and the judge bar says so.
    await visible('launch-screen'); const launchedAt = Date.now(); await focused('launch-title'); await step(3);
    assert.equal(await page.locator('#judge-bar-text').innerText(), 'Now starting the RoomDrop app · the hackathon submission');
    assert.equal(await page.locator('#app-frame').evaluate(frame => frame.classList.contains('launching')), true);
    if (width === 1440) { await page.waitForTimeout(2400); await shot('launch', false); }
    await drops(); assert(Date.now() - launchedAt >= (width === 1440 ? 4500 : 1700), width + ' splash too short');
    assert.equal(await page.locator('#app-frame').evaluate(frame => frame.classList.contains('launching')), false);
    await focused('changes-title'); await step(3); await site('roomdrop');
    assert.equal(await page.locator('#changes-title').innerText(), 'Find your next drop');
    // The Drops page opens on the cards: the heading is for screen readers only, with no eyebrow, subline or Change minimum.
    assert((await page.locator('#deal-list .section-heading').boundingBox()).width <= 1, width + ' Drops heading is visually hidden');
    assert.deepEqual(await page.locator('#deal-list .section-heading').evaluate(heading => [...heading.children].map(child => child.id)), ['changes-title']);
    assert.equal(await page.locator('#deal-list button:visible').filter({ hasText: /minimum/i }).count(), 0);
    assert.doesNotMatch(await page.locator('#deal-list').innerText(), /Fresh options|Estimated savings for the whole stay/);
    assert.deepEqual([await page.locator('#armed-strip').isVisible(), await page.locator('footer').isVisible()], [false, false], 'no armed strip or footer on Drops');
    assert.deepEqual([receipt.watch.revision, receipt.watch.minimumSavingMinor, receipt.dropOptionIds.length], [1, 5000, 2]);
    assert.equal(new URL(page.url()).hash, '#drops-' + SIAM);
    const detail = await page.locator('#armed-detail').innerText();
    assert.match(detail, /^Drops of MYR 50 or more .*replayed check from 18 Oct 2026, 12:10 UTC/);
    assert.match(detail, /Replayed 20 Oct 2026, 00:00 UTC.*Captured 18 Oct 2026, 12:10 UTC.*not live$/);
    assert.equal(await page.locator('#offers .offer-ticket').count(), 2);
    assert.equal(await page.locator('#customer-steps').isVisible(), false, 'one journey indicator on Drops');
    await shot('armed');

    // Reload after arming shows the same committed receipt.
    await page.reload(); await drops();
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
    assert.equal(JSON.parse(emailed).watch.revision, receipt.watch.revision, 'same email and minimum is an identical retry');
    await page.reload(); await drops();
    // Re-arm with new minima (existing Drops screens consume the receipt); the saved address shows masked and is kept.
    await page.goBack(); await page.goForward(); await drops();
    // With drops showing, the setup route is the way back to the minimum (the Drops page has no Change minimum).
    await page.evaluate(code => { location.hash = '#setup-' + code; }, SIAM); await visible('setup-screen');
    assert.equal(new URL(page.url()).hash, '#setup-' + SIAM);
    assert.equal(await page.locator('#delivery-saved-email').innerText(), 'j***@example.test');
    assert.equal(await page.locator('input[name="minimum-saving"][value="5000"]').isChecked(), true);
    assert.equal(await page.locator('#arm-watch').innerText(), 'Update my Drop Watch');
    await page.locator('input[name="minimum-saving"][value="25000"]').check(); await page.locator('#arm-watch').click();
    await visible('handoff'); assert.equal(await page.locator('#handoff-email').innerText(), 'Saved for j***@example.test · not sent yet');
    await shot('handoff-email', false);
    // Closing the modal after arming leaves the judge on the agency page, where the add-on now says armed.
    await page.locator('#drop-close').click();
    await page.waitForFunction(code => location.hash === '#booked-' + code, SIAM); await page.locator('#drop-offer[data-state="armed"]').waitFor();
    assert.match(await page.locator('#drop-offer').innerText(), /^Drop Watch armed\s+Drops of MYR 250 or more\s+Open RoomDrop\s*→\s+Change my Drop Watch\s+Powered by\s*$/);
    assert.equal(await modalOpen(), false); await focused('setup-drop'); await step(2); await site('agency');
    assert.equal(await page.locator('#booked-screen button.primary:visible').count(), 1, 'one primary action when armed');
    await shot('armed-card');
    await page.locator('#drop-open').click(); await visible('launch-screen');
    await drops(); assert.equal(await page.locator('#offer-empty').isVisible(), true);
    assert.doesNotMatch(await page.locator('body').innerText(), /judge@/);
    assert.equal(await page.locator('#offer-empty').innerText(), 'No drops above your minimum yet. Your original booking stays active.');
    await shot('empty');
    await page.locator('#lower-minimum').click(); await visible('setup-screen'); await arm(1000);
    assert.equal(await page.locator('#offers .offer-ticket').count(), 3);
    assert.equal((await page.evaluate(async code => (await (await fetch('/api/booking-demo/q/' + code)).json()).watch, SIAM)).revision, receipt.watch.revision + 2);

    const first = page.locator('#offers .offer-action').first(); await first.focus(); await page.keyboard.press('Enter');
    await visible('comparison'); assert.match(new URL(page.url()).hash, /^#review-AIRB000180$/);
    if (await page.locator('#flexibility-warning').isVisible()) await page.locator('#accept-reduced-flexibility').check();
    await site('roomdrop'); await shot('review');
    await page.locator('#approve-offer').click(); await visible('simulated-switch'); await focused('switch-stage');
    assert.equal(new URL(page.url()).hash, '#confirmed-AIRB000180');
    // The RoomDrop app ends at the confirmation: only the next-step choice shows. Hidden parts keep their text.
    assert.equal(await page.locator('#switch-reassurance').innerText(), 'Your original booking stays active.');
    for (const id of ['switch-state', 'switch-trail', 'switch-reassurance', 'switch-money', 'switch-message', 'done-button'])
      assert.equal(await page.locator('#' + id).isVisible(), false, width + ' confirmed hides ' + id);
    assert.equal(await page.locator('footer').isVisible(), false, 'no page footer on Confirmed'); await site('roomdrop');
    assert.equal(await page.locator('#switch-next-title').innerText(), 'What next?');
    await shot('confirmed');
    await page.reload(); await visible('simulated-switch');
    // Once confirmed, the review and Drops routes land on the confirmation. The confirmation focuses its heading
    // each time it renders, which proves the route ran (the screen was already showing).
    const landsConfirmed = async (route, hidden) => {
      await page.locator('#keep-watching').focus(); await page.goBack();
      await page.waitForFunction(() => document.activeElement?.id === 'switch-stage');
      assert.equal(new URL(page.url()).hash, '#' + route + '-' + SIAM);
      assert.deepEqual([await page.locator('#simulated-switch').isVisible(), await page.locator('#' + hidden).isVisible()], [true, false], route + ' lands on Confirmed');
    };
    await landsConfirmed('review', 'comparison'); await landsConfirmed('drops', 'deal-list');

    // Either "What next?" choice ends the app on the judge closeout, outside both sites, with the video.
    // Neither choice is sent to the server: no write while choosing (Back reloads the booking with plain GETs).
    const sent = []; const onRequest = request => { if (new URL(request.url()).origin === origin && request.method() !== 'GET') sent.push(request.method() + ' ' + request.url()); };
    page.on('request', onRequest);
    const closeoutShows = async (choice, last) => {
      await visible('closeout-screen'); await focused('closeout-title'); await site('none');
      assert.equal(new URL(page.url()).hash, '#done-' + SIAM);
      assert.equal(await page.locator('#closeout-title').innerText(), "That's the RoomDrop app, start to finish");
      assert.equal(await page.locator('#closeout-choice').innerText(), choice);
      const stepsText = await page.locator('#closeout-steps li').allInnerTexts();
      assert.equal(stepsText.length, 3); assert.match(stepsText[2], last);
      assert.equal(await page.locator('#judge-bar-text').innerText(), 'The RoomDrop app ends here · thanks for judging');
      assert.equal(await page.locator('#journey-strip li.passed').count(), 3, 'every journey step passed');
      assert.equal(await page.locator('#closeout-video-frame iframe').getAttribute('src'), 'https://www.youtube-nocookie.com/embed/zKe3UFlgUNc');
      assert.deepEqual([await page.locator('#deal-list').isVisible(), await page.locator('#simulated-switch').isVisible()], [false, false]);
    };
    await page.locator('#keep-watching').click();
    await closeoutShows('You chose: keep watching for drops', /emails you if it drops again/);
    await shot('closeout');
    // Back returns straight to the confirmation: no launch splash, the app is not starting again.
    await page.goBack(); await visible('simulated-switch');
    assert.equal(await page.locator('#launch-screen').isVisible(), false, 'no splash on the way back from the closeout');
    await page.locator('#keep-for-good').focus(); await page.keyboard.press('Enter');
    await closeoutShows('You chose: keep this booking for good', /Drop Watch stops/);
    page.off('request', onRequest); assert.deepEqual(sent, [], 'next-step choice sent a request');
    // A reload keeps the choice in this tab.
    await page.reload(); await closeoutShows('You chose: keep this booking for good', /Drop Watch stops/);

    // Pick another booking returns to the start page.
    await page.locator('#closeout-restart').click(); await visible('catalogue-screen'); await focused('catalogue-title');
    assert.equal(new URL(page.url()).hash, '#start');
    // Cannot start: the add-on says so with the reason and has no button; direct setup links fall back to the page.
    // Not on the picker, but a direct link still shows why it cannot start.
    await page.evaluate(code => { location.hash = '#booked-' + code; }, HYATT); await visible('booked-screen'); await visible('booked-blocked');
    assert.equal(await page.locator('#drop-offer').getAttribute('data-state'), 'blocked');
    assert.equal(await page.locator('#drop-offer-title').innerText(), "Can't watch this booking");
    assert.equal(await page.locator('#blocked-title').innerText(), 'This booking is non-refundable');
    assert.equal(await page.locator('#drop-offer button:visible').count(), 0, 'no button on a booking that cannot start');
    assert.deepEqual([await page.locator('#setup-drop').isVisible(), await page.locator('#setup-drop').isDisabled()], [false, true]);
    assert.equal(await page.locator('#setup-drop').getAttribute('aria-describedby'), 'blocked-title');
    assert.match(await page.locator('#booked-screen').innerText(), /Cancellation policy\s+Non-refundable/);
    assert.doesNotMatch(await page.locator('#booked-screen').innerText(), /Subject to the hotel's full cancellation terms/);
    assert.equal(await page.locator('#booked-screen .photo-tag').count(), 0, 'no photo tag on the fallback');
    assert.equal(await page.locator('#booked-room').isVisible(), false);
    await shot('cannot-start');
    await page.goto(origin + '/#setup-' + HYATT); await visible('booked-blocked');
    assert.equal(await modalOpen(), false, 'no setup modal on a booking that cannot start');
    await page.locator('#booked-back').click(); await visible('catalogue-screen');
    await page.goBack(); await visible('booked-blocked');
    report.checks.push({ width, start: 'passed', booked: 'passed', modalRoutes: 'passed', focusReturn: 'passed', keyboard: 'passed', consentRequired: 'passed', failedArm: 'passed', armed: 'passed', armedCard: 'passed',
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
  // A supplied photo still renders after the window closes; the non-refundable booking stays off the picker.
  assert.equal(await card.locator('img.card-photo').getAttribute('alt'), SIAM_ALT);
  assert.equal(await page.locator(`[data-code="${HYATT}"]`).count(), 0);
  await page.screenshot({ path: join(output, 'ended-start-768.png'), fullPage: true }); report.screenshots.push(join(output, 'ended-start-768.png'));
  await page.goto(late.origin + '/#setup-' + SIAM); await page.locator('#booked-blocked').waitFor({ state: 'visible' });
  assert.match(await page.locator('#blocked-title').innerText(), /Free cancellation has ended/);
  assert.equal(await page.locator('#drop-offer-title').innerText(), "Can't watch this booking");
  assert.deepEqual([await page.locator('#setup-drop').isDisabled(), await page.locator('#drop-offer button:visible').count(), await page.locator('#drop-modal').evaluate(dialog => dialog.open)], [true, 0, false]);
  await page.screenshot({ path: join(output, 'ended-booked-768.png'), fullPage: true }); report.screenshots.push(join(output, 'ended-booked-768.png'));
  await context.close();
  report.checks.push({ width: 768, endedEligibility: 'passed' });
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'passed';
} catch (e) { report.status = 'failed'; report.error = e.message + ' @ ' + (e.stack.split('\n').find(l => l.includes('booking-judge.browser')) ?? ''); process.exitCode = 1; }
finally {
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  await browser.close(); await Promise.all(servers.map(({ server }) => new Promise(r => { server.closeAllConnections(); server.close(r); })));
}
