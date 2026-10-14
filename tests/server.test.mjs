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

function approveSelected(app, offerId = 'DEMO_EQUIVALENT', intent = app.initial.simulation.offerApprovalIntents[offerId]) {
  const { idempotencyKey, ...body } = intent;
  return app.post('/api/offer-approvals', body, { 'Idempotency-Key': idempotencyKey });
}

test('offer approval routes create genuine scoped authority for each customer choice without a preferences form', async t => {
  for (const offerId of ['DEMO_EQUIVALENT', 'DEMO_DIFFERENT_ROOM', 'DEMO_DIFFERENT_HOTEL']) {
    const app = await harness(t);
    const responses = await Promise.all([approveSelected(app, offerId), approveSelected(app, offerId)]);
    assert.deepEqual(responses.map(item => item.status), [200, 200]);
    const results = await Promise.all(responses.map(item => item.json()));
    assert.deepEqual(results.map(item => item.replayed).sort(), [false, true]);
    let state = results[0];
    assert.equal(state.enrolled, false);
    assert.deepEqual(state.preferences, app.initial.preferences);
    assert.equal(state.permissionRecord, null);
    assert.equal(state.selectedOfferId, offerId);
    assert.equal(state.simulation.operation.authority, 'offer-approval');
    assert.equal(state.simulation.operation.offerApproval.scope, 'selected-offer');
    for (const stage of ['revalidated', 'replacement-secured', 'fulfilment-verified', 'cancellation-requested', 'cancellation-verified', 'refund-completed']) {
      const operation = state.simulation.operation;
      const next = await app.post(`/api/switches/${operation.operationId}/advances`, { expectedOperationRevision: operation.revision });
      assert.equal(next.status, 200);
      state = await next.json();
      assert.equal(state.simulation.operation.stage, stage);
      if (stage === 'cancellation-verified') assert.equal(state.simulation.operation.refund.status, 'pending');
    }
    const refresh = await (await fetch(`${app.origin}/api/bootstrap`, { headers: { Cookie: app.cookie } })).json();
    assert.equal(refresh.simulation.operation.refund.status, 'completed');
    assert.equal(refresh.booking.version, 2);
    assert.deepEqual(refresh.offers, []);
    assert.equal(refresh.permissionRecord, null);
    assert.equal((await (await approveSelected(app, offerId)).json()).replayed, true);
    assert.doesNotMatch(JSON.stringify(refresh.simulation.operation), /intentHash|idempotencyKey|commands|permissionSnapshot|sourceOffer/);
  }
});

