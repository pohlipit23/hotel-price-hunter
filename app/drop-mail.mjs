import { createHash, createHmac, randomBytes } from 'node:crypto';
import { dropMailMessage } from './domain/drop-mail-template.mjs';
import { maskEmail } from './domain/booking-drop-watch.mjs';
import { deliveryEmailValid, dropSavingMinor } from './public/drop-watch.js';
import { dropMatch } from './public/room-match.js';

// Drop email alerts: one email per armed Drop Watch revision, whose button opens that judge's Drops in any
// browser. Provider-agnostic: a transport sends, a deferral decides when, and this module owns everything else.
//   {prefix}DropMailV1/{sha256(token)}            the inbox link: source session, code, revision, expiry, uses
//   {prefix}DropMailSessionsV1/{sessionId}        per-session count and the arm revisions already mailed
//   {prefix}DropMailLedgerV1/{hmac(address)}      per-address count for one UTC day
//   {prefix}DropMailCapacityV1/{yyyy-mm-dd}       global count for one UTC day
// The raw token and the address are never stored here, and every document carries `ttlAt` for a TTL policy.

export const DROP_MAIL_LIMITS = Object.freeze({ perSession: 2, perAddressPerDay: 3, perDay: 50, maxUses: 3 });
// The watch feels real: the email is due about a minute after the arm.
export const DROP_MAIL_DELAY_MS = 60_000;
// The arm waits at most this long for the transport; a slow or failed send never fails the arm.
export const DROP_MAIL_TIMEOUT_MS = 5_000;
// A link that would expire within this long of arriving is not worth sending.
const MIN_LINK_LIFE_MS = 5 * 60_000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[a-f0-9]{64}$/;
const CODE = /^[A-Z0-9]{4,20}$/;
const ASSET = /^assets\/roomdrop-[a-z0-9-]{1,60}\.jpg$/;
const DAY_MS = 86_400_000;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = (code, message = 'The Drop email link could not be used.') => { throw Object.assign(new Error(message), { code }); };

// ---- Link tokens and addresses ----
// 32 random bytes, base64url, travel only in the email link's fragment; only their digest is stored.
export function createMailToken() { const token = randomBytes(32).toString('base64url'); return { token, hash: sha256(token) }; }
export function hashMailToken(token) { return typeof token === 'string' && TOKEN.test(token) ? sha256(token) : null; }
// One address, one cap: lowercase and trimmed, without a +tag, and Gmail's dots and googlemail domain folded.
export function normalizeAddress(email) {
  const value = String(email ?? '').trim().toLowerCase(); const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) fail('DELIVERY_EMAIL_INVALID');
  let local = value.slice(0, at); let domain = value.slice(at + 1);
  local = local.split('+')[0] || local;
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replaceAll('.', '') || local;
  return local + '@' + domain;
}
// The ledger key: a peppered HMAC, so the stored counter cannot be reversed into an address.
export function addressKey(email, pepper) {
  if (typeof pepper !== 'string' || pepper.length < 32) fail('DROP_MAIL_CONFIG_INVALID');
  return createHmac('sha256', pepper).update(normalizeAddress(email)).digest('hex');
}
// Deterministic per session, code and arm revision: the provider's idempotency key and the stored mailId.
export const mailIdFor = (sessionId, code, revision) => 'mail-' + sha256(`${sessionId}:${code}:${revision}`).slice(0, 32);
const dayKey = time => new Date(time).toISOString().slice(0, 10);
const nextDay = time => Date.parse(dayKey(time) + 'T00:00:00Z') + DAY_MS;

