import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateLiveEngine, createLiveEngine, LiveEngineError } from '../app/live-engine.mjs';

const baseUrl = 'https://bonus.apps.easygds.com/api';
const token = 'test-private-bearer';
const search = () => ({ checkin_date: '2026-11-12', checkout_date: '2026-11-15',
  currency_code: 'USD', language_code: 'en-US', hotel_ids: ['opaque-hotel'],
  rooms: [{ idx: 1, adults: [35, 37], children: [8], infants: [] }], timeout: 15000 });
const response = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('owner-selected Demo.apps uses its exact verified HTTPS API host', async () => {
  const baseUrl = 'https://demo.apps.easygds.com/api'; let destination;
  const engine = createLiveEngine({ baseUrl, token, authorised: true, fetchImpl: async url => {
    destination = url.href; return response({});
  } });
  await engine.read('lookup', { booking_code: 'selected-test-booking' });
  assert.equal(new URL(destination).origin, 'https://demo.apps.easygds.com');
  assert.equal(new URL(destination).pathname, '/api/v2/bookings');
});

test('live engine requires explicit authority, token and a fixed HTTPS tenant before any request', () => {
  for (const patch of [{ authorised: false }, { token: '' }, { token: 'x\r\nsecret' },
    { baseUrl: 'http://bonus.apps.easygds.com/api' }, { baseUrl: 'https://bonus.apps.easygds.com.evil/api' },
    { baseUrl: 'https://user:pass@bonus.apps.easygds.com/api' }, { baseUrl: `${baseUrl}/../api` }]) {
    assert.throws(() => createLiveEngine({ baseUrl, token, authorised: true, ...patch }), LiveEngineError);
  }
});

test('only read operations are possible and an opaque booking code is encoded intact', async () => {
  const requests = [];
  const engine = createLiveEngine({ baseUrl, token, authorised: true, fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), options }); return response({ booking_code: 'opaque/$?&code' });
  } });
  for (const op of ['auth', 'prebook', 'book', 'cancel', 'refund', '../book', '__proto__']) {
    await assert.rejects(engine.read(op, { booking_code: 'x' }), { code: 'OPERATION_DENIED' });
  }
  assert.equal(requests.length, 0);
  await engine.read('detail', { booking_code: 'opaque/$?&code' });
  assert.equal(requests[0].url.pathname, '/api/bookings');
  assert.equal(requests[0].url.searchParams.get('booking_code'), 'opaque/$?&code');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
  assert.ok(requests[0].options.signal instanceof AbortSignal);
});

test('single-hotel search preserves exact dates and every occupancy age', async () => {
  let body;
  const engine = createLiveEngine({ baseUrl, token, authorised: true,
    fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return response({ search_id: 'opaque-search' }); } });
  await engine.read('search', search());
  assert.deepEqual(body, search());
});

test('invalid dates, ages, extra keys and multiroom searches are refused without network work', async () => {
  let calls = 0;
  const engine = createLiveEngine({ baseUrl, token, authorised: true,
    fetchImpl: async () => { calls++; return response({}); } });
  for (const patch of [{ checkin_date: '2026-02-30' }, { checkout_date: '2026-11-12' },
    { currency_code: 'ZZZ' }, { hotel_ids: ['a', 'b'] }, { extra: true },
    { rooms: [{ idx: 1, adults: [30], children: [-1], infants: [] }] },
    { rooms: [{ idx: 1, adults: [5], children: [], infants: [] }] },
    { rooms: [{ idx: 1, adults: [30], children: [null], infants: [] }] },
    { rooms: [{ idx: 1, adults: [30], children: [], infants: [], name: 'PRIVATE' }] },
    { rooms: [search().rooms[0], search().rooms[0]] }]) {
    await assert.rejects(engine.read('search', { ...search(), ...patch }), { code: 'INVALID_INPUT' });
  }
  await assert.rejects(engine.read('rates', { search_id: 'a', hotel_id: 'b', token: 'x' }), { code: 'INVALID_INPUT' });
  assert.equal(calls, 0);
});

test('provider failures never include raw bodies, credentials, booking codes or exception messages', async () => {
  for (const fetchImpl of [async () => new Response('PRIVATE server body', { status: 403 }),
    async () => { throw new Error(`PRIVATE ${token}`); },
    async () => new Response('<html>PRIVATE</html>', { headers: { 'content-type': 'text/html' } }),
    async () => new Response('{PRIVATE', { headers: { 'content-type': 'application/json' } })]) {
    const engine = createLiveEngine({ baseUrl, token, authorised: true, fetchImpl });
    await assert.rejects(engine.read('lookup', { booking_code: 'PRIVATE' }), error => {
      assert.ok(error instanceof LiveEngineError);
      assert.doesNotMatch(JSON.stringify(error) + error.message + error.stack, /PRIVATE|test-private-bearer/);
      return true;
    });
  }
});

