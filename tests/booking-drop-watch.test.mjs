import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { armDropWatch, armRequest, committedWatch, DROP_WATCH_CONSENT_VERSION } from '../app/domain/booking-drop-watch.mjs';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createMemorySessionStorage } from '../app/quotation-session-storage.mjs';
import { NOW, curated, emulatorCatalogue, integration, listen, plannedBookings, rehash, visit } from './fixtures/roomdrop-harness.mjs';

const SIAM = 'AIRB000180'; const HYATT = 'AIRB000179';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/curated-bookings.json', import.meta.url), 'utf8'));
const CAPTURED = '2026-10-18T12:10:00.000Z';
const ARMED = new Date('2026-10-20T00:00:00Z');
// A booking exactly as booking storage's getBooking returns it.
function booking(code = SIAM, { contentVersion = 'a'.repeat(64), dropSetVersion = 'b'.repeat(64), capture, edit } = {}) {
  const entry = fixture().entries.find(item => item.code === code);
  const { privateReferences, ...bundle } = entry.bundle;
  bundle.snapshotVersion = contentVersion;
  edit?.(bundle);
  const status = capture ?? (entry.capture.status === 'not-searched' ? 'not-searched' : 'observed');
  return { code, contentVersion, dropSetVersion, bundle, capture: { status, capturedAt: status === 'not-searched' ? null : CAPTURED } };
}
const session = () => ({ csrfToken: 'c'.repeat(64), expiresAt: ARMED.getTime() + 3_600_000, byCode: {} });
const request = (minimumSavingMinor, extra = {}) => ({ snapshotVersion: 'a'.repeat(64), minimumSavingMinor, expectedRevision: 0, ...extra });
const arm = (state, minimum, { at = ARMED, item = booking(), extra } = {}) => armDropWatch(state, { code: item.code, booking: item, request: request(minimum, extra), at });
const refuses = (fn, code) => assert.throws(fn, error => error.code === code, code);

test('a first arm commits the setup and the captured replay as one receipt', () => {
  const state = session();
  const receipt = arm(state, 5000);
  const expected = {
    code: SIAM, revision: 1, contentVersion: 'a'.repeat(64), dropSetVersion: 'b'.repeat(64),
    consent: { version: DROP_WATCH_CONSENT_VERSION, acceptedAt: '2026-10-20T00:00:00.000Z' },
    currency: 'MYR', minimumSavingMinor: 5000, armedAt: '2026-10-20T00:00:00.000Z',
    firstCheck: { mode: 'captured-replay', replayed: true, status: 'completed', captureStatus: 'observed',
      replayedAt: '2026-10-20T00:00:00.000Z', checkedAt: CAPTURED, capturedAt: [CAPTURED], thresholdMinor: 5000,
      // Savings 121.33 and 231.23 MYR qualify at 50.00; 45.01 does not. Stored ranking order is kept.
      dropOptionIds: ['option-fixture-final-deluxe', 'option-fixture-flex-premier'] },
  };
  assert.deepEqual(receipt, { watch: expected, dropOptionIds: expected.firstCheck.dropOptionIds });
  assert.deepEqual(state.byCode[SIAM], { contentVersion: 'a'.repeat(64), dropSetVersion: 'b'.repeat(64), watch: expected });
  assert.deepEqual(committedWatch(state, SIAM, booking()), expected);
  assert.equal(committedWatch(state, HYATT, booking(HYATT)), null);
});

test('the replay threshold is the minimum in the booking currency, at least 10.00', () => {
  assert.deepEqual(arm(session(), 1000).dropOptionIds, ['option-fixture-flex-suite', 'option-fixture-final-deluxe', 'option-fixture-flex-premier']);
  assert.deepEqual(arm(session(), 15000).dropOptionIds, ['option-fixture-flex-premier']);
  assert.deepEqual(arm(session(), 23123).dropOptionIds, ['option-fixture-flex-premier']);
  assert.deepEqual(arm(session(), 23124).dropOptionIds, []);
  // Minimum validation uses the booking currency's minor units: 10 JPY, 10.000 KWD.
  assert.deepEqual(armRequest({ snapshotVersion: 'v', consent: true, minimumSavingMinor: 10 }, 'JPY'), { snapshotVersion: 'v', minimumSavingMinor: 10, expectedRevision: 0 });
  refuses(() => armRequest({ snapshotVersion: 'v', consent: true, minimumSavingMinor: 9999 }, 'KWD'), 'MINIMUM_SAVING_INVALID');
  assert.equal(armRequest({ snapshotVersion: 'v', consent: true, minimumSavingMinor: 10000 }, 'KWD').minimumSavingMinor, 10000);
});

