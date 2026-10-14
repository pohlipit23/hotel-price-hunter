import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createAppServer } from '../app/server.mjs';
import { createLocalAgencyAuth } from '../app/agency-auth.mjs';
import { createTestMemoryStorage } from '../app/storage.mjs';

const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
const passphrase = 'test-only-agency-review-secret-'.repeat(3);
async function app(t, enabled = true) {
  let time = Date.parse('2026-10-15T03:00:00Z');
  const now = () => new Date(time);
  const agencyAuth = enabled ? await createLocalAgencyAuth({ now, environment: { AGENCY_AUTH_MODE: 'local-review', BIND_HOST: '127.0.0.1', APP_ORIGIN: 'http://127.0.0.1:8080', GOOGLE_CLOUD_PROJECT: 'demo-hotel-price-hunter', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' }, readConfiguration: async () => ({ passphrase }) }) : null;
  const storage = createTestMemoryStorage();
  const server = createAppServer({ storage, fixture, now, agencyAuth, advisor: { available: false, status: 'disabled' } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (route, method = 'GET', body, headers = {}) => fetch(origin + route, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const login = async headers => {
    const response = await request('/api/agency/session', 'POST', { passphrase }, headers);
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], session: await response.json(), response };
  };
  const createCase = async (offerId = 'DEMO_NON_REFUNDABLE') => {
    const bootstrap = await request('/api/bootstrap');
    const state = await bootstrap.json();
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    const { idempotencyKey, ...body } = state.simulation.offerApprovalIntents[offerId];
    const headers = { Cookie: cookie, 'X-CSRF-Token': state.csrfToken, 'Idempotency-Key': idempotencyKey };
    const response = await request('/api/offer-approvals', 'POST', body, headers);
    assert.equal(response.status, 200);
    return { cookie, state: await response.json(), body, headers };
  };
  return { request, login, createCase, storage, advanceTime: ms => { time += ms; } };
}

test('agency data defaults closed and visitor cookies, guessed paths and supplied roles never grant reviewer access', async t => {
  const disabled = await app(t, false);
  const shell = await disabled.request('/agency');
  assert.equal(shell.status, 200);
  assert.equal(shell.headers.get('cache-control'), 'no-store');
  assert.equal(shell.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await shell.text(), /agency-login/);
  assert.equal(shell.headers.get('set-cookie'), null);
  assert.equal((await disabled.request('/api/agency/cases')).status, 503);
  const enabled = await app(t);
  const customer = await enabled.createCase();
  let protectedReads = 0;
  for (const method of ['listCases', 'getCase']) {
    const original = enabled.storage[method].bind(enabled.storage);
    enabled.storage[method] = (...args) => { protectedReads++; return original(...args); };
  }
  for (const route of ['/api/agency/session', '/api/agency/cases', '/api/agency/cases/case-' + 'a'.repeat(64)]) {
    assert.equal((await enabled.request(route, 'GET', undefined, { Cookie: customer.cookie, 'X-Agency-Role': 'agency-reviewer' })).status, 401);
  }
  assert.equal(protectedReads, 0);
  assert.equal((await enabled.request('/api/agency/session', 'POST', { passphrase: 'wrong' })).status, 401);
  assert.equal((await enabled.request('/api/agency/session', 'POST', { passphrase }, { Origin: 'https://attacker.example' })).status, 403);
});

test('agency cases paginate with opaque session-bound cursors and inspect safe fictional proof without writing customer state', async t => {
  const enabled = await app(t);
  const customers = await Promise.all([enabled.createCase(), enabled.createCase('DEMO_DIFFERENT_HOTEL')]);
  const operator = await enabled.login();
  assert.match(operator.response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(JSON.stringify(operator.session), /passphrase|token|hph_visitor/);
  const headers = { Cookie: operator.cookie };
  const first = await (await enabled.request('/api/agency/cases?limit=1', 'GET', undefined, headers)).json();
  assert.equal(first.cases.length, 1);
  assert.match(first.nextCursor, /^[a-f0-9]{64}$/);
  assert.match(first.cases[0].caseId, /^case-[a-f0-9]{64}$/);
  const second = await (await enabled.request(`/api/agency/cases?limit=1&cursor=${first.nextCursor}`, 'GET', undefined, headers)).json();
  assert.equal(second.cases.length, 1);
  assert.notEqual(second.cases[0].caseId, first.cases[0].caseId);
  assert.equal(second.nextCursor, null);
  for (const query of ['limit=0', 'limit=51', 'limit=1&limit=2', 'cursor=bad', `limit=2&cursor=${first.nextCursor}`, 'bookingId=DEMO']) assert.equal((await enabled.request('/api/agency/cases?' + query, 'GET', undefined, headers)).status, 422);
  const before = await enabled.storage.get(customers[0].cookie.split('=')[1]);
  const detailResponse = await enabled.request('/api/agency/cases/' + first.cases[0].caseId, 'GET', undefined, headers);
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(detail.case.isSimulated, true);
  assert.equal(detail.case.authority.valid, true);
  assert.equal(detail.case.cancellation, null);
  const serialized = JSON.stringify(detail);
  for (const forbidden of ['operationId', 'approvalId', 'receiptId', 'intentId', 'materialFingerprint', 'idempotencyKey', 'visitorId', 'csrfToken', 'supplierCost', 'offerToken']) assert.equal(serialized.includes(forbidden), false, forbidden);
  for (const customer of customers) {
    assert.equal(serialized.includes(customer.cookie.split('=')[1]), false);
    assert.equal(serialized.includes(customer.state.simulation.operation.operationId), false);
  }
  assert.deepEqual(await enabled.storage.get(customers[0].cookie.split('=')[1]), before);
  assert.equal((await enabled.request('/api/agency/cases/' + first.cases[0].caseId, 'POST', {}, headers)).status, 405);
  assert.equal((await enabled.request('/api/agency/cases/' + customers[0].cookie.split('=')[1], 'GET', undefined, headers)).status, 404);
  enabled.advanceTime(5 * 60 * 1000);
  assert.equal((await enabled.request(`/api/agency/cases?limit=1&cursor=${first.nextCursor}`, 'GET', undefined, headers)).status, 422);
  const rotated = await enabled.login({ Cookie: operator.cookie });
  assert.equal((await enabled.request('/api/agency/cases', 'GET', undefined, headers)).status, 401);
  assert.equal((await enabled.request(`/api/agency/cases?limit=1&cursor=${first.nextCursor}`, 'GET', undefined, { Cookie: rotated.cookie })).status, 422);
});

test('reviewer logout requires current session CSRF and origin, and expiry removes access', async t => {
  const enabled = await app(t);
  const operator = await enabled.login();
  const headers = { Cookie: operator.cookie, 'X-CSRF-Token': operator.session.csrfToken };
  assert.equal((await enabled.request('/api/agency/session', 'DELETE', undefined, { ...headers, Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await enabled.request('/api/agency/session', 'DELETE', undefined, { Cookie: operator.cookie })).status, 403);
  assert.equal((await enabled.request('/api/agency/session', 'GET', undefined, headers)).status, 200);
  assert.deepEqual(await (await enabled.request('/api/agency/session', 'DELETE', undefined, headers)).json(), { authenticated: false });
  assert.equal((await enabled.request('/api/agency/cases', 'GET', undefined, headers)).status, 401);
  const renewed = await enabled.login();
  enabled.advanceTime(30 * 60 * 1000);
  assert.equal((await enabled.request('/api/agency/cases', 'GET', undefined, { Cookie: renewed.cookie })).status, 401);
});

test('agency reads recheck the original operator session after storage waits through expiry, rotation or logout', async t => {
  for (const change of ['expiry', 'rotation', 'logout']) {
    for (const endpoint of ['list', 'detail']) {
      const enabled = await app(t);
      await enabled.createCase();
      const caseId = (await enabled.storage.listCases({ limit: 1 }))[0].caseId;
      const operator = await enabled.login();
      let entered;
      const started = new Promise(resolve => { entered = resolve; });
      let release;
      const delayed = new Promise(resolve => { release = resolve; });
      const method = endpoint === 'list' ? 'listCases' : 'getCase';
      const original = enabled.storage[method].bind(enabled.storage);
      enabled.storage[method] = async (...args) => { entered(); await delayed; return original(...args); };
      const pending = enabled.request(endpoint === 'list' ? '/api/agency/cases' : '/api/agency/cases/' + caseId, 'GET', undefined, { Cookie: operator.cookie });
      await started;
      if (change === 'expiry') enabled.advanceTime(30 * 60 * 1000);
      if (change === 'rotation') await enabled.login({ Cookie: operator.cookie });
      if (change === 'logout') await enabled.request('/api/agency/session', 'DELETE', undefined, { Cookie: operator.cookie, 'X-CSRF-Token': operator.session.csrfToken });
      release();
      const response = await pending;
      assert.equal(response.status, 401, `${endpoint}: ${change}`);
      assert.equal((await response.json()).error.code, 'AGENCY_SESSION_REQUIRED');
    }
  }
});
