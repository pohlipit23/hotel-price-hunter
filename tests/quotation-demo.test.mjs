import test from 'node:test';
import assert from 'node:assert/strict';
import { quotationBaseline, buildQuotationDemo, publicQuotationDemo } from '../app/domain/quotation-demo.mjs';

function quote() {
  const selected = { price: 100, currency: 'USD', rooms: [{ idx: 1, name: 'Original Twin', board_basis: 'Breakfast' }], free_cancellation: true };
  return { code: 'TEST-QUOTE', status: 'quote', currency_code: 'AED', total_amount: 350,
    travel_start_date: '2027-01-21T00:00:00', travel_end_date: '2027-01-22T00:00:00',
    access_token: 'PRIVATE-token', contact: { email: 'PRIVATE-email' }, products: [{ product_code: 'hotel' }],
    cart_items: [{ product_code: 'hotel', search: { payload: { country_code: 'MY', territory: 'MY',
      travelers: [{ type: 'adult', room: 1, age: 12 }, { type: 'adult', room: 1, age: 12 }] } }, product: {
      id: 'hotel-A', easygds_id: 'hotel-A', name: 'Example Hotel', room_count: 1, checkin_date: '2027-01-21', checkout_date: '2027-01-22',
      currency_info: { original: 'USD', conversion: 'AED', rate: 3.5 }, price_info: { total_amount: 350 }, selected_offer: selected } }] };
}
function observation() {
  return { context: { hotelId: 'hotel-A', stay: { checkin: '2027-01-21', checkout: '2027-01-22' },
    occupancy: { adults: 2, childAges: [], infantAges: [] }, nationality: 'my', countryResidence: 'my', checkedAt: '2026-10-16T15:00:00Z', requestId: 'PRIVATE-request' },
    sources: [{ sourceRef: 's', sourceId: 'PRIVATE-source', supplierHotelId: 'supplier-hotel', supplierCode: 'supplier' }],
    rooms: [{ roomRef: 'r', sourceRef: 's', name: 'New Twin', roomTypeId: 'PRIVATE-room' }],
    offers: [{ offerRef: 'o', sourceRef: 's', roomRef: 'r', rateDetail: 'PRIVATE-rate', contractId: 'PRIVATE-contract',
      board: { name: 'Breakfast' }, money: { currency: 'USD', priceMinor: 8000 }, cancellationEvidence: { freeCancellation: true, deadline: null } }] };
}

test('quotation adapter uses one unconverted hotel quotation with its bound AED/USD facts and search occupancy', () => {
  const baseline = quotationBaseline(quote(), 'TEST-QUOTE');
  assert.equal(baseline.sourceType, 'quotation'); assert.equal(baseline.hotel.id, 'hotel-A');
  assert.deepEqual(baseline.quotedRetail, { totalMinor: 35000, currency: 'AED' });
  assert.deepEqual(baseline.occupancy, { adults: 2, childAges: [], infantAges: [] });
  assert.equal(baseline.fx.rate, '3.5');
  assert.doesNotMatch(JSON.stringify(baseline), /PRIVATE-|contact|access_token/);
});

test('quote mapping fails closed on mismatched money, multiple rooms/products, missing child ages and a converted quotation', () => {
  for (const change of [q => { q.status = 'success'; }, q => { q.quotation_converted_booking_code = 'BOOKED'; },
    q => { q.products.push({ product_code: 'flight' }); }, q => { q.cart_items[0].product.room_count = 2; },
    q => { q.cart_items[0].product.price_info.total_amount = 349; },
    q => { q.cart_items[0].search.payload.travelers[0] = { type: 'child', room: 1 }; }]) {
    const q = quote(); change(q); assert.throws(() => quotationBaseline(q, 'TEST-QUOTE'));
  }
});

