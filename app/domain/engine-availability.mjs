import { createHash, randomBytes } from 'node:crypto';
import { decimalMoney } from './live-comparison.mjs';
import { isDisplayedDrop } from '../public/drop-eligibility.js';

// Drops of record from the EasyGDS Core Engine availability API (owner decision, 18 October 2026):
// one hotel's rates for the quotation's own dates and adults, mapped to the same bundle/option shape
// the Gateway capture produces. Engine totals are already in MYR, so no FX estimate is involved; they
// stay indicative because availability prices precede final pricing and fees.
export const ENGINE_SOURCE = 'easygds-core-engine-production';
export const ENGINE_BASIS = 'engine-myr-total-before-final-pricing-and-fees';
export const ENGINE_IAM_URL = 'https://iam.services.easygds.com/api';
export const ENGINE_API_URL = /^https:\/\/[a-z0-9-]{1,40}\.apps\.easygds\.com\/api$/;
export const ENGINE_HOST = /^[a-z0-9-]{1,40}\.apps\.easygds\.com$/;
const IMAGE_SOURCES_KIND = 'remote-source-urls-pending-review';
const CURRENCY = 'MYR';
const ADULT_AGE = 30;
const TERRITORY = 'MY';
// Search facts the quotation does not carry, sent as agency defaults and recorded as such.
export const ENGINE_SEARCH_DEFAULTS = Object.freeze({ occupancy: 'agency-default-adults-only', adultAge: ADULT_AGE, adultAgeSource: 'agency-default',
  territory: TERRITORY, nationality: 'not-sent', currency: CURRENCY, languageCode: 'en-US', source: 'agency-default' });

const fail = code => { const error = new Error('Engine availability facts could not be verified.'); error.code = code; throw error; };
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim() && value.length <= 500 ? value.trim() : null;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url; try { url = new URL(value); } catch { return null; }
  return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null;
}
// The guide labels utc_* cancellation dates as UTC but prints them without an offset, so a naive
// value gets Z; anything else that is not an explicit instant is refused.
function utcInstant(value) {
  if (typeof value !== 'string') return null;
  const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(value);
  if (!naive && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(naive ? `${value}Z` : value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
const majorText = minor => `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

// Refundability comes only from the explicit flags; a missing or conflicting flag is unknown. Free
// cancellation needs a leading zero-penalty tier that is still open when the capture is taken.
function cancellationFacts(offer, checkedAt) {
  const flags = [offer.non_refundable, offer.is_non_refundable].filter(flag => typeof flag === 'boolean');
  if (!flags.length || new Set(flags).size !== 1) return { freeCancellation: null, cancellationDeadline: null };
  if (flags[0]) return { freeCancellation: false, cancellationDeadline: null };
  const source = Array.isArray(offer.cancellations) && offer.cancellations.length ? offer.cancellations : offer.original_cancellations;
  if (!Array.isArray(source) || !source.length) return { freeCancellation: null, cancellationDeadline: null };
  const tiers = source.map(tier => ({ fromUtc: utcInstant(tier?.utc_from_date), toUtc: utcInstant(tier?.utc_to_date),
    amount: ['number', 'string'].includes(typeof tier?.amount) && /^\d+(?:\.\d+)?$/.test(String(tier.amount)) ? Number(tier.amount) : null }));
  if (tiers.some(tier => !tier.fromUtc || !tier.toUtc || tier.fromUtc >= tier.toUtc || tier.amount === null)) return { freeCancellation: null, cancellationDeadline: null };
  const [first] = tiers.sort((a, b) => a.fromUtc.localeCompare(b.fromUtc));
  return first.amount === 0 && Date.parse(first.toUtc) > Date.parse(checkedAt)
    ? { freeCancellation: true, cancellationDeadline: first.toUtc } : { freeCancellation: false, cancellationDeadline: null };
}

// rates: the engine's `{ id, offers[] }` for this hotel. Returns the bundle, its photo source URLs
// (kept beside the bundle, never renderable) and the capture record.
export function engineDropBundle(baseline, rates, { checkedAt, host } = {}) {
  if (!plain(rates) || !Array.isArray(rates.offers) || rates.offers.length > 5000) fail('ENGINE_RATES_INVALID');
  if (rates.id !== undefined && String(rates.id) !== baseline.hotel.id) fail('ENGINE_HOTEL_MAPPING_UNVERIFIED');
  if (!Number.isFinite(Date.parse(checkedAt)) || !ENGINE_HOST.test(host ?? '') || baseline.quotedRetail.currency !== CURRENCY) fail('ENGINE_CONTEXT_INVALID');
  const candidates = [];
  for (const offer of rates.offers) {
    if (!plain(offer) || !Array.isArray(offer.rooms) || offer.rooms.length !== 1 || !plain(offer.rooms[0])) continue;
    // The MYR total is price_info.total_amount; its currency is the first price level's.
    if (!Array.isArray(offer.prices) || offer.prices[0]?.currency_code !== CURRENCY) continue;
    const total = decimalMoney(offer.price_info?.total_amount, CURRENCY);
    const room = offer.rooms[0]; const roomName = text(room.name) ?? text(room.room_name);
    if (!total || !roomName) continue;
    const image = Array.isArray(room.images) ? room.images[0] : undefined;
    const option = { optionId: `option-${randomBytes(16).toString('hex')}`, roomName, board: text(room.board_basis) ?? 'Board not specified',
      ...cancellationFacts(offer, checkedAt), termsVerified: false, sourcePrice: { amount: majorText(total.totalMinor), currency: CURRENCY },
      estimate: { totalMinor: total.totalMinor, currency: CURRENCY, isEstimate: true, basis: ENGINE_BASIS },
      indicativeDifferenceMinor: baseline.quotedRetail.totalMinor - total.totalMinor };
    if (isDisplayedDrop(baseline, option)) candidates.push({ option, url: plain(image) ? httpsUrl(image.url) : null, offerId: text(offer.id) });
  }
  candidates.sort((a, b) => b.option.indicativeDifferenceMinor - a.option.indicativeDifferenceMinor);
  const seen = new Set();
  const chosen = candidates.filter(({ option }) => {
    const key = JSON.stringify([option.roomName.toLowerCase(), option.board.toLowerCase(), option.freeCancellation]);
    if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0, 3);
  const options = chosen.map(candidate => candidate.option);
  const view = { schemaVersion: 1, transactionMode: 'selection-only', baseline, options, checkedAt,
    completeness: 'observed-options-only', customerRefund: null, reservationCreated: false };
  const privateReferences = Object.fromEntries(chosen.map(candidate => [candidate.option.optionId, { engineOfferId: candidate.offerId }]));
  return {
    bundle: { ...view, snapshotVersion: hash(view), privateReferences },
    imageSources: { kind: IMAGE_SOURCES_KIND, renderable: false, hotel: null,
      drops: chosen.map(candidate => ({ optionId: candidate.option.optionId, url: candidate.url, caption: null })) },
    capture: { status: rates.offers.length ? 'observed' : 'observed-empty', checkedAt, offerCount: rates.offers.length, optionCount: options.length,
      searchDefaults: ENGINE_SEARCH_DEFAULTS, provenance: { source: ENGINE_SOURCE, host } },
  };
}
