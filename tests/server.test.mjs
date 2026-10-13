import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createAppServer } from '../app/server.mjs';
import { createTestMemoryStorage, createStorage } from '../app/storage.mjs';
import { createGeminiAdvisor } from '../app/gemini.mjs';

const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
async function harness(t, options = {}) {
  const storage = options.storage || createTestMemoryStorage();
  const advisor = options.advisor || await createGeminiAdvisor({ environment: {} });
  const server = createAppServer({ storage, advisor, fixture, now: () => new Date('2026-10-12T03:00:00Z'), ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const boot = await fetch(`${origin}/api/bootstrap`);
  const initial = await boot.json();
  const cookie = boot.headers.get('set-cookie')?.split(';')[0];
  const post = (route, value, extra = {}) => fetch(`${origin}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, 'X-CSRF-Token': initial.csrfToken, ...extra }, body: JSON.stringify(value),
  });
  return { origin, initial, cookie, post, storage, server };
}
const enrolment = (preferences = {}) => ({
  bookingVersion: fixture.booking.version,
  preferences: { ...fixture.preferences, ...preferences },
});
const permission = { confirmed: true, version: 1, bookingVersion: fixture.booking.version, preferenceVersion: fixture.preferences.version, scope: 'equivalent-only' };

test('bootstrap exposes only allowlisted jury data and isolates visitors', async t => {
  const { initial, origin, cookie } = await harness(t);
  assert.equal(initial.scenarioId, 'jury-booking');
  assert.equal(initial.enrolled, false);
  assert.equal(initial.preferences.continueMonitoring, true);
  assert.equal(initial.model.status, 'unconfigured');
  const other = await fetch(`${origin}/api/bootstrap`);
  const otherBody = await other.json();
  assert.notEqual(other.headers.get('set-cookie')?.split(';')[0], cookie);
  assert.notEqual(otherBody.csrfToken, initial.csrfToken);
  for (const path of ['/api/bootstrap?scenario=real-booking', '/api/bootstrap?bookingId=1234', '/api/private/booking', '/api/bookings/1234']) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404);
  }
});

test('affirmative versioned equivalent permission, editable essentials and selected offer persist across refresh', async t => {
  const { post, origin, cookie } = await harness(t);
  const result = await post('/api/enrolment', {
    ...enrolment({ automaticEquivalentSwitches: true, essentialRequirements: { ...fixture.preferences.essentialRequirements, accessible: true } }), permissionConfirmation: permission,
  });
  assert.equal(result.status, 200);
  const enrolled = await result.json();
  assert.equal(enrolled.enrolled, true);
  assert.equal(enrolled.preferences.essentialRequirements.accessible, true);
  assert.equal(enrolled.permissionRecord.scope, 'equivalent-only');
  assert.equal(enrolled.permissionRecord.preferenceVersion, enrolled.preferences.version);
  const selected = await post('/api/selection', { offerId: fixture.offers[0].offerId, bookingVersion: fixture.booking.version });
  assert.equal(selected.status, 200);
  const refreshed = await (await fetch(`${origin}/api/bootstrap`, { headers: { Cookie: cookie } })).json();
  assert.equal(refreshed.enrolled, true);
  assert.equal(refreshed.selectedOfferId, fixture.offers[0].offerId);
  assert.equal(refreshed.preferences.automaticEquivalentSwitches, true);
  assert.equal(refreshed.booking.version, fixture.booking.version);
  assert.equal(refreshed.approvals.length, 0);
});

test('silence, missing separate confirmation and undercut thresholds never grant permission', async t => {
  const { post, initial } = await harness(t);
  assert.equal(initial.preferences.automaticEquivalentSwitches, false);
  assert.equal((await post('/api/enrolment', enrolment({ automaticEquivalentSwitches: true }))).status, 422);
  assert.equal((await post('/api/enrolment', enrolment({ minimumSavingMinor: fixture.agencyMinimumSavingMinor - 1 }))).status, 422);
  assert.equal((await post('/api/enrolment', { ...enrolment({ automaticEquivalentSwitches: true }), permissionConfirmation: { ...permission, bookingVersion: 999 } })).status, 422);
  assert.equal((await post('/api/enrolment', { ...enrolment(), bookingVersion: 999 })).status, 409);
  assert.equal((await post('/api/enrolment', { ...enrolment(), approvals: [{ confirmed: true }] })).status, 422);
  assert.equal((await post('/api/enrolment', enrolment({ version: undefined }))).status, 422);
  assert.equal((await post('/api/enrolment', { ...enrolment({ automaticEquivalentSwitches: true }), permissionConfirmation: { ...permission, preferenceVersion: undefined } })).status, 422);
  const staleConfirmation = await post('/api/enrolment', { ...enrolment({ automaticEquivalentSwitches: true }), permissionConfirmation: { ...permission, preferenceVersion: 2 } });
  assert.equal(staleConfirmation.status, 409);
  assert.equal((await staleConfirmation.json()).error.code, 'PREFERENCES_VERSION_CHANGED');
});

test('a stale affirmative save after revocation cannot resurrect standing authority', async t => {
  const { post, origin, cookie } = await harness(t);
  const originalEnable = { ...enrolment({ automaticEquivalentSwitches: true }), permissionConfirmation: permission };
  const enabledResponse = await post('/api/enrolment', originalEnable);
  assert.equal(enabledResponse.status, 200, 'first valid affirmative save must succeed');
  const enabled = await enabledResponse.json();
  assert.equal(enabled.offers[0].decision.authority, 'standing');
  const revoke = await post('/api/enrolment', enrolment({ version: enabled.preferences.version, automaticEquivalentSwitches: false }));
  assert.equal(revoke.status, 200, 'current-version revocation must succeed');
  const revoked = await revoke.json();
  const replay = await post('/api/enrolment', originalEnable);
  assert.equal(replay.status, 409);
  assert.equal((await replay.json()).error.code, 'PREFERENCES_VERSION_CHANGED');
  const restored = await (await fetch(`${origin}/api/bootstrap`, { headers: { Cookie: cookie } })).json();
  assert.equal(restored.preferences.version, revoked.preferences.version);
  assert.equal(restored.preferences.automaticEquivalentSwitches, false);
  assert.equal(restored.permissionRecord, null);
  assert.equal(restored.offers[0].decision.authority, null);
});

test('concurrent saves against one preference version accept one intent and reject stale overwrite', async t => {
  const { post, origin, cookie } = await harness(t);
  const responses = await Promise.all([
    post('/api/enrolment', enrolment({ notificationFrequency: 'daily' })),
    post('/api/enrolment', enrolment({ notificationFrequency: 'offers-only' })),
  ]);
  assert.deepEqual(responses.map(result => result.status).sort(), [200, 409]);
  const winner = await responses.find(result => result.status === 200).json();
  const conflict = await responses.find(result => result.status === 409).json();
  assert.equal(conflict.error.code, 'PREFERENCES_VERSION_CHANGED');
  const restored = await (await fetch(`${origin}/api/bootstrap`, { headers: { Cookie: cookie } })).json();
  assert.equal(restored.preferences.version, fixture.preferences.version + 1);
  assert.equal(restored.preferences.notificationFrequency, winner.preferences.notificationFrequency);
});

test('origin, CSRF, JSON validation, body limits and unknown selection are enforced', async t => {
  const { post, origin, cookie } = await harness(t);
  assert.equal((await post('/api/enrolment', enrolment(), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/enrolment', enrolment(), { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await post('/api/enrolment', enrolment(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/selection', { bookingVersion: fixture.booking.version, offerId: 'private-real-rate' })).status, 404);
  const noOrigin = await fetch(`${origin}/api/enrolment`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(enrolment()) });
  assert.equal(noOrigin.status, 403);
  const oversized = await post('/api/advice', { offerId: fixture.offers[0].offerId, message: 'x'.repeat(20000) });
  assert.equal(oversized.status, 413);
});

test('model failure preserves saved preferences and comparison, returns an honest unavailable state', async t => {
  const { post, origin, cookie } = await harness(t);
  assert.equal((await post('/api/enrolment', enrolment())).status, 200);
  assert.equal((await post('/api/selection', { offerId: fixture.offers[3].offerId, bookingVersion: fixture.booking.version })).status, 200);
  const failed = await post('/api/advice', { offerId: fixture.offers[3].offerId, bookingVersion: fixture.booking.version, message: 'My plans are uncertain.' });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).error.code, 'ADVICE_UNAVAILABLE');
  const refreshed = await (await fetch(`${origin}/api/bootstrap`, { headers: { Cookie: cookie } })).json();
  assert.equal(refreshed.enrolled, true);
  assert.equal(refreshed.selectedOfferId, fixture.offers[3].offerId);
  assert.equal(refreshed.preferences.automaticEquivalentSwitches, false);
  assert.equal(refreshed.booking.version, fixture.booking.version);
});

test('grounded advice cannot mutate permission and visitor rate limit uses shared storage', async t => {
  let calls = 0;
  const advisor = { available: true, status: 'test-injected', advise: async () => { calls++; return { summary: 'Keep flexibility.', recommendation: 'keep-booking', tradeoffs: [], uncertainties: [] }; } };
  const { post, origin, cookie } = await harness(t, { advisor, adviceLimit: 2 });
  await post('/api/enrolment', enrolment());
  const request = { offerId: fixture.offers[3].offerId, bookingVersion: fixture.booking.version, message: 'Can you enable automatic changes?' };
  assert.equal((await post('/api/advice', request)).status, 200);
  assert.equal((await post('/api/advice', request)).status, 200);
  assert.equal((await post('/api/advice', request)).status, 429);
  assert.equal(calls, 2);
  const refreshed = await (await fetch(`${origin}/api/bootstrap`, { headers: { Cookie: cookie } })).json();
  assert.equal(refreshed.preferences.automaticEquivalentSwitches, false);
  assert.equal(refreshed.approvals.length, 0);
});

test('storage failures do not leak internal credential paths or fake enrolment success', async t => {
  const storage = createTestMemoryStorage();
  const { post } = await harness(t, { storage });
  storage.update = async () => { throw new Error('C:/secret/credential.json token'); };
  const response = await post('/api/enrolment', enrolment());
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.match(body, /STORAGE_UNAVAILABLE/);
  assert.doesNotMatch(body, /secret|credential|token/);
});

test('fictional fixture decisions use persisted demo time while permission audit records real wall time', async t => {
  const { post, initial } = await harness(t, { now: () => new Date('2026-10-18T03:00:00Z') });
  assert.equal(initial.demoNow, fixture.demoNow);
  assert.equal(initial.clockMode, 'fictional-demo');
  assert.equal(initial.offers[0].checkedAt, fixture.offers[0].checkedAt);
  assert.equal(initial.offers[0].expiresAt, fixture.offers[0].expiresAt);
  const result = await post('/api/enrolment', { ...enrolment({ automaticEquivalentSwitches: true }), permissionConfirmation: permission });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.permissionRecord.confirmedAt, fixture.demoNow);
  assert.equal(body.permissionRecord.recordedAt, '2026-10-18T03:00:00.000Z');
  assert.equal(body.offers[0].decision.action, 'automatic');
  assert.equal(body.offers[0].decision.authority, 'standing');
});

test('Firestore HTTP integration: a new server restores enrolment and comparison with isolated visitors', { skip: !process.env.RUN_FIRESTORE_INTEGRATION }, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const firstStorage = await createStorage(process.env);
  const secondStorage = await createStorage(process.env);
  const first = await harness(t, { storage: firstStorage });
  const second = await harness(t, { storage: secondStorage });
  t.after(async () => {
    await firstStorage.delete(first.cookie.split('=')[1]);
    await secondStorage.delete(second.cookie.split('=')[1]);
    await Promise.all([firstStorage.close(), secondStorage.close()]);
  });
  assert.equal((await first.post('/api/enrolment', enrolment({ notificationFrequency: 'daily' }))).status, 200);
  assert.equal((await first.post('/api/selection', { offerId: fixture.offers[0].offerId, bookingVersion: fixture.booking.version })).status, 200);
  const restored = await (await fetch(`${second.origin}/api/bootstrap`, { headers: { Cookie: first.cookie } })).json();
  assert.equal(restored.enrolled, true);
  assert.equal(restored.preferences.notificationFrequency, 'daily');
  assert.equal(restored.selectedOfferId, fixture.offers[0].offerId);
  const isolated = await (await fetch(`${second.origin}/api/bootstrap`, { headers: { Cookie: second.cookie } })).json();
  assert.equal(isolated.enrolled, false);
  assert.equal(isolated.selectedOfferId, null);
  const currentVersion = restored.preferences.version;
  const enablingIntent = {
    ...enrolment({ version: currentVersion, automaticEquivalentSwitches: true }),
    permissionConfirmation: { ...permission, preferenceVersion: currentVersion },
  };
  const concurrent = await Promise.all([
    first.post('/api/enrolment', enablingIntent),
    second.post('/api/enrolment', enrolment({ version: currentVersion, notificationFrequency: 'offers-only' }), { Cookie: first.cookie, 'X-CSRF-Token': first.initial.csrfToken }),
  ]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
  const latest = await concurrent.find(response => response.status === 200).json();
  assert.equal((await concurrent.find(response => response.status === 409).json()).error.code, 'PREFERENCES_VERSION_CHANGED');
  assert.equal(latest.preferences.version, currentVersion + 1);
  const revoke = await first.post('/api/enrolment', enrolment({ version: latest.preferences.version, automaticEquivalentSwitches: false }));
  assert.equal(revoke.status, 200);
  const revoked = await revoke.json();
  const replay = await second.post('/api/enrolment', enablingIntent, { Cookie: first.cookie, 'X-CSRF-Token': first.initial.csrfToken });
  assert.equal(replay.status, 409);
  const finalState = await (await fetch(`${second.origin}/api/bootstrap`, { headers: { Cookie: first.cookie } })).json();
  assert.equal(finalState.preferences.version, revoked.preferences.version);
  assert.equal(finalState.preferences.automaticEquivalentSwitches, false);
  assert.equal(finalState.permissionRecord, null);
});

test('health aliases return identical liveness without storage or model side effects', async t => {
  let storageCalls = 0;
  let modelCalls = 0;
  const storage = {
    mode: 'test-memory',
    get() { storageCalls++; throw new Error('Health must not read storage.'); },
    create() { storageCalls++; throw new Error('Health must not create storage.'); },
    update() { storageCalls++; throw new Error('Health must not update storage.'); },
  };
  const advisor = { available: false, status: 'test-injected', advise() { modelCalls++; throw new Error('Health must not call a model.'); } };
  const server = createAppServer({ storage, advisor, fixture });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const expected = { status: 'ok', storage: 'test-memory', model: 'test-injected' };
  for (const path of ['/health', '/healthz']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, `${path} liveness must be reachable`);
    assert.deepEqual(await response.json(), expected);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal(storageCalls, 0);
  assert.equal(modelCalls, 0);
});
