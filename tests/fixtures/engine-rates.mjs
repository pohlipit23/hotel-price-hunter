// Synthesised EasyGDS Core Engine rates responses for tests. The key layout follows the scraper's raw
// rates captures (`{ id, offers[] }`, offers with price_info, prices[], rooms[], cancellations[],
// non_refundable and is_non_refundable); every value here is invented, none is copied.
export function engineOffer({ id = 'offer-fixture', room = 'Deluxe Room', board = 'Breakfast', total = 1998, currency = 'MYR',
  nonRefundable = false, isNonRefundable = nonRefundable, tiers = [], images = [], extra = {} } = {}) {
  return {
    id, price: 400.5, currency: 'USD', price_from_USD: 400.5, contract_id: 'contract-fixture', source_id: 'source-fixture', supplier_code: 'FIXTURE',
    non_refundable: nonRefundable, supplier_non_refundable: nonRefundable, is_non_refundable: isNonRefundable,
    free_cancellation: !nonRefundable, free_cancellation_deadline: null, cancellation_deadline: null,
    rooms: [{ idx: 1, name: room, room_name: room, room_type_id: 'room-type-fixture', board_basis: board, board_code: 'BB', images }],
    cancellations: tiers.map(([from, to, amount]) => ({ from_date: from.replace('T', ' '), to_date: to.replace('T', ' '), utc_from_date: from, utc_to_date: to, amount })),
    original_cancellations: [],
    currency_info: { original: 'USD', conversion: currency, rate: 4.07 },
    price_info: { base_amount: total, tax_amount: 0, markup_amount: 0, total_amount: total },
    prices: [{ level: 'agent', currency_code: currency, total_amount: total }],
    ...extra,
  };
}
export const engineRates = (hotelId, offers) => ({ id: hotelId, offers });
export const engineAvailability = ({ searchId = 'search-fixture', hotels = [], total = hotels.length } = {}) =>
  ({ progress: 0, product_code: 'hotel', total, search_id: searchId, expire_at: '2026-10-21T00:00:00Z', hotels });
export const engineHotel = (id, name) => ({ id, name, star: 5, supplier_info: { source_code: 'FIXTURE' }, price_info: { total_amount: 1500 } });
