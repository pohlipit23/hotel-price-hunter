import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createSessionActions } from '../app/quotation-session-actions.mjs';
import { watchBinding } from '../app/public/booking-live-data.js';
import { altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';

const at = new Date('2026-10-20T00:00:00Z'), now = () => new Date(at);
const code = 'AIRB000180';
function fixture() {
  const bundle = altovoCatalogueFixture().entries[0].bundle;
  const watch = { code, revision: 1, contentVersion: bundle.snapshotVersion, dropSetVersion: 'test-capture-v1',
    currency: 'MYR', armedAt: at.toISOString(), minimumSavingMinor: 1000,
    firstCheck: { mode: 'captured-replay', status: 'completed', replayed: true, checkedAt: bundle.checkedAt,
      capturedAt: [bundle.checkedAt], replayedAt: at.toISOString(), thresholdMinor: 1000, dropOptionIds: bundle.options.map(option => option.optionId) } };
  bundle.dropSetVersion = watch.dropSetVersion;
  const session = { expiresAt: at.getTime() + 3600000, csrfToken: 'test-csrf', byCode: { [code]: { watch, confirmation: null } } };
  const args = { id: 'hashed-test-id', code, csrfToken: session.csrfToken, bundle,
    body: { snapshotVersion: bundle.snapshotVersion, watchBinding: watchBinding(watch), optionId: 'option-fixture-flex-premier', acceptedDemoOnly: true } };
  return { bundle, session, args };
}
function memory(session, { retry = false } = {}) {
  let state = structuredClone(session);
  return { get: () => structuredClone(state), update: async (id, change) => {
    if (retry) change(structuredClone(state));
    const next = change(structuredClone(state));
    if (next instanceof Promise) throw Error('Async transaction callback'); state = next;
  } };
}
test('session action adapter commits before reporting success and rolls back failed writes', async () => {
  const { session, args } = fixture(); const state = memory(session);
  const actions = createSessionActions({ update: state.update, now });
  const receipt = await actions.confirm(args);
  assert.equal(state.get().byCode[code].confirmation.selectionId, receipt.selectionId);
  assert.deepEqual(await actions.confirm(args), receipt);
  const failing = createSessionActions({ update: async (id, change) => { change(structuredClone(session)); throw Error('write unavailable'); }, now });
  await assert.rejects(failing.confirm(args), /write unavailable/);
  assert.equal(session.byCode[code].confirmation, null);
});
test('expiry, CSRF, revision, changed captures and current eligibility are revalidated inside the transaction', async () => {
  for (const mutate of [s => { s.expiresAt = at.getTime(); }, s => { s.csrfToken = 'different'; },
    s => { s.byCode[code].watch.revision++; }, s => { s.byCode[code].watch.dropSetVersion = 'changed'; },
    s => { s.byCode[code].watch = null; }]) {
    const { session, args } = fixture(); mutate(session); const state = memory(session);
    await assert.rejects(createSessionActions({ update: state.update, now }).confirm(args));
    assert.equal(state.get().byCode[code].confirmation, null);
  }
  const { session, args } = fixture(); session.expiresAt = Date.parse('2028-01-01');
  await assert.rejects(createSessionActions({ update: memory(session).update, now: () => new Date('2027-02-15') }).confirm(args), { code: 'WATCH_CANNOT_START' });
});
test('transaction retries never perform inference; late replies cannot replace newer selection/context', async () => {
  const { session, args } = fixture(); const state = memory(session, { retry: true });
  const actions = createSessionActions({ update: state.update, now });
  const chat = { ...args, body: { snapshotVersion: args.body.snapshotVersion, watchBinding: args.body.watchBinding, pageContext: 'drops-overview', intent: 'question', message: 'Compare flexibility' } };
  const first = await actions.reserve(chat); let calls = 0;
  const advice = await (async () => { calls++; return { reply: 'Injected response' }; })();
  await actions.merge({ ...chat, ticket: first, advice, chat: true }); assert.equal(calls, 1);
  const second = await actions.reserve(chat);
  await actions.confirm(args);
  await assert.rejects(actions.merge({ ...chat, ticket: second, advice, chat: true }), { code: 'DROPS_CHANGED' });
  assert.equal(state.get().byCode[code].chatHistory.length, 1);
  const older = await actions.reserve(chat); const newer = await actions.reserve(chat);
  await actions.merge({ ...chat, ticket: newer, advice, chat: true });
  await assert.rejects(actions.merge({ ...chat, ticket: older, advice, chat: true }), { code: 'DROPS_CHANGED' });
  await assert.rejects(actions.reserve(chat), { code: 'ADVICE_RATE_LIMIT' });
});
test('Firestore Part 2: independent clients serialize receipts/allowances and recover context across restart',
  { skip: process.env.RUN_ROOMDROP_PART2_FIRESTORE !== '1' }, async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-roomdrop-part2');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8281');
  const { Firestore } = await import('@google-cloud/firestore');
  const collection = 'roomdropPart2Test' + randomBytes(8).toString('hex');
  const create = () => new Firestore({ projectId: 'demo-roomdrop-part2', host: '127.0.0.1:8281', ssl: false });
  const first = create(), second = create(); let restored;
  const hash = token => createHash('sha256').update(token).digest('hex');
  const ids = [hash(randomBytes(32)), hash(randomBytes(32))];
  const { session, args } = fixture(); const code2 = 'PART2002';
  session.byCode[code2] = structuredClone(session.byCode[code]);
  const update = db => async (id, change) => db.runTransaction(async transaction => {
    const ref = db.collection(collection).doc(id), snapshot = await transaction.get(ref);
    const next = change(snapshot.exists ? snapshot.data() : null);
    assert.equal(next instanceof Promise, false); transaction.set(ref, next);
  });
  try {
    await Promise.all(ids.map(id => first.collection(collection).doc(id).create(session)));
    const a = createSessionActions({ update: update(first), now }), b = createSessionActions({ update: update(second), now });
    const bound = { ...args, id: ids[0] };
    const receipts = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? a : b).confirm(bound)));
    assert.equal(new Set(receipts.map(receipt => receipt.selectionId)).size, 1);
    const chat = { ...bound, body: { snapshotVersion: args.body.snapshotVersion, watchBinding: args.body.watchBinding,
      pageContext: 'drops-overview', intent: 'question', message: 'My plans may change' } };
    const ticket = await a.reserve(chat);
    let calls = 0; const advice = await (async () => { calls++; return { reply: 'Injected flexibility comparison' }; })();
    await b.merge({ ...chat, ticket, advice, chat: true }); assert.equal(calls, 1);
    await first.terminate(); restored = create();
    const saved = (await restored.collection(collection).doc(ids[0]).get()).data();
    assert.deepEqual(saved.byCode[code].confirmation, receipts[0]);
    assert.equal(saved.byCode[code].chatHistory[0].reply, advice.reply);
    assert.equal(saved.byCode[code2].confirmation, null); assert.equal(saved.byCode[code2].chatHistory, undefined);
    assert.equal((await second.collection(collection).doc(ids[1]).get()).data().byCode[code].confirmation, null);
    const allowances = await Promise.allSettled(Array.from({ length: 7 }, () => b.reserve(chat)));
    assert.equal(allowances.filter(item => item.status === 'fulfilled').length, 3);
    assert.ok(allowances.filter(item => item.status === 'rejected').every(item => item.reason.code === 'ADVICE_RATE_LIMIT'));
    const next = createSessionActions({ update: update(restored), now: () => new Date(at.getTime() + 60001) });
    for (let i = 0; i < 4; i++) { const ticket = await next.reserve(chat); await next.merge({ ...chat, ticket, advice, chat: true }); }
    assert.equal((await restored.collection(collection).doc(ids[0]).get()).data().byCode[code].chatHistory.length, 4);
    const reference = restored.collection(collection).doc(ids[0]);
    await reference.update({ [`byCode.${code}.watch.revision`]: 2 });
    await assert.rejects(next.confirm(bound), { code: 'DROPS_CHANGED' });
    assert.deepEqual((await reference.get()).data().byCode[code2], session.byCode[code2]);
  } finally {
    await Promise.all(ids.map(id => second.collection(collection).doc(id).delete()));
    await Promise.all([first.terminate(), second.terminate(), restored?.terminate()]);
  }
});
