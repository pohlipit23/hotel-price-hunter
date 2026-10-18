import { decimalMoney } from './live-comparison.mjs';

// Turns an allowlisted Altovo share-link projection into the quotation baseline the
// RoomDrop demo already understands, plus the cancellation facts a Drop Watch needs.
const fail = code => { const error = new Error('Altovo quotation facts could not be verified.'); error.code = code; throw error; };
const text = value => typeof value === 'string' && value.trim() && value.length <= 500 ? value.trim() : null;
const datePart = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
// Schedule instants must carry an explicit offset; a naive time would need a guessed timezone.
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const instant = value => typeof value === 'string' && UTC_INSTANT.test(value) && Date.parse(value) > Date.parse('2000-01-01T00:00:00Z') ? new Date(value).toISOString() : null;

// Altovo search details (nationality, residency, child ages) are not in the share-link read,
// so the demo uses the agency's home market and adults-only occupancy and says so.
export const AGENCY_SEARCH_CONTEXT = Object.freeze({ nationality: 'my', countryResidence: 'my', source: 'agency-default', occupancy: 'agency-default-adults-only' });
// Facts the share-link read never carries; they stay absent rather than being invented.
const SHARE_READ_ABSENT = Object.freeze(['nationality', 'countryResidence', 'childAges', 'adultChildSplit']);
const SOURCE = Object.freeze({ system: 'altovo-staging', tenantHost: 'air1.app.altovostaging.com' });

const fractionDigits = currency => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
// Source minor units times a decimal rate, rounded half up into the target currency's minor units.
function convertedMinor(source, rate, currency) {
  const [whole, fraction = ''] = rate.split('.');
  const numerator = BigInt(source.totalMinor) * BigInt(whole + fraction) * 10n ** BigInt(fractionDigits(currency));
  const divisor = 10n ** BigInt(fraction.length + fractionDigits(source.currency));
  return Number((numerator * 2n + divisor) / (divisor * 2n));
}

// Returns { nonRefundable, freeUntil } when the explicit facts agree, or null (unknown) when a
// fact is missing or two facts conflict. Free cancellation must be the leading zero-penalty tier.
function assessCancellation(c, schedule) {
  if (typeof c.offerNonRefundable !== 'boolean') return null;
  const flags = [c.offerFreeCancellation, c.productFreeCancellation].filter(flag => typeof flag === 'boolean');
  const free = schedule[0].penaltyMinor === 0 ? schedule[0] : null;
  if (schedule.slice(free ? 1 : 0).some(tier => tier.penaltyMinor === 0)) return null;
  if (c.offerNonRefundable) return free || flags.includes(true) ? null : { nonRefundable: true, freeUntil: null };
  if (!free) return flags.includes(true) ? null : { nonRefundable: false, freeUntil: null };
  const deadlines = [c.cancellationDeadline, c.productFreeCancellationDeadline, c.supplierCancellationDeadline].map(instant).filter(Boolean);
  if (flags.includes(false) || deadlines.some(deadline => deadline !== free.toUtc)) return null;
  return { nonRefundable: false, freeUntil: free.toUtc };
}

