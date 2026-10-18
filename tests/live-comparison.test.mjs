import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createLiveEngine } from '../app/live-engine.mjs';
import { decimalMoney, readLiveComparison } from '../app/domain/live-comparison.mjs';

const now = () => new Date('2026-10-16T05:00:00Z');
const bookingCode = 'TEST-private-booking';
const timeZone = 'Asia/Kuala_Lumpur';
function source() {
  return {
    lookup: { booking_code: bookingCode, shopping_id: 'original-shopping', status: 'success', hotel: { id: 'hotel-A' } },
    detail: { code: bookingCode, status: 'success', travel_start_date: '2026-11-12', travel_end_date: '2026-11-15',
      currency_code: 'USD', products: [{ product_code: 'hotel' }],
      travelers: [{ type: 'adult', room_idx: 1, birthday: '1990-01-01', name: 'PRIVATE-NAME' },
        { type: 'child', room_idx: 1, birthday: '2018-11-13' }], contact: { email: 'PRIVATE-EMAIL' }, payment: 'PRIVATE-PAYMENT' },
    retrieve: { booking_code: bookingCode, shopping_id: 'original-shopping', status: 'vouchered', hotel: {
      id: 'hotel-A', name: 'Test hotel', currency_info: { conversion: 'USD', original: 'EUR' },
      price_info: { total_amount: '600.00', supplier_total_amount: '450.00', tax_amount: 0, vat_amount: 0 },
      rooms: [{ idx: 1, name: 'Deluxe', room_type_id: 'original-room', rate: { board_basis: 'Breakfast' } }] } },
    search: { product_code: 'hotel', search_id: 'opaque-search/$?id', expire_at: '2026-10-17T05:00:00Z', progress: 0,
      hotels: [{ id: 'hotel-A', price_info: { total_amount: 1 } }] },
    rates: { id: 'hotel-A', offers: [{ id: 'opaque-rate/$?token', source_id: 'source-X', contract_id: 'contract-X', supplier_code: 'supplier-X',
      currency_info: { conversion: 'USD', original: 'EUR' }, price_info: { total_amount: '540.00', supplier_total_amount: '400.00', tax_amount: 0, vat_amount: 0 },
      rooms: [{ idx: 1, room_type_id: 'room-X', name: 'Deluxe', board_basis: 'Breakfast' }],
      original_cancellations: [{ utc_from_date: '2026-10-16T00:00:00', utc_to_date: '2026-11-10T00:00:00', amount: 0, currency: null }] }] },
  };
}
function run(data = source(), requests = []) {
  const engine = { async read(op, input) { requests.push({ op, input: structuredClone(input) }); return structuredClone(data[op]); } };
  return readLiveComparison({ engine, bookingCode, timeZone, now });
}

test('decimal money uses exact minor units without rounding unknown precision or mixing currencies', () => {
  assert.deepEqual(decimalMoney('2274.00', 'MYR'), { totalMinor: 227400, currency: 'MYR' });
  assert.deepEqual(decimalMoney(0.29, 'USD'), { totalMinor: 29, currency: 'USD' });
  assert.deepEqual(decimalMoney('15.000', 'JPY'), { totalMinor: 15, currency: 'JPY' });
  for (const [amount, currency] of [['1.005', 'USD'], [null, 'USD'], [-1, 'USD'], ['9007199254740992', 'USD'],
    ['1e5', 'USD'], ['1.5', 'JPY'], [NaN, 'USD'], [true, 'USD'], ['1', 'ZZZ']]) {
    assert.equal(decimalMoney(amount, currency), null);
  }
});

test('private comparison binds full rates to the retrieved booking and exact age-at-checkin occupancy', async () => {
  const requests = []; const result = await run(source(), requests);
  const search = requests.find(request => request.op === 'search').input;
  assert.deepEqual(search.rooms, [{ idx: 1, adults: [36], children: [7], infants: [] }]);
  assert.equal(search.checkin_date, '2026-11-12');
  assert.equal(search.checkout_date, '2026-11-15');
  assert.deepEqual(search.hotel_ids, ['hotel-A']);
  assert.equal(search.currency_code, 'USD');
  const offer = result.offers[0];
  assert.equal(offer.identity.offerToken, 'opaque-rate/$?token');
  assert.equal(offer.identity.searchId, 'opaque-search/$?id');
  assert.equal(offer.identity.contractId, 'contract-X');
  assert.equal(offer.identity.sourceId, 'source-X');
  assert.equal(offer.identity.supplierCode, 'supplier-X');
  assert.equal(offer.identity.roomTypeId, 'room-X');
  assert.deepEqual(offer.supplierCost, { totalMinor: 40000, currency: 'EUR' });
  assert.equal(offer.retail.totalMinor, 54000);
  assert.equal(offer.priceDifferenceMinor, 6000);
  assert.equal(offer.decision.netSavingMinor, null);
  assert.equal(offer.decision.action, 'blocked');
  assert.equal(offer.actionable, false);
  assert.equal(result.searchCompleteness, 'unverified');
  assert.equal(result.customerRetailVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-NAME|PRIVATE-EMAIL|PRIVATE-PAYMENT|birthday|contact|payment/);
});

