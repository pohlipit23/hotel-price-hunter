import { createHash } from 'node:crypto';
import { evaluateOffer, materialFingerprint, isApprovalValid } from './decision.mjs';

const scenarios = [
  { id: 'equivalent-saving', label: 'Equivalent saving' },
  { id: 'material-change', label: 'Changed terms at final check' },
  { id: 'uncertain-cancellation', label: 'Uncertain cancellation and recovery' },
];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const requestHash = body => digest(Object.fromEntries(Object.keys(body).sort().map(key => [key, body[key]])));
export class SimulationError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }); }
}
const fail = (status, code, message, details) => { throw new SimulationError(status, code, message, details); };

export function standingApprovals(state) {
  const record = state.permissionRecord;
  if (!record || record.confirmed !== true || record.scope !== 'equivalent-only'
      || record.bookingVersion !== state.booking.version || record.preferenceVersion !== state.preferences.version) return [];
  return [{ type: 'standing', scope: record.scope, permissionVersion: record.version,
    bookingId: state.booking.bookingId, bookingVersion: record.bookingVersion, preferenceVersion: record.preferenceVersion,
    confirmed: true, confirmedAt: record.confirmedAt, revokedAt: record.revokedAt ?? null }];
}
export function offerDecision(state, offer, fixture) {
  return evaluateOffer({ booking: state.booking, offer, preferences: state.preferences,
    agencyMinimumSavingMinor: fixture.agencyMinimumSavingMinor, approvals: standingApprovals(state), now: state.demoNow });
}
export function monitoringState(state) {
  const cancellation = state.booking.cancellation;
  if (!state.enrolled) return { bookingVersion: state.booking.version, status: 'paused', reason: 'NOT_ENROLLED', freeUntil: cancellation.freeUntil };
  if (state.bookingHistory?.length && !state.preferences.continueMonitoring) return { bookingVersion: state.booking.version, status: 'paused', reason: 'CONTINUATION_DISABLED', freeUntil: cancellation.freeUntil };
  if (cancellation.refundability !== 'refundable' || Date.parse(cancellation.freeUntil) <= Date.parse(state.demoNow)) {
    return { bookingVersion: state.booking.version, status: 'ended', reason: 'CANCELLATION_WINDOW_ENDED', freeUntil: cancellation.freeUntil };
  }
  return { bookingVersion: state.booking.version, status: 'active', reason: 'REFUNDABLE_BASELINE', freeUntil: cancellation.freeUntil };
}
export function initialiseSimulation(value, fixture) {
  const state = structuredClone(value);
  state.booking ??= structuredClone(fixture.booking);
  state.offers ??= structuredClone(fixture.offers);
  state.bookingHistory ??= [];
  state.operations ??= {};
  state.activeOperationId ??= null;
  state.reservedBookingVersions ??= [];
  state.monitoring = monitoringState(state);
  return state;
}
function keyFor(visitorId, body, bookingId) {
  return digest(['simulated-switch-v1', visitorId, body.scenarioId, bookingId, body.bookingVersion, body.offerId, body.offerVersion]);
}
function publicOperation(operation) {
  if (!operation) return null;
  const { intentHash, idempotencyKey, commands, sourceOffer, permissionSnapshot, ...safe } = operation;
  return structuredClone(safe);
}
export function simulationView(state, visitorId, fixture) {
  const offer = state.offers.find(item => item.offerId === 'DEMO_EQUIVALENT');
  const choices = scenarios.map(scenario => {
    const body = offer ? { scenarioId: scenario.id, offerId: offer.offerId, offerVersion: offer.version,
      bookingVersion: state.booking.version, preferenceVersion: state.preferences.version } : null;
    return { ...scenario, intent: body ? { ...body, idempotencyKey: keyFor(visitorId, body, state.booking.bookingId) } : null };
  });
  const operation = publicOperation(state.operations[state.activeOperationId]);
  return { scenarioId: operation?.scenarioId ?? 'equivalent-saving',
    nextIntent: state.reservedBookingVersions.includes(state.booking.version) ? null : choices[0].intent,
    scenarios: choices, operation, history: operation?.history ?? [] };
}
function appendHistory(operation, state, recordedAt, message) {
  operation.history.push({ sequence: operation.history.length, stage: operation.stage, status: operation.status,
    demoAt: state.demoNow, recordedAt, message });
}
function authorityReasons(state, offer, fixture, operation) {
  const reasons = [];
  if (!state.enrolled) reasons.push('ENROLMENT_REQUIRED');
  if (operation && operation.bookingVersion !== state.booking.version) reasons.push('BOOKING_VERSION_CHANGED');
  if (operation && operation.preferenceVersion !== state.preferences.version) reasons.push('PREFERENCES_VERSION_CHANGED');
  const decision = offerDecision(state, offer, fixture);
  if (decision.authority !== 'standing') reasons.push(...decision.reasons, 'STANDING_PERMISSION_REQUIRED');
  return [...new Set(reasons)];
}
export function startSwitch(value, { body, idempotencyKey, visitorId, fixture, recordedAt }) {
  const state = initialiseSimulation(value, fixture);
  const hash = requestHash(body);
  const existing = Object.values(state.operations).find(item => item.idempotencyKey === idempotencyKey);
  if (existing) {
    if (existing.intentHash !== hash) fail(422, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'This intent key was already used with different details.');
    return { state, replayed: true };
  }
  if (!scenarios.some(item => item.id === body.scenarioId)) fail(404, 'SCENARIO_NOT_FOUND', 'Choose an available simulated scenario.');
  if (idempotencyKey !== keyFor(visitorId, body, state.booking.bookingId)) fail(422, 'INVALID_IDEMPOTENCY_KEY', 'Use the saved switch intent key.');
  if (body.bookingVersion !== state.booking.version) fail(409, 'BOOKING_VERSION_CHANGED', 'Reload the active booking before continuing.');
  if (body.preferenceVersion !== state.preferences.version) fail(409, 'PREFERENCES_VERSION_CHANGED', 'Reload current preferences before continuing.');
  const offer = state.offers.find(item => item.offerId === body.offerId && item.offerId === 'DEMO_EQUIVALENT');
  if (!offer) fail(404, 'OFFER_NOT_FOUND', 'This offer is unavailable for the simulated switch.');
  if (body.offerVersion !== offer.version) fail(409, 'OFFER_VERSION_CHANGED', 'Reload the current offer before continuing.');
  if (state.reservedBookingVersions.includes(state.booking.version)) fail(409, 'SWITCH_IN_PROGRESS', 'This original booking already has a recorded switch journey.');
  const reasons = authorityReasons(state, offer, fixture);
  if (reasons.length) fail(409, 'SWITCH_NOT_AUTHORISED', 'Current standing permission and eligible facts are required.', { reasonCodes: reasons });
  const operationId = `sim-${idempotencyKey}`;
  const operation = { operationId, ...body, bookingId: state.booking.bookingId,
    revision: 0, stage: 'ready', status: 'running', isSimulated: true,
    originalBooking: structuredClone(state.booking), revalidatedOffer: null, finalCheckReceipt: null,
    replacementBooking: null, cancellation: null,
    refund: { status: 'not-started', amountMinor: offer.refundQuote.netSavingMinor, currency: offer.refundQuote.currency, receiptId: null },
    savingSecured: false, reasonCodes: [], history: [], commands: {}, intentHash: hash, idempotencyKey,
    sourceOffer: structuredClone(offer), permissionSnapshot: structuredClone(state.permissionRecord) };
  appendHistory(operation, state, recordedAt, 'Simulated switch intent recorded; original booking remains active.');
  state.operations[operationId] = operation;
  state.activeOperationId = operationId;
  state.reservedBookingVersions.push(state.booking.version);
  state.revision++;
  state.updatedAt = recordedAt;
  return { state, replayed: false };
}
function stop(operation, reasons) {
  operation.status = operation.replacementBooking ? 'agency-exception' : 'failed';
  operation.reasonCodes = reasons;
}
function promote(state, operation, recordedAt) {
  const permission = state.permissionRecord;
  const validPermission = state.preferences.continueMonitoring && state.preferences.automaticEquivalentSwitches
    && state.preferences.version === operation.preferenceVersion && standingApprovals(state).some(approval => isApprovalValid(approval,
      { booking: state.booking, offer: operation.revalidatedOffer, preferences: state.preferences, now: state.demoNow }))
    && operation.permissionSnapshot?.confirmed === true;
  state.bookingHistory.push({ booking: structuredClone(state.booking), promotionOperationId: operation.operationId,
    cancellation: structuredClone(operation.cancellation) });
  state.booking = { ...structuredClone(operation.replacementBooking), bookingId: operation.originalBooking.bookingId,
    version: operation.originalBooking.version + 1 };
  state.offers = [];
  state.selectedOfferId = null;
  state.permissionRecord = validPermission ? { ...permission, bookingVersion: state.booking.version,
    sourceBookingVersion: operation.bookingVersion, targetBookingVersion: state.booking.version,
    rootConfirmedAt: permission.rootConfirmedAt ?? permission.confirmedAt,
    derivedFrom: permission.derivedFrom ?? `confirmation-${digest([operation.bookingId, permission.confirmedAt, permission.sourcePreferenceVersion ?? permission.preferenceVersion])}`,
    carriedAt: recordedAt, provenance: 'derived-equivalent-continuation' } : null;
  state.monitoring = monitoringState(state);
  operation.savingSecured = true;
  operation.refund.status = 'pending';
}
export function advanceSwitch(value, { operationId, expectedOperationRevision, fixture, recordedAt }) {
  const state = initialiseSimulation(value, fixture);
  const operation = state.operations[operationId];
  if (!operation) fail(404, 'OPERATION_NOT_FOUND', 'This session has no such simulated operation.');
  const commandHash = requestHash({ expectedOperationRevision });
  const receipt = operation.commands[expectedOperationRevision];
  if (receipt) {
    if (receipt.hash !== commandHash) fail(422, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'This advance command was already used with different details.');
    return { state, replayed: true, replayedCommand: structuredClone(receipt.result) };
  }
  if (expectedOperationRevision !== operation.revision) fail(409, 'OPERATION_VERSION_CHANGED', 'Reload the current switch stage before continuing.');
  const recovering = operation.status === 'agency-exception' && operation.cancellation?.status === 'unknown';
  if (operation.status !== 'running' && !recovering) fail(409, 'SWITCH_NOT_AUTHORISED', 'This switch cannot advance without new evidence or authority.', { reasonCodes: operation.reasonCodes });
  let message;
  if (operation.stage === 'ready') {
    const offer = structuredClone(operation.sourceOffer);
    offer.checkedAt = state.demoNow;
    offer.checkKind = 'revalidated';
    if (operation.scenarioId === 'material-change') {
      offer.version++;
      offer.retail.totalMinor = 54500;
      offer.room.conditions.roomSizeSqm = 38;
      offer.refundQuote.replacementRetailMinor = 54500;
      offer.refundQuote.netSavingMinor = 5000;
      offer.cancellation.schedule.at(-1).penaltyMinor = 54500;
    }
    operation.revalidatedOffer = offer;
    operation.finalCheckReceipt = { receiptId: `${operationId}:final-check`, checkedAt: state.demoNow,
      isSimulated: true, checkKind: 'revalidated', offer: structuredClone(offer),
      originalFingerprint: materialFingerprint({ booking: operation.originalBooking, offer: operation.sourceOffer, preferences: state.preferences }),
      checkedFingerprint: materialFingerprint({ booking: state.booking, offer, preferences: state.preferences }) };
    operation.stage = 'revalidated';
    const decision = offerDecision(state, offer, fixture);
    operation.refund.amountMinor = decision.netSavingMinor;
    operation.refund.currency = decision.netSavingMinor === null ? null : offer.refundQuote.currency;
    if (operation.scenarioId === 'material-change' && decision.action === 'approval-required') {
      operation.status = 'awaits-renewed-approval'; operation.reasonCodes = decision.reasons;
      message = 'Final check changed material terms. Renewed approval is required; no replacement was secured.';
    } else {
      const reasons = authorityReasons(state, offer, fixture, operation);
      if (reasons.length) stop(operation, reasons);
      message = reasons.length ? 'Final check did not retain eligible facts and current standing authority.' : 'Unchanged equivalent offer revalidated; fictional final-check receipt recorded.';
    }
  } else if (['revalidated', 'replacement-secured', 'fulfilment-verified'].includes(operation.stage)) {
    const reasons = authorityReasons(state, operation.revalidatedOffer, fixture, operation);
    if (reasons.length) {
      stop(operation, reasons); message = 'Current authority or facts changed; no further replacement or cancellation action occurred.';
    } else if (operation.stage === 'revalidated') {
      const offer = operation.revalidatedOffer;
      operation.replacementBooking = { ...structuredClone(operation.originalBooking),
        version: operation.bookingVersion + 1, replacementId: `${operationId}:replacement`,
        hotel: structuredClone(offer.hotel), stay: structuredClone(offer.stay), occupancy: structuredClone(offer.occupancy),
        room: structuredClone(offer.room), retail: structuredClone(offer.retail), supplierCost: structuredClone(offer.supplierCost),
        cancellation: structuredClone(offer.cancellation), source: { kind: 'fictional-demo', reference: `${operationId}:replacement` },
        fulfilment: { status: 'simulated-reserved', liveVerified: false } };
      operation.stage = 'replacement-secured'; message = 'One fictional replacement secured; fulfilment still requires verification.';
    } else if (operation.stage === 'replacement-secured') {
      if (operation.replacementBooking?.fulfilment.status !== 'simulated-reserved') {
        stop(operation, ['FULFILMENT_UNVERIFIED']); message = 'Replacement fulfilment cannot be verified; original remains active.';
      } else {
        operation.replacementBooking.fulfilment = { status: 'simulated-fulfilled', liveVerified: false,
          receiptId: `${operationId}:fulfilment`, verifiedAt: state.demoNow };
        operation.stage = 'fulfilment-verified'; message = 'Fictional replacement fulfilment independently verified; original remains active.';
      }
    } else if (operation.replacementBooking?.fulfilment.status !== 'simulated-fulfilled') {
      stop(operation, ['FULFILMENT_UNVERIFIED']); message = 'No original cancellation without verified replacement fulfilment.';
    } else {
      operation.cancellation = { intentId: `${operationId}:cancel-original`, status: 'requested', requestedAt: state.demoNow,
        originalBookingId: operation.bookingId, originalBookingVersion: operation.bookingVersion, observations: [] };
      operation.stage = 'cancellation-requested'; message = 'One fictional original-cancellation intent recorded; cancellation is not yet verified.';
    }
  } else if (operation.stage === 'cancellation-requested') {
    const unknown = operation.scenarioId === 'uncertain-cancellation' && !recovering;
    operation.cancellation.status = unknown ? 'unknown' : 'verified';
    operation.cancellation.observations.push({ status: unknown ? 'unknown' : 'cancelled',
      receiptId: unknown ? null : `${operationId}:cancellation-verification`, demoAt: state.demoNow, recordedAt, isSimulated: true });
    if (unknown) {
      operation.status = 'agency-exception'; operation.reasonCodes = ['CANCELLATION_OUTCOME_UNKNOWN'];
      message = 'Cancellation outcome unknown. Original remains active; recovery must observe the recorded intent.';
    } else {
      operation.status = 'running'; operation.stage = 'cancellation-verified'; operation.reasonCodes = [];
      promote(state, operation, recordedAt);
      message = 'Original cancellation verified; replacement becomes active and saving is secured. Refund is pending.';
    }
  } else if (operation.stage === 'cancellation-verified') {
    operation.refund.status = 'completed'; operation.refund.receiptId = `${operationId}:refund`;
    operation.stage = 'refund-completed'; operation.status = 'complete';
    message = 'Fictional traveller refund completed for the verified quoted amount and currency.';
  } else fail(409, 'SWITCH_NOT_AUTHORISED', 'This simulated stage cannot advance.');
  operation.revision++;
  appendHistory(operation, state, recordedAt, message);
  operation.commands[expectedOperationRevision] = { hash: commandHash,
    result: { revision: operation.revision, stage: operation.stage, status: operation.status } };
  state.revision++;
  state.updatedAt = recordedAt;
  return { state, replayed: false };
}
