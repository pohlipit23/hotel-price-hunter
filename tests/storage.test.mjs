import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestMemoryStorage, createStorage } from '../app/storage.mjs';

test('test storage preserves isolated snapshots and applies concurrent updates atomically', async () => {
  const storage = createTestMemoryStorage();
  await storage.create('visitor-a', { revision: 0, preferences: { continueMonitoring: true } });
  const snapshot = await storage.get('visitor-a');
  snapshot.preferences.continueMonitoring = false;
  assert.equal((await storage.get('visitor-a')).preferences.continueMonitoring, true);
  await Promise.all(Array.from({ length: 12 }, () => storage.update('visitor-a', state => ({ ...state, revision: state.revision + 1 }))));
  assert.equal((await storage.get('visitor-a')).revision, 12);
  assert.equal(await storage.get('visitor-b'), null);
});

test('create cannot overwrite an existing visitor and failed update preserves preferences', async () => {
  const storage = createTestMemoryStorage();
  await storage.create('visitor-a', { revision: 1, enrolled: true });
  await assert.rejects(storage.create('visitor-a', { revision: 0 }), { code: 'ALREADY_EXISTS' });
  await assert.rejects(storage.update('visitor-a', () => { throw new Error('invalid'); }), /invalid/);
  assert.deepEqual(await storage.get('visitor-a'), { revision: 1, enrolled: true });
});

test('runtime storage fails closed without project configuration and refuses memory mode', async () => {
  await assert.rejects(createStorage({}), /GOOGLE_CLOUD_PROJECT/);
  await assert.rejects(createStorage({ STORAGE_MODE: 'memory', GOOGLE_CLOUD_PROJECT: 'demo-hotel-price-hunter' }), /memory/i);
});