test('generic success never substitutes for verified hotel fulfilment or standalone single-room scope', async () => {
  for (const change of [data => { data.retrieve.status = 'confirmed'; }, data => { data.lookup.flight = { id: 'flight' }; },
    data => { data.detail.products.push({ product_code: 'flight' }); }, data => { data.detail.products[0].product_code = 'flight'; },
    data => { data.retrieve.hotel.rooms.push(data.retrieve.hotel.rooms[0]); }]) {
    const data = source(); change(data); const requests = [];
    await assert.rejects(run(data, requests));
    assert.equal(requests.some(request => request.op === 'search'), false);
  }
});

test('the published minimal generic response uses operator product evidence to establish hotel scope', async () => {
  const data = source(); delete data.lookup.hotel;
  const result = await run(data);
  assert.equal(result.booking.hotel.id, 'hotel-A');
  assert.equal(result.offers.length, 1);
});

test('unknown traveler types produce a fixed mapping failure before hotel search', async () => {
  const data = source(); data.detail.travelers[0].type = 'toString';
  await assert.rejects(run(data), { code: 'OCCUPANCY_MAPPING_UNVERIFIED' });
});

test('mismatched booking identity, missing dates/ages and an unknown timezone stop before search', async () => {
  for (const change of [data => { data.detail.code = 'another-booking'; }, data => { data.retrieve.shopping_id = 'another-shopping'; },
    data => { delete data.detail.travel_start_date; }, data => { data.detail.travel_end_date = '2026-11-12'; },
    data => { delete data.detail.travelers[0].birthday; }, data => { data.detail.travelers[1].room_idx = 2; },
    data => { data.detail.travelers[1].birthday = '2026-02-30'; }, data => { data.detail.currency_code = 'MYR'; }]) {
    const data = source(); change(data); const requests = [];
    await assert.rejects(run(data, requests));
    assert.equal(requests.some(request => request.op === 'search'), false);
  }
  await assert.rejects(readLiveComparison({ engine: { read() { assert.fail('must not request'); } }, bookingCode, timeZone: 'UNKNOWN', now }));
});

test('expired sessions, hotel mismatches, duplicate rate IDs and unsupported rate nesting fail explicitly', async () => {
  for (const change of [data => { data.search.expire_at = '2026-10-16T05:00:00Z'; },
    data => { data.search.hotels[0].id = 'another-hotel'; }, data => { data.rates.id = 'another-hotel'; },
    data => { data.rates.offers.push(data.rates.offers[0]); }, data => { delete data.rates.offers; data.rates.rooms = []; }]) {
    const data = source(); change(data); await assert.rejects(run(data));
  }
});

test('unknown rate currency, condition, fee, identity and naive cancellation times never become switch authority', async () => {
  for (const change of [data => { data.rates.offers[0].currency_info.conversion = 'MYR'; },
    data => { delete data.rates.offers[0].contract_id; }, data => { data.rates.offers[0].price_info.total_amount = '540.001'; },
    data => { data.rates.offers[0].price_info.currency_code = 'MYR'; }, data => { data.rates.offers[0].currency_info.conversion = { currency_code: 'USD' }; }]) {
    const data = source(); change(data); const result = await run(data); const offer = result.offers[0];
    assert.equal(offer.actionable, false);
    assert.equal(offer.decision.action, 'blocked');
    assert.equal(offer.decision.netSavingMinor, null);
    assert.equal(offer.priceDifferenceMinor, null);
  }
  const result = await run();
  assert.equal(result.offers[0].cancellation, null);
  assert.equal(result.offers[0].refundQuote, null);
  assert.equal(result.offers[0].cancellationEvidence[0].currency, null);
  assert.equal(result.offers[0].cancellationEvidence[0].utc_to_date, '2026-11-10T00:00:00');
});

test('live comparison cannot modify the public fixture or enter the frozen simulation', async () => {
  const path = new URL('../fixtures/jury-booking.json', import.meta.url);
  const before = readFileSync(path, 'utf8'); const result = await run();
  assert.equal(result.mode, 'private-live-read-only');
  assert.equal(result.isSimulated, false);
  assert.equal(result.transactionAuthority, null);
  assert.equal(result.offers[0].checkKind, 'rates');
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('malformed identifiers cannot smuggle arbitrary private objects into the observation report', async () => {
  const data = source(); data.rates.offers[0].supplier_code = { secret: 'PRIVATE-INJECTED' };
  const result = await run(data);
  assert.equal(result.offers[0].identity.supplierCode, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-INJECTED/);
});

test('actual HTTP fetch and bounded JSON parsing exercise the entire private read pipeline', async t => {
  const data = source(); const requests = [];
  const routes = { '/api/v2/bookings': 'lookup', '/api/bookings': 'detail', '/api/v2/shopping/hotels/book/retrieve': 'retrieve',
    '/api/v2/products/hotels/availabilities': 'search', '/api/v2/products/hotels/availabilities/rates': 'rates' };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, path: new URL(req.url, 'http://localhost').pathname, body: Buffer.concat(chunks).toString() });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data[routes[requests.at(-1).path]]));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const engine = createLiveEngine({ baseUrl: 'https://bonus.apps.easygds.com/api', token: 'private-test-token', authorised: true,
    fetchImpl: (url, options) => fetch(`http://127.0.0.1:${server.address().port}${url.pathname}${url.search}`, options) });
  const result = await readLiveComparison({ engine, bookingCode, timeZone, now });
  assert.equal(result.offers.length, 1);
  assert.equal(requests.length, 5);
  assert.ok(requests.every(request => Object.hasOwn(routes, request.path)));
  assert.doesNotMatch(JSON.stringify(result), /private-test-token|PRIVATE-NAME|PRIVATE-EMAIL/);
});
