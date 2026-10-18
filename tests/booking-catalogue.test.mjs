import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createQuotationDemoServer, createHostedQuotationDemoServer, deploymentCatalogue } from '../app/quotation-demo-server.mjs';
import { createBookingStorage } from '../app/booking-storage.mjs';
import { altovoCatalogueFixture, FIXTURE_CHECKED_AT } from './fixtures/altovo-catalogue.mjs';
import { NOW, curated, emulatorCatalogue, integration, listen, rehash, sha256, visit } from './fixtures/roomdrop-harness.mjs';

const OPEN = 'AIRB000180'; const BLOCKED = 'AIRB000179';
async function app(t, { now = NOW, advisor } = {}) {
  const origin = await listen(t, createBookingDemoServer({ catalogue: altovoCatalogueFixture(), now, advisor }));
  return { origin, visitor: () => visit(origin) };
}
const snapshotOf = code => altovoCatalogueFixture().entries.find(entry => entry.code === code).bundle.snapshotVersion;
const arm = (minimumSavingMinor, code = OPEN) => ({ snapshotVersion: snapshotOf(code), consent: true, minimumSavingMinor });

test('catalogue lists public booking facts with blockers and tags derived at request time', async t => {
  const { origin, visitor } = await app(t);
  const { list } = await visitor();
  assert.equal(typeof list.csrfToken, 'string');
  assert.doesNotMatch(JSON.stringify(list), /FIXTURE-PRIVATE|privateReferences|rateDetail/);
  const open = list.entries.find(entry => entry.code === OPEN); const blocked = list.entries.find(entry => entry.code === BLOCKED);
  assert.deepEqual({ blocker: open.blocker, tag: open.tag, optionCount: open.optionCount, freeUntil: open.cancellation.freeUntil },
    { blocker: null, tag: 'ready', optionCount: 3, freeUntil: '2027-02-14T16:58:59.000Z' });
  assert.equal(open.hotel.name, 'Siam Kempinski Hotel Bangkok'); assert.deepEqual(open.quotedRetail, { totalMinor: 233552, currency: 'MYR' });
  assert.deepEqual({ blocker: blocked.blocker, tag: blocked.tag, nonRefundable: blocked.cancellation.nonRefundable }, { blocker: 'NON_REFUNDABLE', tag: 'cannot-start', nonRefundable: true });
  const root = await (await fetch(origin)).text();
  assert.match(root, /data-booking-mode="catalogue"/); assert.doesNotMatch(root, /quotation|quote-|fonts.googleapis/i);
  for (const path of ['/api/booking-demo', '/api/booking-demo/confirm', '/api/booking-demo/catalogue?code=X', '/api/booking-demo/q/AIRB000180?x=1', '/drop-watch.js?x'])
    assert.ok([400, 404].includes((await fetch(origin + path)).status), path);
  assert.equal((await fetch(origin + '/drop-watch.js')).status, 200); assert.equal((await fetch(origin + '/booking-judge.js')).status, 200);
});

// The reviewed S0.5 photos (hotel avatars and two booked-room photos); AIRB000184's room photo was rejected.
const REVIEWED_PHOTOS = ['179-hotel', '180-hotel', '181-hotel', '181-room', '182-hotel', '182-room', '183-hotel', '184-hotel'].map(name => `assets/roomdrop-airb000${name}.jpg`);
test('both demo servers serve exactly the reviewed photo assets', async t => {
  const servers = { booking: createBookingDemoServer({ catalogue: altovoCatalogueFixture(), now: NOW }), quotation: createQuotationDemoServer({ catalogue: altovoCatalogueFixture(), now: NOW }) };
  for (const [name, server] of Object.entries(servers)) {
    const origin = await listen(t, server);
    for (const asset of REVIEWED_PHOTOS) {
      const response = await fetch(origin + '/' + asset);
      assert.equal(response.status, 200, name + ' ' + asset); assert.equal(response.headers.get('content-type'), 'image/jpeg', name + ' ' + asset);
      assert.equal(sha256(Buffer.from(await response.arrayBuffer())), sha256(readFileSync(new URL('../app/public/' + asset, import.meta.url))), name + ' ' + asset);
    }
    for (const path of ['/assets/roomdrop-airb000184-room.jpg', '/assets/roomdrop-airb000180-room.jpg', '/assets/']) assert.equal((await fetch(origin + path)).status, 404, name + ' ' + path);
    // The booking server matches the exact path, query string included.
    if (name === 'booking') assert.equal((await fetch(origin + '/assets/roomdrop-airb000179-hotel.jpg?x=1')).status, 404);
  }
});

