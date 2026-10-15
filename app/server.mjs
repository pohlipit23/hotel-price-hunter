import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validatePreferences } from './domain/decision.mjs';
import { createStorage } from './storage.mjs';
import { createGeminiAdvisor } from './gemini.mjs';
import { AgencyAuthError, AGENCY_COOKIE, createLocalAgencyAuth } from './agency-auth.mjs';
import { createIapAgencyAuth } from './agency-iap-auth.mjs';
import { SimulationError, initialiseSimulation, offerDecision, simulationView, agencyCaseView, startSwitch, approveOffer, advanceSwitch } from './domain/simulation.mjs';
import { priceWatchView, notificationView, changePriceWatch, appendWatchOperationEvents, watchAliases, fixtureWatchProvider } from './domain/price-watch.mjs';

const PUBLIC_ROOT = resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const COOKIE_NAME = 'hph_visitor';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const BODY_LIMIT = 16 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

class RequestError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }); }
}
function fail(status, code, message, details) { throw new RequestError(status, code, message, details); }
function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}
function object(value, allowed, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    fail(422, 'VALIDATION_ERROR', `Invalid ${name}.`);
  }
}
function safeEqual(left, right) {
  return /^[a-f0-9]{64}$/.test(left || '') && /^[a-f0-9]{64}$/.test(right || '')
    && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
function cookieId(request, name = COOKIE_NAME) {
  const pairs = (request.headers.cookie || '').split(';').map(value => value.trim());
  const value = pairs.find(pair => pair.startsWith(`${name}=`))?.slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) fail(415, 'JSON_REQUIRED', 'Send a JSON request.');
  if (Number(request.headers['content-length'] || 0) > BODY_LIMIT) fail(413, 'BODY_TOO_LARGE', 'Request exceeds the 16 KiB limit.');
  return new Promise((accept, reject) => {
    let length = 0;
    const chunks = [];
    request.on('data', chunk => {
      length += chunk.length;
      if (length > BODY_LIMIT) {
        chunks.length = 0;
        reject(new RequestError(413, 'BODY_TOO_LARGE', 'Request exceeds the 16 KiB limit.'));
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      if (length > BODY_LIMIT) return;
      try { accept(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new RequestError(400, 'INVALID_JSON', 'Request contains invalid JSON.')); }
    });
    request.on('error', () => reject(new RequestError(400, 'INVALID_REQUEST', 'Unable to read request.')));
  });
}
async function stored(operation) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof RequestError || error instanceof SimulationError || error.code === 'INVALID_PREFERENCES') throw error;
    fail(503, 'STORAGE_UNAVAILABLE', 'Persistent storage is unavailable. Please retry.');
  }
}

