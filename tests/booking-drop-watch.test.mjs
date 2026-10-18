import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { armDropWatch, armRequest, committedWatch, DROP_WATCH_CONSENT_VERSION } from '../app/domain/booking-drop-watch.mjs';

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
