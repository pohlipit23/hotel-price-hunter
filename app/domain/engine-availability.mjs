import { createHash, randomBytes } from 'node:crypto';
import { decimalMoney } from './live-comparison.mjs';
import { isDisplayedDrop } from '../public/drop-eligibility.js';
import { topDrops, withinSavingCap } from '../public/room-match.js';

// Drops of record from the EasyGDS Core Engine availability API (owner decision, 18 October 2026):
// one hotel's rates for the quotation's own dates and adults, mapped to the same bundle/option shape
// the Gateway capture produces. Engine totals are already in MYR, so no FX estimate is involved; they
// stay indicative because availability prices precede final pricing and fees.
export const ENGINE_BASIS = 'engine-myr-total-before-final-pricing-and-fees';
// Two engine profiles. The user chose the air1 staging engine (18 October 2026); its app host is pinned
// here, never read from a credentials file. The production profile stays available but unused.
export const ENGINE_PROFILES = Object.freeze({
  'staging-air1': Object.freeze({ source: 'easygds-core-engine-staging-air1', iamUrl: 'https://iam.stg-services.easygds.com/api',
    apiUrl: 'https://air1.stg-apps.easygds.com/api', hosts: /^air1\.stg-apps\.easygds\.com$/,
    keys: { email: 'EASYGDS_STG_EMAIL', secret: 'EASYGDS_STG_SECRET_KEY', scope: 'EASYGDS_STG_SCOPE_TYPE', flow: 'EASYGDS_STG_FLOW_TYPE', iam: 'EASYGDS_STG_IAM_URL' } }),
  production: Object.freeze({ source: 'easygds-core-engine-production', iamUrl: 'https://iam.services.easygds.com/api',
    apiUrl: null, hosts: /^[a-z0-9-]{1,40}\.apps\.easygds\.com$/,
    keys: { email: 'EASYGDS_EMAIL', secret: 'EASYGDS_PASSWORD', scope: 'EASYGDS_SCOPE_TYPE', flow: 'EASYGDS_FLOW_TYPE', iam: 'EASYGDS_IAM_URL', api: 'EASYGDS_API_URL' } }),
});
const profileFor = source => Object.values(ENGINE_PROFILES).find(profile => profile.source === source) ?? null;
// True when `host` is an allowed app host for the engine `source` (used by the importer too).
export const engineHostAllowed = (source, host) => Boolean(profileFor(source)?.hosts.test(host ?? ''));
const apiUrlAllowed = (source, apiUrl) => {
  let url; try { url = new URL(apiUrl); } catch { return false; }
  return url.protocol === 'https:' && url.pathname === '/api' && !url.port && !url.search && !url.username && `${url.origin}/api` === apiUrl && engineHostAllowed(source, url.hostname);
};
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

// Reads only the keys the chosen profile needs from an owner-selected .env text (EASYGDS_STG_* for
// staging-air1, EASYGDS_* for production); every other line, including EASYGDS_STG_APP_URL, is ignored.
// Missing values are refused: no default account, scope or fallback credential is ever supplied.
export function parseEngineCredentials(raw, profileName = 'staging-air1') {
  if (!Object.hasOwn(ENGINE_PROFILES, profileName)) fail('ENGINE_PROFILE_INVALID');
  const profile = ENGINE_PROFILES[profileName]; const names = Object.values(profile.keys);
  const values = {};
  for (const line of String(raw).split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z0-9_]+)\s*=(.*)$/);
    if (!match || !names.includes(match[1])) continue;
    if (Object.hasOwn(values, match[1])) fail('ENGINE_CREDENTIALS_INVALID');
    const value = match[2].trim(); values[match[1]] = /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
  }
  const get = key => values[profile.keys[key]];
  if (names.some(name => !values[name])) fail('ENGINE_CREDENTIALS_REQUIRED');
  const apiUrl = profile.apiUrl ?? get('api');
  if (!apiUrlAllowed(profile.source, apiUrl)) fail('ENGINE_HOST_NOT_ALLOWED');
  if (get('iam') !== profile.iamUrl || !get('email').includes('@') || !['System', 'Agent'].includes(get('scope')) || get('flow') !== 'Basic') fail('ENGINE_CREDENTIALS_INVALID');
  return { profile: profileName, source: profile.source, iamUrl: profile.iamUrl, apiUrl,
    credentials: { email: get('email'), secret_key: get('secret'), scope_type: get('scope'), flow_type: get('flow') } };
}

// One bounded JSON POST: no redirects, no retries, fixed failure codes and never a response body in errors.
const RESPONSE_LIMIT = 32 * 1024 * 1024;
async function postJson(fetchImpl, url, headers, body, httpCode) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000), headers, body: JSON.stringify(body) });
  } catch { fail('ENGINE_REQUEST_FAILED'); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); fail(httpCode); }
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body
    || Number(response.headers.get('content-length')) > RESPONSE_LIMIT) { await response.body?.cancel().catch(() => {}); fail('ENGINE_INVALID_RESPONSE'); }
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > RESPONSE_LIMIT) { await reader.cancel(); fail('ENGINE_INVALID_RESPONSE'); }
      chunks.push(value);
    }
  } catch (error) { if (error?.code === 'ENGINE_INVALID_RESPONSE') throw error; fail('ENGINE_REQUEST_FAILED'); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail('ENGINE_INVALID_RESPONSE'); }
}