test('the arm request needs exact keys, explicit consent and an integer minimum', () => {
  const ok = { snapshotVersion: 'v', consent: true, minimumSavingMinor: 1000 };
  assert.deepEqual(armRequest({ ...ok, expectedRevision: 3 }, 'MYR'), { snapshotVersion: 'v', minimumSavingMinor: 1000, expectedRevision: 3 });
  for (const [body, code] of [
    [null, 'INVALID_WATCH'], [[], 'INVALID_WATCH'], [{ ...ok, email: 'x' }, 'INVALID_WATCH'],
    [{ ...ok, expectedRevision: -1 }, 'INVALID_WATCH'], [{ ...ok, expectedRevision: 1.5 }, 'INVALID_WATCH'], [{ ...ok, expectedRevision: '1' }, 'INVALID_WATCH'],
    [{ ...ok, consent: false }, 'WATCH_CONSENT_REQUIRED'], [{ ...ok, consent: 'true' }, 'WATCH_CONSENT_REQUIRED'],
    [{ snapshotVersion: 'v', minimumSavingMinor: 1000 }, 'WATCH_CONSENT_REQUIRED'],
    [{ ...ok, minimumSavingMinor: 999 }, 'MINIMUM_SAVING_INVALID'], [{ ...ok, minimumSavingMinor: 1500.5 }, 'MINIMUM_SAVING_INVALID'],
    [{ ...ok, minimumSavingMinor: '5000' }, 'MINIMUM_SAVING_INVALID'],
  ]) refuses(() => armRequest(body, 'MYR'), code);
});

test('an identical retry returns the committed receipt; a stale request cannot replace a newer revision', () => {
  const state = session();
  const first = arm(state, 5000);
  const later = new Date('2026-10-20T00:05:00Z');
  // A lost acknowledgement retried later: same receipt, same revision and times.
  assert.deepEqual(arm(state, 5000, { at: later }), first);
  assert.deepEqual(arm(state, 5000, { at: later, extra: { expectedRevision: 1 } }), first);
  // A different minimum based on revision 0 is stale once revision 1 exists.
  refuses(() => arm(state, 1000, { at: later }), 'WATCH_REVISION_STALE');
  refuses(() => arm(state, 1000, { at: later, extra: { expectedRevision: 5 } }), 'WATCH_REVISION_STALE');
  // A deliberate new minimum on the current revision creates revision 2 for this code only.
  const raised = arm(state, 25000, { at: later, extra: { expectedRevision: 1 } });
  assert.deepEqual([raised.watch.revision, raised.watch.minimumSavingMinor, raised.dropOptionIds, raised.watch.armedAt],
    [2, 25000, [], '2026-10-20T00:05:00.000Z']);
  assert.equal(raised.watch.firstCheck.status, 'completed');
  // The retry of revision 1's request no longer restores it.
  refuses(() => arm(state, 5000, { at: later }), 'WATCH_REVISION_STALE');
  assert.equal(state.byCode[SIAM].watch.revision, 2);
});

test('a changed Drop set resets the watch, so the next arm starts again at revision 1', () => {
  const state = session();
  arm(state, 5000);
  const next = booking(SIAM, { dropSetVersion: 'd'.repeat(64) });
  assert.equal(committedWatch(state, SIAM, next), null);
  refuses(() => arm(state, 5000, { item: next, extra: { expectedRevision: 1 } }), 'WATCH_REVISION_STALE');
  assert.equal(arm(state, 5000, { item: next }).watch.revision, 1);
  assert.equal(state.byCode[SIAM].dropSetVersion, 'd'.repeat(64));
  // A request built from another booking content version is refused before anything changes.
  refuses(() => arm(state, 5000, { extra: { snapshotVersion: 'e'.repeat(64) }, item: next }), 'SNAPSHOT_CHANGED');
});

