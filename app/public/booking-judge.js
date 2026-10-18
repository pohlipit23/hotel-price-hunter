/** Judge flow screens: catalogue, booked Original Booking, Drop Watch setup and the replayed first check. Display only. */
import { minorDigits, minimumSavingChoices, agencyMinimumSavingMinor, deliveryEmailValid } from './drop-watch.js';

// Altovo may be named as the staging booking engine that made the bookings; no Altovo or AirBorneo logo.
export const HONEST_NOTE = 'Altovo staging quotation standing in for a confirmed booking';
// The judge's three steps. Only steps 2 and 3 are RoomDrop; the booking itself was made on Altovo's engine.
export const JOURNEY = Object.freeze([
  { title: 'Pick a booking', tag: null, text: "Made on Altovo's booking engine, not part of this submission. RoomDrop starts at the confirmation." },
  { title: 'Set up a drop', tag: 'RoomDrop', text: 'Invite on the confirmation page (or in the confirmation email).' },
  { title: 'Get your drop', tag: 'RoomDrop app', text: 'Cheaper room found? It arrives by email.' },
]);
// Which journey step a visible screen belongs to: the start grid, the booking site, then the RoomDrop app.
const STEP_OF = { 'catalogue-screen': 1, 'booked-screen': 2, 'setup-screen': 2, 'checking-screen': 2, 'launch-screen': 3, 'booking-summary': 3, comparison: 3, 'simulated-switch': 3 };
export function journeyStep(screenId) { return STEP_OF[screenId] ?? null; }
const EMAIL_PROBLEM = 'Check the email address, or leave it empty.';
// The optional delivery address as typed: empty means none (or keep a saved one), `remove` drops a saved one.
export function deliveryEmailField(value, { remove = false } = {}) {
  const email = String(value ?? '').trim();
  if (!email) return { email: remove ? null : undefined, problem: null };
  return deliveryEmailValid(email) ? { email, problem: null } : { email: undefined, problem: EMAIL_PROBLEM };
}
// The masked saved address from the committed receipt; the full address never reaches the page.
export function savedDelivery(data) { return data?.watch?.delivery?.maskedEmail ?? null; }
// The hand-off after the committed "Drop Watch armed" receipt: the judge leaves the booking site for the app.
export function handoffCopy(data) {
  if (!data?.watch) return null;
  return { title: 'Drop Watch armed', lead: "You're leaving the booking site.",
    text: 'In real life your drop arrives by email. For this demo we open the RoomDrop app now.', email: savedDelivery(data), action: 'Open RoomDrop' };
}
const blockers = {
  NON_REFUNDABLE: ['non-refundable', 'This booking is non-refundable', 'A cheaper room only helps if this booking can be cancelled for free. This one cannot, so there is nothing to watch.'],
  NO_FREE_CANCELLATION: ['no free cancellation', 'No free cancellation on this booking', 'Every cancellation here costs money, so a cheaper room would not save anything.'],
  FREE_CANCELLATION_ENDED: ['free cancellation ended', 'Free cancellation has ended', 'The free cancellation window has closed, so switching to a cheaper room would no longer pay off.'],
  STAY_STARTED: ['stay started', 'This stay has already started', 'Drops are only useful before check-in.'],
  CANCELLATION_FACTS_UNKNOWN: ['terms unknown', 'Cancellation terms are unknown', 'Without clear cancellation terms a switch could cost money, so the Drop Watch stays off.'],
};
const blockerFacts = reason => blockers[reason] ?? blockers.CANCELLATION_FACTS_UNKNOWN;
// Reviewed card photos live in the public assets folder; anything else gets the honest fallback.
const PHOTO_ASSET = /^assets\/[a-z0-9-]{1,80}\.(?:jpg|png|webp)$/;

