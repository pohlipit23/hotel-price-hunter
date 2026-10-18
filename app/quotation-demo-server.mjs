import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { publicQuotationDemo } from './domain/quotation-demo.mjs';
import { QUOTATION_MODEL } from './quotation-advisor.mjs';
import { isDisplayedDrop } from './public/drop-eligibility.js';
import { agencyMinimumSavingMinor, watchTag } from './public/drop-watch.js';
import { watchBlocker } from './domain/altovo-quotation.mjs';
import { armDropWatch, armRequest, committedWatch } from './domain/booking-drop-watch.mjs';
import { createMemorySessionStorage } from './quotation-session-storage.mjs';
import { publicPostWatchState } from './quotation-session-actions.mjs';
import { createPostWatchHandler } from './quotation-post-watch.mjs';

export function validateLocalQuotationMode(env = process.env) {
  if (env.NODE_ENV === 'production' || env.K_SERVICE || env.CLOUD_RUN_JOB || (env.BIND_HOST && env.BIND_HOST !== '127.0.0.1')) {
    throw new Error('Quotation demo requires explicit local loopback execution.');
  }
}
const cloudTarget = Object.freeze({ NODE_ENV: 'production', K_SERVICE: 'hotel-price-hunter', GOOGLE_CLOUD_PROJECT: 'sincere-apex-511418-p0',
  APP_SURFACE: 'customer', APP_ORIGIN: 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app' });
export function validateCloudQuotationMode(environment) {
  const advice = environment?.QUOTATION_ADVICE_ENABLED === 'true';
  if (!environment || Object.entries(cloudTarget).some(([key, value]) => environment[key] !== value)
    || ['CLOUD_RUN_JOB', 'FIRESTORE_EMULATOR_HOST', 'GOOGLE_APPLICATION_CREDENTIALS'].some(key => environment[key])
    || (environment.QUOTATION_ADVICE_ENABLED && !advice)
    || (advice ? environment.GEMINI_MODEL !== QUOTATION_MODEL || environment.GOOGLE_CLOUD_LOCATION !== 'global' : environment.GEMINI_MODEL || environment.GOOGLE_CLOUD_LOCATION)) {
    throw new Error('Hosted quotation mode requires the exact private customer Cloud Run profile.');
  }
}
function validateDeploymentSnapshot(snapshot) {
  const allowed = ['schemaVersion', 'snapshotVersion', 'transactionMode', 'baseline', 'options', 'checkedAt', 'completeness', 'customerRefund', 'reservationCreated'];
  if (!snapshot || Object.keys(snapshot).some(key => !allowed.includes(key)) || snapshot.transactionMode !== 'selection-only'
    || snapshot.customerRefund !== null || snapshot.reservationCreated !== false || !Array.isArray(snapshot.options)
    || snapshot.options.length > 3 || snapshot.options.some(option => typeof option.optionId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(option.optionId))
    || new Set(snapshot.options.map(option => option.optionId)).size !== snapshot.options.length) throw new Error('Invalid hosted quotation snapshot.');
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (/token|password|secret|contact|email|phone|passport|guest|first.?name|last.?name|address|traveler.?id|visitor.?id|sourceId|supplierCode|contractId|rateDetail|privateReferences/i.test(key)) throw new Error('Private fields cannot be packaged in the hosted snapshot.');
      inspect(child);
    }
  };
  inspect(snapshot);
}
export function deploymentQuotationSnapshot(bundle) {
  const snapshot = publicQuotationDemo(bundle); validateDeploymentSnapshot(snapshot); return snapshot;
}
const CATALOGUE_CODE = /^[A-Z0-9]{4,20}$/;
function validateDeploymentCatalogue(catalogue) {
  if (!Array.isArray(catalogue) || !catalogue.length || catalogue.length > 20
    || catalogue.some(entry => !entry || typeof entry !== 'object' || Object.keys(entry).sort().join() !== 'code,snapshot' || !CATALOGUE_CODE.test(entry.code)
      || entry.snapshot?.baseline?.quotationCode !== entry.code)
    || new Set(catalogue.map(entry => entry.code)).size !== catalogue.length) throw new Error('Invalid hosted quotation catalogue.');
  for (const entry of catalogue) validateDeploymentSnapshot(entry.snapshot);
}
// Strips each private catalogue entry down to the public snapshot; blockers are recomputed at request time.
export function deploymentCatalogue(privateCatalogue) {
  if (privateCatalogue?.schemaVersion !== 1 || !Array.isArray(privateCatalogue.entries)) throw new Error('Invalid private quotation catalogue.');
  const catalogue = privateCatalogue.entries.map(entry => ({ code: entry?.code, snapshot: deploymentQuotationSnapshot(entry?.bundle) }));
  validateDeploymentCatalogue(catalogue); return catalogue;
}
const selectionOnlyBundle = snapshot => ({ ...snapshot, privateReferences: Object.fromEntries(snapshot.options.map(option => [option.optionId, { selectionOnly: true }])) });
// `bookingStorage` + `sessionStorage` (app/booking-storage.mjs, app/quotation-session-storage.mjs) serve the
// Firestore-backed judge catalogue; hosted mode requires Firestore sessions and never falls back to memory.
export function createHostedQuotationDemoServer({ snapshot, catalogue, reviewedCatalogue, bookingStorage, sessionStorage, environment = process.env, now, advisor } = {}) {
  validateCloudQuotationMode(environment);
  if ([snapshot, catalogue, bookingStorage].filter(value => value != null).length !== 1) throw new Error('Provide exactly one hosted snapshot, catalogue or booking storage.');
  if (bookingStorage) {
    if (sessionStorage?.mode !== 'firestore') throw new Error('Hosted booking storage requires durable Firestore sessions.');
    return createQuotationServer({ store: { bookings: bookingStorage, sessions: sessionStorage }, reviewedCatalogue, now, advisor, cloudOrigin: environment.APP_ORIGIN });
  }
  if (sessionStorage != null) throw new Error('Session storage is only used with booking storage.');
  if (catalogue) {
    validateDeploymentCatalogue(catalogue);
    // The packaged file catalogue keeps its existing process-local sessions until F9a replaces it with Firestore.
    return createQuotationServer({ store: fileCatalogueStore(catalogue.map(entry => ({ code: entry.code, bundle: selectionOnlyBundle(entry.snapshot) })), { now, processLocal: true }),
      now, advisor, cloudOrigin: environment.APP_ORIGIN });
  }
  validateDeploymentSnapshot(snapshot);
  return createQuotationServer({ bundle: selectionOnlyBundle(snapshot), now, advisor, cloudOrigin: environment.APP_ORIGIN });
}
const assets = new Map([
  ['/', ['quotation.html', 'text/html']], ['/quotation.js', ['quotation.js', 'text/javascript']],
  ['/quotation.css', ['quotation.css', 'text/css']], ['/booking.css', ['booking.css', 'text/css']],
  ['/assets/roomdrop-logo.png', ['assets/roomdrop-logo.png', 'image/png']],
  ['/assets/roomdrop-key-icon.png', ['assets/roomdrop-key-icon.png', 'image/png']],
  ['/assets/illustrative-stays.jpg', ['assets/illustrative-stays.jpg', 'image/jpeg']],
  // Reviewed S0.5 catalogue photos, the same exact list as app/booking-demo-server.mjs.
  ...['179-hotel', '180-hotel', '181-hotel', '181-room', '182-hotel', '182-room', '183-hotel', '184-hotel']
    .map(name => [`/assets/roomdrop-airb000${name}.jpg`, [`assets/roomdrop-airb000${name}.jpg`, 'image/jpeg']]),
]);
// `catalogue` is the private catalogue file shape: { schemaVersion: 1, entries: [{ code, bundle, capture? }] }.
// `bookingStorage` serves the Firestore catalogue instead; local runs may pair it with memory sessions.
export function createQuotationDemoServer({ bundle, catalogue, reviewedCatalogue, bookingStorage, sessionStorage, now = () => new Date(), advisor } = {}) {
  if (bookingStorage != null) {
    if (bundle != null || catalogue != null) throw new Error('Provide exactly one quotation snapshot, catalogue or booking storage.');
    return createQuotationServer({ store: { bookings: bookingStorage, sessions: sessionStorage ?? createMemorySessionStorage({ now }) }, reviewedCatalogue, now, advisor });
  }
  if (sessionStorage != null) throw new Error('Session storage is only used with booking storage.');
  if (catalogue == null) return createQuotationServer({ bundle, now, advisor });
  if (bundle != null || catalogue.schemaVersion !== 1 || !Array.isArray(catalogue.entries) || !catalogue.entries.length || catalogue.entries.length > 20
    || catalogue.entries.some(entry => !CATALOGUE_CODE.test(entry?.code ?? '') || entry.bundle?.baseline?.quotationCode !== entry.code)
    || new Set(catalogue.entries.map(entry => entry.code)).size !== catalogue.entries.length) throw new Error('A prepared private quotation catalogue is required.');
  return createQuotationServer({ store: fileCatalogueStore(catalogue.entries, { now }), now, advisor });
}
const validBundle = bundle => bundle?.schemaVersion === 1 && bundle.transactionMode === 'selection-only' && Array.isArray(bundle.options)
  && bundle.baseline?.sourceType === 'quotation' && /^[a-f0-9]{64}$/.test(bundle.snapshotVersion);
