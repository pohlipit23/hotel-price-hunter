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
  ready: ['We are checking the final price', 'Your current booking stays active while the demo checks this offer.'],
  revalidated: ['We are reserving the new room', 'The price and terms were checked. Your current booking stays active.'],
  'replacement-secured': ['We are verifying the new booking', 'The replacement was reserved in the demo. Your current booking stays active.'],
  'fulfilment-verified': ['We are cancelling the old booking', 'The new booking was verified in the demo. The old booking stays active until cancellation is confirmed.'],
  'cancellation-requested': ['Waiting for cancellation confirmation', 'A cancellation request was recorded in the demo. The result is not confirmed yet.'],
  'cancellation-verified': ['Your new stay is active', 'The old booking cancellation is confirmed in the demo. The refund is pending.'],
  'refund-completed': ['Your switch is complete', 'The demo marks the refund as complete. No real payment was made.']
};
const nextActions = {
  ready: 'Check simulated price', revalidated: 'Reserve simulated replacement',
  'replacement-secured': 'Verify simulated booking', 'fulfilment-verified': 'Request simulated cancellation',
  'cancellation-requested': 'Check simulated cancellation', 'cancellation-verified': 'Complete simulated refund'
};
const reasonCopy = {
  FULFILMENT_UNVERIFIED: 'The new booking could not be verified.',
  OFFER_MATERIAL_CHANGED: 'The offer details changed after review.',
  OFFER_APPROVAL_REQUIRED: 'Current approval is required for this offer.',
  STANDING_PERMISSION_REQUIRED: 'Saved switch permission is no longer current.',
  BOOKING_VERSION_CHANGED: 'The booking changed.', BOOKING_VERSION_MISMATCH: 'The offer no longer matches this booking.',
  PREFERENCES_VERSION_CHANGED: 'Saved stay requirements changed.', ENROLMENT_REQUIRED: 'Price watch permission is no longer active.',
  OFFER_NOT_CURRENT: 'The offer check is no longer current.', UNVERIFIED_OFFER_PRICE: 'The offer price could not be verified.',
  UNKNOWN_ESSENTIAL_CONDITION: 'An important room detail could not be verified.',
  ESSENTIAL_REQUIREMENT_MISMATCH: 'The offer does not meet a saved stay requirement.',
  UNKNOWN_EQUIVALENCE: 'The room details could not be verified.',
  CANCELLATION_WINDOW_EXPIRED: 'The free-cancellation deadline has passed.',
  UNKNOWN_CANCELLATION_POLICY: 'The cancellation terms could not be verified.',
  UNVERIFIED_REFUND_QUOTE: 'The refund after fees could not be verified.',
  SAVING_BELOW_MINIMUM: 'The verified saving is below the required minimum.',
  STAY_MISMATCH: 'The dates do not match this booking.', INVALID_STAY: 'The dates could not be verified.',
  OCCUPANCY_MISMATCH: 'The guest details do not match this booking.', UNKNOWN_OCCUPANCY: 'The guest details could not be verified.',
  MISSING_IDENTITY: 'The booking or hotel could not be verified.', MISSING_OFFER_IDENTITY: 'The offer could not be verified.',
  INVALID_PREFERENCES: 'Saved stay requirements could not be verified.', INVALID_CHECK_TIME: 'The check time could not be verified.',
  UNSUPPORTED_BOOKING_SCOPE: 'This booking cannot use the demo switch.'
};
let state, selectedOffer, lastOfferId, offerFilter = 'all', busy = false, refreshRequired = false;
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
function savingLabel(minor, currency = state?.currency?.code || 'USD') {
  if (!Number.isSafeInteger(minor) || minor <= 0) return 'Saving unavailable';
  const formatted = money(minor, currency);
  const amount = formatted.startsWith(currency + ' ') ? formatted.slice(currency.length + 1) : formatted;
  return '-' + amount + ' ' + currency;
}
function addStamp(target, minor, currency, label, className = '') {
  target.replaceChildren();
  target.className = 'saving-stamp' + (className ? ' ' + className : '');
  const formatted = money(minor, currency);
  const amount = formatted.startsWith(currency + ' ') ? formatted.slice(currency.length + 1) : formatted;
  target.setAttribute('role', 'img');
  target.setAttribute('aria-label', label + ' ' + savingLabel(minor, currency));
  target.append(node('span', label, 'stamp-label'), node('strong', '-' + amount, 'stamp-amount'), node('span', currency, 'stamp-currency'));
  target.hidden = false;
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
  return date(record.stay.checkin) + ' - ' + date(record.stay.checkout) + ' · ' + nights + ' nights';
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
function categoryKey(offer) {
  if (offer.offerId === 'DEMO_NON_REFUNDABLE') return 'nonref';
  if (offer.hotel.id !== state.booking.hotel.id) return 'hotel';
  if (offer.category === 'equivalent' && offer.equivalence === 'verified') return 'match';
  if (offer.category === 'different-room') return 'room';
  return 'unverified';
}
function categoryText(offer) {
  return ({ match: 'Same room', room: 'Other room', hotel: 'New hotel',
    nonref: offer.category === 'equivalent' && offer.equivalence === 'verified' ? 'Non-refundable · same room' : 'Non-refundable offer',
    unverified: 'Room details not verified' })[categoryKey(offer)];
}
function categoryIcon(key) {
  const paths = {
    match: 'M5 12l4 4L19 6',
    room: 'M3 11h18v8H3z M3 15h18 M7 11V7h5v4',
    hotel: 'M5 21V5h14v16 M8 8h2m4 0h2M8 12h2m4 0h2M10 21v-5h4v5',
    nonref: 'M12 3v18 M17 7H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6',
    meals: 'M4 3v7m4-7v7M4 6h4m-2 4v11m10-18v18m0-18c-2 1-3 4-3 7h3',
    cancellation: 'M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6l8-3Zm-3 9 2 2 4-4'
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[key] || paths.hotel);
  svg.append(path);
  return svg;
}
function categoryBadge(offer, className) {
  const badge = node('span', undefined, className + ' category-' + categoryKey(offer));
  badge.append(categoryIcon(categoryKey(offer)), node('span', categoryText(offer)));
  return badge;
}
function decisionText(codes = []) {
  return [...new Set(codes.map(code => reasonCopy[code] || 'A saved safety check could not be verified.'))].join(' ');
}
function pills(offer, includeRelationship = true) {
  const list = node('div', undefined, 'pills');
  if (includeRelationship) {
    const relationship = offer.hotel.id === state.booking.hotel.id ? 'Same hotel' : 'Different hotel';
    list.append(node('span', relationship, 'pill' + (relationship === 'Same hotel' ? ' positive' : '')));
    if (offer.category === 'equivalent' && offer.equivalence === 'verified') list.append(node('span', 'Same room', 'pill positive'));
    else if (offer.category === 'different-room') list.append(node('span', 'Other room', 'pill'));
  }
  const refundable = offer.cancellation?.refundability === 'refundable';
  list.append(node('span', refundable ? 'Refundable' : valueText(offer.cancellation?.refundability), 'pill' + (refundable ? ' positive' : ' warning')));
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
  const booking = state.booking;
  $('hotel').textContent = booking.hotel.name;
  const board = booking.room.conditions.boardBasis;
  $('room').textContent = roomText(booking) + (board === 'BREAKFAST' ? ' · Breakfast included' : '');
  $('stay').textContent = stayText(booking);
  $('guests').textContent = guestText(booking);
  $('booking-total').textContent = money(booking.retail.totalMinor, booking.retail.currency);
  $('booking-total-caption').textContent = 'Whole stay' + (booking.retail.includedInTotal === true ? ' · taxes included' : '');
  const operation = state.simulation?.operation;
  const photoIndex = operation?.savingSecured && operation.revalidatedOffer ? offerPhotoIndex(operation.revalidatedOffer) : 0;
  $('booking-photo').replaceChildren(stayPhoto(photoIndex));
  const best = customerOffers.map(id => state.offers.find(offer => offer.offerId === id)).filter(Boolean)
    .map(offer => ({ offer, saving: verifiedSaving(offer) })).filter(item => item.saving.available)
    .sort((a, b) => b.saving.minor - a.saving.minor)[0];
  const stamp = $('best-drop');
  if (best && !operation) addStamp(stamp, best.saving.minor, best.offer.refundQuote.currency, 'Best drop', 'featured-stamp');
  else stamp.hidden = true;
}
function offerCard(offer, index, compact = false, biggest = false) {
  const category = categoryKey(offer);
  const saving = verifiedSaving(offer);
  const quote = offer.refundQuote;
  const fees = quote && [quote.originalCancellationMinor, quote.switchFeesMinor, quote.refundProcessingMinor].every(Number.isSafeInteger)
    ? quote.originalCancellationMinor + quote.switchFeesMinor + quote.refundProcessingMinor : null;
  const article = node('article', undefined, 'offer-ticket' + (compact ? ' offer-compact' : ''));
  article.dataset.offer = offer.offerId;
  article.dataset.category = category;
  if (!compact) {
    const photo = node('div', undefined, 'offer-photo');
    photo.append(stayPhoto(offerPhotoIndex(offer)), node('span', 'Illustrative photo', 'photo-tag'));
    const tag = categoryBadge(offer, 'photo-category');
    photo.append(tag);
    if (saving.available) {
      const stamp = node('div', undefined, 'saving-stamp offer-stamp');
      stamp.id = 'offer-saving-' + offer.offerId;
      addStamp(stamp, saving.minor, quote.currency, biggest ? 'Biggest' : 'Price drop', 'offer-stamp' + (biggest ? ' biggest-stamp' : ''));
      photo.append(stamp);
    }
    article.append(photo);
  }
  const body = node('div', undefined, 'offer-body');
  if (compact) body.append(categoryBadge(offer, 'category-band'));
  const title = node('h3', offer.hotel.name);
  title.id = 'offer-title-' + offer.offerId;
  const room = node('p', roomText(offer), 'room-subline');
  const rates = node('div', undefined, 'offer-rates');
  rates.append(node('s', money(state.booking.retail.totalMinor, state.booking.retail.currency), 'old-rate'),
    node('span', '→', 'rate-arrow'), node('strong', money(offer.retail.totalMinor, offer.retail.currency), 'new-rate'));
  const detailText = !saving.available ? 'Saving unavailable · current terms need checking'
    : compact ? savingLabel(saving.minor, quote.currency) + ' · potential refund after ' + money(fees, quote.currency) + ' fees'
      : 'Potential refund after ' + money(fees, quote.currency) + ' fees';
  const detail = node('p', detailText, 'offer-caption');
  detail.id = 'offer-detail-' + offer.offerId;
  const refundable = offer.cancellation?.refundability === 'refundable';
  const conditionText = refundable ? 'Free cancellation' : offer.cancellation?.refundability === 'non-refundable'
    ? 'Non-refundable · no free cancellation' : 'Cancellation terms not verified';
  const condition = node('p', conditionText,
    'offer-condition' + (refundable ? '' : ' warning'));
  condition.id = 'offer-condition-' + offer.offerId;
  body.append(title, room, rates, detail, condition);
  article.append(body);
  const review = node('button', 'Review this drop', 'offer-action');
  review.type = 'button';
  review.dataset.offerId = offer.offerId;
  review.setAttribute('aria-describedby', [detail.id, condition.id, title.id, saving.available ? 'offer-saving-' + offer.offerId : ''].filter(Boolean).join(' '));
  review.disabled = busy || Boolean(pending) || !saving.available;
  review.addEventListener('click', () => select(offer));
  article.append(review);
  return article;
}
function applyOfferFilter() {
  const cards = [...$('offers').children];
  const visible = cards.filter(card => offerFilter === 'all' || card.dataset.category === offerFilter);
  cards.forEach(card => { card.hidden = !visible.includes(card); });
  const empty = $('offer-empty');
  const hasAnyOffers = cards.length > 0;
  $('offer-filters').hidden = !hasAnyOffers;
  if (!hasAnyOffers) empty.textContent = 'No better offers right now. Your current booking stays active.';
  else if (!visible.length) empty.textContent = 'No offers in this group right now.';
  empty.hidden = visible.length > 0;
  $('filter-status').textContent = visible.length + (visible.length === 1 ? ' offer shown.' : ' offers shown.');
}
function renderOffers() {
  const operation = state.simulation?.operation;
  const offers = customerOffers.map(id => state.offers.find(offer => offer.offerId === id)).filter(Boolean)
    .filter(offer => { const saving = verifiedSaving(offer); return saving.available && saving.minor > 0; });
  const biggest = offers.reduce((best, offer) => Math.max(best, verifiedSaving(offer).minor), 0);
  $('offers').replaceChildren(...offers.map((offer, index) => offerCard(offer, index, false, verifiedSaving(offer).minor === biggest)));
  $('changes-title').textContent = offers.length
    ? offers.length + ' cheaper ticket' + (offers.length === 1 ? '' : 's') + ' for the same trip'
    : 'No better offers right now';
  const lowerRate = state.offers.find(offer => offer.offerId === 'DEMO_NON_REFUNDABLE');
  const lowerSaving = lowerRate ? verifiedSaving(lowerRate) : { available: false };
  $('lower-rate').hidden = !lowerRate || !lowerSaving.available || lowerSaving.minor <= 0;
  $('lower-rate-offer').replaceChildren(...($('lower-rate').hidden ? [] : [offerCard(lowerRate, -1, true)]));
  $('deal-list').hidden = Boolean(operation);
  applyOfferFilter();
}
function factTile(label, value, iconKey, cue, className = '') {
  const tile = node('div', undefined, 'fact-tile' + (className ? ' ' + className : ''));
  const header = node('div', undefined, 'fact-head');
  const icon = node('span', undefined, 'fact-icon');
  icon.append(categoryIcon(iconKey));
  header.append(icon, node('span', cue, 'fact-cue'));
  tile.append(header, node('span', label, 'fact-label'), node('strong', value, 'fact-value'));
  return tile;
}
function renderComparison() {
  const offer = selectedOffer;
  if (!offer) return;
  const needsConsent = needsFlexibilityConsent(offer);
  const intent = offerIntent(offer);
  const currentKey = JSON.stringify([offer.offerId, offer.version, state.booking.version, state.preferences.version, intent?.materialFingerprint]);
  const matchingPending = pending?.kind === 'approval' && pending.body.offerId === offer.offerId && pending.key === intent?.idempotencyKey;
  if (acknowledgementKey !== currentKey) {
    $('accept-reduced-flexibility').checked = Boolean(matchingPending && pending.body.acceptReducedFlexibility === true);
    acknowledgementKey = currentKey;
  }
  $('flexibility-warning').hidden = !needsConsent;
  $('accept-reduced-flexibility').disabled = busy || refreshRequired || !verifiedSaving(offer).available;
  $('flexibility-watch-note').hidden = !state.priceWatch?.enabled;
  $('comparison-title').textContent = offer.hotel.name;
  $('comparison-pills').replaceChildren(...pills(offer).children);
  $('comparison-photo').replaceChildren(stayPhoto(offerPhotoIndex(offer)));
  const category = $('comparison-category');
  category.className = 'category-band category-' + categoryKey(offer);
  category.replaceChildren(categoryIcon(categoryKey(offer)), node('span', categoryText(offer)));
  $('after-room').textContent = roomText(offer);
  $('comparison-stay').textContent = stayText(offer);
  $('comparison-guests').textContent = guestText(offer);
  $('before-price').textContent = money(state.booking.retail.totalMinor, state.booking.retail.currency);
  $('after-price').textContent = money(offer.retail.totalMinor, offer.retail.currency);
  const saving = verifiedSaving(offer);
  const quote = offer.refundQuote;
  const fees = quote && [quote.originalCancellationMinor, quote.switchFeesMinor, quote.refundProcessingMinor].every(Number.isSafeInteger)
    ? quote.originalCancellationMinor + quote.switchFeesMinor + quote.refundProcessingMinor : null;
  $('switch-fees').textContent = Number.isSafeInteger(fees) ? money(fees, quote.currency) : 'Not verified';
  $('comparison-saving').textContent = saving.available ? savingLabel(saving.minor, quote.currency) : 'Saving unavailable';
  if (saving.available) addStamp($('comparison-saving-stamp'), saving.minor, quote.currency, 'You save', 'review-stamp');
  else {
    $('comparison-saving-stamp').replaceChildren(node('span', 'Saving unavailable', 'stamp-label'));
    $('comparison-saving-stamp').className = 'saving-stamp review-stamp saving-unavailable';
  }
  $('saving-caption').textContent = saving.available ? 'Calculated after listed fees · whole stay' : 'This offer cannot be approved until its price, terms and saving are verified.';

  const before = state.booking.room.conditions || {};
  const after = offer.room.conditions || {};
  const hotelMatch = state.booking.hotel.id === offer.hotel.id;
  const roomMatch = offer.category === 'equivalent' && offer.equivalence === 'verified';
  const mealsMatch = before.boardBasis != null && after.boardBasis != null && before.boardBasis === after.boardBasis;
  const currentCancel = state.booking.cancellation;
  const offeredCancel = offer.cancellation;
  const cancellationTermsMatch = currentCancel?.refundability === 'refundable' && offeredCancel?.refundability === 'refundable'
    && Boolean(currentCancel.freeUntil && offeredCancel.freeUntil && currentCancel.timeZone && offeredCancel.timeZone)
    && Array.isArray(currentCancel.schedule) && currentCancel.schedule.length > 0
    && Array.isArray(offeredCancel.schedule) && offeredCancel.schedule.length > 0
    && currentCancel.freeUntil === offeredCancel.freeUntil && currentCancel.timeZone === offeredCancel.timeZone
    && JSON.stringify(currentCancel.schedule) === JSON.stringify(offeredCancel.schedule);
  const board = after.boardBasis == null ? 'Not verified' : valueText(after.boardBasis);
  const cancel = offeredCancel?.refundability === 'refundable' ? 'Free cancellation'
    : offeredCancel?.refundability === 'non-refundable' ? 'No free cancellation' : 'Terms not verified';
  const roomCue = roomMatch ? 'Verified' : offer.category === 'different-room' ? 'Other room' : 'Review details';
  const mealsCue = mealsMatch ? 'Same' : before.boardBasis != null && after.boardBasis != null ? 'Changed' : 'Check details';
  const cancellationCue = cancellationTermsMatch ? 'Same terms' : offeredCancel?.refundability === 'refundable' ? 'Terms differ'
    : offeredCancel?.refundability === 'non-refundable' ? 'Less flexible' : 'Check details';
  $('change-facts-grid').replaceChildren(
    factTile('Hotel', offer.hotel.name, 'hotel', hotelMatch ? 'Same hotel' : 'New hotel', (hotelMatch ? 'fact-same' : 'fact-new') + ' fact-hotel'),
    factTile('Room', roomMatch ? 'Same room' : roomText(offer), roomMatch ? 'match' : 'room', roomCue,
      (roomMatch ? 'fact-same' : 'fact-change') + ' fact-room'),
    factTile('Meals', board, 'meals', mealsCue,
      (mealsMatch ? 'fact-same' : board === 'Not verified' ? 'fact-warning' : 'fact-change') + ' fact-meals'),
    factTile('Cancellation', cancel, 'cancellation', cancellationCue,
      (cancellationTermsMatch ? 'fact-same' : offeredCancel?.refundability === 'refundable' ? 'fact-change' : 'fact-warning') + ' fact-cancellation')
  );

  const differences = [];
  if (!hotelMatch) differences.push(['Hotel', state.booking.hotel.name + ' → ' + offer.hotel.name]);
  if (state.booking.room.name !== offer.room.name) differences.push(['Room', state.booking.room.name + ' → ' + offer.room.name]);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldValue = before[key], newValue = after[key];
    if (oldValue !== newValue) differences.push([labels[key] || key, valueText(oldValue) + ' → ' + valueText(newValue)]);
  }
  differences.push(['Current cancellation', deadline(state.booking)], ['Alternative cancellation', deadline(offer)]);
  if (quote) differences.push(['Price calculation', money(quote.originalRetailMinor, quote.currency) + ' minus ' + money(quote.replacementRetailMinor, quote.currency)
    + ' minus ' + money(fees, quote.currency) + ' fees = ' + (saving.available ? savingLabel(saving.minor, quote.currency) : 'saving unavailable')]);
  if (offer.decision?.reasons?.length) differences.push(['Checks', decisionText(offer.decision.reasons)]);
  $('differences').replaceChildren(...differences.flatMap(([key, value]) => [node('dt', key), node('dd', value)]));
  $('selected-checked').textContent = 'Fictional demo quote · not a live rate or a price hold.';
  $('review-message').textContent = message;
  $('review-message').classList.toggle('error', messageError);
  const consentMissing = needsConsent && !$('accept-reduced-flexibility').checked && !matchingPending;
  $('approve-offer').disabled = busy || refreshRequired || (!pending && !canApprove(offer)) || consentMissing || pending?.kind === 'advance' || pending?.kind === 'watch';
  $('approve-offer').textContent = busy ? 'Saving approval…' : pending?.kind === 'approval' ? 'Retry the same approval'
    : saving.available ? 'Approve switch ' + savingLabel(saving.minor, quote.currency) : 'Approval unavailable';
  const help = consentMissing ? 'Tick the box above to confirm the cancellation terms.'
      : !saving.available ? 'The current price and terms are not verified for approval.' : '';
  $('approve-help').textContent = help;
  $('approve-help').hidden = !help;
}
function operationCopy(operation) {
  const explanation = decisionText(operation.reasonCodes || []);
  if (operation.savingSecured && operation.refund?.status === 'pending') return ['Nice drop!', 'The new booking is active. The refund is pending in this demo.'];
  if (operation.savingSecured && operation.refund?.status === 'completed') return ['Nice drop!', 'The new booking is active. The refund is marked complete in this demo.'];
  if (operation.status === 'awaits-renewed-approval') return ['Price changed · review needed', 'The final price or terms changed. No replacement was booked and your current booking remains active. This demo cannot collect renewed approval for this switch.'];
  if (operation.status === 'failed') return ['Switch stopped safely', (explanation || 'A required check could not be completed.') + ' No replacement was booked and your current booking remains active.'];
  if (operation.status === 'agency-exception') {
    if (operation.cancellation?.status === 'unknown') return ['Hold on · cancellation not confirmed', 'The cancellation result is unknown. Your original booking remains active in the saved record. No saving is secured and no refund has started. Reload to see a verified update.'];
    return ['Switch paused · review needed', (explanation || 'A saved safety check needs review.') + ' The current booking details below show the latest saved state.'];
  }
  return stages[operation.stage] || ['Saved switch progress', 'The latest saved booking details are shown below.'];
}
function photoForStay(record) {
  if (record.hotel.id === 'DEMO_HOTEL_A' && record.room.name.toLowerCase().includes('premier')) return 2;
  if (record.hotel.id === 'DEMO_HOTEL_A') return 0;
  if (record.hotel.id === 'DEMO_HOTEL_B') return 3;
  if (record.room.name.toLowerCase().includes('premier')) return 2;
  return 1;
}
function trailItem(label, description, status) {
  const item = node('li', undefined, 'trail-item trail-' + status);
  if (status === 'current' || status === 'attention') item.setAttribute('aria-current', 'step');
  item.append(node('span', status === 'done' ? '✓' : status === 'attention' ? '!' : status === 'current' ? '•' : '·', 'trail-mark'),
    node('span', undefined, 'trail-copy'));
  item.lastElementChild.append(node('strong', label), node('span', description));
  return item;
}
function renderTrail(operation) {
  const stage = operation.stage;
  const status = operation.status;
  const unknown = operation.cancellation?.status === 'unknown';
  const doneBooking = ['fulfilment-verified', 'cancellation-requested', 'cancellation-verified', 'refund-completed'].includes(stage);
  const doneCancel = ['cancellation-verified', 'refund-completed'].includes(stage);
  const doneRefund = stage === 'refund-completed' || operation.refund?.status === 'completed';
  const needsReview = status === 'awaits-renewed-approval' || status === 'failed';
  const paused = status === 'agency-exception' && !unknown;
  const bookingStatus = needsReview ? 'attention' : paused ? 'attention' : doneBooking ? 'done' : 'current';
  const cancelStatus = unknown ? 'attention' : doneCancel ? 'done' : doneBooking ? 'current' : 'todo';
  const refundStatus = doneRefund ? 'done' : operation.refund?.status === 'pending' ? 'current' : 'todo';
  const refundDescription = operation.refund?.status === 'completed' ? 'Marked complete in this demo'
    : operation.refund?.status === 'pending' ? money(operation.refund.amountMinor, operation.refund.currency) + ' pending in this demo'
      : 'Not started';
  $('switch-trail').replaceChildren(
    trailItem('You approved this drop', 'Saved for this offer', 'done'),
    trailItem('Book and verify the new room', needsReview ? 'Price or safety check needs review' : doneBooking ? 'Verified in this demo' : 'In progress in this demo', bookingStatus),
    trailItem('Cancel the old booking', unknown ? 'Result not confirmed' : doneCancel ? 'Confirmed in this demo' : doneBooking ? 'In progress in this demo' : 'After the new room is verified', cancelStatus),
    trailItem('Refund', refundDescription, refundStatus)
  );
}
function renderSimulation() {
  const operation = state.simulation?.operation;
  $('simulated-switch').hidden = !operation;
  $('simulated-switch').setAttribute('aria-busy', String(busy));
  if (!operation) return;
  const secured = operation.savingSecured === true;
  $('simulated-switch').classList.toggle('switch-complete', secured);
  $('current-ticket').hidden = true;
  $('switch-from').hidden = secured;
  document.querySelector('.journey-arrow').hidden = secured;
  const copy = operationCopy(operation);
  $('switch-stage').textContent = copy[0];
  $('switch-explanation').textContent = copy[1];
  $('switch-progress-label').textContent = operation.status === 'running' ? 'Simulated switch' : 'Simulated switch · saved status';
  const stateLabel = operation.cancellation?.status === 'unknown' ? 'Hold on'
    : operation.status === 'failed' ? 'Stopped safely' : operation.status === 'agency-exception' || operation.status === 'awaits-renewed-approval' ? 'Review needed'
      : operation.status === 'complete' ? 'Done · simulated' : 'In progress · simulated';
  $('switch-state').textContent = stateLabel;
  $('switch-state').className = 'state-pill' + (operation.cancellation?.status === 'unknown' || operation.status === 'agency-exception'
    || operation.status === 'awaits-renewed-approval' ? ' state-warning' : '');

  const original = operation.originalBooking || state.booking;
  const target = operation.replacementBooking || operation.revalidatedOffer || state.offers.find(offer => offer.offerId === operation.offerId) || state.booking;
  const originalStillActive = state.booking.version === operation.bookingVersion;
  $('switch-from-status').textContent = originalStillActive ? 'still yours' : 'cancelled in demo';
  $('switch-from-photo').replaceChildren(stayPhoto(photoForStay(original), true));
  $('switch-from-hotel').textContent = original.hotel.name;
  $('switch-from-room').textContent = roomText(original) + ' · ' + stayText(original);
  $('switch-from-price').textContent = money(original.retail.totalMinor, original.retail.currency);
  $('switch-to-photo').replaceChildren(stayPhoto(photoForStay(target), true));
  $('switch-to-hotel').textContent = target.hotel.name;
  $('switch-to-room').textContent = roomText(target) + ' · ' + stayText(target);
  $('switch-to-price').textContent = money(target.retail.totalMinor, target.retail.currency);
  $('switch-to-status').textContent = operation.replacementBooking?.fulfilment?.status === 'simulated-fulfilled' ? 'verified in demo'
    : operation.replacementBooking ? 'reserved in demo' : 'being checked';
  const saving = operation.refund?.amountMinor;
  const stamp = $('switch-stamp');
  if (operation.cancellation?.status === 'unknown') {
    stamp.replaceChildren(node('strong', 'HOLD ON'));
    stamp.className = 'switch-stamp attention-stamp';
    stamp.hidden = false;
  } else if (operation.savingSecured && Number.isSafeInteger(saving)) {
    addStamp(stamp, saving, operation.refund.currency, 'Switched', 'switch-stamp');
  } else stamp.hidden = true;

  renderTrail(operation);
  $('switch-reassurance').hidden = secured;
  $('switch-reassurance').textContent = operation.cancellation?.status === 'unknown'
    ? 'The original booking remains active. No saving is secured and no refund has started.'
    : operation.savingSecured ? operation.refund?.status === 'completed'
      ? 'The new booking is active. The refund is marked complete in this demo.'
      : 'The new booking is active. The refund status is pending in this demo.'
      : operation.replacementBooking ? 'Your original booking remains active until its cancellation is confirmed.'
        : 'Your current booking remains active. No replacement has been reserved.';
  const refundText = operation.refund?.status === 'completed' ? 'Completed in this demo'
    : operation.refund?.status === 'pending' ? 'Pending in this demo' : 'Not started';
  $('switch-money').replaceChildren(
    node('dt', operation.savingSecured ? 'Drop after fees' : 'Potential drop after fees'),
    node('dd', Number.isSafeInteger(saving) && saving > 0 ? savingLabel(saving, operation.refund.currency) : 'Not verified'),
    node('dt', 'Refund'), node('dd', refundText)
  );
  const history = state.simulation.history || operation.history || [];
  $('switch-history').replaceChildren(...history.map(item => {
    const title = item.status === 'awaits-renewed-approval' ? 'Price changed during the check'
      : item.status === 'failed' ? 'Switch stopped safely'
        : stages[item.stage]?.[0] || 'Progress saved';
    const row = node('li');
    row.append(node('strong', title), node('p', item.status === 'awaits-renewed-approval'
      ? 'No replacement was reserved.' : 'Saved in this fictional demo.'));
    return row;
  }));
  const canRecover = operation.scenarioId === 'uncertain-cancellation' && operation.status === 'agency-exception' && operation.cancellation?.status === 'unknown';
  const canAdvance = operation.status === 'running' || canRecover;
  $('demo-controls').hidden = !canAdvance && pending?.kind !== 'advance';
  $('advance-demo').hidden = !canAdvance && pending?.kind !== 'advance';
  $('advance-demo').disabled = busy || refreshRequired || (!pending && !canAdvance) || pending?.kind === 'watch';
  $('advance-demo').textContent = busy ? 'Saving progress…' : refreshRequired ? 'Refresh to see latest progress' : pending ? 'Retry the same simulation step'
    : canRecover ? 'Check cancellation result in demo' : nextActions[operation.stage] || 'Advance simulated step';
  $('done-button').hidden = !operation.savingSecured;
  $('switch-message').textContent = message;
  $('switch-message').classList.toggle('error', messageError);
}
function renderState(next, overview = false) {
  state = { ...next, offers: next.offers.filter(offer => offer.bookingVersion === next.booking.version) };
  reconcilePending();
  $('content').hidden = false;
  const operation = state.simulation?.operation;
  const reviewInHistory = location.hash === '#comparison' || history.state?.view === 'review';
  const historyOfferId = history.state?.view === 'review' ? history.state.offerId : null;
  const reviewOfferId = pending?.kind === 'approval' ? pending.body.offerId : historyOfferId || state.selectedOfferId;
  const pendingApproval = pending?.kind === 'approval' && !operation;
  const showReview = pendingApproval || (!overview && reviewInHistory);
  selectedOffer = operation || !showReview ? undefined : state.offers.find(offer => offer.offerId === reviewOfferId);
  $('booking-summary').hidden = Boolean(selectedOffer);
  $('comparison').hidden = !selectedOffer;
  $('current-ticket').hidden = Boolean(operation);
  $('content').classList.toggle('has-switch', Boolean(operation));
  document.querySelectorAll('#customer-steps li').forEach((step, index) => {
    const current = operation ? 2 : selectedOffer ? 1 : 0;
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
    const next = await request('/api/selection', { offerId: offer.offerId, bookingVersion: state.booking.version });
    lastOfferId = offer.offerId;
    history.pushState({ view: 'review', offerId: offer.offerId }, '', '#comparison');
    renderState(next);
    $('price-details').open = false;
    $('comparison-title').focus(); window.scrollTo({ top: 0, behavior: 'instant' }); setStatus('');
  } catch (error) { setStatus(error.message, true); if (error.status === 409) await refreshLatest(); }
  finally { busy = false; if (state) renderState(state); }
}
function keepBooking() {
  if (busy || pending) return;
  const offerId = selectedOffer?.offerId || state?.selectedOfferId || lastOfferId;
  $('accept-reduced-flexibility').checked = false;
  acknowledgementKey = null;
  history.pushState({ view: 'booking' }, '', '#booking-summary');
  renderState(state, true);
  const trigger = [...document.querySelectorAll('[data-offer-id]')].find(element => element.dataset.offerId === offerId);
  (trigger || $('hotel')).focus();
  window.scrollTo({ top: 0, behavior: 'instant' });
  setStatus('');
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
    remember(null); watchMessage = command.body.enabled ? 'Price watch is on for this demo booking.' : 'Price watch stopped.';
    renderState(result, true); setStatus('');
    await refreshNotifications();
  } catch (error) {
    watchError = true;
    if (error.status === 409) {
      $('watch-consent-check').checked = false;
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
$('done-button').addEventListener('click', () => {
  $('switch-history-details').open = false;
  $('watch-title').focus();
  $('price-watch').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('watch-button').addEventListener('click', mutateWatch);
 $('watch-consent-check').addEventListener('change', () => {
  if (state) renderWatch(state, { busy, pending, refreshRequired, message: watchMessage, messageError: watchError, money, instant });
});
document.querySelectorAll('#offer-filters [data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    offerFilter = button.dataset.filter;
    document.querySelectorAll('#offer-filters [data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    applyOfferFilter();
  });
});
window.addEventListener('popstate', () => { if (state) renderState(state); });
async function bootstrap() {
  try {
    if (!['#comparison', '#booking-summary'].includes(location.hash)) history.replaceState({ view: 'booking' }, '', '#booking-summary');
    renderState(await request('/api/bootstrap?scenario=jury-booking'));
    setStatus('');
    await refreshNotifications();
  }
  catch (error) {
    setStatus('Cannot load the demo booking. ' + error.message, true);
    const retry = node('button', 'Try again', 'plain');
    retry.type = 'button'; retry.addEventListener('click', () => { retry.remove(); bootstrap(); });
    $('page-status').append(' ', retry);
  }
}
bootstrap();
