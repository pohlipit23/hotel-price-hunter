import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialiseSimulation, simulationView, startSwitch, advanceSwitch } from '../app/domain/simulation.mjs';
import * as simulation from '../app/domain/simulation.mjs';
import { materialFingerprint } from '../app/domain/decision.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/jury-booking.json', import.meta.url)));
const recordedAt = '2026-10-14T03:00:00.000Z';
function ready() {
  const state = initialiseSimulation({ demoNow: fixture.demoNow, enrolled: true, revision: 1,
    preferences: { ...fixture.preferences, version: 2, automaticEquivalentSwitches: true },
    permissionRecord: { confirmed: true, version: 1, scope: 'equivalent-only', bookingVersion: 1, preferenceVersion: 2, confirmedAt: fixture.demoNow } }, fixture);
  return state;
}
function start(state, scenario = 'equivalent-saving') {
  const intent = simulationView(state, 'visitor', fixture).scenarios.find(item => item.id === scenario).intent;
  const { idempotencyKey, ...body } = intent;
  return startSwitch(state, { body, idempotencyKey, visitorId: 'visitor', fixture, recordedAt });
}
function advance(state, revision = state.operations[state.activeOperationId].revision) {
  return advanceSwitch(state, { operationId: state.activeOperationId, expectedOperationRevision: revision, fixture, recordedAt });
}

function unconfirmed() {
  return initialiseSimulation({ demoNow: fixture.demoNow, enrolled: false, revision: 0,
    preferences: structuredClone(fixture.preferences), permissionRecord: null }, fixture);
}
function approve(state, offerId = 'DEMO_EQUIVALENT', intent = simulationView(state, 'visitor', fixture).offerApprovalIntents[offerId]) {
  const { idempotencyKey, ...body } = intent;
  return simulation.approveOffer(state, { body, idempotencyKey, visitorId: 'visitor', fixture, recordedAt });
}

