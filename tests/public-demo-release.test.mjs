import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { main } from '../scripts/prepare-booking-release.mjs';
import { altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true }).toString().trim();
test('release preparation is offline by default and requires exact private input and commit', async () => {
  assert.equal((await main([])).status, 'offline');
  for (const args of [['--prepare'], ['--prepare', '--source=HEAD', '--catalogue=.local/input.json'],
    ['--prepare', '--deploy'], ['--prepare', '--prepare'], ['--prepare', `--source=${source}`, '--catalogue=package.json']])
    await assert.rejects(main(args));
});
test('frozen booking context has complete runtime imports, source hashes and a safe public catalogue', async t => {
  const input = resolve(root, '.local', `part2-package-${randomUUID()}.json`);
  await mkdir(dirname(input), { recursive: true }); await writeFile(input, JSON.stringify(altovoCatalogueFixture()));
  const result = await main(['--prepare', `--source=${source}`, `--catalogue=${input}`]);
  assert.equal(result.status, 'prepared-offline');
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert.equal(manifest.sourceCommit, source); assert.equal(manifest.uncommittedFilesExcluded, true);
  const files = new Map(manifest.files.map(file => [file.path, file]));
  assert.ok(files.has('app/quotation-session-actions.mjs'));
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(result.contextDirectory, file.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.equal(bytes.length, file.bytes);
    assert.doesNotMatch(file.path, /\.local|credentials|capture|\.env|import-altovo|prepare-altovo/);
    if (!/\.(?:mjs|js)$/.test(file.path)) continue;
    for (const match of bytes.toString().matchAll(/(?:from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g)) {
      const imported = posix.normalize(posix.join(posix.dirname(file.path), match[2]));
      assert.ok(files.has(imported), `${file.path} imports missing ${imported}`);
    }
  }
  assert.equal(createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex'), manifest.contextSha256);
  const catalogue = JSON.parse(await readFile(resolve(result.contextDirectory, 'booking-catalogue.json'), 'utf8'));
  assert.doesNotMatch(JSON.stringify(catalogue), /FIXTURE-PRIVATE|rateDetail|privateReferences|sourceId/);
  const { createBookingDemoServer } = await import(pathToFileURL(resolve(result.contextDirectory, 'app/booking-demo-server.mjs')).href);
  const server = createBookingDemoServer({ catalogue: { schemaVersion: 1, entries: catalogue.map(entry => ({ code: entry.code, bundle: entry.snapshot })) },
    now: () => new Date('2026-10-20T00:00:00Z') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + '/api/booking-demo/q/AIRB000180');
  assert.equal(response.status, 200); const data = await response.json();
  const headers = { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: origin, 'X-CSRF-Token': data.csrfToken, 'Content-Type': 'application/json' };
  const post = (action, body) => fetch(origin + '/api/booking-demo/q/AIRB000180/' + action, { method: 'POST', headers, body: JSON.stringify(body) });
  const watch = await post('watch', { snapshotVersion: data.snapshotVersion, consent: true, minimumSavingMinor: 1000 });
  assert.equal(watch.status, 200);
  const confirmation = await post('confirm', { snapshotVersion: data.snapshotVersion, optionId: 'option-fixture-flex-premier', acceptedDemoOnly: true });
  assert.equal(confirmation.status, 200); assert.equal((await confirmation.json()).confirmation.reservationCreated, false);
  for (const asset of ['/booking-live.js', '/booking-live-data.js', '/stay-advice.js']) assert.equal((await fetch(origin + asset)).status, 200);
  assert.equal((await fetch(origin + '/api/import')).status, 404);
  console.log(JSON.stringify({ evidence: 'frozen-memory-receipt-context-only', ...result }));
});
