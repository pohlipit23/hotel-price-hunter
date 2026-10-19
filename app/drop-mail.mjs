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
//   {prefix}DropMailSentV1/{mailId}               a queued message the Cloud Tasks callback already sent
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
// wasSent(mailId), recordSent(mailId, ttlAt)   the Cloud Tasks callback's once-only record
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
    async wasSent(mailId) {
      try { return (await collection('DropMailSentV1').doc(mailId).get()).exists; } catch (error) { throw unavailable(error); }
    },
    async recordSent(mailId, ttlAt) {
      try { await collection('DropMailSentV1').doc(mailId).set({ sent: true, ttlAt }); } catch (error) { throw unavailable(error); }
    },
  };
}
// Tests and local loopback runs only. Refused in any hosted environment, like memory sessions.
export function createMemoryDropMailStore({ environment = process.env, now = () => new Date(), limits = DROP_MAIL_LIMITS } = {}) {
  if (environment.NODE_ENV === 'production' || environment.K_SERVICE || environment.CLOUD_RUN_JOB) {
    throw new Error('Memory drop mail storage is for tests and local runs only.');
  }
  const documents = { links: new Map(), sessions: new Map(), ledger: new Map(), capacity: new Map(), sent: new Map() };
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
    async wasSent(mailId) { return documents.sent.has(mailId); },
    async recordSent(mailId, ttlAt) { documents.sent.set(mailId, { sent: true, ttlAt }); },
  };
}

// ---- Transports and deferrals: the one seam a real provider plugs into ----
// A transport is { name, send({ to, subject, html, text, sendAt, idempotencyKey }) -> Promise<{ id }> }.
// `sendAt` is an ISO instant the provider should hold the message until, or null to send at once;
// `idempotencyKey` is stable for one arm revision; providers that support it dedupe on it, and the mailer's own
// records (store.reserve, store.wasSent) keep one revision to one email either way.
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
// The default until a provider is configured: nothing is ever handed over, and the arm reports `failed`.
export function createDisabledTransport() {
  return { name: 'disabled', available: false, async send() { fail('MAIL_TRANSPORT_DISABLED', 'Drop mail delivery is not configured.'); } };
}
// Cloudflare Email Service, REST sending (beta): POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send
// with "Authorization: Bearer <API_TOKEN>" and a JSON body { to, from, subject, html, text, headers }; the reply is
// { success, errors: [{ code, message }], messages, result: { delivered, permanent_bounces, queued } }.
// Source: https://developers.cloudflare.com/email-service/api/send-emails/rest-api/ (read 2026-10-19).
// The API documents neither scheduling nor idempotency keys: sendAt must be null (the cloud-tasks deferral waits
// instead) and the idempotency key travels as an X-RoomDrop-Mail-Id header for tracing, while the mailer's
// sent record (store.wasSent/recordSent) is what stops a retried task from sending twice.
export function createCloudflareTransport({ accountId, token, from, fetch = globalThis.fetch, timeoutMs = DROP_MAIL_TIMEOUT_MS } = {}) {
  if (!/^[a-f0-9]{32}$/.test(accountId ?? '') || typeof token !== 'string' || token.length < 20 || !deliveryEmailValid(from)) {
    throw Object.assign(new Error('Cloudflare Email Service needs an account id, an API token and a sender.'), { code: 'DROP_MAIL_CONFIG_INVALID' });
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;
  return { name: 'cloudflare', async send({ to, subject, html, text, sendAt, idempotencyKey }) {
    if (sendAt != null) fail('MAIL_SCHEDULING_UNSUPPORTED', 'Cloudflare Email Service sends at once; defer before calling it.');
    let response, body;
    try {
      response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, from, subject, html, text, headers: { 'X-RoomDrop-Mail-Id': idempotencyKey } }) });
      body = await response.json();
    } catch { fail('MAIL_PROVIDER_UNAVAILABLE', 'The mail provider could not be reached.'); }
    // Only bounded codes leave here: never the provider's message text, the token or the address.
    if (!response.ok || body?.success !== true) fail(response.status === 429 ? 'MAIL_PROVIDER_THROTTLED' : 'MAIL_PROVIDER_REFUSED', 'The mail provider refused the message.');
    if (body.result?.permanent_bounces?.length) fail('MAIL_BOUNCED', 'The address bounced.');
    return { id: idempotencyKey };
  } };
}

