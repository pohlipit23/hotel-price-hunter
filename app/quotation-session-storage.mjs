import { createHash, randomBytes } from 'node:crypto';

// Durable anonymous judge sessions for the curated RoomDrop demo.
//   {prefix}PublicSessionsV1/{sha256(cookieValue)}   one private session; the raw cookie is never stored
//   {prefix}PublicSessionsV1Capacity/live            shared live-session accounting for the capacity cap
// Session shape: { csrfToken, expiresAt, byCode: { [code]: { contentVersion, dropSetVersion, watch, ...Part 2 fields } }, ...Part 2 fields }.
// Part 1 owns `byCode[code].watch`; every write preserves fields it does not know. Values must be JSON data.

const fail = (code, message = 'The demo session could not be used.') => { const error = new Error(message); error.code = code; throw error; };
const COOKIE = /^[a-f0-9]{64}$/;
const CODE = /^[A-Z0-9]{4,20}$/;
const VERSION = /^[a-f0-9]{64}$/;
const MAX_CODES = 20;
const MAX_SESSION_BYTES = 200_000;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('hex');
const json = value => JSON.parse(JSON.stringify(value));
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Returns this session's entry for one catalogue code, creating it if absent. When the stored
// booking content or Drop-set version differs, the Part 1 watch no longer applies and is reset.
export function codeScope(session, code, { contentVersion, dropSetVersion } = {}) {
  if (typeof code !== 'string' || !CODE.test(code)) fail('BOOKING_UNAVAILABLE');
  if (!VERSION.test(contentVersion ?? '') || !VERSION.test(dropSetVersion ?? '')) fail('SESSION_STATE_INVALID');
  session.byCode ??= {};
  const entry = session.byCode[code] ??= { contentVersion, dropSetVersion, watch: null };
  if (entry.contentVersion !== contentVersion || entry.dropSetVersion !== dropSetVersion) {
    Object.assign(entry, { contentVersion, dropSetVersion, watch: null });
  }
  return entry;
}

function options({ now = () => new Date(), maxSessions = 64, ttlMs = 3_600_000, catalogueCodes = null } = {}) {
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > 64) throw new Error('Session capacity must be 1 to 64.');
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 3_600_000) throw new Error('Session lifetime must be at most one hour.');
  if (catalogueCodes !== null && (!Array.isArray(catalogueCodes) || catalogueCodes.length > MAX_CODES || catalogueCodes.some(code => !CODE.test(code)))) {
    throw new Error('The session catalogue must be a bounded list of codes.');
  }
  return { now, maxSessions, ttlMs, catalogue: catalogueCodes && new Set(catalogueCodes) };
}

// Runs one mutation on a private copy and checks the invariants before anything is committed.
function mutate(stored, fn, catalogue) {
  const session = json(stored);
  const result = fn(session);
  if (result instanceof Promise) { result.catch(() => {}); fail('SESSION_STATE_INVALID', 'Session mutations must be synchronous.'); }
  if (!plain(session) || session.csrfToken !== stored.csrfToken || session.expiresAt !== stored.expiresAt || !plain(session.byCode)) fail('SESSION_STATE_INVALID');
  const codes = Object.keys(session.byCode);
  if (codes.length > MAX_CODES || codes.some(code => !CODE.test(code))) fail('SESSION_STATE_INVALID');
  if (catalogue && codes.some(code => !catalogue.has(code))) fail('BOOKING_UNAVAILABLE');
  if (codes.some(code => !plain(session.byCode[code]) || !VERSION.test(session.byCode[code].contentVersion ?? '')
    || !VERSION.test(session.byCode[code].dropSetVersion ?? ''))) fail('SESSION_STATE_INVALID');
  const next = json(session);
  if (JSON.stringify(next).length > MAX_SESSION_BYTES) fail('SESSION_STATE_INVALID');
  return { next, result };
}

const newSession = (time, ttlMs) => ({ csrfToken: token(), expiresAt: time + ttlMs, byCode: {} });

