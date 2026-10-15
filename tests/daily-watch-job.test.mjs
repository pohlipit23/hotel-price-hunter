import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createTestMemoryStorage, FirestoreStorage } from '../app/storage.mjs';
import { initialiseSimulation } from '../app/domain/simulation.mjs';
import { changePriceWatch, priceWatchView, watchAliases } from '../app/domain/price-watch.mjs';
import { runPriceWatchJob, startPriceWatchJob, validateJobEnvironment } from '../scripts/run-price-watch-job.mjs';
import { startPriceWatchWorker } from '../scripts/run-price-watch.mjs';

const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
const day = '2026-10-16T03:00:00Z';
const now = () => new Date(day);
const valid = { NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: 'sincere-apex-511418-p0', CLOUD_RUN_JOB: 'roomdrop-price-watch', PRICE_WATCH_JOB_ENABLED: 'true', PRICE_WATCH_PROVIDER_MODE: 'simulated-fixture' };
function watched(index) {
  const id = `private-visitor-${index}`;
  const source = initialiseSimulation({ scenarioId: fixture.scenarioId, demoNow: fixture.demoNow, preferences: structuredClone(fixture.preferences), enrolled: false, permissionRecord: null, revision: 0, expiresAt: '2026-11-14T03:00:00Z' }, fixture);
  const intent = priceWatchView(source, { visitorId: id, recordedAt: '2026-10-15T03:00:00Z' }).consentIntents.enable;
  const aliases = { ...watchAliases(), watchId: index.toString(16).padStart(64, '0') };
  return { id, state: changePriceWatch(source, { ...intent, visitorId: id, fixture, recordedAt: '2026-10-15T03:00:00Z', aliases }).state };
}
async function populate(storage, count) { for (let i = 1; i <= count; i++) { const item = watched(i); await storage.create(item.id, item.state); } }
const run = (storage, extra = {}) => runPriceWatchJob({ storage, fixture, now, ...extra });