// ---- Caps and link claims, shared by both stores ----
// One reservation decision on plain copies of the three counters. Both stores commit its writes atomically.
// A revision already mailed is a duplicate (no second email); a capped revision is not remembered.
export function planReservation({ session, ledger, capacity }, request, limits = DROP_MAIL_LIMITS) {
  const { sessionId, code, watchRevision, mailId, expiresAt, time } = request;
  const revisions = session?.revisions ?? {}; const key = `${code}:${watchRevision}`;
  if (Object.hasOwn(revisions, key)) return { outcome: { status: 'duplicate', mailId: revisions[key] } };
  const day = dayKey(time); const sessionCount = session?.count ?? 0;
  const addressCount = ledger?.day === day ? ledger.count : 0; const dayCount = capacity?.count ?? 0;
  const reason = sessionCount >= limits.perSession ? 'session' : addressCount >= limits.perAddressPerDay ? 'address' : dayCount >= limits.perDay ? 'daily' : null;
  if (reason) return { outcome: { status: 'capped', reason } };
  const dayEnds = new Date(nextDay(time));
  return { outcome: { status: 'reserved', mailId },
    session: { count: sessionCount + 1, revisions: { ...revisions, [key]: mailId }, ttlAt: new Date(expiresAt) },
    ledger: { day, count: addressCount + 1, ttlAt: dayEnds },
    capacity: { count: dayCount + 1, ttlAt: dayEnds },
    link: { sourceSessionId: sessionId, code, watchRevision, mailId, expiresAt, uses: 0, maxUses: limits.maxUses, ttlAt: new Date(expiresAt) } };
}
// A link may open a session while it is unexpired, for its own booking, at most maxUses times.
function claimable(link, code, time) {
  if (!link || link.code !== code || !(link.expiresAt > time)) fail('MAIL_LINK_EXPIRED');
  if (link.uses >= link.maxUses) fail('MAIL_LINK_USED');
  return link;
}
function validReservation(request) {
  if (!HASH.test(request?.sessionId ?? '') || !HASH.test(request.addressKey ?? '') || !HASH.test(request.tokenHash ?? '') || !CODE.test(request.code ?? '')
    || !Number.isSafeInteger(request.watchRevision) || !Number.isSafeInteger(request.expiresAt) || !Number.isSafeInteger(request.time)) fail('DROP_MAIL_INVALID');
  return request;
}

// ---- Stores: Firestore for hosted runs, memory for tests and local loopback, one interface ----
// reserve(request) -> { status: reserved|duplicate|capped, mailId?, reason? }   counters and the link, in one transaction
// peek(tokenHash)  -> the link (no ttlAt) or null                               a read, never a use
// claim(tokenHash, code) -> { read, write }    run inside the session store's fork transaction; counts one use
export function createFirestoreDropMailStore({ firestore, prefix = 'roomdrop', now = () => new Date(), limits = DROP_MAIL_LIMITS } = {}) {
  if (typeof prefix !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(prefix)) throw new Error('Invalid drop mail storage prefix.');
  const collection = name => firestore.collection(`${prefix}${name}`);
  const data = snapshot => { if (!snapshot.exists) return null; const { ttlAt, ...value } = snapshot.data(); return value; };
  const unavailable = error => {
    if (typeof error?.code === 'string') return error;
    return Object.assign(new Error('Drop mail storage is unavailable.'), { code: 'STORAGE_UNAVAILABLE', cause: error });
  };
  return {
    mode: 'firestore',
    async reserve(request) {
      validReservation(request);
      try {
        return await firestore.runTransaction(async transaction => {
          const refs = [collection('DropMailSessionsV1').doc(request.sessionId), collection('DropMailLedgerV1').doc(request.addressKey),
            collection('DropMailCapacityV1').doc(dayKey(request.time))];
          const [session, ledger, capacity] = (await transaction.getAll(...refs)).map(data);
          const plan = planReservation({ session, ledger, capacity }, request, limits);
          if (plan.outcome.status !== 'reserved') return plan.outcome;
          transaction.set(refs[0], plan.session); transaction.set(refs[1], plan.ledger); transaction.set(refs[2], plan.capacity);
          transaction.create(collection('DropMailV1').doc(request.tokenHash), plan.link);
          return plan.outcome;
        });
      } catch (error) { throw unavailable(error); }
    },
    async peek(tokenHash) {
      if (!HASH.test(tokenHash ?? '')) return null;
      try { return data(await collection('DropMailV1').doc(tokenHash).get()); } catch (error) { throw unavailable(error); }
    },
    claim(tokenHash, code) {
      const ref = collection('DropMailV1').doc(tokenHash);
      return { read: async transaction => claimable(data(await transaction.get(ref)), code, now().getTime()),
        write: (transaction, link) => transaction.update(ref, { uses: link.uses + 1 }) };
    },
  };
}
// Tests and local loopback runs only. Refused in any hosted environment, like memory sessions.
export function createMemoryDropMailStore({ environment = process.env, now = () => new Date(), limits = DROP_MAIL_LIMITS } = {}) {
  if (environment.NODE_ENV === 'production' || environment.K_SERVICE || environment.CLOUD_RUN_JOB) {
    throw new Error('Memory drop mail storage is for tests and local runs only.');
  }
  const documents = { links: new Map(), sessions: new Map(), ledger: new Map(), capacity: new Map() };
  const copy = value => value ? structuredClone(value) : null;
  const strip = value => { if (!value) return null; const { ttlAt, ...rest } = value; return copy(rest); };
  return {
    mode: 'test-memory', documents,
    async reserve(request) {
      validReservation(request);
      const day = dayKey(request.time);
      const plan = planReservation({ session: strip(documents.sessions.get(request.sessionId)), ledger: strip(documents.ledger.get(request.addressKey)),
        capacity: strip(documents.capacity.get(day)) }, request, limits);
      if (plan.outcome.status !== 'reserved') return plan.outcome;
      if (documents.links.has(request.tokenHash)) fail('STORAGE_UNAVAILABLE');
      documents.sessions.set(request.sessionId, plan.session); documents.ledger.set(request.addressKey, plan.ledger);
      documents.capacity.set(day, plan.capacity); documents.links.set(request.tokenHash, plan.link);
      return plan.outcome;
    },
    async peek(tokenHash) { return strip(documents.links.get(tokenHash)); },
    // Synchronous on purpose: the memory session store runs read, checks and write without yielding.
    claim(tokenHash, code) {
      return { read: () => claimable(strip(documents.links.get(tokenHash)), code, now().getTime()),
        write: (transaction, link) => { documents.links.get(tokenHash).uses = link.uses + 1; } };
    },
  };
}