test('offer approval boundary rejects false/missing confirmation, injected facts and stale material authority', async t => {
  const app = await harness(t);
  const { idempotencyKey, ...body } = app.initial.simulation.offerApprovalIntents.DEMO_EQUIVALENT;
  const headers = { 'Idempotency-Key': idempotencyKey };
  for (const invalid of [{ ...body, confirmed: false }, { ...body, confirmed: undefined }, { ...body, price: 1 }, { ...body, scenarioId: 'equivalent-saving' }, { ...body, materialFingerprint: [body.materialFingerprint] }]) {
    assert.equal((await app.post('/api/offer-approvals', invalid, headers)).status, 422);
  }
  assert.equal((await app.post('/api/offer-approvals', body)).status, 422);
  assert.equal((await app.post('/api/offer-approvals', body, { ...headers, 'X-CSRF-Token': 'bad' })).status, 403);
  assert.equal((await app.post('/api/offer-approvals', body, { ...headers, Origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await app.post('/api/offer-approvals', { ...body, materialFingerprint: '0'.repeat(64) }, headers)).status, 409);
  assert.equal((await app.post('/api/offer-approvals', { ...body, materialFingerprint: 'unknown' }, headers)).status, 422);
  for (const offerId of ['DEMO_NON_REFUNDABLE', 'DEMO_UNKNOWN_CONDITION', 'DEMO_REVALIDATION_CHANGE']) {
    assert.equal(app.initial.simulation.offerApprovalIntents[offerId], null);
    assert.equal((await app.post('/api/offer-approvals', { ...body, offerId }, headers)).status, 404);
  }
  await app.storage.update(app.cookie.split('=')[1], state => {
    state.offers[0].room.conditions.bedType = null;
    return state;
  });
  const denied = await app.post('/api/offer-approvals', body, headers);
  assert.equal(denied.status, 409);
  assert.equal((await denied.json()).error.code, 'OFFER_MATERIAL_CHANGED');
  const fresh = await (await fetch(`${app.origin}/api/bootstrap`, { headers: { Cookie: app.cookie } })).json();
  assert.equal(fresh.simulation.offerApprovalIntents.DEMO_EQUIVALENT, null);
  assert.equal(fresh.simulation.operation, null);
  assert.equal(fresh.enrolled, false);
});

test('competing selected offers atomically reserve one source and payload changes cannot replay its authority', async t => {
  const app = await harness(t);
  const offers = ['DEMO_EQUIVALENT', 'DEMO_DIFFERENT_HOTEL'];
  const responses = await Promise.all(offers.map(offerId => approveSelected(app, offerId)));
  assert.deepEqual(responses.map(item => item.status).sort(), [200, 409]);
  const winner = await responses.find(item => item.status === 200).json();
  const { idempotencyKey, ...body } = app.initial.simulation.offerApprovalIntents[winner.selectedOfferId];
  const mismatch = await app.post('/api/offer-approvals', { ...body, preferenceVersion: body.preferenceVersion + 1 }, { 'Idempotency-Key': idempotencyKey });
  assert.equal(mismatch.status, 422);
  assert.equal((await mismatch.json()).error.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  const outsider = await harness(t);
  assert.equal((await outsider.post(`/api/switches/${winner.simulation.operation.operationId}/advances`, { expectedOperationRevision: 0 })).status, 404);
});

test('lost approval and advance acknowledgments require an exact replay and never create another receipt', async t => {
  const app = await harness(t);
  const update = app.storage.update.bind(app.storage);
  let loseAcknowledgment = true;
  app.storage.update = async (...args) => {
    const saved = await update(...args);
    if (loseAcknowledgment) { loseAcknowledgment = false; throw new Error('Simulated lost acknowledgment'); }
    return saved;
  };
  assert.equal((await approveSelected(app)).status, 503);
  let state = await (await approveSelected(app)).json();
  assert.equal(state.replayed, true);
  assert.equal(state.simulation.operation.revision, 0);
  assert.equal(state.simulation.operation.history.length, 1);
  const operation = state.simulation.operation;
  loseAcknowledgment = true;
  const advance = () => app.post(`/api/switches/${operation.operationId}/advances`, { expectedOperationRevision: operation.revision });
  assert.equal((await advance()).status, 503);
  state = await (await advance()).json();
  assert.equal(state.replayed, true);
  assert.equal(state.simulation.operation.revision, 1);
  assert.equal(state.simulation.operation.history.length, 2);
  assert.equal(state.replayedCommand.stage, 'revalidated');
  const stored = await app.storage.get(app.cookie.split('=')[1]);
  assert.equal(Object.keys(stored.operations).length, 1);
  assert.deepEqual(stored.reservedBookingVersions, [1]);
});

test('failed approval storage commit and session expiry cannot record successful scoped authority', async t => {
  const app = await harness(t);
  const update = app.storage.update.bind(app.storage);
  let failOnce = true;
  app.storage.update = async (...args) => {
    if (failOnce) { failOnce = false; throw new Error('private storage details'); }
    return update(...args);
  };
  const denied = await approveSelected(app);
  assert.equal(denied.status, 503);
  assert.doesNotMatch(await denied.text(), /private/);
  assert.equal((await app.storage.get(app.cookie.split('=')[1])).activeOperationId, null);
  app.storage.update = async (id, change) => {
    await update(id, state => ({ ...state, expiresAt: '2026-10-01T00:00:00Z' }));
    return update(id, change);
  };
  assert.equal((await approveSelected(app)).status, 401);
  assert.equal((await app.storage.get(app.cookie.split('=')[1])).activeOperationId, null);
});

test('Firestore selected approval integration: independent servers atomically approve and advance all three alternatives', { skip: !process.env.RUN_FIRESTORE_INTEGRATION }, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const firstStorage = await createStorage(process.env);
  const secondStorage = await createStorage(process.env);
  const sessions = [];
  t.after(async () => {
    await Promise.all(sessions.map(cookie => firstStorage.delete(cookie.split('=')[1])));
    await Promise.all([firstStorage.close(), secondStorage.close()]);
  });
  const second = await harness(t, { storage: secondStorage });
  sessions.push(second.cookie);
  for (const offerId of ['DEMO_EQUIVALENT', 'DEMO_DIFFERENT_ROOM', 'DEMO_DIFFERENT_HOTEL']) {
    const app = await harness(t, { storage: firstStorage });
    sessions.push(app.cookie);
    const otherPost = (path, body, extra = {}) => second.post(path, body,
      { Cookie: app.cookie, 'X-CSRF-Token': app.initial.csrfToken, ...extra });
    const { idempotencyKey, ...body } = app.initial.simulation.offerApprovalIntents[offerId];
    const starts = await Promise.all([approveSelected(app, offerId), otherPost('/api/offer-approvals', body, { 'Idempotency-Key': idempotencyKey })]);
    assert.deepEqual(starts.map(item => item.status), [200, 200]);
    const results = await Promise.all(starts.map(item => item.json()));
    assert.deepEqual(results.map(item => item.replayed).sort(), [false, true]);
    let state = results[0];
    for (let index = 0; index < 6; index++) {
      const operation = state.simulation.operation;
      const path = `/api/switches/${operation.operationId}/advances`;
      const command = { expectedOperationRevision: operation.revision };
      const advances = await Promise.all([app.post(path, command), otherPost(path, command)]);
      assert.deepEqual(advances.map(item => item.status), [200, 200]);
      const stages = await Promise.all(advances.map(item => item.json()));
      assert.deepEqual(stages.map(item => item.replayed).sort(), [false, true]);
      state = stages[0];
    }
    const restored = await (await fetch(`${second.origin}/api/bootstrap`, { headers: { Cookie: app.cookie } })).json();
    assert.equal(restored.booking.version, 2);
    assert.equal(restored.booking.retail.totalMinor, fixture.offers.find(item => item.offerId === offerId).retail.totalMinor);
    assert.equal(restored.simulation.operation.history.length, 7);
    assert.equal(restored.simulation.operation.refund.status, 'completed');
    assert.equal(restored.enrolled, false);
    assert.equal(restored.permissionRecord, null);
    assert.deepEqual(restored.preferences, app.initial.preferences);
    assert.equal((await (await otherPost('/api/offer-approvals', body, { 'Idempotency-Key': idempotencyKey })).json()).replayed, true);
    const stored = await firstStorage.get(app.cookie.split('=')[1]);
    assert.equal(Object.keys(stored.operations).length, 1);
  }
  const app = await harness(t, { storage: firstStorage });
  sessions.push(app.cookie);
  const alternate = app.initial.simulation.offerApprovalIntents.DEMO_DIFFERENT_HOTEL;
  const { idempotencyKey, ...body } = alternate;
  const competing = await Promise.all([approveSelected(app), second.post('/api/offer-approvals', body,
    { Cookie: app.cookie, 'X-CSRF-Token': app.initial.csrfToken, 'Idempotency-Key': idempotencyKey })]);
  assert.deepEqual(competing.map(item => item.status).sort(), [200, 409]);
  assert.equal(Object.keys((await firstStorage.get(app.cookie.split('=')[1])).operations).length, 1);
});

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

async function enabledSwitch(t, options = {}) {
  const app = await harness(t, options);
  const saved = await app.post('/api/enrolment', { ...enrolment({ automaticEquivalentSwitches: true }), permissionConfirmation: permission });
  assert.equal(saved.status, 200);
  app.state = await saved.json();
  app.begin = async (scenarioId = 'equivalent-saving', intent = app.state.simulation.scenarios.find(item => item.id === scenarioId).intent) => {
    const { idempotencyKey, ...body } = intent;
    return app.post('/api/switches', body, { 'Idempotency-Key': idempotencyKey });
  };
  app.advance = async (operation = app.state.simulation.operation, revision = operation.revision) => app.post(`/api/switches/${operation.operationId}/advances`, { expectedOperationRevision: revision });
  app.refresh = async () => (await fetch(`${app.origin}/api/bootstrap`, { headers: { Cookie: app.cookie } })).json();
  return app;
}

test('switch persists stage and new baseline, exact start/advance replay never duplicates effects', async t => {
  const app = await enabledSwitch(t);
  const intent = app.state.simulation.nextIntent;
  const starts = await Promise.all([app.begin(), app.begin()]);
  assert.deepEqual(starts.map(item => item.status), [200, 200]);
  const started = await Promise.all(starts.map(item => item.json()));
  assert.deepEqual(started.map(item => item.replayed).sort(), [false, true]);
  app.state = started[0];
  for (const stage of ['revalidated', 'replacement-secured', 'fulfilment-verified', 'cancellation-requested', 'cancellation-verified', 'refund-completed']) {
    const operation = app.state.simulation.operation;
    const responses = await Promise.all([app.advance(operation), app.advance(operation)]);
    assert.deepEqual(responses.map(item => item.status), [200, 200]);
    const bodies = await Promise.all(responses.map(item => item.json()));
    assert.deepEqual(bodies.map(item => item.replayed).sort(), [false, true]);
    app.state = await app.refresh();
    assert.equal(app.state.simulation.operation.stage, stage);
    assert.equal(app.state.simulation.operation.revision, operation.revision + 1);
  }
  assert.equal(app.state.booking.version, 2);
  assert.equal(app.state.booking.retail.totalMinor, 54000);
  assert.deepEqual(app.state.offers, []);
  assert.equal(app.state.transactionMode, 'simulated');
  assert.equal(app.state.simulation.nextIntent, null);
  assert.equal(app.state.simulation.operation.refund.status, 'completed');
  assert.equal(app.state.simulation.operation.history.length, 7);
  const replay = await (await app.begin('equivalent-saving', intent)).json();
  assert.equal(replay.replayed, true);
  assert.equal(replay.booking.version, 2);
  const old = await (await app.advance(app.state.simulation.operation, 0)).json();
  assert.equal(old.simulation.operation.stage, 'refund-completed');
  assert.equal(old.replayedCommand.stage, 'revalidated');
  assert.doesNotMatch(JSON.stringify(app.state.simulation), /intentHash|commands|csrfToken|permissionSnapshot/);
  assert.equal((await app.post('/api/selection', { offerId: fixture.offers[0].offerId, bookingVersion: 1 })).status, 409);
  assert.equal((await app.post('/api/selection', { offerId: fixture.offers[0].offerId, bookingVersion: 2 })).status, 404);
  assert.equal((await app.post('/api/advice', { offerId: fixture.offers[0].offerId, bookingVersion: 1, message: 'Explain' })).status, 409);
  assert.equal((await app.post('/api/enrolment', enrolment({ version: app.state.preferences.version }))).status, 409);
  assert.equal((await app.post('/api/enrolment', { ...enrolment({ version: app.state.preferences.version }), bookingVersion: 2 })).status, 200);
});

test('switch routes reject forged input, missing authority, stale facts and visitor isolation', async t => {
  const app = await enabledSwitch(t);
  const { idempotencyKey, ...body } = app.state.simulation.nextIntent;
  assert.equal((await app.post('/api/switches', body)).status, 422);
  assert.equal((await app.post('/api/switches', { ...body, price: 1 }, { 'Idempotency-Key': idempotencyKey })).status, 422);
  assert.equal((await app.post('/api/switches', body, { 'Idempotency-Key': idempotencyKey, 'X-CSRF-Token': 'bad' })).status, 403);
  assert.equal((await app.post('/api/switches', { ...body, scenarioId: 'live-booking' }, { 'Idempotency-Key': idempotencyKey })).status, 404);
  const unauthorised = await harness(t);
  const { idempotencyKey: noKey, ...noAuthority } = unauthorised.initial.simulation.nextIntent;
  const denied = await unauthorised.post('/api/switches', noAuthority, { 'Idempotency-Key': noKey });
  assert.equal(denied.status, 409);
  assert.equal((await denied.json()).error.code, 'SWITCH_NOT_AUTHORISED');
  await app.post('/api/enrolment', enrolment({ version: app.state.preferences.version, automaticEquivalentSwitches: false }));
  assert.equal((await app.post('/api/switches', body, { 'Idempotency-Key': idempotencyKey })).status, 409);
  const second = await enabledSwitch(t);
  second.state = await (await second.begin()).json();
  const id = second.state.simulation.operation.operationId;
  assert.equal((await app.post(`/api/switches/${id}/advances`, { expectedOperationRevision: 0 })).status, 404);
  assert.equal((await second.post(`/api/switches/${id}/advances`, { expectedOperationRevision: -1 })).status, 422);
  assert.equal((await second.post(`/api/switches/${id}/advances`, { expectedOperationRevision: 99 })).status, 409);
});

test('competing scenario claims reserve one baseline and changed payload does not reuse an intent', async t => {
  const app = await enabledSwitch(t);
  const responses = await Promise.all([app.begin('equivalent-saving'), app.begin('material-change')]);
  assert.deepEqual(responses.map(item => item.status).sort(), [200, 409]);
  const winning = await responses.find(item => item.status === 200).json();
  const scenarioId = winning.simulation.operation.scenarioId;
  const { idempotencyKey, ...body } = app.state.simulation.scenarios.find(item => item.id === scenarioId).intent;
  const mismatch = await app.post('/api/switches', { ...body, preferenceVersion: body.preferenceVersion + 1 }, { 'Idempotency-Key': idempotencyKey });
  assert.equal(mismatch.status, 422);
  assert.equal((await mismatch.json()).error.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
});

test('material change and unknown cancellation use trusted scripts and distinct safety stops', async t => {
  const changed = await enabledSwitch(t);
  changed.state = await (await changed.begin('material-change')).json();
  changed.state = await (await changed.advance()).json();
  assert.equal(changed.state.simulation.operation.status, 'awaits-renewed-approval');
  assert.equal(changed.state.simulation.operation.revalidatedOffer.version, 2);
  assert.equal(changed.state.simulation.operation.replacementBooking, null);
  assert.equal(changed.state.booking.version, 1);
  const uncertain = await enabledSwitch(t);
  uncertain.state = await (await uncertain.begin('uncertain-cancellation')).json();
  for (let index = 0; index < 5; index++) uncertain.state = await (await uncertain.advance()).json();
  const operation = uncertain.state.simulation.operation;
  assert.equal(operation.status, 'agency-exception');
  assert.equal(operation.savingSecured, false);
  assert.equal(operation.refund.status, 'not-started');
  assert.equal(uncertain.state.booking.version, 1);
  await uncertain.post('/api/enrolment', enrolment({ version: uncertain.state.preferences.version, automaticEquivalentSwitches: false, continueMonitoring: false }));
  uncertain.state = await (await uncertain.advance()).json();
  assert.equal(uncertain.state.simulation.operation.cancellation.intentId, operation.cancellation.intentId);
  assert.equal(uncertain.state.booking.version, 2);
  assert.equal(uncertain.state.permissionRecord, null);
  assert.equal(uncertain.state.simulation.operation.refund.status, 'pending');
  uncertain.state = await (await uncertain.advance()).json();
  assert.equal(uncertain.state.simulation.operation.refund.status, 'completed');
});

test('storage failure and expired session between pre-read and commit cannot claim simulated success', async t => {
  const app = await enabledSwitch(t);
  const update = app.storage.update.bind(app.storage);
  let failed = true;
  app.storage.update = async (...args) => { if (failed) { failed = false; throw new Error('private storage details'); } return update(...args); };
  assert.equal((await app.begin()).status, 503);
  assert.equal((await app.refresh()).simulation.operation, null);
  app.state = await (await app.begin()).json();
  const expiryRace = app.storage.update.bind(app.storage);
  app.storage.update = async (id, change) => {
    await expiryRace(id, state => ({ ...state, expiresAt: '2026-10-01T00:00:00Z' }));
    return expiryRace(id, change);
  };
  assert.equal((await app.advance()).status, 401);
});

test('lost storage acknowledgment replays the committed intent and stage without another effect', async t => {
  const app = await enabledSwitch(t);
  const update = app.storage.update.bind(app.storage);
  let loseAcknowledgment = true;
  app.storage.update = async (...args) => {
    const saved = await update(...args);
    if (loseAcknowledgment) { loseAcknowledgment = false; throw new Error('Simulated acknowledgment timeout.'); }
    return saved;
  };
  assert.equal((await app.begin()).status, 503);
  app.state = await (await app.begin()).json();
  assert.equal(app.state.replayed, true);
  assert.equal(app.state.simulation.operation.revision, 0);
  assert.equal(app.state.simulation.operation.history.length, 1);
  const operation = app.state.simulation.operation;
  loseAcknowledgment = true;
  assert.equal((await app.advance(operation)).status, 503);
  app.state = await (await app.advance(operation)).json();
  assert.equal(app.state.replayed, true);
  assert.equal(app.state.simulation.operation.revision, 1);
  assert.equal(app.state.simulation.operation.history.length, 2);
  assert.equal(app.state.replayedCommand.stage, 'revalidated');
});

test('in-flight advice does not return a stale successful comparison after preferences change', async t => {
  let release;
  let entered;
  const active = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const advisor = { available: true, status: 'test-injected', async advise() { entered(); await gate; return { summary: 'Keep flexibility.', recommendation: 'keep-booking', tradeoffs: [], uncertainties: [] }; } };
  const app = await enabledSwitch(t, { advisor });
  const advice = app.post('/api/advice', { offerId: fixture.offers[0].offerId, bookingVersion: 1, message: 'Explain this saving.' });
  await active;
  await app.post('/api/enrolment', enrolment({ version: app.state.preferences.version, automaticEquivalentSwitches: false }));
  release();
  assert.equal((await advice).status, 409);
});

test('Firestore switch integration: independent servers serialize intents/stages and restore promoted baseline', { skip: !process.env.RUN_FIRESTORE_INTEGRATION }, async t => {
  const firstStorage = await createStorage(process.env);
  const secondStorage = await createStorage(process.env);
  const app = await enabledSwitch(t, { storage: firstStorage });
  const second = await harness(t, { storage: secondStorage });
  t.after(async () => {
    await firstStorage.delete(app.cookie.split('=')[1]);
    await secondStorage.delete(second.cookie.split('=')[1]);
    await Promise.all([firstStorage.close(), secondStorage.close()]);
  });
  const { idempotencyKey, ...body } = app.state.simulation.nextIntent;
  const otherPost = (path, value, extra = {}) => second.post(path, value, { Cookie: app.cookie, 'X-CSRF-Token': app.initial.csrfToken, ...extra });
  const starts = await Promise.all([app.begin(), otherPost('/api/switches', body, { 'Idempotency-Key': idempotencyKey })]);
  assert.deepEqual(starts.map(item => item.status), [200, 200]);
  const results = await Promise.all(starts.map(item => item.json()));
  assert.deepEqual(results.map(item => item.replayed).sort(), [false, true]);
  app.state = results[0];
  for (let index = 0; index < 6; index++) {
    const operation = app.state.simulation.operation;
    const stages = await Promise.all([app.advance(), otherPost(`/api/switches/${operation.operationId}/advances`, { expectedOperationRevision: operation.revision })]);
    assert.deepEqual(stages.map(item => item.status), [200, 200]);
    const updates = await Promise.all(stages.map(item => item.json()));
    assert.deepEqual(updates.map(item => item.replayed).sort(), [false, true]);
    app.state = updates[0];
  }
  const restored = await (await fetch(`${second.origin}/api/bootstrap`, { headers: { Cookie: app.cookie } })).json();
  assert.equal(restored.booking.version, 2);
  assert.equal(restored.booking.retail.totalMinor, 54000);
  assert.equal(restored.simulation.operation.history.length, 7);
  assert.equal(restored.simulation.operation.refund.status, 'completed');
  const replay = await otherPost('/api/switches', body, { 'Idempotency-Key': idempotencyKey });
  assert.equal((await replay.json()).replayed, true);
});
