/** Judge flow screens: catalogue, the agency's confirmation page with the RoomDrop add-on, and the drop modal
 * (Drop Watch setup, then the replayed first check). Display only. */
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
// Setup and the replayed check open in a modal over the booking site's page, so they stay step 2 with it.
// The closeout comes after all three steps, so every step shows as passed there.
const STEP_OF = { 'catalogue-screen': 1, 'booked-screen': 2, 'launch-screen': 3, 'booking-summary': 3, comparison: 3, 'simulated-switch': 3, 'closeout-screen': 4 };
export function journeyStep(screenId) { return STEP_OF[screenId] ?? null; }
// The closeout after the confirmation's "What next?" pick: what would happen next outside the demo.
export const CLOSEOUT_VIDEO = 'https://www.youtube-nocookie.com/embed/zKe3UFlgUNc';
export function closeoutCopy(choice) {
  const steps = ['Your agency books the new room, then cancels the original.', 'The difference comes back to you, after any fees.'];
  if (choice === 'watch') return { choice: 'You chose: keep watching for drops',
    steps: [...steps, 'RoomDrop keeps watching your new booking and emails you if it drops again.'] };
  if (choice === 'keep') return { choice: 'You chose: keep this booking for good',
    steps: [...steps, 'Your Drop Watch stops. No more checks or emails for this stay.'] };
  return { choice: '', steps };
}
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
// Only an email the server handed over (scheduled or sent) is promised; any other status says it was not sent.
export function handoffCopy(data) {
  if (!data?.watch) return null;
  const email = savedDelivery(data); const status = data.watch.delivery?.status;
  const mailed = Boolean(email) && ['scheduled', 'sent'].includes(status);
  return { title: 'Drop Watch armed', lead: "You're leaving the booking site.",
    text: mailed ? 'Check your inbox in about a minute. For this demo we open the RoomDrop app now.'
      : 'In real life your drop arrives by email. For this demo we open the RoomDrop app now.',
    email, emailNote: !email ? null : mailed ? 'Emailing ' + email : 'Saved for ' + email + (status === 'pending-service' ? ' · not sent yet' : ' · not sent'),
    action: 'Open RoomDrop' };
}
// A Drop email link, #inbox-CODE~TOKEN, or null. The token is a 43-character base64url secret: the page strips
// it from the address bar at once and only ever sends it in one POST body.
export function inboxLink(hash) {
  const match = /^#inbox-([A-Z0-9]{4,20})~([A-Za-z0-9_-]{43})$/.exec(hash ?? '');
  return match ? { code: match[1], token: match[2] } : null;
}
export const INBOX_GONE = 'That email link has expired or was used up. Pick a booking to start a new Drop Watch.';
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
// The committed minimum, as the armed add-on card says it; no receipt, no armed state.
export function armedSummary(data) {
  if (!data.watch) return null;
  const currency = data.baseline.quotedRetail.currency; const minimum = data.watch.minimumSavingMinor;
  const floor = data.agencyMinimumSavingMinor ?? agencyMinimumSavingMinor(currency);
  return (minimum <= floor ? 'Any drop of ' : 'Drops of ') + formatMoney(minimum, currency) + ' or more';
}
// The armed line, from the committed receipt only; no receipt, no armed state.
export function armedDetail(data) {
  return data.watch ? armedSummary(data) + ' · replayed check from ' + formatInstant(data.watch.firstCheck.checkedAt) : null;
}
// The add-on card on the agency's page: an offer, the armed state, or why this booking cannot be watched.
export function offerState(data) { return data.blocker ? 'blocked' : data.watch ? 'armed' : 'ready'; }
// Check-in and check-out as the agency prints them. The baseline has dates only, no times.
// Built from parts, so every engine prints "Wed 17 Feb 2027" whatever its locale punctuation.
export const dayText = day => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  .formatToParts(new Date(day + 'T00:00:00Z')).filter(part => part.type !== 'literal').map(part => part.value).join(' ');
export function nightsText(stay) {
  const nights = Math.round((Date.parse(stay.checkout) - Date.parse(stay.checkin)) / 86400000);
  return nights + (nights === 1 ? ' night' : ' nights');
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
  // The RoomDrop add-on card. A booking that cannot start keeps its reason and has no button at all;
  // once armed it opens the app, with a small link back to the setup.
  const renderOffer = data => {
    const state = offerState(data); $('drop-offer').dataset.state = state;
    $('drop-offer-title').textContent = { ready: 'Prices often drop after you book.', armed: 'Drop Watch armed', blocked: "Can't watch this booking" }[state];
    $('drop-offer-text').textContent = state === 'armed' ? armedSummary(data) : "We'll watch this one for you.";
    $('drop-offer-text').hidden = state === 'blocked'; $('booked-blocked').hidden = state !== 'blocked'; $('drop-open').hidden = state !== 'armed';
    const setup = $('setup-drop'); setup.hidden = setup.disabled = state === 'blocked';
    if (state === 'blocked') {
      const { title, text } = cannotStart(data.blocker); $('blocked-title').textContent = title; $('blocked-text').textContent = text;
      setup.setAttribute('aria-describedby', 'blocked-title');
    } else setup.removeAttribute('aria-describedby');
    setup.className = state === 'armed' ? 'plain drop-change' : 'primary drop-cta';
    setup.textContent = state === 'armed' ? 'Change my Drop Watch' : 'Set up a drop';
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
        // Photos carry no "Hotel photo" label: the picture under a hotel name speaks for itself.
        photo.append(photoNode(entry.card), tagNode(entry));
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
    // The agency's confirmation page: only facts the booking has; guest details stay generic placeholders.
    renderBooked(data) {
      const b = data.baseline; const card = cards.get(data.code) ?? null;
      $('booked-code').textContent = b.quotationCode;
      $('booked-hotel').textContent = b.hotel.name;
      const stars = Math.round(Number(b.hotel.star) || 0); $('booked-stars').hidden = !stars;
      $('booked-stars').textContent = '★'.repeat(stars); $('booked-stars').setAttribute('aria-label', stars + ' star hotel');
      $('booked-place').textContent = placeText(b.hotel, card?.cityName);
      $('booked-photo').replaceChildren(photoNode(card));
      // The booked room's own reviewed photo, labelled as the room; absent (or failing to load) shows nothing.
      const room = roomPhoto(card); $('booked-room').hidden = !room; $('booked-room-photo').replaceChildren();
      if (room) {
        const image = node('img', undefined, 'room-photo'); image.src = room.src; image.alt = room.alt; image.decoding = 'async';
        image.addEventListener('error', () => { $('booked-room').hidden = true; });
        $('booked-room-photo').append(image); $('booked-room-name').textContent = b.room.name || 'Your room';
      }
      $('booked-checkin').textContent = dayText(b.stay.checkin); $('booked-checkout').textContent = dayText(b.stay.checkout);
      const facts = [['Nights', nightsText(b.stay)], ['Room', b.room.name || 'Room not named'], ['Meals', b.room.board || 'Not specified'], ['Guests', guests(b.occupancy)]];
      $('booked-facts').replaceChildren(...facts.map(([label, value]) => {
        const row = node('div'); row.append(node('dt', label), node('dd', value)); return row;
      }));
      $('booked-price').textContent = formatMoney(b.quotedRetail.totalMinor, b.quotedRetail.currency);
      const free = Boolean(b.cancellation?.freeUntil && !b.cancellation.nonRefundable);
      $('booked-policy').textContent = cancellationText(b.cancellation) + (free ? '*' : '');
      $('booked-policy').className = 'agency-policy ' + (free ? 'policy-free' : 'policy-locked'); $('booked-policy-note').hidden = !free;
      $('booked-note').textContent = capturedNote(data);
      renderOffer(data);
    },
    renderOffer,
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
    // In the modal: the Armed stamp lands, then the captured check replays (a short beat, never a live search),
    // then the hand-off: the watch is already committed; the judge leaves the booking site and opens the
    // RoomDrop app. Resolves when they continue.
    async playCheck(data, isCurrent) {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const screen = $('checking-screen'), checkedAt = formatInstant(data.watch.firstCheck.checkedAt);
      const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
      $('checking-replay').textContent = 'Replayed check · captured ' + checkedAt + ' · not live';
      $('checking-title').textContent = 'Drop Watch armed'; $('checking-status').textContent = '';
      screen.classList.remove('checking', 'handoff'); $('handoff').hidden = true;
      await pause(reduced ? 0 : 900);
      if (!isCurrent()) return false;
      screen.classList.add('checking'); $('checking-status').textContent = 'Checking for drops · replaying the check from ' + checkedAt + '.';
      await pause(reduced ? 500 : 1500);
      if (!isCurrent()) return false;
      const copy = handoffCopy(data);
      screen.classList.replace('checking', 'handoff');
      $('checking-title').textContent = copy.title;
      $('checking-status').replaceChildren(node('span', copy.title + '. ', 'sr-only'), copy.lead);
      $('handoff-text').textContent = copy.text;
      $('handoff-email').hidden = !copy.email; $('handoff-email').textContent = copy.emailNote ?? '';
      $('open-roomdrop-label').textContent = copy.action; $('handoff').hidden = false;
      // Only the modal scrolls, so the button may bring itself into view on short screens.
      $('open-roomdrop').focus();
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