// ---- Transports and deferrals: the one seam a real provider plugs into ----
// A transport is { name, send({ to, subject, html, text, sendAt, idempotencyKey }) -> Promise<{ id }> }.
// `sendAt` is an ISO instant the provider should hold the message until, or null to send at once;
// `idempotencyKey` is stable for one arm revision, so a retried send can never become a second email.
export const DROP_MAIL_TRANSPORTS = Object.freeze(['capture', 'disabled']);
// In memory, for tests and the local demo: records each message (from, to, sendAt included) and sends nothing.
export function createCaptureTransport({ from, environment = process.env } = {}) {
  if (environment.NODE_ENV === 'production' || environment.K_SERVICE || environment.CLOUD_RUN_JOB) {
    throw new Error('The capture mail transport is for tests and local runs only.');
  }
  const sent = [];
  return { name: 'capture', sent, async send(message) {
    const id = 'capture-' + (sent.length + 1);
    if (!sent.some(item => item.idempotencyKey === message.idempotencyKey)) sent.push({ id, from, ...message });
    return { id };
  } };
}
// The default until a provider is chosen: nothing is ever handed over, and the arm reports `failed`.
export function createDisabledTransport() {
  return { name: 'disabled', available: false, async send() { fail('MAIL_TRANSPORT_DISABLED', 'Drop mail delivery is not configured.'); } };
}
// How a message waits for sendAt. 'provider': the transport holds it until sendAt (the arm reports `scheduled`).
// 'now': delivered at once without sendAt (the arm reports `sent`). A provider without scheduling would add
// its queue here (for example a task queue calling back at sendAt), with no change to the arm or the stores.
export const DROP_MAIL_DEFERRALS = Object.freeze({
  provider: Object.freeze({ status: 'scheduled', sendAt: at => at.toISOString() }),
  now: Object.freeze({ status: 'sent', sendAt: () => null }),
});

// ---- Configuration ----
// DROP_MAIL_ENABLED is the kill switch: absent or 'false' is off (the default); 'true' needs a sender,
// a pepper of at least 32 characters and a named transport. Hosted runs never use the capture transport.
export function dropMailSettings(environment = {}, { hosted = false } = {}) {
  const enabled = environment.DROP_MAIL_ENABLED;
  if (enabled === undefined || enabled === 'false') return null;
  const transport = environment.DROP_MAIL_TRANSPORT;
  if (enabled !== 'true' || !DROP_MAIL_TRANSPORTS.includes(transport) || (hosted && transport === 'capture')
    || !deliveryEmailValid(environment.DROP_MAIL_FROM) || typeof environment.MAIL_PEPPER !== 'string' || environment.MAIL_PEPPER.length < 32) {
    throw Object.assign(new Error('Drop mail requires DROP_MAIL_FROM, MAIL_PEPPER and a supported DROP_MAIL_TRANSPORT.'), { code: 'DROP_MAIL_CONFIG_INVALID' });
  }
  return { transport, from: environment.DROP_MAIL_FROM, pepper: environment.MAIL_PEPPER };
}
export function createDropMailerFromEnvironment(environment, { store, hosted = false, now } = {}) {
  const settings = dropMailSettings(environment, { hosted });
  if (!settings) return null;
  if (!store) throw Object.assign(new Error('Drop mail requires its store.'), { code: 'DROP_MAIL_CONFIG_INVALID' });
  const transport = settings.transport === 'capture' ? createCaptureTransport({ from: settings.from, environment }) : createDisabledTransport();
  return createDropMailer({ store, transport, pepper: settings.pepper, now });
}

