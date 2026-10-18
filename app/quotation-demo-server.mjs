import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { publicQuotationDemo } from './domain/quotation-demo.mjs';
import { QUOTATION_MODEL } from './quotation-advisor.mjs';
import { isDisplayedDrop } from './public/drop-eligibility.js';
import { agencyMinimumSavingMinor, qualifyingDrops, watchTag } from './public/drop-watch.js';
import { watchBlocker } from './domain/altovo-quotation.mjs';

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
export function createHostedQuotationDemoServer({ snapshot, catalogue, environment = process.env, now, advisor } = {}) {
  validateCloudQuotationMode(environment);
  if ((snapshot == null) === (catalogue == null)) throw new Error('Provide exactly one hosted snapshot or catalogue.');
  if (catalogue) {
    validateDeploymentCatalogue(catalogue);
    return createQuotationServer({ bundles: new Map(catalogue.map(entry => [entry.code, selectionOnlyBundle(entry.snapshot)])), now, advisor, cloudOrigin: environment.APP_ORIGIN });
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
]);
// `catalogue` is the private catalogue file shape: { schemaVersion: 1, entries: [{ code, bundle }] }.
export function createQuotationDemoServer({ bundle, catalogue, now = () => new Date(), advisor } = {}) {
  if (catalogue == null) return createQuotationServer({ bundle, now, advisor });
  if (bundle != null || catalogue.schemaVersion !== 1 || !Array.isArray(catalogue.entries) || !catalogue.entries.length || catalogue.entries.length > 20
    || catalogue.entries.some(entry => !CATALOGUE_CODE.test(entry?.code ?? '') || entry.bundle?.baseline?.quotationCode !== entry.code)
    || new Set(catalogue.entries.map(entry => entry.code)).size !== catalogue.entries.length) throw new Error('A prepared private quotation catalogue is required.');
  return createQuotationServer({ bundles: new Map(catalogue.entries.map(entry => [entry.code, entry.bundle])), now, advisor });
}
const validBundle = bundle => bundle?.schemaVersion === 1 && bundle.transactionMode === 'selection-only' && Array.isArray(bundle.options)
  && bundle.baseline?.sourceType === 'quotation' && /^[a-f0-9]{64}$/.test(bundle.snapshotVersion);
