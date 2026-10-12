import { createHash } from 'node:crypto';
import { assertMoney, calculateNetSaving } from './money.mjs';

const conditionKeys = ['boardBasis', 'bedType', 'nonSmoking', 'accessible', 'view', 'roomSizeSqm'];
const frequencies = ['weekly', 'daily', 'offers-only'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const known = value => ['string', 'number', 'boolean'].includes(typeof value) && (typeof value !== 'string' || value.trim() !== '') && (typeof value !== 'number' || Number.isFinite(value));
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const nonNegativeInteger = value => Number.isSafeInteger(value) && value >= 0;

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  if (!civilDate(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23
      || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return NaN;
  return Date.parse(value);
}
function zone(value) {
  if (typeof value !== 'string' || !value) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}
function civilDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export function validatePreferences(preferences, { booking, agencyMinimumSavingMinor }) {
  const details = [];
  const input = isRecord(preferences) ? preferences : {};
  if (!isRecord(preferences)) details.push('preferences must be an object');
  const version = input.version ?? 1;
  if (!positiveInteger(version)) details.push('version must be a positive integer');
  if (!nonNegativeInteger(agencyMinimumSavingMinor)) details.push('agency minimum is invalid');
  if (!nonNegativeInteger(input.minimumSavingMinor) || input.minimumSavingMinor < agencyMinimumSavingMinor) details.push('minimum saving must meet the agency minimum');
  for (const key of ['automaticEquivalentSwitches', 'continueMonitoring']) {
    if (typeof input[key] !== 'boolean') details.push(key + ' must be a boolean');
  }
  if (!frequencies.includes(input.notificationFrequency)) details.push('notification frequency is invalid');
  if (!isRecord(input.essentialRequirements)) details.push('essential requirements must be an object');
  else for (const [key, value] of Object.entries(input.essentialRequirements)) {
    if (!conditionKeys.includes(key) || !known(value)) details.push('essential requirement ' + key + ' is unsupported or unknown');
    else if (typeof value !== typeof booking?.room?.conditions?.[key]) details.push('essential requirement ' + key + ' has an invalid type');
  }
  if (details.length) {
    const error = new Error('Invalid preferences');
    error.code = 'INVALID_PREFERENCES';
    error.details = details;
    throw error;
  }
  return { version, essentialRequirements: { ...input.essentialRequirements }, automaticEquivalentSwitches: input.automaticEquivalentSwitches,
    minimumSavingMinor: input.minimumSavingMinor, notificationFrequency: input.notificationFrequency, continueMonitoring: input.continueMonitoring };
}

export function materialFingerprint({ booking, offer, preferences }) {
  const material = {
    booking: { bookingId: booking?.bookingId, version: booking?.version, scope: booking?.scope, roomCount: booking?.roomCount,
      hotelId: booking?.hotel?.id, stay: booking?.stay, occupancy: booking?.occupancy, room: booking?.room?.conditions,
      retail: booking?.retail, supplierCost: booking?.supplierCost, cancellation: booking?.cancellation },
    offer: { offerId: offer?.offerId, version: offer?.version, bookingVersion: offer?.bookingVersion, category: offer?.category,
      hotelId: offer?.hotel?.id, identity: offer?.identity, stay: offer?.stay, occupancy: offer?.occupancy, room: offer?.room?.conditions,
      equivalence: offer?.equivalence, retail: offer?.retail, supplierCost: offer?.supplierCost, cancellation: offer?.cancellation, refundQuote: offer?.refundQuote },
    preferences: { version: preferences?.version, essentialRequirements: preferences?.essentialRequirements,
      minimumSavingMinor: preferences?.minimumSavingMinor, automaticEquivalentSwitches: preferences?.automaticEquivalentSwitches,
      continueMonitoring: preferences?.continueMonitoring },
  };
  return createHash('sha256').update(JSON.stringify(canonical(material))).digest('hex');
}

export function isApprovalValid(approval, { booking, offer, preferences, now }) {
  const time = now instanceof Date ? now.getTime() : instant(now);
  if (!approval || !Number.isFinite(time) || approval.confirmed !== true || approval.revokedAt
      || approval.bookingId !== booking?.bookingId || approval.bookingVersion !== booking?.version
      || approval.preferenceVersion !== preferences?.version || !Number.isFinite(instant(approval.confirmedAt))
      || instant(approval.confirmedAt) > time) return false;
  if (approval.type === 'standing') return approval.scope === 'equivalent-only' && approval.permissionVersion === 1;
  return approval.type === 'offer' && approval.scope === 'selected-offer'
    && approval.offerId === offer?.offerId && approval.offerVersion === offer?.version
    && instant(approval.expiresAt) > time && approval.materialFingerprint === materialFingerprint({ booking, offer, preferences });
}

function occupancyValid(value) {
  return isRecord(value) && positiveInteger(value.adults)
    && ['childAges', 'infantAges'].every(key => Array.isArray(value[key]) && value[key].every(age => nonNegativeInteger(age) && age < 18));
}

function checkoutMinimum(stay) {
  if (!civilDate(stay?.checkout) || !zone(stay?.timeZone)) throw new Error('Unknown stay horizon');
  // The start of the checkout civil date is a minimum horizon, not a hotel checkout time.
  const wanted = Date.parse(stay.checkout + 'T00:00:00Z');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: stay.timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let candidate = wanted;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const displayed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    if (displayed === wanted) return candidate;
    candidate += wanted - displayed;
  }
  throw new Error('Unresolved local checkout date boundary');
}

function cancellationFacts(record, currency, now, requiredUntil) {
  if (!record || !['refundable', 'non-refundable'].includes(record.refundability)
      || !zone(record.timeZone) || !Array.isArray(record.schedule) || !record.schedule.length) throw new Error('Unknown policy');
  const tiers = record.schedule.map(tier => {
    const from = instant(tier.from);
    const to = instant(tier.to);
    assertMoney({ totalMinor: tier.penaltyMinor, currency: tier.currency });
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || tier.currency !== currency) throw new Error('Invalid cancellation tier');
    return { from, to, penalty: tier.penaltyMinor };
  });
  for (let index = 1; index < tiers.length; index++) {
    if (tiers[index - 1].to !== tiers[index].from) throw new Error('Gapped or overlapping cancellation tiers');
  }
  if (!Number.isFinite(requiredUntil) || tiers.at(-1).to < requiredUntil) throw new Error('Incomplete cancellation horizon');
  const current = tiers.find(tier => tier.from <= now && now < tier.to);
  if (!current) throw new Error('Current cancellation penalty unknown');
  if (record.refundability === 'refundable') {
    const freeUntil = instant(record.freeUntil);
    const firstPenalty = tiers.find(tier => tier.penalty > 0);
    const boundary = firstPenalty ? firstPenalty.from : tiers.at(-1).to;
    if (!Number.isFinite(freeUntil) || freeUntil !== boundary || tiers[0].penalty !== 0) throw new Error('Inconsistent free deadline');
  } else if (record.freeUntil !== null || tiers.some(tier => tier.penalty === 0)) throw new Error('Inconsistent non-refundable policy');
  return { tiers, current, freeUntil: record.refundability === 'refundable' ? instant(record.freeUntil) : -Infinity };
}

