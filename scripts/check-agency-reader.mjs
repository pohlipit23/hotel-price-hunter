/* Explicit one-shot Cloud Run job probe; importing this module performs no I/O.
   No ADC/files/environment tokens, retries, record output or unguarded writes.
   This checks selected runtime behavior, not inherited IAM policy completeness.
   Sources:
   https://cloud.google.com/run/docs/securing/service-identity
   https://cloud.google.com/run/docs/container-contract#metadata-server
   https://cloud.google.com/firestore/docs/reference/rest/v1/Precondition
   https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/commit
   https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/runQuery
   Direct: node scripts/check-agency-reader.mjs --live-probe
   For an image command override, embed this source in Node --input-type=module
   --eval and append: process.exitCode = await readerProbeMain({argv:['--live-probe']});
   The same production/project/job guards apply to either invocation. */
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PROJECT = 'sincere-apex-511418-p0';
const IDENTITY = `roomdrop-agency-reader@${PROJECT}.iam.gserviceaccount.com`;
const DATABASE = `projects/${PROJECT}/databases/(default)`;
const DOCUMENTS = `https://firestore.googleapis.com/v1/${DATABASE}/documents`;
const METADATA = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
const denial = (response, body) => response.status === 403 && body?.error?.code === 403 && body.error.status === 'PERMISSION_DENIED';

export async function runAgencyReaderProbe({ environment = process.env, argv = [], fetchImpl = fetch, nonce = () => randomBytes(24).toString('hex') } = {}) {
  const result = { status: 'failed', identityMatches: false, documentRead: 'not-run', indexQuery: 'not-run',
    updateDenied: 'not-run', deleteDenied: 'not-run', coverage: 'selected-runtime-behavior-not-policy-inventory' };
  if (argv.length !== 1 || argv[0] !== '--live-probe' || environment.GOOGLE_CLOUD_PROJECT !== PROJECT
      || environment.NODE_ENV !== 'production' || !/^roomdrop-agency-reader-check-[a-z0-9-]+$/.test(environment.CLOUD_RUN_JOB || '')
      || environment.K_SERVICE || environment.FIRESTORE_EMULATOR_HOST || environment.GOOGLE_APPLICATION_CREDENTIALS) {
    return { ...result, status: 'refused', stage: 'runtime-guard' };
  }
  let stage = 'identity', token;
  const overall = AbortSignal.timeout(20_000);
  const request = (url, options = {}) => fetchImpl(url, { method: 'GET', redirect: 'error',
    signal: AbortSignal.any([overall, AbortSignal.timeout(5_000)]), ...options });
  const firestore = (url, body) => request(url, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) } });
  try {
    const email = await request(METADATA + 'email', { headers: { 'Metadata-Flavor': 'Google' } });
    if (!email.ok || (await email.text()).trim() !== IDENTITY) return { ...result, stage };
    result.identityMatches = true;
    stage = 'runtime-token';
    const credential = await request(METADATA + 'token', { headers: { 'Metadata-Flavor': 'Google' } });
    if (!credential.ok) return { ...result, stage };
    const access = await credential.json();
    if (access.token_type !== 'Bearer' || !(access.expires_in > 0) || typeof access.access_token !== 'string'
        || !/^[A-Za-z0-9._~+/-]+=*$/.test(access.access_token)) return { ...result, stage };
    token = access.access_token;

    stage = 'agency-index-query';
    const query = await firestore(DOCUMENTS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'juryVisitorsAgencyCases' }],
      orderBy: [{ field: { fieldPath: 'caseId' }, direction: 'ASCENDING' }], limit: 1 } });
    if (!query.ok) return { ...result, stage };
    const rows = await query.json();
    if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || typeof row !== 'object' || row.error)
        || rows.filter(row => row.document).length > 1) return { ...result, stage };
    result.indexQuery = rows.some(row => row.document) ? 'allowed-nonempty' : 'allowed-empty';

    stage = 'absent-document-read';
    const suffix = nonce();
    if (typeof suffix !== 'string' || !/^[a-f0-9]{48}$/.test(suffix)) return { ...result, stage };
    const name = `${DATABASE}/documents/_roomdropIdentityChecks/${suffix}`;
    const read = await firestore(`${DOCUMENTS}/_roomdropIdentityChecks/${suffix}`);
    const absent = await read.json();
    if (read.status !== 404 || absent?.error?.code !== 404 || absent.error.status !== 'NOT_FOUND') return { ...result, stage };
    result.documentRead = 'allowed-absent-document';

    // This random target was confirmed absent. exists:true prevents creation even
    // if IAM unexpectedly grants update; that precondition failure is NOT a pass.
    stage = 'update-denial';
    const update = await firestore(DOCUMENTS + ':commit', { writes: [{ update: { name, fields: { probe: { booleanValue: true } } }, currentDocument: { exists: true } }] });
    if (!denial(update, await update.json())) return { ...result, updateDenied: 'unexpected-authority-or-response', stage };
    result.updateDenied = 'permission-denied';

    // Epoch updateTime cannot match a real Firestore document; this cannot delete
    // an existing document, even if a collision appeared after the absence check.
    stage = 'delete-denial';
    const deletion = await firestore(DOCUMENTS + ':commit', { writes: [{ delete: name, currentDocument: { updateTime: '1970-01-01T00:00:00Z' } }] });
    if (!denial(deletion, await deletion.json())) return { ...result, deleteDenied: 'unexpected-authority-or-response', stage };
    result.deleteDenied = 'permission-denied';
    return { ...result, status: 'passed', stage: 'complete' };
  } catch {
    // Never expose provider bodies, request headers, document references or errors.
    return { ...result, stage, failure: 'request-or-response-failed' };
  } finally { token = undefined; }
}

export async function readerProbeMain({ print = line => console.log(line), ...options } = {}) {
  const result = await runAgencyReaderProbe(options);
  print(JSON.stringify(result)); return result.status === 'passed' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await readerProbeMain({ argv: process.argv.slice(2) });
}