/** Dependencies are injectable for tests; executable startup always uses Firestore. */
export function createAppServer({ storage, advisor, fixture, origin, now = () => new Date(), adviceLimit = 8, agencyAuth = null, appSurface = 'customer', watchProvider = fixtureWatchProvider } = {}) {
  const iap = agencyAuth?.mode === 'google-iap';
  if (!['customer', 'agency'].includes(appSurface) || (appSurface === 'agency') !== iap) throw new Error('The agency surface requires Google IAP and its own service.');
  const authMode = iap ? 'google-iap' : agencyAuth ? 'local-review' : 'unavailable';
  const agencyStaticPaths = new Set(['/', '/agency', '/agency.html', '/agency.js', '/agency.css', '/booking.css', '/assets/roomdrop-logo.png', '/assets/roomdrop-key-icon.png']);
  if (!storage || !advisor || !fixture) throw new Error('Storage, advisor and allowlisted jury fixture are required.');
  if (fixture.scenarioId !== 'jury-booking') throw new Error('Only the anonymised jury-booking scenario is allowlisted.');
  const demoNow = fixture.demoNow;
  if (!demoNow || !Number.isFinite(Date.parse(demoNow))) throw new Error('The jury fixture requires an explicit fictional demoNow.');
  if (origin) {
    const address = new URL(origin);
    if (address.origin !== origin || (address.protocol !== 'https:' && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) throw new Error('APP_ORIGIN must be an HTTPS origin, or loopback HTTP for local development.');
  }
  const defaults = validatePreferences(fixture.preferences, { booking: fixture.booking, agencyMinimumSavingMinor: fixture.agencyMinimumSavingMinor });
  const agencyCursors = new Map();
  function expectedOrigin(request) {
    if (origin) return origin;
    if (!/^(localhost|127\.0\.0\.1):\d+$/.test(request.headers.host || '')) fail(403, 'ORIGIN_REJECTED', 'Use the configured application origin.');
    return `http://${request.headers.host}`;
  }
  function decisions(state) {
    return state.offers.map(offer => ({ ...offer, decision: offerDecision(state, offer, fixture) }));
  }
  function publicState(value, visitorId) {
    const state = initialiseSimulation(value, fixture);
    // All source facts are the checked-in anonymised fixture. No arbitrary retrieval exists.
    return {
      schemaVersion: 1, scenarioId: state.scenarioId,
      mode: 'public-jury', transactionMode: 'simulated',
      demoNow: state.demoNow, clockMode: 'fictional-demo', provenance: fixture.provenance,
      booking: state.booking, offers: decisions(state), currency: fixture.currency,
      agencyMinimumSavingMinor: fixture.agencyMinimumSavingMinor,
      preferences: state.preferences, permissionRecord: state.permissionRecord,
      enrolled: state.enrolled, selectedOfferId: state.selectedOfferId,
      approvals: [], revision: state.revision, csrfToken: state.csrfToken,
      model: { available: advisor.available, status: advisor.status },
      monitoring: state.monitoring, simulation: simulationView(state, visitorId, fixture),
      priceWatch: priceWatchView(state, { visitorId, recordedAt: now().toISOString() }),
    };
  }
  async function visitor(request, response, create = false) {
    let id = cookieId(request);
    let state = id ? await stored(() => storage.get(id)) : null;
    if (state && Date.parse(state.expiresAt) <= now().getTime()) state = null;
    if (!state && !create) fail(401, 'SESSION_REQUIRED', 'Load the booking page before making changes.');
    if (!state) {
      const secure = expectedOrigin(request).startsWith('https:');
      id = randomBytes(32).toString('hex');
      state = initialiseSimulation({
        schemaVersion: 1, scenarioId: fixture.scenarioId, demoNow,
        enrolled: false, preferences: defaults, permissionRecord: null, selectedOfferId: null,
        revision: 0, csrfToken: randomBytes(32).toString('hex'),
        createdAt: now().toISOString(), expiresAt: new Date(now().getTime() + SESSION_MS).toISOString(),
        adviceWindowStartedAt: null, adviceRequestCount: 0,
      }, fixture);
      await stored(() => storage.create(id, state));
      response.setHeader('Set-Cookie', `${COOKIE_NAME}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
    }
    return { id, state };
  }
  function bookingVersion(value, state) {
    if (value !== state.booking.version) fail(409, 'BOOKING_VERSION_CHANGED', 'Reload the booking before continuing.');
  }
  function selectedOffer(offerId, state) {
    const offer = state.offers.find(item => item.offerId === offerId);
    if (!offer) fail(404, 'OFFER_NOT_FOUND', 'This offer is not in the public jury scenario.');
    return offer;
  }
  async function updateVisitor(id, change) {
    return stored(() => storage.update(id, value => {
      if (!Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now().getTime()) fail(401, 'SESSION_REQUIRED', 'Load the booking page before making changes.');
      const next = initialiseSimulation(change(initialiseSimulation(value, fixture)), fixture);
      if (Date.parse(next.expiresAt) <= now().getTime()) fail(401, 'SESSION_REQUIRED', 'Load the booking page before making changes.');
      return next;
    }));
  }
  function agencySessionCookie(request, token, maxAge) {
    return `${AGENCY_COOKIE}=${token}; Path=/api/agency; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${expectedOrigin(request).startsWith('https:') ? '; Secure' : ''}`;
  }
  const eligibleCase = record => record?.state?.scenarioId === 'jury-booking' && record.operation?.isSimulated === true;
  async function agencyRoute(request, response, url) {
    if (!agencyAuth) fail(503, 'AGENCY_UNAVAILABLE', 'Local agency review is not enabled.');
    if (request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'ORIGIN_REJECTED', 'Load local agency review directly.');
    const token = cookieId(request, AGENCY_COOKIE);
    if (iap && request.method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', 'Google IAP manages operator sign-in. Agency access is read-only.');
    if (url.pathname === '/api/agency/session' && request.method === 'POST') {
      if (url.search || request.headers.origin !== expectedOrigin(request)) fail(403, 'ORIGIN_REJECTED', 'Request origin was rejected.');
      const body = await readJson(request);
      object(body, ['passphrase'], 'agency sign-in');
      const { token: freshToken, ...session } = agencyAuth.login(body.passphrase, token);
      response.setHeader('Set-Cookie', agencySessionCookie(request, freshToken, 30 * 60));
      return sendJson(response, 200, { authenticated: true, ...session });
    }
    const session = await agencyAuth.authenticate(iap ? request : token);
    const cursorBinding = iap ? session.cursorBinding : token;
    const recheckSession = () => iap ? agencyAuth.recheck(session) : agencyAuth.authenticate(token);
    if (url.pathname === '/api/agency/session') {
      if (url.search) fail(422, 'VALIDATION_ERROR', 'Agency session does not accept query parameters.');
      if (request.method === 'GET') return sendJson(response, 200, { authenticated: true, ...session });
      if (request.method === 'DELETE') {
        if (request.headers.origin !== expectedOrigin(request)) fail(403, 'ORIGIN_REJECTED', 'Request origin was rejected.');
        if (!agencyAuth.logout(token, request.headers['x-csrf-token'])) fail(403, 'CSRF_REJECTED', 'Reload agency review before signing out.');
        response.setHeader('Set-Cookie', agencySessionCookie(request, '', 0));
        return sendJson(response, 200, { authenticated: false });
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'Method is not supported.');
    }
    if (request.method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', 'Agency cases are read-only.');
    if (url.pathname === '/api/agency/cases') {
      if ([...url.searchParams.keys()].some(key => !['limit', 'cursor'].includes(key))
          || ['limit', 'cursor'].some(key => url.searchParams.getAll(key).length > 1)) fail(422, 'VALIDATION_ERROR', 'Use a bounded case page.');
      const rawLimit = url.searchParams.get('limit') ?? '20';
      if (!/^\d{1,2}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50) fail(422, 'VALIDATION_ERROR', 'Case page size must be 1–50.');
      const limit = Number(rawLimit);
      const cursorToken = url.searchParams.get('cursor');
      const time = now().getTime();
      for (const [id, cursor] of agencyCursors) if (cursor.expiresAt <= time) agencyCursors.delete(id);
      const cursor = cursorToken ? agencyCursors.get(cursorToken) : null;
      if (url.searchParams.has('cursor') && (!cursor || cursor.sessionToken !== cursorBinding || cursor.limit !== limit)) fail(422, 'INVALID_AGENCY_CURSOR', 'Reload the current reviewer case page.');
      const records = await stored(() => storage.listCases({ limit: limit + 1, after: cursor?.after ?? null }));
      recheckSession();
      const page = records.slice(0, limit);
      let nextCursor = null;
      if (records.length > limit) {
        nextCursor = randomBytes(32).toString('hex');
        if (agencyCursors.size >= 200) agencyCursors.delete(agencyCursors.keys().next().value);
        agencyCursors.set(nextCursor, { after: page.at(-1).caseId, limit, sessionToken: cursorBinding,
          expiresAt: Math.min(time + 5 * 60 * 1000, Date.parse(session.expiresAt)) });
      }
      return sendJson(response, 200, { cases: page.filter(eligibleCase).map(record => {
        const detail = agencyCaseView(record, fixture);
        return { caseId: detail.caseId, isSimulated: true, status: detail.status, stage: detail.stage,
          hotelName: detail.sourceBooking.hotelName, updatedAt: record.state.updatedAt ?? record.state.createdAt,
          reasonCodes: detail.reasonCodes, cancellationStatus: detail.cancellation?.status ?? null,
          savingSecured: detail.savingSecured, refundStatus: detail.refund.status, monitoringStatus: detail.monitoring.status };
      }), nextCursor });
    }
    const detail = /^\/api\/agency\/cases\/(case-[a-f0-9]{64})$/.exec(url.pathname);
    if (detail && !url.search) {
      const record = await stored(() => storage.getCase(detail[1]));
      recheckSession();
      if (!eligibleCase(record)) fail(404, 'AGENCY_CASE_NOT_FOUND', 'This fictional review case is unavailable.');
      return sendJson(response, 200, { case: agencyCaseView(record, fixture) });
    }
    fail(404, 'ROUTE_NOT_FOUND', 'Agency review route is unavailable.');
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' https: data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    try {
      const url = new URL(request.url, 'http://local.invalid');
      if (request.method === 'GET' && ['/health', '/healthz'].includes(url.pathname)) return sendJson(response, 200, { status: 'ok', storage: storage.mode, model: advisor.status });
      if (url.pathname.startsWith('/api/agency/')) return await agencyRoute(request, response, url);
      if (appSurface === 'agency' && (!(request.method === 'GET' || request.method === 'HEAD') || !agencyStaticPaths.has(url.pathname))) {
        fail(404, 'ROUTE_NOT_FOUND', 'This route is unavailable on the agency service.');
      }
      if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
        if ([...url.searchParams.keys()].some(key => key !== 'scenario') || (url.searchParams.get('scenario') || 'jury-booking') !== 'jury-booking') fail(404, 'SCENARIO_NOT_FOUND', 'Only the anonymised jury scenario is available.');
        if (request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'ORIGIN_REJECTED', 'Load the application directly.');
        const { id, state } = await visitor(request, response, true);
        return sendJson(response, 200, publicState(state, id));
      }
      if (request.method === 'GET' && url.pathname === '/api/notifications') {
        if (request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'ORIGIN_REJECTED', 'Load the application directly.');
        if ([...url.searchParams.keys()].some(key => key !== 'limit') || url.searchParams.getAll('limit').length > 1) fail(422, 'VALIDATION_ERROR', 'Use a bounded notification page.');
        const rawLimit = url.searchParams.get('limit') ?? '20';
        if (!/^\d{1,2}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50) fail(422, 'VALIDATION_ERROR', 'Notification page size must be 1–50.');
        const { state } = await visitor(request, response);
        return sendJson(response, 200, notificationView(state, Number(rawLimit)));
      }
      const routes = ['/api/enrolment', '/api/selection', '/api/advice', '/api/switches', '/api/offer-approvals', '/api/price-watch'];
      const advanceRoute = /^\/api\/switches\/(sim-[a-f0-9]{64})\/advances$/.exec(url.pathname);
      if (request.method === 'POST' && (routes.includes(url.pathname) || advanceRoute)) {
        if (request.headers.origin !== expectedOrigin(request) || request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'ORIGIN_REJECTED', 'Request origin was rejected.');
        const body = await readJson(request);
        const { id, state } = await visitor(request, response);
        if (!safeEqual(request.headers['x-csrf-token'], state.csrfToken)) fail(403, 'CSRF_REJECTED', 'Reload the page before making changes.');
        if (url.pathname === '/api/price-watch') {
          if (url.search) fail(422, 'VALIDATION_ERROR', 'Watch consent does not accept query parameters.');
          object(body, ['bookingVersion', 'watchVersion', 'enabled'], 'price-watch consent');
          if (!Number.isSafeInteger(body.bookingVersion) || body.bookingVersion < 1 || !Number.isSafeInteger(body.watchVersion) || body.watchVersion < 0 || typeof body.enabled !== 'boolean') fail(422, 'VALIDATION_ERROR', 'Send the current versioned watch consent.');
          if (!/^[a-f0-9]{64}$/.test(request.headers['idempotency-key'] || '')) fail(422, 'INVALID_IDEMPOTENCY_KEY', 'Use the saved price-watch intent key.');
          const recordedAt = now().toISOString(); const aliases = watchAliases(); let result;
          const saved = await updateVisitor(id, current => {
            result = changePriceWatch(current, { body, idempotencyKey: request.headers['idempotency-key'], visitorId: id, fixture, recordedAt, aliases, provider: watchProvider, now });
            return result.state;
          });
          return sendJson(response, 200, { ...publicState(saved, id), replayed: result.replayed });
        }
        const offerApprovalRoute = url.pathname === '/api/offer-approvals';
        if (url.pathname === '/api/switches' || offerApprovalRoute || advanceRoute) {
          const startFields = offerApprovalRoute
            ? ['offerId', 'offerVersion', 'bookingVersion', 'preferenceVersion', 'materialFingerprint', 'confirmed', 'acceptReducedFlexibility']
            : ['scenarioId', 'offerId', 'offerVersion', 'bookingVersion', 'preferenceVersion'];
          object(body, advanceRoute ? ['expectedOperationRevision'] : startFields, 'simulated switch request');
          if (advanceRoute) {
            if (!Number.isSafeInteger(body.expectedOperationRevision) || body.expectedOperationRevision < 0) fail(422, 'VALIDATION_ERROR', 'Send the current non-negative operation revision.');
          } else {
            if ((!offerApprovalRoute && typeof body.scenarioId !== 'string') || typeof body.offerId !== 'string' || ['offerVersion', 'bookingVersion', 'preferenceVersion'].some(key => !Number.isSafeInteger(body[key]) || body[key] < 1)) fail(422, 'VALIDATION_ERROR', 'Send the complete current simulated intent.');
            if (offerApprovalRoute && (body.confirmed !== true || typeof body.materialFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.materialFingerprint))) fail(422, 'VALIDATION_ERROR', 'Explicitly confirm the current versioned offer comparison.');
            if (!/^[a-f0-9]{64}$/.test(request.headers['idempotency-key'] || '')) fail(422, 'INVALID_IDEMPOTENCY_KEY', 'Use the saved switch intent key.');
          }
          let result;
          // Keep random aliases outside the retryable Firestore transaction callback.
          const agencyCaseId = advanceRoute ? undefined : `case-${randomBytes(32).toString('hex')}`;
          const recordedAt = now().toISOString();
          const aliases = watchAliases();
          const saved = await updateVisitor(id, current => {
            result = advanceRoute
              ? advanceSwitch(current, { operationId: advanceRoute[1], expectedOperationRevision: body.expectedOperationRevision, fixture, recordedAt })
              : (offerApprovalRoute ? approveOffer : startSwitch)(current, { body, idempotencyKey: request.headers['idempotency-key'], visitorId: id, fixture, recordedAt, agencyCaseId });
            return appendWatchOperationEvents(current, result.state, { recordedAt, aliases, currencyMetadata: fixture.currency });
          });
          return sendJson(response, 200, { ...publicState(saved, id), replayed: result.replayed,
            ...(result.replayedCommand ? { replayedCommand: result.replayedCommand } : {}) });
        }
        if (url.pathname === '/api/enrolment') {
          object(body, ['bookingVersion', 'preferences', 'permissionConfirmation'], 'enrolment');
          object(body.preferences, ['version', 'essentialRequirements', 'automaticEquivalentSwitches', 'minimumSavingMinor', 'notificationFrequency', 'continueMonitoring'], 'preferences');
          const result = await updateVisitor(id, current => {
            bookingVersion(body.bookingVersion, current);
            if (!Number.isSafeInteger(body.preferences.version) || body.preferences.version < 1) fail(422, 'VALIDATION_ERROR', 'Send the current positive preference version.');
            if (body.preferences.version !== current.preferences.version) fail(409, 'PREFERENCES_VERSION_CHANGED', 'Preferences changed. Reload and review them before confirming again.');
            const preferences = validatePreferences({ ...body.preferences, version: current.preferences.version + 1 }, { booking: current.booking, agencyMinimumSavingMinor: fixture.agencyMinimumSavingMinor });
            let permissionRecord = null;
            if (preferences.automaticEquivalentSwitches) {
              object(body.permissionConfirmation, ['confirmed', 'version', 'bookingVersion', 'preferenceVersion', 'scope'], 'permission confirmation');
              const confirmation = body.permissionConfirmation;
              if (confirmation.confirmed !== true || confirmation.version !== 1 || confirmation.bookingVersion !== current.booking.version || confirmation.scope !== 'equivalent-only') fail(422, 'PERMISSION_CONFIRMATION_REQUIRED', 'Separately confirm permission for equivalent switches on this booking.');
              if (!Number.isSafeInteger(confirmation.preferenceVersion) || confirmation.preferenceVersion < 1) fail(422, 'PERMISSION_CONFIRMATION_REQUIRED', 'Confirm permission against the current preference version.');
              if (confirmation.preferenceVersion !== current.preferences.version) fail(409, 'PREFERENCES_VERSION_CHANGED', 'Preferences changed. Reload and review them before confirming again.');
              permissionRecord = { ...confirmation, sourcePreferenceVersion: confirmation.preferenceVersion, preferenceVersion: preferences.version, confirmedAt: current.demoNow, recordedAt: now().toISOString(), clockMode: 'fictional-demo' };
            } else if (body.permissionConfirmation !== undefined && body.permissionConfirmation !== null) {
              fail(422, 'VALIDATION_ERROR', 'Permission confirmation applies only when equivalent switches are enabled.');
            }
            return { ...current, enrolled: true, preferences, permissionRecord, revision: current.revision + 1, updatedAt: now().toISOString() };
          });
          return sendJson(response, 200, publicState(result, id));
        }
        object(body, url.pathname === '/api/selection' ? ['offerId', 'bookingVersion'] : ['offerId', 'bookingVersion', 'message'], 'comparison request');
        if (url.pathname === '/api/selection') {
          const result = await updateVisitor(id, current => {
            bookingVersion(body.bookingVersion, current);
            const offer = selectedOffer(body.offerId, current);
            return { ...current, selectedOfferId: offer.offerId, revision: current.revision + 1, updatedAt: now().toISOString() };
          });
          return sendJson(response, 200, publicState(result, id));
        }
        if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1200) fail(422, 'VALIDATION_ERROR', 'Question must contain 1–1200 characters.');
        const current = await updateVisitor(id, value => {
          bookingVersion(body.bookingVersion, value);
          const offer = selectedOffer(body.offerId, value);
          const started = Date.parse(value.adviceWindowStartedAt);
          const reset = !Number.isFinite(started) || now().getTime() - started >= 60 * 1000;
          const count = reset ? 0 : value.adviceRequestCount;
          if (count >= adviceLimit) fail(429, 'ADVICE_RATE_LIMIT', 'Please wait a minute before requesting more advice.');
          return { ...value, selectedOfferId: offer.offerId, adviceWindowStartedAt: reset ? now().toISOString() : value.adviceWindowStartedAt, adviceRequestCount: count + 1 };
        });
        const offer = selectedOffer(body.offerId, current);
        const decision = decisions(current).find(item => item.offerId === offer.offerId).decision;
        const advice = await advisor.advise({ booking: current.booking, offer, preferences: current.preferences, decision, currency: fixture.currency, message: body.message });
        const latest = await stored(() => storage.get(id));
        if (!latest || Date.parse(latest.expiresAt) <= now().getTime()) fail(401, 'SESSION_REQUIRED', 'Reload the booking page before continuing.');
        const fresh = initialiseSimulation(latest, fixture);
        if (fresh.booking.version !== current.booking.version || fresh.preferences.version !== current.preferences.version
            || fresh.revision !== current.revision) fail(409, 'COMPARISON_CHANGED', 'The booking or preferences changed while advice was being prepared. Reload the comparison.');
        return sendJson(response, 200, { advice, decision, offerId: offer.offerId, source: 'vertex-gemini', permissionsChanged: false });
      }
      if (url.pathname.startsWith('/api/')) fail(404, 'ROUTE_NOT_FOUND', 'This public route is unavailable.');
      if (request.method === 'GET' && url.pathname === '/favicon.ico') { response.writeHead(204); return response.end(); }
      if (request.method !== 'GET' && request.method !== 'HEAD') fail(405, 'METHOD_NOT_ALLOWED', 'Method is not supported.');
      const pathname = url.pathname === '/' ? (appSurface === 'agency' ? '/agency.html' : '/booking.html') : url.pathname === '/agency' ? '/agency.html' : decodeURIComponent(url.pathname);
      const extension = extname(pathname);
      const filename = resolve(PUBLIC_ROOT, `.${pathname}`);
      if (!/^\/[a-zA-Z0-9/_\-.]+$/.test(pathname) || pathname.split('/').includes('..') || !MIME[extension] || !filename.startsWith(PUBLIC_ROOT + sep)) fail(404, 'NOT_FOUND', 'Page not found.');
      let content;
      try { content = await readFile(filename); }
      catch { fail(404, 'NOT_FOUND', 'Page not found.'); }
      if (pathname === '/agency.html') content = Buffer.from(content.toString('utf8').replace('<meta name="agency-auth-mode" content="unavailable">', `<meta name="agency-auth-mode" content="${authMode}">`));
      response.writeHead(200, { 'Content-Type': MIME[extension] });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (response.headersSent) return response.end();
      if (error.code === 'INVALID_PREFERENCES') return sendJson(response, 422, { error: { code: error.code, message: 'Check your preferences.', details: error.details } });
      if (error.code === 'ADVICE_UNAVAILABLE') return sendJson(response, 503, { error: { code: error.code, message: error.message } });
      const known = error instanceof RequestError || error instanceof SimulationError || error instanceof AgencyAuthError;
      sendJson(response, known ? error.status : 500, { ...(request.url?.startsWith('/api/agency/') ? { authMode } : {}), error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Unable to complete this request.', ...(error.details ? { details: error.details } : {}) } });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

export async function startServer(environment = process.env) {
  const port = Number(environment.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  if ((environment.K_SERVICE || environment.NODE_ENV === 'production') && !environment.APP_ORIGIN) throw new Error('APP_ORIGIN is required in production.');
  const origin = environment.APP_ORIGIN || `http://localhost:${port}`;
  const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
  const appSurface = environment.APP_SURFACE || 'customer';
  const agencyAuth = createIapAgencyAuth({ environment }) || await createLocalAgencyAuth({ environment });
  const storage = await createStorage(environment);
  const advisor = appSurface === 'agency' ? { available: false, status: 'unconfigured' } : await createGeminiAdvisor({ environment });
  const server = createAppServer({ storage, advisor, fixture, origin, agencyAuth, appSurface });
  server.listen(port, environment.BIND_HOST || '0.0.0.0', () => console.log(`Hotel Price Hunter listening on port ${port}; ${storage.mode}; Gemini ${advisor.status}.`));
  const stop = () => server.close(async () => { await storage.close(); process.exit(0); });
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return { server, storage };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().catch(() => {
    console.error('Startup failed. Check Firestore project, local emulator, APP_ORIGIN and runtime configuration.');
    process.exitCode = 1;
  });
}
