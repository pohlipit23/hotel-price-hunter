import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { publicQuotationDemo } from './domain/quotation-demo.mjs';

export function validateLocalQuotationMode(env = process.env) {
  if (env.NODE_ENV === 'production' || env.K_SERVICE || env.CLOUD_RUN_JOB || (env.BIND_HOST && env.BIND_HOST !== '127.0.0.1')) {
    throw new Error('Quotation demo requires explicit local loopback execution.');
  }
}
const cloudTarget = Object.freeze({ NODE_ENV: 'production', K_SERVICE: 'hotel-price-hunter', GOOGLE_CLOUD_PROJECT: 'sincere-apex-511418-p0',
  APP_SURFACE: 'customer', APP_ORIGIN: 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app' });
export function validateCloudQuotationMode(environment) {
  if (!environment || Object.entries(cloudTarget).some(([key, value]) => environment[key] !== value)
    || ['CLOUD_RUN_JOB', 'FIRESTORE_EMULATOR_HOST', 'GEMINI_MODEL', 'GOOGLE_APPLICATION_CREDENTIALS'].some(key => environment[key])) {
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
export function createHostedQuotationDemoServer({ snapshot, environment = process.env, now } = {}) {
  validateCloudQuotationMode(environment); validateDeploymentSnapshot(snapshot);
  const bundle = { ...snapshot, privateReferences: Object.fromEntries(snapshot.options.map(option => [option.optionId, { selectionOnly: true }])) };
  return createQuotationServer({ bundle, now, cloudOrigin: environment.APP_ORIGIN });
}
const assets = new Map([
  ['/', ['quotation.html', 'text/html']], ['/quotation.js', ['quotation.js', 'text/javascript']],
  ['/quotation.css', ['quotation.css', 'text/css']], ['/booking.css', ['booking.css', 'text/css']],
  ['/assets/roomdrop-logo.png', ['assets/roomdrop-logo.png', 'image/png']],
  ['/assets/roomdrop-key-icon.png', ['assets/roomdrop-key-icon.png', 'image/png']],
  ['/assets/illustrative-stays.jpg', ['assets/illustrative-stays.jpg', 'image/jpeg']],
]);
export function createQuotationDemoServer({ bundle, now = () => new Date() } = {}) {
  return createQuotationServer({ bundle, now });
}
function createQuotationServer({ bundle, now = () => new Date(), cloudOrigin = null }) {
  if (bundle?.schemaVersion !== 1 || bundle.transactionMode !== 'selection-only' || !Array.isArray(bundle.options)
    || bundle.baseline?.sourceType !== 'quotation' || !/^[a-f0-9]{64}$/.test(bundle.snapshotVersion)) throw new Error('A prepared private quotation demo snapshot is required.');
  const sessions = new Map();
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (cloudOrigin) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const error = (status, code) => json(res, status, { error: { code, message: 'Reload the quotation demo and review your selection.' } });
    try {
      const port = server.address()?.port;
      if (cloudOrigin ? req.headers.host !== new URL(cloudOrigin).host
        : !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return error(403, 'LOCAL_ORIGIN_REQUIRED');
      const origin = cloudOrigin || `http://${req.headers.host}`; const url = new URL(req.url, origin);
      if (url.search) return error(400, 'ARBITRARY_LOOKUP_DENIED');
      if (['/health', '/healthz'].includes(url.pathname) && req.method === 'GET') return json(res, 200, { status: 'ok', surface: 'quotation-demo', mode: 'selection-only', snapshotVersion: bundle.snapshotVersion, optionCount: bundle.options.length });
      const cookie = /(?:^|;\s*)roomdrop_quote=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      let session = sessions.get(cookie);
      if (session?.expiresAt <= now().getTime()) { sessions.delete(cookie); session = null; }
      if (url.pathname === '/api/quotation-demo' && req.method === 'GET') {
        if (req.headers['sec-fetch-site'] === 'cross-site') return error(403, 'LOCAL_ORIGIN_REQUIRED');
        if (!session) {
          for (const [key, value] of sessions) if (value.expiresAt <= now().getTime()) sessions.delete(key);
          if (sessions.size >= 64) return error(503, 'DEMO_SESSION_CAPACITY');
          const id = randomBytes(32).toString('hex'); session = { csrfToken: randomBytes(32).toString('hex'), expiresAt: now().getTime() + 3600000, confirmation: null };
          sessions.set(id, session); res.setHeader('Set-Cookie', `roomdrop_quote=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${cloudOrigin ? '; Secure' : ''}`);
        }
        return json(res, 200, { ...publicQuotationDemo(bundle), csrfToken: session.csrfToken, confirmation: session.confirmation });
      }
      if (url.pathname === '/api/quotation-demo/confirm' && req.method === 'POST') {
        if (!session || req.headers.origin !== origin || req.headers['x-csrf-token'] !== session.csrfToken
          || req.headers['sec-fetch-site'] === 'cross-site') return error(403, 'DEMO_SESSION_REQUIRED');
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return error(400, 'INVALID_SELECTION');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 4096) return error(413, 'SELECTION_TOO_LARGE'); chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return error(400, 'INVALID_SELECTION'); }
        const allowed = ['optionId', 'snapshotVersion', 'acceptedDemoOnly', 'acceptReducedFlexibility'];
        if (!body || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || body.acceptedDemoOnly !== true) return error(400, 'INVALID_SELECTION');
        if (body.snapshotVersion !== bundle.snapshotVersion) return error(409, 'SNAPSHOT_CHANGED');
        const option = bundle.options.find(value => value.optionId === body.optionId);
        if (!option || !Object.hasOwn(bundle.privateReferences, option.optionId)) return error(404, 'OPTION_UNAVAILABLE');
        if (option.freeCancellation !== true && body.acceptReducedFlexibility !== true) return error(400, 'FLEXIBILITY_ACKNOWLEDGEMENT_REQUIRED');
        if (option.freeCancellation === true && Object.hasOwn(body, 'acceptReducedFlexibility')) return error(400, 'INVALID_SELECTION');
        if (session.confirmation?.optionId !== option.optionId) session.confirmation = { status: 'demo-selection-confirmed',
          selectionId: `demo-${randomBytes(12).toString('hex')}`, optionId: option.optionId, snapshotVersion: bundle.snapshotVersion,
          confirmedAt: now().toISOString(), reservationCreated: false, quoteModified: false, customerRefund: null };
        return json(res, 200, { confirmation: session.confirmation });
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
