import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateOffer, validatePreferences, materialFingerprint, isApprovalValid } from '../app/domain/decision.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/jury-booking.json', import.meta.url)));
function context(index = 0) {
  const copy = structuredClone(fixture);
  return { booking: copy.booking, offer: copy.offers[index], preferences: copy.preferences,
    agencyMinimumSavingMinor: copy.agencyMinimumSavingMinor, approvals: [], now: '2026-10-12T02:30:00Z' };
}
function standing(input) {
  input.preferences.automaticEquivalentSwitches = true;
  return { type: 'standing', scope: 'equivalent-only', permissionVersion: 1, bookingId: input.booking.bookingId,
    bookingVersion: input.booking.version, preferenceVersion: input.preferences.version,
    confirmed: true, confirmedAt: '2026-10-12T02:10:00Z', revokedAt: null };
}
function specific(input) {
  return { type: 'offer', scope: 'selected-offer', bookingId: input.booking.bookingId,
    bookingVersion: input.booking.version, preferenceVersion: input.preferences.version,
    offerId: input.offer.offerId, offerVersion: input.offer.version,
    materialFingerprint: materialFingerprint(input), confirmed: true,
    confirmedAt: '2026-10-12T02:10:00Z', expiresAt: '2026-10-13T02:00:00Z', revokedAt: null };
}

test('equivalent saving requires a separately confirmed standing permission', () => {
  const input = context();
  assert.equal(evaluateOffer(input).action, 'approval-required');
  input.preferences.automaticEquivalentSwitches = true;
  assert.equal(evaluateOffer(input).action, 'approval-required');
  input.approvals = [standing(input)];
  assert.deepEqual(evaluateOffer(input), { action: 'automatic', reasons: [], netSavingMinor: 5500, authority: 'standing' });
});

test('standing permission requires current versions, scope, confirmation and no revocation', () => {
  for (const patch of [{ confirmed: false }, { bookingVersion: 2 }, { preferenceVersion: 9 },
    { scope: 'all-offers' }, { revokedAt: '2026-10-12T02:15:00Z' }, { confirmedAt: '2027-01-01T00:00:00Z' }]) {
    const input = context();
    input.approvals = [{ ...standing(input), ...patch }];
    assert.equal(evaluateOffer(input).action, 'approval-required');
  }
});

test('different room, hotel and non-refundable alternatives require offer approval', () => {
  for (const index of [1, 2, 3]) {
    const input = context(index);
    input.approvals = [standing(input)];
    assert.equal(evaluateOffer(input).action, 'approval-required');
    input.approvals.push(specific(input));
    assert.equal(evaluateOffer(input).action, 'automatic');
  }
});

test('unknown essential condition blocks even a specific approval', () => {
  const input = context(5);
  input.approvals = [standing(input), specific(input)];
  assert.equal(evaluateOffer(input).action, 'blocked');
  assert.ok(evaluateOffer(input).reasons.includes('UNKNOWN_ESSENTIAL_CONDITION'));
});

test('deleting customer essentials cannot remove preserved baseline conditions', () => {
  const input = context();
  input.preferences.essentialRequirements = {};
  input.offer.room.conditions.boardBasis = 'ROOM_ONLY';
  input.approvals = [standing(input)];
  assert.equal(evaluateOffer(input).action, 'approval-required');
  input.offer.room.conditions.boardBasis = null;
  assert.equal(evaluateOffer(input).action, 'blocked');
});

test('unknown non-customer baseline room facts block automation', () => {
  const input = context();
  input.offer.room.conditions.view = null;
  input.approvals = [standing(input)];
  assert.equal(evaluateOffer(input).action, 'blocked');
});

test('known customer essential mismatch blocks approval until requirement separately corrected', () => {
  const input = context();
  input.offer.room.conditions.boardBasis = 'ROOM_ONLY';
  input.approvals = [specific(input)];
  assert.equal(evaluateOffer(input).action, 'blocked');
  assert.ok(evaluateOffer(input).reasons.includes('ESSENTIAL_REQUIREMENT_MISMATCH'));
  input.preferences.essentialRequirements.boardBasis = 'ROOM_ONLY';
  input.preferences.version += 1;
  input.approvals = [specific(input)];
  assert.equal(evaluateOffer(input).action, 'automatic');
  assert.equal(evaluateOffer(input).authority, 'offer-approval');
});

test('agency and raised customer minimum use inclusive net threshold', () => {
  const input = context();
  input.approvals = [standing(input)];
  input.preferences.minimumSavingMinor = 5500;
  assert.equal(evaluateOffer(input).action, 'automatic');
  input.preferences.minimumSavingMinor = 5501;
  assert.equal(evaluateOffer(input).action, 'blocked');
  input.preferences.minimumSavingMinor = 1;
  input.agencyMinimumSavingMinor = 5501;
  assert.equal(evaluateOffer(input).action, 'blocked');
});

