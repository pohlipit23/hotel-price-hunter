import { createHash, randomBytes } from 'node:crypto';
import { evaluateOffer } from './decision.mjs';
import { assertMoney } from './money.mjs';
import { SimulationError } from './simulation.mjs';

const ZONE = 'Asia/Kuala_Lumpur';
const CAP = 256;
const PROTOCOL = 'simulated-watch-v1';
const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const fail = (code, message, status = 409) => { throw new SimulationError(status, code, message); };
const bodyHash = body => hash([body.bookingVersion, body.watchVersion, body.enabled]);
const consentKey = (visitorId, body) => hash([PROTOCOL, visitorId, body.bookingVersion, body.watchVersion, body.enabled]);
export function watchAliases() {
  return { watchId: randomBytes(32).toString('hex'), runId: `run-${randomBytes(16).toString('hex')}`,
    notifications: Array.from({ length: CAP }, () => `notice-${randomBytes(16).toString('hex')}`) };
}
export function formatWatchMoney(money, metadata) {
  assertMoney(money);
  const standard = new Intl.NumberFormat('en-US', { style: 'currency', currency: money.currency }).resolvedOptions().maximumFractionDigits;
  const digits = metadata?.code === money.currency ? metadata.minorUnit : standard;
  if (!Number.isSafeInteger(digits) || digits < 0 || digits > 4 || digits !== standard) throw new Error('Currency precision is not verified.');
  const divisor = 10n ** BigInt(digits); const minor = BigInt(money.totalMinor);
  const fraction = (minor % divisor).toString().padStart(digits, '0');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: money.currency, currencyDisplay: 'code', minimumFractionDigits: digits, maximumFractionDigits: digits })
    .formatToParts(minor / divisor).map(part => part.type === 'fraction' ? fraction : part.value).join('');
}
export function initialisePriceWatch(value) {
  const state = clone(value);
  state.priceWatch ??= { enabled: false, version: 0, epoch: 0, bookingVersion: state.booking.version,
    watchId: null, optedInAt: null, commands: {}, runs: {}, events: {}, lastCheck: null,
    omittedEventCount: 0, omissionReason: null };
  return state;
}
function dayAt(at) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}
function nextDay(at) { return new Date(Date.parse(`${dayAt(at)}T00:00:00+08:00`) + 86400000).toISOString(); }
function eligibility(state, at) {
  const watch = state.priceWatch;
  if (!watch.enabled) return { status: 'stopped', reason: watch.epoch ? 'WATCH_STOPPED' : 'NOT_OPTED_IN' };
  if (!Number.isFinite(Date.parse(state.expiresAt)) || Date.parse(state.expiresAt) <= Date.parse(at)) return { status: 'ended', reason: 'SESSION_EXPIRED' };
  const policy = state.booking.cancellation;
  if (policy?.refundability === 'non-refundable') return { status: 'ended', reason: 'NON_REFUNDABLE_BASELINE' };
  if (policy?.refundability !== 'refundable' || !Number.isFinite(Date.parse(policy.freeUntil)) || !Array.isArray(policy.schedule)) return { status: 'paused', reason: 'UNKNOWN_CANCELLATION_FACTS' };
  if (Date.parse(policy.freeUntil) <= Date.parse(at)) return { status: 'ended', reason: 'CANCELLATION_WINDOW_ENDED' };
  const tier = policy.schedule.find(item => Date.parse(item.from) <= Date.parse(at) && Date.parse(at) < Date.parse(item.to));
  if (!tier || tier.penaltyMinor !== 0 || tier.currency !== state.booking.retail.currency) return { status: 'paused', reason: 'UNKNOWN_CANCELLATION_FACTS' };
  if (Object.values(state.operations ?? {}).some(operation => operation.status !== 'complete')) return { status: 'paused', reason: 'SWITCH_IN_PROGRESS' };
  return { status: 'active', reason: 'REFUNDABLE_BASELINE' };
}
export function priceWatchView(value, { visitorId, recordedAt }) {
  const state = initialisePriceWatch(value); const watch = state.priceWatch; const effective = eligibility(state, recordedAt);
  const intent = enabled => {
    const body = { bookingVersion: state.booking.version, watchVersion: watch.version, enabled };
    return { body, idempotencyKey: consentKey(visitorId, body) };
  };
  const currentRun = Object.values(watch.runs).find(run => run.day === dayAt(recordedAt) && run.epoch === watch.epoch && run.bookingVersion === state.booking.version);
  return { enabled: watch.enabled, version: watch.version, epoch: watch.epoch, scope: 'checks-and-alerts-only',
    bookingVersion: state.booking.version, ...effective, timeZone: ZONE,
    nextCheckAt: effective.status === 'active' ? (currentRun ? nextDay(recordedAt) : recordedAt) : null,
    lastCheck: clone(watch.lastCheck), consentIntents: { enable: intent(true), disable: intent(false) } };
}
export function notificationView(value, limit = 20) {
  const state = initialisePriceWatch(value);
  return { notifications: Object.values(state.priceWatch.events).slice(-100).slice(-limit).map(clone), deliveryMode: 'preview-only' };
}

