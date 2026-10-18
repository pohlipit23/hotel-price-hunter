import { createHash, randomBytes } from 'node:crypto';
import { civilDate } from '../live-engine.mjs';
import { decimalMoney } from './live-comparison.mjs';

const fail = code => { const error = new Error('Quotation demo facts could not be verified.'); error.code = code; throw error; };
const text = value => typeof value === 'string' && value.trim() && value.length <= 500 ? value : null;
const datePart = value => typeof value === 'string' && civilDate(value.slice(0, 10)) ? value.slice(0, 10) : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function quotationBaseline(quote, expectedCode) {
  if (!text(expectedCode) || quote?.code !== expectedCode || quote.status !== 'quote' || quote.quotation_converted_booking_code
    || quote.products?.length !== 1 || quote.products[0].product_code !== 'hotel'
    || quote.cart_items?.length !== 1 || quote.cart_items[0].product_code !== 'hotel') fail('QUOTATION_SCOPE_UNVERIFIED');
  const item = quote.cart_items[0]; const hotel = item.product; const offer = hotel?.selected_offer;
  if (!text(hotel?.id) || !text(hotel.name) || hotel.room_count !== 1 || offer?.rooms?.length !== 1 || offer.rooms[0].idx !== 1) fail('QUOTATION_ROOM_UNVERIFIED');
  const checkin = datePart(quote.travel_start_date); const checkout = datePart(quote.travel_end_date);
  if (!checkin || !checkout || checkin >= checkout || datePart(hotel.checkin_date) !== checkin || datePart(hotel.checkout_date) !== checkout) fail('QUOTATION_STAY_UNVERIFIED');
  const quotedRetail = decimalMoney(quote.total_amount, quote.currency_code);
  const info = hotel.currency_info;
  if (!quotedRetail || info?.conversion !== quote.currency_code
    || decimalMoney(hotel.price_info?.total_amount, info.conversion)?.totalMinor !== quotedRetail.totalMinor) fail('QUOTATION_PRICE_UNVERIFIED');
  const quotedSource = decimalMoney(offer.price, offer.currency);
  if (!quotedSource || info.original !== quotedSource.currency || !(Number(info.rate) > 0) || !/^\d+(?:\.\d+)?$/.test(String(info.rate))) fail('QUOTATION_FX_UNVERIFIED');
  const travelers = item.search?.payload?.travelers;
  if (!Array.isArray(travelers) || !travelers.length || travelers.some(t => t.room !== 1)) fail('QUOTATION_OCCUPANCY_UNVERIFIED');
  const adults = travelers.filter(t => t.type === 'adult').length;
  const ages = type => travelers.filter(t => t.type === type).map(t => t.age);
  const childAges = ages('child'); const infantAges = ages('infant');
  if (adults < 1 || adults > 4 || adults + childAges.length + infantAges.length !== travelers.length
    || childAges.length > 4 || infantAges.length > 4 || [...childAges, ...infantAges].some(age => !Number.isInteger(age) || age < 0 || age > 17)) fail('QUOTATION_OCCUPANCY_UNVERIFIED');
  const nationality = item.search.payload.country_code?.toLowerCase();
  const countryResidence = item.search.payload.territory?.toLowerCase();
  if (!/^[a-z]{2}$/.test(nationality) || !/^[a-z]{2}$/.test(countryResidence)) fail('QUOTATION_SEARCH_CONTEXT_UNVERIFIED');
  return { sourceType: 'quotation', quotationCode: expectedCode, hotel: { id: hotel.id, name: hotel.name },
    stay: { checkin, checkout }, occupancy: { adults, childAges, infantAges },
    room: { name: text(offer.rooms[0].room_name ?? offer.rooms[0].name), board: text(offer.rooms[0].board_basis) },
    quotedRetail, quotedSource, fx: { from: quotedSource.currency, to: quotedRetail.currency, rate: String(info.rate), source: 'quotation' },
    searchContext: { nationality, countryResidence }, freeCancellation: offer.free_cancellation === true,
    cancellationDeadline: text(offer.free_cancellation_deadline) };
}

