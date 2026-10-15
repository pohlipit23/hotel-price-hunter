import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { createIapAgencyAuth } from '../app/agency-iap-auth.mjs';

const audience = '/projects/123456789/locations/asia-southeast1/services/roomdrop-agency';
const subject = 'accounts.google.com:123456789';
const environment = { AGENCY_AUTH_MODE: 'iap', APP_SURFACE: 'agency', NODE_ENV: 'production', K_SERVICE: 'roomdrop-agency', APP_ORIGIN: 'https://agency.example.test', GOOGLE_CLOUD_PROJECT: 'roomdrop-example', AGENCY_IAP_AUDIENCE: audience, AGENCY_IAP_ALLOWED_SUBJECTS: JSON.stringify([subject]) };
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pubkeys = { 'offline-test-key': publicKey.export({ type: 'spki', format: 'pem' }) };
function assertion(overrides = {}, header = {}) {
  const time = Math.floor(Date.now() / 1000);
  const envelope = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'offline-test-key', ...header })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://cloud.google.com/iap', aud: audience, sub: subject, iat: time - 1, exp: time + 600, ...overrides })).toString('base64url');
  return `${envelope}.${payload}.${sign('sha256', Buffer.from(`${envelope}.${payload}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const request = token => ({ headers: { 'x-goog-iap-jwt-assertion': token }, rawHeaders: token === undefined ? [] : ['X-Goog-Iap-Jwt-Assertion', token] });
function setup({ env = {}, transport, now } = {}) {
  let calls = 0;
  const oauthClient = new OAuth2Client();
  oauthClient.transporter.request = async options => { calls++; return transport ? transport(options) : { data: pubkeys, headers: new Headers({ 'cache-control': 'public, max-age=60' }) }; };
  const auth = createIapAgencyAuth({ environment: { ...environment, ...env }, oauthClient, ...(now ? { now } : {}) });
  return { auth, calls: () => calls };
}

test('IAP is opt-in and validates the complete deployment boundary before fetching keys', () => {
  assert.equal(createIapAgencyAuth({ environment: {} }), null);
  const bad = [
    { APP_SURFACE: 'customer' }, { APP_SURFACE: '' }, { NODE_ENV: 'development' }, { K_SERVICE: '' }, { K_SERVICE: 'another-service' },
    { APP_ORIGIN: 'http://agency.example.test' }, { APP_ORIGIN: 'https://user:pass@agency.example.test' }, { APP_ORIGIN: 'https://agency.example.test/' },
    { APP_ORIGIN: 'https://agency.example.test?q=x' }, { APP_ORIGIN: 'https://agency.example.test#x' },
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, { GOOGLE_CLOUD_PROJECT: 'demo-roomdrop' }, { GOOGLE_CLOUD_PROJECT: '' },
    { GEMINI_MODEL: 'test-disabled-model' }, { AGENCY_IAP_AUDIENCE: '/projects/123456789/global/backendServices/123' },
    { AGENCY_IAP_AUDIENCE: audience + '/' }, { AGENCY_IAP_AUDIENCE: audience.replace('123456789', 'abc') },
    ...['', '[]', '["*"]', '["  "]', '["x", "x"]', '{"x":true}', '[123]', '["bad\\nsubject"]', JSON.stringify(Array.from({ length: 101 }, (_, i) => `subject:${i}`))].map(value => ({ AGENCY_IAP_ALLOWED_SUBJECTS: value })),
  ];
  for (const env of bad) assert.throws(() => setup({ env }), undefined, JSON.stringify(Object.keys(env)));
  assert.throws(() => createIapAgencyAuth({ environment: { APP_SURFACE: 'agency' } }));
});

test('real ES256 verification produces only safe reviewer metadata and binds identity plus assertion', async () => {
  const { auth, calls } = setup();
  const token = assertion();
  const session = await auth.authenticate(request(token));
  assert.deepEqual(JSON.parse(JSON.stringify(session)), { role: 'agency-reviewer', mode: 'google-iap', expiresAt: new Date(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp * 1000).toISOString() });
  assert.match(session.cursorBinding, /^[a-f0-9]{64}$/);
  assert.equal((await auth.authenticate(request(token))).cursorBinding, session.cursorBinding);
  assert.notEqual((await auth.authenticate(request(assertion({ nonce: 'renewed' })))).cursorBinding, session.cursorBinding);
  assert.equal(calls(), 1);
  auth.recheck(session);
});

test('unsigned identity, duplicate or oversized assertion headers never reach key retrieval', async () => {
  const { auth, calls } = setup();
  const token = assertion();
  for (const req of [request(), request('x'.repeat(17000)), request(token + ', ' + token), { headers: { authorization: `Bearer ${token}`, cookie: 'hph_agency=' + 'a'.repeat(64), 'x-goog-authenticated-user-email': 'accounts.google.com:operator@example.test', 'x-goog-authenticated-user-id': subject } }, { headers: { 'x-goog-iap-jwt-assertion': [token] } }, { ...request(token), rawHeaders: ['X-Goog-Iap-Jwt-Assertion', token, 'x-goog-iap-jwt-assertion', token] }]) {
    await assert.rejects(auth.authenticate(req), { status: 401, code: 'AGENCY_SESSION_REQUIRED' });
  }
  assert.equal(calls(), 0);
});

