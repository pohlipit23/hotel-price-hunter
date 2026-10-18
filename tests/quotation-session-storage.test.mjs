import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRoomdropFirestore } from '../app/booking-storage.mjs';
import { codeScope, createFirestoreSessionStorage, createMemorySessionStorage } from '../app/quotation-session-storage.mjs';

const SIAM = 'AIRB000180'; const HYATT = 'AIRB000179';
const V1 = { contentVersion: 'a'.repeat(64), dropSetVersion: 'b'.repeat(64) };
const V2 = { contentVersion: 'a'.repeat(64), dropSetVersion: 'c'.repeat(64) };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const armed = minimum => ({ revision: 1, minimumSavingMinor: minimum, armedAt: '2026-10-18T12:00:00.000Z',
  firstCheck: { mode: 'captured-replay', replayed: true, status: 'completed', dropOptionIds: ['option-a'] } });
// An injectable clock the test can move forward.
function clock(start = Date.parse('2026-10-18T12:00:00Z')) {
  let time = start; const now = () => new Date(time); now.advance = ms => { time += ms; }; return now;
}

test('codeScope creates an isolated entry and resets only the watch when booking or Drop-set versions change', () => {
  const session = { csrfToken: 'x', expiresAt: 1, byCode: {} };
  const entry = codeScope(session, SIAM, V1);
  assert.deepEqual(entry, { ...V1, watch: null });
  entry.watch = armed(1000); entry.confirmation = { optionId: 'option-a' };
  codeScope(session, HYATT, V1).watch = armed(2000);
  assert.equal(codeScope(session, SIAM, V1).watch.minimumSavingMinor, 1000);
  const changed = codeScope(session, SIAM, V2);
  assert.equal(changed.watch, null);
  assert.equal(changed.dropSetVersion, V2.dropSetVersion);
  // Part 2 fields are left for Part 2's own helper; the other code is untouched.
  assert.deepEqual(changed.confirmation, { optionId: 'option-a' });
  assert.equal(session.byCode[HYATT].watch.minimumSavingMinor, 2000);
  for (const code of ['airb000180', '../x', '', 'A'.repeat(21)]) assert.throws(() => codeScope(session, code, V1), { code: 'BOOKING_UNAVAILABLE' });
  assert.throws(() => codeScope(session, SIAM, { contentVersion: 'x', dropSetVersion: V1.dropSetVersion }), { code: 'SESSION_STATE_INVALID' });
});

test('memory session storage is refused in production and hosted environments', () => {
  for (const environment of [{ NODE_ENV: 'production' }, { K_SERVICE: 'svc' }, { CLOUD_RUN_JOB: 'job' }]) {
    assert.throws(() => createMemorySessionStorage({ environment }), /memory/i);
  }
});

