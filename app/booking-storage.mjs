import { createHash } from 'node:crypto';
import { AGENCY_SEARCH_CONTEXT } from './domain/altovo-quotation.mjs';
import { ENGINE_BASIS, ENGINE_SEARCH_DEFAULTS, engineHostAllowed } from './domain/engine-availability.mjs';
import { decimalMoney } from './domain/live-comparison.mjs';

// Shared, immutable curated catalogue records in Firestore:
//   {prefix}BookingsV2/{code}                         Original Booking facts and card metadata
//   {prefix}BookingsV2/{code}/dropSets/{sequence}     one captured Drop-set manifest per capture
//   {prefix}BookingsV2/{code}/drops/{dropId}          one captured Drop
// Records are created only (never updated). Judges never write here; visitor state lives in sessions.
// V2 holds the re-imported catalogue whose booking prices changed (V1 refuses changed facts); V1 stays
// untouched so an older revision can still roll back to it.
export const BOOKINGS_COLLECTION = 'BookingsV2';

const fail = (code, message = 'Curated catalogue data could not be verified.') => { const error = new Error(message); error.code = code; throw error; };
const sha256 = text => createHash('sha256').update(text).digest('hex');
// Key-sorted JSON so versions and comparisons do not depend on Firestore's map key order.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const CODE = /^[A-Z0-9]{4,20}$/;
const VERSION = /^[a-f0-9]{64}$/;
const DROP_ID = /^[a-zA-Z0-9-]{1,100}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_CATALOGUE = 20;
const MAX_DROPS = 3;
const PRIVATE_KEY = /token|password|secret|contact|email|phone|passport|guest|first.?name|last.?name|address|traveler.?id|visitor.?id|sourceId|supplierCode|supplierHotelId|contractId|rateDetail|roomTypeId|gatewayRequestId|privateReferences|raw/i;
// Visitor choices belong to a judge's session, never to shared records.
const VISITOR_KEY = /session|byCode|watch|consent|confirmation|minimumSaving|selection(?!Only)|advice|chat|cookie|csrf/i;
const DROP_LIMITATIONS = Object.freeze(['indicative-estimate-before-final-pricing-and-fees', 'room-equivalence-not-certified', 'terms-not-verified', 'captured-not-live']);
const SEARCH_DEFAULTS = Object.freeze({ nationality: AGENCY_SEARCH_CONTEXT.nationality, countryResidence: AGENCY_SEARCH_CONTEXT.countryResidence,
  occupancy: AGENCY_SEARCH_CONTEXT.occupancy, source: AGENCY_SEARCH_CONTEXT.source });
const OPTION_KEYS = ['optionId', 'roomName', 'board', 'freeCancellation', 'cancellationDeadline', 'termsVerified', 'sourcePrice', 'estimate', 'indicativeDifferenceMinor'];
const BUNDLE_KEYS = ['schemaVersion', 'snapshotVersion', 'transactionMode', 'baseline', 'options', 'checkedAt', 'completeness', 'customerRefund', 'reservationCreated', 'privateReferences'];
// `roomPhoto` is optional: a reviewed photo of the booked room. Absent (not null) when there is none.
const CARD_KEYS = ['code', 'order', 'cityName', 'scenarioLabel', 'photo', 'roomPhoto'];
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
const label = value => typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= 80;

// Recursively refuses private-looking and visitor-state keys. `privateReferences` is never inspected
// because it is never copied: the allowlisted record builders drop it.
function inspect(value) {
  if (Array.isArray(value)) { value.forEach(inspect); return; }
  if (!plain(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_KEY.test(key)) fail('PRIVATE_FIELD_REJECTED');
    if (VISITOR_KEY.test(key)) fail('VISITOR_STATE_REJECTED');
    inspect(child);
  }
}

// A photo is only ever a reviewed asset already shipped in app/public/assets, never a remote URL.
export const PHOTO_ASSET = /^assets\/[a-z0-9-]{1,80}\.(?:jpg|png|webp)$/;
const validPhoto = photo => exactKeys(photo, ['asset', 'alt']) && PHOTO_ASSET.test(photo.asset ?? '') && label(photo.alt);

