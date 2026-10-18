import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { planCatalogueImport } from '../app/booking-storage.mjs';
import { altovoBaseline } from '../app/domain/altovo-quotation.mjs';
import { engineDropBundle, ENGINE_SEARCH_DEFAULTS } from '../app/domain/engine-availability.mjs';
import { siamKempinskiProjection } from './fixtures/altovo-catalogue.mjs';
import { engineOffer, engineRates } from './fixtures/engine-rates.mjs';

// Siam Kempinski quotation: MYR 2335.52 retail for 17-18 Feb 2027.
const siam = () => altovoBaseline(siamKempinskiProjection());
const CHECKED_AT = '2026-10-20T00:00:00.000Z';
const HOST = 'mh1.apps.easygds.com';
const FREE_THEN_CHARGED = [['2026-10-18T00:00:00', '2027-02-14T16:59:59', 0], ['2027-02-14T16:59:59', '2027-02-17T00:00:00', 403.29]];

test('engine offers cheaper than the quotation become up to three MYR Drops ranked by saving', () => {
  const rates = engineRates('3135840', [
    engineOffer({ id: 'a', room: 'Deluxe Room', total: 1998, tiers: FREE_THEN_CHARGED, images: [{ url: 'https://cdn.example.test/deluxe.jpg' }] }),
    engineOffer({ id: 'b', room: 'Premier Room', board: 'Room Only', total: 2100.5, nonRefundable: true, tiers: [['2026-10-18T00:00:00', '2027-02-17T00:00:00', 2100.5]],
      images: [{ url: 'http://cdn.example.test/insecure.jpg' }] }),
    engineOffer({ id: 'c', room: 'Executive Suite', total: 2400 }),
    engineOffer({ id: 'd', room: 'Deluxe Room', total: 2050, tiers: FREE_THEN_CHARGED }),
    engineOffer({ id: 'e', room: 'Club Room', total: 2200, currency: 'USD' }),
    engineOffer({ id: 'f', room: 'Studio', total: 2300, nonRefundable: true, isNonRefundable: false }),
    engineOffer({ id: 'g', room: 'Garden Room', total: 2250, tiers: [['2026-10-18T00:00:00', '2027-02-17T00:00:00', 500]] }),
  ]);
  const { bundle, imageSources, capture } = engineDropBundle(siam(), rates, { checkedAt: CHECKED_AT, host: HOST });
  assert.deepEqual(bundle.options.map(({ optionId, ...option }) => option), [
    { roomName: 'Deluxe Room', board: 'Breakfast', freeCancellation: true, cancellationDeadline: '2027-02-14T16:59:59.000Z', termsVerified: false,
      sourcePrice: { amount: '1998.00', currency: 'MYR' }, estimate: { totalMinor: 199800, currency: 'MYR', isEstimate: true, basis: 'engine-myr-total-before-final-pricing-and-fees' },
      indicativeDifferenceMinor: 33752 },
    { roomName: 'Premier Room', board: 'Room Only', freeCancellation: false, cancellationDeadline: null, termsVerified: false,
      sourcePrice: { amount: '2100.50', currency: 'MYR' }, estimate: { totalMinor: 210050, currency: 'MYR', isEstimate: true, basis: 'engine-myr-total-before-final-pricing-and-fees' },
      indicativeDifferenceMinor: 23502 },
    { roomName: 'Garden Room', board: 'Breakfast', freeCancellation: false, cancellationDeadline: null, termsVerified: false,
      sourcePrice: { amount: '2250.00', currency: 'MYR' }, estimate: { totalMinor: 225000, currency: 'MYR', isEstimate: true, basis: 'engine-myr-total-before-final-pricing-and-fees' },
      indicativeDifferenceMinor: 8552 },
  ]);
  assert.ok(bundle.options.every(option => /^option-[a-f0-9]{32}$/.test(option.optionId)));
  assert.deepEqual([bundle.checkedAt, bundle.completeness, bundle.transactionMode, bundle.customerRefund, bundle.reservationCreated],
    [CHECKED_AT, 'observed-options-only', 'selection-only', null, false]);
  assert.deepEqual(imageSources, { kind: 'remote-source-urls-pending-review', renderable: false, hotel: null,
    drops: bundle.options.map((option, index) => ({ optionId: option.optionId, url: index ? null : 'https://cdn.example.test/deluxe.jpg', caption: null })) });
  assert.deepEqual(capture, { status: 'observed', checkedAt: CHECKED_AT, offerCount: 7, optionCount: 3, searchDefaults: ENGINE_SEARCH_DEFAULTS,
    provenance: { source: 'easygds-core-engine-production', host: HOST } });
  // One adult of the agency default age 30, X-Territory MY, MYR, and no nationality field sent.
  assert.deepEqual(ENGINE_SEARCH_DEFAULTS, { occupancy: 'agency-default-adults-only', adultAge: 30, adultAgeSource: 'agency-default',
    territory: 'MY', nationality: 'not-sent', currency: 'MYR', languageCode: 'en-US', source: 'agency-default' });
  assert.doesNotMatch(JSON.stringify(bundle), /contract-fixture|source-fixture|room-type-fixture|cdn\.example/);
});

