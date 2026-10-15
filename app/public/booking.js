/* RoomDrop postcard. Saved server facts and approvals are the only execution authority. */
'use strict';
import { refundPresentation } from './pricing.js';
import { stayPhoto, offerPhotoIndex } from './stay-photos.js';
import { renderWatch, renderNotificationPreviews } from './watch.js';
const $ = id => document.getElementById(id);
const customerOffers = ['DEMO_EQUIVALENT', 'DEMO_DIFFERENT_ROOM', 'DEMO_DIFFERENT_HOTEL'];
const pendingKey = 'roomdrop-selected-command-v1';
const labels = { boardBasis: 'Meals', bedType: 'Bed type', nonSmoking: 'Non-smoking', accessible: 'Accessible room', view: 'View', roomSizeSqm: 'Room size (m²)' };
const stages = {
  ready: ['Approval saved', 'Your original booking remains active. Check the final price before reserving the replacement.'],
  revalidated: ['Price and terms checked', 'Your original booking remains active. The replacement is ready to reserve.'],
  'replacement-secured': ['New booking reserved', 'Your original booking remains active. Verify the replacement before cancelling your original booking.'],
  'fulfilment-verified': ['New booking verified', 'Your original booking remains active until its cancellation is confirmed.'],
  'cancellation-requested': ['Waiting for cancellation', 'Your original booking remains active until the cancellation result is confirmed.'],
  'cancellation-verified': ['New booking active · refund pending', 'Original cancellation confirmed. Your refund has not arrived yet.'],
  'refund-completed': ['Refund completed', 'Your new booking is active.']
};
const nextActions = {
  ready: 'Check final price', revalidated: 'Reserve new booking', 'replacement-secured': 'Verify new booking',
  'fulfilment-verified': 'Request original cancellation', 'cancellation-requested': 'Check cancellation result',
  'cancellation-verified': 'Complete simulated refund'
};
let state, selectedOffer, lastOfferId, busy = false, refreshRequired = false;
let pending = loadPending();
let message = '', messageError = false;
let watchMessage = '', watchError = false, notifications = { notifications: [] };
let acknowledgementKey = null;
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function money(minor, currency = state?.currency?.code || 'USD') {
  if (!Number.isSafeInteger(minor)) return 'Not verified';
  const digits = state?.currency?.minorUnit ?? 2;
  return currency + ' ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: minor % (10 ** digits) ? digits : 0, maximumFractionDigits: digits }).format(minor / (10 ** digits));
}
function valueText(value) {
  if (value === null || value === undefined) return 'Not verified';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function instant(value, zone = 'UTC') {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not verified';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: zone }).format(new Date(value)) + ' (' + zone + ')';
}
function deadline(record) {
  const c = record.cancellation;
  return c.refundability === 'refundable' ? 'Free cancellation until ' + instant(c.freeUntil, c.timeZone)
    : c.refundability === 'non-refundable' ? 'Non-refundable' : 'Refundability not verified';
}
function stayText(record) {
  const date = value => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
  const nights = Math.round((Date.parse(record.stay.checkout) - Date.parse(record.stay.checkin)) / 86400000);
  return date(record.stay.checkin) + ' – ' + date(record.stay.checkout) + ' · ' + nights + ' nights';
}
function guestText(record) {
  const o = record.occupancy;
  return o.adults + ' adults' + (o.childAges.length ? ' + ' + o.childAges.length + (o.childAges.length === 1 ? ' child' : ' children') : '')
    + (o.infantAges.length ? ' + ' + o.infantAges.length + (o.infantAges.length === 1 ? ' infant' : ' infants') : '');
}
function roomText(record) { return record.room.name.split(',')[0]; }
function offerIntent(offer) { return state.simulation?.offerApprovalIntents?.[offer?.offerId]; }
function verifiedSaving(offer) {
  const refund = refundPresentation(offer);
  const intent = offerIntent(offer);
  return refund.available && intent && offer.bookingVersion === state.booking.version
    && (offer.cancellation?.refundability === 'refundable'
      || (offer.offerId === 'DEMO_NON_REFUNDABLE' && offer.cancellation?.refundability === 'non-refundable' && intent.acceptReducedFlexibility === true))
    ? refund : { available: false, minor: null };
}
function needsFlexibilityConsent(offer) { return offer?.cancellation?.refundability === 'non-refundable'; }
function canApprove(offer) {
  return verifiedSaving(offer).available && (!needsFlexibilityConsent(offer) || $('accept-reduced-flexibility').checked);
}
function pills(offer, includeRelationship = true) {
  const list = node('div', undefined, 'pills');
  if (includeRelationship) {
    const relationship = offer.hotel.id === state.booking.hotel.id ? 'Same hotel' : 'Different hotel';
    list.append(node('span', relationship, 'pill' + (relationship === 'Same hotel' ? ' positive' : '')));
    if (offer.category === 'equivalent' && offer.equivalence === 'verified') list.append(node('span', 'Equivalent room', 'pill positive'));
    else if (offer.category === 'different-room') list.append(node('span', 'Different room', 'pill'));
  }
  list.append(node('span', valueText(offer.cancellation.refundability), 'pill' + (offer.cancellation.refundability === 'refundable' ? ' positive' : '')));
  return list;
}
function loadPending() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(pendingKey));
    if (saved?.kind === 'approval' && typeof saved.body?.offerId === 'string' && /^[a-f0-9]{64}$/.test(saved.key || '')
      && Number.isSafeInteger(saved.body.bookingVersion) && saved.body.confirmed === true) return saved;
    if (saved?.kind === 'advance' && /^sim-[a-f0-9]{64}$/.test(saved.operationId || '') && Number.isSafeInteger(saved.body?.expectedOperationRevision)) return saved;
    if (saved?.kind === 'watch' && /^[a-f0-9]{64}$/.test(saved.key || '') && Number.isSafeInteger(saved.body?.bookingVersion)
      && saved.body.bookingVersion > 0 && Number.isSafeInteger(saved.body.watchVersion) && saved.body.watchVersion >= 0
      && typeof saved.body.enabled === 'boolean' && Object.keys(saved.body).length === 3) return saved;
  } catch { /* Browser storage is optional; retries remain exact in memory. */ }
  return null;
}
function remember(command) {
  pending = command;
  try { if (command) sessionStorage.setItem(pendingKey, JSON.stringify(command)); else sessionStorage.removeItem(pendingKey); }
  catch { /* Retain the exact command in memory. */ }
}
async function request(path, body, headers = {}) {
  const response = await fetch(path, body === undefined ? { credentials: 'same-origin' } : {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken, ...headers }, body: JSON.stringify(body)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('The result could not be read. Please try again.'); }
  if (!response.ok) {
    const error = new Error(data.error?.message || 'The service is unavailable. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}
function setStatus(text, error = false) {
  $('page-status').textContent = text;
  $('page-status').classList.toggle('error', error);
}
function reconcilePending() {
  if (!pending) return;
  if (pending.kind === 'watch') {
    const intent = state.priceWatch?.consentIntents?.[pending.body.enabled ? 'enable' : 'disable'];
    if (intent?.idempotencyKey !== pending.key) {
      remember(null); watchMessage = 'Latest saved watch state restored.'; watchError = false;
    }
    return;
  }
  const operation = state.simulation?.operation;
  if (operation) {
    const matches = pending.kind === 'approval' ? operation.operationId === 'sim-' + pending.key : operation.operationId === pending.operationId;
    if (!matches || pending.kind === 'approval' || operation.revision > pending.body.expectedOperationRevision) {
      remember(null); message = 'Latest saved progress restored.'; messageError = false;
    }
  } else if (pending.kind === 'advance' || offerIntent({ offerId: pending.body.offerId })?.idempotencyKey !== pending.key) {
    remember(null); message = 'The latest booking is shown. Review the current offer before approving.'; messageError = false;
  }
}
function renderBooking() {
  const b = state.booking;
  $('hotel').textContent = b.hotel.name;
  $('room').textContent = roomText(b) + (b.room.conditions.boardBasis === 'BREAKFAST' ? ' · Breakfast included' : '');
  $('stay').textContent = stayText(b);
  $('guests').textContent = guestText(b);
  $('booking-total').textContent = money(b.retail.totalMinor, b.retail.currency);
  const sourceOffer = state.simulation?.operation?.revalidatedOffer;
  const photoIndex = state.simulation?.operation?.savingSecured && sourceOffer ? offerPhotoIndex(sourceOffer) : 1;
  $('booking-photo').replaceChildren(stayPhoto(photoIndex));
}
function offerCard(offer, index) {
  const featured = index === 0 && offer.category === 'equivalent';
  const article = node('article', undefined, 'offer' + (featured ? ' featured' : ''));
  article.dataset.offer = offer.offerId;
  const sameHotel = offer.hotel.id === state.booking.hotel.id;
  const matchingRoom = offer.category === 'equivalent' && offer.equivalence === 'verified';
  const differentRoom = offer.category === 'different-room';
  const category = !sameHotel ? 'Different hotel' : matchingRoom ? 'Same hotel · Matches your room'
    : differentRoom ? 'Same hotel · Different room' : 'Same hotel · Review room details';
  article.dataset.category = !sameHotel ? 'hotel' : matchingRoom ? 'match' : differentRoom ? 'room' : 'unverified';
  const card = node(featured ? 'div' : 'button', undefined, 'offer-card');
  const body = node('div', undefined, 'offer-body');
  const refund = verifiedSaving(offer);
  const quote = offer.refundQuote;
  const feeMinor = quote && [quote.originalCancellationMinor, quote.switchFeesMinor, quote.refundProcessingMinor].every(Number.isSafeInteger)
    ? quote.originalCancellationMinor + quote.switchFeesMinor + quote.refundProcessingMinor : null;
  body.append(node('h3', offer.hotel.name), node('p', roomText(offer), 'room-subline'), pills(offer, false),
    node('strong', refund.available ? 'Save ' + money(refund.minor, offer.refundQuote?.currency) : 'Saving unavailable', 'offer-saving' + (refund.available ? '' : ' unavailable')),
    node('p', refund.available ? 'Potential refund after ' + money(feeMinor, quote.currency) + ' fees' : 'Current conditions need verification', 'offer-caption'));
  card.append(stayPhoto(offerPhotoIndex(offer)), body);
  const review = featured ? node('button', 'Review saving', 'primary') : card;
  review.type = 'button'; review.dataset.offerId = offer.offerId;
  review.setAttribute('aria-label', 'Review saving at ' + offer.hotel.name + ', ' + roomText(offer) + '. ' + category);
  review.disabled = busy || Boolean(pending);
  review.addEventListener('click', () => select(offer));
  if (!featured) {
    const arrow = node('span', '›', 'offer-arrow'); arrow.setAttribute('aria-hidden', 'true'); card.append(arrow);
    card.append(node('span', 'Review saving', 'sr-only'));
  }
  article.append(node('p', category, 'offer-category'), card);
  if (featured) article.append(review);
  return article;
}
function renderOffers() {
  const offers = customerOffers.map(id => state.offers.find(offer => offer.offerId === id)).filter(Boolean);
  $('offers').replaceChildren(...offers.map(offerCard));
  if (!offers.length) $('offers').append(node('p', 'There are no fresh alternatives for your current booking.', 'empty-offers'));
  const lowerRate = state.offers.find(offer => offer.offerId === 'DEMO_NON_REFUNDABLE');
  $('lower-rate').hidden = !lowerRate;
  $('lower-rate-offer').replaceChildren(...(lowerRate ? [offerCard(lowerRate, -1)] : []));
  document.querySelector('.alternatives').hidden = Boolean(state.simulation?.operation) && !state.simulation.operation.savingSecured;
}
function renderComparison() {
  const offer = selectedOffer;
  const needsConsent = needsFlexibilityConsent(offer);
  const intent = offerIntent(offer);
  const currentKey = JSON.stringify([offer.offerId, offer.version, state.booking.version, state.preferences.version, intent?.materialFingerprint]);
  if (acknowledgementKey !== currentKey) {
    $('accept-reduced-flexibility').checked = false;
    acknowledgementKey = currentKey;
  }
  $('flexibility-warning').hidden = !needsConsent;
  $('accept-reduced-flexibility').disabled = busy || refreshRequired || !verifiedSaving(offer).available;
  $('comparison-title').textContent = offer.hotel.name;
  $('comparison-pills').replaceChildren(...pills(offer).children);
  $('comparison-photo').replaceChildren(stayPhoto(offerPhotoIndex(offer)));
  $('after-room').textContent = roomText(offer);
  $('comparison-stay').textContent = stayText(offer);
  $('comparison-guests').textContent = guestText(offer);
  $('before-price').textContent = money(state.booking.retail.totalMinor, state.booking.retail.currency);
  $('after-price').textContent = money(offer.retail.totalMinor, offer.retail.currency);
  $('after-price-label').textContent = 'New rate';
  $('selected-summary').textContent = needsConsent ? 'Free cancellation ends with this rate.'
    : offer.category === 'equivalent' ? 'Breakfast & cancellation deadline unchanged.'
    : offer.category === 'different-room' ? 'Room changes · Check details below.'
      : 'Hotel changes · Check details below.';
  const refund = verifiedSaving(offer);
  $('comparison-saving').textContent = refund.available ? '-' + money(refund.minor, offer.refundQuote?.currency) : 'Unavailable';
  $('saving-box').classList.toggle('unavailable', !refund.available);
  const quote = offer.refundQuote;
  const fees = quote && [quote.originalCancellationMinor, quote.switchFeesMinor, quote.refundProcessingMinor].every(Number.isSafeInteger)
    ? quote.originalCancellationMinor + quote.switchFeesMinor + quote.refundProcessingMinor : null;
  $('saving-caption').textContent = refund.available ? 'Potential refund after ' + money(fees, quote.currency) + ' fees' : 'This offer cannot be approved with the current verified facts.';
  const differences = [];
  if (state.booking.hotel.id !== offer.hotel.id) differences.push(['Hotel', state.booking.hotel.name + ' → ' + offer.hotel.name]);
  if (state.booking.room.name !== offer.room.name) differences.push(['Room', state.booking.room.name + ' → ' + offer.room.name]);
  for (const key of new Set([...Object.keys(state.booking.room.conditions), ...Object.keys(offer.room.conditions)])) {
    const before = state.booking.room.conditions[key], after = offer.room.conditions[key];
    differences.push([labels[key] || key, before === after ? valueText(after) : valueText(before) + ' → ' + valueText(after)]);
  }
  differences.push(['Current cancellation', deadline(state.booking)], ['Alternative cancellation', deadline(offer)]);
  if (quote) differences.push(['Price calculation', money(quote.originalRetailMinor, quote.currency) + ' − ' + money(quote.replacementRetailMinor, quote.currency) + ' − ' + money(fees, quote.currency) + ' fees = ' + (refund.available ? money(refund.minor, quote.currency) + ' potential refund' : 'no verified saving')]);
  if (offer.decision?.reasons?.length) differences.push(['Checks', offer.decision.reasons.map(valueText).join(' · ')]);
  $('differences').replaceChildren(...differences.flatMap(([key, value]) => [node('dt', key), node('dd', value)]));
  $('selected-checked').textContent = 'Simulated check: ' + instant(offer.checkedAt) + ' · Offer expires ' + instant(offer.expiresAt) + '.';
  $('review-message').textContent = message;
  $('review-message').classList.toggle('error', messageError);
  $('approve-offer').disabled = busy || refreshRequired || (!pending && !canApprove(offer))
    || (needsConsent && !$('accept-reduced-flexibility').checked) || pending?.kind === 'advance';
  if (pending?.kind === 'watch') $('approve-offer').disabled = true;
  $('approve-offer').textContent = busy ? 'Saving approval…' : pending?.kind === 'approval' ? 'Retry the same approval' : 'Approve simulated switch';
}
function operationCopy(operation) {
  const reasons = {
    FULFILMENT_UNVERIFIED: 'The replacement fulfilment could not be verified.',
    OFFER_MATERIAL_CHANGED: 'The offer facts or recorded approval are no longer current.',
    OFFER_APPROVAL_REQUIRED: 'Current approval for this offer is required.',
    STANDING_PERMISSION_REQUIRED: 'Current permission for the switch is required.',
    BOOKING_VERSION_CHANGED: 'Your booking has changed.',
    BOOKING_VERSION_MISMATCH: 'The offer no longer matches your current booking.',
    PREFERENCES_VERSION_CHANGED: 'Your saved stay requirements have changed.',
    ENROLMENT_REQUIRED: 'Price watch permission is no longer active.',
    OFFER_NOT_CURRENT: 'The offer check has expired or is no longer current.',
    UNVERIFIED_OFFER_PRICE: 'The offer price could not be verified.',
    UNKNOWN_ESSENTIAL_CONDITION: 'An essential room condition could not be verified.',
    ESSENTIAL_REQUIREMENT_MISMATCH: 'The offer does not meet your essential stay requirements.',
    UNKNOWN_EQUIVALENCE: 'Room equivalence could not be verified.',
    CANCELLATION_WINDOW_EXPIRED: 'The original free-cancellation window has ended.',
    UNKNOWN_CANCELLATION_POLICY: 'The cancellation terms could not be verified.',
    UNVERIFIED_REFUND_QUOTE: 'The refund after fees could not be verified.',
    SAVING_BELOW_MINIMUM: 'The verified saving is below the required minimum.',
    STAY_MISMATCH: 'The offer dates do not match your booking.',
    INVALID_STAY: 'The stay dates could not be verified.',
    OCCUPANCY_MISMATCH: 'The offer guests do not match your booking.',
    UNKNOWN_OCCUPANCY: 'The guest details could not be verified.',
    MISSING_IDENTITY: 'The booking or hotel identity could not be verified.',
    MISSING_OFFER_IDENTITY: 'The offer identity could not be verified.',
    INVALID_PREFERENCES: 'Your saved stay requirements could not be verified.',
    INVALID_CHECK_TIME: 'The time of the safety check could not be verified.',
    UNSUPPORTED_BOOKING_SCOPE: 'This booking cannot use the simulated switch.'
  };
  const explanation = [...new Set((operation.reasonCodes || []).map(code => reasons[code] || 'A saved safety check could not be verified.'))].join(' ');
  if (operation.status === 'awaits-renewed-approval') return ['Offer changed · review needed', (explanation || 'The final price or conditions changed.') + ' The switch stopped before a replacement or cancellation.'];
  if (operation.status === 'failed') return ['Switch stopped safely', (explanation || 'Current checks do not support this switch.') + ' Your saved progress is preserved.'];
  if (operation.status === 'agency-exception') {
    if (operation.cancellation?.status === 'unknown') return ['Cancellation uncertain · agency review', 'Your original booking remains active. Its cancellation result is unknown; no saving is secured and no refund has started.'];
    return ['Switch paused · agency review', (explanation || 'The current safety checks require agency review.') + ' Your original booking remains active; no refund has started.'];
  }
  return stages[operation.stage] || ['Saved switch progress', 'Review the latest saved state before continuing.'];
}
function renderSimulation() {
  const operation = state.simulation?.operation;
  $('switch-message').textContent = message; $('switch-message').classList.toggle('error', messageError);
  $('simulated-switch').hidden = !operation;
  $('simulated-switch').setAttribute('aria-busy', String(busy));
  if (!operation) return;
  const copy = operationCopy(operation);
  $('switch-stage').textContent = copy[0]; $('switch-explanation').textContent = copy[1];
  $('switch-progress-label').textContent = ['running', 'complete'].includes(operation.status) ? 'Demo switch' : 'Demo switch · Needs attention';
  const refund = operation.refund;
  const amount = money(refund?.amountMinor, refund?.currency);
  const refundStatus = refund?.status === 'completed' ? amount + ' · completed (simulated)' : refund?.status === 'pending' ? amount + ' · pending' : 'Not started';
  $('switch-money').replaceChildren(node('dt', operation.savingSecured ? 'Saving secured · simulated' : 'Potential refund after fees'), node('dd', amount), node('dt', 'Refund'), node('dd', refundStatus));
  if (state.booking.cancellation?.refundability === 'non-refundable' && state.monitoring?.status === 'ended') {
    $('switch-money').append(node('dt', 'Normal price monitoring'), node('dd', 'Ended · non-refundable booking'));
  }
  $('switch-history').replaceChildren(...(state.simulation.history || operation.history || []).map(item => {
    const row = node('li'); row.append(node('strong', operationCopy(item)[0]), node('p', item.message), node('time', instant(item.demoAt))); return row;
  }));
  const canRecover = operation.scenarioId === 'uncertain-cancellation' && operation.status === 'agency-exception' && operation.cancellation?.status === 'unknown';
  const canAdvance = operation.status === 'running' || canRecover;
  $('advance-demo').hidden = operation.status === 'complete';
  $('advance-demo').disabled = busy || refreshRequired || (!pending && !canAdvance) || pending?.kind === 'watch';
  $('advance-demo').textContent = busy ? 'Saving progress…' : refreshRequired ? 'Refresh to see latest progress' : pending ? 'Retry the same simulation step'
    : operation.status === 'complete' ? 'Refund complete' : !canAdvance ? 'Switch paused' : canRecover ? 'Check cancellation result' : nextActions[operation.stage] || 'Continue simulation';
  $('switch-message').textContent = message; $('switch-message').classList.toggle('error', messageError);
}
function renderState(next, overview = false) {
  state = { ...next, offers: next.offers.filter(offer => offer.bookingVersion === next.booking.version) };
  reconcilePending();
  $('content').hidden = false;
  selectedOffer = overview || state.simulation?.operation ? undefined : state.offers.find(offer => offer.offerId === (pending?.kind === 'approval' ? pending.body.offerId : state.selectedOfferId));
  $('booking-summary').hidden = Boolean(selectedOffer);
  $('comparison').hidden = !selectedOffer;
  $('content').classList.toggle('has-switch', Boolean(state.simulation?.operation));
  document.querySelectorAll('#customer-steps li').forEach((step, index) => {
    const current = state.simulation?.operation ? 2 : selectedOffer ? 1 : 0;
    if (index === current) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
    step.classList.toggle('passed', index < current);
  });
  renderBooking(); renderOffers();
  if (selectedOffer) renderComparison();
  renderSimulation();
  renderWatch(state, { busy, pending, refreshRequired, message: watchMessage, messageError: watchError, money, instant });
  $('close-comparison').setAttribute('aria-disabled', String(busy || Boolean(pending)));
  $('keep-booking').disabled = busy || Boolean(pending);
}
async function select(offer) {
  if (busy || pending || state.simulation?.operation) return;
  busy = true; renderOffers();
  message = ''; messageError = false;
  try {
    renderState(await request('/api/selection', { offerId: offer.offerId, bookingVersion: state.booking.version }));
    lastOfferId = offer.offerId;
    $('price-details').open = false;
    $('comparison-title').focus(); window.scrollTo({ top: 0, behavior: 'instant' }); setStatus('');
  } catch (error) { setStatus(error.message, true); if (error.status === 409) await refreshLatest(); }
  finally { busy = false; if (state) renderState(state); }
}
function keepBooking() {
  if (busy || pending) return;
  $('accept-reduced-flexibility').checked = false;
  acknowledgementKey = null;
  $('comparison').hidden = true; $('booking-summary').hidden = false;
  const trigger = [...document.querySelectorAll('[data-offer-id]')].find(element => element.dataset.offerId === (lastOfferId || selectedOffer?.offerId));
  trigger?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); setStatus('');
}
async function refreshLatest(overview = false) {
  try { renderState(await request('/api/bootstrap?scenario=jury-booking'), overview); }
  catch { refreshRequired = true; message = 'Could not refresh the latest saved state. Refresh this page before continuing.'; }
}
async function mutate(kind) {
  if (busy || refreshRequired) return;
  if (kind === 'approval' && needsFlexibilityConsent(selectedOffer) && !$('accept-reduced-flexibility').checked) return;
  let command = pending;
  if (!command && kind === 'approval') {
    const intent = offerIntent(selectedOffer);
    if (!intent || !canApprove(selectedOffer)) return;
    const { idempotencyKey, ...body } = intent;
    command = { kind, body, key: idempotencyKey };
  } else if (!command && kind === 'advance') {
    const operation = state.simulation?.operation;
    if (!operation || $('advance-demo').disabled) return;
    command = { kind, operationId: operation.operationId, body: { expectedOperationRevision: operation.revision } };
  }
  if (!command || command.kind !== kind) return;
  let announceAdvance = false;
  if (kind === 'advance') $('switch-announcement').textContent = '';
  remember(command); busy = true; message = ''; messageError = false; renderState(state);
  try {
    const path = kind === 'approval' ? '/api/offer-approvals' : '/api/switches/' + encodeURIComponent(command.operationId) + '/advances';
    const result = await request(path, command.body, kind === 'approval' ? { 'Idempotency-Key': command.key } : {});
    announceAdvance = kind === 'advance' && !result.replayed;
    remember(null); message = result.replayed ? 'Already saved. Latest progress is shown.' : '';
    renderState(result); setStatus('');
    await refreshNotifications();
    if (kind === 'approval') { $('switch-history-details').open = false; $('switch-stage').focus(); }
  } catch (error) {
    messageError = true;
    if (error.status === 409) {
      remember(null); acknowledgementKey = null; await refreshLatest();
      if (!refreshRequired) message = 'The booking, offer or saved progress changed. Latest values are shown. Review them before continuing.';
    } else if (error.status && error.status < 500) {
      remember(null); message = error.message;
    } else message = 'The result could not be confirmed. Retry this same action or refresh to see saved progress.';
    if (!selectedOffer && !state.simulation?.operation) setStatus(message, true);
  } finally {
    busy = false; renderState(state);
    if (kind === 'advance') {
      const nextAction = $('advance-demo');
      if (nextAction.disabled) $('switch-stage').focus();
      else {
        nextAction.focus();
        if (announceAdvance) $('switch-announcement').textContent = operationCopy(state.simulation.operation)[0] + '.';
      }
    }
  }
}
async function refreshNotifications() {
  try {
    notifications = await request('/api/notifications?limit=20');
    renderNotificationPreviews(notifications, { instant });
  } catch {
    renderNotificationPreviews(notifications, { instant, error: 'Saved update previews could not be refreshed. Reload to try again.' });
  }
}
async function mutateWatch() {
  if (busy || refreshRequired || $('watch-button').disabled) return;
  let command = pending;
  if (!command) {
    const intent = state.priceWatch?.consentIntents?.[state.priceWatch.enabled ? 'disable' : 'enable'];
    if (!intent) return;
    command = { kind: 'watch', body: { ...intent.body }, key: intent.idempotencyKey };
  }
  if (command.kind !== 'watch') return;
  remember(command); busy = true; watchMessage = ''; watchError = false; renderState(state, true);
  try {
    const result = await request('/api/price-watch', command.body, { 'Idempotency-Key': command.key });
    remember(null); renderState(result, true); watchMessage = ''; setStatus('');
    await refreshNotifications();
  } catch (error) {
    watchError = true;
    if (error.status === 409) {
      remember(null); await refreshLatest(true);
      watchMessage = refreshRequired ? 'Could not refresh saved watch state. Reload before continuing.' : 'The booking or watch changed. Latest values are shown; review them before trying again.';
    } else if (error.status && error.status < 500) {
      remember(null); watchMessage = error.message;
    } else watchMessage = 'The watch result could not be confirmed. Retry the same action or reload to see saved state.';
  } finally { busy = false; renderState(state, true); }
}
$('close-comparison').addEventListener('click', event => { event.preventDefault(); keepBooking(); });
$('keep-booking').addEventListener('click', keepBooking);
$('approve-offer').addEventListener('click', () => mutate('approval'));
$('accept-reduced-flexibility').addEventListener('change', () => { if (selectedOffer) renderComparison(); });
$('advance-demo').addEventListener('click', () => mutate('advance'));
$('watch-button').addEventListener('click', mutateWatch);
async function bootstrap() {
  try { renderState(await request('/api/bootstrap?scenario=jury-booking')); setStatus(''); await refreshNotifications(); }
  catch (error) {
    setStatus('Cannot load the demo booking. ' + error.message, true);
    const retry = node('button', 'Try again', 'plain');
    retry.type = 'button'; retry.addEventListener('click', () => { retry.remove(); bootstrap(); });
    $('page-status').append(' ', retry);
  }
}
bootstrap();