function validCard(card) {
  if (!exactKeys(card, CARD_KEYS) || !CODE.test(card.code) || !Number.isSafeInteger(card.order) || card.order < 1 || card.order > MAX_CATALOGUE
    || !label(card.cityName) || !label(card.scenarioLabel)) return false;
  return (card.photo === null || validPhoto(card.photo)) && (card.roomPhoto === undefined || validPhoto(card.roomPhoto));
}

// Prepared captures may carry remote photo source URLs for a later reviewed download. They are
// accepted only as explicitly non-renderable, and are never copied into any record.
const IMAGE_SOURCES_KIND = 'remote-source-urls-pending-review';
const validImageSources = sources => sources === undefined || (plain(sources) && sources.kind === IMAGE_SOURCES_KIND && sources.renderable === false);

// Optional reviewed image manifest:
//   { [code]: { hotel?: photo | null, room?: photo | null, drops?: { [optionId]: photo | null } } }.
// A hotel photo fills an empty card photo, a room photo the card's optional `roomPhoto` (the booked
// room), and a Drop photo becomes that Drop's `photo` fact.
function imageManifest(images, codes) {
  if (images === undefined) return new Map();
  if (!plain(images) || Object.keys(images).some(code => !codes.includes(code))) fail('IMAGE_MANIFEST_INVALID');
  return new Map(Object.entries(images).map(([code, entry]) => {
    if (!exactKeys(entry, ['hotel', 'room', 'drops']) || (entry.hotel != null && !validPhoto(entry.hotel)) || (entry.room != null && !validPhoto(entry.room))
      || (entry.drops !== undefined && (!plain(entry.drops) || Object.values(entry.drops).some(photo => photo !== null && !validPhoto(photo))))) fail('IMAGE_MANIFEST_INVALID');
    return [code, { hotel: entry.hotel ?? null, room: entry.room ?? null, drops: entry.drops ?? {} }];
  }));
}
const reviewedCopy = photo => ({ asset: photo.asset, alt: photo.alt });

function validBaseline(baseline, code) {
  return plain(baseline) && baseline.sourceType === 'quotation' && baseline.quotationCode === code
    && baseline.source?.system === 'altovo-staging' && typeof baseline.source.readAt === 'string'
    && baseline.searchContextSource === SEARCH_DEFAULTS.source && baseline.occupancySource === SEARCH_DEFAULTS.occupancy
    && CURRENCY.test(baseline.quotedRetail?.currency ?? '') && Number.isSafeInteger(baseline.quotedRetail.totalMinor)
    && CURRENCY.test(baseline.fx?.from ?? '') && plain(baseline.cancellation) && plain(baseline.stay);
}

// A Gateway Drop's source price is in the quotation's source currency and converted at its FX rate;
// an engine Drop's source price is the engine's own booking-currency total, equal to its estimate.
const sourcePriceAgrees = (option, baseline) => option.estimate?.basis === ENGINE_BASIS
  ? option.sourcePrice.currency === option.estimate.currency && decimalMoney(option.sourcePrice.amount, option.sourcePrice.currency)?.totalMinor === option.estimate.totalMinor
  : option.sourcePrice.currency === baseline.fx.from;

function validOption(option, baseline) {
  return exactKeys(option, OPTION_KEYS) && OPTION_KEYS.every(key => Object.hasOwn(option, key)) && DROP_ID.test(option.optionId)
    && typeof option.roomName === 'string' && typeof option.board === 'string' && option.termsVerified === false
    && exactKeys(option.sourcePrice, ['amount', 'currency']) && exactKeys(option.estimate, ['totalMinor', 'currency', 'isEstimate', 'basis'])
    && sourcePriceAgrees(option, baseline) && option.estimate.isEstimate === true
    && option.estimate.currency === baseline.quotedRetail.currency && Number.isSafeInteger(option.estimate.totalMinor)
    && option.indicativeDifferenceMinor === baseline.quotedRetail.totalMinor - option.estimate.totalMinor;
}

const bundleHash = ({ schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated }) =>
  sha256(JSON.stringify({ schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated }));

