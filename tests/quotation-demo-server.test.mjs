import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotationDemoServer, validateLocalQuotationMode } from '../app/quotation-demo-server.mjs';

const bundle = () => ({ schemaVersion: 1, transactionMode: 'selection-only', snapshotVersion: 'a'.repeat(64),
  baseline: { sourceType: 'quotation', quotationCode: 'TEST-QUOTE', hotel: { id: 'h', name: 'Hotel' } },
  options: [{ optionId: 'option-1', roomName: 'Room', freeCancellation: true, estimate: { totalMinor: 10000, currency: 'AED', isEstimate: true } },
    { optionId: 'option-2', roomName: 'Room 2', freeCancellation: false, estimate: { totalMinor: 9000, currency: 'AED', isEstimate: true } }],
  privateReferences: { 'option-1': { rateDetail: 'PRIVATE-token' }, 'option-2': { rateDetail: 'PRIVATE-token2' } } });
async function app(t) {
  const server = createQuotationDemoServer({ bundle: bundle() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + '/api/quotation-demo');
  return { origin, cookie: response.headers.get('set-cookie').split(';')[0], data: await response.json() };
}
test('quotation server refuses production, cloud and non-loopback activation', () => {
  for (const env of [{ NODE_ENV: 'production' }, { K_SERVICE: 'service' }, { CLOUD_RUN_JOB: 'job' }, { BIND_HOST: '0.0.0.0' }]) {
    assert.throws(() => validateLocalQuotationMode(env));
  }
  assert.doesNotThrow(() => validateLocalQuotationMode({}));
});
test('quotation GET strips private identities and local server denies transaction and arbitrary lookup routes', async t => {
  const a = await app(t);
  assert.doesNotMatch(JSON.stringify(a.data), /PRIVATE-token|privateReferences/);
  for (const path of ['/api/bootstrap', '/api/quotation-demo?code=OTHER', '/api/switches', '/api/prebook', '/api/book', '/.env']) {
    const response = await fetch(a.origin + path);
    assert.ok([400, 404].includes(response.status));
  }
});
test('demo confirmation requires session, origin, CSRF and current source binding; it creates only a demo-selection receipt', async t => {
  const a = await app(t);
  const body = { optionId: 'option-1', snapshotVersion: a.data.snapshotVersion, acceptedDemoOnly: true };
  const send = (patch = {}, headers = {}) => fetch(a.origin + '/api/quotation-demo/confirm', { method: 'POST',
    headers: { Origin: a.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrfToken, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ ...body, ...patch }) });
  for (const [patch, headers] of [[{}, { Origin: 'https://evil.invalid' }], [{}, { 'X-CSRF-Token': 'wrong' }],
    [{ acceptedDemoOnly: 'true' }, {}], [{ snapshotVersion: 'old' }, {}], [{ optionId: 'other' }, {}], [{ booking: true }, {}]]) {
    assert.ok((await send(patch, headers)).status >= 400);
  }
  const result = await (await send()).json();
  assert.equal(result.confirmation.status, 'demo-selection-confirmed');
  assert.equal(result.confirmation.reservationCreated, false); assert.equal(result.confirmation.quoteModified, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-token|privateReferences|bookingReference/);
  assert.deepEqual((await (await send()).json()).confirmation, result.confirmation);
  const refreshed = await (await fetch(a.origin + '/api/quotation-demo', { headers: { Cookie: a.cookie } })).json();
  assert.deepEqual(refreshed.confirmation, result.confirmation);
});
test('non-refundable selection needs a separate literal reduced-flexibility acknowledgement', async t => {
  const a = await app(t); const headers = { Origin: a.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrfToken, 'Content-Type': 'application/json' };
  const body = { optionId: 'option-2', snapshotVersion: a.data.snapshotVersion, acceptedDemoOnly: true };
  const send = data => fetch(a.origin + '/api/quotation-demo/confirm', { method: 'POST', headers, body: JSON.stringify(data) });
  assert.equal((await send(body)).status, 400);
  assert.equal((await send({ ...body, acceptReducedFlexibility: true })).status, 200);
});