test('eligibility is evaluated at the actual arming time', () => {
  // A cannot-start booking is refused for its reason, before its absent capture matters.
  assert.throws(() => arm(session(), 5000, { item: booking(HYATT) }), error => error.code === 'WATCH_CANNOT_START' && error.reason === 'NON_REFUNDABLE');
  // The free window ends at 2027-02-14T16:58:59Z.
  assert.equal(arm(session(), 5000, { at: new Date('2027-02-14T16:58:58Z') }).watch.revision, 1);
  for (const at of [new Date('2027-02-14T16:58:59Z'), new Date('2027-02-15T00:00:00Z')]) {
    const state = session();
    assert.throws(() => arm(state, 5000, { at }), error => error.code === 'WATCH_CANNOT_START' && error.reason === 'FREE_CANCELLATION_ENDED');
    assert.deepEqual(state.byCode, {});
  }
  // A schedule that does not yet cover the arming moment leaves the facts unknown.
  assert.throws(() => arm(session(), 5000, { at: new Date('2026-10-18T11:00:00Z') }), error => error.reason === 'CANCELLATION_FACTS_UNKNOWN');
});

test('a missing or malformed capture refuses without changing the session; a valid empty capture commits honestly', () => {
  const cases = [
    booking(SIAM, { capture: 'not-searched' }),
    booking(SIAM, { capture: 'failed' }),
    { ...booking(), capture: { status: 'observed', capturedAt: null } },
    // A Drop priced in another currency would need an implicit FX conversion.
    booking(SIAM, { edit: bundle => { bundle.options[1].estimate.currency = 'USD'; } }),
    booking(SIAM, { edit: bundle => { bundle.options[0].estimate.totalMinor = '229051'; } }),
    booking(SIAM, { edit: bundle => { bundle.options[0].optionId = 42; } }),
    // An empty capture that still carries Drops contradicts itself.
    booking(SIAM, { capture: 'observed-empty' }),
  ];
  for (const item of cases) {
    const state = session();
    refuses(() => arm(state, 1000, { item }), 'CAPTURE_UNAVAILABLE');
    assert.deepEqual(state.byCode, {});
  }
  const state = session();
  const empty = arm(state, 1000, { item: booking(SIAM, { capture: 'observed-empty', edit: bundle => { bundle.options = []; } }) });
  assert.deepEqual([empty.dropOptionIds, empty.watch.firstCheck.status, empty.watch.firstCheck.captureStatus, empty.watch.revision],
    [[], 'completed', 'observed-empty', 1]);
  assert.equal(state.byCode[SIAM].watch.firstCheck.checkedAt, CAPTURED);
});

test('arming one code never touches another code or unknown fields', () => {
  const state = session();
  state.adviceCount = 3;
  state.byCode[HYATT] = { contentVersion: 'f'.repeat(64), dropSetVersion: 'f'.repeat(64), watch: null, chatHistory: [{ reply: 'kept' }] };
  arm(state, 5000);
  state.byCode[SIAM].confirmation = { optionId: 'option-fixture-flex-premier' };
  arm(state, 1000, { extra: { expectedRevision: 1 } });
  assert.equal(state.adviceCount, 3);
  assert.deepEqual(state.byCode[HYATT].chatHistory, [{ reply: 'kept' }]);
  assert.deepEqual(state.byCode[SIAM].confirmation, { optionId: 'option-fixture-flex-premier' });
});

// ---- HTTP: POST /api/booking-demo/q/<code>/watch over injected storage. ----
const armBody = (contentVersion, minimumSavingMinor, extra = {}) => ({ snapshotVersion: contentVersion, consent: true, minimumSavingMinor, ...extra });
const errorOf = async response => [response.status, (await response.json()).error?.code];
// Records any request leaving loopback while a test runs; the arm path must make none.
function upstreamSpy(t) {
  const calls = []; const real = globalThis.fetch;
  globalThis.fetch = (input, init) => { const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); if (url.hostname !== '127.0.0.1') calls.push(url.host); return real(input, init); };
  t.after(() => { globalThis.fetch = real; });
  const advisorCalls = [];
  const advisor = { available: true, status: 'test-injected', advise: async () => { advisorCalls.push('advise'); throw new Error('unused'); }, chat: async () => { advisorCalls.push('chat'); throw new Error('unused'); } };
  return { calls, advisorCalls, advisor };
}