export function createFirestoreSessionStorage({ firestore, prefix = 'roomdrop', ...settings } = {}) {
  if (typeof prefix !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(prefix)) throw new Error('Invalid session storage prefix.');
  const { now, maxSessions, ttlMs, catalogue } = options(settings);
  const sessions = () => firestore.collection(`${prefix}PublicSessionsV1`);
  const capacity = () => firestore.collection(`${prefix}PublicSessionsV1Capacity`).doc('live');
  // `ttlAt` is a Timestamp for a separately approved TTL policy; it is never exposed to callers.
  const stored = ({ ttlAt, ...session }) => session;
  const unavailable = error => {
    if (typeof error?.code === 'string') return error;
    const wrapped = new Error('Session storage is unavailable.'); wrapped.code = 'STORAGE_UNAVAILABLE'; wrapped.cause = error; return wrapped;
  };
  return {
    mode: 'firestore',
    async create() {
      // Identifiers and times are fixed before the retryable transaction callback.
      const cookieValue = token(); const id = sha256(cookieValue); const time = now().getTime();
      const session = newSession(time, ttlMs);
      try {
        await firestore.runTransaction(async transaction => {
          const snapshot = await transaction.get(capacity());
          const listed = snapshot.exists && Array.isArray(snapshot.data().sessions) ? snapshot.data().sessions : [];
          const live = listed.filter(item => item.expiresAt > time);
          if (live.length >= maxSessions) fail('SESSION_CAPACITY');
          // Bounded cleanup: only sessions this list already accounted for, at most the capacity.
          for (const item of listed) if (item.expiresAt <= time && COOKIE.test(item.id)) transaction.delete(sessions().doc(item.id));
          transaction.set(capacity(), { sessions: [...live, { id, expiresAt: session.expiresAt }] });
          transaction.create(sessions().doc(id), { ...session, ttlAt: new Date(session.expiresAt) });
        });
      } catch (error) { throw unavailable(error); }
      return { cookieValue, session: json(session) };
    },
    async get(cookieValue) {
      if (typeof cookieValue !== 'string' || !COOKIE.test(cookieValue)) return null;
      let snapshot;
      try { snapshot = await sessions().doc(sha256(cookieValue)).get(); } catch (error) { throw unavailable(error); }
      if (!snapshot.exists) return null;
      const session = stored(snapshot.data());
      return session.expiresAt > now().getTime() ? session : null;
    },
    async transact(cookieValue, fn) {
      if (typeof cookieValue !== 'string' || !COOKIE.test(cookieValue)) fail('DEMO_SESSION_REQUIRED');
      const reference = sessions().doc(sha256(cookieValue));
      // The callback may run again if Firestore retries the transaction, always on a fresh copy.
      let refusal = null;
      try {
        return await firestore.runTransaction(async transaction => {
          const snapshot = await transaction.get(reference);
          if (!snapshot.exists) fail('DEMO_SESSION_REQUIRED');
          const current = stored(snapshot.data());
          if (current.expiresAt <= now().getTime()) fail('DEMO_SESSION_REQUIRED');
          let mutation;
          try { mutation = mutate(current, fn, catalogue); } catch (error) { refusal = error; throw error; }
          transaction.set(reference, { ...mutation.next, ttlAt: new Date(mutation.next.expiresAt) });
          return mutation.result;
        });
      } catch (error) { throw error === refusal ? error : unavailable(error); }
    },
    // Opens a new session from a Drop email link in one transaction: the drop mail store's claim reads and
    // counts the link, capacity is checked, and only byCode[code] is copied from the source session, which
    // must still be live. The copy keeps the source's expiry and gets its own cookie and CSRF token.
    async fork(code, claim) {
      if (typeof code !== 'string' || !CODE.test(code) || (catalogue && !catalogue.has(code))) fail('BOOKING_UNAVAILABLE');
      const cookieValue = token(); const id = sha256(cookieValue); const csrfToken = token(); const time = now().getTime();
      let session;
      try {
        await firestore.runTransaction(async transaction => {
          const link = await claim.read(transaction);
          if (!COOKIE.test(link?.sourceSessionId ?? '')) fail('MAIL_LINK_EXPIRED');
          const [source, live] = await transaction.getAll(sessions().doc(link.sourceSessionId), capacity());
          const current = source.exists ? stored(source.data()) : null; const entry = current?.byCode?.[code];
          if (!current || current.expiresAt <= time || !plain(entry) || !entry.watch) fail('MAIL_LINK_EXPIRED');
          const listed = live.exists && Array.isArray(live.data().sessions) ? live.data().sessions : [];
          const remaining = listed.filter(item => item.expiresAt > time);
          if (remaining.length >= maxSessions) fail('SESSION_CAPACITY');
          session = { csrfToken, expiresAt: Math.min(current.expiresAt, link.expiresAt), byCode: { [code]: json(entry) } };
          for (const item of listed) if (item.expiresAt <= time && COOKIE.test(item.id)) transaction.delete(sessions().doc(item.id));
          transaction.set(capacity(), { sessions: [...remaining, { id, expiresAt: session.expiresAt }] });
          transaction.create(sessions().doc(id), { ...session, ttlAt: new Date(session.expiresAt) });
          claim.write(transaction, link);
        });
      } catch (error) { throw unavailable(error); }
      return { cookieValue, session: json(session) };
    },
  };
}

