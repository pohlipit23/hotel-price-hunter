import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseGatewayRates } from '../app/domain/gateway-rates.mjs';

const input = () => ({ ip: '127.0.0.1', price_comparison: false, checkin: '2026-11-12', checkout: '2026-11-15', package: false,
  ids: ['hotel-A'], supplier_ids: [], rooms: [{ idx: 1, adults: 2, children: [8], infants: [] }],
  session_id: 'PRIVATE-session', user_agent: 'PRIVATE-agent', nationality: 'my', language_code: 'en-US', country_residence: 'my' });
const source = () => ({ success: true, request_id: 'opaque-request', progress: 0, account: { email: 'PRIVATE-email' }, data: [{
  hotel_id: 'supplier-hotel', easygds_id: 'hotel-A', eps_id: 'hotel-A', source_id: 'source-A', supplier_code: 'supplier-A', contract_id: 'contract-A',
  rooms: [{ idx: 1, room_type_id: 'room-A', room_name: 'Deluxe King', images: [{ url: 'PRIVATE-image' }], rates: [{
    rate_detail: 'opaque/$?&detail', contract_id: 'contract-A', board_code: 'RO', board_basis: 'Room only', currency: 'EUR',
    net_price: '100.25', gross_price: '120.50', price: 1, recommended_selling_price: '135.00', has_recommended_selling_price: true,
    tax: '2.00', free_cancellation: true, ts: '2026-10-16T10:00:00Z', email_asgard: 'PRIVATE-email',
    cancellations: [{ from: '2026-10-16T00:00:00', to: '2026-11-10T00:00:00', amount: 0 }],
    taxes_and_fees: { mandatory: [], excluded: [] },
  }] }],
}] });
const normalise = response => normaliseGatewayRates(response, { input: input(), checkedAt: '2026-10-16T10:00:00Z' });

test('gateway projection stores shared source/room context once and keeps B2B money distinct from a customer refund', () => {
  const data = source(); data.data[0].rooms[0].rates.push({ ...data.data[0].rooms[0].rates[0], rate_detail: 'other-rate' });
  const result = normalise(data);
  assert.equal(result.sources.length, 1); assert.equal(result.rooms.length, 1); assert.equal(result.offers.length, 2);
  assert.equal(result.offers[0].roomRef, result.offers[1].roomRef);
  assert.equal(result.offers[0].sourceRef, result.sources[0].sourceRef);
  assert.deepEqual(result.offers[0].money, { currency: 'EUR', priceMinor: 100, netMinor: 10025, grossMinor: 12050, recommendedSellMinor: 13500, taxMinor: 200 });
  assert.equal(result.offers[0].rateDetail, 'opaque/$?&detail');
  assert.equal(result.context.pricingBasis, 'gateway-b2b-net-gross');
  assert.equal(result.customerRefund, null); assert.equal(result.actionable, false);
  assert.equal(result.context.completeness, 'unverified');
});

test('gateway projection strips content, guest/account data, client IP and session values', () => {
  const result = normalise(source());
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-|images|email_asgard|user_agent|session_id/);
  assert.deepEqual(result.context.occupancy, { adults: 2, childAges: [8], infantAges: [] });
  assert.equal(result.sources[0].supplierHotelId, 'supplier-hotel');
  assert.equal(result.rooms[0].roomTypeId, 'room-A');
});

test('gateway cancellation evidence never invents a timezone or penalty currency from rate currency', () => {
  const result = normalise(source());
  assert.equal(result.offers[0].cancellationEvidence.tiers[0].from, '2026-10-16T00:00:00');
  assert.equal(result.offers[0].cancellationEvidence.tiers[0].currency, null);
  assert.equal(result.offers[0].cancellationEvidence.verified, false);
});

test('unknown money precision and missing net/gross remain null rather than falling back to price', () => {
  const data = source(); data.data[0].rooms[0].rates[0].net_price = '100.251'; delete data.data[0].rooms[0].rates[0].gross_price;
  const result = normalise(data);
  assert.equal(result.offers[0].money.netMinor, null); assert.equal(result.offers[0].money.grossMinor, null);
  assert.equal(result.offers[0].money.priceMinor, 100, 'generic gateway price is retained separately without inventing net or gross');
  assert.equal(result.offers[0].moneyPrecisionEvidence.net_price, '100.251');
  assert.equal(result.actionable, false);
});

test('foreign hotel mappings, unsupported occupancy and failed gateway envelopes are rejected', () => {
  for (const change of [data => { data.success = false; }, data => { data.data[0].easygds_id = 'other'; },
    data => { data.data[0].rooms[0].idx = 2; }, data => { data.request_id = null; }]) {
    const data = source(); change(data); assert.throws(() => normalise(data));
  }
});