test('HTTP arm: a missing or malformed capture is 503 CAPTURE_UNAVAILABLE and commits nothing', async t => {
  const bookings = plannedBookings(); let mode = 'ok';
  const bookingStorage = { ...bookings, getBooking: async code => {
    const item = await bookings.getBooking(code);
    if (code !== SIAM || mode === 'ok') return item;
    if (mode === 'missing') throw Object.assign(new Error('x'), { code: 'CAPTURE_UNAVAILABLE' });
    item.bundle.options[0].estimate.currency = 'USD'; return item;
  } };
  const sessionStorage = createMemorySessionStorage({ now: NOW });
  const origin = await listen(t, createBookingDemoServer({ bookingStorage, sessionStorage, now: NOW }));
  const v = await visit(origin);
  const { contentVersion } = await bookings.getBooking(SIAM);
  mode = 'missing';
  assert.deepEqual(await errorOf(await v.post(SIAM, 'watch', armBody(contentVersion, 1000))), [503, 'CAPTURE_UNAVAILABLE']);
  mode = 'malformed';
  assert.deepEqual(await errorOf(await v.post(SIAM, 'watch', armBody(contentVersion, 1000))), [503, 'CAPTURE_UNAVAILABLE']);
  assert.deepEqual((await sessionStorage.get(v.cookie.split('=')[1])).byCode, {});
  mode = 'ok';
  assert.equal((await (await v.post(SIAM, 'watch', armBody(contentVersion, 1000))).json()).watch.revision, 1);
});

test('Firestore arm: identical concurrent arms on two app instances and a lost acknowledgement give one receipt, with no upstream call', integration, async t => {
  const { first, second, storage, versions } = await emulatorCatalogue(t);
  const spy = upstreamSpy(t);
  const [one, two] = await Promise.all([first, second].map(client => listen(t, createBookingDemoServer({ ...storage(client), now: NOW, advisor: spy.advisor }))));
  const v = await visit(one);
  const body = JSON.stringify(armBody(versions[SIAM].contentVersion, 5000));
  const send = origin => fetch(`${origin}/api/booking-demo/q/${SIAM}/watch`, { method: 'POST', body,
    headers: { Origin: origin, Cookie: v.cookie, 'X-CSRF-Token': v.list.csrfToken, 'Content-Type': 'application/json' } });
  const responses = await Promise.all([one, two, one, two].map(send));
  assert.deepEqual(responses.map(response => response.status), [200, 200, 200, 200]);
  const receipts = await Promise.all(responses.map(response => response.json()));
  for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
  const { watch, dropOptionIds } = receipts[0];
  assert.deepEqual([watch.revision, watch.code, watch.contentVersion, watch.dropSetVersion, watch.currency, watch.minimumSavingMinor, dropOptionIds],
    [1, SIAM, versions[SIAM].contentVersion, versions[SIAM].dropSetVersion, 'MYR', 5000, ['option-fixture-final-deluxe', 'option-fixture-flex-premier']]);
  assert.deepEqual(watch.firstCheck, { mode: 'captured-replay', replayed: true, status: 'completed', captureStatus: 'observed', replayedAt: watch.armedAt,
    checkedAt: '2026-10-18T12:10:00.000Z', capturedAt: ['2026-10-18T12:10:00.000Z'], thresholdMinor: 5000, dropOptionIds });
  // Committed in Firestore, readable by a separate client, before any response was sent.
  const stored = await storage(second).sessionStorage.get(v.cookie.split('=')[1]);
  assert.deepEqual(stored.byCode[SIAM].watch, watch);
  assert.doesNotMatch(JSON.stringify(stored), /FIXTURE-PRIVATE|privateReferences|rateDetail/);
  // The response was lost; the browser retries the same request later.
  assert.deepEqual(await (await send(two)).json(), receipts[0]);
  assert.deepEqual((await (await v.get(SIAM)).json()).watch, watch);
  assert.deepEqual([spy.calls, spy.advisorCalls], [[], []]);
});

test('Firestore arm: different minima racing from one revision commit exactly one; stale requests change nothing', integration, async t => {
  const { first, storage, versions } = await emulatorCatalogue(t);
  const origin = await listen(t, createBookingDemoServer({ ...storage(first), now: NOW }));
  const v = await visit(origin); const version = versions[SIAM].contentVersion;
  const results = await Promise.all([1000, 5000, 15000].map(async minimum => ({ minimum, response: await v.post(SIAM, 'watch', armBody(version, minimum)) })));
  const winners = results.filter(result => result.response.status === 200);
  assert.equal(winners.length, 1);
  for (const loser of results.filter(result => result.response.status !== 200)) assert.deepEqual(await errorOf(loser.response), [409, 'WATCH_REVISION_STALE']);
  const winner = await winners[0].response.json();
  assert.deepEqual([winner.watch.revision, winner.watch.minimumSavingMinor], [1, winners[0].minimum]);
  assert.deepEqual((await (await v.get(SIAM)).json()).watch, winner.watch);
  // A deliberate new minimum names revision 1; retrying the winning request afterwards cannot restore it.
  const raised = await (await v.post(SIAM, 'watch', armBody(version, 25000, { expectedRevision: 1 }))).json();
  assert.deepEqual([raised.watch.revision, raised.dropOptionIds], [2, []]);
  assert.deepEqual(await errorOf(await v.post(SIAM, 'watch', armBody(version, winners[0].minimum))), [409, 'WATCH_REVISION_STALE']);
  assert.deepEqual(await errorOf(await v.post(SIAM, 'watch', armBody(version, 1000, { expectedRevision: 1 }))), [409, 'WATCH_REVISION_STALE']);
  assert.deepEqual((await (await v.get(SIAM)).json()).watch, raised.watch);
});

