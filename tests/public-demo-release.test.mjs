import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { main } from '../scripts/prepare-booking-release.mjs';
import { altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';
import { validateCatalogueManifest } from '../app/booking-cloud.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true }).toString().trim();
test('release preparation is offline by default and requires exact private input and commit', async () => {
  assert.equal((await main([])).status, 'offline');
  for (const args of [['--prepare'], ['--prepare', '--source=HEAD', '--manifest=.local/input.json'],
    ['--prepare', '--deploy'], ['--prepare', '--prepare'], ['--prepare', `--source=${source}`, '--manifest=package.json'],
    ['--prepare', `--source=${source}`, '--snapshot=.local/old.json']])
    await assert.rejects(main(args));
});
test('catalogue manifest includes only bounded reviewed codes and versions', () => {
  const manifest = { schemaVersion: 1, entries: [{ code: 'TEST0001', contentVersion: 'content-v1', dropSetVersion: 'drops-v1' }] };
  assert.equal(validateCatalogueManifest(manifest), manifest);
  for (const bad of [{ ...manifest, token: 'private' }, { ...manifest, entries: [] },
    { ...manifest, entries: [manifest.entries[0], manifest.entries[0]] },
    { ...manifest, entries: [{ ...manifest.entries[0], bundle: {} }] },
    { ...manifest, entries: [{ ...manifest.entries[0], code: '../private' }] }]) assert.throws(() => validateCatalogueManifest(bad));
});
test('test-injected booking context closes all runtime imports and packages only a code/version manifest', async t => {
  const input = resolve(root, '.local', `part2-package-${randomUUID()}.json`);
  const pins = { schemaVersion: 1, entries: [{ code: 'AIRB000180', contentVersion: altovoCatalogueFixture().entries[0].bundle.snapshotVersion, dropSetVersion: 'capture-v1' }] };
  await mkdir(dirname(input), { recursive: true }); await writeFile(input, JSON.stringify(pins));
  // This explicit working-tree source injection is test-only and has no registry tag.
  const result = await main(['--prepare', `--source=${source}`, `--manifest=${input}`], {
    readSource: name => readFile(resolve(root, name)),
  });
  assert.equal(result.status, 'test-prepared-offline');
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert.equal(manifest.sourceCommit, source); assert.equal(manifest.sourceMode, 'test-injected'); assert.equal(manifest.uncommittedFilesExcluded, false);
  const files = new Map(manifest.files.map(file => [file.path, file]));
  assert.ok(files.has('app/quotation-session-actions.mjs'));
  assert.ok(files.has('app/booking-storage.mjs')); assert.ok(files.has('app/quotation-session-storage.mjs'));
  assert.equal(files.has('booking-demo.json'), false); assert.equal(files.has('booking-catalogue.json'), false);
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
  const catalogue = JSON.parse(await readFile(resolve(result.contextDirectory, 'booking-catalogue-manifest.json'), 'utf8'));
  assert.deepEqual(catalogue, pins);
  const { createBookingDemoServer } = await import(pathToFileURL(resolve(result.contextDirectory, 'app/booking-demo-server.mjs')).href);
  const server = createBookingDemoServer({ catalogue: altovoCatalogueFixture(),
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
  const committed = await watch.json();
  const confirmation = await post('confirm', { snapshotVersion: data.snapshotVersion, watchBinding: JSON.stringify(committed.watch), optionId: 'option-fixture-flex-premier', acceptedDemoOnly: true });
  assert.equal(confirmation.status, 200); assert.equal((await confirmation.json()).confirmation.reservationCreated, false);
  for (const asset of ['/booking-live.js', '/booking-live-data.js', '/stay-advice.js']) assert.equal((await fetch(origin + asset)).status, 200);
  assert.equal((await fetch(origin + '/api/import')).status, 404);
  console.log(JSON.stringify({ evidence: 'test-injected-source-only', ...result }));
});
