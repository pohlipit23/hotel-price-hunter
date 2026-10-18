/** Judge flow screens: catalogue, booked Original Booking, Drop Watch setup and the replayed first check. Display only. */
import { minorDigits, minimumSavingChoices, agencyMinimumSavingMinor } from './drop-watch.js';

export const HONEST_NOTE = 'A real Altovo staging quotation standing in for a confirmed booking';
const blockers = {
  NON_REFUNDABLE: ['non-refundable', 'This booking is non-refundable', 'A cheaper room only helps if this booking can be cancelled for free. This one cannot, so there is nothing to watch.'],
  NO_FREE_CANCELLATION: ['no free cancellation', 'No free cancellation on this booking', 'Every cancellation here costs money, so a cheaper room would not save anything.'],
  FREE_CANCELLATION_ENDED: ['free cancellation ended', 'Free cancellation has ended', 'The free cancellation window has closed, so switching to a cheaper room would no longer pay off.'],
  STAY_STARTED: ['stay started', 'This stay has already started', 'Drops are only useful before check-in.'],
  CANCELLATION_FACTS_UNKNOWN: ['terms unknown', 'Cancellation terms are unknown', 'Without clear cancellation terms a switch could cost money, so the Drop Watch stays off.'],
};
const blockerFacts = reason => blockers[reason] ?? blockers.CANCELLATION_FACTS_UNKNOWN;

