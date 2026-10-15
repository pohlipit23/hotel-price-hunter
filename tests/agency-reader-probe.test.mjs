import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgencyReaderProbe, readerProbeMain } from '../scripts/check-agency-reader.mjs';

const project = 'sincere-apex-511418-p0';
const identity = `roomdrop-agency-reader@${project}.iam.gserviceaccount.com`;
const database = `projects/${project}/databases/(default)`;
const root = `https://firestore.googleapis.com/v1/${database}/documents`;
const nonce = 'a'.repeat(48);
const environment = { GOOGLE_CLOUD_PROJECT: project, NODE_ENV: 'production', CLOUD_RUN_JOB: 'roomdrop-agency-reader-check-offline' };
const denied = { error: { code: 403, status: 'PERMISSION_DENIED', message: 'private-google-error' } };
function fixture(options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    assert(init.signal instanceof AbortSignal); assert.equal(init.redirect, 'error');
    if (options.throwAt === calls.length) throw new Error('private-transport-token');
    if (url.endsWith('/default/email')) return new Response(options.identity || identity);
    if (url.endsWith('/default/token')) return Response.json(options.token || { access_token: 'offline-token-never-print', token_type: 'Bearer', expires_in: 300 });
    assert.equal(init.headers.Authorization, 'Bearer offline-token-never-print');
    if (url === root + ':runQuery') return Response.json(options.query || [{ readTime: '2026-10-15T00:00:00Z' }], { status: options.queryStatus || 200 });
    if (url === root + '/_roomdropIdentityChecks/' + nonce) return Response.json(options.readBody || { error: { code: 404, status: 'NOT_FOUND' } }, { status: options.readStatus || 404 });
    assert.equal(url, root + ':commit');
    const write = JSON.parse(init.body).writes[0];
    if (write.update) return Response.json(options.updateBody || denied, { status: options.updateStatus || 403 });
    assert(write.delete); return Response.json(options.deleteBody || denied, { status: options.deleteStatus || 403 });
  };
  return { calls, run: (extra = {}) => runAgencyReaderProbe({ environment, argv: ['--live-probe'], fetchImpl, nonce: () => nonce, ...extra }) };
}

test('read-only runtime behavior proof uses fixed targets, bounded query and safe preconditions', async () => {
  const mock = fixture(); const result = await mock.run();
  assert.equal(result.status, 'passed'); assert.equal(result.identityMatches, true);
  assert.equal(result.documentRead, 'allowed-absent-document'); assert.equal(result.indexQuery, 'allowed-empty');
  assert.equal(result.updateDenied, 'permission-denied'); assert.equal(result.deleteDenied, 'permission-denied');
  assert.equal(mock.calls.length, 6);
  assert.deepEqual(JSON.parse(mock.calls[2].init.body), { structuredQuery: { from: [{ collectionId: 'juryVisitorsAgencyCases' }], orderBy: [{ field: { fieldPath: 'caseId' }, direction: 'ASCENDING' }], limit: 1 } });
  const update = JSON.parse(mock.calls[4].init.body).writes[0];
  assert.equal(update.update.name, `${database}/documents/_roomdropIdentityChecks/${nonce}`);
  assert.deepEqual(update.currentDocument, { exists: true });
  const deletion = JSON.parse(mock.calls[5].init.body).writes[0];
  assert.equal(deletion.delete, update.update.name); assert.deepEqual(deletion.currentDocument, { updateTime: '1970-01-01T00:00:00Z' });
  for (const call of mock.calls.slice(0, 2)) { assert.equal(call.init.headers['Metadata-Flavor'], 'Google'); assert(!call.init.headers.Authorization); }
  assert(!JSON.stringify(result).includes(nonce)); assert(!/offline-token|private-google-error/.test(JSON.stringify(result)));
});

test('nonempty index succeeds without disclosing any records', async () => {
  const mock = fixture({ query: [{ document: { name: `${database}/documents/juryVisitorsAgencyCases/private-case`, fields: { private: { stringValue: 'private-record-value' } } } }] });
  const result = await mock.run(); assert.equal(result.status, 'passed'); assert.equal(result.indexQuery, 'allowed-nonempty');
  assert(!/private-record-value|private-case/.test(JSON.stringify(result)));
});

