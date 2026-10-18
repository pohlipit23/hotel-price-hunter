import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';
import { watchBinding } from '../app/public/booking-live-data.js';
import { createHash, randomBytes } from 'node:crypto';
import { publicQuotationDemo } from '../app/domain/quotation-demo.mjs';

const code = 'AIRB000180', cookie = 'b'.repeat(64), at = new Date('2026-10-20T00:00:00Z');
async function app(t, { advisor, retry = false } = {}) {
  const entry = altovoCatalogueFixture().entries[0], bundle = entry.bundle;
  const watch = { code, revision: 1, contentVersion: bundle.snapshotVersion, dropSetVersion: 'capture-v1', currency: 'MYR',
    armedAt: at.toISOString(), minimumSavingMinor: 1000, firstCheck: { replayed: true, checkedAt: bundle.checkedAt, dropOptionIds: bundle.options.map(option => option.optionId) } };
  const sessions = new Map([[cookie, { csrfToken: 'durable-csrf', expiresAt: at.getTime() + 3600000,
    byCode: { [code]: { contentVersion: bundle.snapshotVersion, dropSetVersion: watch.dropSetVersion, watch } } }]]);
  let unavailable = false, inTransaction = false;
  const sessionStorage = { get: async id => { if (unavailable) throw Error('PRIVATE-storage'); return structuredClone(sessions.get(id)); },
    transact: async (id, fn) => {
      if (unavailable) throw Error('PRIVATE-storage');
      inTransaction = true;
      try { if (retry) fn(structuredClone(sessions.get(id))); const next = structuredClone(sessions.get(id)), result = fn(next);
        assert.equal(result instanceof Promise, false); sessions.set(id, next); return structuredClone(result);
      } finally { inTransaction = false; }
    } };
  const record = { code, contentVersion: bundle.snapshotVersion, dropSetVersion: watch.dropSetVersion, bundle };
  const bookingStorage = { getBooking: async () => record,
    getDrops: async () => ({ dropSetVersion: record.dropSetVersion, captureStatus: 'observed', capturedAt: bundle.checkedAt, drops: bundle.options }) };
  const server = createBookingDemoServer({ reviewedCatalogue: { entries: [{ ...entry, contentVersion: record.contentVersion, dropSetVersion: record.dropSetVersion }] }, sessionStorage, bookingStorage,
    advisor, now: () => new Date(at) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const post = (action, body = {}, headers = {}) => fetch(origin + '/api/booking-demo/q/' + code + '/' + action, { method: 'POST',
    headers: { Cookie: 'roomdrop_quote=' + cookie, Origin: origin, 'X-CSRF-Token': 'durable-csrf', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ snapshotVersion: bundle.snapshotVersion, watchBinding: watchBinding(watch), ...body }) });
  return { post, sessions, record, sessionStorage, bookingStorage, inTransaction: () => inTransaction, fail: () => { unavailable = true; } };
}
const selection = { optionId: 'option-fixture-flex-premier', acceptedDemoOnly: true };
test('durable confirm reads only the injected store and returns the committed idempotent receipt', async t => {
  const a = await app(t);
  const first = await a.post('confirm', selection); assert.equal(first.status, 200);
  const receipt = (await first.json()).confirmation;
  assert.equal(a.sessions.get(cookie).byCode[code].confirmation.selectionId, receipt.selectionId);
  assert.equal((await (await a.post('confirm', selection)).json()).confirmation.selectionId, receipt.selectionId);
  for (const headers of [{ Origin: 'https://evil.invalid' }, { 'X-CSRF-Token': 'bad' }, { Cookie: '' }, { 'Sec-Fetch-Site': 'cross-site' }])
    assert.equal((await a.post('confirm', selection, headers)).status, 403);
  a.fail(); const failed = await a.post('confirm', selection); assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /PRIVATE-storage/);
});
test('durable advice reserves once, calls outside transactions and rechecks changed watch/confirmation', async t => {
  let a, calls = 0, release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  a = await app(t, { retry: true, advisor: { available: true, status: 'test-injected', chat: async request => {
    assert.equal(a.inTransaction(), false); calls++; entered(); await new Promise(resolve => { release = resolve; });
    assert.equal(request.options.length, 3); return { reply: 'Injected answer' };
  } } });
  const pending = a.post('chat', { pageContext: 'drops-overview', intent: 'opening' }); await started;
  assert.equal(a.sessions.get(cookie).adviceCount, 1);
  await a.post('confirm', selection); release(); const response = await pending;
  assert.equal(response.status, 409); assert.equal(calls, 1);
  assert.deepEqual(a.sessions.get(cookie).byCode[code].chatHistory, []);
});
test('durable route rejects changed catalogue versions without touching sessions', async t => {
  const a = await app(t); a.record.dropSetVersion = 'changed';
  const response = await a.post('confirm', selection); assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'DROPS_CHANGED');
  assert.equal(a.sessions.get(cookie).byCode[code].confirmation, undefined);
});
test('contract v2 unavailable bookings and invalid session state return bounded errors without a commit', async t => {
  for (const [code, status, responseCode] of [['BOOKING_UNAVAILABLE', 404, 'BOOKING_UNAVAILABLE'],
    ['SESSION_STATE_INVALID', 503, 'DEMO_UNAVAILABLE'], ['STORAGE_UNAVAILABLE', 503, 'DEMO_UNAVAILABLE'],
    ['CATALOGUE_UNAVAILABLE', 503, 'CATALOGUE_UNAVAILABLE'], ['DEMO_UNAVAILABLE', 503, 'DEMO_UNAVAILABLE']]) {
    const a = await app(t), failure = Object.assign(Error('PRIVATE-storage-detail'), { code });
    if (code === 'BOOKING_UNAVAILABLE') a.bookingStorage.getDrops = async () => { throw failure; };
    else a.sessionStorage.transact = async () => { throw failure; };
    const response = await a.post('confirm', selection); assert.equal(response.status, status, code);
    const body = await response.json(); assert.equal(body.error.code, responseCode); assert.doesNotMatch(JSON.stringify(body), /PRIVATE/);
    assert.equal(a.sessions.get(cookie).byCode['AIRB000180'].confirmation, undefined);
  }
});