test('non-refundable approval requires literal reduced-flexibility acknowledgment and preserves the original watch until promotion', () => {
  for (const accepted of [false, undefined, 'true', 1, null, [], {}, 0]) {
    const state = unconfirmed();
    const intent = { ...simulationView(state, 'visitor', fixture).offerApprovalIntents.DEMO_NON_REFUNDABLE, acceptReducedFlexibility: accepted };
    assert.throws(() => approve(state, 'DEMO_NON_REFUNDABLE', intent), { code: 'VALIDATION_ERROR' });
    assert.equal(state.activeOperationId, null);
  }
  const refundable = simulationView(unconfirmed(), 'visitor', fixture).offerApprovalIntents.DEMO_EQUIVALENT;
  assert.throws(() => approve(unconfirmed(), 'DEMO_EQUIVALENT', { ...refundable, acceptReducedFlexibility: true }), { code: 'VALIDATION_ERROR' });
  const baselines = [false, true].flatMap(continueMonitoring => [unconfirmed(), ready()].map(state => ({
    ...state, preferences: { ...state.preferences, continueMonitoring },
  })));
  for (const initial of baselines) {
    const intent = simulationView(initial, 'visitor', fixture).offerApprovalIntents.DEMO_NON_REFUNDABLE;
    let { state } = approve(initial, 'DEMO_NON_REFUNDABLE', intent);
    const receipt = state.operations[state.activeOperationId].offerApproval;
    assert.equal(receipt.acceptReducedFlexibility, true);
    assert.equal(receipt.materialFingerprint, intent.materialFingerprint);
    for (let index = 0; index < 4; index++) ({ state } = advance(state));
    assert.equal(state.booking.version, 1);
    assert.equal(state.monitoring.status, initial.enrolled ? 'active' : 'paused');
    ({ state } = advance(state));
    assert.equal(state.booking.retail.totalMinor, 48000);
    assert.equal(state.monitoring.status, 'ended');
    assert.equal(state.monitoring.reason, 'NON_REFUNDABLE_BASELINE');
    assert.equal(state.permissionRecord, null);
    assert.equal(state.operations[state.activeOperationId].refund.amountMinor, 11500);
    state.demoNow = '2026-11-11T03:00:00Z';
    state.operations[state.activeOperationId].offerApproval.revokedAt = state.demoNow;
    ({ state } = advance(state));
    assert.equal(state.operations[state.activeOperationId].refund.status, 'completed');
    assert.equal(approve(state, 'DEMO_NON_REFUNDABLE', intent).replayed, true);
    assert.throws(() => approve(state, 'DEMO_NON_REFUNDABLE', { ...intent, acceptReducedFlexibility: false }), { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
  }
});

test('selected-offer approval atomically starts each customer alternative without standing permission or enrolment', () => {
  for (const offerId of ['DEMO_EQUIVALENT', 'DEMO_DIFFERENT_ROOM', 'DEMO_DIFFERENT_HOTEL']) {
    const initial = unconfirmed();
    const { state } = approve(initial, offerId);
    const operation = state.operations[state.activeOperationId];
    assert.equal(operation.stage, 'ready');
    assert.equal(operation.authority, 'offer-approval');
    assert.equal(operation.offerApproval.scope, 'selected-offer');
    assert.equal(operation.offerApproval.offerId, offerId);
    assert.equal(state.selectedOfferId, offerId);
    assert.equal(state.enrolled, false);
    assert.deepEqual(state.preferences, initial.preferences);
    assert.equal(state.permissionRecord, null);
    assert.deepEqual(state.reservedBookingVersions, [1]);
    assert.equal(Object.keys(state.operations).length, 1);
  }
});

test('shared selected-offer approval rejects false, missing and string confirmation before creating authority', () => {
  for (const confirmed of [false, undefined, 'true']) {
    const state = unconfirmed();
    const intent = simulationView(state, 'visitor', fixture).offerApprovalIntents.DEMO_EQUIVALENT;
    const { idempotencyKey, ...body } = intent;
    if (confirmed === undefined) delete body.confirmed;
    else body.confirmed = confirmed;
    assert.throws(() => simulation.approveOffer(state, { body, idempotencyKey, visitorId: 'visitor', fixture, recordedAt }),
      { code: 'VALIDATION_ERROR', status: 422 });
    assert.deepEqual(state.operations, {});
    assert.deepEqual(state.reservedBookingVersions, []);
    assert.equal(state.activeOperationId, null);
    assert.equal(state.permissionRecord, null);
    assert.deepEqual(state.preferences, fixture.preferences);
  }
});

test('a changed confirmation under an existing selected-offer key rejects payload mismatch before fresh validation', () => {
  const initial = unconfirmed();
  const intent = simulationView(initial, 'visitor', fixture).offerApprovalIntents.DEMO_EQUIVALENT;
  const { state } = approve(initial, 'DEMO_EQUIVALENT', intent);
  assert.throws(() => approve(state, 'DEMO_EQUIVALENT', { ...intent, confirmed: false }),
    { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH', status: 422 });
  assert.equal(approve(state, 'DEMO_EQUIVALENT', intent).replayed, true);
  assert.equal(Object.keys(state.operations).length, 1);
});

test('approval intents expose eligible customer offers with a separate non-refundable acknowledgment; hard unknown facts never gain authority', () => {
  const state = unconfirmed();
  const intents = simulationView(state, 'visitor', fixture).offerApprovalIntents;
  assert.equal(intents.DEMO_NON_REFUNDABLE.acceptReducedFlexibility, true);
  assert.equal(intents.DEMO_REVALIDATION_CHANGE, null);
  assert.equal(intents.DEMO_UNKNOWN_CONDITION, null);
  const savedIntent = intents.DEMO_EQUIVALENT;
  state.offers[0].room.conditions.bedType = null;
  assert.equal(simulationView(state, 'visitor', fixture).offerApprovalIntents.DEMO_EQUIVALENT, null);
  assert.throws(() => approve(state, 'DEMO_EQUIVALENT', savedIntent), { code: 'OFFER_MATERIAL_CHANGED' });
});

test('each explicitly approved alternative uses the six-stage runner, retires offers and never carries selected approval', () => {
  for (const offerId of ['DEMO_EQUIVALENT', 'DEMO_DIFFERENT_ROOM', 'DEMO_DIFFERENT_HOTEL']) {
    const initial = unconfirmed();
    const intent = simulationView(initial, 'visitor', fixture).offerApprovalIntents[offerId];
    let { state } = approve(initial, offerId, intent);
    for (const stage of ['revalidated', 'replacement-secured', 'fulfilment-verified', 'cancellation-requested', 'cancellation-verified', 'refund-completed']) {
      ({ state } = advance(state));
      const operation = state.operations[state.activeOperationId];
      assert.equal(operation.stage, stage);
      assert.equal(operation.status, stage === 'refund-completed' ? 'complete' : 'running');
      assert.equal(state.booking.version, ['cancellation-verified', 'refund-completed'].includes(stage) ? 2 : 1);
      if (stage === 'cancellation-verified') assert.equal(operation.refund.status, 'pending');
    }
    assert.equal(state.permissionRecord, null);
    assert.equal(state.enrolled, false);
    assert.deepEqual(state.preferences, initial.preferences);
    assert.deepEqual(state.offers, []);
    assert.deepEqual(simulationView(state, 'visitor', fixture).offerApprovalIntents, {});
    assert.equal(approve(state, offerId, intent).replayed, true);
    assert.equal(advance(state, 0).replayed, true);
    assert.equal(state.operations[state.activeOperationId].history.length, 7);
  }
});

test('selected approval cannot survive revocation, expiry, changed facts or customer requirements', () => {
  const mutations = [
    state => { state.operations[state.activeOperationId].offerApproval.revokedAt = state.demoNow; },
    state => { state.demoNow = '2026-10-13T03:00:00Z'; },
    state => { state.offers[0].room.conditions.roomSizeSqm = 40; },
    state => { state.offers[0].retail.totalMinor--; },
    state => { state.booking.room.conditions.view = 'SEA'; },
    state => { state.preferences.essentialRequirements.accessible = true; },
    state => { state.preferences.version++; },
  ];
  for (const mutate of mutations) {
    let { state } = approve(unconfirmed());
    mutate(state);
    ({ state } = advance(state));
    const operation = state.operations[state.activeOperationId];
    assert.equal(operation.status, 'failed');
    assert.equal(operation.replacementBooking, null);
    assert.equal(operation.cancellation, null);
    assert.equal(state.booking.version, 1);
  }
  let { state } = approve(unconfirmed());
  for (let index = 0; index < 3; index++) ({ state } = advance(state));
  state.operations[state.activeOperationId].offerApproval.revokedAt = state.demoNow;
  ({ state } = advance(state));
  assert.equal(state.operations[state.activeOperationId].status, 'agency-exception');
  assert.equal(state.operations[state.activeOperationId].cancellation, null);
});

test('selected approval validates stale bindings, missing costs and unsupported offer IDs without changing defaults', () => {
  const initial = unconfirmed();
  const intent = simulationView(initial, 'visitor', fixture).offerApprovalIntents.DEMO_EQUIVALENT;
  const changed = structuredClone(initial);
  delete changed.offers[0].refundQuote.switchFeesMinor;
  assert.throws(() => approve(changed, 'DEMO_EQUIVALENT', intent), { code: 'OFFER_MATERIAL_CHANGED' });
  assert.equal(simulationView(changed, 'visitor', fixture).offerApprovalIntents.DEMO_EQUIVALENT, null);
  const versions = [['bookingVersion', 'BOOKING_VERSION_CHANGED'], ['preferenceVersion', 'PREFERENCES_VERSION_CHANGED'], ['offerVersion', 'OFFER_VERSION_CHANGED']];
  for (const [field, code] of versions) {
    const stale = structuredClone(initial);
    if (field === 'bookingVersion') stale.booking.version++;
    if (field === 'preferenceVersion') stale.preferences.version++;
    if (field === 'offerVersion') stale.offers[0].version++;
    assert.throws(() => approve(stale, 'DEMO_EQUIVALENT', intent), { code });
  }
  assert.throws(() => approve(initial, 'DEMO_NON_REFUNDABLE', { ...intent, offerId: 'DEMO_NON_REFUNDABLE' }), { code: 'VALIDATION_ERROR' });
  const claimed = approve(initial).state;
  assert.throws(() => approve(claimed, 'DEMO_EQUIVALENT', { ...intent, preferenceVersion: 2 }), { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
  const otherIntent = simulationView(initial, 'visitor', fixture).offerApprovalIntents.DEMO_DIFFERENT_HOTEL;
  assert.throws(() => approve(claimed, 'DEMO_DIFFERENT_HOTEL', otherIntent), { code: 'SWITCH_IN_PROGRESS' });
});

test('an explicit fresh fingerprint cannot bypass unknown conditions, money, cancellation or a non-refundable offer', () => {
  const changes = [
    state => { state.offers[0].room.conditions.bedType = null; },
    state => { delete state.offers[0].refundQuote.switchFeesMinor; },
    state => { delete state.offers[0].retail.taxesMinor; },
    state => { state.offers[0].cancellation.schedule = []; },
    state => { state.offers[0].cancellation = structuredClone(fixture.offers[3].cancellation); },
    state => { state.preferences.essentialRequirements.accessible = true; },
    state => { state.offers[0].expiresAt = state.demoNow; },
  ];
  for (const change of changes) {
    const state = unconfirmed();
    const intent = simulationView(state, 'visitor', fixture).offerApprovalIntents.DEMO_EQUIVALENT;
    change(state);
    intent.materialFingerprint = materialFingerprint({ booking: state.booking, offer: state.offers[0], preferences: state.preferences });
    assert.throws(() => approve(state, 'DEMO_EQUIVALENT', intent), { code: 'SWITCH_NOT_AUTHORISED' });
    assert.deepEqual(state.reservedBookingVersions, []);
    assert.equal(state.activeOperationId, null);
  }
});

test('public offer approval receipts whitelist safe audit bindings', () => {
  const { state } = approve(unconfirmed());
  state.operations[state.activeOperationId].offerApproval.privateSupplierReference = 'hidden';
  const operation = simulationView(state, 'visitor', fixture).operation;
  assert.equal(operation.offerApproval.privateSupplierReference, undefined);
  assert.equal(operation.offerApproval.materialFingerprint.length, 64);
});

test('six persisted advances secure replacement before cancelling, then promote and settle refund separately', () => {
  let { state } = start(ready());
  const original = structuredClone(state.booking);
  for (const stage of ['revalidated', 'replacement-secured', 'fulfilment-verified', 'cancellation-requested']) {
    ({ state } = advance(state));
    assert.equal(state.operations[state.activeOperationId].stage, stage);
    assert.deepEqual(state.booking, original);
    assert.equal(state.operations[state.activeOperationId].savingSecured, false);
  }
  const receipt = state.operations[state.activeOperationId].finalCheckReceipt;
  assert.equal(receipt.offer.version, 1);
  assert.deepEqual(receipt.offer.identity, fixture.offers[0].identity);
  ({ state } = advance(state));
  assert.equal(state.booking.version, 2);
  assert.equal(state.booking.retail.totalMinor, 54000);
  assert.equal(state.offers.length, 0);
  assert.equal(state.permissionRecord.targetBookingVersion, 2);
  assert.equal(state.monitoring.bookingVersion, 2);
  assert.equal(state.monitoring.status, 'active');
  assert.equal(state.operations[state.activeOperationId].savingSecured, true);
  assert.equal(state.operations[state.activeOperationId].refund.status, 'pending');
  state.preferences.automaticEquivalentSwitches = false;
  state.permissionRecord = null;
  ({ state } = advance(state));
  assert.equal(state.operations[state.activeOperationId].status, 'complete');
  assert.equal(state.operations[state.activeOperationId].refund.status, 'completed');
  assert.equal(state.operations[state.activeOperationId].refund.amountMinor, 5500);
  assert.equal(state.operations[state.activeOperationId].history.length, 7);
});

test('start and old stage replay keep current state, payload mismatch cannot reuse intent', () => {
  const initial = ready();
  let result = start(initial);
  const claimed = result.state;
  result = advance(claimed);
  assert.equal(start(result.state).replayed, true);
  const replay = advance(result.state, 0);
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.operations[replay.state.activeOperationId].revision, 1);
  assert.deepEqual(replay.replayedCommand, { revision: 1, stage: 'revalidated', status: 'running' });
  const changed = structuredClone(result.state);
  changed.preferences.version++;
  assert.throws(() => start(changed), { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
  assert.throws(() => advance(result.state, 20), { code: 'OPERATION_VERSION_CHANGED' });
  assert.throws(() => start(result.state, 'material-change'), { code: 'SWITCH_IN_PROGRESS' });
});

test('material final-check change stops before securing replacement with version two evidence', () => {
  let { state } = start(ready(), 'material-change');
  ({ state } = advance(state));
  const operation = state.operations[state.activeOperationId];
  assert.equal(operation.status, 'awaits-renewed-approval');
  assert.equal(operation.revalidatedOffer.version, 2);
  assert.equal(operation.replacementBooking, null);
  assert.equal(operation.cancellation, null);
  assert.equal(operation.refund.status, 'not-started');
  assert.equal(operation.refund.amountMinor, 5000);
  assert.equal(state.booking.version, 1);
  assert.throws(() => advance(state), { code: 'SWITCH_NOT_AUTHORISED' });
});

test('continuation preference applies after a successful switch, while original monitoring and refund recovery stay eligible', () => {
  const initial = ready();
  initial.preferences.continueMonitoring = false;
  assert.equal(initialiseSimulation(initial, fixture).monitoring.status, 'active');
  let { state } = start(initial);
  for (let index = 0; index < 5; index++) ({ state } = advance(state));
  assert.equal(state.monitoring.status, 'paused');
  assert.equal(state.monitoring.bookingVersion, 2);
  assert.equal(state.permissionRecord, null);
  ({ state } = advance(state));
  assert.equal(state.operations[state.activeOperationId].refund.status, 'completed');
});

test('unknown cancellation reconciles the existing intent after revocation without reissuing it', () => {
  let { state } = start(ready(), 'uncertain-cancellation');
  for (let index = 0; index < 5; index++) ({ state } = advance(state));
  let operation = state.operations[state.activeOperationId];
  assert.equal(operation.status, 'agency-exception');
  assert.equal(operation.cancellation.status, 'unknown');
  assert.equal(state.booking.version, 1);
  assert.equal(operation.savingSecured, false);
  assert.equal(operation.refund.status, 'not-started');
  const intentId = operation.cancellation.intentId;
  state.preferences.automaticEquivalentSwitches = false;
  state.preferences.continueMonitoring = false;
  state.permissionRecord = null;
  ({ state } = advance(state));
  operation = state.operations[state.activeOperationId];
  assert.equal(operation.stage, 'cancellation-verified');
  assert.equal(operation.cancellation.intentId, intentId);
  assert.equal(operation.cancellation.observations.length, 2);
  assert.equal(state.booking.version, 2);
  assert.equal(state.monitoring.status, 'paused');
  assert.equal(state.permissionRecord, null);
  assert.equal(operation.history.filter(item => item.stage === 'cancellation-requested' && item.status === 'running').length, 1);
});

test('revoked authority cannot initiate or secure, and cannot cancel an already secured replacement', () => {
  const unauthorised = ready();
  unauthorised.permissionRecord = null;
  assert.throws(() => start(unauthorised), { code: 'SWITCH_NOT_AUTHORISED' });
  assert.deepEqual(unauthorised.reservedBookingVersions, []);
  let { state } = start(ready());
  ({ state } = advance(state));
  state.permissionRecord = null;
  ({ state } = advance(state));
  assert.equal(state.operations[state.activeOperationId].status, 'failed');
  assert.equal(state.operations[state.activeOperationId].replacementBooking, null);
  ({ state } = start(ready()));
  for (let index = 0; index < 3; index++) ({ state } = advance(state));
  state.permissionRecord = null;
  ({ state } = advance(state));
  assert.equal(state.operations[state.activeOperationId].status, 'agency-exception');
  assert.equal(state.operations[state.activeOperationId].cancellation, null);
  assert.equal(state.booking.version, 1);
});

test('cancel-intent observation and refund recovery continue after offer and free-window expiry', () => {
  let { state } = start(ready(), 'uncertain-cancellation');
  for (let index = 0; index < 5; index++) ({ state } = advance(state));
  state.demoNow = '2026-11-11T03:00:00Z';
  state.permissionRecord = { ...state.permissionRecord, revokedAt: state.demoNow };
  ({ state } = advance(state));
  assert.equal(state.operations[state.activeOperationId].stage, 'cancellation-verified');
  assert.equal(state.monitoring.status, 'ended');
  assert.equal(state.permissionRecord, null);
  ({ state } = advance(state));
  assert.equal(state.operations[state.activeOperationId].refund.status, 'completed');
});

test('generic replacement reservation cannot satisfy the verified fulfilment cancellation gate', () => {
  let { state } = start(ready());
  for (let index = 0; index < 3; index++) ({ state } = advance(state));
  state.operations[state.activeOperationId].replacementBooking.fulfilment.status = 'simulated-reserved';
  ({ state } = advance(state));
  const operation = state.operations[state.activeOperationId];
  assert.equal(operation.status, 'agency-exception');
  assert.deepEqual(operation.reasonCodes, ['FULFILMENT_UNVERIFIED']);
  assert.equal(operation.cancellation, null);
  assert.equal(state.booking.version, 1);
});