test('closing-soon and ended windows come from the injected clock', async t => {
  const soon = await app(t, { now: () => new Date('2027-02-05T00:00:00Z') });
  assert.equal((await soon.visitor()).list.entries.find(entry => entry.code === OPEN).tag, 'closing-soon');
  const ended = await app(t, { now: () => new Date('2027-02-15T00:00:00Z') });
  const entry = (await ended.visitor()).list.entries.find(item => item.code === OPEN);
  assert.deepEqual([entry.blocker, entry.tag], ['FREE_CANCELLATION_ENDED', 'cannot-start']);
});

test('per-code read returns the public bundle for that code only; unknown codes are 404', async t => {
  const { visitor } = await app(t);
  const v = await visitor();
  const data = await (await v.get(OPEN)).json();
  assert.equal(data.code, OPEN); assert.equal(data.baseline.quotationCode, OPEN); assert.equal(data.options.length, 3);
  assert.equal(data.csrfToken, v.list.csrfToken); assert.equal(data.watch, null); assert.equal(data.confirmation, null);
  assert.equal(data.blocker, null); assert.equal(data.agencyMinimumSavingMinor, 1000); assert.equal(data.checkedAt, FIXTURE_CHECKED_AT);
  assert.doesNotMatch(JSON.stringify(data), /FIXTURE-PRIVATE|privateReferences|rateDetail|sourceId/);
  assert.equal((await (await v.get(BLOCKED)).json()).blocker, 'NON_REFUNDABLE');
  for (const code of ['AIRB999999', 'airb000180', 'AIRB000180/extra']) assert.equal((await v.get(code)).status, 404, code);
  assert.equal((await v.post('AIRB999999', 'watch', arm(5000))).status, 404);
});