// A file catalogue behind the same read interface as booking storage. A file entry without a capture
// record counts as observed only when it holds Drops; no Drops is never presented as an empty search.
function fileCatalogueStore(entries, { now, processLocal = false }) {
  if (entries.some(({ bundle }) => !validBundle(bundle) || !/^[A-Z]{3}$/.test(bundle.baseline.quotedRetail?.currency ?? ''))) {
    throw new Error('A prepared private quotation demo snapshot is required.');
  }
  const records = new Map(entries.map(({ code, bundle, capture }, index) => {
    const status = ['observed', 'observed-empty'].includes(capture?.status) ? capture.status : bundle.options.length ? 'observed' : 'not-searched';
    const dropSetVersion = createHash('sha256').update(JSON.stringify({ checkedAt: bundle.checkedAt, options: bundle.options })).digest('hex');
    return [code, { code, order: index + 1, contentVersion: bundle.snapshotVersion, dropSetVersion, bundle,
      capture: { status, capturedAt: status === 'not-searched' ? null : bundle.checkedAt } }];
  }));
  const bookings = {
    async listCatalogue() { return [...records.values()].map(({ code, order, contentVersion, dropSetVersion }) => ({ code, order, contentVersion, dropSetVersion, card: null })); },
    async getBooking(code) { const record = records.get(code); return record ? { ...record, capture: { ...record.capture } } : null; },
  };
  // The explicit empty environment keeps the pre-F9a hosted file catalogue on process-local sessions, as before.
  const sessions = createMemorySessionStorage({ now, catalogueCodes: [...records.keys()], ...(processLocal ? { environment: {} } : {}) });
  return { bookings, sessions };
}
// Storage and arm refusals the routes report; anything else is a bounded 503 with no detail.
const REFUSALS = { INVALID_WATCH: 400, WATCH_CONSENT_REQUIRED: 400, MINIMUM_SAVING_INVALID: 400, DELIVERY_EMAIL_INVALID: 400, DEMO_SESSION_REQUIRED: 403, BOOKING_UNAVAILABLE: 404,
  SNAPSHOT_CHANGED: 409, WATCH_REVISION_STALE: 409, WATCH_CANNOT_START: 409, CAPTURE_UNAVAILABLE: 503, CATALOGUE_UNAVAILABLE: 503 };