const SIAM_CARD = { code: 'AIRB000180', order: 1, cityName: 'Bangkok', scenarioLabel: 'Free cancellation', photo: null };
const engineEntry = (offers = [engineOffer({ total: 1998, tiers: FREE_THEN_CHARGED })]) => {
  const { bundle, imageSources, capture } = engineDropBundle(siam(), engineRates('3135840', offers), { checkedAt: CHECKED_AT, host: HOST });
  return { code: 'AIRB000180', blocker: null, capture, bundle, imageSources };
};
const plan = entry => planCatalogueImport({ schemaVersion: 1, entries: [entry], cards: [SIAM_CARD] })[0];
const reason = fn => { try { fn(); } catch (error) { return error.code; } return null; };

test('the importer accepts an engine capture and records its engine provenance on every Drop', () => {
  const planned = plan(engineEntry());
  assert.equal(planned.captureStatus, 'observed');
  assert.deepEqual(planned.dropSet.capture, { status: 'observed', reason: null, capturedAt: CHECKED_AT, offerCount: 1,
    searchDefaults: ENGINE_SEARCH_DEFAULTS, provenance: { source: 'easygds-core-engine-production', host: HOST } });
  assert.deepEqual(planned.drops.map(drop => [drop.facts.sourcePrice, drop.provenance]), [[{ amount: '1998.00', currency: 'MYR' },
    { source: 'easygds-core-engine-production', host: HOST, searchDefaults: ENGINE_SEARCH_DEFAULTS }]]);
  const empty = plan(engineEntry([]));
  assert.deepEqual([empty.captureStatus, empty.drops], ['observed-empty', []]);
});

test('the importer refuses engine captures whose provenance, defaults or MYR amounts do not agree', () => {
  const tampered = {
    'gateway defaults on an engine capture': entry => { entry.capture.searchDefaults = { nationality: 'my', countryResidence: 'my', occupancy: 'agency-default-adults-only', source: 'agency-default' }; },
    'unknown engine host': entry => { entry.capture.provenance.host = 'engine.example.com'; },
    'unknown source': entry => { entry.capture.provenance.source = 'somewhere-else'; },
    'extra provenance field': entry => { entry.capture.provenance.searchId = 'x'; },
  };
  for (const [name, patch] of Object.entries(tampered)) {
    const entry = engineEntry(); entry.capture = structuredClone(entry.capture); patch(entry);
    assert.equal(reason(() => plan(entry)), 'CAPTURE_MISMATCH', name);
  }
  // Option money: an engine MYR price must equal its own total; a MYR source price needs the engine basis.
  const rehash = entry => { const { privateReferences, snapshotVersion, ...view } = entry.bundle;
    entry.bundle.snapshotVersion = createHash('sha256').update(JSON.stringify(view)).digest('hex'); return entry; };
  const wrongAmount = engineEntry(); wrongAmount.bundle.options[0].sourcePrice.amount = '1990.00';
  assert.equal(reason(() => plan(rehash(wrongAmount))), 'BUNDLE_INVALID');
  const wrongBasis = engineEntry(); wrongBasis.bundle.options[0].estimate.basis = 'quotation-fx-before-final-pricing-and-fees';
  assert.equal(reason(() => plan(rehash(wrongBasis))), 'BUNDLE_INVALID');
});