test('signed but wrong or malformed identities, claims, algorithms and signatures are denied without token leakage', async () => {
  const { auth } = setup();
  const time = Math.floor(Date.now() / 1000);
  const invalidClaims = [{ aud: 'wrong' }, { aud: [audience] }, { iss: 'https://accounts.google.com' }, { sub: 'accounts.google.com:other' }, { sub: 123 }, { sub: '' }, { iat: String(time) }, { exp: String(time + 600) }, { exp: time }, { iat: time + 31 }, { iat: time - 62, exp: time + 600 }, { exp: time - 1 }, { exp: time - 2, iat: time - 1 }, { exp: null }, { iat: null }];
  const tokens = invalidClaims.map(claims => assertion(claims));
  tokens.push(...[{ alg: 'RS256' }, { alg: 'none' }, { jku: 'https://attacker.example/key' }, { x5u: 'https://attacker.example/key' }, { kid: 'unknown' }].map(header => assertion({}, header)));
  const valid = assertion();
  tokens.push(valid.slice(0, valid.lastIndexOf('.') + 1) + 'A'.repeat(86));
  for (const token of tokens) {
    await assert.rejects(auth.authenticate(request(token)), error => {
      assert.equal(error.status, 401);
      assert.equal(error.code, 'AGENCY_SESSION_REQUIRED');
      assert.equal(String(error).includes(token), false);
      assert.doesNotMatch(error.message, /signature|accounts\.google|offline-test-key/);
      return true;
    });
  }
});

test('key retrieval is fixed, bounded, coalesced and never serves an expired cache on failure', async () => {
  let time = Date.now();
  let fail = false;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { auth, calls } = setup({ now: () => new Date(time), transport: async options => {
    assert.equal(options.url, 'https://www.gstatic.com/iap/verify/public_key');
    assert.equal(options.retry, false);
    assert.equal(options.maxRedirects, 0);
    assert.equal(options.redirect, 'error');
    assert.equal(options.timeout, 3000);
    assert.equal(options.retryConfig.retry, 0);
    await gate;
    if (fail) throw new Error('secret assertion must not escape');
    return { data: pubkeys, headers: new Headers({ 'cache-control': 'public, max-age=1' }) };
  } });
  const pending = Array.from({ length: 8 }, () => auth.authenticate(request(assertion())));
  release();
  await Promise.all(pending);
  assert.equal(calls(), 1);
  fail = true;
  time += 1001;
  await assert.rejects(auth.authenticate(request(assertion())), error => error.status === 503 && !error.message.includes('secret'));
  assert.equal(calls(), 2);
});

test('key cache lifetime caps at one hour, respects no-store and defaults conservatively', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  for (const [cacheControl, lifetime] of [['max-age=999999', 3600000], ['', 300000], ['no-store, max-age=600', 0], ['max-age=0', 0]]) {
    const { auth, calls } = setup({ transport: async () => ({ data: pubkeys, headers: new Headers({ 'cache-control': cacheControl }) }) });
    await auth.authenticate(request(assertion()));
    if (lifetime) {
      t.mock.timers.tick(lifetime - 1);
      await auth.authenticate(request(assertion()));
      assert.equal(calls(), 1);
      t.mock.timers.tick(1);
    }
    await auth.authenticate(request(assertion()));
    assert.equal(calls(), 2);
  }
});

test('expiry is checked after asynchronous verification and on post-storage recheck without another fetch', async () => {
  let time = Date.now();
  const { auth, calls } = setup({ now: () => new Date(time) });
  const session = await auth.authenticate(request(assertion({ exp: Math.floor(time / 1000) + 1 })));
  time += 2000;
  assert.throws(() => auth.recheck(session), { status: 401 });
  assert.equal(calls(), 1);
  let delayedTime = Date.now();
  const delayed = setup({ now: () => new Date(delayedTime), transport: async () => { delayedTime += 2000; return { data: pubkeys, headers: new Headers() }; } });
  await assert.rejects(delayed.auth.authenticate(request(assertion({ exp: Math.floor(Date.now() / 1000) + 1 }))), { status: 401 });
});

test('malformed and oversized Google key responses fail closed with generic errors', async () => {
  for (const data of [null, [], {}, { key: 123 }, { key: 'x'.repeat(16385) }, Object.fromEntries(Array.from({ length: 101 }, (_, i) => ['key' + i, 'pem']))]) {
    const { auth } = setup({ transport: async () => ({ data, headers: new Headers() }) });
    await assert.rejects(auth.authenticate(request(assertion())), { status: 503, code: 'AGENCY_IAP_KEYS_UNAVAILABLE' });
  }
});

test('a hung key fetch times out once without retries or leaked provider errors', async () => {
  const started = performance.now();
  const { auth, calls } = setup({ transport: () => new Promise(() => {}) });
  const results = await Promise.allSettled([auth.authenticate(request(assertion())), auth.authenticate(request(assertion()))]);
  assert.equal(calls(), 1);
  assert.ok(performance.now() - started < 4500);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason.status, 503);
    assert.equal(result.reason.code, 'AGENCY_IAP_KEYS_UNAVAILABLE');
  }
});

test('cache Age shortens the usable lifetime instead of extending stale keys', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const { auth, calls } = setup({ transport: async () => ({ data: pubkeys, headers: new Headers({ 'cache-control': 'max-age=60', age: '59' }) }) });
  await auth.authenticate(request(assertion()));
  t.mock.timers.tick(999);
  await auth.authenticate(request(assertion()));
  assert.equal(calls(), 1);
  t.mock.timers.tick(1);
  await auth.authenticate(request(assertion()));
  assert.equal(calls(), 2);
});
