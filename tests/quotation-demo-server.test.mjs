import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotationDemoServer, validateLocalQuotationMode } from '../app/quotation-demo-server.mjs';
import { createMemorySessionStorage } from '../app/quotation-session-storage.mjs';
import { NOW, listen, plannedBookings } from './fixtures/roomdrop-harness.mjs';

const bundle = () => ({ schemaVersion: 1, transactionMode: 'selection-only', snapshotVersion: 'a'.repeat(64),
  baseline: { sourceType: 'quotation', quotationCode: 'TEST-QUOTE', hotel: { id: 'h', name: 'Hotel' } },
  options: [{ optionId: 'option-1', roomName: 'Room', freeCancellation: true, estimate: { totalMinor: 10000, currency: 'AED', isEstimate: true } },
    { optionId: 'option-2', roomName: 'Room 2', freeCancellation: false, estimate: { totalMinor: 9000, currency: 'AED', isEstimate: true } }],
  privateReferences: { 'option-1': { rateDetail: 'PRIVATE-token' }, 'option-2': { rateDetail: 'PRIVATE-token2' } } });
async function app(t) {
  const server = createQuotationDemoServer({ bundle: bundle() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + '/api/quotation-demo');
  return { origin, cookie: response.headers.get('set-cookie').split(';')[0], data: await response.json() };
}
test('quotation server refuses production, cloud and non-loopback activation', () => {
  for (const env of [{ NODE_ENV: 'production' }, { K_SERVICE: 'service' }, { CLOUD_RUN_JOB: 'job' }, { BIND_HOST: '0.0.0.0' }]) {
    assert.throws(() => validateLocalQuotationMode(env));
  }
  assert.doesNotThrow(() => validateLocalQuotationMode({}));
});
test('quotation GET strips private identities and local server denies transaction and arbitrary lookup routes', async t => {
  const a = await app(t);
  assert.doesNotMatch(JSON.stringify(a.data), /PRIVATE-token|privateReferences/);
  for (const path of ['/api/bootstrap', '/api/quotation-demo?code=OTHER', '/api/switches', '/api/prebook', '/api/book', '/.env']) {
    const response = await fetch(a.origin + path);
    assert.ok([400, 404].includes(response.status));
  }
});
test('demo confirmation requires session, origin, CSRF and current source binding; it creates only a demo-selection receipt', async t => {
  const a = await app(t);
  const body = { optionId: 'option-1', snapshotVersion: a.data.snapshotVersion, acceptedDemoOnly: true };
  const send = (patch = {}, headers = {}) => fetch(a.origin + '/api/quotation-demo/confirm', { method: 'POST',
    headers: { Origin: a.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrfToken, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ ...body, ...patch }) });
  for (const [patch, headers] of [[{}, { Origin: 'https://evil.invalid' }], [{}, { 'X-CSRF-Token': 'wrong' }],
    [{ acceptedDemoOnly: 'true' }, {}], [{ snapshotVersion: 'old' }, {}], [{ optionId: 'other' }, {}], [{ booking: true }, {}]]) {
    assert.ok((await send(patch, headers)).status >= 400);
  }
  const result = await (await send()).json();
  assert.equal(result.confirmation.status, 'demo-selection-confirmed');
  assert.equal(result.confirmation.reservationCreated, false); assert.equal(result.confirmation.quoteModified, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-token|privateReferences|bookingReference/);
  assert.deepEqual((await (await send()).json()).confirmation, result.confirmation);
  const refreshed = await (await fetch(a.origin + '/api/quotation-demo', { headers: { Cookie: a.cookie } })).json();
  assert.deepEqual(refreshed.confirmation, result.confirmation);
});
// ---- Stored catalogue mode at the quotation paths, with injected storage (no emulator needed). ----
const unavailable = () => { throw Object.assign(new Error('14 UNAVAILABLE: firestore.internal.example:443 secret detail'), { code: 'STORAGE_UNAVAILABLE' }); };
async function stored(t, { bookingStorage = plannedBookings(), sessionStorage = createMemorySessionStorage({ now: NOW }) } = {}) {
  const origin = await listen(t, createQuotationDemoServer({ bookingStorage, sessionStorage, now: NOW }));
  return { origin, read: (path, headers = {}) => fetch(origin + path, { headers }) };
}
test('stored catalogue mode refuses mixed data sources and serves only the reviewed manifest', async t => {
  assert.throws(() => createQuotationDemoServer({ bookingStorage: plannedBookings(), bundle: bundle() }));
  assert.throws(() => createQuotationDemoServer({ sessionStorage: createMemorySessionStorage({}), bundle: bundle() }));
  const looked = []; const bookings = plannedBookings();
  const { read } = await stored(t, { bookingStorage: { ...bookings, getBooking: code => { looked.push(code); return bookings.getBooking(code); } } });
  const catalogue = await read('/api/quotation-demo/catalogue');
  assert.equal(catalogue.status, 200);
  const cookie = catalogue.headers.get('set-cookie').split(';')[0];
  assert.deepEqual((await catalogue.json()).entries.map(entry => entry.code), ['AIRB000180', 'AIRB000179']);
  looked.length = 0;
  for (const code of ['AIRB999999', 'airb000180', '%41IRB000180', 'AIRB000180%00', 'AIRB000180/x', 'A'.repeat(21)]) {
    assert.equal((await read('/api/quotation-demo/q/' + code, { Cookie: cookie })).status, 404, code);
  }
  assert.equal((await read('/api/quotation-demo/q/AIRB000180?code=AIRB999999', { Cookie: cookie })).status, 400);
  assert.equal((await read('/api/quotation-demo', { Cookie: cookie })).status, 404);
  assert.deepEqual(looked, []);
  assert.equal((await read('/api/quotation-demo/q/AIRB000180', { Cookie: cookie })).status, 200);
});
test('stored catalogue mode fails closed with 503 when the database is unavailable, then recovers without a fallback', async t => {
  let down = true; const bookings = plannedBookings();
  const flaky = { listCatalogue: async () => (down ? unavailable() : bookings.listCatalogue()), getBooking: async code => (down ? unavailable() : bookings.getBooking(code)) };
  const { read } = await stored(t, { bookingStorage: flaky });
  for (const path of ['/api/quotation-demo/catalogue', '/api/quotation-demo/q/AIRB000180']) {
    const response = await read(path); const text = await response.text();
    assert.equal(response.status, 503, path); assert.equal(JSON.parse(text).error.code, 'CATALOGUE_UNAVAILABLE');
    assert.doesNotMatch(text, /UNAVAILABLE: |firestore\.internal|secret/); assert.equal(response.headers.get('set-cookie'), null);
  }
  down = false;
  assert.equal((await read('/api/quotation-demo/catalogue')).status, 200);
  const sessions = { mode: 'firestore', create: async () => unavailable(), get: async () => unavailable(), transact: async () => unavailable() };
  const broken = await stored(t, { sessionStorage: sessions });
  const response = await broken.read('/api/quotation-demo/catalogue'); const text = await response.text();
  assert.deepEqual([response.status, JSON.parse(text).error.code], [503, 'DEMO_UNAVAILABLE']); assert.doesNotMatch(text, /firestore\.internal|secret/);
});
test('non-refundable selection needs a separate literal reduced-flexibility acknowledgement', async t => {
  const a = await app(t); const headers = { Origin: a.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrfToken, 'Content-Type': 'application/json' };
  const body = { optionId: 'option-2', snapshotVersion: a.data.snapshotVersion, acceptedDemoOnly: true };
  const send = data => fetch(a.origin + '/api/quotation-demo/confirm', { method: 'POST', headers, body: JSON.stringify(data) });
  assert.equal((await send(body)).status, 400);
  assert.equal((await send({ ...body, acceptReducedFlexibility: true })).status, 200);
});
