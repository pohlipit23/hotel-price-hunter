import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { OAuth2Client } from 'google-auth-library';
import { createAppServer, startServer } from '../app/server.mjs';
import { createIapAgencyAuth } from '../app/agency-iap-auth.mjs';
import { createTestMemoryStorage } from '../app/storage.mjs';

const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
const audience = '/projects/123456789/locations/asia-southeast1/services/roomdrop-agency';
const subject = 'accounts.google.com:123456789';
const secondSubject = 'accounts.google.com:987654321';
const env = { AGENCY_AUTH_MODE: 'iap', APP_SURFACE: 'agency', NODE_ENV: 'production', K_SERVICE: 'roomdrop-agency', APP_ORIGIN: 'https://agency.example.test', GOOGLE_CLOUD_PROJECT: 'roomdrop-example', AGENCY_IAP_AUDIENCE: audience, AGENCY_IAP_ALLOWED_SUBJECTS: JSON.stringify([subject, secondSubject]) };
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const key = publicKey.export({ type: 'spki', format: 'pem' });
const advisor = { available: false, status: 'unconfigured', advise() { throw new Error('Agency service must never request advice.'); } };
function token(claims = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  const parts = [Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'offline-server-key' })).toString('base64url'), Buffer.from(JSON.stringify({ iss: 'https://cloud.google.com/iap', aud: audience, sub: subject, iat: seconds - 1, exp: seconds + 600, ...claims })).toString('base64url')];
  const content = parts.join('.');
  return content + '.' + sign('sha256', Buffer.from(content), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}
async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
async function app(t) {
  const storage = createTestMemoryStorage();
  let time = Date.now();
  let fetches = 0;
  let keyFailure = false;
  const now = () => new Date(time);
  const client = new OAuth2Client();
  client.transporter.request = async () => {
    fetches++;
    if (keyFailure) throw new Error('Sensitive JWT-bearing transport error');
    return { data: { 'offline-server-key': key }, headers: new Headers({ 'cache-control': 'max-age=1' }) };
  };
  const agencyAuth = createIapAgencyAuth({ environment: env, now, oauthClient: client });
  const customer = await listen(t, createAppServer({ storage, fixture, now, advisor }));
  const server = createAppServer({ storage, fixture, now, advisor, agencyAuth, appSurface: 'agency', origin: env.APP_ORIGIN });
  const origin = await listen(t, server);
  const request = (route, method = 'GET', assertion = token(), extra = {}) => fetch(origin + route, { method, headers: { ...(assertion ? { 'X-Goog-Iap-Jwt-Assertion': assertion } : {}), ...extra } });
  async function createCase(offerId = 'DEMO_NON_REFUNDABLE') {
    const bootstrap = await fetch(customer + '/api/bootstrap');
    const state = await bootstrap.json();
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    const { idempotencyKey, ...body } = state.simulation.offerApprovalIntents[offerId];
    const approval = await fetch(customer + '/api/offer-approvals', { method: 'POST', headers: { Origin: customer, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken, 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) });
    assert.equal(approval.status, 200);
    return cookie;
  }
  return { request, storage, origin, server, createCase, advance: ms => { time += ms; }, fetches: () => fetches, breakKeys: () => { keyFailure = true; } };
}

test('IAP service boundary is mandatory and rejects invalid startup before cloud dependencies', async () => {
  const common = { storage: createTestMemoryStorage(), fixture, advisor };
  assert.throws(() => createAppServer({ ...common, appSurface: 'agency' }));
  const agencyAuth = createIapAgencyAuth({ environment: env });
  assert.throws(() => createAppServer({ ...common, agencyAuth }));
  assert.throws(() => createAppServer({ ...common, appSurface: 'unknown' }));
  for (const invalid of [{ APP_SURFACE: 'agency', AGENCY_AUTH_MODE: '' }, { APP_SURFACE: 'customer' }, { GEMINI_MODEL: 'not-permitted' }, { NODE_ENV: 'development' }]) {
    await assert.rejects(startServer({ ...env, PORT: '8099', ...invalid }));
  }
});

test('agency surface allows only its small shell, assets, health and signed GET agency APIs', async t => {
  const instance = await app(t);
  let reads = 0;
  for (const method of ['get', 'create', 'update', 'listCases', 'getCase']) {
    const original = instance.storage[method].bind(instance.storage);
    instance.storage[method] = (...args) => { reads++; return original(...args); };
  }
  for (const route of ['/', '/agency', '/agency.html']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await instance.request(route, method, null);
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('set-cookie'), null);
      if (method === 'GET') assert.match(await response.text(), /<meta name="agency-auth-mode" content="google-iap">/);
    }
  }
  for (const route of ['/agency.js', '/agency.css', '/booking.css', '/assets/roomdrop-logo.png', '/assets/roomdrop-key-icon.png', '/health', '/healthz']) assert.equal((await instance.request(route, 'GET', null)).status, 200, route);
  for (const route of ['/booking.html', '/booking.js', '/index.html', '/favicon.ico', '/assets/anything.png', '/api/bootstrap', '/api/notifications', '/api/enrolment', '/api/selection', '/api/advice', '/api/switches', '/api/offer-approvals', '/api/price-watch', '/api/switches/sim-' + 'a'.repeat(64) + '/advances']) {
    for (const method of ['GET', 'POST']) {
      const response = await instance.request(route, method);
      assert.equal(response.status, 404, `${method} ${route}`);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  }
  assert.equal(reads, 0);
  assert.equal(instance.fetches(), 0);
});

