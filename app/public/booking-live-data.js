/** Display adapter only. Estimates never become execution or refund authority. */
import { isDisplayedDrop } from './drop-eligibility.js';
export function bookingView(snapshot) {
  const b = snapshot.baseline;
  const currency = b.quotedRetail.currency;
  const booking = { version: snapshot.snapshotVersion, reference: b.quotationCode, hotel: b.hotel,
    stay: b.stay, occupancy: b.occupancy, retail: b.quotedRetail,
    room: { name: b.room.name, conditions: { boardBasis: b.room.board } } };
  const offers = snapshot.options.map(option => {
    const delta = b.quotedRetail.totalMinor - option.estimate.totalMinor;
    if (option.estimate.currency !== currency || !Number.isSafeInteger(delta)
      || delta !== option.indicativeDifferenceMinor) throw Error('Booking price comparison is unavailable.');
    return { offerId: option.optionId, bookingVersion: booking.version, hotel: b.hotel, stay: b.stay,
      occupancy: b.occupancy, room: { name: option.roomName, conditions: { boardBasis: option.board } },
      category: 'unverified', equivalence: 'unverified', retail: option.estimate,
      cancellation: { refundability: option.freeCancellation === true ? 'refundable'
        : option.freeCancellation === false ? 'non-refundable' : 'unknown' },
      displaySaving: { available: delta > 0, minor: delta, isEstimate: true }, option };
  });
  const ranked = offers.filter(offer => isDisplayedDrop(b, offer.option)).toSorted((a, b) => b.displaySaving.minor - a.displaySaving.minor);
  const flexible = ranked.find(offer => offer.option.freeCancellation === true && offer !== ranked[0]);
  const remaining = ranked.filter(offer => offer !== ranked[0] && offer !== flexible);
  const picks = [ranked[0], flexible, ...remaining].filter(Boolean).slice(0, 3);
  const highlights = picks.map((offer, index) => ({ key: index === 0 ? 'overall' : index === 1 ? 'hotel' : 'room',
    label: index === 0 ? 'Best drop' : offer === flexible ? 'More flexibility' : 'Another drop', offer }));
  return { bookingDemo: true, booking, offers, highlights,
    currency: { code: currency, minorUnit: new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits } };
}