test('wrong identity cannot acquire token or reach Firestore', async () => {
  const mock = fixture({ identity: 'wrong@example.test' }); const result = await mock.run();
  assert.equal(result.status, 'failed'); assert.equal(result.identityMatches, false); assert.equal(mock.calls.length, 1);
});

test('live guard refuses local/emulator/other project/missing flag before any request', async () => {
  for (const extra of [{ argv: [] }, { argv: ['--live-probe', '--extra'] }, ...[
    {}, { ...environment, GOOGLE_CLOUD_PROJECT: 'other' }, { ...environment, CLOUD_RUN_JOB: 'wrong-job' },
    { ...environment, NODE_ENV: 'development' }, { ...environment, FIRESTORE_EMULATOR_HOST: 'localhost:8081' },
    { ...environment, K_SERVICE: 'service-is-not-job' }, { ...environment, GOOGLE_APPLICATION_CREDENTIALS: '/never-read.json' },
  ].map(value => ({ environment: value }))]) {
    const mock = fixture(); assert.equal((await mock.run(extra)).status, 'refused'); assert.equal(mock.calls.length, 0);
  }
});

test('existing or unconfirmed nonce target prevents every commit', async () => {
  for (const options of [{ readStatus: 200, readBody: { name: 'private-doc' } }, { readStatus: 403, readBody: denied }, { readStatus: 404, readBody: { error: { status: 'UNKNOWN' } } }]) {
    const mock = fixture(options); const result = await mock.run(); assert.equal(result.status, 'failed');
    assert.equal(mock.calls.filter(call => call.url.endsWith(':commit')).length, 0);
  }
});

test('only explicit Firestore 403 PERMISSION_DENIED proves update denial', async () => {
  for (const options of [
    { updateStatus: 200, updateBody: { writeResults: [] } },
    { updateStatus: 404, updateBody: { error: { code: 404, status: 'NOT_FOUND' } } },
    { updateStatus: 400, updateBody: { error: { code: 400, status: 'FAILED_PRECONDITION' } } },
    { updateStatus: 403, updateBody: { error: { code: 403, status: 'UNAUTHENTICATED' } } },
    { updateStatus: 403, updateBody: { error: { code: 400, status: 'PERMISSION_DENIED' } } },
  ]) {
    const mock = fixture(options); const result = await mock.run(); assert.equal(result.status, 'failed');
    assert.equal(result.updateDenied, 'unexpected-authority-or-response'); assert.equal(mock.calls.length, 5);
  }
});

test('delete authorization mismatch fails complete proof without unsafe fallback', async () => {
  const mock = fixture({ deleteStatus: 400, deleteBody: { error: { status: 'FAILED_PRECONDITION' } } });
  const result = await mock.run(); assert.equal(result.status, 'failed'); assert.equal(result.deleteDenied, 'unexpected-authority-or-response'); assert.equal(mock.calls.length, 6);
});

test('query/auth/network failures are bounded, sanitized and never retried', async () => {
  for (const options of [{ queryStatus: 403, query: denied }, { query: { document: {} } }, { token: { access_token: 'bad\nheader', token_type: 'Bearer' } }, { throwAt: 2 }, { throwAt: 5 }]) {
    const mock = fixture(options); const result = await mock.run(); assert.equal(result.status, 'failed');
    assert(mock.calls.length <= 5); assert(!/private|bad|offline-token/.test(JSON.stringify(result)));
  }
});

test('main outputs one safe summary and failure exit status; import itself makes no request', async () => {
  const output = []; const mock = fixture({ throwAt: 1 });
  const code = await readerProbeMain({ environment, argv: ['--live-probe'], fetchImpl: async () => { throw new Error('secret'); }, print: line => output.push(line) });
  assert.equal(code, 1); assert.equal(output.length, 1); assert.equal(JSON.parse(output[0]).status, 'failed'); assert(!output[0].includes('secret'));
  assert.equal(mock.calls.length, 0);
});