// ---- Deferrals: how a message waits for sendAt ----
// A deferral is { name, status, defer({ transport, message, sendAt, idempotencyKey }) }; `status` is what the arm
// records once defer resolves. 'inline' sends at once (local runs; status sent). 'provider' hands sendAt to a
// transport that schedules itself (the capture transport records it; status scheduled). 'cloud-tasks' enqueues
// an OIDC-authenticated Google Cloud Tasks call back into this service at sendAt (status scheduled); the
// internal route then verifies the caller and sends through the transport (mailer.deliverTask).
export const DROP_MAIL_DEFERRALS = Object.freeze({
  inline: Object.freeze({ name: 'inline', status: 'sent', defer: ({ transport, message, idempotencyKey }) => transport.send({ ...message, sendAt: null, idempotencyKey }) }),
  provider: Object.freeze({ name: 'provider', status: 'scheduled', defer: ({ transport, message, sendAt, idempotencyKey }) => transport.send({ ...message, sendAt: sendAt.toISOString(), idempotencyKey }) }),
});
// The internal route Cloud Tasks calls; booking-demo-server maps it onto the quotation server.
export const DROP_MAIL_TASK_PATH = '/internal/drop-mail/send';
const QUEUE = /^projects\/[a-z][a-z0-9-]{4,61}[a-z0-9]\/locations\/[a-z0-9-]{2,40}\/queues\/[A-Za-z0-9-]{1,100}$/;
const googleAccessToken = async () => {
  const { GoogleAuth } = await import('google-auth-library');
  const token = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getAccessToken();
  if (!token) fail('MAIL_QUEUE_UNAVAILABLE', 'No Google access token.');
  return token;
};
// Cloud Tasks REST v2, tasks.create: POST https://cloudtasks.googleapis.com/v2/{queue}/tasks with
// { task: { name, scheduleTime, httpRequest: { url, httpMethod, headers, body (base64), oidcToken: { serviceAccountEmail, audience } } } }.
// The task name is the mailId, so Cloud Tasks itself refuses a second task for one arm revision (409 = already queued).
export function createCloudTasksDeferral({ queue, url, serviceAccountEmail, audience = url && new URL(url).origin, fetch = globalThis.fetch,
  accessToken = googleAccessToken, timeoutMs = DROP_MAIL_TIMEOUT_MS } = {}) {
  let target; try { target = new URL(url); } catch {}
  if (!QUEUE.test(queue ?? '') || target?.protocol !== 'https:' || target.pathname !== DROP_MAIL_TASK_PATH || !deliveryEmailValid(serviceAccountEmail)
    || !serviceAccountEmail.endsWith('.iam.gserviceaccount.com') || typeof audience !== 'string') {
    throw Object.assign(new Error('Cloud Tasks deferral needs a queue path, an https callback URL and an invoker service account.'), { code: 'DROP_MAIL_CONFIG_INVALID' });
  }
  return { name: 'cloud-tasks', status: 'scheduled', async defer({ message, sendAt, idempotencyKey }) {
    const payload = Buffer.from(JSON.stringify({ ...message, idempotencyKey })).toString('base64');
    const task = { name: `${queue}/tasks/${idempotencyKey}`, scheduleTime: sendAt.toISOString(),
      httpRequest: { url: target.href, httpMethod: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, oidcToken: { serviceAccountEmail, audience } } };
    let response;
    try {
      response = await fetch(`https://cloudtasks.googleapis.com/v2/${queue}/tasks`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ task }) });
    } catch { fail('MAIL_QUEUE_UNAVAILABLE', 'The mail queue could not be reached.'); }
    if (!response.ok && response.status !== 409) fail('MAIL_QUEUE_REFUSED', 'The mail queue refused the task.');
    return { id: idempotencyKey };
  } };
}
// Verifies the Google OIDC token Cloud Tasks attaches: signed by Google, for this audience, from the expected
// invoker service account with a verified email. Anything else is refused, whatever the network says.
export function createTaskVerifier({ audience, serviceAccountEmail, verifyIdToken } = {}) {
  if (typeof audience !== 'string' || !deliveryEmailValid(serviceAccountEmail)) throw Object.assign(new Error('Task verifier needs an audience and invoker.'), { code: 'DROP_MAIL_CONFIG_INVALID' });
  const verify = verifyIdToken ?? (async options => {
    const { OAuth2Client } = await import('google-auth-library');
    return (await new OAuth2Client().verifyIdToken(options)).getPayload();
  });
  return async authorization => {
    const idToken = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization ?? '')?.[1];
    if (!idToken) return false;
    try {
      const payload = await verify({ idToken, audience });
      return payload?.aud === audience && ['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss)
        && payload.email === serviceAccountEmail && payload.email_verified === true;
    } catch { return false; }
  };
}

