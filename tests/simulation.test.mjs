import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialiseSimulation, simulationView, startSwitch, advanceSwitch } from '../app/domain/simulation.mjs';

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
