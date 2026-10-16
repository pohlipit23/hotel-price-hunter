import { GatewayReadError, validateGatewayInput } from '../gateway.mjs';
import { decimalMoney } from './live-comparison.mjs';

const fail = code => { throw new GatewayReadError(code); };
const string = value => typeof value === 'string' && value.trim() ? value : null;
const primitive = value => ['string', 'number', 'boolean'].includes(typeof value) && (typeof value !== 'number' || Number.isFinite(value)) ? value : null;
const money = (value, currency) => decimalMoney(value, currency)?.totalMinor ?? null;

/** Private source observations. Price differences/refunds require separate retail evidence. */
export function normaliseGatewayRates(response, { input, checkedAt } = {}) {
  if (!validateGatewayInput(input) || !Number.isFinite(Date.parse(checkedAt)) || response?.success !== true
    || !string(response.request_id) || !Array.isArray(response.data)) fail('INVALID_GATEWAY_RATE_RESPONSE');
  const sources = []; const rooms = []; const offers = [];
  for (const source of response.data) {
    if (!source || (source.easygds_id !== input.ids[0] && source.eps_id !== input.ids[0])
      || (source.easygds_id && source.easygds_id !== input.ids[0]) || !Array.isArray(source.rooms)) fail('GATEWAY_HOTEL_MAPPING_UNVERIFIED');
    const sourceRef = `source-${sources.length}`;
    sources.push({ sourceRef, sourceId: string(source.source_id), supplierCode: string(source.supplier_code),
      supplierHotelId: string(source.hotel_id), easygdsId: string(source.easygds_id), epsId: string(source.eps_id), contractId: string(source.contract_id) });
    for (const room of source.rooms) {
      if (room?.idx !== 1 || !Array.isArray(room.rates)) fail('GATEWAY_ROOM_MAPPING_UNVERIFIED');
      const roomRef = `room-${rooms.length}`;
      rooms.push({ roomRef, sourceRef, roomTypeId: string(room.room_type_id), name: string(room.room_name), idx: 1 });
      for (const rate of room.rates) {
        if (!rate || typeof rate !== 'object' || offers.length >= 2000) fail('GATEWAY_RATE_MAPPING_UNVERIFIED');
        const currency = string(rate.currency);
        const precisionEvidence = Object.fromEntries(['price', 'net_price', 'gross_price', 'recommended_selling_price', 'tax']
          .filter(key => ['string', 'number'].includes(typeof rate[key]) && /^\d+(?:\.\d+)?$/.test(String(rate[key]))
            && money(rate[key], currency) === null).map(key => [key, String(rate[key])]));
        offers.push({ offerRef: `offer-${offers.length}`, sourceRef, roomRef, rateDetail: string(rate.rate_detail), contractId: string(rate.contract_id),
          board: { code: string(rate.board_code), name: string(rate.board_basis) },
          money: { currency, priceMinor: money(rate.price, currency), netMinor: money(rate.net_price, currency), grossMinor: money(rate.gross_price, currency),
            recommendedSellMinor: rate.has_recommended_selling_price === true ? money(rate.recommended_selling_price, currency) : null,
            taxMinor: money(rate.tax, currency) }, ...(Object.keys(precisionEvidence).length ? { moneyPrecisionEvidence: precisionEvidence } : {}),
          observedAt: string(rate.ts),
          cancellationEvidence: { verified: false, freeCancellation: typeof rate.free_cancellation === 'boolean' ? rate.free_cancellation : null,
            deadline: string(rate.free_cancellation_deadline), tiers: Array.isArray(rate.cancellations) ? rate.cancellations.map(tier => ({
              from: string(tier?.from), to: string(tier?.to), amount: primitive(tier?.amount), currency: string(tier?.currency),
            })) : null },
          taxesAndFeesEvidence: Object.fromEntries(['mandatory', 'excluded'].map(key => [key, Array.isArray(rate.taxes_and_fees?.[key])
            ? rate.taxes_and_fees[key].map(fee => Object.fromEntries(['name', 'amount', 'currency', 'included'].map(field => [field, primitive(fee?.[field])]))) : null])),
        });
      }
    }
  }
  return { context: { source: 'direct-gateway', requestId: response.request_id, hotelId: input.ids[0],
    stay: { checkin: input.checkin, checkout: input.checkout },
    occupancy: { adults: input.rooms[0].adults, childAges: [...input.rooms[0].children], infantAges: [...input.rooms[0].infants] },
    nationality: input.nationality, countryResidence: input.country_residence, checkedAt,
    pricingBasis: 'gateway-b2b-net-gross', completeness: 'unverified' },
    sources, rooms, offers, customerRefund: null, actionable: false };
}