function createQuotationServer({ bundle: single, bundles = null, now = () => new Date(), cloudOrigin = null, advisor = { available: false, status: 'unconfigured' } }) {
  if (bundles ? [...bundles.values()].some(item => !validBundle(item) || !/^[A-Z]{3}$/.test(item.baseline.quotedRetail?.currency ?? '')) : !validBundle(single)) {
    throw new Error('A prepared private quotation demo snapshot is required.');
  }
  const sessions = new Map();
  let adviceWindow = 0; let adviceCount = 0; let advicePending = 0;
  const model = { available: advisor.available, status: advisor.status };
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
      if (['/health', '/healthz'].includes(url.pathname) && req.method === 'GET') return json(res, 200, bundles
        ? { status: 'ok', surface: 'quotation-demo', mode: 'selection-only', model, catalogueSize: bundles.size }
        : { status: 'ok', surface: 'quotation-demo', mode: 'selection-only', model, snapshotVersion: single.snapshotVersion, optionCount: single.options.length });
      const cookie = /(?:^|;\s*)roomdrop_quote=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      let session = sessions.get(cookie);
      if (session?.expiresAt <= now().getTime()) { sessions.delete(cookie); session = null; }
      const openSession = () => {
        if (session) return true;
        for (const [key, value] of sessions) if (value.expiresAt <= now().getTime()) sessions.delete(key);
        if (sessions.size >= 64) return false;
        const id = randomBytes(32).toString('hex'); session = { csrfToken: randomBytes(32).toString('hex'), expiresAt: now().getTime() + 3600000, confirmation: null, adviceWindow: 0, adviceCount: 0, adviceHistory: {}, chatHistory: [], byCode: {} };
        sessions.set(id, session); res.setHeader('Set-Cookie', `roomdrop_quote=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${cloudOrigin ? '; Secure' : ''}`);
        return true;
      };
      // Catalogue mode: every booking is addressed by its catalogue code in the path, never by query.
      const route = bundles ? /^\/api\/quotation-demo\/q\/([A-Z0-9]{4,20})(?:\/(watch|confirm|advice|chat))?$/.exec(url.pathname) : null;
      const codeScope = code => (session.byCode[code] ??= { watch: null, confirmation: null, adviceHistory: {}, chatHistory: [] });
      if (req.method === 'GET' && (bundles ? url.pathname === '/api/quotation-demo/catalogue' || (route && !route[2]) : url.pathname === '/api/quotation-demo')) {
        if (req.headers['sec-fetch-site'] === 'cross-site') return error(403, 'LOCAL_ORIGIN_REQUIRED');
        if (route && !bundles.has(route[1])) return error(404, 'BOOKING_UNAVAILABLE');
        if (!openSession()) return error(503, 'DEMO_SESSION_CAPACITY');
        if (!bundles) return json(res, 200, { ...publicQuotationDemo(single), csrfToken: session.csrfToken, confirmation: session.confirmation, model });
        const at = now();
        if (!route) {
          const entries = [...bundles].map(([code, item]) => {
            const b = item.baseline; const blocker = watchBlocker(b, at); const freeUntil = b.cancellation?.freeUntil ?? null;
            return { code, snapshotVersion: item.snapshotVersion, checkedAt: item.checkedAt,
              hotel: { name: b.hotel.name, star: b.hotel.star ?? null, cityCode: b.hotel.cityCode ?? null, countryCode: b.hotel.countryCode ?? null },
              stay: b.stay, occupancy: b.occupancy, room: b.room, quotedRetail: b.quotedRetail,
              cancellation: { nonRefundable: b.cancellation?.nonRefundable === true, freeUntil }, blocker, tag: watchTag(blocker, freeUntil, at),
              optionCount: item.options.length };
          });
          return json(res, 200, { schemaVersion: 1, entries, csrfToken: session.csrfToken });
        }
        const code = route[1]; const item = bundles.get(code); const scope = codeScope(code);
        return json(res, 200, { ...publicQuotationDemo(item), code, csrfToken: session.csrfToken, blocker: watchBlocker(item.baseline, at),
          agencyMinimumSavingMinor: agencyMinimumSavingMinor(item.baseline.quotedRetail.currency), watch: scope.watch, confirmation: scope.confirmation, model });
      }
      const singlePost = !bundles && ['/api/quotation-demo/confirm', '/api/quotation-demo/advice', '/api/quotation-demo/chat'].includes(url.pathname);
      if ((singlePost || route?.[2]) && req.method === 'POST') {
        if (route && !bundles.has(route[1])) return error(404, 'BOOKING_UNAVAILABLE');
        if (!session || req.headers.origin !== origin || req.headers['x-csrf-token'] !== session.csrfToken
          || req.headers['sec-fetch-site'] === 'cross-site') return error(403, 'DEMO_SESSION_REQUIRED');
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return error(400, 'INVALID_SELECTION');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 4096) return error(413, 'SELECTION_TOO_LARGE'); chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return error(400, 'INVALID_SELECTION'); }
        const bundle = route ? bundles.get(route[1]) : single; const scope = route ? codeScope(route[1]) : session;
        if (route?.[2] === 'watch') {
          if (!body || typeof body !== 'object' || Array.isArray(body)
            || Object.keys(body).some(key => !['snapshotVersion', 'consent', 'minimumSavingMinor'].includes(key))) return error(400, 'INVALID_WATCH');
          if (body.consent !== true) return error(400, 'WATCH_CONSENT_REQUIRED');
          if (!Number.isSafeInteger(body.minimumSavingMinor) || body.minimumSavingMinor < agencyMinimumSavingMinor(bundle.baseline.quotedRetail.currency)) return error(400, 'MINIMUM_SAVING_INVALID');
          if (body.snapshotVersion !== bundle.snapshotVersion) return error(409, 'SNAPSHOT_CHANGED');
          const reason = watchBlocker(bundle.baseline, now());
          if (reason) return error(409, 'WATCH_CANNOT_START', { reason });
          const dropOptionIds = qualifyingDrops(bundle.baseline, bundle.options, body.minimumSavingMinor).map(option => option.optionId);
          // The first check replays the captured Gateway observation; no live search runs here.
          scope.watch = { armedAt: now().toISOString(), minimumSavingMinor: body.minimumSavingMinor, firstCheck: { replayed: true, checkedAt: bundle.checkedAt, dropOptionIds } };
          return json(res, 200, { watch: scope.watch, dropOptionIds });
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
    } catch { if (!res.headersSent) return error(503, 'DEMO_UNAVAILABLE'); res.end(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