test('oversized JSON is refused before parsing and no response object is returned', async () => {
  const engine = createLiveEngine({ baseUrl, token, authorised: true,
    fetchImpl: async () => new Response('x'.repeat(4 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(engine.read('lookup', { booking_code: 'a' }), { code: 'RESPONSE_TOO_LARGE' });
});

test('bulk engine rates retain the original four-MiB hard bound for advertised and actual bodies', async () => {
  for (const advertised of [false, true]) {
    const engine = createLiveEngine({ baseUrl, token, authorised: true, fetchImpl: async () => new Response(
      advertised ? '{}' : 'x'.repeat(4 * 1024 * 1024 + 1),
      { headers: { 'content-type': 'application/json', ...(advertised ? { 'content-length': String(4 * 1024 * 1024 + 1) } : {}) } }) });
    await assert.rejects(engine.read('rates', { search_id: 'a', hotel_id: 'b' }), { code: 'RESPONSE_TOO_LARGE' });
  }
});

test('normal IAM sign-in requires explicit selected credentials and never returns refresh or account data', async () => {
  const credentials = { email: 'test@example.invalid', secret_key: 'PRIVATE-SIGN-IN-SECRET', scope_type: 'System', flow_type: 'Basic' };
  let calls = 0;
  const options = { baseUrl: 'https://demo.apps.easygds.com/api', iamUrl: 'https://iam.services.easygds.com/api', credentials, authorised: true,
    fetchImpl: async (url, init) => {
      calls++; assert.equal(url.href, 'https://iam.services.easygds.com/api/auth');
      assert.equal(init.redirect, 'error'); assert.deepEqual(JSON.parse(init.body), credentials);
      return response({ access_token: 'short-lived-test-token', refresh_token: 'DO-NOT-RETURN', account: { email: 'DO-NOT-RETURN' } });
    } };
  for (const patch of [{ authorised: false }, { iamUrl: 'https://evil.invalid/api' }, { baseUrl: 'https://evil.invalid/api' },
    { credentials: { ...credentials, scope_type: '' } }, { credentials: { ...credentials, flow_type: 'Other' } },
    { credentials: { ...credentials, extra: 'PRIVATE' } }]) {
    await assert.rejects(authenticateLiveEngine({ ...options, ...patch }), { code: 'LIVE_ACCESS_NOT_CONFIGURED' });
  }
  assert.equal(calls, 0);
  assert.equal(await authenticateLiveEngine(options), 'short-lived-test-token');
  assert.equal(calls, 1);
});

test('targeted rooms reads encode bounded pagination and exact current-session filters in GET queries', async () => {
  let request;
  const engine = createLiveEngine({ baseUrl, token, authorised: true, fetchImpl: async (url, options) => {
    request = { url, options }; return response({ rooms: [], total: 0, meta: {} });
  } });
  const input = { hotel_id: 'hotel/$&id', search_id: 'search/$&id', language_code: 'en-US',
    page: 1, per_page: 1, sort: 'price', cache: true, room_id: 'room/$&id', source_ids: 'S1,S2' };
  await engine.read('rooms', input);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.body, undefined);
  assert.equal(request.url.pathname, '/api/products/hotels/rooms');
  for (const [key, value] of Object.entries(input)) assert.equal(request.url.searchParams.get(key), String(value));
});

test('targeted rooms validation refuses unbounded pages, unknown fields and injected outcomes before fetch', async () => {
  const engine = createLiveEngine({ baseUrl, token, authorised: true, fetchImpl: () => assert.fail('invalid query must not fetch') });
  const input = { hotel_id: 'h', search_id: 's', language_code: 'en-US', page: 1, per_page: 1, sort: 'price' };
  for (const patch of [{ page: 0 }, { page: 101 }, { per_page: 11 }, { cache: 'false' }, { hotel_id: '' },
    { language_code: 'UNKNOWN' }, { sort: 'unknown' }, { arbitrary_path: '/book' }, { source_ids: {} }]) {
    await assert.rejects(engine.read('rooms', { ...input, ...patch }), { code: 'INVALID_INPUT' });
  }
});
