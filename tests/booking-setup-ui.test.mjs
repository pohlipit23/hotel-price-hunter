// Judge setup screens (F6, F7a): what the start grid, Original Booking page, setup and armed state show.
// These are the display rules in app/public/booking-judge.js; the browser walk is tests/booking-judge.browser.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JOURNEY, armRequestBody, armedDetail, cannotStart, capturedNote, cardFacts, cardPhoto, deliveryEmailField, handoffCopy, journeyStep, minimumOptions,
  roomPhoto, savedDelivery } from '../app/public/booking-judge.js';

const siam = {
  code: 'AIRB000180', blocker: null, tag: 'ready', hotel: { name: 'Siam Kempinski Hotel Bangkok', cityCode: 'BKK', countryCode: 'TH' },
  quotedRetail: { totalMinor: 233552, currency: 'MYR' },
  card: { order: 1, cityName: 'Bangkok', scenarioLabel: 'Big drop', photo: null },
};

test('a card without a reviewed photo gets the honest fallback, never a stand-in hotel picture', () => {
  assert.deepEqual(cardPhoto(siam.card), { kind: 'fallback', city: 'Bangkok' });
  assert.deepEqual(cardPhoto({ ...siam.card, photo: { asset: 'assets/siam-lobby.jpg', alt: 'Siam Kempinski lobby' } }),
    { kind: 'photo', src: '/assets/siam-lobby.jpg', alt: 'Siam Kempinski lobby' });
  // A missing card or a photo path outside the reviewed asset folder also falls back.
  assert.deepEqual(cardPhoto(null), { kind: 'fallback', city: null });
  assert.deepEqual(cardPhoto({ ...siam.card, photo: { asset: '../secret.jpg', alt: 'x' } }), { kind: 'fallback', city: 'Bangkok' });
  assert.deepEqual(cardPhoto({ ...siam.card, photo: { asset: 'https://example.com/a.jpg', alt: 'x' } }), { kind: 'fallback', city: 'Bangkok' });
});

test('the Original Booking shows a reviewed booked-room photo only when the card has one', () => {
  const pan = { ...siam.card, photo: { asset: 'assets/roomdrop-airb000181-hotel.jpg', alt: 'Pan Pacific Singapore at dusk' },
    roomPhoto: { asset: 'assets/roomdrop-airb000181-room.jpg', alt: 'Executive Marina Bay Room with a city view' } };
  assert.deepEqual(roomPhoto(pan), { src: '/assets/roomdrop-airb000181-room.jpg', alt: 'Executive Marina Bay Room with a city view' });
  // No room photo, no room picture: never the hotel photo or a stand-in passed off as the room.
  assert.equal(roomPhoto(siam.card), null);
  assert.equal(roomPhoto(null), null);
  assert.equal(roomPhoto({ ...pan, roomPhoto: { asset: 'https://example.com/room.jpg', alt: 'x' } }), null);
  assert.equal(roomPhoto({ ...pan, roomPhoto: { asset: 'assets/room.jpg', alt: '' } }), null);
});

test('a start card shows city, curated scenario label and current eligibility', () => {
  assert.deepEqual(cardFacts(siam), { city: 'Bangkok, Thailand', scenario: 'Big drop', tag: { kind: 'ready', text: 'Drop Watch ready' } });
  assert.deepEqual(cardFacts({ ...siam, tag: 'closing-soon', card: { ...siam.card, scenarioLabel: 'Closest cancellation deadline' } }),
    { city: 'Bangkok, Thailand', scenario: 'Closest cancellation deadline', tag: { kind: 'soon', text: 'Closing soon' } });
  // Once free cancellation has ended the curated label no longer advertises the old scenario.
  assert.deepEqual(cardFacts({ ...siam, blocker: 'FREE_CANCELLATION_ENDED', tag: 'cannot-start' }),
    { city: 'Bangkok, Thailand', scenario: null, tag: { kind: 'blocked', text: 'Cannot start: free cancellation ended' } });
  // Without a card the city falls back to the booking's own city and country codes.
  assert.deepEqual(cardFacts({ ...siam, card: null }).city, 'BKK, Thailand');
});

test('the Original Booking note names the Altovo staging source and the capture date', () => {
  const baseline = { source: { system: 'altovo-staging', readAt: '2026-10-18' } };
  assert.equal(capturedNote({ baseline }), 'Altovo staging quotation standing in for a confirmed booking - captured 18 Oct 2026');
  assert.equal(capturedNote({ baseline: { source: {} } }), 'Altovo staging quotation standing in for a confirmed booking');
});

test('cannot-start reasons have a title and short reason; unknown reasons stay unknown', () => {
  assert.deepEqual(cannotStart('NON_REFUNDABLE').title, 'This booking is non-refundable');
  assert.deepEqual(cannotStart('FREE_CANCELLATION_ENDED').title, 'Free cancellation has ended');
  assert.deepEqual(cannotStart('SOMETHING_NEW').title, 'Cancellation terms are unknown');
});