test('job activation rejects defaults and every invalid environment before creating storage', async () => {
  assert.doesNotThrow(() => validateJobEnvironment(valid, []));
  const invalid = [{}, ...Object.keys(valid).map(key => ({ ...valid, [key]: '' })),
    ...[{ K_SERVICE: 'service' }, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' }, { GOOGLE_APPLICATION_CREDENTIALS: 'never-read.json' }, { GEMINI_MODEL: 'forbidden' }, { GEMINI_API_KEY: 'private' }, { OPENAI_API_KEY: 'private' }, { STORAGE_MODE: 'memory' }, { PRICE_WATCH_FIXTURE_OUTCOME: 'failed' }].map(value => ({ ...valid, ...value }))];
  let created = 0;
  for (const environment of invalid) await assert.rejects(startPriceWatchJob(environment, [], { storageFactory: async () => { created++; } }));
  for (const args of [['--once'], ['--loop'], ['unexpected']]) assert.throws(() => validateJobEnvironment(valid, args));
  assert.equal(created, 0);
});
test('private checkpoint revisions compare atomically and survive worker instances', async () => {
  const storage = createTestMemoryStorage();
  assert.deepEqual(await storage.getWatchCheckpoint(), { revision: 0, after: null });
  const after = '1'.repeat(64);
  const results = await Promise.allSettled([storage.compareAndSetWatchCheckpoint({ revision: 0, after }), storage.compareAndSetWatchCheckpoint({ revision: 0, after: null })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CHECKPOINT_CONFLICT');
  assert.deepEqual(await storage.getWatchCheckpoint(), { revision: 1, after });
  await assert.rejects(storage.compareAndSetWatchCheckpoint({ revision: 1, after: 'invalid' }));
});
test('job caps ten pages, resumes beyond 500 entries, resets at end and deduplicates restarts and days', async () => {
  const storage = createTestMemoryStorage();
  // Most indexed visitors are stopped: pagination is independent of eligibility.
  for (let i = 1; i <= 501; i++) await storage.create(`private-${i}`, { scenarioId: 'jury-booking', priceWatch: { enabled: false, watchId: i.toString(16).padStart(64, '0') } });
  const first = await run(storage); assert.equal(first.examined, 500); assert.equal(first.pages, 10); assert.equal(first.reason, 'PAGE_LIMIT');
  assert.equal((await storage.getWatchCheckpoint()).after, (500).toString(16).padStart(64, '0'));
  const second = await run(storage); assert.equal(second.examined, 1); assert.equal(second.reason, 'SWEEP_COMPLETED');
  assert.equal((await storage.getWatchCheckpoint()).after, null);
  const active = createTestMemoryStorage(); await populate(active, 1);
  assert.equal((await run(active)).counts.recorded, 1); const saved = await active.get('private-visitor-1');
  assert.equal((await run(active)).counts.replayed, 1); assert.deepEqual(await active.get('private-visitor-1'), saved);
  assert.equal((await run(active, { now: () => new Date('2026-10-17T03:00:00Z') })).counts.recorded, 1);
});
test('exactly 500 indexed locators complete every day without an empty alternating execution', async () => {
  const storage = createTestMemoryStorage();
  for (let i = 1; i <= 500; i++) await storage.create(`private-${i}`, i === 1 ? watched(i).state : {
    scenarioId: 'jury-booking', priceWatch: { enabled: false, watchId: i.toString(16).padStart(64, '0') },
  });
  for (const date of ['2026-10-16T03:00:00Z', '2026-10-17T03:00:00Z', '2026-10-18T03:00:00Z']) {
    const result = await run(storage, { now: () => new Date(date) });
    assert.equal(result.examined, 500); assert.equal(result.pages, 10); assert.equal(result.reason, 'SWEEP_COMPLETED');
    assert.equal(result.counts.recorded, 1); assert.equal((await storage.getWatchCheckpoint()).after, null);
  }
  assert.equal(Object.keys((await storage.get('private-1')).priceWatch.runs).length, 4);
});
test('a failed final-page tail probe cannot checkpoint past that page', async () => {
  const storage = createTestMemoryStorage();
  for (let i = 1; i <= 500; i++) await storage.create(`private-${i}`, {
    scenarioId: 'jury-booking', priceWatch: { enabled: false, watchId: i.toString(16).padStart(64, '0') },
  });
  const queried = [];
  const failingProbe = { ...storage, listWatches: async options => {
    queried.push(options.limit);
    if (options.limit === 1) throw new Error('private tail failure');
    return storage.listWatches(options);
  } };
  const result = await run(failingProbe);
  assert.equal(result.ok, false); assert.equal(result.reason, 'STORAGE_UNAVAILABLE');
  assert.equal(result.pages, 9); assert.equal(result.examined, 500);
  assert.deepEqual(queried, [...Array(10).fill(50), 1]);
  assert.deepEqual(await storage.getWatchCheckpoint(), { revision: 9, after: (450).toString(16).padStart(64, '0') });
  const retry = await run(storage); assert.equal(retry.ok, true); assert.equal(retry.examined, 50);
  assert.equal((await storage.getWatchCheckpoint()).after, null);
});
test('transient failure leaves page checkpoint untouched; replay keeps saved checks and previews', async () => {
  const storage = createTestMemoryStorage(); await populate(storage, 2); let failed = false;
  const broken = { ...storage, update: async (id, change) => { if (!failed && id === 'private-visitor-2') { failed = true; throw new Error('private credentials'); } return storage.update(id, change); } };
  const first = await run(broken); assert.equal(first.ok, false); assert.equal(first.reason, 'STORAGE_UNAVAILABLE');
  assert.deepEqual(await storage.getWatchCheckpoint(), { revision: 0, after: null });
  const saved = await storage.get('private-visitor-1');
  const retry = await run(storage); assert.equal(retry.counts.replayed, 1); assert.equal(retry.counts.recorded, 1);
  assert.deepEqual(await storage.get('private-visitor-1'), saved);
});
test('checkpoint conflict, checkpoint failure and discovery failure stop safely without leaking details', async () => {
  for (const method of ['compareAndSetWatchCheckpoint', 'getWatchCheckpoint', 'listWatches']) {
    const storage = createTestMemoryStorage(); await populate(storage, 1);
    const result = await run({ ...storage, [method]: async () => { const error = new Error('private-visitor secret token'); if (method === 'compareAndSetWatchCheckpoint') error.code = 'CHECKPOINT_CONFLICT'; throw error; } });
    assert.equal(result.ok, false); assert.doesNotMatch(JSON.stringify(result), /private-visitor|secret|token|watchId|after/);
    assert.equal((await storage.getWatchCheckpoint()).revision, 0);
  }
});
test('interruption and elapsed bound retry a partial page without advancing checkpoint', async () => {
  for (const mode of ['signal', 'time']) {
    const storage = createTestMemoryStorage(); await populate(storage, 2); let stop = false; let elapsed = 0;
    const wrapped = { ...storage, update: async (...args) => { const value = await storage.update(...args); stop = true; elapsed = 270000; return value; } };
    const result = await run(wrapped, { shouldStop: () => mode === 'signal' && stop, monotonic: () => mode === 'time' ? elapsed : 0 });
    assert.equal(result.ok, false); assert.equal(result.reason, mode === 'signal' ? 'INTERRUPTED' : 'TIME_LIMIT');
    assert.deepEqual(await storage.getWatchCheckpoint(), { revision: 0, after: null });
    const retry = await run(storage); assert.equal(retry.counts.replayed, 1); assert.equal(retry.counts.recorded, 1);
  }
});
test('job retains terminal provider failures and capacity; commit guards suppress consent and expiry races', async () => {
  const storage = createTestMemoryStorage(); await populate(storage, 1);
  const failure = await run(storage, { provider: () => ({ status: 'failed', reason: 'PROVIDER_FAILED' }) });
  assert.equal(failure.ok, true); assert.equal(failure.counts.failed, 1);
  const saved = await storage.get('private-visitor-1'); assert.equal((await run(storage)).counts.replayed, 1); assert.deepEqual(await storage.get('private-visitor-1'), saved);
  for (const mutate of [state => { state.priceWatch.enabled = false; state.priceWatch.version++; }, state => { state.expiresAt = day; }]) {
    const base = createTestMemoryStorage(); await populate(base, 1); let raced = false;
    const wrapper = { ...base, update: async (id, change) => { if (!raced) { raced = true; await base.update(id, state => { mutate(state); return state; }); } return base.update(id, change); } };
    const result = await run(wrapper); assert.equal(result.counts.skipped, 1); assert.deepEqual((await base.get('private-visitor-1')).priceWatch.lastCheck.checkOffers, []);
  }
  const base = createTestMemoryStorage(); await populate(base, 1);
  const capacity = await run({ ...base, update: async () => { const error = new Error('capacity'); error.code = 'WATCH_CAPACITY_REACHED'; throw error; } });
  assert.equal(capacity.ok, true); assert.equal(capacity.counts.capacity, 1); assert.equal((await base.getWatchCheckpoint()).revision, 1);
});
test('entrypoint handles termination, closes storage and emits aggregate safe diagnostics', async () => {
  const storage = createTestMemoryStorage(); await populate(storage, 2); const signals = new EventEmitter(); const logs = []; let closed = 0;
  const wrapped = { ...storage, update: async (...args) => { const value = await storage.update(...args); signals.emit('SIGTERM'); return value; }, close: async () => { closed++; } };
  const result = await startPriceWatchJob(valid, [], { storageFactory: async () => wrapped, fixture, now, signals, log: value => logs.push(value) });
  assert.equal(result.ok, false); assert.equal(closed, 1); assert.equal(signals.listenerCount('SIGTERM'), 0); assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(logs.length, 1); assert.doesNotMatch(JSON.stringify(logs), /private|visitor|watchId|runId|after/);
});
test('local worker reports transient run-once failure truthfully and closes storage', async () => {
  const logs = []; let closed = 0;
  const storage = { listWatches: async () => { throw new Error('private token'); }, close: async () => { closed++; } };
  await assert.rejects(startPriceWatchWorker({ GOOGLE_CLOUD_PROJECT: 'demo-roomdrop-iap-qa', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' }, ['--once'], {
    storageFactory: async () => storage, fixture, signals: new EventEmitter(), log: value => logs.push(value),
  }));
  assert.equal(closed, 1); assert.equal(logs[0].stage, 'watch-pass-failed'); assert.equal(logs[0].reason, 'STORAGE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(logs), /private|token|watchId|after/);
});
test('Firestore emulator checkpoint transactions serialize overlap and retain failed-page replay', { skip: !process.env.RUN_FIRESTORE_INTEGRATION }, async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-roomdrop-iap-qa'); assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8081');
  const { Firestore } = await import('@google-cloud/firestore'); const collection = `dailyJobTest${crypto.randomUUID().replaceAll('-', '')}`;
  const make = () => new FirestoreStorage(new Firestore({ projectId: 'demo-roomdrop-iap-qa', host: '127.0.0.1:8081', ssl: false }), { collection, emulator: true });
  const a = make(); const b = make();
  try {
    const comparisons = await Promise.allSettled([a.compareAndSetWatchCheckpoint({ revision: 0, after: null }), b.compareAndSetWatchCheckpoint({ revision: 0, after: null })]);
    assert.equal(comparisons.filter(item => item.status === 'fulfilled').length, 1); assert.equal(comparisons.find(item => item.status === 'rejected').reason.code, 'CHECKPOINT_CONFLICT');
    assert.equal((await b.getWatchCheckpoint()).revision, 1); await populate(a, 2);
    const failed = await run({ ...a, getWatchCheckpoint: a.getWatchCheckpoint.bind(a), listWatches: a.listWatches.bind(a), update: async (id, change) => { if (id === 'private-visitor-2') throw new Error('transient'); return a.update(id, change); }, compareAndSetWatchCheckpoint: a.compareAndSetWatchCheckpoint.bind(a) });
    assert.equal(failed.ok, false); assert.equal((await b.getWatchCheckpoint()).revision, 1);
    const saved = await a.get('private-visitor-1'); const retry = await run(b); assert.equal(retry.counts.replayed, 1); assert.equal(retry.counts.recorded, 1); assert.deepEqual(await a.get('private-visitor-1'), saved);
    const concurrent = await Promise.all([run(a), run(b)]); assert.ok(concurrent.some(result => result.ok));
    assert.equal(Object.keys((await a.get('private-visitor-1')).priceWatch.runs).length, 2);
  } finally {
    await Promise.all([a.delete('private-visitor-1'), a.delete('private-visitor-2')]); await a.watchJobs.doc('daily-v1').delete(); await Promise.all([a.close(), b.close()]);
  }
});
