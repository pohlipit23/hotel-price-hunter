import { evaluateOffer } from './decision.mjs';
import { civilDate, LiveEngineError, validateEngineInput } from '../live-engine.mjs';

const fail = code => { throw new LiveEngineError(code); };
const id = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value);
const label = value => typeof value === 'string' && value.length <= 500 ? value : null;
const currencies = new Set(Intl.supportedValuesOf('currency'));
export function decimalMoney(amount, currency) {
  if (!currencies.has(currency) || !['number', 'string'].includes(typeof amount)) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(amount));
  if (!match || match[0].length > 100) return null;
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  const fraction = match[2] ?? '';
  if (/[^0]/.test(fraction.slice(digits))) return null;
  const minor = BigInt(match[1]) * 10n ** BigInt(digits) + BigInt(fraction.slice(0, digits).padEnd(digits, '0') || '0');
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? { totalMinor: Number(minor), currency } : null;
}
function displayMoney(value) {
  const currency = value?.currency_info?.conversion; const price = value?.price_info;
  if (price?.currency_code != null && price.currency_code !== currency) return null;
  return decimalMoney(price?.total_amount, currency);
}
function supplierMoney(value) {
  const currency = value?.currency_info?.original; const price = value?.price_info;
  if (price?.supplier_currency_code != null && price.supplier_currency_code !== currency) return null;
  return decimalMoney(price?.supplier_total_amount, currency);
}
const retailObservation = value => {
  const money = displayMoney(value);
  return money ? { ...money, taxesMinor: null, feesMinor: null, includedInTotal: null } : null;
};
function occupancy(travelers, checkin) {
  if (!Array.isArray(travelers) || !travelers.length || travelers.length > 12) fail('OCCUPANCY_MAPPING_UNVERIFIED');
  const room = { idx: 1, adults: [], children: [], infants: [] };
  for (const traveler of travelers) {
    const groups = { adult: 'adults', child: 'children', infant: 'infants' };
    if (!traveler || !Object.hasOwn(groups, traveler.type) || traveler.room_idx !== 1) fail('OCCUPANCY_MAPPING_UNVERIFIED');
    const key = groups[traveler.type];
    let age = traveler.age;
    if (age === undefined && civilDate(traveler.birthday) && traveler.birthday <= checkin) {
      age = Number(checkin.slice(0, 4)) - Number(traveler.birthday.slice(0, 4)) - (checkin.slice(5) < traveler.birthday.slice(5) ? 1 : 0);
    }
    if (!Number.isInteger(age)) fail('OCCUPANCY_MAPPING_UNVERIFIED');
    room[key].push(age);
  }
  return room;
}
function canonicalRoom(room) {
  return { name: label(room?.name), conditions: { boardBasis: label(room?.board_basis ?? room?.rate?.board_basis),
    bedType: null, nonSmoking: null, accessible: null, view: null, roomSizeSqm: null } };
}
function cancellationEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map(tier => Object.fromEntries(['from_date', 'to_date', 'utc_from_date', 'utc_to_date', 'amount', 'currency']
    .map(key => [key, typeof tier?.[key] === 'string' ? label(tier[key]) : typeof tier?.[key] === 'number' && Number.isFinite(tier[key]) ? tier[key] : null])));
}
function currentSession(search, at) {
  const value = search?.expire_at;
  if (!id(search?.search_id) || typeof value !== 'string' || !civilDate(value.slice(0, 10))
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59
    || !(Date.parse(value) > Date.parse(at))) fail('SEARCH_SESSION_NOT_CURRENT');
}

export function validateComparisonRequest(bookingCode, timeZone) {
  if (!validateEngineInput('lookup', { booking_code: bookingCode })) fail('INVALID_INPUT');
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); if (!timeZone) throw new Error(); }
  catch { fail('TIMEZONE_MAPPING_UNVERIFIED'); }
}

