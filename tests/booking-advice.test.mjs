import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createQuotationAdvisor } from '../app/quotation-advisor.mjs';

const bundle = { schemaVersion: 1, snapshotVersion: 'a'.repeat(64), transactionMode: 'selection-only',
  baseline: { sourceType: 'quotation', hotel: { name: 'Hotel' }, room: { name: 'Original', board: 'Breakfast' }, quotedRetail: { totalMinor: 50000, currency: 'AED' } },
  options: [{ optionId: 'option-1', roomName: 'Twin', board: 'Breakfast', freeCancellation: false,
    estimate: { totalMinor: 30000, currency: 'AED', isEstimate: true } }], privateReferences: { 'option-1': { rateDetail: 'PRIVATE' } } };
test('production booking entry forwards grounded Gemini advice and preserves confirmation authority', async t => {
  let calls = 0;
  const advisor = await createQuotationAdvisor({ generateContent: async () => { calls++; return { text: JSON.stringify({ recommendation: 'keep-quotation', priority: 'flexibility', reasonCodes: ['reduced-flexibility'] }) }; } });
  const server = createBookingDemoServer({ bundle, advisor });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(origin + '/api/booking-demo'); const cookie = initial.headers.get('set-cookie').split(';')[0]; const data = await initial.json();
  assert.equal(data.model.available, true);
  const body = JSON.stringify({ optionId: 'option-1', snapshotVersion: data.snapshotVersion, message: 'My plans might change' });
  const headers = { Origin: origin, Cookie: cookie, 'X-CSRF-Token': data.csrfToken, 'Content-Type': 'application/json' };
  assert.equal((await fetch(origin + '/api/booking-demo/advice', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'bad' }, body })).status, 403);
  assert.equal(calls, 0);
  const response = await fetch(origin + '/api/booking-demo/advice', { method: 'POST', headers, body }); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.advice.model, 'gemini-3.8-flash'); assert.equal(result.source, 'test-injected');
  assert.equal(result.advice.recommendation, 'keep-quotation'); assert.equal(result.selectionChanged, false);
  const restored = await (await fetch(origin + '/api/booking-demo', { headers: { Cookie: cookie } })).json(); assert.equal(restored.confirmation, null);
  for (const path of ['/stay-advice.js', '/stay-advice.css']) assert.equal((await fetch(origin + path)).status, 200);
  assert.equal((await fetch(origin + '/api/quotation-demo')).status, 404);
});
