// F11a browser evidence against the Part 1 Firestore emulator and the reviewed catalogue (ignored .local inputs).
// Starts scripts/serve-booking-demo.mjs in emulator mode, seeded only through the guarded importer, then walks
// start grid -> Original Booking -> setup -> committed armed by browser, checks two judges on one code and one
// judge on two codes, restarts the launcher without a seed against the same emulator and checks every setup is
// kept. Screenshots at 320, 768 and 1440 px go to .local/judge-flow/emulator/. No live supplier, Altovo or Gemini
// call: only loopback requests are allowed. Afterwards the evidence sessions are deleted from the emulator.
// Env: FIRESTORE_EMULATOR_HOST=127.0.0.1:PORT GOOGLE_CLOUD_PROJECT=demo-... (the Part 1 emulator).
// Args: [--catalogue=.local/s0.6/catalogue-import.json] [--images=.local/s0.5/image-manifest.json] [--port=8194]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { createRoomdropFirestore } from '../app/booking-storage.mjs';

const arg = (name, fallback) => process.argv.slice(2).find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const catalogue = arg('catalogue', '.local/s0.6/catalogue-import.json'); const images = arg('images', '.local/s0.5/image-manifest.json');
const port = Number(arg('port', '8194'));
const host = process.env.FIRESTORE_EMULATOR_HOST; const project = process.env.GOOGLE_CLOUD_PROJECT;
assert.match(host ?? '', /^(localhost|127\.0\.0\.1):\d+$/, 'FIRESTORE_EMULATOR_HOST must name the loopback emulator');
assert.match(project ?? '', /^demo-[a-z0-9-]+$/, 'GOOGLE_CLOUD_PROJECT must be a demo- project');
const reviewed = JSON.parse(readFileSync(images, 'utf8')).images;
const order = JSON.parse(readFileSync(catalogue, 'utf8')).cards.sort((a, b) => a.order - b.order).map(card => card.code);

const output = resolve('.local/judge-flow/emulator'); await mkdir(output, { recursive: true });
let playwright; try { playwright = await import('playwright'); } catch { playwright = await import(pathToFileURL(join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
const cache = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'ms-playwright');
const builds = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
const browser = await playwright.chromium.launch({ headless: true, executablePath: join(cache, builds[0], 'chrome-win64/chrome.exe') });
const origin = `http://127.0.0.1:${port}`;
const report = { status: 'started', launches: [], checks: [], errors: [], restartNetworkErrors: [], external: [], screenshots: [] };
let restarting = false;

// One launcher process; resolves with its printed lines once it is ready.
let child = null;
function startLauncher(seed) {
  const args = ['scripts/serve-booking-demo.mjs', `--emulator=${host}`, `--project=${project}`, `--port=${port}`, ...(seed ? [`--seed=${catalogue}`, `--images=${images}`] : [])];
  const env = { ...process.env }; for (const key of ['K_SERVICE', 'STORAGE_MODE', 'GEMINI_MODEL', 'GOOGLE_CLOUD_LOCATION', 'QUOTATION_ADVICE_ENABLED']) delete env[key];
  child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = [];
  return new Promise((ready, fail) => {
    child.stdout.on('data', chunk => { lines.push(...String(chunk).trim().split(/\r?\n/)); if (lines.some(line => line.startsWith('Booking demo ready at'))) ready(lines); });
    child.stderr.on('data', chunk => lines.push(String(chunk).trim()));
    child.on('exit', code => fail(new Error(`launcher exited ${code}: ${lines.join(' | ')}`)));
  }).then(printed => { report.launches.push({ args: args.slice(1), printed }); return printed; });
}
const stopLauncher = () => new Promise(done => { if (!child || child.exitCode !== null) return done(); child.once('exit', done); child.kill(); });

async function judgePage(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (report.external.push(route.request().url()), route.abort()));
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  // Open connections drop while the launcher restarts; those are recorded apart from real page errors.
  page.on('console', m => { if (m.type() === 'error') (restarting && /ERR_CONNECTION_(RESET|REFUSED)/.test(m.text()) ? report.restartNetworkErrors : report.errors).push(m.text()); });
  return { context, page };
}
const visible = (page, id) => page.locator('#' + id).waitFor({ state: 'visible' });
const loaded = (page, selector) => page.waitForFunction(s => [...document.querySelectorAll(s)].every(image => image.complete && image.naturalWidth > 0), selector);
async function shot(page, stage, width) {
  assert.doesNotMatch(await page.locator('body').innerText(), /fictional|AirBorneo|[–—]/i, stage);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), stage + ' overflow at ' + width);
  const path = join(output, `${stage}-${width}.png`); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path);
}
const watchOf = (page, code) => page.evaluate(async c => (await (await fetch('/api/booking-demo/q/' + c)).json()).watch, code);
// Opens a code's Original Booking from the start grid, goes to setup, picks a minimum, consents and arms.
async function armFromGrid(page, code, minimum) {
  await page.goto(origin); await visible(page, 'catalogue-screen');
  await page.locator(`[data-code="${code}"] .catalogue-open`).click(); await visible(page, 'booked-screen');
  await page.locator('#setup-drop').click(); await visible(page, 'setup-screen');
  await page.locator(`input[name="minimum-saving"][value="${minimum}"]`).check();
  if (!await page.locator('#judge-consent').isChecked()) await page.locator('#judge-consent').check();
  const response = page.waitForResponse(r => r.url().endsWith(`/q/${code}/watch`) && r.request().method() === 'POST');
  await page.locator('#arm-watch').click();
  const receipt = await (await response).json();
  await visible(page, 'armed-strip');
  assert.equal(new URL(page.url()).hash, '#drops-' + code);
  return { receipt, detail: await page.locator('#armed-detail').innerText() };
}

