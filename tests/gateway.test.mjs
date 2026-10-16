import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateGateway, createGateway, GatewayReadError } from '../app/gateway.mjs';

const credentials = { email: 'owner@example.invalid', password: 'PRIVATE-password' };
const input = () => ({ ip: '127.0.0.1', price_comparison: false, checkin: '2026-11-12', checkout: '2026-11-15', package: false,
  ids: ['21122615'], supplier_ids: [], rooms: [{ idx: 1, adults: 2, children: [8], infants: [] }],
  session_id: 'test-session', user_agent: 'RoomDrop-private-read-check', nationality: 'my', language_code: 'en-US', country_residence: 'my' });
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('gateway login is independent of IAM and returns only its own in-memory token', async () => {
  let request;
  const token = await authenticateGateway({ credentials, authorised: true, fetchImpl: async (url, options) => {
    request = { url, options }; return json({ success: true, data: { auth_token: 'gateway-token', other: 'PRIVATE' } });
  } });
  assert.equal(token, 'gateway-token');
  assert.equal(request.url.href, 'https://hotel-offer.gateway.easygds.com/api/v2/login');
  assert.deepEqual(JSON.parse(request.options.body), credentials);
  assert.equal(request.options.redirect, 'error');
  await assert.rejects(authenticateGateway({ credentials, authorised: false }), { code: 'GATEWAY_ACCESS_NOT_CONFIGURED' });
});

test('direct single-hotel search returns rooms/rates in one fixed gateway call with gateway-specific headers', async () => {
  let request;
  const gateway = createGateway({ email: credentials.email, token: 'gateway-token', authorised: true, fetchImpl: async (url, options) => {
    request = { url, options }; return json({ success: true, request_id: 'opaque-request', progress: 0, data: [] });
  } });
  const result = await gateway.searchById(input());
  assert.equal(result.request_id, 'opaque-request');
  assert.equal(request.url.href, 'https://hotel-offer.gateway.easygds.com/api/v2/search-by-id');
  assert.equal(request.options.headers['x-key'], credentials.email);
  assert.equal(request.options.headers['x-access-token'], 'gateway-token');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(request.options.body), input());
  assert.deepEqual(Object.keys(gateway), ['searchById']);
});

test('gateway refuses extra endpoints, multiple hotels, unknown age/price scope and input fields before network', async () => {
  const gateway = createGateway({ email: credentials.email, token: 'gateway-token', authorised: true,
    fetchImpl: () => assert.fail('invalid input must not request') });
  for (const patch of [{ ids: ['a', 'b'] }, { checkin: '2026-02-30' }, { checkout: '2026-11-12' }, { price_comparison: true },
    { package: true }, { arbitrary_path: '/book' }, { nationality: '' }, { ip: 'not-an-ip' },
    { rooms: [{ idx: 1, adults: 0, children: [], infants: [] }] },
    { rooms: [{ idx: 1, adults: 2, children: [null], infants: [] }] }]) {
    await assert.rejects(gateway.searchById({ ...input(), ...patch }), { code: 'INVALID_GATEWAY_INPUT' });
  }
});

test('gateway errors and failed application envelopes do not leak response bodies or credentials', async () => {
  for (const fetchImpl of [async () => new Response('PRIVATE secret', { status: 500 }),
    async () => json({ success: false, message: 'PRIVATE user not found' }),
    async () => { throw Error('PRIVATE secret'); }]) {
    await assert.rejects(authenticateGateway({ credentials, authorised: true, fetchImpl }), error => {
      assert.ok(error instanceof GatewayReadError);
      assert.doesNotMatch(error.message + error.stack + JSON.stringify(error), /PRIVATE|owner@example/);
      return true;
    });
  }
});

test('gateway read JSON has a four-MiB hard bound and never treats HTTP success as application success', async () => {
  for (const fetchImpl of [async () => json({ success: false, data: [] }),
    async () => new Response('x'.repeat(4 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } })]) {
    const gateway = createGateway({ email: credentials.email, token: 'gateway-token', authorised: true, fetchImpl });
    await assert.rejects(gateway.searchById(input()), GatewayReadError);
  }
});
