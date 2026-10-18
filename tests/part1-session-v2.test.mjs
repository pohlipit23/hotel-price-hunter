// Read-only compatibility proof against the committed Part 1 session module.
// Evaluate git-show bytes in memory; never copy, edit, merge or rebase Part 1 source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSessionActions, publicPostWatchState } from '../app/quotation-session-actions.mjs';
import { watchBinding } from '../app/public/booking-live-data.js';
import { altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';
import { publicQuotationDemo } from '../app/domain/quotation-demo.mjs';

const commit = '553593537b0e8741bfe877c2cf7ad911deff2dec';
const source = execFileSync('git', ['show', `${commit}:app/quotation-session-storage.mjs`], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
});
const actual = await import('data:text/javascript;base64,' + source.toString('base64'));
const code = 'AIRB000180', now = () => new Date('2026-10-20T00:00:00Z');
const bundle = { ...publicQuotationDemo(altovoCatalogueFixture().entries[0].bundle), dropSetVersion: 'd'.repeat(64) };
const versions = { contentVersion: bundle.snapshotVersion, dropSetVersion: bundle.dropSetVersion };
const watch = { code, revision: 1, ...versions, currency: 'MYR', armedAt: now().toISOString(), minimumSavingMinor: 1000,
  firstCheck: { mode: 'captured-replay', status: 'completed', replayed: true, checkedAt: bundle.checkedAt,
    capturedAt: [bundle.checkedAt], replayedAt: now().toISOString(), thresholdMinor: 1000, dropOptionIds: bundle.options.map(option => option.optionId) } };
async function seed(storage) {
  const visitor = await storage.create();
  // Only test setup seeds the documented receipt. This is not proof of the Part 1 arm operation.
  await storage.transact(visitor.cookieValue, session => { actual.codeScope(session, code, versions).watch = structuredClone(watch); });
  const args = { id: visitor.cookieValue, code, csrfToken: visitor.session.csrfToken, bundle,
    body: { snapshotVersion: bundle.snapshotVersion, watchBinding: watchBinding(watch), optionId: 'option-fixture-flex-premier', acceptedDemoOnly: true } };
  return { visitor, args };
}
test('actual Part 1 v2 memory store accepts Part 2 fields, preserves invariants and isolates judges', async () => {
  const storage = actual.createMemorySessionStorage({ environment: {}, now, catalogueCodes: [code] });
  const { visitor, args } = await seed(storage), actions = createSessionActions({ sessionStorage: storage, now });
  const receipt = await actions.confirm(args); assert.deepEqual(await actions.confirm(args), receipt);
  const chat = { ...args, body: { snapshotVersion: bundle.snapshotVersion, watchBinding: watchBinding(watch),
    pageContext: 'drops-overview', intent: 'question', message: 'My plans may change' } };
  const ticket = await actions.reserve(chat); await actions.merge({ ...chat, ticket, advice: { reply: 'Injected comparison' }, chat: true });
  const saved = await storage.get(visitor.cookieValue);
  assert.equal(saved.csrfToken, visitor.session.csrfToken); assert.equal(saved.expiresAt, visitor.session.expiresAt);
  assert.deepEqual(saved.byCode[code].watch, watch); assert.equal(saved.byCode[code].chatHistory.length, 1);
  const other = await storage.create(); assert.deepEqual((await storage.get(other.cookieValue)).byCode, {});
  for (const mutation of [session => { session.csrfToken = 'changed'; }, session => { session.expiresAt++; }, () => Promise.resolve('async')])
    await assert.rejects(storage.transact(visitor.cookieValue, mutation), { code: 'SESSION_STATE_INVALID' });
  await assert.rejects(storage.transact(visitor.cookieValue, session => { actual.codeScope(session, 'OUTSIDE1', versions); }), { code: 'BOOKING_UNAVAILABLE' });
  assert.deepEqual(await storage.get(visitor.cookieValue), saved);
  await storage.transact(visitor.cookieValue, session => { actual.codeScope(session, code, { ...versions, dropSetVersion: 'e'.repeat(64) }); });
  const changed = await storage.get(visitor.cookieValue);
  assert.equal(changed.byCode[code].watch, null);
  const projection = publicPostWatchState({ scope: changed.byCode[code], bundle });
  assert.equal(projection.confirmation, null); assert.deepEqual(projection.conversation.chatHistory, []);
});
test('actual Part 1 v2 Firestore store persists Part 2 actions and its dedicated TTL timestamp',
  { skip: process.env.RUN_ROOMDROP_PART2_FIRESTORE !== '1' }, async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-roomdrop-part2'); assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8281');
  const { Firestore } = await import('@google-cloud/firestore');
  const clients = [0, 1].map(() => new Firestore({ projectId: 'demo-roomdrop-part2', host: '127.0.0.1:8281', ssl: false }));
  const prefix = 'roomdropPart2V2' + randomBytes(8).toString('hex'), cookies = [];
  const make = firestore => actual.createFirestoreSessionStorage({ firestore, prefix, now, catalogueCodes: [code] });
  try {
    const first = make(clients[0]), second = make(clients[1]);
    const { visitor, args } = await seed(first); cookies.push(visitor.cookieValue);
    const a = createSessionActions({ sessionStorage: first, now }), b = createSessionActions({ sessionStorage: second, now });
    const receipts = await Promise.all([a.confirm(args), b.confirm(args)]); assert.deepEqual(receipts[0], receipts[1]);
    const chat = { ...args, body: { snapshotVersion: bundle.snapshotVersion, watchBinding: watchBinding(watch), pageContext: 'drops-overview', intent: 'opening' } };
    const ticket = await a.reserve(chat); await b.merge({ ...chat, ticket, advice: { reply: 'Injected durable response' }, chat: true });
    await clients[0].terminate();
    const restored = await second.get(visitor.cookieValue);
    assert.deepEqual(restored.byCode[code].confirmation, receipts[0]); assert.equal(restored.byCode[code].chatHistory[0].reply, 'Injected durable response');
    const id = createHash('sha256').update(visitor.cookieValue).digest('hex');
    const document = (await clients[1].collection(prefix + 'PublicSessionsV1').doc(id).get()).data();
    assert.equal(document.ttlAt.toMillis(), restored.expiresAt); assert.equal(restored.ttlAt, undefined);
    assert.deepEqual(restored.byCode[code].watch, watch);
    await assert.rejects(second.transact(visitor.cookieValue, session => { actual.codeScope(session, 'OUTSIDE1', versions); }), { code: 'BOOKING_UNAVAILABLE' });
    assert.deepEqual(await second.get(visitor.cookieValue), restored);
  } finally {
    for (const cookie of cookies) await clients[1].collection(prefix + 'PublicSessionsV1').doc(createHash('sha256').update(cookie).digest('hex')).delete();
    await clients[1].collection(prefix + 'PublicSessionsV1Capacity').doc('live').delete();
    await Promise.all(clients.map(client => client.terminate()));
  }
});
