/* B1 customer acceptance against a task-owned in-memory server.
   node tests/b1.browser.mjs
   Or import runB1(browser, origin) from an isolated Playwright browser.
   No .env, Firestore, Gemini, external page requests, or personal profile. */
import assert from 'node:assert/strict';
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createAppServer } from '../app/server.mjs';
import { createTestMemoryStorage } from '../app/storage.mjs';

const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
const widths = [320, 375, 390, 768, 1024, 1440];
const evidence = new URL('../.local/ux-review-option-b/validation/', import.meta.url);
const disk = value => fileURLToPath(value);

export async function startSafeB1Server() {
  const server = createAppServer({ storage: createTestMemoryStorage(), fixture,
    advisor: { available: false, status: 'unconfigured', async advise() { throw Object.assign(new Error('Live advice disabled for local verification.'), { code: 'ADVICE_UNAVAILABLE' }); } },
    now: () => new Date(fixture.demoNow) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

export async function runB1(browser, origin, { allowFonts = false } = {}) {
  await mkdir(evidence, { recursive: true });
  const checks = [], screenshots = [], geometry = [], syntheticFixtures = [], blockedExternal = [], errors = [], contexts = [];
  let checkpoint = 'setup';
  const result = status => ({ status, checkpoint, storage: 'test-memory', fontMode: allowFonts ? 'Google Fonts allowed' : 'external fonts blocked; fallback typography', checks, screenshots, geometry, syntheticFixtures, blockedExternal, errors });
  const settled = page => page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  async function fresh(width = 375, bootstrapOverride = null, { dark = false, failPhotos = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
    contexts.push(context);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (failPhotos && url.pathname === '/assets/illustrative-stays.jpg') return route.abort();
      if (url.origin !== origin) {
        if (allowFonts && ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(url.origin)) return route.continue();
        blockedExternal.push(url.href); return route.abort();
      }
      if (bootstrapOverride && url.pathname === '/api/bootstrap') {
        const response = await route.fetch();
        return route.fulfill({ response, json: bootstrapOverride(await response.json()) });
      }
      return route.continue();
    });
    const page = await context.newPage(), writes = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() === 'POST') writes.push({ path: new URL(request.url()).pathname, body: request.postDataJSON(), key: request.headers()['idempotency-key'] }); });
    await page.goto(origin);
    await page.locator('#content').waitFor({ state: 'visible' }); await settled(page);
    assert.equal(writes.length, 0, 'Opening page must not mutate state');
    return { page, context, writes };
  }
  async function state(page) { const response = await page.request.get(origin + '/api/bootstrap'); assert(response.ok()); return response.json(); }
  async function reload(test) {
    const count = test.writes.length;
    await test.page.reload(); await test.page.locator('#content').waitFor({ state: 'visible' }); await settled(test.page);
    assert.equal(test.writes.length, count, 'Reload must not mutate state'); return state(test.page);
  }
  async function command(test, selector, endpoint) {
    const response = test.page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(endpoint));
    await test.page.locator(selector).click();
    const reply = await response; assert(reply.ok(), `${selector}: ${reply.status()}`);
    const data = await reply.json(); await settled(test.page); return data;
  }
  async function inspect(page, view) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      const measure = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth,
        boxes: [...document.querySelectorAll('main, section, button, summary')].filter(el => el.getClientRects().length).map(el => {
          const r = el.getBoundingClientRect(); return { name: el.id || el.tagName, left: r.left, right: r.right };
        }) }));
      assert(measure.scroll <= width, `${view}: document overflow at ${width}`);
      for (const box of measure.boxes) assert(box.left >= -1 && box.right <= width + 1, `${view}: clipped ${box.name} at ${width}`);
      const stripedSurfaces = await page.evaluate(() => [...document.querySelectorAll('.ticket, .offer-ticket, .switch-journey, .mini-ticket, .ticket-photo, .offer-photo, .mini-photo')]
        .filter(el => el.getClientRects().length).flatMap(el => ['', '::before', '::after'].map(pseudo => ({
          surface: el.id || el.className, pseudo, background: getComputedStyle(el, pseudo || null).backgroundImage,
        }))).filter(item => /repeating-linear-gradient/i.test(item.background)));
      assert.deepEqual(stripedSurfaces, [], `${view}: a repeating striped bar remains on a ticket/photo surface at ${width}`);
      geometry.push({ view, width, scrollWidth: measure.scroll });
      if ([375, 1440].includes(width)) {
        const target = new URL(`b1-${view}-${width}.png`, evidence);
        await page.screenshot({ path: disk(target), fullPage: true }); screenshots.push(disk(target));
      }
    }
    await page.setViewportSize({ width: 375, height: 1000 });
    const text = await page.locator('body').innerText();
    assert(!/4242|RD-48213|5\s*[-\u2013]\s*10 days|18:00 today|Never pay twice|You won.t pay twice|Cancel until we book|1\.4\s*km/.test(text), `${view}: unsupported design placeholder reached customer`);
    assert(!/matches your room/i.test(text), `${view}: superseded room-match wording remains visible`);
  }
  async function select(test, id = 'DEMO_EQUIVALENT') {
    await command(test, `[data-offer-id="${id}"]`, '/api/selection');
    await test.page.locator('#comparison').waitFor({ state: 'visible' });
  }
  try {
    checkpoint = 'selection/history';
    const test = await fresh(); const { page } = test;
    assert.equal(await page.locator('#offers [data-offer-id]').count(), 3);
    assert((await page.locator('#offers').innerText()).includes('-'), 'Savings lost their minus sign');
    await inspect(page, 'choose');
    for (const [filter, offerId] of [['match', 'DEMO_EQUIVALENT'], ['room', 'DEMO_DIFFERENT_ROOM'], ['hotel', 'DEMO_DIFFERENT_HOTEL']]) {
      const before = test.writes.length;
      await page.locator(`#offer-filters [data-filter="${filter}"]`).click();
      assert.equal(await page.locator('#offers [data-offer-id]:visible').count(), 1);
      assert.equal(await page.locator('#offers [data-offer-id]:visible').getAttribute('data-offer-id'), offerId);
      assert.equal(await page.locator('#offer-filters [aria-pressed="true"]').count(), 1);
      assert.equal(test.writes.length, before, 'Filtering mutated saved booking');
    }
    await page.locator('#offer-filters [data-filter="all"]').click();
    assert.equal(await page.locator('#offers [data-offer-id]').count(), 3);
    checks.push('All offer filters isolate the intended relationship without mutating state');
    await select(test);
    assert.equal(await page.locator('#comparison-saving').innerText(), '-55 USD');
    assert(await page.locator('#approve-offer').isEnabled());
    assert((await page.locator('#comparison').innerText()).includes('USD 5'), 'Review lost fees');
    await inspect(page, 'review');
    const beforeKeep = test.writes.length;
    await page.locator('#keep-booking').click(); await page.locator('#comparison').waitFor({ state: 'hidden' });
    assert.equal(test.writes.length, beforeKeep, 'Keep my booking must not approve or mutate');
    await reload(test); assert(await page.locator('#comparison').isHidden(), 'Keep my booking did not survive reload');
    await select(test, 'DEMO_DIFFERENT_HOTEL');
    const count = test.writes.length;
    await page.goBack(); await page.locator('#comparison').waitFor({ state: 'hidden' }); await settled(page);
    await page.goForward(); await page.locator('#comparison').waitFor({ state: 'visible' }); await settled(page);
    assert.equal(test.writes.length, count, 'Back/Forward must not mutate');
    await reload(test); assert(await page.locator('#comparison').isVisible());
    assert((await page.locator('#comparison').innerText()).includes('Example Garden Hotel'));
    checks.push('Selection, Keep, Back, Forward and reload preserve navigation without approval or automatic writes');

    checkpoint = 'relationship facts and keyboard';
    for (const choice of [
      { id: 'DEMO_EQUIVALENT', hotel: 'Example Harbour Hotel', price: 'USD 540', saving: '-55 USD', room: 'Deluxe King' },
      { id: 'DEMO_DIFFERENT_ROOM', hotel: 'Example Harbour Hotel', price: 'USD 520', saving: '-75 USD', room: 'Premier King' },
      { id: 'DEMO_DIFFERENT_HOTEL', hotel: 'Example Garden Hotel', price: 'USD 510', saving: '-85 USD', room: 'Deluxe King' },
    ]) {
      const target = await fresh(); const control = target.page.locator(`[data-offer-id="${choice.id}"]`);
      const reply = target.page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/selection'));
      await control.focus(); await target.page.keyboard.press('Enter'); assert((await reply).ok());
      await target.page.locator('#comparison').waitFor({ state: 'visible' }); await settled(target.page);
      assert(await target.page.locator('#comparison-title').evaluate(el => el === document.activeElement), `${choice.id}: review heading lost keyboard focus`);
      assert.equal(await target.page.locator('#comparison-title').innerText(), choice.hotel);
      assert.equal(await target.page.locator('#comparison-saving').innerText(), choice.saving);
      const text = await target.page.locator('#comparison').innerText();
      for (const fact of ['USD 600', choice.price, choice.room, 'USD 5']) assert(text.includes(fact), `${choice.id}: missing ${fact}`);
      assert(!/matches your room/i.test(text), `${choice.id}: superseded room-match wording remains`);
      const facts = await target.page.locator('#change-facts-grid .fact-tile').evaluateAll(tiles => tiles.map(tile => ({
        label: tile.querySelector('.fact-label')?.textContent.trim(), value: tile.querySelector('.fact-value')?.textContent.trim(),
        icons: [...tile.querySelectorAll('svg')].map(svg => ({ hidden: svg.getAttribute('aria-hidden'), focusable: svg.getAttribute('focusable'), tabindex: svg.getAttribute('tabindex'),
          visible: svg.getBoundingClientRect().width > 0 && svg.getBoundingClientRect().height > 0 && getComputedStyle(svg).visibility !== 'hidden' })),
      })));
      assert.deepEqual(facts.map(fact => fact.label), ['Hotel', 'Room', 'Meals', 'Cancellation']);
      for (const fact of facts) {
        assert(fact.value, `${choice.id}: ${fact.label} card lost its meaningful text`);
        assert(fact.icons.length > 0, `${choice.id}: ${fact.label} card lacks its visual SVG cue`);
        for (const icon of fact.icons) assert(icon.visible && icon.hidden === 'true' && icon.focusable !== 'true' && icon.tabindex !== '0', `${choice.id}: ${fact.label} icon must remain visible and decorative`);
      }
      const roomFact = facts.find(fact => fact.label === 'Room');
      if (choice.id === 'DEMO_EQUIVALENT') assert.equal(roomFact.value, 'Same room');
      else assert.notEqual(roomFact.value, 'Same room', `${choice.id}: a different relationship was represented as the same room`);
      await target.page.locator('#price-details summary').click();
      const terms = await target.page.locator('#differences').innerText();
      assert(/Current cancellation/.test(terms) && /Alternative cancellation/.test(terms) && /Free cancellation until/.test(terms));
      const cancellationTerms = await target.page.locator('#differences dt').evaluateAll(terms => Object.fromEntries(terms.map(term => [term.textContent, term.nextElementSibling?.textContent])));
      for (const label of ['Current cancellation', 'Alternative cancellation']) assert.equal(cancellationTerms[label], 'Free cancellation until 10 Nov 2026, 18:00 (Asia/Kuala_Lumpur)', `${choice.id}: ${label} lost the full real deadline/timezone`);
      if (choice.id === 'DEMO_DIFFERENT_ROOM') await inspect(target.page, 'other-room-review');
    }
    checks.push('All three reviews preserve exact hotel, room, price, after-fee saving and complete cancellation deadline; Same room applies only to verified equivalence; decorative SVG fact cards retain meaningful labels; Enter selects and focuses review');

    checkpoint = 'light theme and photo fallback';
    const dark = await fresh(375, null, { dark: true });
    assert.equal(await dark.page.locator('html').evaluate(el => getComputedStyle(el).colorScheme), 'light');
    assert.equal(await dark.page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(238, 244, 249)');
    const failedPhotos = await fresh(375, null, { failPhotos: true }); await select(failedPhotos);
    await failedPhotos.page.locator('#comparison .photo-unavailable').waitFor({ state: 'visible' });
    assert(await failedPhotos.page.locator('#approve-offer').isEnabled(), 'Failed illustrative photo blocked verified offer approval');
    await inspect(failedPhotos.page, 'failed-photo');
    checks.push('Dark preference retains light theme; failed illustrative photos show fallback and preserve usable approval');

    checkpoint = 'non-refundable';
    const nonref = await fresh();
    await nonref.page.locator('#lower-rate summary').click(); await select(nonref, 'DEMO_NON_REFUNDABLE');
    assert(await nonref.page.locator('#approve-offer').isDisabled());
    assert(/no free cancellation/i.test(await nonref.page.locator('#flexibility-warning').innerText()));
    await inspect(nonref.page, 'nonref');
    await nonref.page.locator('#accept-reduced-flexibility').check(); assert(await nonref.page.locator('#approve-offer').isEnabled());
    await reload(nonref); assert(await nonref.page.locator('#approve-offer').isDisabled(), 'Non-refundable acknowledgment survived reload');
    checks.push('Non-refundable approval needs an explicit acknowledgment which reload clears');

    checkpoint = 'watch';
    const watch = await fresh();
    await watch.page.locator('#watch-consent').waitFor({ state: 'visible' });
    const consentText = await watch.page.locator('#watch-consent').innerText();
    assert(/daily/i.test(consentText) && /weekly/i.test(consentText), 'Watch consent conflates checks and preview cadence');
    assert(/preview|no email/i.test(consentText) && /approve|approval|never switches/i.test(consentText), 'Watch consent loses channel or approval scope');
    assert.equal(watch.writes.length, 0, 'Opening watch consent enrolled the customer');
    assert(await watch.page.locator('#watch-button').isDisabled(), 'Watch can be enrolled before consent');
    await inspect(watch.page, 'watch-consent');
    await watch.page.locator('#watch-consent-check').check();
    assert.equal(watch.writes.length, 0, 'Checking consent enrolled the customer before their action');
    let data = await command(watch, '#watch-button', '/api/price-watch');
    assert(data.priceWatch.enabled); assert.equal(data.priceWatch.scope, 'checks-and-alerts-only');
    await reload(watch); assert((await state(watch.page)).priceWatch.enabled);
    data = await command(watch, '#watch-button', '/api/price-watch'); assert.equal(data.priceWatch.enabled, false);
    await reload(watch); assert.equal((await state(watch.page)).priceWatch.enabled, false);
    checks.push('Watch consent explicitly scopes daily checks, weekly previews and approval; stop/reload preserves saved state');

    checkpoint = 'approved six-stage journey';
    const journey = await fresh(); await select(journey, 'DEMO_DIFFERENT_HOTEL');
    data = await command(journey, '#approve-offer', '/api/offer-approvals');
    const snapshots = [structuredClone(data)];
    assert.equal(data.simulation.operation.stage, 'ready');
    assert.equal(data.simulation.operation.authority, 'offer-approval');
    assert.equal(data.permissionRecord, null);
    await inspect(journey.page, 'switch-ready');
    const demo = journey.page.locator('#advance-demo');
    assert(await demo.evaluate(el => !!el.closest('details')), 'Stage control must be inside a demo-only disclosure');
    for (const [index, stage] of ['revalidated', 'replacement-secured', 'fulfilment-verified', 'cancellation-requested', 'cancellation-verified', 'refund-completed'].entries()) {
      const parent = demo.locator('xpath=ancestor::details[1]');
      if (!await parent.evaluate(el => el.open)) await parent.locator(':scope > summary').click();
      data = await command(journey, '#advance-demo', '/advances'); snapshots.push(structuredClone(data));
      assert.equal(data.simulation.operation.stage, stage);
      assert.equal(data.booking.version, index < 4 ? 1 : 2);
      assert.equal(data.simulation.operation.refund.status, index < 4 ? 'not-started' : index === 4 ? 'pending' : 'completed');
      const switchText = await journey.page.locator('#simulated-switch').innerText();
      if (index < 4) {
        assert(/still yours|remains active/i.test(switchText), `${stage}: original booking safety is unclear`);
        assert(!/on its way|refund received/i.test(switchText), `${stage}: refund promised before cancellation proof`);
      } else assert((index === 4 ? /pending|on its way/i : /received|completed/i).test(switchText), `${stage}: visible refund status contradicts saved state`);
      if ([0, 3, 4, 5].includes(index)) await inspect(journey.page, stage);
      const saved = await reload(journey); assert.equal(saved.simulation.operation.stage, stage);
      assert.equal(saved.simulation.operation.refund.status, data.simulation.operation.refund.status);
    }
    assert.equal(journey.writes.filter(item => item.path.endsWith('/advances')).length, 6);
    assert.equal(journey.writes.filter(item => item.path.endsWith('/offer-approvals')).length, 1);
    assert.equal((await state(journey.page)).offers.length, 0);
    assert.equal(await journey.page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0, 'Reduced motion still runs stamp/confetti animations');
    checks.push('Exactly one selected approval and six deliberate demo advances; cancellation precedes refund; pending/completed/reload remain distinct');

    checkpoint = 'committed approval response lost';
    const lost = await fresh(); await select(lost);
    let intercepted = false;
    await lost.page.route('**/api/offer-approvals', async route => {
      if (intercepted) return route.continue();
      intercepted = true; const response = await route.fetch(); assert(response.ok()); await route.abort('failed');
    });
    await lost.page.locator('#approve-offer').click();
    await lost.page.locator('#review-message').filter({ hasText: /could not be confirmed|retry/i }).waitFor(); await settled(lost.page);
    const committed = await state(lost.page); assert.equal(committed.simulation.operation.stage, 'ready');
    const beforeLostBack = lost.writes.length;
    await lost.page.goBack(); await settled(lost.page);
    await lost.page.locator('#comparison').waitFor({ state: 'visible' });
    assert(await lost.page.locator('#approve-offer').isEnabled(), 'Back hid/disabled the only pending approval retry');
    assert.equal(lost.writes.length, beforeLostBack, 'Back retried an uncertain approval automatically');
    const replayed = await command(lost, '#approve-offer', '/api/offer-approvals');
    assert.equal(replayed.replayed, true); assert.equal(replayed.simulation.operation.operationId, committed.simulation.operation.operationId);
    const approvals = lost.writes.filter(item => item.path === '/api/offer-approvals');
    assert.equal(approvals.length, 2); assert.deepEqual(approvals[0].body, approvals[1].body); assert.equal(approvals[0].key, approvals[1].key);
    assert.equal(replayed.simulation.operation.revision, 0); await reload(lost);
    checks.push('A committed approval with lost response keeps Retry reachable after Back, replays the same payload/key/operation and survives read-only reload');

    checkpoint = 'uncommitted approval response lost and history';
    const uncommitted = await fresh(); await select(uncommitted);
    let aborted = false;
    await uncommitted.page.route('**/api/offer-approvals', route => {
      if (aborted) return route.continue();
      aborted = true; return route.abort('failed');
    });
    await uncommitted.page.locator('#approve-offer').click();
    await uncommitted.page.locator('#review-message').filter({ hasText: /could not be confirmed|retry/i }).waitFor(); await settled(uncommitted.page);
    assert.equal((await state(uncommitted.page)).simulation.operation, null);
    const beforeUncommittedBack = uncommitted.writes.length;
    await uncommitted.page.goBack(); await settled(uncommitted.page);
    await uncommitted.page.locator('#comparison').waitFor({ state: 'visible' });
    assert(await uncommitted.page.locator('#approve-offer').isEnabled());
    assert.equal(uncommitted.writes.length, beforeUncommittedBack, 'Back automatically issued the uncommitted approval');
    await reload(uncommitted);
    await uncommitted.page.locator('#comparison').waitFor({ state: 'visible' });
    assert(await uncommitted.page.locator('#approve-offer').isEnabled(), 'Reload lost the pending approval retry');
    assert.equal((await state(uncommitted.page)).simulation.operation, null, 'Reload approved an uncommitted command automatically');
    const accepted = await command(uncommitted, '#approve-offer', '/api/offer-approvals'); assert.equal(accepted.replayed, false);
    const attempts = uncommitted.writes.filter(item => item.path === '/api/offer-approvals');
    assert.equal(attempts.length, 2); assert.deepEqual(attempts[0].body, attempts[1].body); assert.equal(attempts[0].key, attempts[1].key);
    checks.push('An uncommitted network failure retains exact pending approval through Back/reload without automatically approving; only deliberate Retry creates the operation');

    checkpoint = 'synthetic edge fixtures';
    const edge = async (name, source, change, expected) => {
      const snapshot = structuredClone(source); change(snapshot);
      const target = await fresh(375, () => snapshot);
      syntheticFixtures.push({ name, source: 'bootstrap response substitution; presentation fixture only' });
      assert(expected.test(await target.page.locator('#simulated-switch').innerText()), `${name}: missing honest state`);
      assert.equal(target.writes.length, 0); await inspect(target.page, name);
      return target;
    };
    await edge('unknown', snapshots[4], value => {
      const op = value.simulation.operation; op.scenarioId = 'uncertain-cancellation'; op.status = 'agency-exception'; op.cancellation.status = 'unknown'; op.reasonCodes = ['CANCELLATION_OUTCOME_UNKNOWN'];
    }, /unknown|uncertain|hold on/i);
    await edge('paused', snapshots[3], value => {
      const op = value.simulation.operation; op.status = 'agency-exception'; op.reasonCodes = ['FULFILMENT_UNVERIFIED'];
    }, /paused|review/i);
    await edge('stopped', snapshots[1], value => {
      const op = value.simulation.operation; op.status = 'failed'; op.reasonCodes = ['OFFER_MATERIAL_CHANGED'];
    }, /stopped/i);
    await edge('reprice', snapshots[1], value => {
      const op = value.simulation.operation; op.status = 'awaits-renewed-approval'; op.reasonCodes = ['PRICE_CHANGED'];
    }, /changed|review/i);
    const empty = await fresh(375, value => ({ ...value, offers: [], simulation: { ...value.simulation, offerApprovalIntents: {} } }));
    syntheticFixtures.push({ name: 'nooffers', source: 'bootstrap response substitution; presentation fixture only' });
    assert.equal(await empty.page.locator('#offers [data-offer-id]').count(), 0);
    assert(/no .*offer|no .*drop|no .*ticket|no .*saving|no .*cheaper/i.test(await empty.page.locator('body').innerText()), 'No-offer state lacks explanation');
    await inspect(empty.page, 'nooffers');
    const sourceUnavailable = await fresh(375, () => {
      const value = structuredClone(snapshots[5]);
      value.priceWatch = { ...value.priceWatch, enabled: true, status: 'active', reason: 'REFUNDABLE_BASELINE',
        lastCheck: { status: 'failed', searched: false, isSimulated: true, bookingVersion: 2,
          recordedAt: fixture.demoNow, timeZone: 'Asia/Kuala_Lumpur', reasonCodes: ['SOURCE_UNAVAILABLE'] } };
      return value;
    });
    syntheticFixtures.push({ name: 'promoted-baseline-watch-source-unavailable', source: 'bootstrap response substitution; no authority created' });
    assert(/unavailable/i.test(await sourceUnavailable.page.locator('#watch-status').innerText()), 'Promoted baseline source limitation is hidden in collapsed details');
    assert(!await sourceUnavailable.page.locator('#watch-details').evaluate(el => el.open));
    for (const [reason, status, expected] of [['NON_REFUNDABLE_BASELINE', 'ended', /non.refundable/i], ['UNKNOWN_CANCELLATION_FACTS', 'paused', /cancellation|terms/i]]) {
      const target = await fresh(375, value => ({ ...value, priceWatch: { ...value.priceWatch, enabled: true, reason, status } }));
      syntheticFixtures.push({ name: `watch-${reason.toLowerCase()}`, source: 'bootstrap response substitution; no authority created' });
      assert(expected.test(await target.page.locator('#watch-status').innerText()), `${reason}: primary watch reason missing`);
      assert(!await target.page.locator('#watch-details').evaluate(el => el.open));
    }
    checks.push('Synthetic promoted-baseline source failure and nonordinary paused/ended watch reasons are visible above collapsed details');
    const errorContext = await browser.newContext({ viewport: { width: 375, height: 1000 } }); contexts.push(errorContext);
    await errorContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await errorContext.route('**/api/bootstrap*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Synthetic local fixture failure' } }) }));
    const errorPage = await errorContext.newPage(); await errorPage.goto(origin);
    await errorPage.getByRole('button', { name: /try again|retry/i }).waitFor();
    syntheticFixtures.push({ name: 'network-error', source: 'HTTP 503 bootstrap response substitution' });
    await errorContext.unroute('**/api/bootstrap*');
    await errorPage.getByRole('button', { name: /try again|retry/i }).click(); await errorPage.locator('#content').waitFor({ state: 'visible' });
    checks.push('Synthetic unknown, paused, stopped, repriced, no-offer and retry states render honestly; these are not provider/backend execution proof');
    checks.push('Visible ticket, offer, switch and mini-ticket surfaces and pseudo-elements have no repeating striped backgrounds across every tested view/width');
    assert.deepEqual(errors, []); checkpoint = 'complete';
    await writeFile(new URL('b1-result.json', evidence), JSON.stringify(result('passed'), null, 2));
    return result('passed');
  } catch (error) {
    const failure = { ...result('failed'), error: error.message, stack: error.stack };
    await writeFile(new URL('b1-result.json', evidence), JSON.stringify(failure, null, 2)); throw error;
  } finally { for (const context of contexts) await context.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let playwright;
  try { playwright = await import('playwright'); }
  catch { playwright = await import(pathToFileURL(join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
  let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (!executablePath && process.platform === 'win32') {
    const cache = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'ms-playwright');
    const builds = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    if (builds.length) executablePath = join(cache, builds[0], 'chrome-win64/chrome.exe');
  }
  const app = await startSafeB1Server(); let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    console.log(JSON.stringify(await runB1(browser, app.origin, { allowFonts: process.argv.includes('--allow-fonts') })));
  } finally { await browser?.close(); await app.close(); }
}
