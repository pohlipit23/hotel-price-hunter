import test from 'node:test';
import assert from 'node:assert/strict';
import { altovoBaseline, watchBlocker } from '../app/domain/altovo-quotation.mjs';
import { agencyMinimumSavingMinor, minimumSavingChoices, qualifyingDrops, watchTag } from '../app/public/drop-watch.js';
import { grandHyattProjection, siamKempinskiProjection, altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';

const at = value => new Date(value);

test('non-refundable Altovo quotation ignores the 1970 offer deadline sentinel and cannot start a Drop Watch', () => {
  const baseline = altovoBaseline(grandHyattProjection());
  assert.equal(baseline.quotationCode, 'AIRB000179');
  assert.deepEqual(baseline.hotel, { id: '5232813', name: 'Grand Hyatt Kuala Lumpur', star: 5, cityCode: 'KUL', countryCode: 'MY' });
  assert.deepEqual(baseline.quotedRetail, { totalMinor: 32305, currency: 'MYR' });
  assert.equal(baseline.cancellation.nonRefundable, true);
  assert.equal(baseline.cancellation.freeUntil, null);
  assert.equal(baseline.cancellationDeadline, null);
  assert.equal(baseline.freeCancellation, false);
  assert.doesNotMatch(JSON.stringify(baseline), /1970/);
  assert.equal(baseline.searchContextSource, 'agency-default');
  assert.equal(watchBlocker(baseline, at('2026-10-20T00:00:00Z')), 'NON_REFUNDABLE');
});

test('refundable quotation takes free cancellation from the zero-penalty schedule tier, not the offer field', () => {
  const projection = siamKempinskiProjection();
  projection.cancellation.offerFreeCancellationDeadline = '1970-01-01 00:00';
  const baseline = altovoBaseline(projection);
  assert.equal(baseline.cancellation.freeUntil, '2027-02-14T16:58:59.000Z');
  assert.equal(baseline.cancellationDeadline, '2027-02-14T16:58:59.000Z');
  assert.deepEqual(baseline.cancellation.schedule.map(tier => tier.penaltyMinor), [0, 233552]);
  assert.deepEqual(baseline.fx, { from: 'USD', to: 'MYR', rate: '4.0702006077', source: 'quotation' });
  assert.deepEqual(baseline.quotedSource, { totalMinor: 57381, currency: 'USD' });
});

test('watch blockers follow the injected time: open, ended window, stay started, missing facts', () => {
  const baseline = altovoBaseline(siamKempinskiProjection());
  assert.equal(watchBlocker(baseline, at('2026-10-20T00:00:00Z')), null);
  assert.equal(watchBlocker(baseline, at('2027-02-14T16:58:58Z')), null);
  assert.equal(watchBlocker(baseline, at('2027-02-14T16:58:59Z')), 'FREE_CANCELLATION_ENDED');
  assert.equal(watchBlocker(baseline, at('2027-03-01T00:00:00Z')), 'FREE_CANCELLATION_ENDED');
  const late = { ...baseline, cancellation: { ...baseline.cancellation, freeUntil: '2027-02-17T12:00:00.000Z' } };
  assert.equal(watchBlocker(late, at('2027-02-17T06:00:00Z')), 'STAY_STARTED');
  const charged = siamKempinskiProjection(); charged.cancellation.schedule[0].penaltyRetail = 100;
  assert.equal(watchBlocker(altovoBaseline(charged), at('2026-10-20T00:00:00Z')), 'NO_FREE_CANCELLATION');
  assert.equal(watchBlocker({ ...baseline, cancellation: undefined }), 'CANCELLATION_FACTS_UNKNOWN');
});

test('altovo baseline refuses unverified scope, rooms, prices and schedules', () => {
  const broken = [p => { p.booking.status = 'booked'; }, p => { p.hotel.roomCount = 2; }, p => { p.price.retailTotal = 1; },
    p => { p.cancellation.schedule = []; }, p => { p.hotel.checkin = '2027-02-16T00:00:00'; }];
  for (const patch of broken) { const projection = siamKempinskiProjection(); patch(projection); assert.throws(() => altovoBaseline(projection)); }
});

test('card tags, agency minimum and qualifying Drops are derived from facts', () => {
  const freeUntil = '2027-02-14T16:58:59.000Z';
  assert.equal(watchTag(null, freeUntil, at('2026-10-20T00:00:00Z')), 'ready');
  assert.equal(watchTag(null, freeUntil, at('2027-02-01T00:00:00Z')), 'closing-soon');
  assert.equal(watchTag('NON_REFUNDABLE', null, at('2026-10-20T00:00:00Z')), 'cannot-start');
  assert.equal(agencyMinimumSavingMinor('MYR'), 1000); assert.equal(agencyMinimumSavingMinor('JPY'), 10);
  assert.deepEqual(minimumSavingChoices('MYR'), [1000, 5000, 10000, 25000]);
  const { baseline, options } = altovoCatalogueFixture().entries[0].bundle;
  assert.deepEqual(qualifyingDrops(baseline, options, 1000).length, 3);
  assert.deepEqual(qualifyingDrops(baseline, options, 5000).map(option => option.optionId), ['option-fixture-final-deluxe', 'option-fixture-flex-premier']);
  assert.deepEqual(qualifyingDrops(baseline, options, 25000), []);
});
