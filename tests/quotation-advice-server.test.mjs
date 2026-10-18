import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotationDemoServer } from '../app/quotation-demo-server.mjs';
import { createQuotationAdvisor } from '../app/quotation-advisor.mjs';

const bundle = () => ({ schemaVersion: 1, transactionMode: 'selection-only', snapshotVersion: 'a'.repeat(64),
  baseline: { sourceType: 'quotation', quotationCode: 'PRIVATE-QUOTE', hotel: { name: 'Demo Hotel' },
    room: { name: 'King', board: 'Breakfast' }, quotedRetail: { totalMinor: 60000, currency: 'USD' } },
  options: [{ optionId: 'option-1', roomName: 'Twin', board: 'Room only', freeCancellation: false,
    estimate: { totalMinor: 48000, currency: 'USD', isEstimate: true } },
  { optionId: 'option-2', roomName: 'King', board: 'Breakfast', freeCancellation: true,
    estimate: { totalMinor: 50000, currency: 'USD', isEstimate: true } }],
  privateReferences: { 'option-1': { rateDetail: 'PRIVATE-TOKEN' }, 'option-2': { rateDetail: 'PRIVATE-TOKEN2' } } });
const selected = { recommendation: 'keep-quotation', priority: 'flexibility', reasonCodes: ['terms-unverified'] };
async function app(t, { generateContent = async () => ({ text: JSON.stringify(selected) }), clock = { value: new Date() }, enabled = true } = {}) {
  const advisor = enabled ? await createQuotationAdvisor({ generateContent }) : undefined;
  const server = createQuotationDemoServer({ bundle: bundle(), advisor, now: () => clock.value });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const bootstrap = async () => { const response = await fetch(origin + '/api/quotation-demo'); return { cookie: response.headers.get('set-cookie').split(';')[0], ...await response.json() }; };
  const session = await bootstrap();
  const post = (patch = {}, headers = {}, visitor = session) => fetch(origin + '/api/quotation-demo/advice', { method: 'POST',
    headers: { Origin: origin, Cookie: visitor.cookie, 'X-CSRF-Token': visitor.csrfToken, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ optionId: 'option-1', snapshotVersion: visitor.snapshotVersion, message: 'My dates may change', ...patch }) });
  return { origin, post, session, bootstrap, clock };
}
test('advice route calls Gemini with the server-owned option, retains follow-up context and cannot confirm', async t => {
  const requests = []; const a = await app(t, { generateContent: async request => { requests.push(JSON.parse(request.contents)); return { text: JSON.stringify(selected) }; } });
  assert.equal(a.session.model.status, 'test-injected');
  const first = await a.post(); assert.equal(first.status, 200); const result = await first.json();
  assert.equal(result.source, 'test-injected'); assert.equal(result.selectionChanged, false);
  assert.equal(result.optionId, 'option-1'); assert.equal(result.snapshotVersion, a.session.snapshotVersion);
  assert.equal((await a.post({ message: 'What about price?' })).status, 200);
  assert.equal(requests[1].previousExchanges.length, 1);
  assert.doesNotMatch(JSON.stringify(requests), /PRIVATE-|privateReferences|quotationCode/);
  const state = await (await fetch(a.origin + '/api/quotation-demo', { headers: { Cookie: a.session.cookie } })).json();
  assert.equal(state.confirmation, null);
  const other = await a.bootstrap(); await a.post({}, {}, other);
  assert.deepEqual(requests[2].previousExchanges, []);
  await a.post({ optionId: 'option-2' }); assert.deepEqual(requests[3].previousExchanges, []);
});
test('advice requires session, origin, CSRF, current snapshot and a bounded question, ignoring no forged facts', async t => {
  let calls = 0; const a = await app(t, { generateContent: async () => { calls++; return { text: JSON.stringify(selected) }; } });
  for (const [patch, headers] of [[{}, { Origin: 'https://evil.invalid' }], [{}, { Cookie: '' }], [{}, { 'X-CSRF-Token': 'bad' }],
    [{}, { 'Sec-Fetch-Site': 'cross-site' }], [{ message: 'x'.repeat(1201) }, {}], [{ message: '' }, {}], [{ snapshotVersion: 'stale' }, {}],
    [{ optionId: 'other' }, {}], [{ baseline: { quotedRetail: 1 } }, {}], [{ acceptedDemoOnly: true }, {}], [{ message: [] }, {}]]) {
    assert.ok((await a.post(patch, headers)).status >= 400);
  }
  assert.equal(calls, 0);
});
test('advice is unavailable without an explicitly configured provider', async t => {
  const a = await app(t, { enabled: false });
  assert.equal(a.session.model.available, false);
  const response = await a.post(); assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'ADVICE_UNAVAILABLE');
});
test('advice rate limits count attempts and reset after one minute', async t => {
  let calls = 0; const a = await app(t, { generateContent: async () => { calls++; throw Error('PRIVATE-TOKEN'); } });
  for (let i = 0; i < 4; i++) assert.equal((await a.post()).status, 503);
  const limited = await a.post(); assert.equal(limited.status, 429); assert.equal(calls, 4);
  a.clock.value = new Date(a.clock.value.getTime() + 60001);
  assert.equal((await a.post()).status, 503); assert.equal(calls, 5);
});
test('a new visitor cannot bypass the shared instance request limit', async t => {
  let calls = 0; const a = await app(t, { generateContent: async () => { calls++; return { text: JSON.stringify(selected) }; } });
  for (let visitor = 0; visitor < 5; visitor++) {
    const session = await a.bootstrap();
    for (let i = 0; i < 4; i++) assert.equal((await a.post({}, {}, session)).status, 200);
  }
  assert.equal((await a.post({}, {}, await a.bootstrap())).status, 429); assert.equal(calls, 20);
});
test('global concurrency is bounded and an expired session never receives advice', async t => {
  const releases = []; let started; const signal = () => new Promise(resolve => { started = resolve; });
  const a = await app(t, { generateContent: () => { started(); return new Promise(resolve => releases.push(() => resolve({ text: JSON.stringify(selected) }))); } });
  let ready = signal(); const first = a.post(); await ready;
  ready = signal(); const second = a.post(); await ready;
  assert.equal((await a.post()).status, 429);
  a.clock.value = new Date(a.clock.value.getTime() + 3600001);
  releases.forEach(release => release());
  assert.equal((await first).status, 401); assert.equal((await second).status, 401);
});
