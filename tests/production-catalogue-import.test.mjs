import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../scripts/import-altovo-catalogue.mjs';

const project = 'sincere-apex-511418-p0';
const input = '--catalogue=tests/fixtures/curated-bookings.json';
const production = ['--production', `--project=${project}`, `--confirm-project=${project}`, '--database=(default)'];

// Transaction boundary only: no credentials or network, and no update/set/delete API exists.
function database() {
  const records = new Map(); let creates = 0; let closed = 0;
  const ref = path => ({ path, doc: id => ref(`${path}/${id}`), collection: id => ref(`${path}/${id}`),
    orderBy: () => ref(path), limit: () => ref(path) });
  const snapshot = reference => ({ exists: records.has(reference.path), data: () => structuredClone(records.get(reference.path)) });
  return { records, get creates() { return creates; }, get closed() { return closed; },
    collection: name => ref(name), terminate: async () => { closed++; },
    runTransaction: async callback => {
      const pending = [];
      const result = await callback({
        get: async reference => reference.path.endsWith('/dropSets')
          ? { docs: [...records].filter(([path]) => path.startsWith(reference.path + '/')).map(([, data]) => ({ data: () => data })) }
          : snapshot(reference),
        getAll: async (...references) => references.map(snapshot),
        create: (reference, data) => { assert.equal(records.has(reference.path), false); pending.push([reference.path, structuredClone(data)]); },
      });
      for (const [path, data] of pending) { records.set(path, data); creates++; }
      return result;
    },
  };
}

test('production confirmation defaults to offline validation and creates no client', async () => {
  const report = await main([input, ...production], { env: {}, createFirestore: () => assert.fail('dry run opened Firestore') });
  assert.equal(report.status, 'validated', report.reason);
  assert.equal(report.mode, 'dry-run');
});

test('production import creates immutable records and identical retry writes nothing', async () => {
  const firestore = database(); const environments = [];
  const run = () => main([input, ...production, '--execute'], { env: {}, createFirestore: async env => { environments.push(env); return firestore; } });
  const first = await run();
  assert.deepEqual([first.mode, first.status, first.project], ['production-import', 'imported', project], first.reason);
  assert.deepEqual(first.entries.map(entry => entry.result), ['created', 'created']);
  assert.ok(firestore.creates > 2);
  const saved = structuredClone([...firestore.records]); const creates = firestore.creates;
  const retry = await run();
  assert.deepEqual(retry.entries.map(entry => entry.result), ['unchanged', 'unchanged']);
  assert.equal(firestore.creates, creates); assert.deepEqual([...firestore.records], saved);
  assert.deepEqual(environments, [{ GOOGLE_CLOUD_PROJECT: project }, { GOOGLE_CLOUD_PROJECT: project }]);
  assert.equal(firestore.closed, 2);
  firestore.records.values().next().value.card.title = 'changed existing record';
  const conflict = await run();
  assert.equal(conflict.reason, 'BOOKING_CHANGED'); assert.equal(firestore.creates, creates);
});

test('production guard refuses incomplete, ambiguous or redirected targets before opening a client', async () => {
  const replace = (flag, value) => production.map(arg => arg.startsWith(flag) ? flag + value : arg);
  const cases = [
    [production.filter(arg => arg !== '--production'), {}],
    [production.filter(arg => !arg.startsWith('--confirm-project=')), {}],
    [replace('--confirm-project=', 'another-project'), {}],
    [replace('--project=', 'another-project'), {}],
    [replace('--database=', 'another-database'), {}],
    [[...production, '--emulator=127.0.0.1:8281'], {}],
    [production, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8281' }],
    [production, { GOOGLE_CLOUD_PROJECT: 'another-project' }],
    [production, { GCLOUD_PROJECT: 'another-project' }],
    [production, { K_SERVICE: 'hotel-price-hunter' }],
    [production, { CLOUD_RUN_JOB: 'import-job' }],
    [[...production, '--force'], {}],
    [[...production, '--overwrite'], {}],
    [[...production, '--execute=false'], {}],
    [[...production, '--production'], {}],
  ];
  for (const [flags, env] of cases) {
    let calls = 0;
    const report = await main([input, ...flags, '--execute'], { env, createFirestore: async () => { calls++; throw Error('client must not open'); } });
    assert.equal(report.status, 'blocked', flags.join(' ')); assert.equal(calls, 0);
  }
});

test('production refuses an alternate namespace and ambient emulator even with injected clean env', async () => {
  const options = { env: {}, createFirestore: async () => assert.fail('guard opened a client') };
  const custom = await main([input, ...production, '--execute'], { ...options, prefix: 'other' });
  assert.equal(custom.reason, 'PRODUCTION_TARGET_REFUSED');
  const saved = process.env.FIRESTORE_EMULATOR_HOST;
  try {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8281';
    const report = await main([input, ...production, '--execute'], options);
    assert.equal(report.reason, 'PRODUCTION_TARGET_REFUSED');
  } finally {
    if (saved === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = saved;
  }
});