test('arming a Drop Watch needs consent, a minimum at or above the agency floor, a current snapshot and an open booking', async t => {
  const { origin, visitor } = await app(t);
  const v = await visitor();
  const expectError = async (response, status, code) => { assert.equal(response.status, status); assert.equal((await response.json()).error.code, code); };
  await expectError(await v.post(OPEN, 'watch', { ...arm(5000), consent: false }), 400, 'WATCH_CONSENT_REQUIRED');
  await expectError(await v.post(OPEN, 'watch', { snapshotVersion: snapshotOf(OPEN), minimumSavingMinor: 5000 }), 400, 'WATCH_CONSENT_REQUIRED');
  await expectError(await v.post(OPEN, 'watch', arm(999)), 400, 'MINIMUM_SAVING_INVALID');
  await expectError(await v.post(OPEN, 'watch', arm(1500.5)), 400, 'MINIMUM_SAVING_INVALID');
  await expectError(await v.post(OPEN, 'watch', arm('5000')), 400, 'MINIMUM_SAVING_INVALID');
  await expectError(await v.post(OPEN, 'watch', { ...arm(5000), email: 'x' }), 400, 'INVALID_WATCH');
  await expectError(await v.post(OPEN, 'watch', { ...arm(5000), snapshotVersion: 'old' }), 409, 'SNAPSHOT_CHANGED');
  assert.equal((await v.post(OPEN, 'watch', arm(5000), { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await v.post(OPEN, 'watch', arm(5000), { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await v.post(OPEN, 'watch', arm(5000), { 'Content-Type': 'text/plain' })).status, 400);
  assert.equal((await fetch(origin + '/api/booking-demo/q/' + OPEN + '/watch', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(arm(5000)) })).status, 403);
  const blocked = await v.post(BLOCKED, 'watch', arm(5000, BLOCKED));
  assert.equal(blocked.status, 409); assert.deepEqual((({ code, reason }) => ({ code, reason }))((await blocked.json()).error), { code: 'WATCH_CANNOT_START', reason: 'NON_REFUNDABLE' });
  assert.equal((await (await v.get(OPEN)).json()).watch, null);

  const armed = await (await v.post(OPEN, 'watch', arm(5000))).json();
  assert.equal(armed.watch.minimumSavingMinor, 5000); assert.equal(armed.watch.armedAt, '2026-10-20T00:00:00.000Z'); assert.equal(armed.watch.revision, 1);
  assert.deepEqual((({ mode, replayed, status, checkedAt, dropOptionIds }) => ({ mode, replayed, status, checkedAt, dropOptionIds }))(armed.watch.firstCheck),
    { mode: 'captured-replay', replayed: true, status: 'completed', checkedAt: FIXTURE_CHECKED_AT, dropOptionIds: ['option-fixture-final-deluxe', 'option-fixture-flex-premier'] });
  assert.deepEqual(armed.dropOptionIds, ['option-fixture-final-deluxe', 'option-fixture-flex-premier']);
  assert.deepEqual((await (await v.get(OPEN)).json()).watch, armed.watch);
  // A request that names revision 0 once revision 1 exists is stale (an absent expectedRevision skips this check).
  await expectError(await v.post(OPEN, 'watch', { ...arm(25000), expectedRevision: 0 }), 409, 'WATCH_REVISION_STALE');
  assert.deepEqual((await (await v.post(OPEN, 'watch', { ...arm(25000), expectedRevision: 1 })).json()).dropOptionIds, []);
  assert.deepEqual((await (await v.post(OPEN, 'watch', { ...arm(1000), expectedRevision: 2 })).json()).dropOptionIds.length, 3);
  assert.equal((await (await v.get(OPEN)).json()).watch.minimumSavingMinor, 1000);
});

test('confirmation needs an armed Drop Watch and a Drop that watch found', async t => {
  const { visitor } = await app(t);
  const v = await visitor();
  const confirm = optionId => v.post(OPEN, 'confirm', { optionId, snapshotVersion: snapshotOf(OPEN), acceptedDemoOnly: true });
  const before = await confirm('option-fixture-flex-premier');
  assert.equal(before.status, 409); assert.equal((await before.json()).error.code, 'WATCH_NOT_ARMED');
  await v.post(OPEN, 'watch', arm(5000));
  assert.equal((await confirm('option-fixture-flex-suite')).status, 404);
  assert.equal((await v.post(OPEN, 'confirm', { optionId: 'option-fixture-final-deluxe', snapshotVersion: snapshotOf(OPEN), acceptedDemoOnly: true })).status, 400);
  const result = await (await confirm('option-fixture-flex-premier')).json();
  assert.equal(result.confirmation.optionId, 'option-fixture-flex-premier');
  assert.equal(result.confirmation.reservationCreated, false); assert.equal(result.confirmation.quoteModified, false); assert.equal(result.confirmation.customerRefund, null);
  assert.deepEqual((await (await v.get(OPEN)).json()).confirmation, result.confirmation);
  assert.equal((await v.post(BLOCKED, 'confirm', { optionId: 'option-fixture-flex-premier', snapshotVersion: snapshotOf(BLOCKED), acceptedDemoOnly: true })).status, 409);
});

test('watches and confirmations are isolated per code and per session', async t => {
  const { visitor } = await app(t);
  const a = await visitor(); const b = await visitor();
  await a.post(OPEN, 'watch', arm(1000));
  await a.post(OPEN, 'confirm', { optionId: 'option-fixture-flex-premier', snapshotVersion: snapshotOf(OPEN), acceptedDemoOnly: true });
  const mine = await (await a.get(OPEN)).json();
  assert.equal(mine.watch.minimumSavingMinor, 1000); assert.equal(mine.confirmation.optionId, 'option-fixture-flex-premier');
  const other = await (await a.get(BLOCKED)).json(); assert.equal(other.watch, null); assert.equal(other.confirmation, null);
  const theirs = await (await b.get(OPEN)).json(); assert.equal(theirs.watch, null); assert.equal(theirs.confirmation, null);
  assert.notEqual(a.list.csrfToken, b.list.csrfToken);
  assert.equal((await b.post(OPEN, 'watch', arm(1000), { 'X-CSRF-Token': a.list.csrfToken })).status, 403);
});

test('catalogue chat is scoped to the code and its armed Drops', async t => {
  const calls = [];
  const advisor = { available: true, status: 'test-injected', chat: async input => { calls.push(input); return { reply: 'Test reply' }; } };
  const { visitor } = await app(t, { advisor });
  const v = await visitor();
  await v.post(OPEN, 'watch', arm(5000));
  const ok = await v.post(OPEN, 'chat', { snapshotVersion: snapshotOf(OPEN), pageContext: 'drops-overview', intent: 'opening' });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls[0].options.map(option => option.optionId), ['option-fixture-final-deluxe', 'option-fixture-flex-premier']);
  assert.equal(calls[0].baseline.quotationCode, OPEN);
  assert.equal((await v.post(OPEN, 'chat', { snapshotVersion: snapshotOf(OPEN), pageContext: 'drop-detail', optionId: 'option-fixture-flex-suite', intent: 'opening' })).status, 404);
  assert.equal((await v.post(OPEN, 'chat', { snapshotVersion: snapshotOf(BLOCKED), pageContext: 'drops-overview', intent: 'opening' })).status, 409);
});

test('hosted catalogue strips private references and refuses private keys, mismatched codes and mixed inputs', async t => {
  const environment = { NODE_ENV: 'production', K_SERVICE: 'hotel-price-hunter', GOOGLE_CLOUD_PROJECT: 'sincere-apex-511418-p0', APP_SURFACE: 'customer', APP_ORIGIN: 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app' };
  const catalogue = deploymentCatalogue(altovoCatalogueFixture());
  assert.deepEqual(catalogue.map(entry => entry.code), [OPEN, BLOCKED]);
  assert.doesNotMatch(JSON.stringify(catalogue), /FIXTURE-PRIVATE|privateReferences|rateDetail|blocker/);
  const withKey = structuredClone(catalogue); withKey[0].snapshot.baseline.guestName = 'x';
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: withKey, environment }));
  const nested = structuredClone(catalogue); nested[1].snapshot.baseline.cancellation.contactEmail = 'x';
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: nested, environment }));
  const mismatch = structuredClone(catalogue); mismatch[0].code = 'AIRB000999';
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: mismatch, environment }));
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: [...catalogue, catalogue[0]], environment }));
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: [{ ...catalogue[0], blocker: null }], environment }));
  assert.throws(() => createHostedQuotationDemoServer({ catalogue, snapshot: catalogue[0].snapshot, environment }));
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: altovoCatalogueFixture().entries.map(({ code, bundle }) => ({ code, snapshot: bundle })), environment }));
  assert.throws(() => createQuotationDemoServer({ catalogue: { schemaVersion: 1, entries: [{ code: 'AIRB000999', bundle: altovoCatalogueFixture().entries[0].bundle }] } }));

  const server = createBookingDemoServer({ catalogue, environment, now: () => new Date('2026-10-20T00:00:00Z') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const host = new URL(environment.APP_ORIGIN).host;
  const body = await new Promise((resolve, reject) => {
    const req = request(`http://127.0.0.1:${server.address().port}/api/booking-demo/catalogue`, { headers: { Host: host } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0], json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    }); req.on('error', reject); req.end();
  });
  assert.equal(body.status, 200); assert.match(body.cookie, /; Secure/); assert.equal(body.json.entries.length, 2);
});

