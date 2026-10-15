/* Isolated mocked UI acceptance: no real IAP, credentials, emulator or personal browser state.
   Run: node tests/agency-iap.browser.mjs (uses installed Playwright; no package downloads). */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

let playwright;
try { playwright = await import('playwright'); }
catch {
  playwright = await import(pathToFileURL(join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href);
}
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
if (!executablePath && process.platform === 'win32') {
  for (const cache of [join(process.env.LOCALAPPDATA || '', 'ms-playwright'), join(homedir(), 'AppData/Local/ms-playwright')]) {
    const installed = (await readdir(cache).catch(error => { if (error.code === 'ENOENT') return []; throw error; })).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    if (installed.length) { executablePath = join(cache, installed[0], 'chrome-win64/chrome.exe'); break; }
  }
}
const publicRoot = new URL('../app/public/', import.meta.url);
const shell = await readFile(new URL('agency.html', publicRoot), 'utf8');
const assets = new Map(await Promise.all([
  ['agency.js', 'application/javascript'], ['agency.css', 'text/css'], ['booking.css', 'text/css'],
  ['assets/roomdrop-logo.png', 'image/png'], ['assets/roomdrop-key-icon.png', 'image/png'],
].map(async ([name, type]) => ['/' + name, { type, body: await readFile(new URL(name, publicRoot)) }])));
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://fixture.test').pathname;
  if (['/agency', '/local', '/unknown'].includes(path)) {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(shell.replace('content="unavailable"', 'content="' + (path === '/local' ? 'local-review' : path === '/unknown' ? 'unavailable' : 'google-iap') + '"'));
  } else if (assets.has(path)) {
    const asset = assets.get(path); response.writeHead(200, { 'Content-Type': asset.type }); response.end(asset.body);
  } else { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const contexts = [], fixtures = [], checks = [], responsive = [], screenshots = [], errors = [];
const evidence = new URL('../.local/agency-iap-ui/', import.meta.url);
await mkdir(evidence, { recursive: true });
const summary = { caseId: 'fixture-case', hotelName: 'Fixture Harbour Hotel', status: 'completed', stage: 'refund-completed', savingSecured: true,
  cancellationStatus: 'verified', refundStatus: 'completed', monitoringStatus: 'active', updatedAt: '2026-10-15T01:00:00Z', reasonCodes: [] };
const detail = { ...summary, sourceBooking: { hotelName: summary.hotelName, roomName: 'Fixture room', refundability: 'refundable' },
  refund: { amountMinor: 12000, currency: 'USD', status: 'completed' }, authority: { valid: true }, history: [] };
const future = () => new Date(Date.now() + 60_000).toISOString();
async function settled(page) { await page.waitForFunction(() => document.querySelector('#main').getAttribute('aria-busy') === 'false'); }
async function cleared(page) {
  assert.equal(await page.locator('#agency-cases').textContent(), '');
  assert.equal(await page.locator('#agency-case-detail').textContent(), '');
  assert(await page.locator('#agency-overview').isHidden());
  assert(await page.locator('#agency-case-detail').isHidden());
}
async function noLocalControls(page) {
  assert(await page.locator('#agency-login').isHidden());
  assert(await page.locator('#agency-logout').isHidden());
  assert.equal(await page.locator('#agency-passphrase').inputValue(), '');
}
async function fresh(mode = 'google-iap', options = {}) {
  const state = { sessionStatus: options.sessionStatus || 200, sessionBody: null, expiresAt: future(), signedIn: mode === 'google-iap',
    casesStatus: 200, casesTransport: false, casesGate: null, detailGate: null, sessionHtml: options.sessionHtml || false, writes: [], api: [] };
  fixtures.push({ mode, state });
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 } }); contexts.push(context);
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    state.api.push({ method, path: url.pathname, query: url.search });
    if (method !== 'GET') state.writes.push({ method, path: url.pathname });
    const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const failure = status => reply(status, { authMode: mode === 'google-iap' ? 'google-iap' : 'local-review', error: { message: 'Fixture service unavailable.' } });
    if (url.pathname === '/api/agency/session') {
      if (state.sessionHtml) return route.fulfill({ status: 403, contentType: 'text/html', body: '<p>Fixture upstream denial</p>' });
      if (state.sessionStatus !== 200) return failure(state.sessionStatus);
      if (method === 'POST') {
        assert.equal(mode, 'local-review'); assert.deepEqual(request.postDataJSON(), { passphrase: 'synthetic-local-test-passphrase-only' }); state.signedIn = true;
      }
      if (method === 'DELETE') { assert.equal(mode, 'local-review'); assert.equal(request.headers()['x-csrf-token'], 'fixture-csrf'); state.signedIn = false; return reply(200, { authenticated: false }); }
      if (!state.signedIn) return failure(401);
      return reply(200, state.sessionBody || { authenticated: true, mode: mode === 'local-review' ? 'local-fixture-review' : mode,
        role: 'agency-reviewer', expiresAt: state.expiresAt, ...(mode === 'local-review' ? { csrfToken: 'fixture-csrf' } : {}) });
    }
    if (url.pathname === '/api/agency/cases') {
      if (state.casesGate) await state.casesGate;
      if (state.casesTransport) return route.abort('failed');
      if (state.casesStatus !== 200) return failure(state.casesStatus);
      return reply(200, { cases: url.searchParams.has('cursor') ? [{ ...summary, caseId: 'fixture-next', hotelName: 'Fixture Garden Hotel' }] : [summary], nextCursor: url.searchParams.has('cursor') ? null : 'fixture-next-page' });
    }
    if (url.pathname === '/api/agency/cases/fixture-case') {
      if (state.detailGate) await state.detailGate;
      return reply(200, { case: detail });
    }
    throw new Error('Unexpected API request: ' + method + ' ' + url.pathname);
  });
  const page = await context.newPage(); page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + (mode === 'local-review' ? '/local' : mode === 'unknown' ? '/unknown' : '/agency'));
  await settled(page); return { page, state };
}
async function widths(page, label) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      boxes: [...document.querySelectorAll('main,section,button,input')].filter(element => element.getClientRects().length && !element.closest('[hidden]')).map(element => {
        const rect = element.getBoundingClientRect(); return { id: element.id || element.tagName, left: rect.left, right: rect.right };
      }) }));
    assert(geometry.scroll <= width, label + ' document overflow at ' + width);
    for (const box of geometry.boxes) assert(box.left >= -1 && box.right <= width + 1, label + ' clipped ' + box.id + ' at ' + width);
    responsive.push({ label, width });
  }
  await page.setViewportSize({ width: 390, height: 1000 });
}
async function capture(page, name) {
  assert.equal(await page.locator('#agency-passphrase').inputValue(), '');
  const path = new URL(name + '.png', evidence); await page.screenshot({ path: fileURLToPath(path), fullPage: true }); screenshots.push(path.href);
}
try {
  const active = await fresh();
  await noLocalControls(active.page); assert(await active.page.locator('#agency-managed-access').isVisible());
  assert.equal(await active.page.locator('#agency-managed-access').textContent(), 'Agency access uses your approved Google account. Contact your administrator if access is unavailable.');
  assert.match(await active.page.locator('#agency-session').textContent(), /Google-managed agency access/);
  await widths(active.page, 'IAP list'); await capture(active.page, 'iap-list');
  await active.page.locator('#agency-next-page').click(); await settled(active.page);
  assert.match(await active.page.locator('#agency-cases').textContent(), /Fixture Garden Hotel/);
  await active.page.locator('#agency-first-page').click(); await settled(active.page);
  await active.page.locator('.agency-case-button').focus(); await active.page.keyboard.press('Enter'); await settled(active.page);
  assert(await active.page.locator('#agency-detail-title').evaluate(element => element === document.activeElement));
  await widths(active.page, 'IAP detail'); await capture(active.page, 'iap-detail');
  const beforeRenew = active.state.api.length;
  await active.page.locator('#agency-check-access').click(); await settled(active.page);
  assert.equal(active.state.api[beforeRenew].path, '/api/agency/session');
  assert.equal(await active.page.locator('#agency-case-detail').textContent(), '');
  checks.push('IAP controls, keyboard detail, pagination and GET-only renewal');

  for (const code of [401, 403, 503]) {
    active.state.casesStatus = code;
    await active.page.locator('#agency-next-page').click(); await settled(active.page);
    await cleared(active.page); await noLocalControls(active.page);
    assert(await active.page.locator('#agency-check-access').isVisible());
    await widths(active.page, 'IAP error ' + code);
    active.state.casesStatus = 200; active.state.expiresAt = future();
    await active.page.locator('#agency-check-access').click(); await settled(active.page);
    assert(await active.page.locator('#agency-overview').isVisible());
  }
  active.state.casesTransport = true;
  await active.page.locator('#agency-next-page').click(); await settled(active.page); await cleared(active.page); await noLocalControls(active.page);
  checks.push('401/403/storage 503/transport failure clear all protected content; access retry recovers');

  const stale = await fresh();
  stale.state.expiresAt = new Date(Date.now() + 1800).toISOString();
  await stale.page.locator('#agency-check-access').click(); await settled(stale.page);
  let release;
  stale.state.detailGate = new Promise(resolve => { release = resolve; });
  await stale.page.locator('.agency-case-button').click();
  await stale.page.locator('#agency-overview').waitFor({ state: 'hidden' });
  await cleared(stale.page); release(); await settled(stale.page); await cleared(stale.page); await noLocalControls(stale.page);
  stale.state.expiresAt = future(); stale.state.detailGate = null;
  await stale.page.locator('#agency-check-access').click(); await settled(stale.page);
  assert(await stale.page.locator('#agency-overview').isVisible());
  checks.push('Expiry clears data; delayed detail cannot resurrect it; renewed session restores list');

  stale.state.expiresAt = new Date(Date.now() + 1800).toISOString();
  await stale.page.locator('#agency-check-access').click(); await settled(stale.page);
  stale.state.casesGate = new Promise(resolve => { release = resolve; });
  await stale.page.locator('#agency-next-page').click();
  await stale.page.locator('#agency-overview').waitFor({ state: 'hidden' });
  release(); await settled(stale.page); await cleared(stale.page);
  checks.push('Delayed paginated list cannot restore protected content after expiry');

  for (const options of [{ sessionStatus: 401 }, { sessionStatus: 403 }, { sessionStatus: 503 }, { sessionHtml: true }]) {
    const denied = await fresh('google-iap', options); await cleared(denied.page); await noLocalControls(denied.page);
    assert(await denied.page.locator('#agency-check-access').isVisible());
  }
  const unknown = await fresh('unknown', { sessionHtml: true }); await noLocalControls(unknown.page); await cleared(unknown.page);
  checks.push('Initial IAP denial and upstream HTML failure never offer local fallback; unknown mode fails closed');

  const local = await fresh('local-review');
  assert(await local.page.locator('#agency-login').isVisible()); assert(await local.page.locator('#agency-check-access').isHidden());
  await widths(local.page, 'Local login');
  await local.page.locator('#agency-passphrase').fill('synthetic-local-test-passphrase-only');
  await local.page.locator('#agency-login-submit').focus(); await local.page.keyboard.press('Enter'); await settled(local.page);
  assert(await local.page.locator('#agency-logout').isVisible()); assert.equal(await local.page.locator('#agency-passphrase').inputValue(), '');
  await local.page.locator('#agency-logout').click(); await settled(local.page); await cleared(local.page);
  assert(await local.page.locator('#agency-login').isVisible()); assert.match(await local.page.locator('#agency-message').textContent(), /Signed out/);
  assert.deepEqual(local.state.writes.map(item => item.method), ['POST', 'DELETE']);
  checks.push('Local synthetic passphrase login, memory clearing, CSRF logout preserved');
  local.state.expiresAt = new Date(Date.now() + 1800).toISOString();
  await local.page.locator('#agency-passphrase').fill('synthetic-local-test-passphrase-only');
  await local.page.locator('#agency-login-submit').click(); await settled(local.page);
  await local.page.locator('.agency-case-button').click(); await settled(local.page);
  await local.page.locator('#agency-overview').waitFor({ state: 'hidden' }); await cleared(local.page);
  assert(await local.page.locator('#agency-login').isVisible()); assert.match(await local.page.locator('#agency-message').textContent(), /session expired/);
  checks.push('Local expiry timer still clears protected list and detail and restores passphrase form');
  for (const fixture of fixtures) {
    assert(fixture.state.api.every(item => item.path.startsWith('/api/agency/')), 'Customer/bootstrap API called');
    if (fixture.mode !== 'local-review') {
      assert.equal(fixture.state.writes.length, 0, 'Managed/unknown mode attempted an app session mutation');
      assert(fixture.state.api.every(item => item.method === 'GET'));
    }
  }
  assert.deepEqual(errors, []);
  const result = { status: 'passed', boundary: 'Mocked IAP UI only; no signed-provider or live infrastructure proof.', checks, responsive, screenshots };
  await writeFile(new URL('result.json', evidence), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.all(contexts.map(context => context.close())); await browser.close(); await new Promise(resolve => server.close(resolve));
}