// ---- The mailer the arm route calls once its commit is done ----
const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Timed out.'), { code: 'MAIL_TIMEOUT' })), ms); })])
    .finally(() => clearTimeout(timer));
};
// The facts the template may use, read from the booking and the committed watch only.
export function dropMailFacts({ booking, watch, card, origin, code, token, expiresAt }) {
  const { baseline, options } = booking.bundle; const currency = baseline.quotedRetail.currency;
  const drops = watch.firstCheck.dropOptionIds.map(id => options.find(option => option.optionId === id));
  if (drops.some(option => !option || option.estimate?.currency !== currency)) fail('DROP_MAIL_INVALID');
  const asset = card?.photo?.asset;
  return { origin, code, link: `${origin}/#inbox-${code}~${token}`, currency, bookedMinor: baseline.quotedRetail.totalMinor,
    drops: drops.map(option => ({ roomName: option.roomName, board: option.board ?? null, totalMinor: option.estimate.totalMinor,
      savingMinor: dropSavingMinor(baseline, option), sameRoom: dropMatch(baseline, option).room, freeCancellation: option.freeCancellation === true })),
    minimumSavingMinor: watch.minimumSavingMinor, capturedAt: watch.firstCheck.checkedAt, expiresAt: new Date(expiresAt).toISOString(),
    maskedEmail: maskEmail(watch.delivery.email), hotelName: baseline.hotel.name, roomName: baseline.room.name, stay: baseline.stay,
    photo: typeof asset === 'string' && ASSET.test(asset) && typeof card.photo.alt === 'string' ? { url: `${origin}/${asset}`, alt: card.photo.alt } : null };
}
export function createDropMailer({ store, transport, pepper, deferral = 'provider', now = () => new Date(), delayMs = DROP_MAIL_DELAY_MS,
  timeoutMs = DROP_MAIL_TIMEOUT_MS } = {}) {
  if (['reserve', 'peek', 'claim'].some(name => typeof store?.[name] !== 'function') || typeof transport?.send !== 'function'
    || !Object.hasOwn(DROP_MAIL_DEFERRALS, deferral)) throw new Error('A drop mail store, transport and deferral are required.');
  addressKey('check@example.com', pepper);
  const plan = DROP_MAIL_DEFERRALS[deferral];
  return {
    store,
    // Returns the delivery outcome to record on the watch ({ status, mailId? }), or null when this revision
    // was already mailed. `sessionId` is the session's stored id (sha256 of its cookie), never the cookie.
    async deliver({ sessionId, expiresAt, code, watch, booking, card, origin }) {
      if (!watch?.delivery?.email) return null;
      if (transport.available === false) return { status: 'failed' };
      const time = now().getTime(); const sendAt = new Date(time + delayMs);
      if (expiresAt - sendAt.getTime() < MIN_LINK_LIFE_MS) return { status: 'capped' };
      const { token, hash } = createMailToken(); const mailId = mailIdFor(sessionId, code, watch.revision);
      // Built before anything is reserved, so a booking the template refuses never spends a cap.
      const message = dropMailMessage(dropMailFacts({ booking, watch, card, origin, code, token, expiresAt }));
      const outcome = await store.reserve({ sessionId, code, watchRevision: watch.revision, mailId, tokenHash: hash,
        addressKey: addressKey(watch.delivery.email, pepper), expiresAt, time });
      if (outcome.status === 'duplicate') return null;
      if (outcome.status === 'capped') return { status: 'capped' };
      try {
        await withTimeout(Promise.resolve().then(() => transport.send({ to: watch.delivery.email, subject: message.subject, html: message.html, text: message.text,
          sendAt: plan.sendAt(sendAt), idempotencyKey: mailId })), timeoutMs);
        return { status: plan.status, mailId };
      } catch { return { status: 'failed', mailId }; }
    },
  };
}