test('unknown refund costs and currency mismatch cannot be bypassed by approval', () => {
  for (const mutate of [offer => { offer.refundQuote.switchFeesMinor = null; },
    offer => { offer.retail.currency = 'EUR'; }, offer => { offer.refundQuote.status = 'unknown'; }]) {
    const input = context();
    mutate(input.offer);
    input.approvals = [specific(input)];
    assert.equal(evaluateOffer(input).action, 'blocked');
  }
});

test('single room standalone scope, dates and complete occupancy are required', () => {
  for (const mutate of [
    input => { input.booking.roomCount = 2; }, input => { input.booking.scope = 'flight-hotel'; },
    input => { input.offer.stay.checkout = '2026-11-16'; }, input => { input.offer.occupancy.childAges = []; },
    input => { input.offer.stay.checkin = '2026-02-30'; }, input => { input.booking.stay.timeZone = 'Invalid/Zone'; },
    input => { input.offer.identity.offerToken = ''; }, input => { input.offer.bookingVersion = 9; },
  ]) {
    const input = context();
    mutate(input);
    input.approvals = [standing(input)];
    assert.equal(evaluateOffer(input).action, 'blocked');
  }
});

test('original deadline uses an instant and is expired at the exact boundary', () => {
  const input = context();
  input.offer.expiresAt = '2026-11-11T00:00:00Z';
  input.approvals = [standing(input)];
  input.now = '2026-11-10T17:59:59+08:00';
  assert.equal(evaluateOffer(input).action, 'automatic');
  input.now = '2026-11-10T18:00:00+08:00';
  assert.equal(evaluateOffer(input).action, 'blocked');
  assert.ok(evaluateOffer(input).reasons.includes('CANCELLATION_WINDOW_EXPIRED'));
});

test('earlier free deadline and higher penalties require a specific approval', () => {
  const input = context();
  input.approvals = [standing(input)];
  input.offer.cancellation.freeUntil = '2026-11-09T10:00:00Z';
  input.offer.cancellation.schedule[0].to = input.offer.cancellation.freeUntil;
  input.offer.cancellation.schedule[1].from = input.offer.cancellation.freeUntil;
  assert.equal(evaluateOffer(input).action, 'approval-required');
  input.approvals.push(specific(input));
  assert.equal(evaluateOffer(input).action, 'automatic');
  const higher = context();
  higher.approvals = [standing(higher)];
  higher.offer.cancellation.schedule[1].penaltyMinor = 61000;
  assert.equal(evaluateOffer(higher).action, 'approval-required');
});

test('incomplete replacement cancellation horizon blocks with and without specific approval', () => {
  for (const approved of [false, true]) {
    const input = context();
    input.offer.cancellation.schedule = [{ from: '2026-10-12T00:00:00Z', to: '2026-10-13T02:00:00Z', penaltyMinor: 0, currency: 'USD' }];
    input.offer.cancellation.freeUntil = '2026-10-13T02:00:00Z';
    input.approvals = approved ? [specific(input)] : [];
    if (approved) assert.equal(isApprovalValid(input.approvals[0], input), true);
    const result = evaluateOffer(input);
    assert.equal(result.action, 'blocked');
    assert.ok(result.reasons.includes('UNKNOWN_CANCELLATION_POLICY'));
  }
});

test('incomplete original cancellation horizon cannot be approved away', () => {
  const input = context();
  input.booking.cancellation.schedule = [{ from: '2026-10-12T00:00:00Z', to: '2026-10-13T02:00:00Z', penaltyMinor: 0, currency: 'USD' }];
  input.booking.cancellation.freeUntil = '2026-10-13T02:00:00Z';
  input.approvals = [specific(input)];
  assert.equal(isApprovalValid(input.approvals[0], input), true);
  const result = evaluateOffer(input);
  assert.equal(result.action, 'blocked');
  assert.ok(result.reasons.includes('UNKNOWN_CANCELLATION_POLICY'));
});

test('replacement must cover the original declared tail even after checkout date starts', () => {
  const input = context();
  input.offer.cancellation.schedule[1].to = '2026-11-15T00:00:00Z';
  input.approvals = [specific(input)];
  const result = evaluateOffer(input);
  assert.equal(result.action, 'blocked');
  assert.ok(result.reasons.includes('UNKNOWN_CANCELLATION_POLICY'));
});

test('checkout local-midnight minimum accepts exact coverage and blocks an earlier original tail', () => {
  const input = context();
  // 00:00 on 15 November in Kuala Lumpur is 16:00Z on 14 November.
  input.booking.cancellation.schedule[1].to = '2026-11-14T16:00:00Z';
  input.offer.cancellation.schedule[1].to = '2026-11-14T16:00:00Z';
  input.approvals = [standing(input)];
  assert.equal(evaluateOffer(input).action, 'automatic');
  input.booking.cancellation.schedule[1].to = '2026-11-14T15:59:59Z';
  input.approvals = [specific(input)];
  const result = evaluateOffer(input);
  assert.equal(result.action, 'blocked');
  assert.ok(result.reasons.includes('UNKNOWN_CANCELLATION_POLICY'));
});