// The shared contract both adapters satisfy. `make` returns a store for the given options.
function contract(name, make, options = {}) {
  test(`${name}: create, get and transact keep a hashed, expiring session`, options, async t => {
    const now = clock(); const store = await make(t, { now });
    const { cookieValue, session } = await store.create();
    assert.match(cookieValue, /^[a-f0-9]{64}$/);
    assert.match(session.csrfToken, /^[a-f0-9]{64}$/);
    assert.equal(session.expiresAt, now().getTime() + 3_600_000);
    assert.deepEqual(session.byCode, {});
    const result = await store.transact(cookieValue, current => { codeScope(current, SIAM, V1).watch = armed(1000); return 'committed'; });
    assert.equal(result, 'committed');
    assert.equal((await store.get(cookieValue)).byCode[SIAM].watch.minimumSavingMinor, 1000);
    for (const bad of [null, '', 'x', 'A'.repeat(64), 'f'.repeat(64)]) {
      assert.equal(await store.get(bad), null);
      await assert.rejects(store.transact(bad, () => 'x'), { code: 'DEMO_SESSION_REQUIRED' });
    }
    now.advance(3_600_000);
    assert.equal(await store.get(cookieValue), null);
    await assert.rejects(store.transact(cookieValue, () => 'x'), { code: 'DEMO_SESSION_REQUIRED' });
  });

  test(`${name}: refused or failed mutations commit nothing`, options, async t => {
    const store = await make(t, { catalogueCodes: [SIAM, HYATT] });
    const { cookieValue } = await store.create();
    await store.transact(cookieValue, session => { codeScope(session, SIAM, V1).watch = armed(1000); });
    const before = await store.get(cookieValue);
    await assert.rejects(store.transact(cookieValue, session => { codeScope(session, SIAM, V1).watch = armed(5000); throw Object.assign(new Error('stop'), { code: 'MINIMUM_SAVING_INVALID' }); }),
      { code: 'MINIMUM_SAVING_INVALID' });
    // No code outside the bounded catalogue can allocate state, even with a well-formed code.
    await assert.rejects(store.transact(cookieValue, session => { codeScope(session, 'AIRB999999', V1).watch = armed(1000); }), { code: 'BOOKING_UNAVAILABLE' });
    await assert.rejects(store.transact(cookieValue, session => { session.csrfToken = 'f'.repeat(64); }), { code: 'SESSION_STATE_INVALID' });
    await assert.rejects(store.transact(cookieValue, session => { session.expiresAt += 1; }), { code: 'SESSION_STATE_INVALID' });
    await assert.rejects(store.transact(cookieValue, async session => { session.byCode = {}; }), { code: 'SESSION_STATE_INVALID' });
    assert.deepEqual(await store.get(cookieValue), before);
  });

  test(`${name}: unknown Part 2 fields are preserved by Part 1 writes`, options, async t => {
    const store = await make(t, {});
    const { cookieValue } = await store.create();
    await store.transact(cookieValue, session => { session.adviceCount = 2; codeScope(session, SIAM, V1).confirmation = { optionId: 'option-a' }; });
    await store.transact(cookieValue, session => { codeScope(session, SIAM, V1).watch = armed(1500); });
    const session = await store.get(cookieValue);
    assert.equal(session.adviceCount, 2);
    assert.deepEqual(session.byCode[SIAM].confirmation, { optionId: 'option-a' });
    assert.equal(session.byCode[SIAM].watch.minimumSavingMinor, 1500);
  });

  test(`${name}: capacity is bounded and an expired session frees its place`, options, async t => {
    const now = clock(); const store = await make(t, { now, maxSessions: 2 });
    const first = await store.create(); await store.create();
    await assert.rejects(store.create(), { code: 'SESSION_CAPACITY' });
    now.advance(3_600_000);
    const replacement = await store.create();
    assert.notEqual(replacement.cookieValue, first.cookieValue);
    assert.equal(await store.get(first.cookieValue), null);
    assert.ok(await store.get(replacement.cookieValue));
  });
}

contract('memory', async (t, options) => createMemorySessionStorage({ environment: {}, ...options }));

// ---- Real Firestore emulator: independent clients, test-owned collections only. ----
const integration = { skip: !process.env.RUN_FIRESTORE_INTEGRATION };
async function emulator(t) {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const prefix = `test-${randomUUID()}-roomdrop`; const clients = [];
  const client = async () => { const firestore = await createRoomdropFirestore(process.env); clients.push(firestore); return firestore; };
  const admin = await client();
  t.after(async () => {
    for (const name of [`${prefix}PublicSessionsV1`, `${prefix}PublicSessionsV1Capacity`]) await admin.recursiveDelete(admin.collection(name));
    await Promise.all(clients.map(firestore => firestore.terminate().catch(() => {})));
  });
  return { prefix, admin, client, store: async (options = {}) => createFirestoreSessionStorage({ firestore: await client(), prefix, ...options }) };
}
contract('Firestore', async (t, options) => (await emulator(t)).store(options), integration);

test('Firestore: a session survives a restart and stores only the cookie digest', integration, async t => {
  const { store, admin, prefix } = await emulator(t);
  const before = await store();
  const { cookieValue, session } = await before.create();
  await before.transact(cookieValue, current => { codeScope(current, SIAM, V1).watch = armed(1000); });
  const document = await admin.collection(`${prefix}PublicSessionsV1`).doc(sha256(cookieValue)).get();
  assert.ok(document.exists);
  assert.doesNotMatch(JSON.stringify(document.data()), new RegExp(cookieValue));
  const after = await store();
  const restored = await after.get(cookieValue);
  assert.equal(restored.csrfToken, session.csrfToken);
  assert.equal(restored.byCode[SIAM].watch.minimumSavingMinor, 1000);
});