function majorFromMinor(minor, currency) {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  const raw = String(minor).padStart(digits + 1, '0'); return digits ? `${raw.slice(0, -digits)}.${raw.slice(-digits)}` : raw;
}
function rational(value) {
  if (!/^\d+(?:\.\d+)?$/.test(value) || value.length > 100) fail('DEMO_AMOUNT_UNVERIFIED');
  const [whole, fraction = ''] = value.split('.'); return { n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) };
}
function estimate(amount, fx) {
  const a = rational(amount); const b = rational(fx.rate);
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: fx.to }).resolvedOptions().maximumFractionDigits;
  const numerator = a.n * b.n * 10n ** BigInt(digits); const divisor = a.d * b.d;
  const rounded = (numerator * 2n + divisor) / (divisor * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) fail('DEMO_AMOUNT_UNVERIFIED');
  return { totalMinor: Number(rounded), currency: fx.to, isEstimate: true, basis: 'quotation-fx-before-final-pricing-and-fees' };
}

export function buildQuotationDemo(baseline, observation) {
  const context = observation?.context;
  if (context?.hotelId !== baseline.hotel.id || !same(context.stay, baseline.stay) || !same(context.occupancy, baseline.occupancy)
    || context.nationality !== baseline.searchContext.nationality || context.countryResidence !== baseline.searchContext.countryResidence) fail('QUOTATION_GATEWAY_CONTEXT_MISMATCH');
  const candidates = [];
  for (const offer of observation.offers) {
    const room = observation.rooms.find(r => r.roomRef === offer.roomRef);
    const source = observation.sources.find(s => s.sourceRef === offer.sourceRef);
    if (!room || !source || room.sourceRef !== source.sourceRef || offer.money.currency !== baseline.fx.from
      || typeof offer.rateDetail !== 'string' || !offer.rateDetail.trim()) continue;
    const amount = Number.isSafeInteger(offer.money.priceMinor) ? majorFromMinor(offer.money.priceMinor, offer.money.currency) : offer.moneyPrecisionEvidence?.price;
    if (!amount || !text(room.name)) continue;
    const converted = estimate(amount, baseline.fx);
    candidates.push({ optionId: `option-${randomBytes(16).toString('hex')}`, roomName: room.name, board: text(offer.board.name) ?? 'Board not specified',
      freeCancellation: offer.cancellationEvidence.freeCancellation, cancellationDeadline: text(offer.cancellationEvidence.deadline),
      termsVerified: false, sourcePrice: { amount, currency: offer.money.currency }, estimate: converted,
      indicativeDifferenceMinor: baseline.quotedRetail.totalMinor - converted.totalMinor,
      privateReference: { gatewayRequestId: context.requestId, rateDetail: offer.rateDetail, sourceId: source.sourceId,
        supplierCode: source.supplierCode, supplierHotelId: source.supplierHotelId, contractId: offer.contractId, roomTypeId: room.roomTypeId } });
  }
  candidates.sort((a, b) => Number(b.freeCancellation === true) - Number(a.freeCancellation === true) || a.estimate.totalMinor - b.estimate.totalMinor);
  const lower = candidates.filter(option => option.indicativeDifferenceMinor > 0);
  const seen = new Set(); const chosen = (lower.length ? lower : candidates).filter(option => {
    const key = JSON.stringify([option.roomName.toLowerCase().trim(), option.board.toLowerCase().trim(), option.freeCancellation]);
    if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0, 3);
  const privateReferences = Object.fromEntries(chosen.map(option => [option.optionId, option.privateReference]));
  const options = chosen.map(({ privateReference, ...option }) => option);
  const view = { schemaVersion: 1, transactionMode: 'selection-only', baseline, options, checkedAt: context.checkedAt,
    completeness: 'observed-options-only', customerRefund: null, reservationCreated: false };
  return { ...view, snapshotVersion: hash(view), privateReferences };
}

export function publicQuotationDemo(bundle) {
  return { schemaVersion: bundle.schemaVersion, snapshotVersion: bundle.snapshotVersion, transactionMode: 'selection-only',
    baseline: bundle.baseline, options: bundle.options, checkedAt: bundle.checkedAt,
    completeness: bundle.completeness, customerRefund: null, reservationCreated: false };
}