const PAN = 'AIRB000181'; const PARK = 'AIRB000182'; const SIAM = 'AIRB000180'; const HYATT = 'AIRB000179';
try {
  const seeded = await startLauncher(true);
  assert.match(seeded.join(' '), /Seeded through the guarded importer: AIRB000179 (created|unchanged)/);

  // Start grid and Original Booking pages at each width: reviewed hotel photos on top, the booked room where approved.
  for (const width of [320, 768, 1440]) {
    const { context, page } = await judgePage(width);
    await page.goto(origin); await visible(page, 'catalogue-screen');
    assert.deepEqual(await page.locator('.catalogue-card').evaluateAll(cards => cards.map(card => card.dataset.code)), order);
    for (const code of order) {
      assert.equal(await page.locator(`[data-code="${code}"] img.card-photo`).getAttribute('alt'), reviewed[code].hotel.alt, code);
      assert.equal(await page.locator(`[data-code="${code}"] .photo-tag`).innerText(), 'Hotel photo', code);
    }
    await loaded(page, 'img.card-photo');
    assert.equal(await page.locator('.photo-fallback').count(), 0);
    await shot(page, 'start', width);
    for (const code of [PAN, SIAM, HYATT]) {
      await page.locator(`[data-code="${code}"] .catalogue-open`).click(); await visible(page, 'booked-screen');
      assert.equal(await page.locator('#booked-photo img.card-photo').getAttribute('alt'), reviewed[code].hotel.alt);
      assert.equal(await page.locator('#booked-photo-tag').innerText(), 'Hotel photo');
      assert.equal(await page.locator('#booked-room').isVisible(), Boolean(reviewed[code].room), code + ' room photo shown only when reviewed');
      if (reviewed[code].room) {
        assert.equal(await page.locator('#booked-room img').getAttribute('alt'), reviewed[code].room.alt);
        assert.match(await page.locator('#booked-room').innerText(), /Room photo[\s\S]*Executive Marina Bay Room/i);
      }
      await loaded(page, '#booked-screen img');
      assert.match(await page.locator('#booked-note').innerText(), /A real Altovo staging quotation standing in for a confirmed booking · captured 18 Oct 2026/);
      assert.equal(await page.locator('#setup-drop').isDisabled(), code === HYATT);
      await shot(page, 'booked-' + code.toLowerCase(), width);
      await page.locator('#booked-back').click(); await visible(page, 'catalogue-screen');
    }
    await context.close();
    report.checks.push({ width, startPhotos: 'passed', bookedHotelPhoto: 'passed', bookedRoomPhoto: 'passed' });
  }

  // Judge A arms two codes; judge B arms one of them with another minimum. Nobody overwrites anybody.
  const a = await judgePage(768); const b = await judgePage(390);
  const panA = await armFromGrid(a.page, PAN, 1000);
  assert.equal(panA.receipt.watch.revision, 1); assert.equal(panA.receipt.watch.firstCheck.mode, 'captured-replay');
  await shot(a.page, 'armed-' + PAN.toLowerCase(), 768);
  const parkA = await armFromGrid(a.page, PARK, 5000);
  assert.equal(parkA.receipt.watch.revision, 1);
  await b.page.goto(origin); assert.equal(await watchOf(b.page, PAN), null, 'judge B starts with no setup on the shared code');
  const panB = await armFromGrid(b.page, PAN, 10000);
  assert.equal(panB.receipt.watch.minimumSavingMinor, 10000); assert.equal(panB.receipt.watch.revision, 1);
  assert.deepEqual(await watchOf(a.page, PAN), panA.receipt.watch, 'judge A keeps their own setup on the shared code');
  assert.deepEqual(await watchOf(a.page, PARK), parkA.receipt.watch, 'judge A keeps their other code');
  assert.equal(await watchOf(b.page, PARK), null, 'judge B has no setup on judge A\'s other code');
  report.checks.push({ twoJudgesOneCode: 'passed', oneJudgeTwoCodes: 'passed' });

  // Restart the launcher without a seed against the same emulator: both judges reload into their committed setups.
  restarting = true; await stopLauncher();
  await startLauncher(false);
  restarting = false;
  // A full load of the armed code's link (the tab was last on the other code).
  await a.page.goto(`${origin}/#drops-${PAN}`); await a.page.reload(); await visible(a.page, 'armed-strip');
  assert.equal(await a.page.locator('#armed-detail').innerText(), panA.detail);
  assert.deepEqual(await watchOf(a.page, PAN), panA.receipt.watch);
  assert.deepEqual(await watchOf(a.page, PARK), parkA.receipt.watch);
  await shot(a.page, 'restarted-armed-' + PAN.toLowerCase(), 768);
  await b.page.reload(); await visible(b.page, 'armed-strip');
  assert.equal(await b.page.locator('#armed-detail').innerText(), panB.detail);
  assert.deepEqual(await watchOf(b.page, PAN), panB.receipt.watch);
  await shot(b.page, 'restarted-armed-' + PAN.toLowerCase(), 390);
  report.checks.push({ restartKeepsSetup: 'passed', armedDetailA: panA.detail, armedDetailB: panB.detail });
  await a.context.close(); await b.context.close();
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
  report.status = 'passed';
} catch (e) { report.status = 'failed'; report.error = e.message; process.exitCode = 1; }
finally {
  await stopLauncher(); await browser.close();
  // Remove only the evidence sessions; the imported shared records stay.
  const firestore = await createRoomdropFirestore({ GOOGLE_CLOUD_PROJECT: project, FIRESTORE_EMULATOR_HOST: host });
  for (const name of ['roomdropPublicSessionsV1', 'roomdropPublicSessionsV1Capacity']) await firestore.recursiveDelete(firestore.collection(name));
  await firestore.terminate();
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