export function formatMoney(minor, currency) {
  const digits = minorDigits(currency);
  return currency + ' ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: minor % (10 ** digits) ? digits : 0, maximumFractionDigits: digits }).format(minor / (10 ** digits));
}
export function formatInstant(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date) + ', '
    + new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(date) + ' UTC';
}
export function tagFor(entry) {
  if (entry.blocker) return { kind: 'blocked', text: 'Cannot start: ' + blockerFacts(entry.blocker)[0] };
  return entry.tag === 'closing-soon' ? { kind: 'soon', text: 'Closing soon' } : { kind: 'ready', text: 'Drop Watch ready' };
}
export function placeText(hotel) {
  let country = hotel.countryCode;
  try { country = new Intl.DisplayNames(['en'], { type: 'region' }).of(hotel.countryCode) || country; } catch { /* Keep the code. */ }
  return [hotel.cityCode, country].filter(Boolean).join(', ');
}
export function cancellationText(cancellation) {
  if (cancellation?.nonRefundable) return 'Non-refundable';
  return cancellation?.freeUntil ? 'Free cancellation until ' + formatInstant(cancellation.freeUntil) : 'No free cancellation';
}
const guests = occupancy => {
  const people = occupancy.adults + occupancy.childAges.length + occupancy.infantAges.length;
  return people + (people === 1 ? ' guest' : ' guests');
};
const svgIcon = path => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('d', path); svg.append(shape);
  return svg;
};
const tagIcons = { ready: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11Z', soon: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', blocked: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-6 15L18 6' };

export function createJudgeScreens(ui) {
  const { $, node, stayPhoto, stayText, setActionContent } = ui;
  const photoFor = code => [...($('catalogue-list').children)].findIndex(card => card.dataset.code === code) % 2 === 1 ? 3 : 0;
  const tagNode = entry => {
    const tag = tagFor(entry); const chip = node('span', undefined, 'watch-tag tag-' + tag.kind);
    chip.append(svgIcon(tagIcons[tag.kind]), node('span', tag.text)); return chip;
  };
  return {
    renderCatalogue(entries, open) {
      $('catalogue-note').textContent = 'Each card is a real Altovo staging quotation standing in for a confirmed booking.';
      $('catalogue-list').replaceChildren(...entries.map((entry, index) => {
        const card = node('article', undefined, 'catalogue-card'); card.dataset.code = entry.code;
        const title = node('h2', entry.hotel.name); title.id = 'catalogue-hotel-' + entry.code;
        card.setAttribute('aria-labelledby', title.id);
        const photo = node('div', undefined, 'catalogue-photo');
        photo.append(stayPhoto(index % 2 === 1 ? 3 : 0, true), tagNode(entry));
        const body = node('div', undefined, 'catalogue-body');
        const price = node('p', undefined, 'catalogue-price');
        price.append(node('strong', formatMoney(entry.quotedRetail.totalMinor, entry.quotedRetail.currency)), node('span', 'quoted, whole stay'));
        body.append(title, node('p', placeText(entry.hotel), 'catalogue-place'), node('p', stayText(entry), 'catalogue-stay'), price);
        const button = node('button', undefined, 'offer-action catalogue-open'); button.type = 'button';
        setActionContent(button, 'Open this booking');
        button.setAttribute('aria-label', 'Open booking at ' + entry.hotel.name + ', ' + tagFor(entry).text);
        button.addEventListener('click', event => open(entry.code, event.currentTarget));
        card.append(photo, body, button);
        return card;
      }));
    },
    renderBooked(data) {
      const b = data.baseline;
      $('booked-title').textContent = b.hotel.name;
      $('booked-place').textContent = [placeText(b.hotel), b.hotel.star ? b.hotel.star + ' star' : null, 'Ref ' + b.quotationCode].filter(Boolean).join(' · ');
      $('booked-photo').replaceChildren(stayPhoto(photoFor(data.code), true));
      const facts = [['Room', b.room.name || 'Room not named'], ['Meals', b.room.board || 'Not specified'], ['Dates', stayText(b)],
        ['Guests', guests(b.occupancy)], ['Cancellation', cancellationText(b.cancellation)]];
      $('booked-facts').replaceChildren(...facts.map(([label, value]) => {
        const row = node('div', undefined, 'booked-fact' + (label === 'Cancellation' ? (b.cancellation?.freeUntil && !b.cancellation.nonRefundable ? ' fact-free' : ' fact-locked') : ''));
        row.append(node('dt', label), node('dd', value)); return row;
      }));
      $('booked-price').textContent = formatMoney(b.quotedRetail.totalMinor, b.quotedRetail.currency);
      $('booked-note').textContent = HONEST_NOTE;
      $('booked-ready').hidden = Boolean(data.blocker); $('booked-blocked').hidden = !data.blocker;
      if (data.blocker) { const [, title, text] = blockerFacts(data.blocker); $('blocked-title').textContent = title; $('blocked-text').textContent = text; }
      $('setup-drop').textContent = data.watch ? 'Change my Drop Watch' : 'Set up a drop';
    },
    renderSetup(data, chosen) {
      const b = data.baseline; const currency = b.quotedRetail.currency;
      $('setup-booking').textContent = b.hotel.name + ' · ' + formatMoney(b.quotedRetail.totalMinor, currency);
      const floor = data.agencyMinimumSavingMinor ?? agencyMinimumSavingMinor(currency);
      const choices = minimumSavingChoices(currency).filter(value => value >= floor);
      const selected = choices.includes(chosen) ? chosen : choices.includes(data.watch?.minimumSavingMinor) ? data.watch.minimumSavingMinor : choices[0];
      $('minimum-options').replaceChildren(...choices.map((value, index) => {
        const label = node('label', undefined, 'chip'); const input = node('input');
        input.type = 'radio'; input.name = 'minimum-saving'; input.value = String(value); input.checked = value === selected;
        const text = node('span', undefined, 'chip-text');
        text.append(node('strong', index === 0 ? 'Any drop' : '-' + formatMoney(value, currency).replace(currency + ' ', '')),
          node('span', index === 0 ? formatMoney(value, currency) + ' or more' : currency + ' or more'));
        label.append(input, text); return label;
      }));
      $('judge-consent').checked = Boolean(data.watch);
      $('setup-message').textContent = ''; $('setup-message').classList.remove('error');
      $('arm-watch').textContent = data.watch ? 'Update my Drop Watch' : 'Arm my Drop Watch'; $('arm-watch').disabled = false;
    },
    chosenMinimum() { return Number(document.querySelector('input[name="minimum-saving"]:checked')?.value); },
    // Replays the captured check: a short playful beat, never a live search.
    async playCheck(data, isCurrent) {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const found = data.watch.firstCheck.dropOptionIds.length;
      $('checking-replay').textContent = 'Replayed check · captured ' + formatInstant(data.watch.firstCheck.checkedAt) + ' · not live';
      $('checking-title').textContent = 'Checking for drops';
      $('checking-status').textContent = 'Replaying the check from ' + formatInstant(data.watch.firstCheck.checkedAt) + '.';
      $('checking-screen').classList.remove('checked');
      await new Promise(resolve => setTimeout(resolve, reduced ? 500 : 1500));
      if (!isCurrent()) return false;
      $('checking-screen').classList.add('checked');
      $('checking-title').textContent = 'Drop Watch armed';
      $('checking-status').textContent = found ? 'Drop Watch armed. ' + found + (found === 1 ? ' drop' : ' drops') + ' above your minimum.' : 'Drop Watch armed. No drops above your minimum yet.';
      await new Promise(resolve => setTimeout(resolve, reduced ? 200 : 700));
      return isCurrent();
    },
    armedDetail(data) {
      const currency = data.baseline.quotedRetail.currency; const minimum = data.watch.minimumSavingMinor;
      const floor = data.agencyMinimumSavingMinor ?? agencyMinimumSavingMinor(currency);
      return (minimum <= floor ? 'Any drop of ' : 'Drops of ') + formatMoney(minimum, currency) + ' or more · replayed check from ' + formatInstant(data.watch.firstCheck.checkedAt);
    },
  };
}
