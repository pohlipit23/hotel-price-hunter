/** Display adapter only. Estimates never become execution or refund authority. */
import { isDisplayedDrop } from './drop-eligibility.js';
const instant = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
export function watchBinding(watch) {
  if (typeof watch === 'string') { try { watch = JSON.parse(watch); } catch { return null; } }
  const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
  return watch && typeof watch === 'object' ? JSON.stringify(ordered(watch)) : null;
}
// Consume the committed receipt. Never derive qualifying membership from all captured Drops.
export function replayResult(snapshot) {
  const watch = snapshot.watch;
  if (!watch) return { status: 'not-armed', options: [], capturedAt: [], replayedAt: null };
  const first = watch.firstCheck;
  const unavailable = { status: 'unavailable', options: [], capturedAt: [], replayedAt: null };
  if (!first || first.replayed !== true || (first.status !== undefined && first.status !== 'completed')
    || (first.captureStatus !== undefined && (!['observed', 'observed-empty'].includes(first.captureStatus)
      || (first.captureStatus === 'observed-empty' && snapshot.options.length > 0)
      || (snapshot.capture?.status !== undefined && snapshot.capture.status !== first.captureStatus)))
    || (first.mode !== undefined && first.mode !== 'captured-replay') || !instant(first.checkedAt)
    || !instant(first.replayedAt ?? watch.armedAt) || !Number.isSafeInteger(watch.minimumSavingMinor) || watch.minimumSavingMinor < 0
    || (watch.code !== undefined && watch.code !== snapshot.code)
    || (watch.contentVersion !== undefined && watch.contentVersion !== (snapshot.contentVersion ?? snapshot.snapshotVersion))
    || (snapshot.dropSetVersion !== undefined && watch.dropSetVersion !== snapshot.dropSetVersion)
    || (watch.currency !== undefined && watch.currency !== snapshot.baseline.quotedRetail.currency)
    || (first.thresholdMinor !== undefined && first.thresholdMinor !== watch.minimumSavingMinor)
    || !Array.isArray(first.dropOptionIds) || new Set(first.dropOptionIds).size !== first.dropOptionIds.length) return unavailable;
  const capturedAt = first.capturedAt ?? [first.checkedAt];
  if (!Array.isArray(capturedAt) || !capturedAt.length || capturedAt.some(value => !instant(value))) return unavailable;
  const options = first.dropOptionIds.map(id => snapshot.options.find(option => option.optionId === id));
  if (options.some(option => !option || !isDisplayedDrop(snapshot.baseline, option)
    || option.estimate.currency !== snapshot.baseline.quotedRetail.currency)) return unavailable;
  return { status: options.length ? 'completed' : 'empty', options, capturedAt, replayedAt: first.replayedAt ?? watch.armedAt };
}
export function currentConfirmation(snapshot) {
  const receipt = snapshot.confirmation;
  if (!receipt || receipt.snapshotVersion !== snapshot.snapshotVersion || receipt.reservationCreated !== false
    || receipt.quoteModified !== false || receipt.customerRefund !== null) return null;
  if (snapshot.code && (!replayResult(snapshot).options.some(option => option.optionId === receipt.optionId)
    || (snapshot.watch?.revision !== undefined && receipt.watchRevision !== snapshot.watch.revision)
    || (receipt.watchBinding !== undefined && receipt.watchBinding !== watchBinding(snapshot.watch)))) return null;
  return receipt;
}
export function comparisonLabels(baseline, option) {
  const label = value => String(value ?? '').trim().toLowerCase();
  const flag = value => value === true ? true : value === false ? false : null;
  return {
    room: label(baseline.room.name) === label(option.roomName) ? 'Same' : 'Different',
    meals: label(baseline.room.board) === label(option.board) ? 'Same' : 'Different',
    cancellation: flag(baseline.freeCancellation) === flag(option.freeCancellation) ? 'Same' : 'Different',
  };
}
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