const refusal = code => Object.assign(new Error('The booking demo is unavailable.'), { code });
function createQuotationServer({ bundle: single, store = null, reviewedCatalogue, now = () => new Date(), cloudOrigin = null, advisor = { available: false, status: 'unconfigured' } }) {
  if (store ? typeof store.bookings?.listCatalogue !== 'function' || typeof store.bookings.getBooking !== 'function'
    || ['create', 'get', 'transact'].some(name => typeof store.sessions?.[name] !== 'function') : !validBundle(single)) {
    throw new Error('A prepared private quotation demo snapshot is required.');
  }
  // The legacy single-snapshot surface keeps its sessions here. All catalogue state uses store.sessions.
  const sessions = new Map();
  let adviceWindow = 0; let adviceCount = 0; let advicePending = 0;
  const model = { available: advisor.available, status: advisor.status };
  // The reviewed manifest: the bounded list of catalogue codes and their cards, read once and never
  // seeded or imported here. A failed read is retried by the next request.
  let manifest = null; let catalogueSize = null;
  const loadManifest = () => manifest ??= store.bookings.listCatalogue().then(listed => {
    if (!Array.isArray(listed) || !listed.length || listed.length > 20 || listed.some(entry => !CATALOGUE_CODE.test(entry?.code ?? ''))) throw refusal('CATALOGUE_UNAVAILABLE');
    catalogueSize = listed.length; return new Map(listed.map(entry => [entry.code, entry.card ?? null]));
  }).catch(() => { manifest = null; throw refusal('CATALOGUE_UNAVAILABLE'); });
  const reviewed = reviewedCatalogue && new Map(reviewedCatalogue.entries.map(entry => [entry.code,
    { ...entry.bundle, contentVersion: entry.contentVersion, dropSetVersion: entry.dropSetVersion }]));
  const postWatch = store ? createPostWatchHandler({ sessionStorage: store.sessions, bookingStorage: store.bookings, now, advisor,
    loadBinding: async code => {
      if (!(await loadManifest()).has(code)) return null;
      if (reviewed) return reviewed.get(code) ?? null;
      const record = await store.bookings.getBooking(code);
      return record ? { ...record.bundle, contentVersion: record.contentVersion, dropSetVersion: record.dropSetVersion } : null;
    } }) : null;
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (cloudOrigin) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const error = (status, code, extra = {}) => json(res, status, { error: { code, ...extra, message: 'Reload the quotation demo and review your selection.' } });
    try {
      const port = server.address()?.port;
      if (cloudOrigin ? req.headers.host !== new URL(cloudOrigin).host
        : !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return error(403, 'LOCAL_ORIGIN_REQUIRED');
      const origin = cloudOrigin || `http://${req.headers.host}`; const url = new URL(req.url, origin);
      if (url.search) return error(400, 'ARBITRARY_LOOKUP_DENIED');
      if (['/health', '/healthz'].includes(url.pathname) && req.method === 'GET') return json(res, 200, store
        ? { status: 'ok', surface: 'quotation-demo', mode: 'selection-only', model, catalogueSize }
        : { status: 'ok', surface: 'quotation-demo', mode: 'selection-only', model, snapshotVersion: single.snapshotVersion, optionCount: single.options.length });
      const cookie = /(?:^|;\s*)roomdrop_quote=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      // Catalogue mode: every booking is addressed by its catalogue code in the path, never by query.
      const route = store ? /^\/api\/quotation-demo\/q\/([A-Z0-9]{4,20})(?:\/(watch|confirm|advice|chat))?$/.exec(url.pathname) : null;
      if (postWatch && req.method === 'POST' && ['confirm', 'advice', 'chat'].includes(route?.[2]))
        return postWatch({ req, res, cookie, code: route[1], action: route[2], origin, json, error });
      const catalogueRead = store && req.method === 'GET' && (url.pathname === '/api/quotation-demo/catalogue' || Boolean(route && !route[2]));
      let session = null; let durable = null; let booking = null; let cards = null;
      if (catalogueRead || (route?.[2] && req.method === 'POST')) {
        // Only codes in the reviewed manifest are ever looked up; the durable session is read once per request.
        cards = await loadManifest();
        if (route && !cards.has(route[1])) return error(404, 'BOOKING_UNAVAILABLE');
        durable = await store.sessions.get(cookie);
        if (durable) session = durable;
      } else if (!store) {
        session = sessions.get(cookie);
        if (session?.expiresAt <= now().getTime()) { sessions.delete(cookie); session = null; }
      }
      const loadBooking = async code => (booking = await store.bookings.getBooking(code));
      const openSession = async () => {
        if (session) return true;
        const setCookie = id => res.setHeader('Set-Cookie', `roomdrop_quote=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${cloudOrigin ? '; Secure' : ''}`);
        if (store) {
          let created;
          try { created = await store.sessions.create(); } catch (failure) { if (failure?.code === 'SESSION_CAPACITY') return false; throw failure; }
          durable = created.session; session = durable; setCookie(created.cookieValue);
          return true;
        }
        for (const [key, value] of sessions) if (value.expiresAt <= now().getTime()) sessions.delete(key);
        if (sessions.size >= 64) return false;
        const id = randomBytes(32).toString('hex'); session = { csrfToken: randomBytes(32).toString('hex'), expiresAt: now().getTime() + 3600000, confirmation: null, adviceWindow: 0, adviceCount: 0, adviceHistory: {}, chatHistory: [], byCode: {} };
        sessions.set(id, session); setCookie(id);
        return true;
      };
      const codeScope = code => ({ ...durable?.byCode?.[code], watch: committedWatch(durable, code, booking) });
      if (req.method === 'GET' && (store ? catalogueRead : url.pathname === '/api/quotation-demo')) {
        if (req.headers['sec-fetch-site'] === 'cross-site') return error(403, 'LOCAL_ORIGIN_REQUIRED');
        if (route && !(await loadBooking(route[1]))) return error(404, 'BOOKING_UNAVAILABLE');
        if (!(await openSession())) return error(503, 'DEMO_SESSION_CAPACITY');
        if (!store) return json(res, 200, { ...publicQuotationDemo(single), csrfToken: session.csrfToken, confirmation: session.confirmation, model });
        const at = now();
        if (!route) {
          const listed = await Promise.all([...cards.keys()].map(code => store.bookings.getBooking(code)));
          if (listed.some(item => !item)) throw refusal('CATALOGUE_UNAVAILABLE');
          const entries = listed.map(({ code, bundle: item }) => {
            const b = item.baseline; const blocker = watchBlocker(b, at); const freeUntil = b.cancellation?.freeUntil ?? null;
            return { code, snapshotVersion: item.snapshotVersion, checkedAt: item.checkedAt,
              hotel: { name: b.hotel.name, star: b.hotel.star ?? null, cityCode: b.hotel.cityCode ?? null, countryCode: b.hotel.countryCode ?? null },
              stay: b.stay, occupancy: b.occupancy, room: b.room, quotedRetail: b.quotedRetail,
              cancellation: { nonRefundable: b.cancellation?.nonRefundable === true, freeUntil }, blocker, tag: watchTag(blocker, freeUntil, at),
              optionCount: item.options.length, card: cards.get(code) };
          });
          return json(res, 200, { schemaVersion: 1, entries, csrfToken: session.csrfToken });
        }
        const code = route[1]; const item = booking.bundle; const scope = codeScope(code);
        return json(res, 200, { ...publicQuotationDemo(item), code, dropSetVersion: booking.dropSetVersion, capture: booking.capture,
          csrfToken: session.csrfToken, blocker: watchBlocker(item.baseline, at),
          agencyMinimumSavingMinor: agencyMinimumSavingMinor(item.baseline.quotedRetail.currency), watch: scope.watch,
          ...publicPostWatchState({ scope, bundle: { ...item, contentVersion: booking.contentVersion, dropSetVersion: booking.dropSetVersion } }), model });
      }
      const singlePost = !store && ['/api/quotation-demo/confirm', '/api/quotation-demo/advice', '/api/quotation-demo/chat'].includes(url.pathname);
      if ((singlePost || route?.[2]) && req.method === 'POST') {
        if (!session || req.headers.origin !== origin || req.headers['x-csrf-token'] !== session.csrfToken
          || req.headers['sec-fetch-site'] === 'cross-site') return error(403, 'DEMO_SESSION_REQUIRED');
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return error(400, 'INVALID_SELECTION');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 4096) return error(413, 'SELECTION_TOO_LARGE'); chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return error(400, 'INVALID_SELECTION'); }
        if (route && !(await loadBooking(route[1]))) return error(404, 'BOOKING_UNAVAILABLE');
        const bundle = route ? (booking.bundle.privateReferences ? booking.bundle : selectionOnlyBundle(booking.bundle)) : single; const scope = route ? codeScope(route[1]) : session;
        if (route?.[2] === 'watch') {
          // The booking and its current Drop set are read before the transaction; the arm, the version
          // checks and the captured first-check replay then commit together, and only then is the receipt sent.
          const request = armRequest(body, bundle.baseline.quotedRetail.currency); const at = now();
          return json(res, 200, await store.sessions.transact(cookie, draft => armDropWatch(draft, { code: route[1], booking, request, at })));
        }
        // An armed Drop Watch narrows the Drops this booking may discuss or confirm to the ones it found.
        const watched = route ? scope.watch?.firstCheck.dropOptionIds ?? null : null;
        const shown = option => isDisplayedDrop(bundle.baseline, option) && (!watched || watched.includes(option.optionId));
        const chat = url.pathname.endsWith('/chat');
        if (chat || url.pathname.endsWith('/advice')) {
          if (chat) {
            if (!body || Array.isArray(body) || Object.keys(body).some(key => !['optionId', 'snapshotVersion', 'message', 'pageContext', 'intent'].includes(key))
              || !['drops-overview', 'drop-detail'].includes(body.pageContext) || !['opening', 'question'].includes(body.intent)
              || (body.intent === 'question' && (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1200))
              || (body.intent === 'opening' && Object.hasOwn(body, 'message'))
              || (body.pageContext === 'drops-overview' && Object.hasOwn(body, 'optionId'))
              || (body.pageContext === 'drop-detail' && typeof body.optionId !== 'string')) return error(400, 'INVALID_ADVICE');
          } else {
          if (!body || Array.isArray(body) || Object.keys(body).some(key => !['optionId', 'snapshotVersion', 'message'].includes(key))
            || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1200) return error(400, 'INVALID_ADVICE');
          }
          if (body.snapshotVersion !== bundle.snapshotVersion) return error(409, 'SNAPSHOT_CHANGED');
          const option = bundle.options.find(value => value.optionId === body.optionId);
          if ((!chat || body.pageContext === 'drop-detail') && !option) return error(404, 'OPTION_UNAVAILABLE');
          if (option && (chat || route) && !shown(option)) return error(404, 'OPTION_UNAVAILABLE');
          if (!advisor.available || (chat && typeof advisor.chat !== 'function')) return error(503, 'ADVICE_UNAVAILABLE');
          const time = now().getTime();
          if (time - session.adviceWindow >= 60000) { session.adviceWindow = time; session.adviceCount = 0; }
          if (time - adviceWindow >= 60000) { adviceWindow = time; adviceCount = 0; }
          if (session.adviceCount >= 4 || adviceCount >= 20 || advicePending >= 2) return error(429, 'ADVICE_RATE_LIMIT');
          session.adviceCount++; adviceCount++; advicePending++;
          try {
            if (chat) {
              const optionId = option?.optionId ?? null;
              const advice = await advisor.chat({ baseline: bundle.baseline, options: option ? [option] : bundle.options.filter(shown),
                pageContext: body.pageContext, optionId, snapshotVersion: bundle.snapshotVersion, checkedAt: bundle.checkedAt,
                intent: body.intent, message: body.message, history: scope.chatHistory });
              if (sessions.get(cookie) !== session || session.expiresAt <= now().getTime()) return error(401, 'DEMO_SESSION_REQUIRED');
              scope.chatHistory = [...scope.chatHistory, { pageContext: body.pageContext, optionId, snapshotVersion: bundle.snapshotVersion,
                question: body.intent === 'opening' ? 'Opening guidance' : body.message, reply: advice.reply }].slice(-4);
              return json(res, 200, { advice, optionId, pageContext: body.pageContext, snapshotVersion: bundle.snapshotVersion,
                source: advisor.status === 'test-injected' ? 'test-injected' : 'vertex-gemini', selectionChanged: false });
            }
            const history = scope.adviceHistory[option.optionId] || [];
            const advice = await advisor.advise({ baseline: bundle.baseline, option, checkedAt: bundle.checkedAt, message: body.message, history });
            if (sessions.get(cookie) !== session || session.expiresAt <= now().getTime()) return error(401, 'DEMO_SESSION_REQUIRED');
            const { recommendation, priority, reasonCodes } = advice;
            scope.adviceHistory[option.optionId] = [...history, { question: body.message, selection: { recommendation, priority, reasonCodes } }].slice(-2);
            return json(res, 200, { advice, optionId: option.optionId, snapshotVersion: bundle.snapshotVersion,
              source: advisor.status === 'test-injected' ? 'test-injected' : 'vertex-gemini', selectionChanged: false });
          } catch { return error(503, 'ADVICE_UNAVAILABLE'); } finally { advicePending--; }
        }
        const allowed = ['optionId', 'snapshotVersion', 'acceptedDemoOnly', 'acceptReducedFlexibility'];
        if (!body || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || body.acceptedDemoOnly !== true) return error(400, 'INVALID_SELECTION');
        if (body.snapshotVersion !== bundle.snapshotVersion) return error(409, 'SNAPSHOT_CHANGED');
        if (route && !scope.watch) return error(409, 'WATCH_NOT_ARMED');
        const option = bundle.options.find(value => value.optionId === body.optionId);
        if (!option || !Object.hasOwn(bundle.privateReferences, option.optionId) || (route && !shown(option))) return error(404, 'OPTION_UNAVAILABLE');
        if (option.freeCancellation !== true && body.acceptReducedFlexibility !== true) return error(400, 'FLEXIBILITY_ACKNOWLEDGEMENT_REQUIRED');
        if (option.freeCancellation === true && Object.hasOwn(body, 'acceptReducedFlexibility')) return error(400, 'INVALID_SELECTION');
        if (scope.confirmation?.optionId !== option.optionId) scope.confirmation = { status: 'demo-selection-confirmed',
          selectionId: `demo-${randomBytes(12).toString('hex')}`, optionId: option.optionId, snapshotVersion: bundle.snapshotVersion,
          confirmedAt: now().toISOString(), reservationCreated: false, quoteModified: false, customerRefund: null };
        return json(res, 200, { confirmation: scope.confirmation });
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [path, type] = assets.get(url.pathname); const content = await readFile(new URL(`./public/${path}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${type}${type.startsWith('text/') ? '; charset=utf-8' : ''}` }); return res.end(content);
      }
      return error(404, 'ROUTE_UNAVAILABLE');
    } catch (failure) {
      if (res.headersSent) return res.end();
      // Known refusals keep their code (and a cannot-start reason); storage or SDK failures stay a bounded 503.
      const status = Object.hasOwn(REFUSALS, failure?.code ?? '') ? REFUSALS[failure.code] : null;
      if (!status) return error(503, 'DEMO_UNAVAILABLE');
      return error(status, failure.code, typeof failure.reason === 'string' ? { reason: failure.reason } : {});
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
