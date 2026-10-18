import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { altovoCatalogueFixture } from './fixtures/altovo-catalogue.mjs';

const code = 'AIRB000180';
async function app(t, advisor) {
  let clock = new Date('2026-10-20T00:00:00Z');
  const server = createBookingDemoServer({ catalogue: altovoCatalogueFixture(), advisor, now: () => clock });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + '/api/booking-demo/q/' + code);
  const cookie = response.headers.get('set-cookie').split(';')[0]; const data = await response.json();
  let watch = null;
  const post = (action, body) => fetch(origin + '/api/booking-demo/q/' + code + '/' + action, { method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': data.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotVersion: data.snapshotVersion, ...(action === 'watch' ? { expectedRevision: watch?.revision ?? 0 } : watch ? { watchBinding: JSON.stringify(watch) } : {}), ...body }) });
  const arm = async minimumSavingMinor => (watch = (await (await post('watch', { consent: true, minimumSavingMinor })).json()).watch);
  return { post, arm, setTime: at => { clock = new Date(at); } };
}
const selection = { optionId: 'option-fixture-flex-premier', acceptedDemoOnly: true };
test('catalogue advice and chat require a committed watch before any inference', async t => {
  let calls = 0;
  const a = await app(t, { available: true, status: 'test-injected', chat: async () => { calls++; return { reply: 'Test' }; } });
  const response = await a.post('chat', { pageContext: 'drops-overview', intent: 'opening' });
  assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'WATCH_NOT_ARMED'); assert.equal(calls, 0);
});
test('same-Drop concurrent selection retries share one receipt; a rearm cannot restore an older receipt', async t => {
  const a = await app(t); const watch = await a.arm(1000);
  const receipts = await Promise.all(Array.from({ length: 6 }, async () => (await (await a.post('confirm', selection)).json()).confirmation));
  assert.equal(new Set(receipts.map(receipt => receipt.selectionId)).size, 1);
  const next = await a.arm(5000);
  const stale = await a.post('confirm', { ...selection, watchBinding: JSON.stringify(watch) });
  assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, 'DROPS_CHANGED');
  const response = await a.post('confirm', { ...selection, watchBinding: JSON.stringify(next) });
  assert.equal(response.status, 200); assert.notEqual((await response.json()).confirmation.selectionId, receipts[0].selectionId);
  a.setTime('2027-02-15T00:00:00Z');
  // A fresh visitor is needed to separate cancellation expiry from the one-hour session expiry.
  assert.ok((await a.post('confirm', selection)).status >= 400);
});
test('a late model reply after rearming is discarded and does not become follow-up context', async t => {
  let release, started; const entered = new Promise(resolve => { started = resolve; }); const histories = [];
  const a = await app(t, { available: true, status: 'test-injected', chat: async request => {
    histories.push(request.history); if (histories.length === 1) { started(); await new Promise(resolve => { release = resolve; }); }
    return { reply: 'Injected comparison' };
  } });
  await a.arm(1000);
  const pending = a.post('chat', { pageContext: 'drops-overview', intent: 'opening' }); await entered;
  await a.arm(5000); release();
  const response = await pending; assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'DROPS_CHANGED');
  assert.equal((await a.post('chat', { pageContext: 'drops-overview', intent: 'opening' })).status, 200);
  assert.deepEqual(histories[1], []);
});
