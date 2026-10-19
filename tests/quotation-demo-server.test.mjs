import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotationDemoServer, validateLocalQuotationMode } from '../app/quotation-demo-server.mjs';
import { createMemorySessionStorage } from '../app/quotation-session-storage.mjs';
import { NOW, listen, plannedBookings, visit } from './fixtures/roomdrop-harness.mjs';
import { createHash } from 'node:crypto';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createCaptureTransport, createDropMailer, createMemoryDropMailStore } from '../app/drop-mail.mjs';

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

// ---- Drop email (app/drop-mail.mjs): the arm hook and inbox links, memory stores and the capture transport ----
const SIAM = 'AIRB000180';
async function mailed(t, { transport = createCaptureTransport({ from: 'drops@roomdrop.example', environment: {} }), clock = { time: NOW().getTime() } } = {}) {
  const now = () => new Date(clock.time); const bookingStorage = plannedBookings();
  const sessionStorage = createMemorySessionStorage({ now }); const store = createMemoryDropMailStore({ environment: {}, now });
  const mail = createDropMailer({ store, transport, pepper: 'p'.repeat(40), now });
  const origin = await listen(t, createBookingDemoServer({ bookingStorage, sessionStorage, now, mail }));
  const { contentVersion } = await bookingStorage.getBooking(SIAM);
  const arm = (judge, minimumSavingMinor, extra = { deliveryEmail: 'judge@example.test' }) => judge.post(SIAM, 'watch', { snapshotVersion: contentVersion, consent: true, minimumSavingMinor, ...extra });
  const redeem = (token, { cookie, headers = {}, code = SIAM } = {}) => fetch(`${origin}/api/booking-demo/q/${code}/inbox`, { method: 'POST',
    headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: JSON.stringify({ token }) });
  const tokenOf = message => /#inbox-AIRB000180~([A-Za-z0-9_-]{43})"/.exec(message.html)[1];
  return { origin, transport, store, sessionStorage, clock, contentVersion, arm, redeem, tokenOf };
}
test('Drop email: one email per arm revision after the commit, at most two per session, and caps never fail the arm', async t => {
  const m = await mailed(t); const judge = await visit(m.origin);
  const first = await m.arm(judge, 5000); assert.equal(first.status, 200);
  const receipt = await first.json();
  assert.deepEqual(receipt.watch.delivery, { channel: 'email', maskedEmail: 'j***@example.test', consentVersion: receipt.watch.delivery.consentVersion, status: 'scheduled' });
  assert.equal(m.transport.sent.length, 1); assert.equal(m.transport.sent[0].to, 'judge@example.test');
  assert.doesNotMatch(JSON.stringify(receipt), /judge@|"mail-[a-f0-9]/);
  // The committed watch reads back exactly as the receipt showed it, so the Drops page binding still matches.
  assert.deepEqual((await (await judge.get(SIAM)).json()).watch, receipt.watch);
  // An identical retry sends nothing; a new minimum is a new revision and a second email; a third is capped.
  assert.equal((await (await m.arm(judge, 5000)).json()).watch.delivery.status, 'scheduled'); assert.equal(m.transport.sent.length, 1);
  assert.equal((await (await m.arm(judge, 10000)).json()).watch.delivery.status, 'scheduled'); assert.equal(m.transport.sent.length, 2);
  const capped = await m.arm(judge, 12000); assert.equal(capped.status, 200);
  assert.deepEqual([(await capped.json()).watch.revision, m.transport.sent.length], [3, 2]);
  assert.equal((await (await judge.get(SIAM)).json()).watch.delivery.status, 'capped');
  // No address, no email and no delivery block.
  const quiet = await visit(m.origin); const plain = await (await m.arm(quiet, 5000, {})).json();
  assert.equal(Object.hasOwn(plain.watch, 'delivery'), false); assert.equal(m.transport.sent.length, 2);
});
test('Drop email: a failing transport still arms, reporting failed; the nothing-yet case still sends', async t => {
  const broken = await mailed(t, { transport: { name: 'broken', async send() { throw Error('PRIVATE-provider'); } } });
  const response = await broken.arm(await visit(broken.origin), 5000); const text = await response.text();
  assert.equal(response.status, 200); assert.equal(JSON.parse(text).watch.delivery.status, 'failed'); assert.doesNotMatch(text, /PRIVATE/);
  const m = await mailed(t); const receipt = await (await m.arm(await visit(m.origin), 1_000_000)).json();
  assert.deepEqual(receipt.dropOptionIds, []); assert.equal(receipt.watch.delivery.status, 'scheduled');
  assert.match(m.transport.sent[0].subject, /^No drop yet/);
});
test('Drop email: inbox links refuse cross-origin, non-JSON and GET redemption, and GET never opens or approves', async t => {
  const m = await mailed(t); const judge = await visit(m.origin); await m.arm(judge, 5000);
  const token = m.tokenOf(m.transport.sent[0]);
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': '' }]) {
    const response = await m.redeem(token, { headers }); assert.equal(response.status, 403, JSON.stringify(headers)); assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal((await m.redeem(token, { headers: { 'Content-Type': 'text/plain' } })).status, 400);
  for (const bad of ['short', token + 'x', null]) assert.equal((await m.redeem(bad)).status, 400);
  const extra = await fetch(`${m.origin}/api/booking-demo/q/${SIAM}/inbox`, { method: 'POST', headers: { Origin: m.origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, approve: true }) });
  assert.equal(extra.status, 400);
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(`${m.origin}/api/booking-demo/q/${SIAM}/inbox`, { method }); assert.equal(response.status, 404); assert.equal(response.headers.get('set-cookie'), null);
  }
  // A token in a query string never reaches a route; the link carries it only in the fragment.
  assert.equal((await fetch(`${m.origin}/api/booking-demo/q/${SIAM}/inbox?token=${token}`, { method: 'POST' })).status, 404);
  assert.equal((await m.store.peek(createHash('sha256').update(token).digest('hex'))).uses, 0);
  assert.equal((await m.redeem(token, { code: 'AIRB000179' })).status, 410);
});
test('Drop email: a fresh browser opens the Drops from the link, approves on its own, and the link ends with the session', async t => {
  const m = await mailed(t); const judge = await visit(m.origin);
  const armed = await (await m.arm(judge, 5000)).json(); const token = m.tokenOf(m.transport.sent[0]);
  // The arming browser already holds the session: nothing changes and no use is counted.
  const same = await m.redeem(token, { cookie: judge.cookie });
  assert.deepEqual([same.status, (await same.json()).status, same.headers.get('set-cookie')], [200, 'current', null]);
  const opened = await m.redeem(token);
  assert.deepEqual([opened.status, await opened.json()], [200, { status: 'opened', code: SIAM }]);
  const setCookie = opened.headers.get('set-cookie'); const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)[1]);
  assert.match(setCookie, /^roomdrop_quote=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+$/); assert.ok(maxAge > 0 && maxAge <= 3600);
  const cookie = setCookie.split(';')[0]; assert.notEqual(cookie, judge.cookie);
  // The forked session holds only this booking's watch, keeps the source expiry, and nothing is approved by opening it.
  const [source, fork] = await Promise.all([m.sessionStorage.get(judge.cookie.split('=')[1]), m.sessionStorage.get(cookie.split('=')[1])]);
  assert.deepEqual(Object.keys(fork.byCode), [SIAM]); assert.equal(fork.expiresAt, source.expiresAt); assert.notEqual(fork.csrfToken, source.csrfToken);
  const inbox = await visit(m.origin, { cookie }); const page = await (await inbox.get(SIAM)).json();
  assert.deepEqual(page.watch, armed.watch); assert.equal(page.confirmation, null);
  // The catalogue read in visit() restored the same session, with its own CSRF token.
  assert.equal(inbox.list.csrfToken, fork.csrfToken); assert.equal(inbox.response.headers.get('set-cookie'), null);
  const approved = await inbox.post(SIAM, 'confirm', { optionId: 'option-fixture-flex-premier', snapshotVersion: m.contentVersion, acceptedDemoOnly: true });
  assert.equal(approved.status, 200); assert.equal((await approved.json()).confirmation.reservationCreated, false);
  assert.equal((await (await judge.get(SIAM)).json()).confirmation, null);
  // Three opens in all, then the link is used up; after the source session ends it has expired.
  assert.equal((await m.redeem(token)).status, 200); assert.equal((await m.redeem(token)).status, 200);
  const used = await m.redeem(token); assert.deepEqual([used.status, (await used.json()).error.code], [410, 'MAIL_LINK_USED']);
  m.clock.time = source.expiresAt;
  const expired = await m.redeem(token, { cookie: judge.cookie }); assert.deepEqual([expired.status, (await expired.json()).error.code], [410, 'MAIL_LINK_EXPIRED']);
});
test('Drop email: without a mailer the inbox route does not exist and the arm keeps pending-service', async t => {
  const { origin } = await stored(t);
  const response = await fetch(origin + '/api/quotation-demo/q/AIRB000180/inbox', { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'x'.repeat(43) }) });
  assert.equal(response.status, 404);
  assert.throws(() => createQuotationDemoServer({ bundle: bundle(), mail: { deliver() {} } }));
  assert.throws(() => createQuotationDemoServer({ bookingStorage: plannedBookings(), sessionStorage: { create() {}, get() {}, transact() {} }, mail: { deliver() {} } }));
});
