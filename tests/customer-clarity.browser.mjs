/* Real isolated Chromium against a task-owned local app and memory fixtures.
   node tests/customer-clarity.browser.mjs [--regression]
   No existing browser profile, cloud service, provider or model is used. */
import assert from 'node:assert/strict';
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createAppServer } from '../app/server.mjs';
import { createTestMemoryStorage } from '../app/storage.mjs';

let playwright;
try { playwright = await import('playwright'); }
catch { playwright = await import(pathToFileURL(join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
if (!executablePath && process.platform === 'win32') {
  for (const cache of [join(process.env.LOCALAPPDATA || '', 'ms-playwright'), join(homedir(), 'AppData/Local/ms-playwright')]) {
    const builds = (await readdir(cache).catch(error => { if (error.code === 'ENOENT') return []; throw error; }))
      .filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    if (builds.length) { executablePath = join(cache, builds[0], 'chrome-win64/chrome.exe'); break; }
  }
}
const server = createAppServer({ storage: createTestMemoryStorage(), advisor: { available: false, status: 'unconfigured' },
  fixture: JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8')) });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const evidence = new URL('../.local/customer-clarity/', import.meta.url);
await mkdir(evidence, { recursive: true });
let browser;
const checks = [], screenshots = [], measurements = [], errors = [], regressions = [], external = [];
const contexts = [];
const settled = page => page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
async function fresh(width = 375) {
  const context = await browser.newContext({ viewport: { width, height: 900 } }); contexts.push(context);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage(), writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') writes.push(request.url()); });
  await page.goto(origin); await page.locator('#content').waitFor({ state: 'visible' }); await settled(page);
  assert.equal(writes.length, 0, 'Opening the page mutated state');
  return { context, page, writes };
}
async function state(page) { return (await page.request.get(origin + '/api/bootstrap?scenario=jury-booking')).json(); }
async function capture(page, view, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => document.activeElement?.blur());
  const path = new URL(`after-${view}-${width}.png`, evidence);
  await page.screenshot({ path: path.pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
  screenshots.push(decodeURIComponent(path.pathname.replace(/^\/([A-Za-z]:)/, '$1')));
  const words = await page.locator('#content').evaluate(el => el.innerText.trim().split(/\s+/).length);
  measurements.push({ view, width, words });
}
async function geometry(page, label) {
  for (const width of [320, 375, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, boxes: [...document.querySelectorAll('main,section,button,details,.customer-steps')]
      .filter(el => el.getClientRects().length).map(el => { const box = el.getBoundingClientRect(); return { name: el.id || el.tagName, left: box.left, right: box.right }; }) }));
    assert(overflow.document <= width, `${label}: document overflow at ${width}`);
    for (const box of overflow.boxes) assert(box.left >= -1 && box.right <= width + 1, `${label}: clipped ${box.name} at ${width}`);
  }
  await page.setViewportSize({ width: 375, height: 900 });
}
async function command(page, id, endpoint) {
  const wait = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(endpoint));
  await page.locator('#' + id).focus(); await page.keyboard.press('Enter');
  const response = await wait; assert(response.ok(), `Rejected ${id}`); const data = await response.json(); await settled(page); return data;
}
async function post(page, path, body, headers = {}) {
  const data = await state(page);
  const response = await page.request.post(origin + path, { headers: { Origin: origin, 'X-CSRF-Token': data.csrfToken, ...headers }, data: body });
  assert(response.ok(), `Fixture rejected: ${path}`); return response.json();
}
async function reload(test) {
  const count = test.writes.length;
  await test.page.reload(); await test.page.locator('#content').waitFor({ state: 'visible' }); await settled(test.page);
  assert.equal(test.writes.length, count, 'Reload mutated state'); return state(test.page);
}
try {
  browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  for (const width of [375, 1280]) {
    const test = await fresh(width), { page } = test;
    assert.equal(await page.locator('#customer-steps [aria-current]').innerText(), '1\nChoose');
    for (const id of ['watch-details', 'lower-rate', 'notification-previews-details']) assert(!await page.locator('#' + id).evaluate(el => el.open), `${id} starts open`);
    await capture(page, 'initial', width); await geometry(page, 'initial');
    await page.locator('#watch-details summary').focus(); await page.keyboard.press('Enter');
    assert(await page.locator('#watch-last-check').isVisible(), 'Watch evidence cannot be opened by keyboard');
    assert((await page.locator('#watch-frequency').innerText()).includes('each switch needs your approval'));
    await page.locator('#watch-details summary').click();
    await page.locator('[data-offer-id="DEMO_EQUIVALENT"]').focus(); await page.keyboard.press('Enter');
    await page.locator('#comparison').waitFor({ state: 'visible' }); await settled(page);
    assert(await page.locator('#comparison-title').evaluate(el => el === document.activeElement), 'Review lost keyboard focus');
    assert.equal(await page.locator('#customer-steps [aria-current]').innerText(), '2\nReview');
    assert.equal(await page.locator('#comparison-saving').innerText(), '-USD 55');
    assert.equal(await page.locator('#saving-caption').innerText(), 'Potential refund after USD 5 fees');
    assert.equal(await page.locator('#approve-offer').isEnabled(), true);
    assert(!await page.locator('#price-details').evaluate(el => el.open));
    await capture(page, 'review', width); await geometry(page, 'review');
    await page.locator('#price-details summary').click();
    const terms = await page.locator('#differences').innerText();
    assert(terms.includes('Current cancellation') && terms.includes('Alternative cancellation') && terms.includes('Free cancellation until'));
    checks.push(`${width}px: choose/review hierarchy, exact money and fees, keyboard navigation, collapsed secondary details, accessible cancellation terms`);
  }
  const pointer = await fresh();
  await pointer.page.locator('[data-offer-id="DEMO_EQUIVALENT"]').click();
  await pointer.page.locator('#comparison').waitFor({ state: 'visible' }); await settled(pointer.page);
  assert(!await pointer.page.locator('#comparison-title').evaluate(el => el.matches(':focus-visible')), 'Pointer navigation shows a keyboard focus ring');
  await pointer.page.locator('#approve-offer').click();
  await pointer.page.locator('#simulated-switch').waitFor({ state: 'visible' }); await settled(pointer.page);
  assert(!await pointer.page.locator('#switch-stage').evaluate(el => el.matches(':focus-visible')), 'Pointer approval shows a keyboard focus ring');
  assert.equal(await pointer.page.locator('#switch-progress-label').textContent(), 'Demo switch');
  checks.push('Ordinary pointer review/approval has no heading focus rectangle; keyboard heading focus is preserved; only one numbered progress strip');
  const test = await fresh(), { page } = test;
  await command(page, 'watch-button', '/api/price-watch');
  assert(!await page.locator('#watch-details').evaluate(el => el.open), 'Watch update opened evidence');
  await page.locator('[data-offer-id="DEMO_EQUIVALENT"]').click(); await page.locator('#comparison').waitFor({ state: 'visible' }); await settled(page);
  let data = await command(page, 'approve-offer', '/api/offer-approvals');
  assert.equal(await page.locator('#switch-announcement').count(), 1, 'A stage result live region is missing');
  assert.equal(await page.locator('#switch-announcement').getAttribute('role'), 'status');
  assert.equal(await page.locator('#switch-announcement').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#switch-announcement').textContent(), '', 'Approval or render announced an advance');
  const stages = ['ready', 'revalidated', 'replacement-secured', 'fulfilment-verified', 'cancellation-requested', 'cancellation-verified', 'refund-completed'];
  const ctas = ['Check final price', 'Reserve new booking', 'Verify new booking', 'Request original cancellation', 'Check cancellation result', 'Complete simulated refund', 'Refund complete'];
  for (let i = 0; i < stages.length; i++) {
    assert.equal(data.simulation.operation.stage, stages[i]); assert.equal(await page.locator('#advance-demo').innerText(), ctas[i]);
    if (i > 0) {
      const announcement = await page.locator('#switch-announcement').textContent();
      const heading = await page.locator('#switch-stage').textContent();
      assert(await page.locator('#switch-announcement').evaluate(el => getComputedStyle(el).display !== 'none' && !el.closest('[hidden]')), 'Result announcement is hidden from assistive technology');
      if (i < 6) {
        assert.equal(announcement, heading + '.', `New stage was not announced: ${stages[i]}`);
        assert(await page.locator('#advance-demo').evaluate(el => el === document.activeElement), 'Keyboard focus was lost instead of returning to the next enabled action');
        if (i === 5) assert(announcement.includes('refund pending') && !announcement.includes('Refund completed'), 'Pending refund announcement claims completion');
      } else {
        assert.equal(announcement, '', 'Final heading is duplicated by a live announcement');
        assert(await page.locator('#switch-stage').evaluate(el => el === document.activeElement), 'Final result heading did not receive keyboard focus');
        assert(heading.includes('Refund completed') && !heading.includes('refund pending'), 'Final focused result is stale');
      }
    }
    assert(!await page.locator('#switch-history-details').evaluate(el => el.open));
    assert(!await page.locator('#notification-previews-details').evaluate(el => el.open));
    if (i < 5) { assert((await page.locator('#switch-explanation').innerText()).includes('original booking remains active')); assert.equal(data.simulation.operation.refund.status, 'not-started'); }
    if (i === 0) {
      const buttonBottom = await page.locator('#advance-demo').evaluate(el => el.getBoundingClientRect().bottom);
      assert(buttonBottom <= 900, 'Next switch action is below the first mobile screen');
      await capture(page, 'switch-start', 375); await capture(page, 'switch-start', 1280); await geometry(page, 'active switch');
    }
    if (i >= 5) {
      const completed = i === 6;
      assert.equal(data.simulation.operation.refund.status, completed ? 'completed' : 'pending');
      assert((await page.locator('#switch-stage').innerText()).includes(completed ? 'Refund completed' : 'refund pending'));
      assert.equal(await page.locator('#advance-demo').isDisabled(), completed);
      if (completed) {
        assert(await page.locator('#advance-demo').isHidden(), 'Completed switch still shows a dead-end action');
        assert.equal(await page.locator('#switch-explanation').textContent(), 'Your new booking is active.');
        assert.equal(await page.locator('#switch-progress-label').textContent(), 'Demo switch');
      }
      await capture(page, completed ? 'refund-completed' : 'refund-pending', 375);
      await capture(page, completed ? 'refund-completed' : 'refund-pending', 1280); await geometry(page, 'refund state');
    }
    const stage = data.simulation.operation.stage; data = await reload(test); assert.equal(data.simulation.operation.stage, stage);
    assert.equal(await page.locator('#switch-announcement').textContent(), '', 'Read-only reload announced an advance');
    if (i < 6) data = await command(page, 'advance-demo', '/advances');
  }
  assert.equal(test.writes.filter(path => path.endsWith('/advances')).length, 6);
  checks.push('Each of six advances remains deliberate; predictive next-action labels; mobile action visible; original stays active until cancellation proof; pending and completed refunds remain distinct; reload is read-only');
  checks.push('Each committed continuing advance announces the new stage and focuses the next enabled action; final completion focuses its heading without duplicate speech; approval and reload stay silent');
  await command(page, 'watch-button', '/api/price-watch');
  data = await command(page, 'watch-button', '/api/price-watch');
  assert.equal(data.priceWatch.lastCheck.status, 'failed');
  assert((await page.locator('#watch-status').innerText()).includes('Demo rates unavailable for this stay'));
  assert(!await page.locator('#watch-details').evaluate(el => el.open));
  await capture(page, 'demo-rates-unavailable', 375);
  checks.push('Unsupported replacement baseline visibly reports demo rate limitation; failed check stays failed, with secondary evidence collapsed');
  const nonref = await fresh();
  await nonref.page.locator('#lower-rate summary').click(); await nonref.page.locator('[data-offer-id="DEMO_NON_REFUNDABLE"]').click();
  await nonref.page.locator('#comparison').waitFor({ state: 'visible' }); await settled(nonref.page);
  assert(await nonref.page.locator('#approve-offer').isDisabled());
  const consent = await nonref.page.locator('#flexibility-warning').innerText(); assert(/Non-refundable/.test(consent) && /no free cancellation/.test(consent) && /monitoring ends/.test(consent));
  await capture(nonref.page, 'nonref-review', 375); await geometry(nonref.page, 'non-refundable consent');
  await nonref.page.locator('#accept-reduced-flexibility').check(); assert(await nonref.page.locator('#approve-offer').isEnabled());
  await reload(nonref); assert(await nonref.page.locator('#approve-offer').isDisabled());
  checks.push('Non-refundable terms remain visible; separate explicit acknowledgement required and cleared on reload');
  const attention = await fresh(); let current = await state(attention.page);
  await post(attention.page, '/api/enrolment', { bookingVersion: current.booking.version, preferences: { ...current.preferences, automaticEquivalentSwitches: true, continueMonitoring: true },
    permissionConfirmation: { confirmed: true, version: 1, bookingVersion: current.booking.version, preferenceVersion: current.preferences.version, scope: 'equivalent-only' } });
  current = await state(attention.page); const { idempotencyKey, ...body } = current.simulation.scenarios.find(item => item.id === 'uncertain-cancellation').intent;
  current = await post(attention.page, '/api/switches', body, { 'Idempotency-Key': idempotencyKey });
  for (let i = 0; i < 5; i++) current = await post(attention.page, '/api/switches/' + current.simulation.operation.operationId + '/advances', { expectedOperationRevision: current.simulation.operation.revision });
  await reload(attention); assert.equal(current.simulation.operation.cancellation.status, 'unknown');
  assert((await attention.page.locator('#switch-stage').innerText()).includes('agency review'));
  assert((await attention.page.locator('#switch-explanation').innerText()).includes('no refund has started'));
  assert.equal(await attention.page.locator('#advance-demo').innerText(), 'Check cancellation result');
  await capture(attention.page, 'agency-exception', 375); await capture(attention.page, 'agency-exception', 1280); await geometry(attention.page, 'agency exception');
  checks.push('Unknown cancellation shows agency attention, original-active/no-refund truth and deliberate reconciliation action');
  if (process.argv.includes('--regression')) {
    for (const name of ['postcard', 'price-watch']) {
      const script = (await readFile(new URL(`./${name}.browser.mjs`, import.meta.url), 'utf8')).replaceAll('http://localhost:8080', origin);
      const fn = (0, eval)('(' + script + ')'); const result = await fn(page); regressions.push({ name, ...result }); assert.equal(result.status, 'passed', `${name}: ${result.checkpoint}: ${result.error}`);
    }
  }
  let before = [];
  try { before = JSON.parse(await readFile(new URL('before-words.json', evidence), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const item of measurements) { const old = before.find(value => value.view === item.view && value.width === item.width); if (old) { item.beforeWords = old.words; item.reductionPercent = Math.round((1 - item.words / old.words) * 100); } }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const result = { status: 'passed', storage: 'test-memory', checks, measurements, screenshots, errors, externalRequests: external.length, regressions };
  await writeFile(new URL('result.json', evidence), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  await writeFile(new URL('result.json', evidence), JSON.stringify({ status: 'failed', error: error.message, checks, measurements, screenshots, errors, regressions }, null, 2));
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser?.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
