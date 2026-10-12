/* Public jury UI. Server facts and authority remain the source of truth. */
'use strict';
const $ = id => document.getElementById(id);
const labels = { boardBasis: 'Meals', bedType: 'Bed type', nonSmoking: 'Non-smoking', accessible: 'Accessible room', view: 'View', roomSizeSqm: 'Room size (m²)' };
const requirementChoices = {
  boardBasis: [['BREAKFAST', 'Breakfast included'], ['ROOM_ONLY', 'Room only'], ['HALF_BOARD', 'Breakfast and one main meal'], ['FULL_BOARD', 'All meals included'], ['ALL_INCLUSIVE', 'All inclusive']],
  bedType: [['KING', 'King bed'], ['QUEEN', 'Queen bed'], ['DOUBLE', 'Double bed'], ['TWIN', 'Twin beds'], ['SINGLE', 'Single bed']],
  view: [['CITY', 'City view'], ['SEA', 'Sea view'], ['GARDEN', 'Garden view'], ['POOL', 'Pool view']]
};
const categoryCopy = {
  equivalent: ['Same hotel · equivalent room', 'Keep your stay. Pay less.'],
  'different-room': ['Same hotel · a different room', 'A different room, a lower total.'],
  'different-hotel': ['A different hotel', 'Another hotel. Another option.']
};
let state;
let selectedOffer;
let lastFocus;
let busy = false;

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function money(minor, currency = state?.currency?.code || 'USD') {
  if (!Number.isSafeInteger(minor)) return 'Not verified';
  const digits = state?.currency?.minorUnit ?? 2;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: minor % (10 ** digits) ? digits : 0, maximumFractionDigits: digits }).format(minor / (10 ** digits));
}
function valueText(value) {
  if (value === null || value === undefined) return 'Not verified';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function instant(value, zone) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not verified';
  return `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: zone || 'UTC' }).format(new Date(value))} (${zone || 'UTC'})`;
}
function deadline(record) {
  const c = record.cancellation;
  if (c.refundability === 'non-refundable') return 'Non-refundable · cancellation flexibility is lost';
  if (c.refundability === 'unknown') return 'Refundability not verified';
  return `Free cancellation until ${instant(c.freeUntil, c.timeZone)}`;
}
function errorMessage(error) { return error?.message || 'Something went wrong. Your booking is unchanged. Please try again.'; }
async function request(path, body) {
  const response = await fetch(path, body === undefined ? { credentials: 'same-origin' } : {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken }, body: JSON.stringify(body)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('The service returned an unreadable response. Please try again.'); }
  if (!response.ok) {
    const error = new Error(data.error?.message || `Service unavailable (${response.status}). Please try again.`);
    error.status = response.status; error.code = data.error?.code;
    throw error;
  }
  return data;
}
function setStatus(text, error = false) {
  $('page-status').textContent = text;
  $('page-status').classList.toggle('error', error);
}
function renderBooking() {
  const b = state.booking;
  $('stay').textContent = `${b.stay.checkin} → ${b.stay.checkout} · ${b.occupancy.adults} adults${b.occupancy.childAges.length ? ` + ${b.occupancy.childAges.length} child (age ${b.occupancy.childAges.join(', ')})` : ''}${b.occupancy.infantAges.length ? ` + ${b.occupancy.infantAges.length} infant` : ''}`;
  $('hotel').textContent = b.hotel.name;
  $('room').textContent = `${b.room.name} · ${valueText(b.room.conditions.roomSizeSqm)} m²`;
  $('booking-total').textContent = money(b.retail.totalMinor, b.retail.currency);
  $('booking-features').replaceChildren(node('span', valueText(b.room.conditions.boardBasis), 'chip'), node('span', valueText(b.cancellation.refundability), 'chip positive'));
  $('deadline').textContent = deadline(b);
  $('demo-time').textContent = `Demo time: ${instant(state.demoNow, 'UTC')}. Fictional checks, not live searches.`;
  const p = state.preferences;
  $('enrolment-summary').textContent = state.enrolled ? `Preferences saved · ${valueText(p.notificationFrequency)} updates · minimum refund ${money(p.minimumSavingMinor)}. ${p.automaticEquivalentSwitches ? 'Equivalent-only permission confirmed.' : 'Automatic switches are off.'}` : 'Set your essentials and decide how we should look for savings.';
  $('edit-preferences').textContent = state.enrolled ? 'Edit my price watch ↗' : 'Set up price watch ↗';
}
function differenceEntries(offer) {
  const b = state.booking;
  const differences = [];
  if (b.hotel.id !== offer.hotel.id) differences.push(['Hotel', `${b.hotel.name} → ${offer.hotel.name}`]);
  if (b.room.name !== offer.room.name) differences.push(['Room', `${b.room.name} → ${offer.room.name}`]);
  for (const key of new Set([...Object.keys(b.room.conditions), ...Object.keys(offer.room.conditions)])) {
    const oldValue = b.room.conditions[key];
    const newValue = offer.room.conditions[key];
    if (newValue === null || newValue === undefined || oldValue !== newValue) differences.push([labels[key] || key, `${valueText(oldValue)} → ${valueText(newValue)}`]);
  }
  differences.push(['Cancellation', deadline(offer)]);
  if (offer.cancellation.freeUntil !== b.cancellation.freeUntil && offer.cancellation.refundability === 'refundable') differences.push(['Original cancellation deadline', instant(b.cancellation.freeUntil, b.cancellation.timeZone)]);
  return differences;
}
function authorityText(offer) {
  if (offer.decision?.action === 'blocked') return 'Switch blocked: some required facts or conditions are not verified or do not match. Check the reasons below.';
  if (offer.decision?.action === 'automatic') return offer.decision.authority === 'offer-approval' ? 'Separate offer permission is recorded. No transaction happens in this milestone.' : 'Qualifies under confirmed equivalent-only permission. No transaction happens in this milestone.';
  return 'Separate permission is required before a switch. Selecting or discussing this offer gives no permission.';
}
function offerCard(offer, index) {
  const article = node('article', undefined, 'proposal');
  article.dataset.offer = offer.offerId;
  const copy = categoryCopy[offer.category] || ['Offer', 'Compare this offer.'];
  const nonRefundable = offer.cancellation.refundability === 'non-refundable';
  article.append(node('p', `${String(index + 1).padStart(2, '0')} · ${copy[0]}`, 'type'), node('h3', nonRefundable ? 'Lower price. Less flexibility.' : copy[1]));
  const differences = differenceEntries(offer);
  const description = offer.equivalence === 'verified' && differences.length === 1 ? 'Same hotel, verified equivalent room, guests and cancellation deadline.' : `${offer.hotel.name} · ${offer.room.name}. ${differences.filter(([key]) => key !== 'Cancellation').map(([key, value]) => `${key}: ${value}`).join('. ')}`;
  article.append(node('p', description, 'detail'));
  const chips = node('div', undefined, 'chips');
  chips.append(node('span', valueText(offer.cancellation.refundability), `chip ${nonRefundable ? 'tradeoff' : 'positive'}`));
  if (offer.decision?.action === 'blocked') chips.append(node('span', 'Required facts unresolved · switch blocked', 'chip tradeoff'));
  if (offer.category !== 'equivalent' || nonRefundable) chips.append(node('span', 'Separate approval required', 'chip'));
  article.append(chips);
  const row = node('div', undefined, 'moneyrow');
  const saving = node('div', money(offer.decision?.netSavingMinor ?? offer.refundQuote?.netSavingMinor, offer.refundQuote?.currency), 'saving');
  saving.append(node('small', 'potential refund after fees'));
  const button = node('button', 'Compare this offer ↗', 'review');
  button.type = 'button';
  button.setAttribute('aria-label', `Compare ${offer.hotel.name}, ${offer.room.name}, ${valueText(offer.cancellation.refundability)}`);
  button.addEventListener('click', () => select(offer, button));
  row.append(saving, button);
  article.append(row, node('p', `Full stay: ${money(state.booking.retail.totalMinor)} → ${money(offer.retail.totalMinor, offer.retail.currency)} · taxes and fees included`, 'pricenote'), node('p', deadline(offer), 'small muted'), node('p', `Simulated check: ${instant(offer.checkedAt, 'UTC')}`, 'checked'));
  return article;
}
function renderOffers() {
  const defaults = ['equivalent', 'different-room', 'different-hotel'].map(category => state.offers.find(o => o.category === category && o.cancellation.refundability === 'refundable' && o.equivalence !== 'unknown')) .filter(Boolean);
  $('offers').replaceChildren(...defaults.map(offerCard));
  $('extra-offers').replaceChildren(...state.offers.filter(o => o.cancellation.refundability === 'non-refundable').map(offerCard));
  $('extra-offers').hidden = !$('non-refundable-interest').checked;
  $('unknown-offers').replaceChildren(...state.offers.filter(o => o.equivalence === 'unknown' || Object.values(o.room.conditions).some(v => v === null)).map(offerCard));
}
function renderState(next) {
  state = next;
  $('content').hidden = false;
  renderBooking();
  renderOffers();
  if (state.selectedOfferId) {
    selectedOffer = state.offers.find(o => o.offerId === state.selectedOfferId);
    if (selectedOffer) renderComparison();
  }
}
function openPreferences() {
  const p = state.preferences;
  const fields = { ...state.booking.room.conditions, ...p.essentialRequirements };
  $('requirements').replaceChildren(...Object.entries(fields).map(([key, value]) => {
    const row = node('div', undefined, 'requirement');
    const required = node('input');
    required.type = 'checkbox'; required.checked = Object.hasOwn(p.essentialRequirements, key); required.dataset.requirement = key;
    const label = node('label'); label.append(required, node('span', labels[key] || key));
    let input;
    if (requirementChoices[key]) {
      input = node('select');
      const choices = [...requirementChoices[key], [null, 'Not verified']];
      if (!choices.some(([scalar]) => scalar === value)) choices.push([value, `Custom requirement: ${String(value)} (not mapped)`]);
      for (const [scalar, title] of choices) {
        const option = node('option', title);
        option.value = scalar === null ? '__not_verified__' : String(scalar);
        option.dataset.scalar = JSON.stringify(scalar);
        option.selected = scalar === value;
        input.append(option);
      }
    } else if (typeof value === 'boolean' || value === null) {
      input = node('select');
      for (const [optionValue, title] of [['true', 'Yes'], ['false', 'No'], ['null', 'Not verified']]) { const option = node('option', title); option.value = optionValue; input.append(option); }
      input.value = String(value);
    } else { input = node('input'); input.type = typeof value === 'number' ? 'number' : 'text'; input.value = value; if (input.type === 'number') { input.min = '0'; input.step = 'any'; } }
    input.dataset.value = key; input.dataset.type = requirementChoices[key] ? 'choice' : value === null ? 'unknown' : typeof value; input.disabled = !required.checked; input.setAttribute('aria-label', `${labels[key] || key} required value`);
    required.addEventListener('change', () => { input.disabled = !required.checked; });
    row.append(label, input); return row;
  }));
  const scale = 10 ** (state.currency?.minorUnit ?? 2);
  $('minimum').min = state.agencyMinimumSavingMinor / scale;
  $('minimum').value = p.minimumSavingMinor / scale;
  $('minimum-currency').textContent = `(${state.currency?.code || 'USD'})`;
  $('minimum-help').textContent = `Agency minimum: ${money(state.agencyMinimumSavingMinor)}. Configurable fictional demo setting.`;
  $('frequency').value = p.notificationFrequency;
  $('continue-monitoring').checked = p.continueMonitoring;
  $('automatic').checked = p.automaticEquivalentSwitches;
  $('permission-confirmed').checked = false;
  $('confirmation').hidden = !p.automaticEquivalentSwitches;
  $('preferences-error').textContent = '';
  $('enrolment').hidden = false;
  $('enrolment-title').focus();
  $('enrolment').scrollIntoView({ block: 'start' });
}
function closePreferences() { $('enrolment').hidden = true; $('edit-preferences').focus(); }
function parseMinor(text) {
  const digits = state.currency?.minorUnit ?? 2;
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(text)) throw new Error(`Enter an amount with no more than ${digits} decimal places.`);
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'));
  if (!Number.isSafeInteger(minor) || minor < state.agencyMinimumSavingMinor) throw new Error(`Minimum refund must be at least ${money(state.agencyMinimumSavingMinor)}.`);
  return minor;
}
async function savePreferences(event) {
  event.preventDefault();
  if (busy) return;
  $('preferences-error').textContent = '';
  try {
    const essentialRequirements = {};
    for (const input of $('requirements').querySelectorAll('[data-requirement]:checked')) {
      const value = [...$('requirements').querySelectorAll('[data-value]')].find(el => el.dataset.value === input.dataset.requirement);
      const raw = value.value.trim();
      if (raw === '') throw new Error(`Enter a value for ${labels[input.dataset.requirement] || input.dataset.requirement}, or uncheck it.`);
      essentialRequirements[input.dataset.requirement] = value.dataset.type === 'choice' ? JSON.parse(value.selectedOptions[0].dataset.scalar) : value.tagName === 'SELECT' ? (raw === 'null' ? null : raw === 'true') : value.dataset.type === 'number' ? Number(raw) : raw;
    }
    const automaticEquivalentSwitches = $('automatic').checked;
    if (automaticEquivalentSwitches && !$('permission-confirmed').checked) throw new Error('Confirm equivalent-only standing permission separately, or turn automatic switches off.');
    const body = { bookingVersion: state.booking.version, preferences: { version: state.preferences.version, essentialRequirements, automaticEquivalentSwitches, minimumSavingMinor: parseMinor($('minimum').value), notificationFrequency: $('frequency').value, continueMonitoring: $('continue-monitoring').checked } };
    if (automaticEquivalentSwitches) body.permissionConfirmation = { confirmed: true, bookingVersion: state.booking.version, preferenceVersion: state.preferences.version, scope: 'equivalent-only', version: 1 };
    busy = true; $('save-preferences').disabled = true;
    renderState(await request('/api/enrolment', body));
    closePreferences(); setStatus('Your price watch preferences are saved. Your booking is unchanged.');
  } catch (error) {
    if (error.status === 409) {
      try {
        renderState(await request('/api/bootstrap?scenario=jury-booking'));
        openPreferences();
        $('preferences-error').textContent = 'Saved preferences or booking changed in another session. The latest values are shown. Review them and confirm any equivalent-only permission again before saving.';
      } catch (reloadError) { $('preferences-error').textContent = `Could not refresh the latest preferences. ${errorMessage(reloadError)}`; }
    } else $('preferences-error').textContent = errorMessage(error);
  }
  finally { busy = false; $('save-preferences').disabled = false; }
}
async function select(offer, trigger) {
  if (busy) return;
  busy = true; trigger.disabled = true;
  try {
    const changed = state.selectedOfferId !== offer.offerId;
    renderState(await request('/api/selection', { offerId: offer.offerId, bookingVersion: state.booking.version }));
    if (changed) $('messages').replaceChildren();
    selectedOffer = state.offers.find(o => o.offerId === offer.offerId);
    lastFocus = trigger; renderComparison();
    $('comparison-title').focus(); $('comparison').scrollIntoView({ block: 'start' });
    setStatus('Comparison saved. Selecting an offer gives no permission to change your booking.');
  } catch (error) { setStatus(errorMessage(error), true); }
  finally { busy = false; trigger.disabled = false; }
}
function renderComparison() {
  const o = selectedOffer;
  const b = state.booking;
  $('comparison').hidden = false;
  $('comparison-title').textContent = `${o.hotel.name} · ${o.room.name}`;
  $('selected-identity').textContent = `Selected: ${o.hotel.name} · ${o.room.name}`;
  for (const [prefix, record] of [['before', b], ['after', o]]) {
    $(`${prefix}-hotel`).textContent = record.hotel.name;
    $(`${prefix}-room`).textContent = record.room.name;
    $(`${prefix}-price`).textContent = money(record.retail.totalMinor, record.retail.currency);
  }
  $('comparison-saving').textContent = money(o.decision?.netSavingMinor ?? o.refundQuote?.netSavingMinor, o.refundQuote?.currency);
  $('selected-terms').textContent = deadline(o);
  $('selected-authority').textContent = authorityText(o);
  const details = differenceEntries(o);
  const quote = o.refundQuote;
  if (quote) {
    const priceDifference = Number.isSafeInteger(quote.originalRetailMinor) && Number.isSafeInteger(quote.replacementRetailMinor) ? quote.originalRetailMinor - quote.replacementRetailMinor : null;
    details.push(['Refund calculation', `Price difference ${money(priceDifference)} − original cancellation ${money(quote.originalCancellationMinor)} − switch fees ${money(quote.switchFeesMinor)} − refund processing ${money(quote.refundProcessingMinor)} = ${money(quote.netSavingMinor)} potential refund.`]);
  }
  if (o.decision?.reasons?.length) details.push(['Decision checks', o.decision.reasons.map(valueText).join(' · ')]);
  $('differences').replaceChildren(...details.flatMap(([key, value]) => [node('dt', key), node('dd', value)]));
  $('selected-checked').textContent = `Simulated check: ${instant(o.checkedAt, 'UTC')} · expires ${instant(o.expiresAt, 'UTC')}. Revalidation is required before any future switch.`;
  $('model-status').textContent = state.model?.available ? 'Gemini is configured. Its response uses this booking, your preferences and checked offer facts.' : 'Gemini advice is unavailable: the model is not configured. You can still compare checked facts and save preferences.';
  updateSummaryCompact();
}
function updateSummaryCompact() {
  const summary = document.querySelector('.selected-summary');
  summary.classList.toggle('compact', window.innerWidth < 800 && !$('comparison').hidden && summary.getBoundingClientRect().top <= 0);
}
window.addEventListener('scroll', updateSummaryCompact, { passive: true });
window.addEventListener('resize', updateSummaryCompact, { passive: true });
function appendMessage(role, text, error = false) {
  const el = node('article', undefined, `message ${role}${error ? ' error' : ''}`);
  el.append(node('strong', role === 'customer' ? 'You' : error ? 'Advice unavailable' : 'Gemini'), node('p', text));
  $('messages').append(el);
  return el;
}
async function askAdvice(event) {
  event.preventDefault();
  if (busy || !selectedOffer) return;
  const question = $('question').value.trim();
  if (!question) return;
  busy = true; $('ask').disabled = true; $('ask').textContent = 'Asking Gemini…';
  appendMessage('customer', question);
  try {
    const result = await request('/api/advice', { offerId: selectedOffer.offerId, bookingVersion: state.booking.version, message: question });
    const advice = result.advice;
    const reply = appendMessage('assistant', advice.summary);
    reply.append(node('p', advice.recommendation === 'keep-booking' ? 'Recommendation: keep your current booking.' : 'Recommendation: consider this offer; separate permission rules still apply.'));
    for (const [heading, items] of [['Tradeoffs', advice.tradeoffs], ['Uncertainties', advice.uncertainties]]) {
      if (items?.length) { reply.append(node('h4', heading)); const list = node('ul'); list.append(...items.map(item => node('li', item))); reply.append(list); }
    }
    $('question').value = '';
  } catch (error) { appendMessage('assistant', `${errorMessage(error)} Your saved preferences and selected comparison are intact.`, true); }
  finally { busy = false; $('ask').disabled = false; $('ask').textContent = 'Ask Gemini'; }
}
function closeInvitation() { $('invitation').close(); $('edit-preferences').focus(); }
$('show-enrolment').addEventListener('click', () => { $('invitation').close(); openPreferences(); });
for (const id of ['not-now', 'dismiss-invitation']) $(id).addEventListener('click', closeInvitation);
$('invitation').addEventListener('cancel', () => { setTimeout(() => $('edit-preferences').focus(), 0); });
$('invitation').addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const first = $('dismiss-invitation');
  const last = $('not-now');
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
$('edit-preferences').addEventListener('click', openPreferences);
for (const id of ['close-enrolment', 'cancel-preferences']) $(id).addEventListener('click', closePreferences);
$('automatic').addEventListener('change', () => { $('confirmation').hidden = !$('automatic').checked; $('permission-confirmed').checked = false; });
$('non-refundable-interest').addEventListener('change', () => { $('extra-offers').hidden = !$('non-refundable-interest').checked; });
$('close-comparison').addEventListener('click', () => {
  $('comparison').hidden = true;
  const currentTrigger = [...document.querySelectorAll('[data-offer]')].find(el => el.dataset.offer === selectedOffer?.offerId)?.querySelector('button');
  if (lastFocus?.isConnected) lastFocus.focus();
  else if (currentTrigger) currentTrigger.focus();
  else $('changes-title').scrollIntoView();
});
$('preferences-form').addEventListener('submit', savePreferences);
$('advice-form').addEventListener('submit', askAdvice);
async function bootstrap() {
  try {
    renderState(await request('/api/bootstrap?scenario=jury-booking'));
    setStatus('');
    if (!state.enrolled) { $('invitation').showModal(); $('show-enrolment').focus(); }
  } catch (error) {
    setStatus(`Cannot load the demo booking. ${errorMessage(error)}`, true);
    const retry = node('button', 'Try again', 'review'); retry.type = 'button'; retry.addEventListener('click', () => { retry.remove(); bootstrap(); }); $('page-status').append(' ', retry);
  }
}
bootstrap();
