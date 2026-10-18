import { decimalMoney } from './live-comparison.mjs';

// Turns an allowlisted Altovo share-link projection into the quotation baseline the
// RoomDrop demo already understands, plus the cancellation facts a Drop Watch needs.
const fail = code => { const error = new Error('Altovo quotation facts could not be verified.'); error.code = code; throw error; };
const text = value => typeof value === 'string' && value.trim() && value.length <= 500 ? value.trim() : null;
const datePart = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
const instant = value => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && Date.parse(value) > Date.parse('2000-01-01') ? new Date(value).toISOString() : null;

// Altovo search details (nationality, residency, child ages) are not in the share-link read,
// so the demo uses the agency's home market and adults-only occupancy and says so.
export const AGENCY_SEARCH_CONTEXT = Object.freeze({ nationality: 'my', countryResidence: 'my', source: 'agency-default' });

export function altovoBaseline(projection) {
  const b = projection?.booking; const h = projection?.hotel; const r = projection?.room; const p = projection?.price; const c = projection?.cancellation;
  if (!text(b?.code) || !/^[A-Z0-9]{4,20}$/.test(b.code) || b.status !== 'quote') fail('ALTOVO_QUOTE_SCOPE_UNVERIFIED');
  if (!text(h?.name) || !/^\d{1,20}$/.test(h.gatewayHotelId ?? '') || h.roomCount !== 1) fail('ALTOVO_ROOM_UNVERIFIED');
  const checkin = datePart(b.travelStart); const checkout = datePart(b.travelEnd);
  if (!checkin || !checkout || checkin >= checkout || datePart(h.checkin) !== checkin || datePart(h.checkout) !== checkout) fail('ALTOVO_STAY_UNVERIFIED');
  if (!Number.isInteger(h.paxCount) || h.paxCount < 1 || h.paxCount > 4) fail('ALTOVO_OCCUPANCY_UNVERIFIED');
  const quotedRetail = decimalMoney(b.retailTotal, b.currency); const quotedSource = decimalMoney(p?.supplierTotal, p?.supplierCurrency);
  if (!quotedRetail || !quotedSource || !(Number(p.fxRate) > 0) || decimalMoney(p.retailTotal, b.currency)?.totalMinor !== quotedRetail.totalMinor) fail('ALTOVO_PRICE_UNVERIFIED');
  if (!Array.isArray(c?.schedule) || !c.schedule.length) fail('ALTOVO_CANCELLATION_UNVERIFIED');
  const schedule = c.schedule.map(tier => {
    const fromUtc = instant(tier.utcFrom); const toUtc = instant(tier.utcTo); const penalty = decimalMoney(tier.penaltyRetail, b.currency);
    if (!fromUtc || !toUtc || fromUtc >= toUtc || !penalty) fail('ALTOVO_CANCELLATION_UNVERIFIED');
    return { fromUtc, toUtc, penaltyMinor: penalty.totalMinor };
  }).sort((x, y) => x.fromUtc.localeCompare(y.fromUtc));
  // Trust the non-refundable flag and the schedule; Altovo's offer-level deadline can be a 1970 sentinel.
  const nonRefundable = c.offerNonRefundable === true;
  const freeTier = nonRefundable ? null : schedule.find(tier => tier.penaltyMinor === 0);
  const freeUntil = freeTier?.toUtc ?? null;
  return {
    sourceType: 'quotation', quotationCode: b.code, source: { system: 'altovo-staging', tenantHost: text(projection.tenantHost) },
    hotel: { id: h.gatewayHotelId, name: h.name, star: Number.isInteger(h.star) ? h.star : null, cityCode: text(h.cityCode), countryCode: text(h.countryCode) },
    stay: { checkin, checkout }, occupancy: { adults: h.paxCount, childAges: [], infantAges: [] },
    room: { name: text(r?.name), board: text(r?.boardBasis) },
    quotedRetail, quotedSource, fx: { from: quotedSource.currency, to: quotedRetail.currency, rate: String(p.fxRate), source: 'quotation' },
    searchContext: { nationality: AGENCY_SEARCH_CONTEXT.nationality, countryResidence: AGENCY_SEARCH_CONTEXT.countryResidence },
    searchContextSource: AGENCY_SEARCH_CONTEXT.source,
    freeCancellation: Boolean(freeUntil), cancellationDeadline: freeUntil,
    cancellation: { nonRefundable, freeUntil, currency: b.currency, schedule },
  };
}

// Why a Drop Watch cannot start, or null when it can. `at` is the moment the customer arms it.
export function watchBlocker(baseline, at = new Date()) {
  const cancellation = baseline?.cancellation;
  if (!cancellation || !Array.isArray(cancellation.schedule)) return 'CANCELLATION_FACTS_UNKNOWN';
  if (cancellation.nonRefundable) return 'NON_REFUNDABLE';
  if (!cancellation.freeUntil) return 'NO_FREE_CANCELLATION';
  if (Date.parse(cancellation.freeUntil) <= at.getTime()) return 'FREE_CANCELLATION_ENDED';
  if (Date.parse(`${baseline.stay.checkin}T00:00:00Z`) <= at.getTime()) return 'STAY_STARTED';
  return null;
}