// Capture provenance: a valid empty capture is explicit, and a missing or failed one is never published.
function validCapture(entry) {
  const { capture, bundle, blocker } = entry;
  if (!plain(capture) || !['observed', 'observed-empty', 'not-searched'].includes(capture.status)) fail('CAPTURE_MISSING');
  if (capture.status === 'not-searched') {
    if (!exactKeys(capture, ['status', 'reason']) || typeof capture.reason !== 'string' || !/^[A-Z_]{3,40}$/.test(capture.reason)
      || capture.reason !== blocker || bundle.options.length) fail('CAPTURE_MISMATCH');
    return { status: 'not-searched', reason: capture.reason, capturedAt: null, offerCount: null, searchDefaults: null };
  }
  // A Gateway capture has no provenance key (its records stay byte-identical); an engine capture names
  // the engine source and its host, and carries the engine's own search defaults.
  const engine = Object.hasOwn(capture, 'provenance');
  if (!exactKeys(capture, ['status', 'checkedAt', 'offerCount', 'optionCount', 'searchDefaults', ...(engine ? ['provenance'] : [])]) || blocker !== null
    || !INSTANT.test(capture.checkedAt ?? '') || capture.checkedAt !== bundle.checkedAt
    || !Number.isSafeInteger(capture.offerCount) || capture.offerCount < 0 || capture.optionCount !== bundle.options.length
    || (capture.status === 'observed-empty') !== (capture.offerCount === 0) || (capture.status === 'observed-empty' && bundle.options.length)
    || canonicalJson(capture.searchDefaults) !== canonicalJson(engine ? ENGINE_SEARCH_DEFAULTS : SEARCH_DEFAULTS)
    || (engine && (!exactKeys(capture.provenance, ['source', 'host']) || !engineHostAllowed(capture.provenance.source, capture.provenance.host)))
    || bundle.options.some(option => (option.estimate.basis === ENGINE_BASIS) !== engine)) fail('CAPTURE_MISMATCH');
  if (engine) return { status: capture.status, reason: null, capturedAt: capture.checkedAt, offerCount: capture.offerCount,
    searchDefaults: { ...ENGINE_SEARCH_DEFAULTS }, provenance: { source: capture.provenance.source, host: capture.provenance.host } };
  return { status: capture.status, reason: null, capturedAt: capture.checkedAt, offerCount: capture.offerCount, searchDefaults: { ...SEARCH_DEFAULTS } };
}
const dropProvenance = capture => capture.provenance
  ? { source: capture.provenance.source, host: capture.provenance.host, searchDefaults: capture.searchDefaults }
  : { source: 'gateway-capture', searchDefaults: capture.searchDefaults };