/** A new fictional observation from the allowlisted original template; never a live rate. */
export function fixtureWatchProvider({ booking, fixture, checkedAt, intent }) {
  if (booking.version !== 1 || hash(booking) !== hash(fixture.booking)) return { status: 'failed', reason: 'SOURCE_UNAVAILABLE' };
  const offers = fixture.offers.filter(offer => ['DEMO_EQUIVALENT', 'DEMO_DIFFERENT_ROOM', 'DEMO_DIFFERENT_HOTEL'].includes(offer.offerId)).map(template => {
    const offer = clone(template); const identity = hash([PROTOCOL, intent, template.offerId]);
    offer.offerId = `WATCH_${identity.slice(0, 24)}`;
    for (const key of ['searchId', 'offerToken', 'supplierCode', 'sourceId', 'contractId', 'roomTypeId']) offer.identity[key] = `SIM_${key}_${identity}`;
    offer.identity.shoppingId = `SIM_shopping_${identity}`; offer.identity.prebookId = null;
    offer.checkedAt = checkedAt; offer.expiresAt = new Date(Math.min(Date.parse(checkedAt) + 86400000, Date.parse(booking.cancellation.freeUntil))).toISOString();
    offer.checkKind = 'simulated-rate-check'; offer.provenance = { mode: 'simulated-fixture', protocol: PROTOCOL, observationId: `SIM_${identity}`, templateOfferId: template.offerId, checkedAt };
    offer.refundQuote = { ...offer.refundQuote, originalRetailMinor: booking.retail.totalMinor,
      replacementRetailMinor: offer.retail.totalMinor, originalCancellationMinor: 0,
      source: `simulated-watch-quote-${identity}` };
    offer.refundQuote.netSavingMinor = booking.retail.totalMinor - offer.retail.totalMinor - offer.refundQuote.switchFeesMinor - offer.refundQuote.refundProcessingMinor;
    return offer;
  });
  return { status: 'complete', offers };
}
function checkedOffer(offer, decision) {
  // Explicit projection: no full supplier/rate token is exposed to a customer preview.
  return { offerId: offer.offerId, version: offer.version, bookingVersion: offer.bookingVersion,
    hotel: clone(offer.hotel), room: clone(offer.room), stay: clone(offer.stay), occupancy: clone(offer.occupancy),
    category: offer.category, equivalence: offer.equivalence, retail: clone(offer.retail), cancellation: clone(offer.cancellation),
    checkedAt: offer.checkedAt, expiresAt: offer.expiresAt, checkKind: offer.checkKind,
    provenance: { mode: 'simulated-fixture', protocol: PROTOCOL, checkedAt: offer.checkedAt, isSimulated: true },
    refundQuote: Object.fromEntries(['status', 'basis', 'originalRetailMinor', 'replacementRetailMinor', 'originalCancellationMinor', 'switchFeesMinor', 'refundProcessingMinor', 'netSavingMinor', 'currency'].map(key => [key, offer.refundQuote[key]])),
    decision: { action: 'approval-required', reasons: ['DELIBERATE_REVIEW_REQUIRED'], netSavingMinor: decision.netSavingMinor, authority: null },
    netSavingMinor: decision.netSavingMinor, currency: offer.refundQuote.currency,
    approvalRequired: true, actionable: false };
}
function weeklyDue(watch, at) {
  const anchor = Date.parse(watch.optedInAt); const elapsed = Math.max(0, Date.parse(at) - anchor);
  return new Date(anchor + (Math.floor(elapsed / (7 * 86400000)) + 1) * 7 * 86400000).toISOString();
}
function appendEvent(watch, key, event, aliases, operational = false) {
  if (watch.events[key]) return;
  if (Object.keys(watch.events).length >= CAP) {
    if (!operational) fail('WATCH_CAPACITY_REACHED', 'Price-watch records reached capacity.');
    watch.omittedEventCount++; watch.omissionReason = 'WATCH_CAPACITY_REACHED'; return;
  }
  const notificationId = aliases.notifications[Object.keys(watch.events).length % aliases.notifications.length];
  // Every transaction supplies new aliases; use a distinct alias for each new event in that transaction.
  if (Object.values(watch.events).some(item => item.notificationId === notificationId)) fail('WATCH_CAPACITY_REACHED', 'A notification alias could not be recorded.');
  watch.events[key] = { notificationId, deliveryMode: 'preview-only', isSimulated: true, ...event };
}
function routineEvent(state, run, aliases) {
  const watch = state.priceWatch; const frequency = state.preferences.notificationFrequency;
  const actionable = run.status === 'offers-found';
  const common = { bookingVersion: run.bookingVersion, createdAt: run.recordedAt, dueAt: null, frequency };
  if (actionable) {
    appendEvent(watch, `${run.runId}:offers-found`, { ...common, type: 'offers-found', kind: 'offers-found', status: 'prepared', reason: 'ACTIONABLE_SAVING', title: 'Better simulated rates found', message: `${run.checkOffers.length} simulated offers meet your saving minimum. Prices are observations only.` }, aliases);
    appendEvent(watch, `${run.runId}:approval-request`, { ...common, type: 'approval-request', kind: 'approval-request', status: 'prepared', reason: 'DELIBERATE_REVIEW_REQUIRED', title: 'Review a possible saving', message: 'A simulated saving needs your deliberate review. No switch is approved or started; these checked prices have no execution action.' }, aliases);
  } else if (run.status !== 'skipped') {
    appendEvent(watch, `${run.runId}:check-update`, { ...common, type: 'check-update', kind: run.status,
      status: frequency === 'weekly' ? 'pending-digest' : frequency === 'offers-only' ? 'suppressed' : 'prepared',
      reason: frequency === 'weekly' ? 'WEEKLY_DIGEST_PENDING' : frequency === 'offers-only' ? 'OFFERS_ONLY_POLICY' : 'DAILY_UPDATE',
      dueAt: frequency === 'weekly' ? weeklyDue(watch, run.recordedAt) : null,
      title: run.status === 'failed' ? 'Simulated rate check failed' : 'No qualifying simulated saving',
      message: run.status === 'failed' ? 'The simulated rate check failed. This is not a completed search or proof that no saving exists.' : 'A completed simulated search found no offer meeting the current saving minimum.' }, aliases);
  }
}
export function checkPriceWatch(value, { expected, fixture, recordedAt, aliases, provider = fixtureWatchProvider, expectedPreferenceVersion, expectedBooking, expectedPreferences, prepared, now = () => new Date(recordedAt) } = {}) {
  const state = initialisePriceWatch(value); const watch = state.priceWatch;
  const captured = expected ?? watch;
  const bookingVersion = captured.bookingVersion ?? state.booking.version;
  const intent = hash([watch.watchId ?? captured.watchId, captured.epoch, bookingVersion, dayAt(recordedAt)]);
  const known = watch.runs[intent];
  if (known) return { state, run: clone(known), replayed: true };
  if (Object.keys(watch.runs).length >= CAP) fail('WATCH_CAPACITY_REACHED', 'Price-watch records reached capacity.');
  let reason = null;
  if (captured.version !== watch.version || captured.epoch !== watch.epoch || captured.watchId !== watch.watchId) reason = 'WATCH_VERSION_CHANGED';
  else if (bookingVersion !== state.booking.version) reason = 'BOOKING_VERSION_CHANGED';
  else if (expectedBooking && hash(expectedBooking) !== hash(state.booking)) reason = 'BOOKING_FACTS_CHANGED';
  else if (expectedPreferenceVersion !== undefined && expectedPreferenceVersion !== state.preferences.version) reason = 'PREFERENCES_VERSION_CHANGED';
  else if (expectedPreferences && hash(expectedPreferences) !== hash(state.preferences)) reason = 'PREFERENCES_VERSION_CHANGED';
  else { const currentAt = now().toISOString(); const effective = eligibility(state, currentAt);
    if (effective.status !== 'active') reason = effective.reason;
    else if (dayAt(currentAt) !== dayAt(recordedAt)) reason = 'CHECK_DAY_CHANGED'; }
  const run = { runId: aliases.runId, day: dayAt(recordedAt), timeZone: ZONE, bookingVersion, epoch: captured.epoch,
    status: 'skipped', reasonCodes: reason ? [reason] : [], checkedAt: recordedAt, recordedAt: now().toISOString(),
    clockMode: 'actual-check', providerMode: 'simulated-fixture', providerProtocol: PROTOCOL,
    isSimulated: true, attemptCount: reason ? 0 : 1, searched: false, checkOffers: [] };
  if (!reason) {
    let outcome;
    try { outcome = prepared ?? provider({ booking: clone(state.booking), fixture, checkedAt: recordedAt, intent }); }
    catch { outcome = { status: 'failed', reason: 'PROVIDER_FAILED' }; }
    if (outcome instanceof Promise) throw new Error('Fixture watch provider must be synchronous and side-effect-free.');
    const committedAt = now().toISOString(); const fresh = eligibility(state, committedAt); run.recordedAt = committedAt;
    const cutoff = fresh.status !== 'active' ? fresh.reason : dayAt(committedAt) !== run.day ? 'CHECK_DAY_CHANGED' : null;
    if (cutoff) { run.status = 'skipped'; run.reasonCodes = [cutoff]; }
    else if (outcome?.status !== 'complete' || !Array.isArray(outcome.offers)) {
      run.status = 'failed'; run.reasonCodes = [outcome?.reason === 'SOURCE_UNAVAILABLE' ? 'SOURCE_UNAVAILABLE' : 'PROVIDER_FAILED'];
    } else {
      run.searched = true;
      const invalidReasons = [];
      for (const offer of outcome.offers) {
        const decision = evaluateOffer({ booking: state.booking, offer, preferences: state.preferences, agencyMinimumSavingMinor: fixture.agencyMinimumSavingMinor, approvals: [], now: committedAt });
        if (decision.action !== 'blocked') run.checkOffers.push(checkedOffer(offer, decision));
        else invalidReasons.push(...decision.reasons.filter(code => code !== 'SAVING_BELOW_MINIMUM'));
      }
      run.status = run.checkOffers.length ? 'offers-found' : 'no-saving';
      if (!run.checkOffers.length && invalidReasons.length) {
        run.status = 'failed'; run.searched = false;
        run.reasonCodes = [invalidReasons.every(code => code === 'OFFER_NOT_CURRENT') ? 'OFFER_NOT_CURRENT' : 'OFFER_FACTS_UNVERIFIED'];
      }
    }
  }
  routineEvent(state, run, aliases);
  watch.runs[intent] = clone(run); watch.lastCheck = clone(run);
  watch.bookingVersion = state.booking.version;
  return { state, run, replayed: false };
}
export function changePriceWatch(value, { body, idempotencyKey, visitorId, fixture, recordedAt, aliases, provider = fixtureWatchProvider, now = () => new Date(recordedAt) }) {
  let state = initialisePriceWatch(value); let watch = state.priceWatch;
  const receipt = watch.commands[idempotencyKey];
  if (receipt) {
    if (receipt.bodyHash !== bodyHash(body)) fail('IDEMPOTENCY_PAYLOAD_MISMATCH', 'This watch intent was used with different details.', 422);
    return { state, replayed: true };
  }
  if (idempotencyKey !== consentKey(visitorId, body)) fail('INVALID_IDEMPOTENCY_KEY', 'Use the saved price-watch intent key.', 422);
  if (body.bookingVersion !== state.booking.version) fail('BOOKING_VERSION_CHANGED', 'Reload the current booking before changing the watch.');
  if (body.watchVersion !== watch.version) fail('WATCH_VERSION_CHANGED', 'Reload the current price-watch consent.');
  if (body.enabled === watch.enabled) return { state, replayed: false };
  const commandCount = Object.keys(watch.commands).length;
  if (commandCount >= (body.enabled ? CAP - 1 : CAP)) fail('WATCH_CAPACITY_REACHED', 'Price-watch records reached capacity.');
  watch.enabled = body.enabled; watch.version++;
  if (body.enabled) {
    watch.watchId ??= aliases.watchId; watch.epoch++; watch.optedInAt = recordedAt; watch.bookingVersion = state.booking.version;
    const checked = checkPriceWatch(state, { expected: clone(watch), expectedPreferenceVersion: state.preferences.version, fixture, recordedAt, aliases, provider, now });
    state = checked.state; watch = state.priceWatch;
    appendEvent(watch, `${watch.epoch}:watch-confirmed`, { type: 'check-update', kind: 'watch-confirmed', status: 'prepared',
      bookingVersion: state.booking.version, createdAt: recordedAt, dueAt: null, frequency: state.preferences.notificationFrequency,
      reason: 'EXPLICIT_WATCH_CONSENT', title: 'Price watch saved',
      message: `Checks and preview alerts enabled. Initial simulated check: ${checked.run.status}. No switch permission was granted.` }, aliases);
  }
  watch.commands[idempotencyKey] = { bodyHash: bodyHash(body), version: watch.version, epoch: watch.epoch, recordedAt };
  state.revision++; state.updatedAt = recordedAt;
  return { state, replayed: false };
}
export function appendWatchOperationEvents(previous, value, { recordedAt, aliases, currencyMetadata }) {
  const state = initialisePriceWatch(value); const watch = state.priceWatch;
  if (!watch.enabled) return state;
  for (const operation of Object.values(state.operations ?? {})) {
    const before = previous.operations?.[operation.operationId];
    if (before?.revision === operation.revision) continue;
    const common = { bookingVersion: operation.bookingVersion, createdAt: recordedAt, dueAt: null, frequency: state.preferences.notificationFrequency, status: 'prepared', reason: 'SAVED_OPERATIONAL_EVENT' };
    const cancellationProven = operation.cancellation?.status === 'verified' && operation.cancellation.observations?.some(item => item.status === 'cancelled' && item.receiptId);
    if (operation.stage === 'cancellation-verified' && operation.savingSecured && cancellationProven && state.booking.version > operation.bookingVersion && operation.refund.status === 'pending') {
      appendEvent(watch, `${operation.operationId}:${operation.revision}:refund-pending`, { ...common, type: 'refund-progress', kind: 'refund-pending', title: 'Simulated refund pending', message: `Original cancellation verified; simulated refund ${formatWatchMoney({ totalMinor: operation.refund.amountMinor, currency: operation.refund.currency }, currencyMetadata)} is pending.` }, aliases, true);
    } else if (operation.stage === 'refund-completed' && operation.savingSecured && cancellationProven && operation.refund.status === 'completed') {
      appendEvent(watch, `${operation.operationId}:${operation.revision}:refund-completed`, { ...common, type: 'refund-progress', kind: 'refund-completed', title: 'Simulated refund completed', message: `Simulated refund ${formatWatchMoney({ totalMinor: operation.refund.amountMinor, currency: operation.refund.currency }, currencyMetadata)} completed after saved settlement.` }, aliases, true);
    } else if (operation.status === 'agency-exception') {
      const unknown = operation.cancellation?.status === 'unknown';
      const reasons = (operation.reasonCodes ?? []).filter(code => /^[A-Z_]{1,80}$/.test(code)).join(', ');
      appendEvent(watch, `${operation.operationId}:${operation.revision}:agency-attention`, { ...common, type: 'agency-attention', kind: 'agency-attention', title: unknown ? 'Cancellation needs attention' : 'Switch paused for agency review',
        message: unknown ? 'The simulated cancellation outcome is unknown. No refund or secured-saving claim follows from this event.' : `The simulated switch paused before cancellation. Agency review is needed for the saved reason: ${reasons || 'CURRENT_FACTS_OR_AUTHORITY_CHANGED'}. No cancellation outcome is recorded.` }, aliases, true);
    }
  }
  return state;
}
export function prepareWatchDigests(value, { recordedAt, aliases }) {
  const state = initialisePriceWatch(value); const watch = state.priceWatch;
  if (!watch.enabled) return state;
  const due = Object.entries(watch.events).filter(([, item]) => item.status === 'pending-digest' && Date.parse(item.dueAt) <= Date.parse(recordedAt));
  const groups = new Map();
  for (const [key, event] of due) {
    const group = groups.get(event.dueAt) ?? []; group.push(key); groups.set(event.dueAt, group);
  }
  for (const [dueAt, keys] of groups) appendEvent(watch, `digest:${dueAt}`, { type: 'check-update', kind: 'weekly-digest', status: 'prepared',
    bookingVersion: state.booking.version, createdAt: recordedAt, dueAt, frequency: 'weekly', reason: 'WEEKLY_DIGEST_DUE', title: 'Weekly simulated check digest', message: `${keys.length} saved simulated check updates are available. This preview has not been sent.` }, aliases);
  return state;
}
