import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createHostedQuotationDemoServer, validateCloudQuotationMode, deploymentQuotationSnapshot } from '../app/quotation-demo-server.mjs';

const origin = 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app';
const environment = () => ({ NODE_ENV: 'production', K_SERVICE: 'hotel-price-hunter', GOOGLE_CLOUD_PROJECT: 'sincere-apex-511418-p0', APP_SURFACE: 'customer', APP_ORIGIN: origin });
const bundle = () => ({ schemaVersion: 1, snapshotVersion: 'a'.repeat(64), transactionMode: 'selection-only',
  baseline: { sourceType: 'quotation', quotationCode: 'TEST-QUOTE', hotel: { id: 'h', name: 'Hotel' } },
  options: [{ optionId: 'option-1', roomName: 'Room', freeCancellation: true }],
  checkedAt: '2026-10-17T00:00:00Z', completeness: 'observed-options-only', customerRefund: null, reservationCreated: false,
  privateReferences: { 'option-1': { rateDetail: 'PRIVATE-token', sourceId: 'PRIVATE-source' } } });
const wire = (url, options = {}) => new Promise((resolve, reject) => {
  const req = request(url, options, res => { const chunks = []; res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(res.headers), json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')) })); });
  req.on('error', reject); req.end(options.body);
});

test('hosted quotation profile accepts only the exact private customer Cloud Run target', () => {
  assert.doesNotThrow(() => validateCloudQuotationMode(environment()));
  for (const patch of [{ K_SERVICE: 'another-service' }, { NODE_ENV: 'development' }, { APP_SURFACE: 'agency' },
    { GOOGLE_CLOUD_PROJECT: 'another-project' }, { APP_ORIGIN: 'https://evil.invalid' }, { CLOUD_RUN_JOB: 'job' },
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' }, { GEMINI_MODEL: 'model' }]) {
    assert.throws(() => validateCloudQuotationMode({ ...environment(), ...patch }));
  }
});
test('deployment snapshot excludes source selection tokens and rejects private data on cloud startup', () => {
  const snapshot = deploymentQuotationSnapshot(bundle());
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE-token|PRIVATE-source|privateReferences/);
  assert.throws(() => createHostedQuotationDemoServer({ snapshot: bundle(), environment: environment() }));
  assert.throws(() => createHostedQuotationDemoServer({ snapshot: { ...snapshot, access_token: 'PRIVATE' }, environment: environment() }));
});
test('hosted HTTP profile enforces the canonical host/origin and Secure cookie while keeping confirmation selection-only', async t => {
  const snapshot = deploymentQuotationSnapshot(bundle());
  const server = createHostedQuotationDemoServer({ snapshot, environment: environment() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const local = `http://127.0.0.1:${server.address().port}`; const host = new URL(origin).host;
  assert.equal((await fetch(local + '/api/quotation-demo')).status, 403);
  const response = await wire(local + '/api/quotation-demo', { headers: { Host: host } });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /; Secure/);
  const data = await response.json(); const cookie = response.headers.get('set-cookie').split(';')[0];
  const post = requestOrigin => wire(local + '/api/quotation-demo/confirm', { method: 'POST', headers: {
    Host: host, Origin: requestOrigin, Cookie: cookie, 'X-CSRF-Token': data.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ optionId: 'option-1', snapshotVersion: snapshot.snapshotVersion, acceptedDemoOnly: true }) });
  assert.equal((await post(local)).status, 403);
  const confirmed = await (await post(origin)).json();
  assert.equal(confirmed.confirmation.reservationCreated, false); assert.equal(confirmed.confirmation.quoteModified, false);
  const health = await (await wire(local + '/healthz', { headers: { Host: host } })).json();
  assert.equal(health.surface, 'quotation-demo'); assert.equal(health.mode, 'selection-only');
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE-token|PRIVATE-source/);
});
