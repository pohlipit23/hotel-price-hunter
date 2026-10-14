import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialiseSimulation, simulationView, approveOffer, advanceSwitch } from '../app/domain/simulation.mjs';
import { changePriceWatch, checkPriceWatch, priceWatchView, fixtureWatchProvider, appendWatchOperationEvents, watchAliases, notificationView, prepareWatchDigests, formatWatchMoney } from '../app/domain/price-watch.mjs';
import { validateWorkerEnvironment } from '../scripts/run-price-watch.mjs';
const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
const at = '2026-10-15T03:00:00Z';
const visitorId = 'a'.repeat(64);
const initial = () => initialiseSimulation({ scenarioId: fixture.scenarioId, demoNow: fixture.demoNow, preferences: structuredClone(fixture.preferences), enrolled: false, permissionRecord: null, revision: 0, expiresAt: '2026-11-14T03:00:00Z' }, fixture);
function enable(value = initial(), options = {}) {
  const intent = priceWatchView(value, { visitorId, recordedAt: at }).consentIntents.enable;
  return changePriceWatch(value, { ...intent, visitorId, fixture, recordedAt: at, aliases: watchAliases(), ...options });
}
test('opt-in records one current simulated check without granting switch authority or changing fictional facts', () => {
  const source = initial(); const result = enable(source); const state = result.state;
  assert.equal(state.enrolled, false); assert.deepEqual(state.preferences, source.preferences); assert.equal(state.permissionRecord, null);
  assert.deepEqual(state.offers, source.offers); assert.deepEqual(state.operations, {}); assert.equal(state.demoNow, fixture.demoNow);
  const view = priceWatchView(state, { visitorId, recordedAt: at });
  assert.equal(view.version, 1); assert.equal(view.epoch, 1); assert.equal(view.lastCheck.status, 'offers-found');
  assert.equal(view.lastCheck.checkedAt, at); assert.equal(view.lastCheck.checkOffers.length > 0, true);
  assert.notEqual(view.lastCheck.checkOffers[0].offerId, source.offers[0].offerId);
  assert.equal(view.lastCheck.checkOffers[0].netSavingMinor, 5500);
  assert.doesNotMatch(JSON.stringify(view), /offerToken|watchId|visitorId|commands|eventKey/);
});
test('old consent replay after stop cannot restore consent and changed payload rejects', () => {
  const source = initial(); const intent = priceWatchView(source, { visitorId, recordedAt: at }).consentIntents.enable;
  const enabled = enable(source).state;
  const stop = priceWatchView(enabled, { visitorId, recordedAt: at }).consentIntents.disable;
  const stopped = changePriceWatch(enabled, { ...stop, visitorId, fixture, recordedAt: at, aliases: watchAliases() }).state;
  const replay = changePriceWatch(stopped, { ...intent, visitorId, fixture, recordedAt: at, aliases: watchAliases() });
  assert.equal(replay.replayed, true); assert.equal(replay.state.priceWatch.enabled, false);
  assert.throws(() => changePriceWatch(stopped, { ...intent, body: { ...intent.body, enabled: false }, visitorId, fixture, recordedAt: at, aliases: watchAliases() }), { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
});
test('daily dedupe returns immutable failure and next day creates a new result', () => {
  const state = enable(initial(), { provider: () => { throw new Error('private provider secret'); } }).state;
  assert.equal(state.priceWatch.lastCheck.status, 'failed');
  const replay = checkPriceWatch(state, { expected: state.priceWatch, fixture, recordedAt: at, aliases: watchAliases() });
  assert.equal(replay.replayed, true); assert.equal(replay.run.status, 'failed');
  const next = checkPriceWatch(state, { expected: state.priceWatch, fixture, recordedAt: '2026-10-16T03:00:00Z', aliases: watchAliases() });
  assert.equal(next.run.status, 'offers-found'); assert.equal(Object.keys(next.state.priceWatch.runs).length, 2);
});
test('current consent, preferences, baseline and operation guards suppress stale discovered work', () => {
  const state = enable().state; const expected = structuredClone(state.priceWatch);
  for (const mutate of [s => { s.priceWatch.enabled = false; s.priceWatch.version++; }, s => { s.priceWatch.epoch++; s.priceWatch.version++; }, s => { s.booking.version++; }, s => { s.operations.active = { status: 'running' }; }]) {
    const changed = structuredClone(state); mutate(changed);
    const result = checkPriceWatch(changed, { expected, fixture, recordedAt: '2026-10-16T03:00:00Z', aliases: watchAliases() });
    assert.equal(result.run.status, 'skipped'); assert.equal(result.run.searched, false); assert.deepEqual(result.run.checkOffers, []);
  }
  const unavailable = structuredClone(state); unavailable.booking.version = 2;
  const result = checkPriceWatch(unavailable, { expected: { ...unavailable.priceWatch, bookingVersion: 2 }, fixture, recordedAt: '2026-10-16T03:00:00Z', aliases: watchAliases() });
  assert.equal(result.run.status, 'failed'); assert.deepEqual(result.run.reasonCodes, ['SOURCE_UNAVAILABLE']);
});
test('deadline and non-refundable baseline end checks and unknown facts pause', () => {
  const state = enable().state;
  assert.equal(priceWatchView(state, { visitorId, recordedAt: fixture.booking.cancellation.freeUntil }).status, 'ended');
  const nonRefundable = structuredClone(state); nonRefundable.booking.cancellation.refundability = 'non-refundable';
  assert.equal(priceWatchView(nonRefundable, { visitorId, recordedAt: at }).reason, 'NON_REFUNDABLE_BASELINE');
  const unknown = structuredClone(state); unknown.booking.cancellation.freeUntil = null;
  assert.equal(priceWatchView(unknown, { visitorId, recordedAt: at }).status, 'paused');
});
test('no-saving and frequency policies remain distinct from failed search', () => {
  for (const frequency of ['daily', 'weekly', 'offers-only']) {
    const source = initial(); source.preferences.notificationFrequency = frequency;
    const state = enable(source, { provider: () => ({ status: 'complete', offers: [] }) }).state;
    assert.equal(state.priceWatch.lastCheck.status, 'no-saving');
    const routine = Object.values(state.priceWatch.events).find(item => item.kind === 'no-saving');
    assert.equal(routine.status, frequency === 'daily' ? 'prepared' : frequency === 'weekly' ? 'pending-digest' : 'suppressed');
    assert.equal(Object.values(state.priceWatch.events).find(item => item.kind === 'watch-confirmed').status, 'prepared');
  }
});
test('full rate identity is fresh and refund facts remain bound to the original trusted baseline', () => {
  const state = enable().state;
  const first = fixtureWatchProvider({ booking: state.booking, fixture, checkedAt: at, intent: 'first' });
  const second = fixtureWatchProvider({ booking: state.booking, fixture, checkedAt: '2026-10-16T03:00:00Z', intent: 'second' });
  assert.notEqual(first.offers[0].identity.offerToken, second.offers[0].identity.offerToken);
  assert.equal(first.offers[0].refundQuote.originalRetailMinor, 60000);
  assert.equal(first.offers[0].checkedAt, at);
  const changed = structuredClone(state.booking); changed.retail.totalMinor = 1;
  assert.equal(fixtureWatchProvider({ booking: changed, fixture, checkedAt: at, intent: 'first' }).reason, 'SOURCE_UNAVAILABLE');
  const reordered = Object.fromEntries(Object.entries(state.booking).reverse());
  assert.equal(fixtureWatchProvider({ booking: reordered, fixture, checkedAt: at, intent: 'first' }).status, 'complete');
});
test('manual saved stages create immutable truthful refund/attention events only while subscribed', () => {
  const before = enable().state; const next = structuredClone(before);
  next.booking.version = 2;
  next.operations.op = { operationId: 'op', revision: 5, stage: 'cancellation-verified', status: 'running', bookingVersion: 1, savingSecured: true, cancellation: { status: 'verified', observations: [{ status: 'cancelled', receiptId: 'fictional-receipt' }] }, refund: { status: 'pending', amountMinor: 5500, currency: 'USD' } };
  const pending = appendWatchOperationEvents(before, next, { recordedAt: at, aliases: watchAliases() });
  const event = Object.values(pending.priceWatch.events).find(item => item.type === 'refund-progress');
  assert.match(event.message, /pending/); assert.equal(event.status, 'prepared');
  const complete = structuredClone(pending); complete.operations.op.revision++; complete.operations.op.stage = 'refund-completed'; complete.operations.op.refund.status = 'completed';
  const saved = appendWatchOperationEvents(pending, complete, { recordedAt: at, aliases: watchAliases() });
  assert.equal(Object.values(saved.priceWatch.events).filter(item => item.type === 'refund-progress').length, 2);
  assert.equal(Object.values(saved.priceWatch.events).find(item => item.notificationId === event.notificationId).message, event.message);
});
test('capacity rejects new checks atomically but exact run replay and reserved stop remain available', () => {
  const state = enable().state;
  const known = structuredClone(state.priceWatch.lastCheck);
  for (let i = 0; i < 255; i++) state.priceWatch.runs[`filler-${i}`] = { ...known, runId: `old-${i}` };
  assert.equal(checkPriceWatch(state, { expected: state.priceWatch, fixture, recordedAt: at, aliases: watchAliases() }).replayed, true);
  const frozen = structuredClone(state);
  assert.throws(() => checkPriceWatch(state, { expected: state.priceWatch, fixture, recordedAt: '2026-10-16T03:00:00Z', aliases: watchAliases() }), { code: 'WATCH_CAPACITY_REACHED' });
  assert.deepEqual(state, frozen);
  for (let i = 0; i < 254; i++) state.priceWatch.commands[`receipt-${i}`] = {};
  const intent = priceWatchView(state, { visitorId, recordedAt: at }).consentIntents.disable;
  const stopped = changePriceWatch(state, { ...intent, visitorId, fixture, recordedAt: at, aliases: watchAliases() }).state;
  assert.equal(stopped.priceWatch.enabled, false); assert.equal(Object.keys(stopped.priceWatch.commands).length, 256);
  assert.equal(changePriceWatch(stopped, { ...intent, visitorId, fixture, recordedAt: at, aliases: watchAliases() }).replayed, true);
});
test('outbox capacity never rolls back subscribed manual refund recovery and public view stays bounded', () => {
  const previous = enable().state;
  for (let i = Object.keys(previous.priceWatch.events).length; i < 256; i++) previous.priceWatch.events[`old-${i}`] = { notificationId: `notice-${i}`, type: 'check-update', kind: 'no-saving' };
  const next = structuredClone(previous); next.booking.version = 2;
  next.operations.op = { operationId: 'op', revision: 6, stage: 'refund-completed', status: 'complete', bookingVersion: 1, savingSecured: true, cancellation: { status: 'verified', observations: [{ status: 'cancelled', receiptId: 'proof' }] }, refund: { status: 'completed', amountMinor: 5500, currency: 'USD' } };
  const saved = appendWatchOperationEvents(previous, next, { recordedAt: at, aliases: watchAliases() });
  assert.equal(saved.operations.op.refund.status, 'completed'); assert.equal(saved.priceWatch.omittedEventCount, 1); assert.equal(saved.priceWatch.omissionReason, 'WATCH_CAPACITY_REACHED');
  assert.equal(Object.keys(saved.priceWatch.events).length, 256); assert.equal(notificationView(saved, 50).notifications.length, 50);
});
test('weekly digest preserves original pending snapshot and prepares exactly once when due', () => {
  const source = initial(); source.preferences.notificationFrequency = 'weekly';
  const state = enable(source, { provider: () => ({ status: 'complete', offers: [] }) }).state;
  const pending = Object.values(state.priceWatch.events).find(item => item.kind === 'no-saving');
  assert.equal(pending.dueAt, '2026-10-22T03:00:00.000Z');
  assert.equal(Object.keys(prepareWatchDigests(state, { recordedAt: '2026-10-21T03:00:00Z', aliases: watchAliases() }).priceWatch.events).length, 2);
  const saved = prepareWatchDigests(state, { recordedAt: pending.dueAt, aliases: watchAliases() });
  assert.equal(Object.values(saved.priceWatch.events).find(item => item.notificationId === pending.notificationId).status, 'pending-digest');
  assert.equal(Object.values(saved.priceWatch.events).filter(item => item.kind === 'weekly-digest').length, 1);
  assert.equal(Object.keys(prepareWatchDigests(saved, { recordedAt: pending.dueAt, aliases: watchAliases() }).priceWatch.events).length, 3);
});
test('nine real weekly re-enable anchors prepare unique digests below the ledger capacity', () => {
  let state = initial(); state.preferences.notificationFrequency = 'weekly';
  for (let index = 0; index < 9; index++) {
    const recordedAt = new Date(Date.parse(at) + index * 3600000).toISOString();
    const intent = priceWatchView(state, { visitorId, recordedAt }).consentIntents.enable;
    state = changePriceWatch(state, { ...intent, visitorId, fixture, recordedAt, aliases: watchAliases(), provider: () => ({ status: 'complete', offers: [] }) }).state;
    if (index < 8) {
      const stop = priceWatchView(state, { visitorId, recordedAt }).consentIntents.disable;
      state = changePriceWatch(state, { ...stop, visitorId, fixture, recordedAt, aliases: watchAliases() }).state;
    }
  }
  assert.equal(Object.keys(state.priceWatch.commands).length, 17);
  assert.equal(Object.keys(state.priceWatch.runs).length, 9);
  assert.equal(Object.keys(state.priceWatch.events).length, 18);
  const due = prepareWatchDigests(state, { recordedAt: '2026-10-23T03:00:00Z', aliases: watchAliases() });
  const digests = Object.values(due.priceWatch.events).filter(event => event.kind === 'weekly-digest');
  assert.equal(digests.length, 9);
  assert.equal(new Set(digests.map(event => event.notificationId)).size, 9);
  assert.equal(Object.keys(due.priceWatch.events).length, 27);
  assert.equal(Object.keys(prepareWatchDigests(due, { recordedAt: '2026-10-23T03:00:00Z', aliases: watchAliases() }).priceWatch.events).length, 27);
});
test('actual Asia Kuala Lumpur midnight creates a new day without changing the fictional clock', () => {
  const state = enable(initial(), { recordedAt: '2026-10-15T15:59:59Z' }).state;
  const result = checkPriceWatch(state, { expected: state.priceWatch, fixture, recordedAt: '2026-10-15T16:00:00Z', aliases: watchAliases() });
  assert.equal(state.priceWatch.lastCheck.day, '2026-10-15'); assert.equal(result.run.day, '2026-10-16'); assert.equal(result.state.demoNow, fixture.demoNow);
});
test('a provider preparation that crosses the actual deadline cannot publish offers', () => {
  const state = enable().state; const beforeDeadline = '2026-11-10T09:59:59Z'; let clock = beforeDeadline;
  const provider = input => { const result = fixtureWatchProvider(input); clock = '2026-11-10T10:00:00Z'; return result; };
  const result = checkPriceWatch(state, { expected: state.priceWatch, fixture, recordedAt: beforeDeadline, aliases: watchAliases(), provider, now: () => new Date(clock) });
  assert.equal(result.run.status, 'skipped'); assert.deepEqual(result.run.reasonCodes, ['CANCELLATION_WINDOW_ENDED']); assert.deepEqual(result.run.checkOffers, []);
});
test('checked-offer projection exposes verified safe refund facts and no reconstructable full rate identity', () => {
  const offer = enable().state.priceWatch.lastCheck.checkOffers[0];
  assert.equal(offer.refundQuote.status, 'verified'); assert.equal(offer.refundQuote.netSavingMinor, 5500); assert.equal(offer.decision.netSavingMinor, 5500);
  assert.equal(offer.decision.action, 'approval-required'); assert.equal(offer.decision.authority, null);
  assert.doesNotMatch(JSON.stringify(offer), /observationId|templateOfferId|offerToken|sourceId|contractId|simulated-watch-quote/);
});
test('an agency exception before cancellation reports a paused switch without inventing an unknown cancellation', () => {
  let before = enable().state;
  const { idempotencyKey, ...body } = simulationView(before, visitorId, fixture).offerApprovalIntents.DEMO_EQUIVALENT;
  before = approveOffer(before, { body, idempotencyKey, visitorId, fixture, recordedAt: at, agencyCaseId: `case-${'1'.repeat(64)}` }).state;
  const operationId = before.activeOperationId;
  before = advanceSwitch(before, { operationId, expectedOperationRevision: 0, fixture, recordedAt: at }).state;
  before = advanceSwitch(before, { operationId, expectedOperationRevision: 1, fixture, recordedAt: at }).state;
  before.operations[operationId].offerApproval.revokedAt = fixture.demoNow;
  const next = advanceSwitch(before, { operationId, expectedOperationRevision: 2, fixture, recordedAt: at }).state;
  assert.equal(next.operations[operationId].status, 'agency-exception'); assert.equal(next.operations[operationId].cancellation, null);
  const result = appendWatchOperationEvents(before, next, { recordedAt: at, aliases: watchAliases() });
  const notice = Object.values(result.priceWatch.events).find(item => item.type === 'agency-attention');
  assert.match(notice.title, /Switch paused/); assert.match(notice.message, /OFFER_APPROVAL_REQUIRED/);
  assert.doesNotMatch(notice.message, /cancellation outcome is unknown|saving.*secured|refund.*pending/);
});
test('refund preview formatter preserves currency minor units and large safe integer amounts', () => {
  assert.match(formatWatchMoney({ totalMinor: 5500, currency: 'USD' }, { code: 'USD', minorUnit: 2 }), /55\.00/);
  assert.match(formatWatchMoney({ totalMinor: 5500, currency: 'JPY' }, { code: 'JPY', minorUnit: 0 }), /5,500/);
  assert.match(formatWatchMoney({ totalMinor: 5500, currency: 'KWD' }, { code: 'KWD', minorUnit: 3 }), /5\.500/);
  assert.match(formatWatchMoney({ totalMinor: Number.MAX_SAFE_INTEGER, currency: 'USD' }, { code: 'USD', minorUnit: 2 }), /90,071,992,547,409\.91/);
});
test('quote expiry during pure provider preparation cannot publish stale checked money', () => {
  const state = enable().state; const nextDay = '2026-10-16T03:00:00Z'; let clock = nextDay;
  const provider = input => { const outcome = fixtureWatchProvider(input); for (const offer of outcome.offers) offer.expiresAt = '2026-10-16T03:00:00.001Z'; clock = '2026-10-16T03:00:00.002Z'; return outcome; };
  const result = checkPriceWatch(state, { expected: state.priceWatch, fixture, recordedAt: nextDay, aliases: watchAliases(), provider, now: () => new Date(clock) });
  assert.equal(result.run.status, 'failed'); assert.deepEqual(result.run.reasonCodes, ['OFFER_NOT_CURRENT']); assert.equal(result.run.searched, false); assert.deepEqual(result.run.checkOffers, []);
});
test('local no-saving fixture mode preserves source-unavailable on an actual promoted baseline', () => {
  let state = enable().state;
  const { idempotencyKey, ...body } = simulationView(state, visitorId, fixture).offerApprovalIntents.DEMO_EQUIVALENT;
  state = approveOffer(state, { body, idempotencyKey, visitorId, fixture, recordedAt: at, agencyCaseId: `case-${'2'.repeat(64)}` }).state;
  for (let revision = 0; revision < 6; revision++) state = advanceSwitch(state, { operationId: state.activeOperationId, expectedOperationRevision: revision, fixture, recordedAt: at }).state;
  assert.equal(state.booking.version, 2);
  const { provider } = validateWorkerEnvironment({ GOOGLE_CLOUD_PROJECT: 'demo-hotel-price-hunter', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081', PRICE_WATCH_FIXTURE_OUTCOME: 'no-saving' }, ['--once']);
  const result = checkPriceWatch(state, { expected: { ...state.priceWatch, bookingVersion: 2 }, fixture, recordedAt: '2026-10-16T03:00:00Z', aliases: watchAliases(), provider });
  assert.equal(result.run.status, 'failed'); assert.deepEqual(result.run.reasonCodes, ['SOURCE_UNAVAILABLE']);
});