// Validates the reviewed import input ({ schemaVersion, entries: prepared bundles, cards: manifest })
// and builds the exact shared records. Pure: no clock, no storage.
export function planCatalogueImport(input) {
  if (!plain(input) || input.schemaVersion !== 1 || !Array.isArray(input.entries) || !Array.isArray(input.cards)
    || !input.entries.length || input.entries.length > MAX_CATALOGUE) fail('CATALOGUE_INVALID');
  const codes = input.entries.map(entry => entry?.code);
  if (codes.some(code => typeof code !== 'string' || !CODE.test(code)) || new Set(codes).size !== codes.length) fail('CATALOGUE_INVALID');
  const cards = new Map();
  for (const card of input.cards) {
    if (plain(card)) inspect(card);
    if (!validCard(card) || cards.has(card.code)) fail('CARD_INVALID');
    cards.set(card.code, card);
  }
  if (cards.size !== codes.length || codes.some(code => !cards.has(code)) || new Set([...cards.values()].map(card => card.order)).size !== cards.size) fail('CARD_INVALID');
  const images = imageManifest(input.images, codes);
  return input.entries.map(entry => {
    const { code, bundle } = entry;
    if (!exactKeys(entry, ['code', 'blocker', 'capture', 'bundle', 'imageSources']) || !exactKeys(bundle, BUNDLE_KEYS)
      || !validImageSources(entry.imageSources)) fail('BUNDLE_INVALID');
    const { privateReferences, ...shared } = bundle;
    inspect(shared); inspect(entry.capture);
    if (bundle.schemaVersion !== 1 || bundle.transactionMode !== 'selection-only' || bundle.customerRefund !== null || bundle.reservationCreated !== false
      || !Array.isArray(bundle.options) || bundle.options.length > MAX_DROPS || typeof bundle.completeness !== 'string' || !INSTANT.test(bundle.checkedAt ?? '')) fail('BUNDLE_INVALID');
    if (!VERSION.test(bundle.snapshotVersion ?? '') || bundleHash(bundle) !== bundle.snapshotVersion) fail('BUNDLE_INTEGRITY_FAILED');
    if (!validBaseline(bundle.baseline, code)) fail('CAPTURE_MISMATCH');
    if (bundle.options.some(option => !validOption(option, bundle.baseline))) fail('BUNDLE_INVALID');
    if (new Set(bundle.options.map(option => option.optionId)).size !== bundle.options.length) fail('DROP_DUPLICATE');
    const capture = validCapture(entry);
    const { code: _code, ...card } = cards.get(code);
    const reviewed = images.get(code) ?? { hotel: null, room: null, drops: {} };
    if (Object.keys(reviewed.drops).some(id => !bundle.options.some(option => option.optionId === id))) fail('IMAGE_MANIFEST_INVALID');
    if (reviewed.hotel) {
      if (card.photo === null) card.photo = reviewedCopy(reviewed.hotel);
      else if (canonicalJson(card.photo) !== canonicalJson(reviewed.hotel)) fail('IMAGE_MANIFEST_CONFLICT');
    }
    if (reviewed.room) {
      if (card.roomPhoto === undefined) card.roomPhoto = reviewedCopy(reviewed.room);
      else if (canonicalJson(card.roomPhoto) !== canonicalJson(reviewed.room)) fail('IMAGE_MANIFEST_CONFLICT');
    }
    const booking = { schemaVersion: 1, code, baseline: bundle.baseline, card };
    const contentVersion = sha256(canonicalJson(booking));
    // A Drop without a reviewed photo has no `photo` key, so earlier Drop-set versions stay stable.
    const drops = bundle.options.map(option => {
      const facts = Object.fromEntries(OPTION_KEYS.map(key => [key, option[key]]));
      const photo = reviewed.drops[option.optionId];
      return photo ? { ...facts, photo: reviewedCopy(photo) } : facts;
    });
    const dropSetCore = { schemaVersion: 1, code, contentVersion, capture, checkedAt: bundle.checkedAt, completeness: bundle.completeness, dropIds: drops.map(drop => drop.optionId) };
    const dropSetVersion = sha256(canonicalJson({ ...dropSetCore, drops }));
    return {
      code, contentVersion, dropSetVersion, captureStatus: capture.status,
      booking: { ...booking, contentVersion },
      dropSet: { ...dropSetCore, dropSetVersion },
      drops: drops.map((facts, index) => ({ schemaVersion: 1, code, dropId: facts.optionId, rank: index + 1, contentVersion, dropSetVersion,
        capturedAt: capture.capturedAt, facts, limitations: [...DROP_LIMITATIONS], provenance: dropProvenance(capture) })),
    };
  });
}

const MAX_DROP_SETS = 50;
const ALREADY_EXISTS = 6;
const sequenceId = sequence => String(sequence).padStart(6, '0');
const withoutImportTime = ({ importedAt, ...record }) => record;
// Storage SDK failures surface as one bounded code; domain codes pass through unchanged.
const storageError = error => {
  if (typeof error?.code === 'string') return error;
  const wrapped = new Error('Catalogue storage is unavailable.'); wrapped.code = 'STORAGE_UNAVAILABLE'; wrapped.cause = error; return wrapped;
};

