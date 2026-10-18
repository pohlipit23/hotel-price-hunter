import { watchBlocker } from './altovo-quotation.mjs';
import { agencyMinimumSavingMinor, qualifyingDrops } from '../public/drop-watch.js';
import { codeScope } from '../quotation-session-storage.mjs';

// Arming a Drop Watch and its immediate first check, as one pure session mutation.
// The caller loads the booking (getBooking: facts, current Drop set and capture) before the
// session transaction and runs `armDropWatch` inside it, so the setup and the replay commit
// together or not at all. Nothing here reads storage, the network or the clock.

// Names the consent wording the judge accepted; bump it whenever that wording changes.
export const DROP_WATCH_CONSENT_VERSION = 'roomdrop-drop-watch-consent-2026-10-18';
const REQUEST_KEYS = ['snapshotVersion', 'consent', 'minimumSavingMinor', 'expectedRevision'];
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const DROP_ID = /^[a-zA-Z0-9-]{1,100}$/;
const fail = (code, extra = {}) => { throw Object.assign(new Error('The Drop Watch could not be armed.'), { code, ...extra }); };
const clone = value => JSON.parse(JSON.stringify(value));
const receipt = watch => ({ watch: clone(watch), dropOptionIds: [...watch.firstCheck.dropOptionIds] });

// Validates the arm request body. The minimum is in the booking currency's minor units, at
// least the agency's 10.00. A missing expectedRevision means a first arm (revision 0).
export function armRequest(body, currency) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !REQUEST_KEYS.includes(key))
    || (Object.hasOwn(body, 'expectedRevision') && (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0))) fail('INVALID_WATCH');
  if (body.consent !== true) fail('WATCH_CONSENT_REQUIRED');
  if (!Number.isSafeInteger(body.minimumSavingMinor) || body.minimumSavingMinor < agencyMinimumSavingMinor(currency)) fail('MINIMUM_SAVING_INVALID');
  return { snapshotVersion: body.snapshotVersion, minimumSavingMinor: body.minimumSavingMinor, expectedRevision: body.expectedRevision ?? 0 };
}

// This session's committed watch for the booking's current versions, or null. Never mutates.
export function committedWatch(session, code, { contentVersion, dropSetVersion }) {
  const entry = session?.byCode?.[code];
  return entry && entry.contentVersion === contentVersion && entry.dropSetVersion === dropSetVersion ? entry.watch ?? null : null;
}

// The captured Drop set the replay may use. Missing or malformed data is unavailable, never an
// empty search. A Drop must already be priced in the booking currency: no implicit FX.
function capturedDrops({ bundle, capture }) {
  const currency = bundle.baseline.quotedRetail.currency; const drops = bundle.options;
  if (!['observed', 'observed-empty'].includes(capture?.status) || !INSTANT.test(capture.capturedAt ?? '') || !Array.isArray(drops)
    || (capture.status === 'observed-empty' && drops.length)
    || drops.some(drop => typeof drop?.optionId !== 'string' || !DROP_ID.test(drop.optionId) || drop.estimate?.currency !== currency
      || !Number.isSafeInteger(drop.estimate.totalMinor))
    || new Set(drops.map(drop => drop.optionId)).size !== drops.length) fail('CAPTURE_UNAVAILABLE');
  return drops;
}

// Mutates `session` (a transaction's private copy) and returns the committed receipt.
// `request` comes from armRequest; `at` is the arming moment, fixed before the transaction.
export function armDropWatch(session, { code, booking, request, at }) {
  const { contentVersion, dropSetVersion, bundle } = booking;
  if (request.snapshotVersion !== contentVersion) fail('SNAPSHOT_CHANGED');
  const { minimumSavingMinor, expectedRevision } = request;
  const committed = committedWatch(session, code, booking);
  // An identical retry (a lost acknowledgement, or the same minimum again) changes nothing.
  if (committed && committed.minimumSavingMinor === minimumSavingMinor
    && [committed.revision, committed.revision - 1].includes(expectedRevision)) return receipt(committed);
  const revision = committed?.revision ?? 0;
  if (expectedRevision !== revision) fail('WATCH_REVISION_STALE');
  const reason = watchBlocker(bundle.baseline, at);
  if (reason) fail('WATCH_CANNOT_START', { reason });
  const drops = capturedDrops(booking);
  const armedAt = at.toISOString(); const capturedAt = booking.capture.capturedAt;
  // The first check replays the captured Gateway observation; no live search runs here.
  const dropOptionIds = qualifyingDrops(bundle.baseline, drops, minimumSavingMinor).map(drop => drop.optionId);
  const watch = {
    code, revision: revision + 1, contentVersion, dropSetVersion,
    consent: { version: DROP_WATCH_CONSENT_VERSION, acceptedAt: armedAt },
    currency: bundle.baseline.quotedRetail.currency, minimumSavingMinor, armedAt,
    firstCheck: { mode: 'captured-replay', replayed: true, status: 'completed', captureStatus: booking.capture.status,
      replayedAt: armedAt, checkedAt: capturedAt, capturedAt: [capturedAt], thresholdMinor: minimumSavingMinor, dropOptionIds },
  };
  codeScope(session, code, { contentVersion, dropSetVersion }).watch = watch;
  return receipt(watch);
}