test('matching invalid stay calendars and reversed or equal dates report INVALID_STAY', () => {
  for (const [checkin, checkout] of [
    ['2026-02-30', '2026-03-02'], ['2026-11-12', '2026-11-31'],
    ['2026-11-15', '2026-11-12'], ['2026-11-12', '2026-11-12'],
  ]) {
    const input = context();
    input.booking.stay.checkin = input.offer.stay.checkin = checkin;
    input.booking.stay.checkout = input.offer.stay.checkout = checkout;
    input.approvals = [standing(input)];
    const result = evaluateOffer(input);
    assert.equal(result.action, 'blocked');
    assert.ok(result.reasons.includes('INVALID_STAY'));
    assert.ok(!result.reasons.includes('STAY_MISMATCH'));
  }
});

test('malformed/gapped cancellation schedule and naive or unzoned times are blocked', () => {
  for (const mutate of [
    offer => { offer.cancellation.schedule[1].from = '2026-11-11T10:00:00Z'; },
    offer => { offer.cancellation.schedule[1].from = '2026-11-09T10:00:00Z'; },
    offer => { offer.cancellation.schedule[1].currency = null; },
    offer => { offer.cancellation.freeUntil = '2026-11-10T10:00:00'; },
    offer => { offer.cancellation.timeZone = 'Invalid/Zone'; },
  ]) {
    const input = context();
    mutate(input.offer);
    input.approvals = [standing(input)];
    assert.equal(evaluateOffer(input).action, 'blocked');
  }
});

test('expired offers and future checked times block execution', () => {
  for (const mutate of [offer => { offer.expiresAt = '2026-10-12T02:30:00Z'; },
    offer => { offer.checkedAt = '2027-01-01T00:00:00Z'; }]) {
    const input = context();
    mutate(input.offer);
    input.approvals = [standing(input)];
    assert.equal(evaluateOffer(input).action, 'blocked');
  }
});

test('calendar rollover and 24-hour rollover timestamps are not canonical instants', () => {
  for (const checkedAt of ['2026-02-30T02:00:00Z', '2026-10-11T24:00:00Z']) {
    const input = context();
    input.offer.checkedAt = checkedAt;
    input.approvals = [standing(input)];
    assert.equal(evaluateOffer(input).action, 'blocked');
  }
});

test('specific approval binds versions, material facts, expiry and revocation', () => {
  const input = context(1);
  const approval = specific(input);
  assert.equal(isApprovalValid(approval, input), true);
  input.approvals = [approval];
  input.offer.version = 2;
  input.offer.retail.totalMinor = 54500;
  input.offer.refundQuote.replacementRetailMinor = 54500;
  input.offer.refundQuote.netSavingMinor = 5000;
  assert.equal(isApprovalValid(approval, input), false);
  assert.equal(evaluateOffer(input).action, 'approval-required');
  for (const patch of [{ expiresAt: input.now }, { revokedAt: input.now }, { confirmed: false },
    { materialFingerprint: 'bad' }, { preferenceVersion: 999 }]) {
    assert.equal(isApprovalValid({ ...specific(input), ...patch }, input), false);
  }
});

test('fingerprint is stable for key ordering/check time and changes with material costs', () => {
  const input = context();
  const original = materialFingerprint(input);
  const before = structuredClone(input);
  materialFingerprint(input);
  assert.deepEqual(input, before);
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(materialFingerprint(reordered), original);
  input.offer.checkedAt = '2026-10-12T02:20:00Z';
  assert.equal(materialFingerprint(input), original);
  input.offer.refundQuote.switchFeesMinor += 100;
  assert.notEqual(materialFingerprint(input), original);
});

test('all known baseline conditions are preserved including added feature facts', () => {
  const input = context();
  input.booking.room.conditions.hasBalcony = true;
  input.approvals = [standing(input)];
  assert.equal(evaluateOffer(input).action, 'blocked');
  input.offer.room.conditions.hasBalcony = false;
  assert.equal(evaluateOffer(input).action, 'approval-required');
  input.offer.room.conditions.hasBalcony = true;
  assert.equal(evaluateOffer(input).action, 'automatic');
});

test('validated preferences keep explicit opt-out, reject low minimum and invalid values', () => {
  const input = context();
  const options = { booking: input.booking, agencyMinimumSavingMinor: 2500 };
  assert.deepEqual(validatePreferences(input.preferences, options), input.preferences);
  for (const patch of [{ minimumSavingMinor: 2499 }, { automaticEquivalentSwitches: 'true' },
    { notificationFrequency: 'hourly' }, { continueMonitoring: null }, { version: 0 },
    { essentialRequirements: { madeUp: true } }]) {
    assert.throws(() => validatePreferences({ ...input.preferences, ...patch }, options), error => error.code === 'INVALID_PREFERENCES');
  }
});