test('signed session is read-only and safe; cookies, unsigned identity and duplicate headers never authenticate', async t => {
  const instance = await app(t);
  const assertion = token();
  const response = await instance.request('/api/agency/session', 'GET', assertion);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const session = await response.json();
  assert.deepEqual(Object.keys(session).sort(), ['authenticated', 'expiresAt', 'mode', 'role']);
  assert.equal(session.mode, 'google-iap');
  assert.equal(session.authenticated, true);
  assert.doesNotMatch(JSON.stringify(session), /accounts\.google|csrf|cursor|eyJ/);
  for (const method of ['POST', 'DELETE']) {
    const denied = await instance.request('/api/agency/session', method, assertion);
    assert.equal(denied.status, 405);
    assert.equal((await denied.json()).authMode, 'google-iap');
    assert.equal(denied.headers.get('set-cookie'), null);
  }
  for (const route of ['/api/agency/session', '/api/agency/cases', '/api/agency/cases/case-' + 'a'.repeat(64)]) {
    const denied = await instance.request(route, 'GET', null, { Cookie: 'hph_agency=' + 'b'.repeat(64) + '; hph_visitor=' + 'c'.repeat(64), Authorization: `Bearer ${assertion}`, 'X-Goog-Authenticated-User-Id': subject, 'X-Goog-Authenticated-User-Email': 'accounts.google.com:operator@example.test' });
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).authMode, 'google-iap');
    assert.equal(denied.headers.get('set-cookie'), null);
  }
  const duplicate = await new Promise((resolve, reject) => {
    const req = http.request(instance.origin + '/api/agency/session', { headers: ['Host', new URL(instance.origin).host, 'X-Goog-Iap-Jwt-Assertion', assertion, 'x-goog-iap-jwt-assertion', assertion] }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
  assert.equal(duplicate, 401);
});

test('every protected GET verifies the assertion; opaque bounded cursors bind subject and exact token', async t => {
  const instance = await app(t);
  await instance.createCase();
  await instance.createCase('DEMO_DIFFERENT_HOTEL');
  const assertion = token();
  const firstResponse = await instance.request('/api/agency/cases?limit=1', 'GET', assertion);
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.cases.length, 1);
  assert.match(first.nextCursor, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(first).includes(subject), false);
  const cursorRoute = '/api/agency/cases?limit=1&cursor=' + first.nextCursor;
  const second = await instance.request(cursorRoute, 'GET', assertion);
  assert.equal(second.status, 200);
  assert.notEqual((await second.json()).cases[0].caseId, first.cases[0].caseId);
  assert.equal((await instance.request(cursorRoute, 'GET', token({ sub: secondSubject }))).status, 422);
  assert.equal((await instance.request(cursorRoute, 'GET', token({ nonce: 'renewed' }))).status, 422);
  for (const query of ['limit=0', 'limit=51', 'limit=1&limit=2', 'cursor=bad', 'limit=2&cursor=' + first.nextCursor, 'cursor=' + 'x'.repeat(1000)]) assert.equal((await instance.request('/api/agency/cases?' + query, 'GET', assertion)).status, 422);
  const detail = await instance.request('/api/agency/cases/' + first.cases[0].caseId, 'GET', assertion);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).case.isSimulated, true);
  assert.equal((await instance.request('/api/agency/cases/' + first.cases[0].caseId, 'GET', null)).status, 401);
  instance.advance(5 * 60 * 1000);
  assert.equal((await instance.request(cursorRoute, 'GET', assertion)).status, 422);
});

test('list and detail recheck hard token expiry after storage without another verification-key request', async t => {
  for (const method of ['listCases', 'getCase']) {
    const instance = await app(t);
    await instance.createCase();
    const caseId = (await instance.storage.listCases({ limit: 1 }))[0].caseId;
    const original = instance.storage[method].bind(instance.storage);
    instance.storage[method] = async (...args) => { const result = await original(...args); instance.advance(2000); return result; };
    const response = await instance.request(method === 'listCases' ? '/api/agency/cases' : '/api/agency/cases/' + caseId, 'GET', token({ exp: Math.floor(Date.now() / 1000) + 1 }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).authMode, 'google-iap');
    assert.equal(instance.fetches(), 1);
  }
});

test('key service failure is closed and safe in HTTP responses', async t => {
  const instance = await app(t);
  instance.breakKeys();
  const assertion = token();
  const response = await instance.request('/api/agency/session', 'GET', assertion);
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(JSON.parse(body).authMode, 'google-iap');
  assert.equal(body.includes(assertion), false);
  assert.doesNotMatch(body, /Sensitive|JWT-bearing/);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('cursor expiry never outlives the original signed assertion', async t => {
  const instance = await app(t);
  await instance.createCase();
  await instance.createCase('DEMO_DIFFERENT_HOTEL');
  const assertion = token({ exp: Math.floor(Date.now() / 1000) + 1 });
  const first = await (await instance.request('/api/agency/cases?limit=1', 'GET', assertion)).json();
  assert.match(first.nextCursor, /^[a-f0-9]{64}$/);
  instance.advance(2000);
  const expired = await instance.request('/api/agency/cases?limit=1&cursor=' + first.nextCursor, 'GET', assertion);
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).authMode, 'google-iap');
});
