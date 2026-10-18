import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { EventEmitter } from 'node:events';
import { startHostedDemo, createHostedStores } from '../app/booking-cloud.mjs';
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

test('hosted Gemini activation requires explicit opt-in plus complete model configuration', () => {
  const configured = { ...environment(), QUOTATION_ADVICE_ENABLED: 'true', GEMINI_MODEL: 'gemini-3.8-flash', GOOGLE_CLOUD_LOCATION: 'global' };
  assert.doesNotThrow(() => validateCloudQuotationMode(configured));
  for (const patch of [{ QUOTATION_ADVICE_ENABLED: 'false' }, { GEMINI_MODEL: '' }, { GEMINI_MODEL: 'gemini-3.1-flash-lite' }, { GOOGLE_CLOUD_LOCATION: '' }, { GOOGLE_CLOUD_LOCATION: 'asia-southeast1' }]) {
    assert.throws(() => validateCloudQuotationMode({ ...configured, ...patch }));
  }
  assert.throws(() => validateCloudQuotationMode({ ...environment(), GOOGLE_CLOUD_LOCATION: 'global' }));
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

test('curated startup loads only storage, passes contract-v1 stores and closes once on shutdown', async () => {
  let closed = 0, made = 0, modelCreated = 0, received;
  const signals = new EventEmitter(), server = new EventEmitter();
  server.close = callback => callback(); server.closeAllConnections = () => {};
  const stores = { bookingStorage: { marker: 'booking-storage' }, sessionStorage: { marker: 'sessions' }, close: async () => { closed++; } };
  const catalogue = { entries: [{ code: 'TEST0001', contentVersion: 'content-v1', dropSetVersion: 'drops-v1', bundle: {} }] };
  const app = await startHostedDemo({ environment: { ...environment(), PORT: '8294' }, signals,
    storesFactory: async () => { made++; return stores; }, catalogueLoader: async storage => { assert.equal(storage, stores.bookingStorage); return catalogue; },
    advisorFactory: async () => { modelCreated++; return { available: false }; },
    serverFactory: options => { received = options; return server; }, listen: async (value, port) => { assert.equal(value, server); assert.equal(port, 8294); }, log: () => {} });
  assert.equal(made, 1); assert.equal(modelCreated, 1); assert.equal(received.reviewedCatalogue, catalogue);
  assert.equal(received.catalogue, undefined); assert.equal(received.bookingStorage, stores.bookingStorage);
  assert.equal(received.sessionStorage, stores.sessionStorage); assert.equal(received.snapshot, undefined);
  await Promise.all([app.stop(), app.stop()]); assert.equal(closed, 1); assert.equal(signals.listenerCount('SIGTERM'), 0);
});
test('curated startup fails closed before model/listen when storage/catalogue is missing and preserves production guards', async () => {
  let closed = 0, models = 0, reads = 0;
  const stores = { bookingStorage: {}, sessionStorage: {}, close: async () => { closed++; } };
  const deps = { environment: environment(), signals: new EventEmitter(), storesFactory: async () => { reads++; return stores; },
    catalogueLoader: async () => { throw Error('PRIVATE-storage'); }, advisorFactory: async () => { models++; }, log: () => {} };
  await assert.rejects(startHostedDemo(deps), /PRIVATE-storage/); assert.equal(closed, 1); assert.equal(models, 0);
  await assert.rejects(startHostedDemo({ ...deps, environment: { ...environment(), FIRESTORE_EMULATOR_HOST: '127.0.0.1:8281' } }));
  assert.equal(reads, 1);
});
test('curated shutdown handles a storage-close failure with a bounded signal diagnostic', async () => {
  const signals = new EventEmitter(), server = new EventEmitter(), logs = [];
  server.close = callback => callback(); server.closeAllConnections = () => {};
  const app = await startHostedDemo({ environment: environment(), signals,
    storesFactory: async () => ({ bookingStorage: {}, sessionStorage: {}, close: async () => { throw Error('PRIVATE-storage'); } }),
    catalogueLoader: async () => ({ entries: [{}] }), serverFactory: () => server, listen: async () => {},
    advisorFactory: async () => ({ available: false }), log: message => logs.push(message) });
  signals.emit('SIGTERM'); await assert.rejects(app.stop(), /PRIVATE-storage/);
  assert.equal(signals.listenerCount('SIGTERM'), 0); assert.doesNotMatch(logs.join(' '), /PRIVATE/);
});

test('contract v2 hosted factories use the guarded client and constrain sessions to manifest codes', async () => {
  const calls = [], firestore = { terminate: async () => { calls.push('close'); } };
  const bookingStorage = {}, sessionStorage = {};
  const stores = await createHostedStores(environment(), {
    readManifest: async () => ({ schemaVersion: 1, entries: [{ code: 'AIRB000180', contentVersion: 'a'.repeat(64), dropSetVersion: 'd'.repeat(64) }] }),
    loadBookingModule: async () => ({ createRoomdropFirestore: async env => { assert.equal(env.GOOGLE_CLOUD_PROJECT, environment().GOOGLE_CLOUD_PROJECT); calls.push('client'); return firestore; },
      createBookingStorage: options => { assert.equal(options.firestore, firestore); return bookingStorage; } }),
    loadSessionModule: async () => ({ createFirestoreSessionStorage: options => { assert.equal(options.firestore, firestore);
      assert.deepEqual(options.catalogueCodes, ['AIRB000180']); return sessionStorage; } }),
  });
  assert.equal(stores.bookingStorage, bookingStorage); assert.equal(stores.sessionStorage, sessionStorage);
  await stores.close(); assert.deepEqual(calls, ['client', 'close']);
});