/** Actual-time read observations only; never supplies an executable public offer. */
export async function readLiveComparison({ engine, bookingCode, timeZone, now = () => new Date() } = {}) {
  validateComparisonRequest(bookingCode, timeZone);
  const requestedAt = now().toISOString(); const input = { booking_code: bookingCode };
  const lookup = await engine.read('lookup', input);
  if (lookup?.booking_code !== bookingCode || !id(lookup.shopping_id) || lookup.flight != null) fail('BOOKING_SCOPE_UNVERIFIED');
  const detail = await engine.read('detail', input);
  if (detail?.code !== bookingCode || !Array.isArray(detail.products) || detail.products.length !== 1
    || detail.products[0]?.product_code !== 'hotel') fail('BOOKING_SCOPE_UNVERIFIED');
  const checkin = detail.travel_start_date; const checkout = detail.travel_end_date;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
  if (!civilDate(checkin) || !civilDate(checkout) || checkin >= checkout || checkin <= today) fail('STAY_MAPPING_UNVERIFIED');
  const room = occupancy(detail.travelers, checkin);
  const retrieved = await engine.read('retrieve', input); const hotel = retrieved?.hotel;
  if (retrieved?.booking_code !== bookingCode || retrieved.shopping_id !== lookup.shopping_id
    || !id(hotel?.id) || (lookup.hotel?.id != null && lookup.hotel.id !== hotel.id)
    || !Array.isArray(hotel.rooms) || hotel.rooms.length !== 1 || hotel.rooms[0].idx !== 1) fail('BOOKING_SCOPE_UNVERIFIED');
  if (retrieved.status !== 'vouchered') fail('FULFILMENT_UNVERIFIED');
  const retail = retailObservation(hotel);
  if (!retail || detail.currency_code !== retail.currency) fail('PRICE_CURRENCY_UNVERIFIED');
  const searchInput = { checkin_date: checkin, checkout_date: checkout, currency_code: retail.currency, language_code: 'en-US',
    hotel_ids: [hotel.id], rooms: [room], timeout: 15000 };
  if (!validateEngineInput('search', searchInput)) fail('OCCUPANCY_MAPPING_UNVERIFIED');
  const booking = { bookingId: bookingCode, version: 1, scope: 'standalone-hotel', roomCount: 1,
    hotel: { id: hotel.id, name: label(hotel.name) }, stay: { checkin, checkout, timeZone },
    occupancy: { adults: room.adults.length, childAges: room.children, infantAges: room.infants },
    room: canonicalRoom(hotel.rooms[0]), retail, supplierCost: supplierMoney(hotel), cancellation: null,
    source: { kind: 'live-engine-observation' }, fulfilment: { status: retrieved.status, liveVerified: false } };
  const search = await engine.read('search', searchInput);
  currentSession(search, now().toISOString());
  if (search.product_code !== 'hotel' || !Array.isArray(search.hotels) || search.hotels.length !== 1 || search.hotels[0].id !== hotel.id) fail('SEARCH_IDENTITY_UNVERIFIED');
  const rates = await engine.read('rates', { search_id: search.search_id, hotel_id: hotel.id });
  const checkedAt = now().toISOString(); currentSession(search, checkedAt);
  if (rates?.id !== hotel.id || !Array.isArray(rates.offers) || rates.offers.length > 2000) fail('RATE_SHAPE_UNVERIFIED');
  const seen = new Set();
  const offers = rates.offers.map(raw => {
    if (!id(raw?.id) || seen.has(raw.id)) fail('RATE_IDENTITY_UNVERIFIED');
    seen.add(raw.id);
    const rateRoom = Array.isArray(raw.rooms) && raw.rooms.length === 1 && raw.rooms[0]?.idx === 1 ? raw.rooms[0] : null;
    const identity = { searchId: search.search_id, hotelId: hotel.id, offerToken: raw.id, supplierCode: raw.supplier_code,
      sourceId: raw.source_id, contractId: raw.contract_id, roomTypeId: rateRoom?.room_type_id, roomIndex: rateRoom?.idx,
      shoppingId: null, prebookId: null };
    const completeIdentity = rateRoom && ['offerToken', 'supplierCode', 'sourceId', 'contractId', 'roomTypeId'].every(key => id(identity[key]));
    const offer = { offerId: raw.id, version: 1, bookingVersion: booking.version, category: 'unverified', equivalence: 'unknown',
      identity: Object.fromEntries(Object.entries(identity).map(([key, value]) => [key, key === 'roomIndex' ? (value === 1 ? 1 : null) : id(value) ? value : null])), hotel: booking.hotel,
      stay: booking.stay, occupancy: booking.occupancy, room: canonicalRoom(rateRoom), retail: retailObservation(raw),
      supplierCost: supplierMoney(raw), cancellation: null, refundQuote: null, cancellationEvidence: cancellationEvidence(raw.original_cancellations),
      checkedAt, expiresAt: search.expire_at, checkKind: 'rates', actionable: false,
      provenance: { mode: 'live-engine', mappingStatus: 'unverified', requestedAt, checkedAt } };
    const gap = completeIdentity && offer.retail?.currency === retail.currency ? retail.totalMinor - offer.retail.totalMinor : null;
    offer.priceDifferenceMinor = Number.isSafeInteger(gap) ? gap : null;
    offer.decision = evaluateOffer({ booking, offer, preferences: { version: 1, minimumSavingMinor: 0,
      automaticEquivalentSwitches: false, essentialRequirements: {} }, agencyMinimumSavingMinor: 0, approvals: [], now: checkedAt });
    return offer;
  });
  return { mode: 'private-live-read-only', isSimulated: false, transactionAuthority: null, customerRetailVerified: false,
    comparisonBasis: 'engine-display-price', searchCompleteness: 'unverified', requestedAt, checkedAt,
    booking, offers, rateCount: offers.length, mappingStatus: 'unverified',
    gates: ['LIVE_TENANT_MAPPING_REVIEW', 'ROOM_EQUIVALENCE_UNVERIFIED', 'CANCELLATION_MAPPING_UNVERIFIED', 'CUSTOMER_REFUND_UNVERIFIED'] };
}