test('minimum choices start at the agency floor of 10.00 in the booking currency', () => {
  const myr = { baseline: { quotedRetail: { currency: 'MYR' } }, agencyMinimumSavingMinor: 1000, watch: null };
  assert.deepEqual(minimumOptions(myr), [
    { value: 1000, label: 'Any drop', caption: 'MYR 10 or more', checked: true },
    { value: 5000, label: '-50', caption: 'MYR or more', checked: false },
    { value: 10000, label: '-100', caption: 'MYR or more', checked: false },
    { value: 25000, label: '-250', caption: 'MYR or more', checked: false },
  ]);
  // Currencies without minor units, and with three, use their own precision.
  assert.deepEqual(minimumOptions({ ...myr, baseline: { quotedRetail: { currency: 'JPY' } }, agencyMinimumSavingMinor: 10 }).map(option => option.value), [10, 50, 100, 250]);
  assert.deepEqual(minimumOptions({ ...myr, baseline: { quotedRetail: { currency: 'KWD' } }, agencyMinimumSavingMinor: 10000 }).map(option => option.value), [10000, 50000, 100000, 250000]);
  // A re-arm starts from the committed minimum; an explicit choice wins.
  assert.equal(minimumOptions({ ...myr, watch: { minimumSavingMinor: 10000 } }).find(option => option.checked).value, 10000);
  assert.equal(minimumOptions({ ...myr, watch: { minimumSavingMinor: 10000 } }, 25000).find(option => option.checked).value, 25000);
  // A floor above a choice removes that choice.
  assert.deepEqual(minimumOptions({ ...myr, agencyMinimumSavingMinor: 5000 }).map(option => option.value), [5000, 10000, 25000]);
});

test('the arm request names the committed revision so a stale tab cannot replace a newer setup', () => {
  const data = { snapshotVersion: 'a'.repeat(64), watch: null };
  assert.deepEqual(armRequestBody(data, 5000), { snapshotVersion: 'a'.repeat(64), consent: true, minimumSavingMinor: 5000, expectedRevision: 0 });
  assert.equal(armRequestBody({ ...data, watch: { revision: 2 } }, 1000).expectedRevision, 2);
});

test('the arm request carries the delivery email only when the judge typed or removed one', () => {
  const data = { snapshotVersion: 'a'.repeat(64), watch: null };
  assert.deepEqual(armRequestBody(data, 5000, 'judge@example.test'),
    { snapshotVersion: 'a'.repeat(64), consent: true, minimumSavingMinor: 5000, expectedRevision: 0, deliveryEmail: 'judge@example.test' });
  assert.equal(armRequestBody(data, 5000, null).deliveryEmail, null);
  assert.equal(Object.hasOwn(armRequestBody(data, 5000, undefined), 'deliveryEmail'), false);
});

test('the delivery email field: optional, trimmed, basic format and at most 254 characters', () => {
  assert.deepEqual(deliveryEmailField(''), { email: undefined, problem: null });
  assert.deepEqual(deliveryEmailField('   '), { email: undefined, problem: null });
  assert.deepEqual(deliveryEmailField(' judge@example.test '), { email: 'judge@example.test', problem: null });
  for (const value of ['judge', 'judge@example', 'ju dge@example.test', 'a@b@example.test', 'a'.repeat(250) + '@x.io'])
    assert.equal(deliveryEmailField(value).problem, 'Check the email address, or leave it empty.', value);
  // A saved address the judge chose to remove is sent as null; an empty field otherwise keeps it.
  assert.deepEqual(deliveryEmailField('', { remove: true }), { email: null, problem: null });
  assert.equal(savedDelivery({ watch: { delivery: { channel: 'email', maskedEmail: 'j***@example.test', status: 'pending-service' } } }), 'j***@example.test');
  assert.equal(savedDelivery({ watch: { minimumSavingMinor: 1000 } }), null);
});

test('the journey strip: pick on Altovo, set up in RoomDrop, get the drop in the RoomDrop app', () => {
  assert.deepEqual(JOURNEY.map(step => [step.title, step.tag]), [['Pick a booking', null], ['Set up a drop', 'RoomDrop'], ['Get your drop', 'RoomDrop app']]);
  assert.equal(JOURNEY[0].text, "Made on Altovo's booking engine, not part of this submission. RoomDrop starts at the confirmation.");
  assert.equal(JOURNEY[1].text, 'Invite on the confirmation page (or in the confirmation email).');
  assert.equal(JOURNEY[2].text, 'Cheaper room found? It arrives by email.');
  assert.deepEqual(['catalogue-screen', 'booked-screen', 'setup-screen', 'checking-screen', 'booking-summary', 'comparison', 'simulated-switch', null].map(journeyStep),
    [1, 2, 2, 2, 3, 3, 3, null]);
});

test('the hand-off after arming says the judge leaves the booking site, from the committed receipt only', () => {
  const data = { watch: { revision: 1, firstCheck: { dropOptionIds: ['a'] } } };
  assert.deepEqual(handoffCopy(data), { title: 'Drop Watch armed', lead: "You're leaving the booking site.",
    text: 'In real life your drop arrives by email. For this demo we open the RoomDrop app now.', email: null, action: 'Open RoomDrop' });
  assert.equal(handoffCopy({ watch: { ...data.watch, delivery: { maskedEmail: 'j***@example.test', status: 'pending-service' } } }).email, 'j***@example.test');
  assert.equal(handoffCopy({ watch: null }), null);
});

test('the armed state is described only from the committed receipt', () => {
  const data = { baseline: { quotedRetail: { currency: 'MYR' } }, agencyMinimumSavingMinor: 1000,
    watch: { minimumSavingMinor: 5000, armedAt: '2026-10-20T00:00:00.000Z', firstCheck: { checkedAt: '2026-10-18T12:10:00.000Z', dropOptionIds: ['a'] } } };
  assert.equal(armedDetail(data), 'Drops of MYR 50 or more · replayed check from 18 Oct 2026, 12:10 UTC');
  assert.equal(armedDetail({ ...data, watch: { ...data.watch, minimumSavingMinor: 1000 } }), 'Any drop of MYR 10 or more · replayed check from 18 Oct 2026, 12:10 UTC');
  assert.equal(armedDetail({ ...data, watch: null }), null);
});
