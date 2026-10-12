import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMoney, calculateNetSaving } from '../app/domain/money.mjs';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/jury-booking.json', import.meta.url)));
const pair = () => structuredClone({ booking: fixture.booking, offer: fixture.offers[0] });

test('retail saving deducts explicit fees and never uses supplier delta', () => {
  const { booking, offer } = pair();
  offer.supplierCost.totalMinor = 100;
  assert.equal(calculateNetSaving(booking, offer, 0), 5500);
});

test('unchanged retail with lower supplier cost yields no traveller saving', () => {
  const { booking, offer } = pair();
  offer.retail.totalMinor = 60000;
  offer.refundQuote.replacementRetailMinor = 60000;
  offer.refundQuote.netSavingMinor = -500;
  assert.equal(calculateNetSaving(booking, offer, 0), -500);
});

test('money rejects decimals, unsafe integers, null and unknown currencies', () => {
  for (const totalMinor of [2.5, Number.MAX_SAFE_INTEGER + 1, null, -1]) {
    assert.throws(() => assertMoney({ totalMinor, currency: 'USD' }));
  }
  assert.throws(() => assertMoney({ totalMinor: 2500, currency: null }));
});

test('refund arithmetic blocks unknown costs and mismatched quotes', () => {
  for (const key of ['originalCancellationMinor', 'switchFeesMinor', 'refundProcessingMinor']) {
    for (const value of [null, -1, Number.MAX_SAFE_INTEGER + 1]) {
      const { booking, offer } = pair();
      offer.refundQuote[key] = value;
      assert.throws(() => calculateNetSaving(booking, offer, 0));
    }
  }
  const { booking, offer } = pair();
  offer.refundQuote.netSavingMinor = 9999;
  assert.throws(() => calculateNetSaving(booking, offer, 0));
});

test('retail and quote currencies must match and included components must be known', () => {
  for (const alter of [
    offer => { offer.retail.currency = 'EUR'; },
    offer => { offer.refundQuote.currency = 'EUR'; },
    offer => { offer.retail.taxesMinor = null; },
    offer => { offer.retail.includedInTotal = false; },
  ]) {
    const { booking, offer } = pair();
    alter(offer);
    assert.throws(() => calculateNetSaving(booking, offer, 0));
  }
});

test('quote binds active retail snapshot and actual cancellation penalty', () => {
  const { booking, offer } = pair();
  assert.throws(() => calculateNetSaving(booking, offer, 100));
  booking.retail.totalMinor = 61000;
  assert.throws(() => calculateNetSaving(booking, offer, 0));
});

test('decision arithmetic rejects an overflowing intermediate sum', () => {
  const { booking, offer } = pair();
  offer.refundQuote.switchFeesMinor = Number.MAX_SAFE_INTEGER;
  offer.refundQuote.refundProcessingMinor = Number.MAX_SAFE_INTEGER;
  assert.throws(() => calculateNetSaving(booking, offer, 0));
});