// ---- Configuration ----
// DROP_MAIL_ENABLED is the kill switch: absent or 'false' is off (the default); 'true' needs a sender,
// a pepper of at least 32 characters, a named transport and a deferral (DROP_MAIL_DEFERRAL, default inline).
// Hosted runs never use the capture transport or the provider deferral: only disabled or cloudflare, inline or cloud-tasks.
export const DROP_MAIL_TRANSPORTS = Object.freeze(['capture', 'disabled', 'cloudflare']);
const configInvalid = () => { throw Object.assign(new Error('Drop mail requires DROP_MAIL_FROM, MAIL_PEPPER and a supported DROP_MAIL_TRANSPORT and DROP_MAIL_DEFERRAL.'), { code: 'DROP_MAIL_CONFIG_INVALID' }); };
export function dropMailSettings(environment = {}, { hosted = false } = {}) {
  const enabled = environment.DROP_MAIL_ENABLED;
  if (enabled === undefined || enabled === 'false') return null;
  const transport = environment.DROP_MAIL_TRANSPORT; const deferral = environment.DROP_MAIL_DEFERRAL ?? 'inline';
  if (enabled !== 'true' || !DROP_MAIL_TRANSPORTS.includes(transport) || !['inline', 'provider', 'cloud-tasks'].includes(deferral)
    || (hosted && (transport === 'capture' || deferral === 'provider'))
    || !deliveryEmailValid(environment.DROP_MAIL_FROM) || typeof environment.MAIL_PEPPER !== 'string' || environment.MAIL_PEPPER.length < 32) configInvalid();
  const settings = { transport, deferral, from: environment.DROP_MAIL_FROM, pepper: environment.MAIL_PEPPER };
  if (transport === 'cloudflare') {
    if (!/^[a-f0-9]{32}$/.test(environment.CLOUDFLARE_ACCOUNT_ID ?? '') || (environment.CLOUDFLARE_EMAIL_TOKEN ?? '').length < 20) configInvalid();
    Object.assign(settings, { accountId: environment.CLOUDFLARE_ACCOUNT_ID, token: environment.CLOUDFLARE_EMAIL_TOKEN });
  }
  if (deferral === 'cloud-tasks') {
    let origin; try { origin = new URL(environment.APP_ORIGIN).origin; } catch { configInvalid(); }
    if (!origin.startsWith('https://') || !QUEUE.test(environment.DROP_MAIL_TASKS_QUEUE ?? '')
      || !/^[a-z0-9-]{6,30}@[a-z0-9-]{6,30}\.iam\.gserviceaccount\.com$/.test(environment.DROP_MAIL_TASKS_INVOKER ?? '')) configInvalid();
    Object.assign(settings, { queue: environment.DROP_MAIL_TASKS_QUEUE, invoker: environment.DROP_MAIL_TASKS_INVOKER, origin });
  }
  return settings;
}
// `fetch`, `accessToken` and `verifyIdToken` are injectable so tests never touch the network.
export function createDropMailerFromEnvironment(environment, { store, hosted = false, now, fetch, accessToken, verifyIdToken } = {}) {
  const settings = dropMailSettings(environment, { hosted });
  if (!settings) return null;
  if (!store) configInvalid();
  const transport = settings.transport === 'capture' ? createCaptureTransport({ from: settings.from, environment })
    : settings.transport === 'cloudflare' ? createCloudflareTransport({ accountId: settings.accountId, token: settings.token, from: settings.from, fetch })
    : createDisabledTransport();
  const tasks = settings.deferral === 'cloud-tasks';
  const deferral = tasks ? createCloudTasksDeferral({ queue: settings.queue, url: settings.origin + DROP_MAIL_TASK_PATH, serviceAccountEmail: settings.invoker,
    audience: settings.origin, fetch, ...(accessToken ? { accessToken } : {}) }) : settings.deferral;
  const verifyTask = tasks ? createTaskVerifier({ audience: settings.origin, serviceAccountEmail: settings.invoker, verifyIdToken }) : null;
  return createDropMailer({ store, transport, pepper: settings.pepper, deferral, verifyTask, now });
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
const MAIL_ID = /^mail-[a-f0-9]{32}$/;
// The task body the internal route accepts: exactly the message fields the mailer queued, bounded.
function taskMessage(body) {
  const keys = ['html', 'idempotencyKey', 'subject', 'text', 'to'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== keys.join() || !deliveryEmailValid(body.to)
    || !MAIL_ID.test(body.idempotencyKey ?? '') || [body.subject, body.html, body.text].some(value => typeof value !== 'string' || !value || value.length > 100_000)
    || body.subject.length > 200) fail('INVALID_MAIL_TASK');
  return body;
}
export function createDropMailer({ store, transport, pepper, deferral = 'provider', verifyTask = null, now = () => new Date(), delayMs = DROP_MAIL_DELAY_MS,
  timeoutMs = DROP_MAIL_TIMEOUT_MS } = {}) {
  const plan = typeof deferral === 'string' ? DROP_MAIL_DEFERRALS[deferral] : deferral;
  if (['reserve', 'peek', 'claim'].some(name => typeof store?.[name] !== 'function') || typeof transport?.send !== 'function'
    || typeof plan?.defer !== 'function' || !['sent', 'scheduled'].includes(plan.status)
    || (plan.name === 'cloud-tasks' && (typeof verifyTask !== 'function' || typeof store.wasSent !== 'function'))) throw new Error('A drop mail store, transport and deferral are required.');
  addressKey('check@example.com', pepper);
  return {
    store,
    // Present only with the cloud-tasks deferral; the server exposes the internal task route only then.
    verifyTask,
    // Returns the delivery outcome to record on the watch ({ status, mailId? }), or null when this revision
    // was already mailed. `sessionId` is the session's stored id (sha256 of its cookie), never the cookie.
    async deliver({ sessionId, expiresAt, code, watch, booking, card, origin }) {
      if (!watch?.delivery?.email) return null;
      if (transport.available === false) return { status: 'failed' };
      const time = now().getTime(); const sendAt = new Date(time + delayMs);
      if (expiresAt - sendAt.getTime() < MIN_LINK_LIFE_MS) return { status: 'capped' };
      const { token, hash } = createMailToken(); const mailId = mailIdFor(sessionId, code, watch.revision);
      // Built before anything is reserved, so a booking the template refuses never spends a cap.
      const { subject, html, text } = dropMailMessage(dropMailFacts({ booking, watch, card, origin, code, token, expiresAt }));
      const outcome = await store.reserve({ sessionId, code, watchRevision: watch.revision, mailId, tokenHash: hash,
        addressKey: addressKey(watch.delivery.email, pepper), expiresAt, time });
      if (outcome.status === 'duplicate') return null;
      if (outcome.status === 'capped') return { status: 'capped' };
      try {
        await withTimeout(Promise.resolve().then(() => plan.defer({ transport, message: { to: watch.delivery.email, subject, html, text }, sendAt, idempotencyKey: mailId })), timeoutMs);
        return { status: plan.status, mailId };
      } catch { return { status: 'failed', mailId }; }
    },
    // The cloud-tasks callback, after the route verified the caller: sends one queued message once.
    // Returns 'sent' or 'duplicate'; a transport failure throws so Cloud Tasks retries the task.
    async deliverTask(body) {
      if (plan.name !== 'cloud-tasks') fail('ROUTE_UNAVAILABLE');
      const message = taskMessage(body);
      if (await store.wasSent(message.idempotencyKey)) return 'duplicate';
      await withTimeout(Promise.resolve().then(() => transport.send({ ...message, sendAt: null })), timeoutMs);
      await store.recordSent(message.idempotencyKey, new Date(now().getTime() + DAY_MS));
      return 'sent';
    },
  };
}