test('Firestore durable HTTP: independent instances recover receipts/context without process-local sessions',
  { skip: process.env.RUN_ROOMDROP_PART2_FIRESTORE !== '1' }, async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-roomdrop-part2');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8281');
  const { Firestore } = await import('@google-cloud/firestore');
  const clients = [0, 1, 2].map(() => new Firestore({ projectId: 'demo-roomdrop-part2', host: '127.0.0.1:8281', ssl: false }));
  const collection = 'roomdropPart2Http' + randomBytes(8).toString('hex');
  const hash = value => createHash('sha256').update(value).digest('hex');
  const token = randomBytes(32).toString('hex');
  const bundle = publicQuotationDemo(altovoCatalogueFixture().entries[0].bundle);
  const watch = { code, revision: 1, contentVersion: bundle.snapshotVersion, dropSetVersion: 'capture-v1', currency: 'MYR',
    armedAt: at.toISOString(), minimumSavingMinor: 1000, firstCheck: { replayed: true, checkedAt: bundle.checkedAt,
      dropOptionIds: bundle.options.map(option => option.optionId) } };
  const session = { csrfToken: 'emulator-csrf', expiresAt: at.getTime() + 3600000,
    byCode: { [code]: { contentVersion: bundle.snapshotVersion, dropSetVersion: watch.dropSetVersion, watch } } };
  const record = { code, contentVersion: bundle.snapshotVersion, dropSetVersion: watch.dropSetVersion, bundle };
  const drops = { dropSetVersion: watch.dropSetVersion, captureStatus: 'observed', capturedAt: bundle.checkedAt, drops: bundle.options };
  const servers = [], requests = [];
  const run = async db => {
    const docs = db.collection(collection);
    // Contract-v1 adapter double: real Firestore authority, test-owned documents, no allocation or arm implementation.
    const sessionStorage = { get: async cookie => { const doc = await docs.doc(hash(cookie)).get(); return doc.exists ? doc.data() : null; },
      transact: (cookie, fn) => db.runTransaction(async transaction => {
        const ref = docs.doc(hash(cookie)), snapshot = await transaction.get(ref);
        const value = snapshot.exists ? snapshot.data() : null;
        if (!value || value.expiresAt <= at.getTime()) throw Object.assign(Error('Expired'), { code: 'DEMO_SESSION_REQUIRED' });
        const result = fn(value); assert.equal(result instanceof Promise, false); transaction.set(ref, value); return result;
      }) };
    const bookingStorage = { getBooking: async () => (await docs.doc('booking').get()).data(), getDrops: async () => (await docs.doc('drops').get()).data() };
    const advisor = { available: true, status: 'test-injected', chat: async input => { requests.push(input); return { reply: 'Injected durable comparison' }; } };
    const server = createBookingDemoServer({ reviewedCatalogue: { entries: [{ code, bundle, contentVersion: record.contentVersion, dropSetVersion: record.dropSetVersion }] }, sessionStorage, bookingStorage, advisor, now: () => new Date(at) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server);
    const origin = 'http://127.0.0.1:' + server.address().port;
    return (action, body) => fetch(origin + '/api/booking-demo/q/' + code + '/' + action, { method: 'POST',
      headers: { Cookie: 'roomdrop_quote=' + token, Origin: origin, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotVersion: bundle.snapshotVersion, watchBinding: watchBinding(watch), ...body }) });
  };
  try {
    await clients[0].collection(collection).doc(hash(token)).create(session);
    await clients[0].collection(collection).doc('booking').create(record); await clients[0].collection(collection).doc('drops').create(drops);
    const a = await run(clients[0]), b = await run(clients[1]);
    const responses = await Promise.all([a('confirm', selection), b('confirm', selection)]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    const receipts = await Promise.all(responses.map(response => response.json())); assert.deepEqual(receipts[0], receipts[1]);
    assert.equal((await a('chat', { pageContext: 'drops-overview', intent: 'question', message: 'Keep flexibility' })).status, 200);
    await new Promise(resolve => { servers[0].closeAllConnections(); servers[0].close(resolve); });
    const c = await run(clients[2]);
    assert.deepEqual(await (await c('confirm', selection)).json(), receipts[0]);
    assert.equal((await c('chat', { pageContext: 'drops-overview', intent: 'question', message: 'And the price?' })).status, 200);
    assert.equal(requests[1].history.length, 1);
    assert.equal(requests[1].history[0].question, 'Keep flexibility');
    const saved = (await clients[2].collection(collection).doc(hash(token)).get()).data();
    assert.equal(saved.byCode[code].chatHistory.length, 2); assert.deepEqual(saved.byCode[code].watch, watch);
    assert.deepEqual((await clients[2].collection(collection).doc('booking').get()).data(), record);
    assert.deepEqual((await clients[2].collection(collection).doc('drops').get()).data(), drops);
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
    await Promise.all([hash(token), 'booking', 'drops'].map(id => clients[1].collection(collection).doc(id).delete()));
    await Promise.all(clients.map(client => client.terminate()));
  }
});
