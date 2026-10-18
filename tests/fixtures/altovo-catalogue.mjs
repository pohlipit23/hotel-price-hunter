// Deterministic judge catalogue for tests and the local --fixture launcher.
// The two projections copy the allowlisted facts of real Altovo staging quotations
// AIRB000179 and AIRB000180. The three Drops for AIRB000180 are invented test rates.
import { createHash } from 'node:crypto';
import { altovoBaseline } from '../../app/domain/altovo-quotation.mjs';

export const FIXTURE_CHECKED_AT = '2026-10-18T12:10:00.000Z';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function grandHyattProjection() {
  return { source: 'altovo-staging', tenantHost: 'air1.app.altovostaging.com',
    booking: { code: 'AIRB000179', status: 'quote', currency: 'MYR', retailTotal: 323.05, travelStart: '2026-11-18T00:00:00', travelEnd: '2026-11-19T00:00:00' },
    hotel: { name: 'Grand Hyatt Kuala Lumpur', star: 5, countryCode: 'MY', cityCode: 'KUL', checkin: '2026-11-18T00:00:00', checkout: '2026-11-19T00:00:00',
      roomCount: 1, paxCount: 1, nightCount: 1, gatewayHotelId: '5232813' },
    room: { name: 'Azri Room', boardBasis: 'Breakfast' },
    price: { supplierCurrency: 'USD', supplierTotal: 79.37, fxRate: 4.0702006077, retailTotal: 323.05 },
    cancellation: { offerNonRefundable: true, offerFreeCancellation: false, offerFreeCancellationDeadline: '1970-01-01 00:00',
      schedule: [{ utcFrom: '2026-10-18T00:00:00+00:00', utcTo: '2026-11-18T23:59:59+00:00', penaltySupplier: 79.37, penaltyRetail: 323.05 }] } };
}
export function siamKempinskiProjection() {
  return { source: 'altovo-staging', tenantHost: 'air1.app.altovostaging.com',
    booking: { code: 'AIRB000180', status: 'quote', currency: 'MYR', retailTotal: 2335.52, travelStart: '2027-02-17T00:00:00', travelEnd: '2027-02-18T00:00:00' },
    hotel: { name: 'Siam Kempinski Hotel Bangkok', star: 5, countryCode: 'TH', cityCode: 'BKK', checkin: '2027-02-17T00:00:00', checkout: '2027-02-18T00:00:00',
      roomCount: 1, paxCount: 1, nightCount: 1, gatewayHotelId: '3135840' },
    room: { name: 'Executive Suite', boardBasis: 'Breakfast' },
    price: { supplierCurrency: 'USD', supplierTotal: 573.81, fxRate: 4.0702006077, retailTotal: 2335.52 },
    cancellation: { offerNonRefundable: false, offerFreeCancellation: true, offerFreeCancellationDeadline: '2027-02-14 16:58:59',
      schedule: [{ utcFrom: '2026-10-18T11:03:18.256544+00:00', utcTo: '2027-02-14T16:58:59+00:00', penaltySupplier: 0, penaltyRetail: 0 },
        { utcFrom: '2027-02-14T16:58:59+00:00', utcTo: '2027-02-17T16:59:59+00:00', penaltySupplier: 573.81, penaltyRetail: 2335.52 }] } };
}
// Same rounding as the quotation demo: source amount times the quotation FX rate, half up, in minor units.
function estimateMinor(amount, rate, digits = 2) {
  const parse = value => { const [whole, fraction = ''] = value.split('.'); return { n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) }; };
  const a = parse(amount); const b = parse(rate);
  const numerator = a.n * b.n * 10n ** BigInt(digits); const divisor = a.d * b.d;
  return Number((numerator * 2n + divisor) / (divisor * 2n));
}
const fakeDrops = [
  { optionId: 'option-fixture-flex-suite', roomName: 'Executive Suite (fixture rate)', board: 'Breakfast', freeCancellation: true, cancellationDeadline: '2027-02-14T16:58:59Z', amount: '562.75' },
  { optionId: 'option-fixture-final-deluxe', roomName: 'Deluxe Room (fixture rate)', board: 'Breakfast', freeCancellation: false, cancellationDeadline: null, amount: '544.00' },
  { optionId: 'option-fixture-flex-premier', roomName: 'Premier Room (fixture rate)', board: 'Room only', freeCancellation: true, cancellationDeadline: '2027-02-10T16:59:59Z', amount: '517.00' },
];
function bundle(baseline, drops) {
  const options = drops.map(({ amount, ...drop }) => {
    const totalMinor = estimateMinor(amount, baseline.fx.rate);
    return { ...drop, termsVerified: false, sourcePrice: { amount, currency: baseline.fx.from },
      estimate: { totalMinor, currency: baseline.fx.to, isEstimate: true, basis: 'quotation-fx-before-final-pricing-and-fees' },
      indicativeDifferenceMinor: baseline.quotedRetail.totalMinor - totalMinor };
  });
  const view = { schemaVersion: 1, transactionMode: 'selection-only', baseline, options, checkedAt: FIXTURE_CHECKED_AT,
    completeness: options.length ? 'observed-options-only' : 'no-search-watch-cannot-start', customerRefund: null, reservationCreated: false };
  const privateReferences = Object.fromEntries(options.map(option => [option.optionId,
    { gatewayRequestId: 'fixture-request', rateDetail: `FIXTURE-PRIVATE-${option.optionId}`, sourceId: 'fixture-source', supplierCode: 'FIXTURE', contractId: 'fixture-contract' }]));
  return { ...view, snapshotVersion: hash(view), privateReferences };
}
// Private catalogue shape written by scripts/prepare-altovo-catalogue.mjs.
export function altovoCatalogueFixture() {
  const hyatt = altovoBaseline(grandHyattProjection()); const siam = altovoBaseline(siamKempinskiProjection());
  return { schemaVersion: 1, preparedAt: FIXTURE_CHECKED_AT, entries: [
    { code: 'AIRB000180', blocker: null, bundle: bundle(siam, fakeDrops) },
    { code: 'AIRB000179', blocker: 'NON_REFUNDABLE', bundle: bundle(hyatt, []) },
  ] };
}