test('demo bundle keeps exact source identities private and labels FX comparisons as estimates without fees/refunds', () => {
  const bundle = buildQuotationDemo(quotationBaseline(quote(), 'TEST-QUOTE'), observation());
  const view = publicQuotationDemo(bundle);
  assert.equal(view.options[0].estimate.totalMinor, 28000);
  assert.equal(view.options[0].indicativeDifferenceMinor, 7000);
  assert.equal(view.options[0].estimate.isEstimate, true);
  assert.equal(view.transactionMode, 'selection-only'); assert.equal(view.customerRefund, null);
  assert.doesNotMatch(JSON.stringify(view), /PRIVATE-|rateDetail|contractId|sourceId/);
  assert.equal(bundle.privateReferences[view.options[0].optionId].rateDetail, 'PRIVATE-rate');
});

test('source estimates preserve sub-cent gateway decimals and round only the labelled display estimate', () => {
  const data = observation(); data.offers[0].money.priceMinor = null; data.offers[0].moneyPrecisionEvidence = { price: '80.1234' };
  const view = publicQuotationDemo(buildQuotationDemo(quotationBaseline(quote(), 'TEST-QUOTE'), data));
  assert.equal(view.options[0].sourcePrice.amount, '80.1234'); assert.equal(view.options[0].estimate.totalMinor, 28043);
});

test('foreign hotel/stay/occupancy context cannot supply quotation alternatives', () => {
  for (const change of [o => { o.context.hotelId = 'other'; }, o => { o.context.stay.checkin = '2027-01-20'; },
    o => { o.context.occupancy.adults = 1; }, o => { o.context.countryResidence = 'de'; }]) {
    const data = observation(); change(data);
    assert.throws(() => buildQuotationDemo(quotationBaseline(quote(), 'TEST-QUOTE'), data));
  }
});

// Adds one room and its offer (USD minor; the quotation is AED 350 at 3.5, booked as a refundable Original Twin with breakfast).
const add = (data, roomRef, name, priceMinor, { board = 'Breakfast', freeCancellation = true } = {}) => {
  data.rooms.push({ ...data.rooms[0], roomRef, name });
  data.offers.push({ ...data.offers[0], roomRef, board: { name: board }, money: { currency: 'USD', priceMinor }, cancellationEvidence: { freeCancellation, deadline: null } });
};
const options = data => publicQuotationDemo(buildQuotationDemo(quotationBaseline(quote(), 'TEST-QUOTE'), data)).options;

test('cheaper options rank the same room type first, then meals, then flexibility; another room type stays within the 20% cap', () => {
  const data = observation(); // New Twin at USD 80 is AED 70 below: exactly the 20% cap
  add(data, 'same', 'ORIGINAL TWIN (Non-smoking)', 6000); // 40% below, uncapped as the same room type
  add(data, 'far', 'Cheaper room', 5000); // 50% below: another room type past the cap
  add(data, 'higher', 'Higher room', 11000); // dearer than the quotation
  add(data, 'copy', 'new twin', 8100, { board: 'Breakfast ' }); // New Twin again once trimmed, a little dearer
  add(data, 'meals', 'Garden Twin', 8500, { board: 'Room Only' }); // refundable, other meals
  add(data, 'final', 'New Twin', 9000, { freeCancellation: false }); // same meals, non-refundable
  assert.deepEqual(options(data).map(option => [option.roomName, option.board, option.freeCancellation, option.indicativeDifferenceMinor]), [
    ['ORIGINAL TWIN (Non-smoking)', 'Breakfast', true, 14000], ['New Twin', 'Breakfast', true, 7000], ['New Twin', 'Breakfast', false, 3500]]);
});

test('with no cheaper plausible option the closest dearer ones stay, ranked the same way', () => {
  const data = observation(); data.offers[0].money.priceMinor = 11000;
  add(data, 'same', 'Original Twin', 12000, { freeCancellation: false });
  add(data, 'far', 'Cheaper room', 5000); // cheaper, but another room type past the cap
  assert.deepEqual(options(data).map(option => [option.roomName, option.indicativeDifferenceMinor]), [['Original Twin', -7000], ['New Twin', -3500]]);
});