export function formatMoney(minor, currency) {
  const digits = minorDigits(currency);
  return currency + ' ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: minor % (10 ** digits) ? digits : 0, maximumFractionDigits: digits }).format(minor / (10 ** digits));
}
export function formatInstant(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date) + ', '
    + new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(date) + ' UTC';
}
const formatDay = day => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z'));
export function tagFor(entry) {
  if (entry.blocker) return { kind: 'blocked', text: 'Cannot start: ' + blockerFacts(entry.blocker)[0] };
  return entry.tag === 'closing-soon' ? { kind: 'soon', text: 'Closing soon' } : { kind: 'ready', text: 'Drop Watch ready' };
}
// The curated city name when the card has one, else the booking's city code, then the country.
export function placeText(hotel, cityName) {
  let country = hotel.countryCode;
  try { country = new Intl.DisplayNames(['en'], { type: 'region' }).of(hotel.countryCode) || country; } catch { /* Keep the code. */ }
  return [cityName ?? hotel.cityCode, country].filter(Boolean).join(', ');
}
export function cancellationText(cancellation) {
  if (cancellation?.nonRefundable) return 'Non-refundable';
  return cancellation?.freeUntil ? 'Free cancellation until ' + formatInstant(cancellation.freeUntil) : 'No free cancellation';
}
const reviewedPhoto = photo => photo && PHOTO_ASSET.test(photo.asset ?? '') && typeof photo.alt === 'string' && photo.alt ? { src: '/' + photo.asset, alt: photo.alt } : null;
// A reviewed hotel photo, or the honest fallback: never a stand-in picture of some other hotel.
export function cardPhoto(card) {
  const photo = reviewedPhoto(card?.photo);
  return photo ? { kind: 'photo', ...photo } : { kind: 'fallback', city: card?.cityName ?? null };
}
// The reviewed photo of the booked room, or null: the hotel photo never stands in for the room.
export function roomPhoto(card) { return reviewedPhoto(card?.roomPhoto); }
// The curated scenario label shows only while the booking can still start, so a card whose free
// cancellation has since ended never advertises its old scenario; the tag gives the current state.
export function cardFacts(entry) {
  return { city: placeText(entry.hotel, entry.card?.cityName), scenario: entry.blocker ? null : entry.card?.scenarioLabel ?? null, tag: tagFor(entry) };
}
export function capturedNote(data) {
  const readAt = data.baseline?.source?.readAt;
  return HONEST_NOTE + (/^\d{4}-\d{2}-\d{2}$/.test(readAt ?? '') ? ' - captured ' + formatDay(readAt) : '');
}
export function cannotStart(reason) { const [, title, text] = blockerFacts(reason); return { title, text }; }
// The minimum choices, from the agency's 10.00 floor in the booking currency upwards.
export function minimumOptions(data, chosen) {
  const currency = data.baseline.quotedRetail.currency;
  const floor = data.agencyMinimumSavingMinor ?? agencyMinimumSavingMinor(currency);
  const values = minimumSavingChoices(currency).filter(value => value >= floor);
  const selected = values.includes(chosen) ? chosen : values.includes(data.watch?.minimumSavingMinor) ? data.watch.minimumSavingMinor : values[0];
  return values.map((value, index) => ({ value, label: index === 0 ? 'Any drop' : '-' + formatMoney(value, currency).replace(currency + ' ', ''),
    caption: index === 0 ? formatMoney(value, currency) + ' or more' : currency + ' or more', checked: value === selected }));
}
// The arm request. It names the revision this tab last saw (0 before the first arm), so a stale tab
// cannot replace a newer setup: the server answers 409 WATCH_REVISION_STALE instead. `deliveryEmail` is
// sent only when typed (a string) or removed (null); left out, the server keeps any saved address.
export function armRequestBody(data, minimumSavingMinor, deliveryEmail) {
  return { snapshotVersion: data.snapshotVersion, consent: true, minimumSavingMinor, expectedRevision: data.watch?.revision ?? 0,
    ...(deliveryEmail !== undefined ? { deliveryEmail } : {}) };
}
// The armed line, from the committed receipt only; no receipt, no armed state.
export function armedDetail(data) {
  if (!data.watch) return null;
  const currency = data.baseline.quotedRetail.currency; const minimum = data.watch.minimumSavingMinor;
  const floor = data.agencyMinimumSavingMinor ?? agencyMinimumSavingMinor(currency);
  return (minimum <= floor ? 'Any drop of ' : 'Drops of ') + formatMoney(minimum, currency) + ' or more · replayed check from ' + formatInstant(data.watch.firstCheck.checkedAt);
}
const guests = occupancy => {
  const people = occupancy.adults + occupancy.childAges.length + occupancy.infantAges.length;
  return people + (people === 1 ? ' guest' : ' guests');
};
const svgNode = (tag, attributes) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
};
const svgIcon = (path, viewBox = '0 0 24 24') => {
  const svg = svgNode('svg', { viewBox, 'aria-hidden': 'true', focusable: 'false' });
  for (const d of [].concat(path)) svg.append(svgNode('path', { d }));
  return svg;
};
const tagIcons = { ready: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11Z', soon: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', blocked: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-6 15L18 6' };
// A line-drawn postcard hotel with a falling price drop: decoration for the photo fallback.
const fallbackArt = ['M14 70h92', 'M34 70V30h40v40', 'M30 30h48l-6-10H36l-6 10Z', 'M42 38h6m8 0h6M42 48h6m8 0h6M42 58h6m8 0h6', 'M50 70v-8h8v8',
  'M74 46h18v24', 'M80 54h6m-6 8h6', 'M98 10c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10Z'];

export function createJudgeScreens(ui) {
  const { $, node, stayText, setActionContent } = ui;
  const cards = new Map();
  // The 3-step journey strip: full on the start page, compact after it; the step follows the visible screen.
  const strip = $('journey-strip');
  strip.replaceChildren(...JOURNEY.map((step, index) => {
    const item = node('li', undefined, 'journey-step'); item.dataset.step = String(index + 1);
    const head = node('span', undefined, 'journey-head');
    head.append(node('span', String(index + 1), 'journey-num'), node('strong', step.title, 'journey-title'));
    if (step.tag) head.append(node('em', step.tag, 'journey-tag'));
    item.append(head, node('span', step.text, 'journey-text')); return item;
  }));
  const syncStrip = () => {
    const visible = Object.keys(STEP_OF).find(id => $(id) && !$(id).hidden);
    const current = journeyStep(visible);
    strip.hidden = !current; if (!current) return;
    strip.classList.toggle('journey-compact', current !== 1);
    strip.querySelectorAll('li').forEach((item, index) => {
      if (index + 1 === current) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      item.classList.toggle('passed', index + 1 < current);
    });
  };
  new MutationObserver(syncStrip).observe($('content'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  syncStrip();
  // The optional delivery email: checked as typed, sent only through armRequestBody.
  let removeSaved = false;
  const emailProblem = () => {
    const { problem } = deliveryEmailField($('delivery-email').value, { remove: removeSaved });
    $('delivery-problem').textContent = problem ?? ''; $('delivery-problem').hidden = !problem;
    if (problem) $('delivery-email').setAttribute('aria-invalid', 'true'); else $('delivery-email').removeAttribute('aria-invalid');
    return problem;
  };
  $('delivery-email').addEventListener('change', emailProblem);
  $('delivery-email').addEventListener('input', () => { if (!$('delivery-problem').hidden) emailProblem(); });
  $('delivery-remove').addEventListener('click', () => { removeSaved = true; $('delivery-saved').hidden = true; $('delivery-email').focus(); });
  const tagNode = entry => {
    const tag = tagFor(entry); const chip = node('span', undefined, 'watch-tag tag-' + tag.kind);
    chip.append(svgIcon(tagIcons[tag.kind]), node('span', tag.text)); return chip;
  };
  const fallback = city => {
    const frame = node('span', undefined, 'photo-fallback'); frame.setAttribute('role', 'img');
    frame.setAttribute('aria-label', 'No photo yet' + (city ? ' · ' + city : ''));
    frame.append(svgIcon(fallbackArt, '0 0 120 80'));
    if (city) frame.append(node('strong', city, 'fallback-city'));
    frame.append(node('span', 'No photo yet', 'fallback-note'));
    return frame;
  };
  // Returns the photo element and whether it is a supplied photo (a failed load falls back too).
  const photoNode = (card, onFallback = () => {}) => {
    const photo = cardPhoto(card);
    if (photo.kind === 'fallback') { onFallback(); return fallback(photo.city); }
    const image = node('img', undefined, 'card-photo'); image.src = photo.src; image.alt = photo.alt; image.decoding = 'async';
    image.addEventListener('error', () => { onFallback(); image.replaceWith(fallback(card.cityName)); });
    return image;
  };
  return {
    renderCatalogue(entries, open) {
      $('catalogue-note').textContent = 'Each card is a real Altovo staging quotation standing in for a confirmed booking.';
      cards.clear(); for (const entry of entries) cards.set(entry.code, entry.card ?? null);
      $('catalogue-list').replaceChildren(...entries.map((entry, index) => {
        const facts = cardFacts(entry);
        const card = node('article', undefined, 'catalogue-card'); card.dataset.code = entry.code;
        const title = node('h2', entry.hotel.name); title.id = 'catalogue-hotel-' + entry.code;
        card.setAttribute('aria-labelledby', title.id);
        const photo = node('div', undefined, 'catalogue-photo');
        // A supplied photo is labelled as the hotel's; the drawn fallback (or a failed load) has no label.
        const photoTag = node('span', 'Hotel photo', 'photo-tag'); let supplied = true;
        photo.append(photoNode(entry.card, () => { supplied = false; photoTag.remove(); }), tagNode(entry));
        if (supplied) photo.append(photoTag);
        const body = node('div', undefined, 'catalogue-body');
        if (facts.scenario) body.append(node('p', facts.scenario, 'scenario-label scenario-' + (index % 3)));
        const price = node('p', undefined, 'catalogue-price');
        price.append(node('strong', formatMoney(entry.quotedRetail.totalMinor, entry.quotedRetail.currency)), node('span', 'whole stay'));
        body.append(title, node('p', facts.city, 'catalogue-place'), node('p', stayText(entry), 'catalogue-stay'), price);
        const button = node('button', undefined, 'offer-action catalogue-open'); button.type = 'button';
        setActionContent(button, 'Open this booking');
        button.setAttribute('aria-label', 'Open booking at ' + entry.hotel.name + ', ' + facts.tag.text);
        button.addEventListener('click', event => open(entry.code, event.currentTarget));
        card.append(photo, node('div', undefined, 'ticket-tear'), body, button);
        return card;
      }));
    },
    renderBooked(data) {
      const b = data.baseline; const card = cards.get(data.code) ?? null;
      $('booked-title').textContent = b.hotel.name;
      $('booked-place').textContent = [placeText(b.hotel, card?.cityName), b.hotel.star ? b.hotel.star + ' star' : null, 'Ref ' + b.quotationCode].filter(Boolean).join(' · ');
      $('booked-photo-tag').hidden = false;
      $('booked-photo').replaceChildren(photoNode(card, () => { $('booked-photo-tag').hidden = true; }));
      // The booked room's own reviewed photo, labelled as the room; absent (or failing to load) shows nothing.
      const room = roomPhoto(card); $('booked-room').hidden = !room; $('booked-room-photo').replaceChildren();
      if (room) {
        const image = node('img', undefined, 'room-photo'); image.src = room.src; image.alt = room.alt; image.decoding = 'async';
        image.addEventListener('error', () => { $('booked-room').hidden = true; });
        $('booked-room-photo').append(image); $('booked-room-name').textContent = b.room.name || 'Your room';
      }
      const facts = [['Room', b.room.name || 'Room not named'], ['Meals', b.room.board || 'Not specified'], ['Dates', stayText(b)],
        ['Guests', guests(b.occupancy)], ['Cancellation', cancellationText(b.cancellation)]];
      $('booked-facts').replaceChildren(...facts.map(([label, value]) => {
        const row = node('div', undefined, 'booked-fact' + (label === 'Cancellation' ? (b.cancellation?.freeUntil && !b.cancellation.nonRefundable ? ' fact-free' : ' fact-locked') : ''));
        row.append(node('dt', label), node('dd', value)); return row;
      }));
      $('booked-price').textContent = formatMoney(b.quotedRetail.totalMinor, b.quotedRetail.currency);
      $('booked-note').textContent = capturedNote(data);
      // A booking that cannot start stays viewable: its reason, and the setup action shown but disabled.
      $('booked-blocked').hidden = !data.blocker; $('setup-drop').disabled = Boolean(data.blocker);
      if (data.blocker) {
        const { title, text } = cannotStart(data.blocker); $('blocked-title').textContent = title; $('blocked-text').textContent = text;
        $('setup-drop').setAttribute('aria-describedby', 'blocked-title');
      } else $('setup-drop').removeAttribute('aria-describedby');
      $('setup-drop').textContent = data.watch ? 'Change my Drop Watch' : 'Set up a drop';
    },
    renderSetup(data, chosen) {
      const b = data.baseline; const currency = b.quotedRetail.currency;
      $('setup-booking').textContent = b.hotel.name + ' · ' + formatMoney(b.quotedRetail.totalMinor, currency);
      $('minimum-options').replaceChildren(...minimumOptions(data, chosen).map(option => {
        const label = node('label', undefined, 'chip'); const input = node('input');
        input.type = 'radio'; input.name = 'minimum-saving'; input.value = String(option.value); input.checked = option.checked;
        const text = node('span', undefined, 'chip-text');
        text.append(node('strong', option.label), node('span', option.caption));
        label.append(input, text); return label;
      }));
      $('judge-consent').checked = Boolean(data.watch);
      // A saved address is shown masked only; leaving the field empty keeps it, Remove drops it.
      removeSaved = false; $('delivery-email').value = ''; emailProblem();
      const saved = savedDelivery(data); $('delivery-saved').hidden = !saved; $('delivery-saved-email').textContent = saved ?? '';
      $('setup-message').textContent = ''; $('setup-message').classList.remove('error');
      $('arm-watch').textContent = data.watch ? 'Update my Drop Watch' : 'Arm my Drop Watch'; $('arm-watch').disabled = false;
    },
    chosenMinimum() { return Number(document.querySelector('input[name="minimum-saving"]:checked')?.value); },
    // The arm request with the delivery email field. An invalid address stops the arm with its own message.
    armRequestBody(data, minimumSavingMinor) {
      const problem = emailProblem();
      if (problem) { $('delivery-email').focus(); throw Object.assign(new Error(problem), { userMessage: problem }); }
      return armRequestBody(data, minimumSavingMinor, deliveryEmailField($('delivery-email').value, { remove: removeSaved }).email);
    },
    // Replays the captured check (a short beat, never a live search), then the hand-off: the watch is already
    // committed; the judge leaves the booking site and opens the RoomDrop app. Resolves when they continue.
    async playCheck(data, isCurrent) {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const screen = $('checking-screen');
      $('checking-replay').textContent = 'Replayed check · captured ' + formatInstant(data.watch.firstCheck.checkedAt) + ' · not live';
      $('checking-title').textContent = 'Checking for drops';
      $('checking-status').textContent = 'Replaying the check from ' + formatInstant(data.watch.firstCheck.checkedAt) + '.';
      screen.classList.remove('checked', 'handoff'); $('handoff').hidden = true;
      await new Promise(resolve => setTimeout(resolve, reduced ? 500 : 1500));
      if (!isCurrent()) return false;
      const copy = handoffCopy(data);
      screen.classList.add('checked', 'handoff');
      $('checking-title').textContent = copy.title;
      $('checking-status').replaceChildren(node('span', copy.title + '. ', 'sr-only'), copy.lead);
      $('handoff-text').textContent = copy.text;
      $('handoff-email').hidden = !copy.email; $('handoff-email').textContent = copy.email ? 'Saved for ' + copy.email + ' · not sent yet' : '';
      $('open-roomdrop-label').textContent = copy.action; $('handoff').hidden = false;
      $('open-roomdrop').focus({ preventScroll: true });
      const continued = await new Promise(resolve => {
        const timer = setInterval(() => { if (!isCurrent() || screen.hidden) done(false); }, 150);
        const click = () => done(true);
        function done(value) { clearInterval(timer); $('open-roomdrop').removeEventListener('click', click); resolve(value); }
        $('open-roomdrop').addEventListener('click', click);
      });
      screen.classList.remove('handoff'); $('handoff').hidden = true;
      return continued && isCurrent();
    },
    armedDetail,
  };
}