test('Firestore arm: two judges arming one code at once never overwrite each other', integration, async t => {
  const { first, second, storage, versions } = await emulatorCatalogue(t);
  const [one, two] = await Promise.all([first, second].map(client => listen(t, createBookingDemoServer({ ...storage(client), now: NOW }))));
  const a = await visit(one); const b = await visit(two); const version = versions[SIAM].contentVersion;
  const [armA, armB] = await Promise.all([a.post(SIAM, 'watch', armBody(version, 1000)), b.post(SIAM, 'watch', armBody(version, 15000))].map(async response => (await response).json()));
  assert.deepEqual([armA.watch.revision, armA.dropOptionIds.length, armB.watch.revision, armB.dropOptionIds], [1, 3, 1, ['option-fixture-flex-premier']]);
  assert.deepEqual((await (await a.get(SIAM)).json()).watch, armA.watch);
  assert.deepEqual((await (await b.get(SIAM)).json()).watch, armB.watch);
  assert.equal((await (await a.get(HYATT)).json()).watch, null);
});

test('Firestore arm: a missing Drop document commits nothing; a valid empty capture commits an honest empty replay', integration, async t => {
  const { first, prefix, storage, versions } = await emulatorCatalogue(t);
  const origin = await listen(t, createBookingDemoServer({ ...storage(first), now: NOW }));
  const v = await visit(origin);
  await first.collection(`${prefix}BookingsV1`).doc(SIAM).collection('drops').doc('option-fixture-final-deluxe').delete();
  assert.deepEqual(await errorOf(await v.post(SIAM, 'watch', armBody(versions[SIAM].contentVersion, 1000))), [503, 'CAPTURE_UNAVAILABLE']);
  assert.deepEqual((await storage(first).sessionStorage.get(v.cookie.split('=')[1])).byCode, {});

  const input = curated(); const siam = input.entries[0];
  siam.bundle.options = []; siam.capture = { ...siam.capture, status: 'observed-empty', offerCount: 0, optionCount: 0 }; rehash(siam.bundle);
  const empty = await emulatorCatalogue(t, input);
  const emptyOrigin = await listen(t, createBookingDemoServer({ ...empty.storage(empty.first), now: NOW }));
  const judge = await visit(emptyOrigin);
  const receipt = await (await judge.post(SIAM, 'watch', armBody(empty.versions[SIAM].contentVersion, 1000))).json();
  assert.deepEqual([receipt.dropOptionIds, receipt.watch.firstCheck.status, receipt.watch.firstCheck.captureStatus, receipt.watch.firstCheck.checkedAt],
    [[], 'completed', 'observed-empty', '2026-10-18T12:10:00.000Z']);
  assert.deepEqual((await (await judge.get(SIAM)).json()).watch, receipt.watch);
});

test('Firestore arm: expired sessions and ended free cancellation cannot arm', integration, async t => {
  const { first, storage, versions } = await emulatorCatalogue(t);
  let time = Date.parse('2026-10-20T00:00:00Z'); const clock = () => new Date(time);
  const origin = await listen(t, createBookingDemoServer({ ...storage(first, clock), now: clock }));
  const v = await visit(origin);
  time = Date.parse('2027-02-14T16:58:59Z');
  assert.deepEqual(await errorOf(await v.post(SIAM, 'watch', armBody(versions[SIAM].contentVersion, 1000))), [403, 'DEMO_SESSION_REQUIRED']);
  // A fresh session at the end of the free window is still refused, for its reason, with no commit.
  const late = await visit(origin);
  const refused = await (await late.post(SIAM, 'watch', armBody(versions[SIAM].contentVersion, 1000))).json();
  assert.deepEqual([refused.error.code, refused.error.reason], ['WATCH_CANNOT_START', 'FREE_CANCELLATION_ENDED']);
  assert.deepEqual((await storage(first, clock).sessionStorage.get(late.cookie.split('=')[1])).byCode, {});
});