export function createBookingStorage({ firestore, prefix = 'roomdrop' } = {}) {
  if (typeof prefix !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(prefix)) throw new Error('Invalid booking storage prefix.');
  const collectionName = prefix + BOOKINGS_COLLECTION;
  const bookings = () => firestore.collection(collectionName);
  const latestSet = reference => reference.collection('dropSets').orderBy('sequence', 'desc').limit(1);

  // Reads the current Drop set and its Drops; a missing Drop document is unavailable, never empty.
  async function current(code) {
    const reference = bookings().doc(code);
    const [bookingSnapshot, setSnapshot] = await Promise.all([reference.get(), latestSet(reference).get()]);
    if (!bookingSnapshot.exists || setSnapshot.empty) return null;
    const booking = bookingSnapshot.data(); const dropSet = setSnapshot.docs[0].data();
    if (booking.code !== code || dropSet.code !== code || dropSet.contentVersion !== booking.contentVersion) fail('CAPTURE_UNAVAILABLE');
    let drops = [];
    if (dropSet.dropIds.length) {
      const snapshots = await firestore.getAll(...dropSet.dropIds.map(id => reference.collection('drops').doc(id)));
      drops = snapshots.map(snapshot => snapshot.exists ? snapshot.data() : null);
      if (drops.some((drop, index) => !drop || drop.dropSetVersion !== dropSet.dropSetVersion || drop.contentVersion !== booking.contentVersion
        || drop.rank !== index + 1)) fail('CAPTURE_UNAVAILABLE');
    }
    return { booking, dropSet, drops: drops.map(drop => drop.facts) };
  }

  async function execute(plan, importedAt) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await firestore.runTransaction(async transaction => {
          const states = [];
          for (const item of plan) {
            const reference = bookings().doc(item.code);
            const [bookingSnapshot, setSnapshot] = await Promise.all([transaction.get(reference),
              transaction.get(reference.collection('dropSets').orderBy('sequence', 'desc').limit(MAX_DROP_SETS))]);
            const dropSnapshots = item.drops.length ? await transaction.getAll(...item.drops.map(drop => reference.collection('drops').doc(drop.dropId))) : [];
            states.push({ item, reference, bookingSnapshot, sets: setSnapshot.docs.map(document => document.data()), dropSnapshots });
          }
          // Decide every code before writing anything, so one refusal publishes nothing at all.
          const decisions = states.map(({ item, reference, bookingSnapshot, sets, dropSnapshots }) => {
            if (bookingSnapshot.exists && canonicalJson(withoutImportTime(bookingSnapshot.data())) !== canonicalJson(item.booking)) fail('BOOKING_CHANGED');
            if (sets.some(set => set.dropSetVersion === item.dropSetVersion)) return { item, result: 'unchanged' };
            // Drops are append-only: an existing id belongs to an earlier Drop set and is never rebound.
            if (dropSnapshots.some(snapshot => snapshot.exists)) fail('DROP_CONFLICT');
            if (sets.length >= MAX_DROP_SETS) fail('DROP_SET_LIMIT');
            return { item, reference, createBooking: !bookingSnapshot.exists, sequence: (sets[0]?.sequence ?? 0) + 1,
              result: bookingSnapshot.exists ? 'drop-set-added' : 'created' };
          });
          for (const { item, reference, createBooking, sequence, result } of decisions) {
            if (result === 'unchanged') continue;
            if (createBooking) transaction.create(reference, { ...item.booking, importedAt });
            for (const drop of item.drops) transaction.create(reference.collection('drops').doc(drop.dropId), { ...drop, importedAt });
            transaction.create(reference.collection('dropSets').doc(sequenceId(sequence)), { ...item.dropSet, sequence, importedAt });
          }
          return decisions.map(({ result }) => result);
        });
      } catch (error) {
        // A concurrent identical import created the same documents first: re-read and replay.
        if (error?.code === ALREADY_EXISTS && attempt < 4) continue;
        throw storageError(error);
      }
    }
  }

  return {
    // Admin/importer only. Dry run (default) validates and touches no storage.
    async importBundle(input, { execute: run = false, now = () => new Date() } = {}) {
      const plan = planCatalogueImport(input);
      const summary = (item, result) => ({ code: item.code, contentVersion: item.contentVersion, dropSetVersion: item.dropSetVersion,
        captureStatus: item.captureStatus, dropCount: item.drops.length, result });
      if (!run) return { mode: 'dry-run', entries: plan.map(item => summary(item, 'validated')) };
      const importedAt = now().toISOString();
      const results = await execute(plan, importedAt);
      return { mode: 'executed', importedAt, entries: plan.map((item, index) => summary(item, results[index])) };
    },
    async listCatalogue() {
      try {
        const snapshot = await bookings().orderBy('card.order').limit(MAX_CATALOGUE).get();
        const sets = await Promise.all(snapshot.docs.map(document => latestSet(document.ref).get()));
        return snapshot.docs.map((document, index) => {
          const booking = document.data(); const dropSet = sets[index].docs[0]?.data();
          return dropSet ? { code: booking.code, order: booking.card.order, contentVersion: booking.contentVersion, dropSetVersion: dropSet.dropSetVersion, card: booking.card } : null;
        }).filter(Boolean);
      } catch (error) { throw storageError(error); }
    },
    async getBooking(code) {
      if (typeof code !== 'string' || !CODE.test(code)) return null;
      try {
        const state = await current(code);
        if (!state) return null;
        const { booking, dropSet, drops } = state;
        const bundle = { schemaVersion: 1, snapshotVersion: booking.contentVersion, transactionMode: 'selection-only', baseline: booking.baseline,
          options: drops, checkedAt: dropSet.checkedAt, completeness: dropSet.completeness, customerRefund: null, reservationCreated: false };
        return { code, contentVersion: booking.contentVersion, dropSetVersion: dropSet.dropSetVersion, bundle,
          capture: { status: dropSet.capture.status, capturedAt: dropSet.capture.capturedAt } };
      } catch (error) { throw storageError(error); }
    },
    async getDrops(code, { dropSetVersion } = {}) {
      if (typeof code !== 'string' || !CODE.test(code)) fail('BOOKING_UNAVAILABLE');
      let state;
      try { state = await current(code); } catch (error) { throw storageError(error); }
      if (!state) fail('BOOKING_UNAVAILABLE');
      const { dropSet, drops } = state;
      if (dropSetVersion !== undefined && dropSetVersion !== dropSet.dropSetVersion) fail('DROP_SET_CHANGED');
      if (!['observed', 'observed-empty'].includes(dropSet.capture.status)) fail('CAPTURE_UNAVAILABLE');
      return { dropSetVersion: dropSet.dropSetVersion, captureStatus: dropSet.capture.status, capturedAt: dropSet.capture.capturedAt, drops };
    },
  };
}