test('Firestore: two judges on one code and one judge on two codes stay isolated under concurrent writes', integration, async t => {
  const { store } = await emulator(t);
  const [a, b] = [await store(), await store()];
  const judgeOne = await a.create(); const judgeTwo = await b.create();
  await Promise.all([
    a.transact(judgeOne.cookieValue, session => { codeScope(session, SIAM, V1).watch = armed(1000); }),
    b.transact(judgeTwo.cookieValue, session => { codeScope(session, SIAM, V1).watch = armed(9000); }),
    b.transact(judgeOne.cookieValue, session => { codeScope(session, HYATT, V1).watch = armed(3000); }),
  ]);
  const one = await b.get(judgeOne.cookieValue); const two = await a.get(judgeTwo.cookieValue);
  assert.deepEqual([one.byCode[SIAM].watch.minimumSavingMinor, one.byCode[HYATT].watch.minimumSavingMinor], [1000, 3000]);
  assert.deepEqual(Object.keys(two.byCode), [SIAM]);
  assert.equal(two.byCode[SIAM].watch.minimumSavingMinor, 9000);
  assert.notEqual(one.csrfToken, two.csrfToken);
  // A new Drop-set version invalidates only that code's watch for that judge.
  await a.transact(judgeOne.cookieValue, session => { codeScope(session, SIAM, V2); });
  const invalidated = await b.get(judgeOne.cookieValue);
  assert.equal(invalidated.byCode[SIAM].watch, null);
  assert.equal(invalidated.byCode[HYATT].watch.minimumSavingMinor, 3000);
  assert.equal((await b.get(judgeTwo.cookieValue)).byCode[SIAM].watch.minimumSavingMinor, 9000);
});

test('Firestore: concurrent creates from two clients never exceed capacity', integration, async t => {
  const { store } = await emulator(t);
  const [a, b] = [await store({ maxSessions: 4 }), await store({ maxSessions: 4 })];
  const outcomes = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => (index % 2 ? a : b).create()));
  const created = outcomes.filter(outcome => outcome.status === 'fulfilled');
  assert.equal(created.length, 4);
  assert.ok(outcomes.filter(outcome => outcome.status === 'rejected').every(outcome => outcome.reason.code === 'SESSION_CAPACITY'));
  for (const { value } of created) assert.ok(await a.get(value.cookieValue));
});

test('Firestore: the default capacity is 64 live sessions', integration, async t => {
  const { store } = await emulator(t);
  const a = await store(); const b = await store();
  for (let index = 0; index < 64; index++) await (index % 2 ? a : b).create();
  await assert.rejects(b.create(), { code: 'SESSION_CAPACITY' });
});

// A database that is reachable in name only: every read, write and transaction is refused.
// (A terminated SDK client cannot be used here because it also raises unhandled rejections.)
function unreachableDatabase() {
  const refused = async () => { throw Object.assign(new Error('14 UNAVAILABLE: connection refused'), { code: 14 }); };
  const reference = { get: refused, set: refused, create: refused, collection: () => collection };
  const collection = { doc: () => reference };
  return { collection: () => collection, runTransaction: refused, getAll: refused };
}

test('storage failures surface as STORAGE_UNAVAILABLE and never fall back to memory', async () => {
  const store = createFirestoreSessionStorage({ firestore: unreachableDatabase() });
  await assert.rejects(store.create(), { code: 'STORAGE_UNAVAILABLE' });
  await assert.rejects(store.get('a'.repeat(64)), { code: 'STORAGE_UNAVAILABLE' });
  await assert.rejects(store.transact('a'.repeat(64), () => 'x'), { code: 'STORAGE_UNAVAILABLE' });
  assert.equal(store.mode, 'firestore');
});
