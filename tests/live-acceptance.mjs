// Live cloud acceptance for a deployed RoomDrop service, using only its public HTTP endpoints and UI as a judge would.
// Usage: node tests/live-acceptance.mjs [baseUrl] [--project=<gcp project>]
// Optional: set $env:GCP_ACCESS_TOKEN (gcloud auth print-access-token) to also read the session document back from
// Firestore with a read-only REST GET. It never deploys, restarts, writes Firestore directly, calls Gemini (/advice and
// /chat are blocked) or calls a supplier. It does create ordinary visitor sessions, arms Drop Watches and records demo
// selections through the app, exactly as a judge clicking through would.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localChromium } from './browser-chromium.mjs';

const args = process.argv.slice(2);
const origin = new URL(args.find(arg => !arg.startsWith('--')) ?? 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app').origin;
const project = args.find(arg => arg.startsWith('--project='))?.slice(10) ?? 'sincere-apex-511418-p0';
const sessionsCollection = args.find(arg => arg.startsWith('--sessions='))?.slice(11) ?? 'roomdropPublicSessionsV1';
const preferred = ['AIRB000180', 'AIRB000181', 'AIRB000182', 'AIRB000183'];
const output = resolve('.local/live-acceptance'); await mkdir(output, { recursive: true });
const report = { origin, startedAt: new Date().toISOString(), checks: {}, screenshots: [], errors: [], external: [], blocked: [] };
const api = path => origin + '/api/booking-demo' + path;
const cookieOf = async context => (await context.cookies(origin)).find(cookie => cookie.name === 'roomdrop_quote')?.value;
let browser;

// Restart probe: after an approved restart, re-read a session saved by an earlier run (.local/live-acceptance/session.json).
if (args.includes('--after-restart')) {
  const { readFile } = await import('node:fs/promises');
  const saved = JSON.parse(await readFile(join(output, 'session.json'), 'utf8'));
  const data = await (await fetch(api('/q/' + saved.code), { headers: { Cookie: 'roomdrop_quote=' + saved.cookie } })).json();
  const same = JSON.stringify(data.watch) === JSON.stringify(saved.watch) && JSON.stringify(data.confirmation) === JSON.stringify(saved.confirmation);
  console.log(JSON.stringify({ restartPersistence: same ? 'passed' : 'failed', code: saved.code, watchRevision: data.watch?.revision ?? null }));
  process.exit(same ? 0 : 1);
}

async function check(name, fn) {
  try { report.checks[name] = { status: 'passed', ...(await fn()) }; }
  catch (failure) { report.checks[name] = { status: 'failed', message: failure.message }; process.exitCode = 1; }
}

try {
  let playwright;
  try { playwright = await import('playwright'); }
  catch { playwright = await import(pathToFileURL(join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
  browser = await playwright.chromium.launch({ headless: true, executablePath: localChromium() });

  const judge = async (width, label) => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { report.external.push(url.origin); return route.abort(); }
      if (/\/(advice|chat)$/.test(url.pathname)) { report.blocked.push(label + ' ' + url.pathname); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', failure => report.errors.push(label + ': ' + failure.message));
    const visible = id => page.locator('#' + id).waitFor({ state: 'visible', timeout: 30000 });
    const shot = async stage => { const path = join(output, `${label}-${stage}-${width}.png`); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path); };
    const get = async code => (await context.request.get(api('/q/' + code))).json();
    const arm = async (code, minimum) => {
      await page.goto(origin + '/#setup-' + code); await visible('setup-screen'); await page.locator('#judge-consent').check();
      await page.locator(`input[name="minimum-saving"][value="${minimum}"]`).check();
      await page.locator('#delivery-email').fill('judge-live@example.test');
      await page.locator('#arm-watch').click(); await visible('handoff');
      assert.match(await page.locator('#handoff-email').innerText(), /j\*\*\*@example.test/);
      await page.locator('#open-roomdrop').click(); await visible('deal-list');
      await page.locator('#booking-label').filter({ hasText: /^Original Booking/ }).waitFor();
    };
    return { context, page, visible, shot, get, arm };
  };

  const a = await judge(390, 'judgeA'), b = await judge(1440, 'judgeB');
  const listing = await (await a.context.request.get(api('/catalogue'))).json();
  const codes = listing.entries.map(entry => entry.code);
  const eligible = [];
  for (const code of [...preferred.filter(code => codes.includes(code)), ...codes.filter(code => !preferred.includes(code))]) {
    const data = await a.get(code); if (!data.blocker && data.options?.length) eligible.push({ code, minimum: data.agencyMinimumSavingMinor });
  }
  report.eligible = eligible.map(entry => entry.code);
  assert.ok(eligible.length >= 2, 'Two armable quotations are required, found ' + eligible.length);
  const [first, second] = eligible;

  await check('a-replay-labels', async () => {
    await a.arm(first.code, first.minimum);
    const detail = await a.page.locator('#armed-detail').innerText();
    assert.match(detail, /Replayed .*Captured .*not live/);
    await a.shot('drops');
    return { code: first.code, armedDetail: detail };
  });

  await check('b-arm-confirm', async () => {
    const armed = await a.get(first.code); assert.ok(armed.watch, 'watch not committed after arming');
    await a.page.locator('#offers .offer-action').first().click(); await a.visible('comparison');
    if (await a.page.locator('#flexibility-warning').isVisible()) await a.page.locator('#accept-reduced-flexibility').check();
    await a.page.locator('#approve-offer').click(); await a.visible('simulated-switch');
    await a.shot('confirmed');
    const mine = await a.get(first.code);
    assert.ok(mine.confirmation?.selectionId, 'confirmation missing from bootstrap');
    assert.equal(mine.confirmation.reservationCreated, false); assert.equal(mine.confirmation.quoteModified, false);
    return { code: first.code, watchRevision: mine.watch?.revision, selectionId: mine.confirmation.selectionId };
  });

  await check('c-two-judge-isolation', async () => {
    await b.arm(second.code, second.minimum); await b.shot('drops');
    const [cookieA, cookieB] = [await cookieOf(a.context), await cookieOf(b.context)];
    assert.ok(cookieA && cookieB && cookieA !== cookieB, 'judges must hold distinct session cookies');
    const bSeesA = await b.get(first.code), aSeesB = await a.get(second.code), bOwn = await b.get(second.code), aOwn = await a.get(first.code);
    assert.equal(bSeesA.watch, null); assert.equal(bSeesA.confirmation, null);
    assert.equal(aSeesB.watch, null); assert.equal(aSeesB.confirmation, null);
    assert.ok(bOwn.watch, 'judge B watch missing'); assert.ok(aOwn.watch && aOwn.confirmation, 'judge A state disturbed');
    assert.notEqual(bSeesA.csrfToken, aOwn.csrfToken);
    return { judgeA: first.code, judgeB: second.code };
  });

  await check('d-persistence', async () => {
    const cookie = await cookieOf(a.context), before = await a.get(first.code);
    // A brand-new HTTP client with no shared memory, presenting only the session cookie.
    const fresh = await playwright.request.newContext({ extraHTTPHeaders: { Cookie: 'roomdrop_quote=' + cookie } });
    const after = await (await fresh.get(api('/q/' + first.code))).json(); await fresh.dispose();
    assert.deepEqual(after.watch, before.watch); assert.deepEqual(after.confirmation, before.confirmation);
    await a.page.reload(); await a.visible('simulated-switch');
    await writeFile(join(output, 'session.json'), JSON.stringify({ code: first.code, cookie, watch: after.watch, confirmation: after.confirmation }));
    const result = { freshClient: 'same watch and confirmation' };
    if (process.env.GCP_ACCESS_TOKEN) {
      const id = createHash('sha256').update(cookie).digest('hex');
      const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${sessionsCollection}/${id}`,
        { headers: { Authorization: 'Bearer ' + process.env.GCP_ACCESS_TOKEN } });
      assert.equal(response.status, 200, 'session document not found in Firestore');
      const fields = (await response.json()).fields;
      assert.ok(fields.byCode?.mapValue?.fields?.[first.code], 'armed code missing from stored session');
      assert.ok(fields.ttlAt?.timestampValue, 'ttlAt missing');
      assert.ok(!JSON.stringify(fields).includes(cookie), 'raw cookie stored');
      Object.assign(result, { firestoreDoc: `${sessionsCollection}/${id.slice(0, 12)}...`, ttlAt: fields.ttlAt.timestampValue, storedKeys: Object.keys(fields).sort() });
    } else result.firestore = 'skipped (no GCP_ACCESS_TOKEN)';
    return result;
  });

  await a.context.close(); await b.context.close();
  if (report.errors.length) { report.checks.pageErrors = { status: 'failed', errors: report.errors }; process.exitCode = 1; }
} catch (failure) {
  report.fatal = failure.message; process.exitCode = 1;
} finally {
  await browser?.close();
  report.external = [...new Set(report.external)];
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