// Startup read for hosted mode: never seeds or imports, and has no memory or file fallback.
export async function loadHostedCatalogue(bookingStorage) {
  try {
    const listed = await bookingStorage.listCatalogue();
    if (!listed.length) fail('CATALOGUE_UNAVAILABLE');
    const entries = [];
    for (const { code } of listed) {
      const booking = await bookingStorage.getBooking(code);
      if (!booking) fail('CATALOGUE_UNAVAILABLE');
      entries.push({ code, contentVersion: booking.contentVersion, dropSetVersion: booking.dropSetVersion, bundle: booking.bundle });
    }
    return { entries };
  } catch (error) {
    const wrapped = new Error('The curated catalogue is unavailable.'); wrapped.code = 'CATALOGUE_UNAVAILABLE'; wrapped.cause = error; throw wrapped;
  }
}

// Server Firestore client with the same guards as app/storage.mjs: Firestore only, and the
// emulator only on loopback outside Cloud Run/production.
export async function createRoomdropFirestore(environment = process.env) {
  if (environment.STORAGE_MODE && environment.STORAGE_MODE !== 'firestore') {
    throw new Error('RoomDrop storage requires Firestore; there is no memory fallback.');
  }
  const projectId = environment.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT is required for Firestore.');
  const emulatorHost = environment.FIRESTORE_EMULATOR_HOST;
  if (emulatorHost && !/^(localhost|127\.0\.0\.1):\d{1,5}$/.test(emulatorHost)) throw new Error('FIRESTORE_EMULATOR_HOST must use a loopback host and port.');
  if (emulatorHost && (environment.K_SERVICE || environment.CLOUD_RUN_JOB || environment.NODE_ENV === 'production')) {
    throw new Error('Firestore emulator is prohibited in Cloud Run / production.');
  }
  const { Firestore } = await import('@google-cloud/firestore');
  const settings = { projectId };
  if (emulatorHost) { settings.host = emulatorHost; settings.ssl = false; }
  return new Firestore(settings);
}