function preservesFlexibility(original, replacement, now) {
  if (replacement.freeUntil < original.freeUntil) return false;
  const start = Math.max(now, original.tiers[0].from);
  const end = original.tiers.at(-1).to;
  const boundaries = new Set([start, ...original.tiers.flatMap(tier => [tier.from, tier.to]),
    ...replacement.tiers.flatMap(tier => [tier.from, tier.to])]);
  for (const boundary of boundaries) {
    if (boundary < start || boundary >= end) continue;
    const oldTier = original.tiers.find(tier => tier.from <= boundary && boundary < tier.to);
    const newTier = replacement.tiers.find(tier => tier.from <= boundary && boundary < tier.to);
    if (!oldTier || !newTier || newTier.penalty > oldTier.penalty) return false;
  }
  return true;
}

export function evaluateOffer({ booking, offer, preferences, agencyMinimumSavingMinor, approvals = [], now } = {}) {
  const reasons = [];
  const add = reason => { if (!reasons.includes(reason)) reasons.push(reason); };
  let netSavingMinor = null;
  const time = now instanceof Date ? now.getTime() : instant(now);
  if (!Number.isFinite(time)) add('INVALID_CHECK_TIME');
  if (!booking || booking.scope !== 'standalone-hotel' || booking.roomCount !== 1) add('UNSUPPORTED_BOOKING_SCOPE');
  if (!positiveInteger(booking?.version) || !positiveInteger(offer?.version) || offer?.bookingVersion !== booking?.version) add('BOOKING_VERSION_MISMATCH');
  if (!booking?.bookingId || !booking?.hotel?.id || !offer?.offerId || !offer?.hotel?.id) add('MISSING_IDENTITY');
  if (!offer?.identity || offer.identity.hotelId !== offer.hotel?.id || offer.identity.roomIndex !== 1
      || ['searchId', 'hotelId', 'offerToken', 'supplierCode', 'sourceId', 'contractId', 'roomTypeId'].some(key => typeof offer.identity[key] !== 'string' || !offer.identity[key].trim())) add('MISSING_OFFER_IDENTITY');
  for (const stay of [booking?.stay, offer?.stay]) {
    if (!civilDate(stay?.checkin) || !civilDate(stay?.checkout) || stay.checkin >= stay.checkout || !zone(stay?.timeZone)) add('INVALID_STAY');
  }
  if (!same(booking?.stay, offer?.stay)) add('STAY_MISMATCH');
  if (!occupancyValid(booking?.occupancy) || !occupancyValid(offer?.occupancy)) add('UNKNOWN_OCCUPANCY');
  if (!same(booking?.occupancy, offer?.occupancy)) add('OCCUPANCY_MISMATCH');
  if (!Number.isFinite(instant(offer?.checkedAt)) || instant(offer.checkedAt) > time
      || !Number.isFinite(instant(offer?.expiresAt)) || instant(offer.expiresAt) <= time
      || instant(offer.expiresAt) <= instant(offer.checkedAt)) add('OFFER_NOT_CURRENT');
  if (!['simulated-rate-check', 'rates', 'revalidated'].includes(offer?.checkKind)) add('UNVERIFIED_OFFER_PRICE');
  if (!nonNegativeInteger(agencyMinimumSavingMinor) || !nonNegativeInteger(preferences?.minimumSavingMinor)
      || !positiveInteger(preferences?.version) || typeof preferences?.automaticEquivalentSwitches !== 'boolean') add('INVALID_PREFERENCES');
  if (!isRecord(preferences?.essentialRequirements)) add('INVALID_PREFERENCES');
  const baseline = booking?.room?.conditions;
  const candidate = offer?.room?.conditions;
  let conditionChange = false;
  for (const key of new Set([...conditionKeys, ...Object.keys(baseline ?? {})])) {
    if (!known(baseline?.[key]) || !known(candidate?.[key])) add('UNKNOWN_ESSENTIAL_CONDITION');
    else if (!same(baseline[key], candidate[key])) conditionChange = true;
  }
  for (const [key, value] of Object.entries(preferences?.essentialRequirements ?? {})) {
    if (!conditionKeys.includes(key) || !known(value)) add('INVALID_PREFERENCES');
    if (!known(candidate?.[key])) add('UNKNOWN_ESSENTIAL_CONDITION');
    else if (!same(value, candidate[key])) add('ESSENTIAL_REQUIREMENT_MISMATCH');
  }
  if (offer?.equivalence === 'unknown' || !['verified', 'different', 'unknown'].includes(offer?.equivalence)) add('UNKNOWN_EQUIVALENCE');
  let original;
  let replacement;
  try {
    const minimumHorizon = checkoutMinimum(booking?.stay);
    original = cancellationFacts(booking?.cancellation, booking?.retail?.currency, time, minimumHorizon);
    replacement = cancellationFacts(offer?.cancellation, booking?.retail?.currency, time, Math.max(minimumHorizon, original.tiers.at(-1).to));
    if (booking.cancellation.refundability !== 'refundable' || original.freeUntil <= time || original.current.penalty !== 0) add('CANCELLATION_WINDOW_EXPIRED');
  } catch { add('UNKNOWN_CANCELLATION_POLICY'); }
  try { netSavingMinor = calculateNetSaving(booking, offer, original?.current.penalty); }
  catch { add('UNVERIFIED_REFUND_QUOTE'); }
  if (netSavingMinor !== null && nonNegativeInteger(agencyMinimumSavingMinor) && nonNegativeInteger(preferences?.minimumSavingMinor)
      && netSavingMinor < Math.max(agencyMinimumSavingMinor, preferences.minimumSavingMinor)) add('SAVING_BELOW_MINIMUM');
  if (reasons.length) return { action: 'blocked', reasons, netSavingMinor, authority: null };
  const alternative = offer.category !== 'equivalent' || offer.hotel.id !== booking.hotel.id
    || offer.equivalence !== 'verified' || conditionChange || !preservesFlexibility(original, replacement, time) || offer.version > 1;
  const input = { booking, offer, preferences, now };
  if (Array.isArray(approvals) && approvals.some(approval => approval.type === 'offer' && isApprovalValid(approval, input))) {
    return { action: 'automatic', reasons: [], netSavingMinor, authority: 'offer-approval' };
  }
  if (!alternative && preferences.automaticEquivalentSwitches && Array.isArray(approvals)
      && approvals.some(approval => approval.type === 'standing' && isApprovalValid(approval, input))) {
    return { action: 'automatic', reasons: [], netSavingMinor, authority: 'standing' };
  }
  return { action: 'approval-required', reasons: [alternative ? 'OFFER_APPROVAL_REQUIRED' : 'STANDING_PERMISSION_REQUIRED'], netSavingMinor, authority: null };
}
