// Judge flow browser check on the deterministic fixture catalogue: start -> booked -> setup -> armed -> Drops -> Review -> Confirmed,
// plus the non-refundable cannot-start path, at 320, 768 and 1440 px. No live supplier, Altovo or Gemini calls.
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';

const output = resolve('.local/judge-flow/browser'); await mkdir(output, { recursive: true });
let playwright; try { playwright = await import('playwright'); } catch { playwright = await import(pathToFileURL(join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
const cache = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'ms-playwright');
const builds = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
const browser = await playwright.chromium.launch({ headless: true, executablePath: join(cache, builds[0], 'chrome-win64/chrome.exe') });
const server = createBookingDemoServer({ catalogue: altovoCatalogueFixture(), now: () => new Date('2026-10-20T00:00:00Z') });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port;
const report = { status: 'started', checks: [], errors: [], external: [], screenshots: [] };
try {
  for (const width of [320, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 1440 ? 'no-preference' : 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (report.external.push(route.request().url()), route.abort()));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    const visible = id => page.locator('#' + id).waitFor({ state: 'visible' });
    const focused = async id => assert.equal(await page.evaluate(() => document.activeElement?.id), id, width + ' focus ' + id);
    const shot = async (stage, fullPage = true) => {
      assert.doesNotMatch(await page.locator('body').innerText(), /fictional|potential refund after|[\u2013\u2014]/i, stage);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), stage + ' overflow at ' + width);
      for (const button of await page.locator('button:visible').all()) assert((await button.boundingBox()).height >= 44, stage + ' small control at ' + width);
      const path = join(output, stage + '-' + width + '.png'); await page.screenshot({ path, fullPage }); report.screenshots.push(path);
    };
    const arm = async (choice, expectEmpty = false) => {
      await page.locator(`input[name="minimum-saving"][value="${choice}"]`).check();
      await page.locator('#arm-watch').click();
      await visible('checking-screen');
      assert.match(await page.locator('#checking-replay').innerText(), /Replayed check · captured 18 Oct 2026, 12:10 UTC · not live/);
      if (choice === 5000) await shot('checking', false);
      await visible('armed-strip'); await focused('armed-title');
      assert.equal(await page.locator('#offer-empty').isVisible(), expectEmpty);
    };

    await page.goto(origin); await visible('catalogue-screen');
    assert.equal(new URL(page.url()).hash, '#start'); assert.equal(await page.locator('#customer-steps').isVisible(), false);
    assert.equal(await page.locator('.catalogue-card').count(), 2);
    assert.match(await page.locator('[data-code="AIRB000180"] .watch-tag').innerText(), /Drop Watch ready/);
    assert.match(await page.locator('[data-code="AIRB000179"] .watch-tag').innerText(), /Cannot start: non-refundable/);
    await shot('start');

    await page.locator('[data-code="AIRB000180"] .catalogue-open').click(); await visible('booked-screen'); await focused('booked-title');
    assert.equal(new URL(page.url()).hash, '#booked-AIRB000180');
    const booked = await page.locator('#booked-screen').innerText();
    assert.match(booked, /Your agency booked this/i); assert.match(booked, /A real Altovo staging quotation standing in for a confirmed booking/);
    assert.match(booked, /Free cancellation until 14 Feb 2027, 16:58 UTC/); assert.match(booked, /MYR 2,335\.52/); assert.match(booked, /1 guest/);
    await shot('booked');

    await page.locator('#setup-drop').click(); await visible('setup-screen'); await focused('setup-title');
    assert.equal(await page.locator('input[name="minimum-saving"]').count(), 4);
    await page.locator('#arm-watch').click(); await page.getByText('Tick the box so RoomDrop may check this booking').waitFor(); await focused('judge-consent');
    await page.locator('#judge-consent').check(); await shot('setup');
    await arm(5000);
    assert.equal(new URL(page.url()).hash, '#drops-AIRB000180');
    assert.equal(await page.locator('#offers .offer-ticket').count(), 2);
    assert.match(await page.locator('#armed-detail').innerText(), /Drops of MYR 50 or more · replayed check from 18 Oct 2026, 12:10 UTC/);
    await shot('drops');

    await page.goBack(); await visible('setup-screen'); await page.goForward(); await visible('armed-strip');
    await page.locator('#change-minimum').click(); await visible('setup-screen');
    assert.equal(await page.locator('input[name="minimum-saving"][value="5000"]').isChecked(), true);
    await arm(25000, true);
    assert.match(await page.locator('#offer-empty').innerText(), /No drops above your minimum yet/);
    await shot('empty');
    await page.locator('#lower-minimum').click(); await visible('setup-screen'); await arm(1000);
    assert.equal(await page.locator('#offers .offer-ticket').count(), 3);

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

    await page.locator('.brand').click(); await visible('catalogue-screen'); await focused('catalogue-title');
    await page.locator('[data-code="AIRB000179"] .catalogue-open').click(); await visible('booked-screen');
    assert.equal(await page.locator('#setup-drop').isVisible(), false); await visible('booked-blocked');
    assert.match(await page.locator('#booked-blocked').innerText(), /non-refundable/i);
    assert.match(await page.locator('#booked-screen').innerText(), /Non-refundable/);
    await shot('cannot-start');
    await page.goto(origin + '/#setup-AIRB000179'); await visible('booked-blocked');
    await page.locator('#pick-another').click(); await visible('catalogue-screen');
    await page.goBack(); await visible('booked-blocked');
    report.checks.push({ width, start: 'passed', booked: 'passed', consentRequired: 'passed', armed: 'passed', minimumFilter: 'passed', empty: 'passed',
      review: 'passed', confirmed: 'passed', reload: 'passed', backForward: 'passed', cannotStart: 'passed' });
    await context.close();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'passed';
} catch (e) { report.status = 'failed'; report.error = e.message; process.exitCode = 1; }
finally {
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(r => { server.closeAllConnections(); server.close(r); });
}