// Tests and local loopback runs only, with the same interface. Refused in any hosted environment
// so production can never silently fall back to process memory.
export function createMemorySessionStorage({ environment = process.env, ...settings } = {}) {
  if (environment.NODE_ENV === 'production' || environment.K_SERVICE || environment.CLOUD_RUN_JOB) {
    throw new Error('Memory session storage is for tests and local runs only.');
  }
  const { now, maxSessions, ttlMs, catalogue } = options(settings);
  const documents = new Map();
  const live = id => documents.get(id)?.expiresAt > now().getTime();
  return {
    mode: 'test-memory',
    async create() {
      const time = now().getTime();
      for (const [id, session] of documents) if (session.expiresAt <= time) documents.delete(id);
      if (documents.size >= maxSessions) fail('SESSION_CAPACITY');
      const cookieValue = token(); const session = newSession(time, ttlMs);
      documents.set(sha256(cookieValue), session);
      return { cookieValue, session: json(session) };
    },
    async get(cookieValue) {
      if (typeof cookieValue !== 'string' || !COOKIE.test(cookieValue)) return null;
      const id = sha256(cookieValue);
      return live(id) ? json(documents.get(id)) : null;
    },
    async transact(cookieValue, fn) {
      if (typeof cookieValue !== 'string' || !COOKIE.test(cookieValue)) fail('DEMO_SESSION_REQUIRED');
      const id = sha256(cookieValue);
      if (!live(id)) fail('DEMO_SESSION_REQUIRED');
      const { next, result } = mutate(documents.get(id), fn, catalogue);
      documents.set(id, next);
      return result;
    },
    // Same contract as the Firestore fork. The claim must be synchronous here (the memory drop mail store's
    // is), so the link check, the capacity check and both writes run without yielding.
    async fork(code, claim) {
      if (typeof code !== 'string' || !CODE.test(code) || (catalogue && !catalogue.has(code))) fail('BOOKING_UNAVAILABLE');
      const time = now().getTime();
      const link = claim.read(null);
      if (link instanceof Promise) { link.catch(() => {}); fail('SESSION_STATE_INVALID', 'Memory forks need a synchronous claim.'); }
      const source = documents.get(link?.sourceSessionId); const entry = source?.byCode?.[code];
      if (!source || source.expiresAt <= time || !plain(entry) || !entry.watch) fail('MAIL_LINK_EXPIRED');
      for (const [id, session] of documents) if (session.expiresAt <= time) documents.delete(id);
      if (documents.size >= maxSessions) fail('SESSION_CAPACITY');
      const cookieValue = token();
      const session = { csrfToken: token(), expiresAt: Math.min(source.expiresAt, link.expiresAt), byCode: { [code]: json(entry) } };
      documents.set(sha256(cookieValue), session); claim.write(null, link);
      return { cookieValue, session: json(session) };
    },
  };
}