test('emulator configuration is explicit and local only', async () => {
  await assert.rejects(createStorage({ GOOGLE_CLOUD_PROJECT: 'demo-hotel-price-hunter', FIRESTORE_EMULATOR_HOST: 'example.com:8080' }), /loopback/);
  await assert.rejects(createStorage({ GOOGLE_CLOUD_PROJECT: 'demo-hotel-price-hunter', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', K_SERVICE: 'cloud-run' }), /Cloud Run/);
});

test('agency index exposes only new indexed operations and keeps case lookups separate from visitor credentials', async () => {
  const storage = createTestMemoryStorage();
  const caseId = 'case-' + 'a'.repeat(64);
  await storage.create('private-visitor-credential', { scenarioId: 'jury-booking', operations: { historical: { stage: 'ready' } } });
  assert.deepEqual(await storage.listCases({ limit: 20 }), []);
  await storage.update('private-visitor-credential', state => ({ ...state, operations: { ...state.operations, current: { agencyCaseId: caseId, stage: 'ready', isSimulated: true } } }));
  const cases = await storage.listCases({ limit: 20 });
  assert.equal(cases.length, 1);
  assert.equal(cases[0].caseId, caseId);
  assert.equal((await storage.getCase(caseId)).operation.stage, 'ready');
  assert.equal(await storage.getCase('private-visitor-credential'), null);
  await storage.update('private-visitor-credential', state => { state.operations.current.stage = 'revalidated'; return state; });
  assert.equal((await storage.getCase(caseId)).operation.stage, 'revalidated');
  assert.deepEqual(await storage.listCases({ limit: 20, after: caseId }), []);
  await assert.rejects(storage.update('private-visitor-credential', () => { throw new Error('reject'); }));
  assert.equal((await storage.listCases({ limit: 20 })).length, 1);
  await storage.update('private-visitor-credential', state => { state.operations.mutated = { agencyCaseId: 'case-' + 'b'.repeat(64), stage: 'ready', isSimulated: true }; return state; });
  assert.equal((await storage.listCases({ limit: 1 })).length, 1);
  assert.equal((await storage.listCases({ limit: 20 })).length, 2);
  await storage.create('another-visitor', { scenarioId: 'jury-booking', operations: {} });
  await assert.rejects(storage.update('another-visitor', state => ({ ...state, operations: { collision: { agencyCaseId: caseId, stage: 'ready', isSimulated: true } } })), { code: 'ALREADY_EXISTS' });
  assert.deepEqual((await storage.get('another-visitor')).operations, {});
  await storage.create('private-other-scenario', { scenarioId: 'private-booking', operations: {} });
  await storage.update('private-other-scenario', state => ({ ...state, operations: { current: { agencyCaseId: 'case-' + 'c'.repeat(64), isSimulated: true } } }));
  assert.equal((await storage.listCases({ limit: 20 })).length, 2);
});
test('private watch index is atomic, bounded, stable through stop and removed on session deletion', async () => {
  const storage = createTestMemoryStorage(); const watchId = '1'.repeat(64);
  await storage.create('private-watch-visitor', { scenarioId: 'jury-booking', revision: 0 });
  assert.deepEqual(await storage.listWatches({ limit: 50 }), []);
  await assert.rejects(storage.update('private-watch-visitor', state => { state.priceWatch = { watchId, enabled: true }; throw new Error('abort'); }));
  assert.deepEqual(await storage.listWatches({ limit: 50 }), []);
  await storage.update('private-watch-visitor', state => ({ ...state, priceWatch: { watchId, enabled: true } }));
  assert.equal((await storage.listWatches({ limit: 1 }))[0].state.priceWatch.enabled, true);
  await storage.update('private-watch-visitor', state => { state.priceWatch.enabled = false; return state; });
  assert.equal((await storage.listWatches({ limit: 1 }))[0].state.priceWatch.enabled, false);
  assert.deepEqual(await storage.listWatches({ limit: 1, after: watchId }), []);
  for (const limit of [0, 51, -1, 1.5]) await assert.rejects(storage.listWatches({ limit }));
  await storage.create('other-private-visitor', { scenarioId: 'jury-booking' });
  await assert.rejects(storage.update('other-private-visitor', state => ({ ...state, priceWatch: { watchId, enabled: true } })), { code: 'ALREADY_EXISTS' });
  assert.equal((await storage.get('other-private-visitor')).priceWatch, undefined);
  await storage.delete('private-watch-visitor'); assert.deepEqual(await storage.listWatches({ limit: 50 }), []);
});

test('Firestore integration: new clients see persisted state and concurrent updates remain atomic', { skip: !process.env.RUN_FIRESTORE_INTEGRATION }, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const first = await createStorage(process.env);
  const second = await createStorage(process.env);
  const id = `integration-${crypto.randomUUID()}`;
  try {
    await first.create(id, { scenarioId: 'jury-booking', revision: 0, preferences: { continueMonitoring: true }, selectedOfferId: 'equivalent' });
    assert.equal((await second.get(id)).selectedOfferId, 'equivalent');
    await Promise.all(Array.from({ length: 4 }, () => second.update(id, state => ({ ...state, revision: state.revision + 1 }))));
    assert.equal((await first.get(id)).revision, 4);
    const caseId = 'case-' + crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    await Promise.all(Array.from({ length: 4 }, () => second.update(id, state => ({ ...state, revision: state.revision + 1,
      operations: { current: { agencyCaseId: caseId, stage: 'ready', isSimulated: true } } }))));
    assert.equal((await first.get(id)).revision, 8);
    assert.equal((await first.getCase(caseId)).operation.stage, 'ready');
    assert.equal((await first.listCases({ limit: 50 })).filter(item => item.caseId === caseId).length, 1);
    await second.update(id, state => { state.operations.current.stage = 'revalidated'; return state; });
    assert.equal((await first.getCase(caseId)).operation.stage, 'revalidated');
  } finally {
    await first.delete(id);
    await Promise.all([first.close(), second.close()]);
  }
});
