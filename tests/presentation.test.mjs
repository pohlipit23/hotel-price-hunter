import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateOffer } from '../app/domain/decision.mjs';
import { featuredOffer, refundPresentation, isPriceDrop, bestDropHighlights } from '../app/public/pricing.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
const evaluated = fixture.offers.map(offer => ({ ...offer, decision: evaluateOffer({ booking: fixture.booking, offer, preferences: fixture.preferences, agencyMinimumSavingMinor: fixture.agencyMinimumSavingMinor, now: fixture.demoNow }) }));

test('featured refund uses the evaluated equivalent offer and net amount, not the gross price drop', () => {
  const offer = featuredOffer(evaluated);
  assert.equal(offer.offerId, 'DEMO_EQUIVALENT');
  assert.equal(refundPresentation(offer).minor, 5500);
  assert.notEqual(refundPresentation(offer).minor, fixture.booking.retail.totalMinor - offer.retail.totalMinor);
  assert.equal(isPriceDrop(fixture.booking, offer), true);
});

test('a blocked or missing decision never falls back to a positive fixture refund', () => {
  for (const decision of [undefined, { action: 'blocked', netSavingMinor: 5500 }, { action: 'approval-required', netSavingMinor: null }]) {
    const offer = { ...evaluated[0], decision };
    assert.equal(featuredOffer([offer]), undefined);
    assert.equal(refundPresentation(offer).available, false);
    assert.equal(refundPresentation(offer).minor, null);
  }
});

test('zero, negative, and invalid amounts are not advertised as money back', () => {
  for (const netSavingMinor of [0, -500, NaN, Infinity, 55.5]) {
    const offer = { ...evaluated[0], decision: { action: 'approval-required', netSavingMinor } };
    assert.equal(refundPresentation(offer).available, false);
    assert.equal(featuredOffer([offer]), undefined);
  }
});

test('the headline excludes changed rooms, non-refundable rates and unknown equivalence', () => {
  assert.equal(featuredOffer(evaluated.filter(offer => offer.offerId !== 'DEMO_EQUIVALENT')), undefined);
});

test('strikethrough requires a lower verified numeric total in the same currency', () => {
  const original = fixture.booking;
  for (const retail of [{totalMinor:60000,currency:'USD'}, {totalMinor:65000,currency:'USD'}, {totalMinor:54000,currency:'EUR'}, {totalMinor:null,currency:'USD'}]) {
    assert.equal(isPriceDrop(original, {retail}), false);
  }
});

const highlightOffers = fixture.offers.filter(offer => ['DEMO_EQUIVALENT', 'DEMO_DIFFERENT_ROOM', 'DEMO_DIFFERENT_HOTEL', 'DEMO_NON_REFUNDABLE'].includes(offer.offerId))
  .map(offer => ({ ...offer, decision: { action: 'approval-required', netSavingMinor: offer.refundQuote.netSavingMinor } }));

test('three best drops rank actual net savings within each booking relationship', () => {
  const refundable = highlightOffers.filter(offer => offer.cancellation.refundability === 'refundable');
  const slots = bestDropHighlights(fixture.booking, refundable);
  assert.deepEqual(slots.map(slot => slot.key), ['overall', 'hotel', 'room']);
  assert.deepEqual(slots.map(slot => slot.offer.offerId), ['DEMO_DIFFERENT_HOTEL', 'DEMO_DIFFERENT_ROOM', 'DEMO_EQUIVALENT']);
});

test('a non-refundable final drop can win all three slots without removing overlapping choices', () => {
  const slots = bestDropHighlights(fixture.booking, highlightOffers);
  assert.equal(slots.length, 3);
  assert(slots.every(slot => slot.offer.offerId === 'DEMO_NON_REFUNDABLE'));
  assert(slots.every(slot => slot.offer.cancellation.refundability === 'non-refundable'));
});

test('unverified equivalence cannot win the same-room slot and absent groups have no invented winner', () => {
  const only = highlightOffers.find(offer => offer.offerId === 'DEMO_EQUIVALENT');
  const unverified = { ...only, equivalence: 'unknown' };
  assert.equal(bestDropHighlights(fixture.booking, [unverified])[2].offer, undefined);
  assert(bestDropHighlights(fixture.booking, []).every(slot => slot.offer === undefined));
  const stale = { ...only, bookingVersion: fixture.booking.version + 1 };
  assert(bestDropHighlights(fixture.booking, [stale]).every(slot => slot.offer === undefined));
  const blocked = { ...only, decision: { action: 'blocked', netSavingMinor: 50000 } };
  assert(bestDropHighlights(fixture.booking, [blocked]).every(slot => slot.offer === undefined));
});