test('hosted booking storage needs durable Firestore sessions and no other data source', async () => {
  const environment = { NODE_ENV: 'production', K_SERVICE: 'hotel-price-hunter', GOOGLE_CLOUD_PROJECT: 'sincere-apex-511418-p0', APP_SURFACE: 'customer', APP_ORIGIN: 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app' };
  const bookingStorage = { listCatalogue: async () => [], getBooking: async () => null };
  const firestoreSessions = { mode: 'firestore', create: async () => null, get: async () => null, transact: async () => null };
  assert.throws(() => createBookingDemoServer({ bookingStorage, environment }), /Firestore/);
  assert.throws(() => createBookingDemoServer({ bookingStorage, sessionStorage: { ...firestoreSessions, mode: 'test-memory' }, environment }), /Firestore/);
  assert.throws(() => createBookingDemoServer({ bookingStorage, sessionStorage: firestoreSessions, catalogue: deploymentCatalogue(altovoCatalogueFixture()), environment }));
  assert.throws(() => createBookingDemoServer({ bookingStorage, catalogue: altovoCatalogueFixture() }));
  assert.throws(() => createBookingDemoServer({ catalogue: altovoCatalogueFixture(), sessionStorage: firestoreSessions }));
  assert.doesNotThrow(() => createBookingDemoServer({ bookingStorage, sessionStorage: firestoreSessions, environment }).close());
});

// ---- Firestore emulator: the imported curated fixture, durable sessions, test-owned collections only. ----

test('Firestore catalogue: imported entries in card order, with cards and request-time blockers, and a hashed durable session', integration, async t => {
  const { first, prefix, storage, versions } = await emulatorCatalogue(t);
  const origin = await listen(t, createBookingDemoServer({ ...storage(first), now: NOW }));
  const v = await visit(origin);
  assert.equal(v.response.status, 200); assert.match(v.cookie, /^roomdrop_quote=[a-f0-9]{64}$/);
  assert.deepEqual(v.list.entries.map(entry => [entry.code, entry.blocker, entry.tag, entry.optionCount, entry.snapshotVersion]),
    [[OPEN, null, 'ready', 3, versions[OPEN].contentVersion], [BLOCKED, 'NON_REFUNDABLE', 'cannot-start', 0, versions[BLOCKED].contentVersion]]);
  assert.deepEqual(v.list.entries.map(entry => entry.card), curated().cards.map(({ code, ...card }) => card));
  assert.deepEqual(v.list.entries[0].quotedRetail, { totalMinor: 233552, currency: 'MYR' });
  assert.doesNotMatch(JSON.stringify(v.list), /FIXTURE-PRIVATE|fixture-contract|privateReferences|rateDetail|sourceId/);
  // Only the cookie digest names the stored session; the raw value is stored nowhere.
  const raw = v.cookie.split('=')[1];
  const stored = await first.collection(`${prefix}PublicSessionsV1`).doc(sha256(raw)).get();
  assert.equal(stored.data().csrfToken, v.list.csrfToken);
  assert.doesNotMatch(JSON.stringify((await first.collection(`${prefix}PublicSessionsV1`).get()).docs.map(doc => [doc.id, doc.data()])), new RegExp(raw));
  // The same browser keeps its session; the capture date stays visible per code.
  const again = await visit(origin, { cookie: v.cookie });
  assert.equal(again.response.headers.get('set-cookie'), null); assert.equal(again.list.csrfToken, v.list.csrfToken);
  const closing = await listen(t, createBookingDemoServer({ ...storage(first, () => new Date('2027-02-05T00:00:00Z')), now: () => new Date('2027-02-05T00:00:00Z') }));
  assert.equal((await visit(closing)).list.entries[0].tag, 'closing-soon');
});

test('Firestore bootstrap: shared facts plus only this session\'s watch; unknown, encoded and malformed codes never reach storage', integration, async t => {
  const { first, storage, versions } = await emulatorCatalogue(t);
  const { bookingStorage, sessionStorage } = storage(first);
  const looked = [];
  const counted = { ...bookingStorage, getBooking: code => { looked.push(code); return bookingStorage.getBooking(code); } };
  const origin = await listen(t, createBookingDemoServer({ bookingStorage: counted, sessionStorage, now: NOW }));
  const v = await visit(origin);
  const data = await (await v.get(OPEN)).json();
  assert.deepEqual([data.code, data.snapshotVersion, data.dropSetVersion, data.options.length, data.blocker, data.agencyMinimumSavingMinor, data.watch, data.confirmation],
    [OPEN, versions[OPEN].contentVersion, versions[OPEN].dropSetVersion, 3, null, 1000, null, null]);
  assert.deepEqual(data.capture, { status: 'observed', capturedAt: '2026-10-18T12:10:00.000Z' });
  assert.equal(data.csrfToken, v.list.csrfToken); assert.equal(data.baseline.quotationCode, OPEN);
  assert.doesNotMatch(JSON.stringify(data), /FIXTURE-PRIVATE|privateReferences|rateDetail|sourceId/);
  assert.deepEqual([(await (await v.get(BLOCKED)).json()).blocker, (await (await v.get(BLOCKED)).json()).capture], ['NON_REFUNDABLE', { status: 'not-searched', capturedAt: null }]);
  looked.length = 0;
  for (const code of ['AIRB999999', 'airb000180', 'AIRB000180/extra', '%41IRB000180', 'AIRB000180%2Fwatch', 'AIRB0001800000000000000'])
    assert.equal((await v.get(code)).status, 404, code);
  for (const path of ['/api/booking-demo/q/AIRB000180?x=1', '/api/booking-demo/catalogue?code=AIRB999999', '/api/quotation-demo/q/AIRB000180'])
    assert.ok([400, 404].includes((await fetch(origin + path, { headers: { Cookie: v.cookie } })).status), path);
  assert.equal((await v.post('AIRB999999', 'watch', { snapshotVersion: 'x', consent: true, minimumSavingMinor: 1000 })).status, 404);
  assert.deepEqual(looked, []);
});

test('Firestore sessions: two judges and two codes stay isolated, and a restart keeps the committed watch', integration, async t => {
  const { first, second, storage, versions } = await emulatorCatalogue(t);
  const server = createBookingDemoServer({ ...storage(first), now: NOW });
  const origin = await listen(t, server);
  const a = await visit(origin); const b = await visit(origin);
  const armA = await (await a.post(OPEN, 'watch', { snapshotVersion: versions[OPEN].contentVersion, consent: true, minimumSavingMinor: 1000 })).json();
  assert.equal(armA.watch.revision, 1);
  assert.equal((await (await b.get(OPEN)).json()).watch, null);
  assert.equal((await (await a.get(BLOCKED)).json()).watch, null);
  const armB = await (await b.post(OPEN, 'watch', { snapshotVersion: versions[OPEN].contentVersion, consent: true, minimumSavingMinor: 15000 })).json();
  assert.deepEqual(armB.dropOptionIds, ['option-fixture-flex-premier']);
  assert.deepEqual((await (await a.get(OPEN)).json()).watch, armA.watch);
  assert.equal((await b.post(OPEN, 'watch', { snapshotVersion: versions[OPEN].contentVersion, consent: true, minimumSavingMinor: 5000 }, { 'X-CSRF-Token': a.list.csrfToken })).status, 403);
  // Restart: a new app instance with new storage objects on another client, same emulator.
  await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  const restarted = await listen(t, createBookingDemoServer({ ...storage(second), now: NOW }));
  const back = await visit(restarted, { cookie: a.cookie });
  assert.equal(back.response.headers.get('set-cookie'), null); assert.equal(back.list.csrfToken, a.list.csrfToken);
  assert.deepEqual((await (await back.get(OPEN)).json()).watch, armA.watch);
  assert.deepEqual((await (await visit(restarted, { cookie: b.cookie })).get(OPEN).then(response => response.json())).watch, armB.watch);
});

test('Firestore Drop sets: a later capture makes the stored watch stale for that code only', integration, async t => {
  const { first, second, prefix, storage, versions } = await emulatorCatalogue(t);
  const origin = await listen(t, createBookingDemoServer({ ...storage(second), now: NOW }));
  const v = await visit(origin);
  const body = { snapshotVersion: versions[OPEN].contentVersion, consent: true, minimumSavingMinor: 1000 };
  const armed = await (await v.post(OPEN, 'watch', body)).json();
  assert.equal(armed.watch.dropSetVersion, versions[OPEN].dropSetVersion);
  // The admin importer adds Drop set 2 for AIRB000180 (one Drop with a new id) while the app runs.
  const later = curated(); const siam = later.entries[0];
  siam.bundle.checkedAt = siam.capture.checkedAt = '2026-10-19T08:00:00.000Z';
  siam.bundle.options = siam.bundle.options.slice(2).map(option => ({ ...option, optionId: `${option.optionId}-later` }));
  siam.capture.offerCount = siam.capture.optionCount = 1; rehash(siam.bundle);
  const added = await createBookingStorage({ firestore: first, prefix }).importBundle(later, { execute: true });
  assert.deepEqual(added.entries.map(entry => entry.result), ['drop-set-added', 'unchanged']);
  const fresh = await (await v.get(OPEN)).json();
  assert.deepEqual([fresh.watch, fresh.dropSetVersion, fresh.options.map(option => option.optionId), fresh.capture.capturedAt],
    [null, added.entries[0].dropSetVersion, ['option-fixture-flex-premier-later'], '2026-10-19T08:00:00.000Z']);
  // The old revision no longer exists for the new Drop set, so a request built on it is stale.
  assert.equal((await (await v.post(OPEN, 'watch', { ...body, minimumSavingMinor: 5000, expectedRevision: 1 })).json()).error.code, 'WATCH_REVISION_STALE');
  const rearmed = await (await v.post(OPEN, 'watch', body)).json();
  assert.deepEqual([rearmed.watch.revision, rearmed.watch.dropSetVersion, rearmed.dropOptionIds], [1, added.entries[0].dropSetVersion, ['option-fixture-flex-premier-later']]);
});