export async function loginEngine({ credentials, iamUrl, fetchImpl }) {
  if (!Object.values(ENGINE_PROFILES).some(profile => profile.iamUrl === iamUrl)) fail('ENGINE_CREDENTIALS_INVALID');
  const data = await postJson(fetchImpl, `${iamUrl}/auth`, { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials, 'ENGINE_AUTH_FAILED');
  if (typeof data?.access_token !== 'string' || !/^[\x21-\x7e]{1,16384}$/.test(data.access_token)) fail('ENGINE_AUTH_FAILED');
  return data.access_token;
}

export const SEARCH_POSTS = 4;
export const SEARCH_INTERVAL_MS = 3000;
// The same search body is re-posted (idempotent, results accumulate) until this hotel is in and every
// hotel the engine counted has arrived; 0 of 0 counts as empty only once confirmed by a second post.
export async function captureEngineDrops({ baseline, source, apiUrl, token, fetchImpl, now = () => new Date(), sleep, contrast }) {
  if (!apiUrlAllowed(source, apiUrl)) fail('ENGINE_HOST_NOT_ALLOWED');
  const hotelId = baseline.hotel.id; const host = new URL(apiUrl).hostname;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json;charset=UTF-8', Accept: 'application/json', 'X-Territory': TERRITORY };
  const body = { checkin_date: baseline.stay.checkin, checkout_date: baseline.stay.checkout, currency_code: CURRENCY, language_code: 'en-US',
    rooms: [{ idx: 1, adults: Array(baseline.occupancy.adults).fill(ADULT_AGE), children: [], infants: [] }], hotel_ids: [hotelId], timeout: 20000 };
  let found = null; let searchId = null; let posts = 0;
  while (posts < SEARCH_POSTS) {
    if (posts) await sleep(SEARCH_INTERVAL_MS);
    posts += 1;
    const data = await postJson(fetchImpl, `${apiUrl}/v2/products/hotels/availabilities`, headers, body, 'ENGINE_HTTP_FAILED');
    if (!plain(data) || !text(data.search_id) || !Array.isArray(data.hotels) || !Number.isSafeInteger(data.total) || data.total < 0) fail('ENGINE_SEARCH_INVALID');
    if (data.hotels.some(hotel => String(hotel?.id) !== hotelId)) fail('ENGINE_HOTEL_MAPPING_UNVERIFIED');
    searchId = data.search_id;
    if (data.hotels.length && data.hotels.length >= data.total) { found = data.hotels[0]; break; }
    if (!data.hotels.length && data.total === 0 && posts >= 2) {
      return { ...engineDropBundle(baseline, { id: hotelId, offers: [] }, { checkedAt: now().toISOString(), source, host, contrast }), searchPosts: posts, hotelName: null };
    }
  }
  if (!found) fail('ENGINE_SEARCH_INCOMPLETE');
  const rates = await postJson(fetchImpl, `${apiUrl}/v2/products/hotels/availabilities/rates`, headers, { search_id: searchId, hotel_id: hotelId }, 'ENGINE_HTTP_FAILED');
  return { ...engineDropBundle(baseline, rates, { checkedAt: now().toISOString(), source, host, contrast }), searchPosts: posts, hotelName: text(found.name) };
}

// rates: the engine's `{ id, offers[] }` for this hotel. Returns the bundle, its photo source URLs
// (kept beside the bundle, never renderable) and the capture record. contrast picks the third Drop's one difference.
export function engineDropBundle(baseline, rates, { checkedAt, source, host, contrast } = {}) {
  if (!plain(rates) || !Array.isArray(rates.offers) || rates.offers.length > 5000) fail('ENGINE_RATES_INVALID');
  if (rates.id !== undefined && String(rates.id) !== baseline.hotel.id) fail('ENGINE_HOTEL_MAPPING_UNVERIFIED');
  if (!Number.isFinite(Date.parse(checkedAt)) || !engineHostAllowed(source, host) || baseline.quotedRetail.currency !== CURRENCY) fail('ENGINE_CONTEXT_INVALID');
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
    if (isDisplayedDrop(baseline, option) && withinSavingCap(baseline, option)) candidates.push({ option, url: plain(image) ? httpsUrl(image.url) : null, offerId: text(offer.id) });
  }
  const chosen = topDrops(baseline, candidates, candidate => candidate.option, contrast);
  const options = chosen.map(candidate => candidate.option);
  const view = { schemaVersion: 1, transactionMode: 'selection-only', baseline, options, checkedAt,
    completeness: 'observed-options-only', customerRefund: null, reservationCreated: false };
  const privateReferences = Object.fromEntries(chosen.map(candidate => [candidate.option.optionId, { engineOfferId: candidate.offerId }]));
  return {
    bundle: { ...view, snapshotVersion: hash(view), privateReferences },
    imageSources: { kind: IMAGE_SOURCES_KIND, renderable: false, hotel: null,
      drops: chosen.map(candidate => ({ optionId: candidate.option.optionId, url: candidate.url, caption: null })) },
    capture: { status: rates.offers.length ? 'observed' : 'observed-empty', checkedAt, offerCount: rates.offers.length, optionCount: options.length,
      searchDefaults: ENGINE_SEARCH_DEFAULTS, provenance: { source, host } },
  };
}