export function altovoBaseline(projection) {
  const b = projection?.booking; const h = projection?.hotel; const r = projection?.room; const p = projection?.price; const c = projection?.cancellation;
  if (!text(b?.code) || !/^[A-Z0-9]{4,20}$/.test(b.code) || b.status !== 'quote') fail('ALTOVO_QUOTE_SCOPE_UNVERIFIED');
  // The tenant host is recorded provenance; tenancy itself is proven by the owner's approved code list.
  const readAt = typeof projection.readAt === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(projection.readAt) || UTC_INSTANT.test(projection.readAt))
    && Number.isFinite(Date.parse(projection.readAt)) ? projection.readAt : null;
  if (projection.source !== SOURCE.system || projection.tenantHost !== SOURCE.tenantHost || !readAt) fail('ALTOVO_PROVENANCE_UNVERIFIED');
  if (!text(h?.name) || !/^\d{1,20}$/.test(h.gatewayHotelId ?? '') || h.roomCount !== 1) fail('ALTOVO_ROOM_UNVERIFIED');
  const checkin = datePart(b.travelStart); const checkout = datePart(b.travelEnd);
  if (!checkin || !checkout || checkin >= checkout || datePart(h.checkin) !== checkin || datePart(h.checkout) !== checkout) fail('ALTOVO_STAY_UNVERIFIED');
  if (!Number.isInteger(h.paxCount) || h.paxCount < 1 || h.paxCount > 4) fail('ALTOVO_OCCUPANCY_UNVERIFIED');
  const quotedRetail = decimalMoney(b.retailTotal, b.currency); const quotedSource = decimalMoney(p?.supplierTotal, p?.supplierCurrency);
  const fxRate = ['number', 'string'].includes(typeof p?.fxRate) && /^\d+(?:\.\d+)?$/.test(String(p.fxRate)) && Number(p.fxRate) > 0 ? String(p.fxRate) : null;
  if (!quotedRetail || !quotedSource || !fxRate || decimalMoney(p.retailTotal, b.currency)?.totalMinor !== quotedRetail.totalMinor) fail('ALTOVO_PRICE_UNVERIFIED');
  // With explicitly zero markups and tax, the retail total must be the source total at the quotation FX rate.
  if (['agentMarkup', 'markup', 'tax'].every(key => p[key] === 0) && convertedMinor(quotedSource, fxRate, quotedRetail.currency) !== quotedRetail.totalMinor) fail('ALTOVO_PRICE_UNVERIFIED');
  if (!Array.isArray(c?.schedule) || !c.schedule.length) fail('ALTOVO_CANCELLATION_UNVERIFIED');
  const schedule = c.schedule.map(tier => {
    const fromUtc = instant(tier?.utcFrom); const toUtc = instant(tier?.utcTo); const penalty = decimalMoney(tier?.penaltyRetail, b.currency);
    const sourcePenalty = tier?.penaltySupplier == null ? null : decimalMoney(tier.penaltySupplier, p.supplierCurrency);
    if (!fromUtc || !toUtc || fromUtc >= toUtc || !penalty || penalty.totalMinor > quotedRetail.totalMinor
      || (tier.penaltySupplier != null && (!sourcePenalty || sourcePenalty.totalMinor > quotedSource.totalMinor))) fail('ALTOVO_CANCELLATION_UNVERIFIED');
    return { fromUtc, toUtc, penaltyMinor: penalty.totalMinor };
  }).sort((x, y) => x.fromUtc.localeCompare(y.fromUtc));
  // Tiers must meet end to start: an overlap or a gap leaves some moment with no single known penalty.
  if (schedule.some((tier, index) => index && tier.fromUtc !== schedule[index - 1].toUtc)) fail('ALTOVO_CANCELLATION_UNVERIFIED');
  // Trust only the explicit non-refundable flag and the UTC schedule; Altovo's offer-level
  // deadline can be a 1970 sentinel or a naive local time, so it is never parsed.
  const assessed = assessCancellation(c, schedule);
  const nonRefundable = assessed?.nonRefundable ?? null; const freeUntil = assessed?.freeUntil ?? null;
  const status = assessed ? 'known' : 'unknown';
  const hotel = { id: h.gatewayHotelId, name: h.name, star: Number.isInteger(h.star) ? h.star : null, cityCode: text(h.cityCode), countryCode: text(h.countryCode) };
  const room = { name: text(r?.name), board: text(r?.boardBasis) };
  const notSupplied = [...SHARE_READ_ABSENT, ...Object.entries({ 'room.name': room.name, 'room.board': room.board, 'hotel.star': hotel.star,
    'hotel.cityCode': hotel.cityCode, 'hotel.countryCode': hotel.countryCode }).filter(([, value]) => value === null).map(([key]) => key)];
  return {
    sourceType: 'quotation', quotationCode: b.code, source: { system: SOURCE.system, tenantHost: SOURCE.tenantHost, readAt },
    hotel, stay: { checkin, checkout }, occupancy: { adults: h.paxCount, childAges: [], infantAges: [] },
    occupancySource: AGENCY_SEARCH_CONTEXT.occupancy, room, notSupplied,
    quotedRetail, quotedSource, fx: { from: quotedSource.currency, to: quotedRetail.currency, rate: fxRate, source: 'quotation' },
    searchContext: { nationality: AGENCY_SEARCH_CONTEXT.nationality, countryResidence: AGENCY_SEARCH_CONTEXT.countryResidence },
    searchContextSource: AGENCY_SEARCH_CONTEXT.source,
    freeCancellation: Boolean(freeUntil), cancellationDeadline: freeUntil,
    cancellation: { status, nonRefundable, freeUntil, currency: b.currency, schedule },
  };
}

// Why a Drop Watch cannot start, or null when it can. `at` is the moment the customer arms it.
export function watchBlocker(baseline, at = new Date()) {
  const cancellation = baseline?.cancellation;
  if (!cancellation || !Array.isArray(cancellation.schedule) || cancellation.status !== 'known') return 'CANCELLATION_FACTS_UNKNOWN';
  if (!cancellation.schedule.length || Date.parse(cancellation.schedule[0].fromUtc) > at.getTime()) return 'CANCELLATION_FACTS_UNKNOWN';
  if (cancellation.nonRefundable) return 'NON_REFUNDABLE';
  if (!cancellation.freeUntil) return 'NO_FREE_CANCELLATION';
  if (Date.parse(cancellation.freeUntil) <= at.getTime()) return 'FREE_CANCELLATION_ENDED';
  if (Date.parse(`${baseline.stay.checkin}T00:00:00Z`) <= at.getTime()) return 'STAY_STARTED';
  return null;
}
