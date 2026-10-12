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

test('Firestore integration: new clients see persisted state and concurrent updates remain atomic', { skip: !process.env.RUN_FIRESTORE_INTEGRATION }, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const first = await createStorage(process.env);
  const second = await createStorage(process.env);
  const id = `integration-${crypto.randomUUID()}`;
  try {
    await first.create(id, { revision: 0, preferences: { continueMonitoring: true }, selectedOfferId: 'equivalent' });
    assert.equal((await second.get(id)).selectedOfferId, 'equivalent');
    await Promise.all(Array.from({ length: 4 }, () => second.update(id, state => ({ ...state, revision: state.revision + 1 }))));
    assert.equal((await first.get(id)).revision, 4);
  } finally {
    await first.delete(id);
    await Promise.all([first.close(), second.close()]);
  }
});
