// Contract-v3 UI request/receipt proof with an injected arm endpoint, not integrated persistence.
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';
import { localChromium } from './browser-chromium.mjs';

const output = resolve('.local/part2-v3-browser'); await mkdir(output, { recursive: true });
const catalogue = altovoCatalogueFixture(), code = 'AIRB000180', bundle = catalogue.entries[0].bundle;
const server = createBookingDemoServer({ catalogue, now: () => new Date('2026-10-20T00:00:00Z') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = 'http://127.0.0.1:' + server.address().port;
let playwright;
try { playwright = await import('playwright'); }
catch { playwright = await import(pathToFileURL(join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href); }
const browser = await playwright.chromium.launch({ headless: true, executablePath: localChromium() });
const report = { status: 'started', proof: 'injected-v3-arm-endpoint', checks: [], errors: [], external: [] };
try {
  for (const width of [320, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    let watch = null, unavailable = null; const bodies = [];
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue()
      : (report.external.push(new URL(route.request().url()).origin), route.abort()));
    await context.route('**/api/booking-demo/q/' + code, async route => {
      const response = await route.fetch(), data = await response.json();
      await route.fulfill({ response, json: { ...data, dropSetVersion: 'd'.repeat(64),
        capture: { status: 'observed', capturedAt: bundle.checkedAt }, watch, confirmation: null } });
    });
    await context.route('**/api/booking-demo/q/' + code + '/watch', async route => {
      const body = route.request().postDataJSON(); bodies.push(body);
      if (unavailable) return route.fulfill({ status: 503, json: { error: { code: unavailable } } });
      if (body.expectedRevision !== (watch?.revision ?? 0)) return route.fulfill({ status: 409, json: { error: { code: 'WATCH_REVISION_STALE' } } });
      const at = '2026-10-20T00:00:00.000Z';
      const dropOptionIds = bundle.options.filter(option => option.indicativeDifferenceMinor >= body.minimumSavingMinor).map(option => option.optionId);
      watch = { code, revision: (watch?.revision ?? 0) + 1, contentVersion: bundle.snapshotVersion, dropSetVersion: 'd'.repeat(64),
        consent: { version: 'roomdrop-drop-watch-consent-2026-10-18', acceptedAt: at }, currency: bundle.baseline.quotedRetail.currency,
        minimumSavingMinor: body.minimumSavingMinor, armedAt: at,
        firstCheck: { mode: 'captured-replay', replayed: true, status: 'completed', captureStatus: 'observed',
          replayedAt: at, checkedAt: bundle.checkedAt, capturedAt: [bundle.checkedAt], thresholdMinor: body.minimumSavingMinor, dropOptionIds } };
      await route.fulfill({ json: { watch, dropOptionIds } });
    });
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    const visible = id => page.locator('#' + id).waitFor({ state: 'visible' });
    // After the committed arm: the hand-off, then the Drops list (the armed strip is always hidden now).
    const drops = async () => { await visible('handoff'); await page.locator('#open-roomdrop').click(); await visible('deal-list'); };
    const changeMinimum = async () => { await page.evaluate(code => { location.hash = '#setup-' + code; }, code); await visible('setup-screen'); };
    await page.goto(origin + '/#setup-' + code); await visible('setup-screen'); await page.locator('#judge-consent').check();
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/watch')), page.locator('#arm-watch').click()]);
    assert.equal(bodies[0].expectedRevision, 0); await drops(); assert.equal(watch.revision, 1);
    await changeMinimum();
    await page.locator('input[name="minimum-saving"][value="5000"]').check(); await page.locator('#arm-watch').click();
    await drops(); assert.equal(bodies[1].expectedRevision, 1); assert.equal(watch.revision, 2);
    await changeMinimum();
    watch = { ...watch, revision: 3 }; const committed = JSON.stringify(watch);
    await page.locator('input[name="minimum-saving"][value="10000"]').check(); await page.locator('#arm-watch').click();
    await page.locator('#setup-message').filter({ hasText: /changed.*Reload/ }).waitFor();
    assert.equal(bodies[2].expectedRevision, 2); assert.equal(JSON.stringify(watch), committed);
    assert.equal(await page.locator('#deal-list').isVisible(), false);
    await page.reload(); await visible('setup-screen');
    // A fresh #setup- load opens RoomDrop's modal over the agency page; failed arms keep it open for a retry.
    assert.equal(await page.locator('#drop-modal').evaluate(dialog => dialog.open), true);
    for (const errorCode of ['CATALOGUE_UNAVAILABLE', 'DEMO_UNAVAILABLE']) {
      unavailable = errorCode;
      await Promise.all([page.waitForResponse(response => response.url().endsWith('/watch')), page.locator('#arm-watch').click()]);
      await page.locator('#setup-message').filter({ hasText: /unavailable/ }).waitFor();
      assert.equal(bodies.at(-1).expectedRevision, 3); assert.equal(JSON.stringify(watch), committed);
      assert.deepEqual([await page.locator('#setup-screen').isVisible(), await page.locator('#checking-screen').isVisible()], [true, false]);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: join(output, `stale-and-unavailable-${width}.png`), fullPage: true });
    report.checks.push({ width, firstArmRevision: 0, rearmRevision: 1, staleRejected: true, unavailablePreservesReceipt: true });
    await context.close();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.message = error.message; process.exitCode = 1; }
finally {
  await browser.close(); await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
