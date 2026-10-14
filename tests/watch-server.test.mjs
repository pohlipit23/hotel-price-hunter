import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createAppServer } from '../app/server.mjs';
import { createTestMemoryStorage, createStorage } from '../app/storage.mjs';
import { runPriceWatchPass, validateWorkerEnvironment } from '../scripts/run-price-watch.mjs';
const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
async function app(t, options = {}) {
  const storage = options.storage ?? createTestMemoryStorage();
  const server = createAppServer({ fixture, storage, advisor: { available: false, status: 'unconfigured' }, now: () => new Date('2026-10-15T03:00:00Z'), ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const boot = await fetch(`${origin}/api/bootstrap`); const initial = await boot.json(); const cookie = boot.headers.get('set-cookie').split(';')[0];
  const post = (intent, extra = {}, body = intent.body) => fetch(`${origin}/api/price-watch`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': initial.csrfToken, 'Idempotency-Key': intent.idempotencyKey, ...extra }, body: JSON.stringify(body) });
  return { initial, origin, cookie, post, storage };
}
test('customer opt-in concurrency, read-only previews and replay after stop preserve independent authority', async t => {
  const a = await app(t); const intent = a.initial.priceWatch.consentIntents.enable;
  const responses = await Promise.all([a.post(intent), a.post(intent)]); assert.deepEqual(responses.map(r => r.status), [200, 200]);
  const states = await Promise.all(responses.map(r => r.json())); assert.deepEqual(states.map(s => s.replayed).sort(), [false, true]);
  const enabled = states[0]; assert.equal(enabled.priceWatch.version, 1); assert.equal(enabled.enrolled, false); assert.equal(enabled.permissionRecord, null);
  assert.deepEqual(enabled.preferences, a.initial.preferences); assert.deepEqual(enabled.offers, a.initial.offers);
  const notices = await (await fetch(`${a.origin}/api/notifications`, { headers: { Cookie: a.cookie } })).json();
  assert.equal(notices.notifications.length, 3); assert.equal(notices.deliveryMode, 'preview-only');
  assert.doesNotMatch(JSON.stringify(notices), /visitorId|watchId|offerToken|commands|sent|delivered/);
  const stopped = await (await a.post(enabled.priceWatch.consentIntents.disable)).json(); assert.equal(stopped.priceWatch.enabled, false);
  const replay = await (await a.post(intent)).json(); assert.equal(replay.replayed, true); assert.equal(replay.priceWatch.enabled, false);
  const page = await fetch(`${a.origin}/api/bootstrap`); const other = await page.json(); const otherCookie = page.headers.get('set-cookie').split(';')[0];
  assert.equal((await a.post(intent, { Cookie: otherCookie, 'X-CSRF-Token': other.csrfToken })).status, 422);
  assert.equal((await fetch(`${a.origin}/api/notifications`, { headers: { Cookie: otherCookie } }).then(r => r.json())).notifications.length, 0);
});
test('watch route rejects session, CSRF, origin, injected outcomes and bad notification bounds', async t => {
  const a = await app(t); const intent = a.initial.priceWatch.consentIntents.enable;
  for (const headers of [{ Cookie: '' }, { Origin: 'https://elsewhere.example' }, { 'X-CSRF-Token': 'bad' }, { 'Idempotency-Key': '' }]) assert.equal((await a.post(intent, headers)).ok, false);
  for (const body of [{ ...intent.body, enabled: 'true' }, { ...intent.body, watchVersion: -1 }, { ...intent.body, outcome: 'offers-found' }]) assert.equal((await a.post(intent, {}, body)).status, 422);
  assert.equal((await fetch(`${a.origin}/api/notifications`)).status, 401);
  for (const query of ['limit=51', 'limit=0', 'limit=1&limit=2', 'visitor=anything', 'limit=1.2']) assert.equal((await fetch(`${a.origin}/api/notifications?${query}`, { headers: { Cookie: a.cookie } })).status, 422);
  assert.equal((await fetch(`${a.origin}/api/price-watch/run`, { method: 'POST' })).status, 404);
});
test('worker private discovery records next-day checks once, resumes and filters expired/stopped locators', async t => {
  const a = await app(t); await a.post(a.initial.priceWatch.consentIntents.enable);
  const day = () => new Date('2026-10-16T03:00:00Z');
  const pass = await runPriceWatchPass({ storage: a.storage, fixture, now: day }); assert.equal(pass.examined, 1); assert.equal(pass.results[0].status, 'offers-found');
  const replay = await runPriceWatchPass({ storage: a.storage, fixture, now: day }); assert.equal(replay.results[0].replayed, true);
  const current = await (await fetch(`${a.origin}/api/bootstrap`, { headers: { Cookie: a.cookie } })).json();
  await a.post(current.priceWatch.consentIntents.disable);
  assert.deepEqual((await runPriceWatchPass({ storage: a.storage, fixture, now: day })).results, []);
});
test('local worker configuration refuses default and production, permits only explicit loopback/demo modes', () => {
  assert.throws(() => validateWorkerEnvironment({}, ['--once']), /demo project/);
  const local = { GOOGLE_CLOUD_PROJECT: 'demo-hotel-price-hunter', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' };
  assert.equal(validateWorkerEnvironment(local, ['--once']).loop, false);
  assert.equal(validateWorkerEnvironment(local, ['--loop']).loop, true);
  for (const override of [{ NODE_ENV: 'production' }, { K_SERVICE: 'cloud' }, { GOOGLE_CLOUD_PROJECT: 'real-project' }, { FIRESTORE_EMULATOR_HOST: 'remote.example:8081' }, { PRICE_WATCH_FIXTURE_OUTCOME: 'live' }]) assert.throws(() => validateWorkerEnvironment({ ...local, ...override }, ['--once']));
  assert.throws(() => validateWorkerEnvironment(local, []));
});
test('failed watch storage commit cannot record consent, private index, check or preview', async t => {
  const base = createTestMemoryStorage();
  const storage = { ...base, update: async (id, change) => { change(await base.get(id)); throw new Error('private credentials'); } };
  const a = await app(t, { storage }); const response = await a.post(a.initial.priceWatch.consentIntents.enable);
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /credentials/);
  const saved = await base.get(a.cookie.split('=')[1]); assert.equal(saved.priceWatch, undefined);
  assert.deepEqual(await base.listWatches({ limit: 50 }), []);
});
test('worker discovery consent, baseline and preference races record skipped evidence without publishing savings', async t => {
  for (const mutate of [s => { s.priceWatch.enabled = false; s.priceWatch.version++; }, s => { s.priceWatch.version += 2; s.priceWatch.epoch++; }, s => { s.booking.version++; }, s => { s.preferences.version++; }, s => { s.operations.active = { status: 'running' }; }]) {
    const base = createTestMemoryStorage(); const a = await app(t, { storage: base }); await a.post(a.initial.priceWatch.consentIntents.enable);
    const before = await base.get(a.cookie.split('=')[1]); const priorEvents = Object.keys(before.priceWatch.events).length;
    let raced = false;
    const storage = { ...base, update: async (id, change) => { if (!raced) { raced = true; await base.update(id, state => { mutate(state); return state; }); } return base.update(id, change); } };
    const result = await runPriceWatchPass({ storage, fixture, now: () => new Date('2026-10-16T03:00:00Z') });
    assert.equal(result.results[0].status, 'skipped'); const after = await base.get(a.cookie.split('=')[1]);
    assert.equal(Object.keys(after.priceWatch.events).length, priorEvents); assert.deepEqual(after.priceWatch.lastCheck.checkOffers, []);
  }
});
test('delayed private discovery crossing the real cancellation deadline records a skipped result without searching', async t => {
  const base = createTestMemoryStorage(); const a = await app(t, { storage: base }); await a.post(a.initial.priceWatch.consentIntents.enable);
  let clock = new Date('2026-11-10T09:59:59Z'); let searched = false;
  const storage = { ...base, listWatches: async options => { const entries = await base.listWatches(options); await new Promise(resolve => setImmediate(resolve)); clock = new Date('2026-11-10T10:00:00Z'); return entries; } };
  const result = await runPriceWatchPass({ storage, fixture, now: () => clock, provider: () => { searched = true; return { status: 'complete', offers: [] }; } });
  assert.equal(searched, false); assert.equal(result.results[0].status, 'skipped'); assert.deepEqual(result.results[0].reasonCodes, ['CANCELLATION_WINDOW_ENDED']);
});
test('provider preparation crossing session expiry rejects customer consent atomically', async t => {
  let clock = new Date('2026-10-15T03:00:00Z');
  const a = await app(t, { now: () => clock, watchProvider: () => { clock = new Date('2026-11-14T03:00:00Z'); return { status: 'complete', offers: [] }; } });
  const response = await a.post(a.initial.priceWatch.consentIntents.enable); assert.equal(response.status, 401);
  assert.equal((await a.storage.get(a.cookie.split('=')[1])).priceWatch, undefined); assert.deepEqual(await a.storage.listWatches({ limit: 50 }), []);
});
test('Firestore watch integration: independent servers serialize consent, persist index/outbox and worker replay', { skip: !process.env.RUN_FIRESTORE_INTEGRATION }, async t => {
  assert.match(process.env.GOOGLE_CLOUD_PROJECT ?? '', /^demo-/);
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(localhost|127\.0\.0\.1):\d+$/);
  const first = await createStorage(process.env); const second = await createStorage(process.env);
  const a = await app(t, { storage: first }); const b = await app(t, { storage: second });
  const firstId = a.cookie.split('=')[1]; const secondId = b.cookie.split('=')[1];
  try {
    const intent = a.initial.priceWatch.consentIntents.enable;
    const responses = await Promise.all([a.post(intent), b.post(intent, { Cookie: a.cookie, 'X-CSRF-Token': a.initial.csrfToken })]);
    assert.deepEqual(responses.map(r => r.status), [200, 200]);
    const states = await Promise.all(responses.map(r => r.json())); assert.deepEqual(states.map(s => s.replayed).sort(), [false, true]);
    const restored = await second.get(firstId);
    assert.equal(Object.keys(restored.priceWatch.commands).length, 1); assert.equal(Object.keys(restored.priceWatch.runs).length, 1); assert.equal(Object.keys(restored.priceWatch.events).length, 3);
    const index = await second.listWatches({ limit: 50 }); assert.equal(index.filter(item => item.visitorId === firstId).length, 1);
    const after = '2026-10-16T03:00:00Z';
    const passes = await Promise.all([runPriceWatchPass({ storage: first, fixture, now: () => new Date(after) }), runPriceWatchPass({ storage: second, fixture, now: () => new Date(after) })]);
    assert.equal(passes.every(pass => pass.results.some(item => item.status === 'offers-found')), true);
    assert.equal(Object.keys((await first.get(firstId)).priceWatch.runs).length, 2);
    assert.equal(Object.keys((await first.get(firstId)).priceWatch.events).length, 5);
    const stop = states[0].priceWatch.consentIntents.disable;
    assert.equal((await b.post(stop, { Cookie: a.cookie, 'X-CSRF-Token': a.initial.csrfToken })).status, 200);
    const replay = await (await a.post(intent)).json(); assert.equal(replay.replayed, true); assert.equal(replay.priceWatch.enabled, false);
    assert.equal((await first.listWatches({ limit: 50 })).filter(item => item.visitorId === firstId).length, 1);
    await first.delete(firstId); assert.equal((await second.listWatches({ limit: 50 })).some(item => item.visitorId === firstId), false);
  } finally { await first.delete(firstId); await second.delete(secondId); await Promise.all([first.close(), second.close()]); }
});
